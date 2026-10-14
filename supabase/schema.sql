-- =====================================================================
--  Whoopy Burger — CMS + CRM sur Supabase
--  À coller EN UNE FOIS dans Supabase → SQL Editor → New query → Run.
--  Peut être relancé sans danger (idempotent) : il ne supprime aucune
--  donnée (commandes, clients, contenu déjà enregistré sont conservés).
--
--  Contenu :
--   0. Le « patron » (table owners + inscription automatique du 1er compte)
--   1. Contenu du site : site_content (1 ligne jsonb) + historique (40 versions)
--   2. CRM : customers, orders (+ contrôles anti-abus) + vue orders_daily
--   3. Droits (GRANT) et RLS
--   4. Bucket Storage « images » + policies
--   5. Contenu initial (copie de content.json) — seulement si la table est vide
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. LE PATRON
-- ---------------------------------------------------------------------
-- Seuls les comptes listés ici ont le droit de modifier le site et de voir
-- les commandes. Le PREMIER compte créé dans Authentication → Users y est
-- ajouté automatiquement (voir le trigger plus bas).
create table if not exists public.owners (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.owners o where o.user_id = auth.uid());
$$;

-- Premier utilisateur créé = patron (les suivants ne le deviennent PAS).
create or replace function public.handle_first_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.owners) then
    insert into public.owners (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_whoopy_first_owner on auth.users;
create trigger trg_whoopy_first_owner
  after insert on auth.users
  for each row execute function public.handle_first_owner();

-- Si le compte du patron existait AVANT ce script : on l'enregistre aussi
-- (uniquement s'il n'y a qu'un seul compte, pour ne pas se tromper).
insert into public.owners (user_id)
select u.id from auth.users u
where not exists (select 1 from public.owners)
  and (select count(*) from auth.users) = 1
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 1. CONTENU DU SITE (repris du guide GUIDE_SUPABASE_WHOOPY.md)
-- ---------------------------------------------------------------------
create table if not exists public.site_content (
  id          integer     primary key default 1 check (id = 1),
  data        jsonb       not null
                check (jsonb_typeof(data) = 'object')
                check (octet_length(data::text) <= 1048576),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table if not exists public.site_content_history (
  id        bigint      generated always as identity primary key,
  saved_at  timestamptz not null default now(),
  saved_by  uuid,
  data      jsonb       not null
);

create or replace function public.site_content_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data is distinct from old.data then
    insert into public.site_content_history (saved_by, data) values (old.updated_by, old.data);
    delete from public.site_content_history
     where id not in (select id from public.site_content_history order by id desc limit 40);
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.id := old.id;
  return new;
end;
$$;

drop trigger if exists trg_site_content_before_update on public.site_content;
create trigger trg_site_content_before_update
  before update on public.site_content
  for each row execute function public.site_content_before_update();

-- ---------------------------------------------------------------------
-- 2. CRM : CLIENTS ET COMMANDES
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (char_length(btrim(name)) between 2 and 80),
  phone       text        not null check (phone ~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$'),
  notes       text        check (notes is null or char_length(notes) <= 2000),
  created_at  timestamptz not null default now()
);
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_created_idx on public.customers (created_at);

create table if not exists public.orders (
  id           bigint      generated always as identity primary key,
  customer_id  uuid        not null references public.customers (id) on delete restrict,
  items        jsonb       not null
                 check (jsonb_typeof(items) = 'array')
                 check (jsonb_array_length(items) between 1 and 30)
                 check (octet_length(items::text) <= 8000),
  total        integer     not null default 0 check (total between 0 and 1000000),  -- en DA
  status       text        not null default 'nouvelle'
                 check (status in ('nouvelle', 'en préparation', 'prête', 'livrée', 'annulée')),
  fulfillment  text        not null default 'emporter'
                 check (fulfillment in ('emporter', 'livraison')),
  address      text        check (address is null or char_length(address) <= 300),
  notes        text        check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint orders_address_if_delivery
    check (fulfillment <> 'livraison' or char_length(btrim(coalesce(address, ''))) >= 5)
);
create index if not exists orders_created_idx  on public.orders (created_at desc);
create index if not exists orders_customer_idx on public.orders (customer_id);
create index if not exists orders_status_idx   on public.orders (status);

-- 2a. Nouveau client venant du site : on nettoie et on limite les abus.
create or replace function public.customers_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name  := btrim(new.name);
  new.phone := btrim(new.phone);
  if not public.is_owner() then
    new.notes      := null;          -- les notes sont réservées au patron
    new.created_at := now();
    if (select count(*) from public.customers where created_at > now() - interval '1 minute') >= 30 then
      raise exception 'Trop de demandes en ce moment, réessayez dans une minute.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customers_before_insert on public.customers;
create trigger trg_customers_before_insert
  before insert on public.customers
  for each row execute function public.customers_before_insert();

-- 2b. Nouvelle commande venant du site :
--   - statut forcé à « nouvelle », date forcée à maintenant ;
--   - les PRIX et le TOTAL sont recalculés à partir de la carte enregistrée
--     (impossible d'envoyer un faux prix) ; un article inconnu est refusé ;
--   - quantité 1 à 20 par ligne ;
--   - limite : 3 commandes / 10 min par numéro, 30 commandes / minute au total ;
--   - même numéro de téléphone = même fiche client (fusion automatique).
create or replace function public.orders_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone   text;
  v_keep    uuid;
  v_menu    jsonb;
  v_item    jsonb;
  v_name    text;
  v_qty     integer;
  v_price   integer;
  v_clean   jsonb := '[]'::jsonb;
  v_total   integer := 0;
begin
  if public.is_owner() then
    new.updated_at := now();
    return new;                      -- le patron peut saisir une commande à la main
  end if;

  new.status     := 'nouvelle';
  new.created_at := now();
  new.updated_at := now();
  new.address    := nullif(btrim(coalesce(new.address, '')), '');
  new.notes      := nullif(btrim(coalesce(new.notes, '')), '');
  if new.fulfillment = 'emporter' then new.address := null; end if;

  select c.phone into v_phone from public.customers c where c.id = new.customer_id;
  if v_phone is null then
    raise exception 'Client introuvable.' using errcode = 'P0001';
  end if;

  -- limites anti-abus
  if (select count(*) from public.orders where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Trop de commandes en ce moment, réessayez dans une minute.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders o join public.customers c on c.id = o.customer_id
       where regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g') and o.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Vous avez déjà envoyé plusieurs commandes : merci de patienter quelques minutes ou d''appeler le restaurant.' using errcode = 'P0001';
  end if;

  -- fusion : on rattache la commande à la plus ancienne fiche ayant ce numéro
  select c.id into v_keep from public.customers c
   where regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(v_phone, '[^0-9]', '', 'g') order by c.created_at, c.id limit 1;
  if v_keep is not null and v_keep <> new.customer_id then
    delete from public.customers c
     where c.id = new.customer_id
       and not exists (select 1 from public.orders o where o.customer_id = c.id);
    new.customer_id := v_keep;
  end if;

  -- recalcul des prix depuis la carte publiée
  select coalesce(s.data -> 'menu' -> 'burgers', '[]'::jsonb) || coalesce(s.data -> 'menu' -> 'supplements', '[]'::jsonb)
    into v_menu from public.site_content s where s.id = 1;
  if v_menu is null then
    raise exception 'La carte n''est pas encore en ligne.' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(new.items) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Article invalide.' using errcode = 'P0001';
    end if;
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    begin
      v_qty := (v_item ->> 'qty')::integer;
    exception when others then
      raise exception 'Quantité invalide.' using errcode = 'P0001';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Quantité invalide pour « % » (1 à 20).', v_name using errcode = 'P0001';
    end if;
    select (m ->> 'price')::integer into v_price
      from jsonb_array_elements(v_menu) m
     where m ->> 'name' = v_name
     limit 1;
    if v_price is null then
      raise exception 'Article inconnu : « % ». Rechargez la page.', v_name using errcode = 'P0001';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('name', v_name, 'qty', v_qty, 'price', v_price));
    v_total := v_total + v_qty * v_price;
  end loop;

  new.items := v_clean;
  new.total := v_total;
  return new;
end;
$$;

drop trigger if exists trg_orders_before_insert on public.orders;
create trigger trg_orders_before_insert
  before insert on public.orders
  for each row execute function public.orders_before_insert();

create or replace function public.orders_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_orders_before_update on public.orders;
create trigger trg_orders_before_update
  before update on public.orders
  for each row execute function public.orders_before_update();

-- 2c. Statistiques par jour (heure d'Algérie). security_invoker : la vue
--     respecte le RLS → seul le patron voit des chiffres.
create or replace view public.orders_daily
with (security_invoker = true) as
select
  (o.created_at at time zone 'Africa/Algiers')::date                     as day,
  count(*)                                                               as orders_count,
  count(*) filter (where o.status <> 'annulée')                          as orders_valid,
  coalesce(sum(o.total) filter (where o.status <> 'annulée'), 0)::bigint as revenue_da
from public.orders o
group by 1;

-- ---------------------------------------------------------------------
-- 3. DROITS + RLS
-- ---------------------------------------------------------------------
revoke all on public.owners, public.site_content, public.site_content_history,
              public.customers, public.orders, public.orders_daily
  from anon, authenticated;

revoke execute on function public.site_content_before_update(), public.handle_first_owner(),
                           public.customers_before_insert(), public.orders_before_insert(),
                           public.orders_before_update()
  from public, anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;

-- visiteurs (anon) : lire le contenu, ENVOYER une commande — rien d'autre
grant select on public.site_content to anon;
grant insert (id, name, phone) on public.customers to anon;
grant insert (customer_id, items, fulfillment, address, notes) on public.orders to anon;

-- patron (authenticated + présent dans owners) : tout
grant select                         on public.owners               to authenticated;
grant select, insert, update         on public.site_content         to authenticated;
grant select                         on public.site_content_history to authenticated;
grant select, insert, update, delete on public.customers            to authenticated;
grant select, insert, update, delete on public.orders               to authenticated;
grant select                         on public.orders_daily         to authenticated;

alter table public.owners               enable row level security;
alter table public.site_content         enable row level security;
alter table public.site_content_history enable row level security;
alter table public.customers            enable row level security;
alter table public.orders               enable row level security;

-- on repart de zéro pour les policies de ces tables
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('owners','site_content','site_content_history','customers','orders')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy "owners : le patron se voit" on public.owners
  for select to authenticated using (user_id = auth.uid());

create policy "contenu : lecture publique" on public.site_content
  for select to anon, authenticated using (true);
create policy "contenu : ajout patron" on public.site_content
  for insert to authenticated with check (id = 1 and public.is_owner());
create policy "contenu : modification patron" on public.site_content
  for update to authenticated using (id = 1 and public.is_owner()) with check (id = 1 and public.is_owner());

create policy "historique : lecture patron" on public.site_content_history
  for select to authenticated using (public.is_owner());

create policy "clients : envoi depuis le site" on public.customers
  for insert to anon with check (notes is null);
create policy "clients : patron" on public.customers
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "commandes : envoi depuis le site" on public.orders
  for insert to anon with check (status = 'nouvelle');
create policy "commandes : patron" on public.orders
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Temps réel : le tableau de bord est prévenu de chaque nouvelle commande
-- (le RLS s'applique : seul le patron reçoit les événements).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. STORAGE : bucket public « images » (6 Mo, JPG/PNG/WebP)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 6291456, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "images : ajout patron"         on storage.objects;
drop policy if exists "images : lecture liste patron" on storage.objects;
drop policy if exists "images : remplacement patron"  on storage.objects;
drop policy if exists "images : suppression patron"   on storage.objects;

-- (lecture publique : assurée par le bucket « public », pas besoin de policy)
create policy "images : ajout patron" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images' and public.is_owner() and name ~ '^up-[a-z0-9_]+-[a-z0-9]+-[0-9]+\.(webp|jpg|png)$');
create policy "images : lecture liste patron" on storage.objects
  for select to authenticated using (bucket_id = 'images' and public.is_owner());
create policy "images : remplacement patron" on storage.objects
  for update to authenticated using (bucket_id = 'images' and public.is_owner()) with check (bucket_id = 'images' and public.is_owner());
create policy "images : suppression patron" on storage.objects
  for delete to authenticated using (bucket_id = 'images' and public.is_owner());

-- ---------------------------------------------------------------------
-- 5. CONTENU INITIAL (copie exacte de content.json) — ignoré si déjà présent
-- ---------------------------------------------------------------------
insert into public.site_content (id, data)
values (1, $whoopy${"version":1,"site":{"url":"http://127.0.0.1:8768","title":"Whoopy Burger — Burgers & frites à Tlemcen (Bel Horizon)","description":"Whoopy Burger à Tlemcen (Bel Horizon) : burgers de veau, de poulet pané, de poisson, frites croustillantes. 5/5 sur Google. Ouvert jusqu’à minuit. Appelez le {tel}.","og_title":"Whoopy Burger — Le bonheur entre deux pains · Tlemcen","og_description":"Burgers, frites croustillantes, 5/5 sur Google. Bel Horizon, Tlemcen. Menu, horaires, itinéraire et téléphone.","twitter_description":"Burgers, frites croustillantes, 5/5 sur Google. Bel Horizon, Tlemcen.","schema_description":"Burgers savoureux, frites croustillantes et produits de qualité au cœur de Tlemcen. Le bonheur entre deux pains : frais, gourmand, irrésistible.","timezone":"Africa/Algiers"},"contact":{"phone_intl":"+213552103462","phone_display":"0552 10 34 62","address":"Bel Horizon\nTlemcen 13000, Algérie","street":"Bel Horizon","city":"Tlemcen","postal_code":"13000","country":"DZ","instagram_url":"https://www.instagram.com/whoopy13/","instagram_handle":"@whoopy13","maps_url":"https://www.google.com/maps/place/Whoopy+Burger/data=!4m2!3m1!1s0xd78c9006b9e6ab7:0x92dc5a51ca684292","place_id":"ChIJt2qeawDJeA0RkkJoylFa3JI","lat":34.8795084,"lon":-1.3257918},"rating":{"value":"5,0","count":35},"hero":{"kicker":"Burgers & frites — Bel Horizon, Tlemcen","lead":"Le bonheur entre deux pains : *frais, gourmand, irrésistible.*","bubble":"Un croc et\ntu comprends !","badge_text":"Burgers · Frites · Bel Horizon · Tlemcen · ","marquee":["Le bonheur entre deux pains","Frais","Gourmand","Irrésistible","Bel Horizon · Tlemcen"]},"about":{"title":"Des burgers *généreux*, des frites croustillantes","big":"Whoopy Burger, c’est l’adresse burgers du quartier Bel Horizon, à Tlemcen : du veau, du poulet pané, du poisson ou du thon entre deux pains, avec des ingrédients frais et des sauces qui font la différence.","text":"Dans la petite salle aux rayures rouges et blanches, une fresque de personnages de dessin animé attablés devant des burgers veille sur les tables. On vient entre amis ou en famille, on commande, on croque.","quote":"Burgers savoureux, frites croustillantes et produits de qualité au cœur de Tlemcen.","quote_cite":"Présentation de Whoopy Burger sur Google Maps","facts":["Frais","Gourmand","Irrésistible"]},"services":{"title":"Ce que vous *trouverez*","lead":"Informations tirées de la fiche Google Maps et du compte Instagram @whoopy13.","items":[{"icon":"burger","title":"Burgers maison","text":"{Nb_burgers_lettres} recettes : veau, poulet pané, poisson, thon… Du simple « Classic » au « Monster Burger » à double viande.","quote":"","quote_cite":""},{"icon":"fries","title":"Frites croustillantes","text":"« Des frites croustillantes à chaque bouchée » : une barquette de frites s’ajoute à votre burger.","quote":"","quote_cite":""},{"icon":"seat","title":"Sur place","text":"Une salle colorée, tables blanches et tabourets rouges. Un client en parle ainsi : « La salle n’est pas trop grande et très bien tenue ».","quote":"","quote_cite":""},{"icon":"moto","title":"Commande & livraison","text":"Commandez par téléphone au {tel}.","quote":"« 🛵 Livraison disponible »","quote_cite":"Publication Instagram @whoopy13, 10 septembre 2026"}]},"band":{"title":"Le plaisir se sert *sur un plateau*","sub":"Bel Horizon · Tlemcen"},"menu":{"title":"Burgers & *suppléments*","lead":"Les recettes et les prix de la carte publiée par le restaurant sur sa fiche Google Maps (photo de juin 2026).","burgers":[{"name":"Ocean","desc":"Thon, gouda.","price":250,"tag":"Thon","color":"bleu","hot":false},{"name":"White","desc":"Viande hachée de poulet, œuf.","price":300,"tag":"Poulet","color":"jaune","hot":false},{"name":"Chicken Classic","desc":"Poulet pané.","price":350,"tag":"Poulet","color":"jaune","hot":false},{"name":"Classic","desc":"Viande hachée de veau.","price":450,"tag":"Veau","color":"rose","hot":false},{"name":"Egg","desc":"Viande hachée de veau, œuf.","price":500,"tag":"Veau","color":"rose","hot":false},{"name":"Chicken Spicy","desc":"Poulet pané épicé, gouda.","price":500,"tag":"Poulet","color":"jaune","hot":true},{"name":"Fish","desc":"Poisson, sauce tartare.","price":600,"tag":"Poisson","color":"bleu","hot":false},{"name":"Forest","desc":"Viande hachée de veau, champignons frais, gouda.","price":600,"tag":"Veau","color":"rose","hot":false},{"name":"Chicken Cheese","desc":"Poulet pané, mozzarella panée, gouda, oignons caramélisés.","price":600,"tag":"Poulet","color":"jaune","hot":false},{"name":"Holland Cheese","desc":"Viande hachée de veau, camembert, gouda, oignons caramélisés, miel.","price":650,"tag":"Veau","color":"rose","hot":false},{"name":"Blue Cheese","desc":"Viande hachée de veau, gouda, sauce roquefort.","price":700,"tag":"Veau","color":"rose","hot":false},{"name":"Monster Burger","desc":"Double viande hachée de veau, double fromage slice, œuf, sauce Monster.","price":750,"tag":"Veau","color":"rose","hot":true}],"supplements":[{"name":"Œuf","price":50,"desc":"À ajouter à votre burger."},{"name":"Camembert","price":100,"desc":"À ajouter à votre burger."},{"name":"Nugget","price":100,"desc":"À ajouter à votre burger."},{"name":"Mozzarella panée","price":150,"desc":"À ajouter à votre burger."},{"name":"Barquette de frites","price":150,"desc":"À ajouter à votre burger."},{"name":"Steak haché","price":200,"desc":"À ajouter à votre burger."}],"included_title":"Tous les burgers contiennent aussi :","included_text":"tomate, oignons, cornichons, fromage…","note":"Prix en dinars algériens (DA), relevés sur la photo de la carte publiée sur Google Maps : ils peuvent évoluer. Les boissons et desserts ne figurent pas sur cette carte : renseignez-vous auprès de l’équipe."},"gallery":{"title":"La salle, la fresque, *les burgers*"},"reviews":{"title":"Ce que disent *les clients*","note":"Extraits d’avis publiés sur Google Maps, reproduits tels quels (le signe […] marque une coupe).","items":[{"author":"mohe69","stars":5,"source":"Google","text":"Superbe adresse de burgers à Tlemcen ! Excellente expérience chez Whoopy Burger. Le choix de burgers est très varié (viande de veau, poulet, etc.) […] Service : Équipe professionnelle et accueillante. Une adresse vivement recommandée pour manger un bon burger au propre !"},{"author":"hanane benhenni","stars":5,"source":"Google","text":"Très bonne adresse si vous êtes à Tlemcen. Service au top et les burger sont excellents ! Je vous le recommande fortement"},{"author":"Amine Boussalah","stars":5,"source":"Google","text":"Excellent burger avec un bon pain brioché ! Ne changez rien ! Petite remarque sur les tenders poulet qui sont bon mais que je trouve trop épais."}]},"hours":{"title":"Quand *venir*","note":"Horaires indiqués sur la fiche Google Maps (heure d’Algérie).","days":[{"day":"Lundi","ranges":[["11:30","00:00"]]},{"day":"Mardi","ranges":[["11:30","00:00"]]},{"day":"Mercredi","ranges":[["11:30","00:00"]]},{"day":"Jeudi","ranges":[["11:30","00:00"]]},{"day":"Vendredi","ranges":[["18:00","00:00"]]},{"day":"Samedi","ranges":[["11:30","00:00"]]},{"day":"Dimanche","ranges":[["11:30","00:00"]]}]},"footer":{"tagline":"Le bonheur entre deux pains. Frais · Gourmand · Irrésistible."},"photos":{"about_1":{"label":"La maison — grande photo en arche","base":"salle2","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"L’intérieur de Whoopy Burger : salle lumineuse aux rayures rouges et blanches, tables blanches et chaises rouges","caption":"","sizes":"(max-width:820px) 70vw, 34vw","upload_ratio":[3,4],"original":{"base":"salle2","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"L’intérieur de Whoopy Burger : salle lumineuse aux rayures rouges et blanches, tables blanches et chaises rouges","caption":""}},"about_2":{"label":"La maison — petite photo en bas","base":"box","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Un burger brioché garni de poulet pané croustillant, de fromage fondu et de sauce, dans sa boîte en carton","caption":"","sizes":"(max-width:820px) 52vw, 28vw","upload_ratio":[3,4],"original":{"base":"box","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Un burger brioché garni de poulet pané croustillant, de fromage fondu et de sauce, dans sa boîte en carton","caption":""}},"gal_3":{"label":"Ambiance — rangée du bas, 1re photo","base":"box2","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Un burger au poulet pané, sauce blanche et salade dans une boîte ouverte","caption":"Au poulet pané","sizes":"(max-width:820px) 46vw, 30vw","upload_ratio":[3,4],"original":{"base":"box2","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Un burger au poulet pané, sauce blanche et salade dans une boîte ouverte","caption":"Au poulet pané"}},"menu_2":{"label":"La carte — photo « Poulet pané »","base":"poulet","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Burger brioché aux morceaux de poulet pané et à la salade, posé sur un papier imprimé","caption":"Poulet pané","sizes":"(max-width:820px) 46vw, 30vw","upload_ratio":[3,4],"original":{"base":"poulet","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Burger brioché aux morceaux de poulet pané et à la salade, posé sur un papier imprimé","caption":"Poulet pané"}},"menu_3":{"label":"La carte — photo « Pain brioché »","base":"brioche","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Burger au pain brioché doré dans une boîte en carton ouverte","caption":"Pain brioché","sizes":"(max-width:820px) 46vw, 30vw","upload_ratio":[3,4],"original":{"base":"brioche","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Burger au pain brioché doré dans une boîte en carton ouverte","caption":"Pain brioché"}},"menu_1":{"label":"La carte — grande photo « Burger & frites »","base":"plateau","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":608,"alt":"Un plateau Whoopy : burger au pain brioché, frites croustillantes et deux sauces","caption":"Burger & frites","sizes":"(max-width:820px) 92vw, 52vw","upload_ratio":[4,3],"original":{"base":"plateau","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":608,"alt":"Un plateau Whoopy : burger au pain brioché, frites croustillantes et deux sauces","caption":"Burger & frites"}},"gal_1":{"label":"Ambiance — grande photo (fresque)","base":"fresque","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"La fresque murale de la salle : des personnages de dessin animé attablés devant des burgers, sous le logo Whoopy Burger","caption":"La fresque de la salle","sizes":"(max-width:820px) 92vw, 58vw","upload_ratio":[3,2],"original":{"base":"fresque","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"La fresque murale de la salle : des personnages de dessin animé attablés devant des burgers, sous le logo Whoopy Burger","caption":"La fresque de la salle"}},"gal_2":{"label":"Ambiance — photo verticale (rouge & blanc)","base":"salle","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"La salle de Whoopy Burger : plafond sombre, rayures rouges et blanches, tables blanches et chaises rouges","caption":"Rouge & blanc","sizes":"(max-width:820px) 92vw, 36vw","upload_ratio":[3,4],"original":{"base":"salle","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"La salle de Whoopy Burger : plafond sombre, rayures rouges et blanches, tables blanches et chaises rouges","caption":"Rouge & blanc"}},"gal_4":{"label":"Ambiance — rangée du bas, 2e photo","base":"salle2","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Vue de la salle depuis la vitrine : tables, chaises rouges et fresque au fond","caption":"Vue de la vitrine","sizes":"(max-width:820px) 46vw, 30vw","upload_ratio":[3,4],"original":{"base":"salle2","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Vue de la salle depuis la vitrine : tables, chaises rouges et fresque au fond","caption":"Vue de la vitrine"}},"band":{"label":"Bandeau pleine largeur « Le plaisir se sert sur un plateau »","base":"band","ext":"webp","widths":[1080],"avif":true,"w":1080,"h":430,"alt":"","caption":"","sizes":"100vw","upload_ratio":[5,2],"original":{"base":"band","ext":"webp","widths":[1080],"avif":true,"w":1080,"h":430,"alt":"","caption":""}},"gal_5":{"label":"Ambiance — rangée du bas, 3e photo","base":"box","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Un burger brioché garni de poulet pané croustillant, de fromage fondu et de sauce, dans sa boîte en carton","caption":"Brioché & fondant","sizes":"(max-width:820px) 52vw, 28vw","upload_ratio":[3,4],"original":{"base":"box","ext":"webp","widths":[480,800,1080],"avif":true,"w":1080,"h":1440,"alt":"Un burger brioché garni de poulet pané croustillant, de fromage fondu et de sauce, dans sa boîte en carton","caption":"Brioché & fondant"}}}}$whoopy$::jsonb)
on conflict (id) do nothing;

-- Terminé. Résultat attendu : « Success. No rows returned ».
