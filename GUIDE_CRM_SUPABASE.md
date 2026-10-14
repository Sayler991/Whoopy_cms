# Guide : mettre en ligne le tableau de bord et les commandes de Whoopy Burger (Supabase + Netlify)

Ce guide est écrit pour quelqu'un qui n'est **pas informaticien**. Suivez les étapes dans l'ordre, sans en sauter. Comptez environ 45 minutes la première fois.

**Ce que vous obtenez à la fin :**

- votre site, comme aujourd'hui, avec en plus une section **« Commandez en ligne »** ;
- un **tableau de bord** à l'adresse `https://VOTRE-SITE.netlify.app/admin/` où vous pouvez :
  - voir les **commandes** et changer leur statut (*nouvelle → en préparation → prête → livrée*, ou *annulée*) ;
  - voir vos **clients** et leur ajouter des notes ;
  - voir les **statistiques** (commandes et chiffre d'affaires par jour) ;
  - modifier **la carte, les prix, les horaires, les textes, les avis et les photos**.
- Quand vous cliquez sur **Enregistrer**, le site affiche la nouvelle version **tout de suite** (pas besoin de republier).

**Ce qu'il vous faut :** un ordinateur Linux avec Internet, votre compte **GitHub** (dépôt `Sayler991/Whoopy_cms`), votre compte **Netlify**, une adresse e-mail.

**Le contenu du dossier `whoopy_crm_supabase` :**

| Élément | À quoi il sert |
|---|---|
| `supabase/schema.sql` | Tout ce qu'il faut créer dans Supabase, en **un seul copier-coller** |
| `site/` | Le site public (avec le formulaire de commande) |
| `site/config.js` | **Le seul fichier à modifier** : l'adresse et la clé publique Supabase |
| `admin/` | Le tableau de bord (publié automatiquement sur `/admin/`) |
| `netlify.toml` | Les réglages Netlify (rien à faire sur le site de Netlify) |

---

## Étape 1 — Créer le projet Supabase

1. Allez sur **https://supabase.com** → **Start your project** → connectez-vous (le plus simple : **Continue with GitHub**).
2. Cliquez sur **New project**.
3. Remplissez :
   - **Name** : `whoopy-burger`
   - **Database Password** : cliquez sur **Generate a password**, puis **notez-le dans un endroit sûr** (vous n'en aurez normalement pas besoin, mais gardez-le).
   - **Region** : choisissez une région en Europe (par exemple *West EU (Paris)* ou *Central EU (Frankfurt)*), c'est le plus proche de l'Algérie.
   - Offre : **Free**.
4. Cliquez sur **Create new project** et attendez 1 à 2 minutes que le projet soit prêt.

---

## Étape 2 — Créer les tables (un seul copier-coller)

1. Sur votre ordinateur, ouvrez le fichier `supabase/schema.sql` avec l'éditeur de texte (clic droit → *Ouvrir avec* → *Éditeur de texte*).
2. Sélectionnez **tout** le texte (`Ctrl+A`) et copiez-le (`Ctrl+C`).
3. Dans Supabase, menu de gauche : **SQL Editor** → **New query**.
4. Collez (`Ctrl+V`), puis cliquez sur **Run** (en bas à droite) ou appuyez sur `Ctrl+Entrée`.
5. Résultat attendu en bas : **« Success. No rows returned »**.
   - Si Supabase affiche une fenêtre d'avertissement (« *this query has destructive operations* »), c'est normal (le script supprime puis recrée ses propres règles de sécurité) : cliquez sur **Run this query**.

Vérification rapide :
- menu **Table Editor** : vous voyez les tables `customers`, `orders`, `owners`, `site_content`, `site_content_history` ;
- menu **Storage** : vous voyez un dossier (« bucket ») **images** marqué *Public*.

> Le script peut être relancé sans danger : il ne supprime ni les commandes, ni les clients, ni le contenu déjà enregistré.

---

## Étape 3 — Fermer les inscriptions publiques

Personne ne doit pouvoir se créer un compte sur votre tableau de bord.

1. Menu de gauche : **Authentication** → **Sign In / Providers** (selon la version : *Authentication → Providers* ou *Settings*).
2. Désactivez **Allow new users to sign up** (l'interrupteur doit être gris), puis **Save**.
3. Dans la même page, section **Email** : laissez le fournisseur *Email* **activé** (c'est lui qui permet de se connecter avec e-mail + mot de passe).

---

## Étape 4 — Créer le compte du patron

1. Menu **Authentication** → **Users** → bouton **Add user** → **Create new user**.
2. Entrez **votre e-mail** et **un mot de passe solide** (au moins 8 caractères).
3. **Cochez « Auto Confirm User »** (sinon le compte attend une confirmation par e-mail).
4. Cliquez sur **Create user**.

Le **premier compte créé devient automatiquement le patron** (c'est prévu dans `schema.sql`). Vérification : **Table Editor → owners** doit contenir **1 ligne**.

> **Si la table `owners` est vide** (par exemple parce que vous aviez créé le compte *avant* l'étape 2 et qu'il y a plusieurs comptes) : **SQL Editor → New query**, collez la ligne ci-dessous en remplaçant l'e-mail par le vôtre, puis **Run** :
>
> ```sql
> insert into public.owners (user_id) select id from auth.users where email = 'votre@email.com';
> ```

---

## Étape 5 — Copier l'adresse et la clé publique dans `site/config.js`

1. Dans Supabase : **Project Settings** (roue dentée en bas à gauche) → **API** (ou **Data API** / **API Keys** selon la version).
2. Repérez deux valeurs :
   - **Project URL** : ressemble à `https://abcdefghijklmno.supabase.co`
   - la clé **anon public** (onglet *Legacy API keys* si Supabase affiche plusieurs onglets) : une longue suite de caractères qui commence par `eyJ…`
   - ⚠️ **Ne copiez jamais la clé `service_role`** (elle est secrète).
3. Ouvrez `site/config.js` avec l'éditeur de texte. Collez les valeurs **entre les apostrophes** :

   ```js
   window.WHOOPY_CONFIG = {
     SUPABASE_URL: 'https://abcdefghijklmno.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....'
   };
   ```

4. Enregistrez (`Ctrl+S`).

> Cette clé est **faite pour être publique** : les visiteurs ne peuvent que lire la carte et **envoyer** une commande. Ils ne peuvent ni lire les commandes, ni voir les clients, ni modifier le site. Tout cela est garanti par les règles de sécurité de `schema.sql`.

---

## Étape 6 — (Conseillé) Mettre la bonne adresse du site dans la page

La page d'accueil contient encore une adresse de test (`http://127.0.0.1:8768`) dans ses informations pour Google. Remplacez-la par votre vraie adresse Netlify. Dans un terminal (`Ctrl+Alt+T`), placez-vous dans le dossier `whoopy_crm_supabase` puis tapez (remplacez l'adresse par la vôtre, **sans** `/` à la fin) :

```bash
sed -i 's#http://127.0.0.1:8768#https://VOTRE-SITE.netlify.app#g' site/index.html site/content.json supabase/schema.sql
```

Faites cette étape **avant** l'étape 2 si possible. Si `schema.sql` a déjà été exécuté, ce n'est pas grave : l'adresse de test reste seulement dans le contenu enregistré dans Supabase, qui ne l'affiche pas aux visiteurs.

---

## Étape 7 — Envoyer les fichiers sur GitHub

Ouvrez un **terminal** (`Ctrl+Alt+T`) et tapez les commandes **une par une** (appuyez sur Entrée après chacune).

**7.1 — Installer git (une seule fois)**

```bash
sudo apt update && sudo apt install -y git
git config --global user.name "Votre Nom"
git config --global user.email "votre@email.com"
```

**7.2 — Récupérer votre dépôt**

```bash
cd ~
git clone https://github.com/Sayler991/Whoopy_cms.git
cd Whoopy_cms
git checkout main
```

(Si le dossier `~/Whoopy_cms` existe déjà : `cd ~/Whoopy_cms && git checkout main && git pull`.)

**7.3 — Copier les nouveaux fichiers dans le dépôt**

Remplacez `~/Téléchargements/whoopy_crm_supabase` par l'endroit où vous avez décompressé le dossier :

```bash
cp -r ~/Téléchargements/whoopy_crm_supabase/site ~/Téléchargements/whoopy_crm_supabase/admin ~/Téléchargements/whoopy_crm_supabase/supabase .
cp ~/Téléchargements/whoopy_crm_supabase/netlify.toml ~/Téléchargements/whoopy_crm_supabase/GUIDE_CRM_SUPABASE.md .
git status
```

`git status` affiche la liste des fichiers modifiés ou nouveaux (en rouge) : c'est normal. Vérifiez que `site/config.js` y figure et contient bien vos valeurs : `cat site/config.js`.

> ⚠️ Cette copie **remplace** `site/index.html` du dépôt par la nouvelle version (avec le formulaire de commande). Si quelqu'un avait modifié `site/index.html` directement sur GitHub depuis, ces modifications seraient écrasées.

**7.4 — Enregistrer et envoyer**

```bash
git add -A
git commit -m "Tableau de bord Supabase : contenu en direct, commandes et clients"
git push origin main
```

Si GitHub demande un **mot de passe** : ce n'est pas votre mot de passe GitHub qui marche, mais un **jeton** (« token »). Pour le créer : sur github.com → votre photo en haut à droite → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)** → cochez **repo** → **Generate token** → copiez-le et collez-le à la place du mot de passe (`Ctrl+Maj+V` dans le terminal ; rien ne s'affiche, c'est normal).

---

## Étape 8 — Vérifier sur Netlify

1. Allez sur **https://app.netlify.com** → votre site → onglet **Deploys**.
2. Un nouveau déploiement apparaît quelques secondes après le `git push`. Attendez qu'il soit **Published** (vert).
   - Le fichier `netlify.toml` règle tout : dossier publié `site`, et copie du tableau de bord dans `/admin`. **Rien à changer dans l'interface Netlify.**
   - S'il y a des variables d'environnement ou une ancienne commande de build (par ex. `python3 supabase/fetch_content.py …` de l'ancien guide) dans **Site configuration → Build & deploy**, la commande de `netlify.toml` est prioritaire ; vous pouvez supprimer l'ancienne pour éviter toute confusion.
3. Ouvrez **votre site** : descendez jusqu'à **« Commandez en ligne »** — la liste des burgers s'affiche avec les prix et le bouton est actif.
4. Ouvrez **`https://VOTRE-SITE.netlify.app/admin/`** → entrez l'e-mail et le mot de passe de l'étape 4 → vous arrivez sur **Commandes**.

### Test complet (5 minutes)

1. Sur le site (sur votre téléphone par exemple), passez une **commande d'essai** avec votre nom et votre numéro → message « *Merci … ! Votre commande a bien été transmise au restaurant.* »
2. Dans le tableau de bord → **Commandes** : la commande apparaît (au plus tard 30 secondes après, ou cliquez **↻ Actualiser**). Passez-la en **annulée** pour qu'elle ne compte pas dans les statistiques.
3. **Clients** : votre nom apparaît avec votre numéro.
4. **La carte** : changez un prix → **💾 Enregistrer** → rechargez le site : le nouveau prix est affiché. Remettez l'ancien prix et enregistrez.
5. **Statistiques** : la journée du jour apparaît.

---

## Utilisation au quotidien

- **Commandes** : la liste « En cours » montre les commandes *nouvelles*, *en préparation* et *prêtes*. Changez le statut avec la liste déroulante : c'est enregistré immédiatement. Une notification « 🔔 Nouvelle commande reçue ! » s'affiche quand une commande arrive pendant que la page est ouverte (vérification toutes les 30 secondes ; la page doit rester ouverte, il n'y a pas de sonnerie ni de SMS).
- **Clients** : un même numéro de téléphone = une seule fiche, même si le client commande plusieurs fois. Les **notes** ne sont visibles que par vous.
- **Carte, Horaires, Textes, Avis, Photos, Contact** : modifiez, puis **💾 Enregistrer** (ou `Ctrl+S`). Le site affiche la nouvelle version au prochain chargement de la page.
- **Réglages** : changer votre mot de passe, revenir à une ancienne version du contenu (les 40 dernières sont gardées).

## Sécurité : ce qui est protégé

- Les visiteurs peuvent **seulement** : lire la carte/horaires/photos, et **envoyer** une commande. Ils **ne peuvent pas lire** les commandes ni les clients.
- Les **prix et le total** d'une commande sont **recalculés par Supabase** à partir de votre carte enregistrée : un petit malin ne peut pas envoyer un faux prix. Un article qui n'est pas sur la carte est refusé.
- Limites anti-abus : 1 à 20 exemplaires par article, 30 articles maximum, **3 commandes maximum en 10 minutes par numéro**, 30 commandes par minute au total, adresse obligatoire en livraison, champ piège invisible contre les robots.
- Seul le compte présent dans la table `owners` peut modifier le site, voir les commandes et envoyer des photos.

## Si quelque chose ne marche pas

| Ce que vous voyez | Solution |
|---|---|
| Le site affiche « *Commande en ligne non configurée* » | `site/config.js` est vide ou mal rempli (étape 5), ou le `git push` n'a pas été fait (étape 7). |
| `/admin/` affiche « *Tableau de bord non configuré* » | Même cause. |
| `/admin/` affiche une page « Page not found » | Le déploiement Netlify n'a pas utilisé `netlify.toml` : vérifiez qu'il est bien à la **racine** du dépôt (à côté du dossier `site`), puis **Deploys → Trigger deploy → Deploy site**. |
| « *E-mail ou mot de passe incorrect* » | Vérifiez l'e-mail. Mot de passe oublié : Supabase → **Authentication → Users** → les « … » de votre compte → **Send password recovery**, ou supprimez/recréez l'utilisateur (puis refaites la ligne `insert into public.owners …` de l'étape 4). |
| « *Adresse e-mail non confirmée* » | Supabase → **Authentication → Users** → votre compte → **Confirm email** (ou recréez-le en cochant *Auto Confirm User*). |
| « *Ce compte n'est pas enregistré comme patron* » | La table `owners` est vide : faites l'encadré de l'étape 4. |
| Une commande est refusée avec « *Article inconnu* » | La carte a changé pendant que le client remplissait le formulaire : il doit recharger la page. |
| Les nouveaux prix n'apparaissent pas | Rechargez la page du site (`Ctrl+Maj+R`). Si Supabase est injoignable, le site affiche automatiquement la version intégrée à la page (celle du dernier `git push`). |

## Limites à connaître

- **Offre gratuite Supabase** : le projet est **mis en pause après 7 jours sans aucune activité**. Le site reste en ligne et affiche la carte intégrée, mais le formulaire de commande et le tableau de bord ne marchent plus tant que vous ne cliquez pas sur **Restore project** dans Supabase. Une seule commande ou connexion par semaine suffit à éviter la pause.
- Les **photos** envoyées par le tableau de bord sont stockées dans Supabase (1 Go gratuit). Les anciennes ne sont pas effacées automatiquement : de temps en temps, **Storage → images**, supprimez les fichiers `up-…` qui ne servent plus.
- Le **référencement Google** utilise la version intégrée à la page (celle du dépôt GitHub). Les changements faits dans le tableau de bord sont visibles par les visiteurs immédiatement, mais Google peut continuer à voir l'ancienne version tant que vous ne refaites pas un envoi sur GitHub.
- Le petit indicateur « ouvert / fermé maintenant » du site se base sur les horaires intégrés à la page : après un changement d'horaires, la liste des horaires est à jour tout de suite, mais l'indicateur ne l'est qu'après le prochain envoi sur GitHub.
- Il n'y a **pas de paiement en ligne** ni d'envoi de SMS/e-mail de confirmation au client.
- Le formulaire ne vérifie pas les horaires d'ouverture : une commande peut arriver quand le restaurant est fermé.
