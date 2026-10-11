#!/usr/bin/env python3
"""Outil de développement (non nécessaire à l'usage) : dérive de work/build.py d'origine
  - template/index.template.html  (le HTML du site avec des repères @@nom@@)
  - template/parts.json           (icônes SVG fixes)
  - content.json                  (le contenu actuel du site, extrait tel quel)
sans rien modifier dans le projet d'origine."""
import re, os, sys, json, html
SRC = '/workspace/terrasse/whoopy_site/work/build.py'
WORK = os.path.dirname(SRC)
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
src = open(SRC, encoding='utf-8').read()
cut = src.index("os.makedirs(OUT,exist_ok=True)")
src = src[:cut]
src = src.replace("def pic(name,widths,sizes,alt,ratio,loading='lazy'):\n", "def pic(name,widths,sizes,alt,ratio,loading='lazy'):\n    PICCALLS.append((name,widths,sizes,alt,ratio))\n", 1)
# 1) exécution fidèle pour récupérer les données
sys.argv = ['x', 'http://127.0.0.1:8768']
os.chdir(WORK); sys.path.insert(0, WORK)
ns0 = {'__name__': 'x', '__file__': SRC, 'PICCALLS': []}
exec(compile(src, 'build_orig', 'exec'), ns0)
orig_html = ns0['head'] + '\n' + ns0['body']

D = {}   # clé -> valeur par défaut (texte "riche")
def unrich(h):
    h = h.replace('{TELD}', '{tel}')
    h = re.sub(r'<em>(.*?)</em>', r'*\1*', h)
    h = h.replace('<br>', '\n')
    return html.unescape(h)
s = src
def rep(key, old, new=None, kind='rich', count=1):
    global s
    n = s.count(old)
    assert n == count, (key, old[:60], n)
    if new is None: new = '@@%s@@' % key
    s = s.replace(old, new)
    if key and kind == 'rich': D[key] = unrich(old)
    return old

# --- variables de tête
rep(None, "URL=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8768').rstrip('/')", "URL='@@url@@'")
rep(None, "LAT,LON=34.8795084,-1.3257918", "LAT,LON='@@lat@@','@@lon@@'")
s = re.sub(r"^DIR=f'.*$", "DIR='@@dir@@'", s, flags=re.M)
s = re.sub(r"^GMAP='.*$", "GMAP='@@gmap@@'", s, flags=re.M)
s = re.sub(r"^IG='.*$", "IG='@@ig@@'", s, flags=re.M)
rep(None, "TEL='+213552103462'; TELD='0552 10 34 62'", "TEL='@@tel@@'; TELD='@@teld@@'")
s = re.sub(r"^TITLE='.*$", "TITLE='@@title@@'", s, flags=re.M)
s = re.sub(r"^DESC='.*$", "DESC='@@desc@@'", s, flags=re.M)
s = re.sub(r"^ld_s=json.dumps.*$", "ld_s='@@jsonld@@'", s, flags=re.M)
D['og_title'] = "Whoopy Burger — Le bonheur entre deux pains · Tlemcen"
rep('og_title', 'Whoopy Burger — Le bonheur entre deux pains · Tlemcen', count=2)
rep('og_desc', 'Burgers, frites croustillantes, 5/5 sur Google. Bel Horizon, Tlemcen. Menu, horaires, itinéraire et téléphone.')
rep('tw_desc', 'Burgers, frites croustillantes, 5/5 sur Google. Bel Horizon, Tlemcen.')
# --- données structurées
s = re.sub(r"^mq=''.join.*$", "mq='@@marquee@@'", s, flags=re.M)
rep('badge_text', 'Burgers · Frites · Bel Horizon · Tlemcen · ')
s = re.sub(r"^rv_html=f'.*$", "rv_html='@@reviews@@'", s, flags=re.M)
s = re.sub(r"^hours_html=.*$", "hours_html='@@hours_li@@'", s, flags=re.M)
s = re.sub(r"^mg=.*$", "mg='@@menu_burgers@@'", s, flags=re.M)
s = re.sub(r"^sg=.*$", "sg='@@menu_supp@@'", s, flags=re.M)
PICMAP = {'a1': 'about_1', 'a2': 'about_2', 'f_box': 'gal_3', 'f_poulet': 'menu_2', 'f_brioche': 'menu_3', 'f_plateau': 'menu_1',
          'g_fresque': 'gal_1', 'g_salle': 'gal_2', 'g_salle2': 'gal_4', 'band': 'band'}
for v, slot in PICMAP.items():
    s, n = re.subn(r"^%s=pic\(.*$" % v, "%s='@@photo_%s@@'" % (v, slot), s, flags=re.M); assert n == 1, v
# --- légendes
CAPS = [('menu_1', '<span class="cap">Burger &amp; frites</span>'), ('menu_2', '<span class="cap">Poulet pané</span>'), ('menu_3', '<span class="cap">Pain brioché</span>'),
        ('gal_1', '<figcaption>La fresque de la salle</figcaption>'), ('gal_2', '<figcaption>Rouge &amp; blanc</figcaption>'),
        ('gal_3', '<figcaption>Au poulet pané</figcaption>'), ('gal_4', '<figcaption>Vue de la vitrine</figcaption>'), ('gal_5', '<figcaption>Brioché &amp; fondant</figcaption>')]
for slot, old in CAPS:
    D['cap_' + slot] = unrich(re.sub(r'<[^>]+>', '', old))
    rep(None, old, '@@cap_%s@@' % slot)
rep(None, '<figure data-par=".03">{a2}<figcaption>', '<figure data-par=".03">@@photo_gal_5@@<figcaption>') if False else None
# la 3e photo de la galerie réutilise a2 : on la rend indépendante
rep(None, '<figure data-par=".03">{a2}@@cap_gal_5@@</figure>', '<figure data-par=".03">@@photo_gal_5@@@@cap_gal_5@@</figure>')
# --- textes
rep('hero_kicker', 'Burgers &amp; frites — Bel Horizon, Tlemcen')
rep('hero_lead', 'Le bonheur entre deux pains : <em>frais, gourmand, irrésistible.</em>')
rep('hero_bubble', 'Un croc et<br>tu comprends !')
rep('rating_value', '<b>5,0</b>', '<b>@@rating_value@@</b>', kind=None, count=2); D['rating_value'] = '5,0'
rep('rating_count', '35&nbsp;avis Google', '@@rating_count@@&nbsp;avis Google', kind=None, count=2); D['rating_count'] = 35
rep('about_title', 'Des burgers <em>généreux</em>, des frites croustillantes')
rep('about_big', 'Whoopy Burger, c’est l’adresse burgers du quartier Bel Horizon, à Tlemcen : du veau, du poulet pané, du poisson ou du thon entre deux pains, avec des ingrédients frais et des sauces qui font la différence.')
rep('about_text', 'Dans la petite salle aux rayures rouges et blanches, une fresque de personnages de dessin animé attablés devant des burgers veille sur les tables. On vient entre amis ou en famille, on commande, on croque.')
D['about_quote']=unrich('Burgers savoureux, frites croustillantes et produits de qualité au cœur de Tlemcen.')
rep(None, '<q>Burgers savoureux, frites croustillantes et produits de qualité au cœur de Tlemcen.</q>', '<q>@@about_quote@@</q>')
rep('about_cite', 'Présentation de Whoopy Burger sur Google Maps')
rep(None, '<span>Frais</span><span>Gourmand</span><span>Irrésistible</span>', '@@facts@@')
rep('services_title', 'Ce que vous <em>trouverez</em>')
rep('services_lead', 'Informations tirées de la fiche Google Maps et du compte Instagram @whoopy13.')
m = re.search(r'<ol class="srv">(.*?)</ol>', s, re.S); srv_old = m.group(1)
s = s.replace(srv_old, '@@services@@')
svc = []
for mm in re.finditer(r'<li data-r[^>]*><span class="n">\d+</span>\{ic_(\w+)\}<h3>(.*?)</h3><p>(.*?)</p>(?:<blockquote class="quote-ig">(.*?)<cite>(.*?)</cite></blockquote>)?</li>', srv_old, re.S):
    svc.append({'icon': mm.group(1), 'title': unrich(mm.group(2)), 'text': unrich(mm.group(3)), 'quote': unrich(mm.group(4) or ''), 'quote_cite': unrich(mm.group(5) or '')})
assert len(svc) == 4
rep('band_title', 'Le plaisir se sert <em>sur un plateau</em>')
D['band_sub']='Bel Horizon · Tlemcen'
rep(None, '<p data-r>Bel Horizon · Tlemcen</p>', '<p data-r>@@band_sub@@</p>')
rep('menu_title', 'Burgers &amp; <em>suppléments</em>')
rep('menu_lead', 'Les recettes et les prix de la carte publiée par le restaurant sur sa fiche Google Maps (photo de juin 2026).')
rep(None, '<small>12 recettes</small>', '<small>@@n_burgers@@</small>')
rep(None, '<small>6 extras</small>', '<small>@@n_supp@@</small>')
m = re.search(r'<p class="menu-incl" data-r><b>(.*?)</b> (.*?)</p>', s); D['menu_incl_title'] = unrich(m.group(1)); D['menu_incl_text'] = unrich(m.group(2))
s = s.replace(m.group(0), '@@menu_incl@@')
rep('menu_note', 'Prix en dinars algériens (DA), relevés sur la photo de la carte publiée sur Google Maps : ils peuvent évoluer. Les boissons et desserts ne figurent pas sur cette carte : renseignez-vous auprès de l’équipe.')
rep('gallery_title', 'La salle, la fresque, <em>les burgers</em>')
rep('reviews_title', 'Ce que disent <em>les clients</em>')
rep('reviews_note', 'Extraits d’avis publiés sur Google Maps, reproduits tels quels (le signe […] marque une coupe).')
rep('hours_title', 'Quand <em>venir</em>')
rep('hours_note', 'Horaires indiqués sur la fiche Google Maps (heure d’Algérie).')
rep('address', 'Bel Horizon<br>Tlemcen 13000, Algérie', '@@address_br@@', count=2)
s = s.replace('<ul class="hours">', '<ul class="hours" data-tz="@@timezone@@">')
rep('footer_tagline', 'Le bonheur entre deux pains. Frais · Gourmand · Irrésistible.')
rep(None, '@whoopy13 sur Instagram', '@@ig_handle@@ sur Instagram')
rep(None, '>@whoopy13</a>, Instagram)', '>@@ig_handle@@</a>, Instagram)')
# 2) exécution du gabarit
ns = {'__name__': 'x', '__file__': SRC, 'PICCALLS': []}
exec(compile(s, 'build_tpl', 'exec'), ns)
tpl = ns['head'] + '\n' + ns['body']
assert re.findall(r'@@(\w+)@@', tpl)
open(os.path.join(ROOT, 'template/index.template.html'), 'w', encoding='utf-8').write(tpl)
parts = {'star': ns0['star'], 'bsep': ns0['bsep'], 'icons': {k: ns0['ic_' + k] for k in ('burger', 'fries', 'seat', 'moto')}}
json.dump(parts, open(os.path.join(ROOT, 'template/parts.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(os.path.join(ROOT, 'tools/original_index.html'), 'w', encoding='utf-8').write(orig_html)

# --- content.json par défaut
n0 = ns0
SL = {  # slot -> (étiquette, où, ratio upload, sizes)
}
pc = {slot: n0['PICCALLS'][i] for i, slot in enumerate(['about_1', 'about_2', 'gal_3', 'menu_2', 'menu_3', 'menu_1', 'gal_1', 'gal_2', 'gal_4', 'band'])}
pc['gal_5'] = pc['about_2']
content_seed = {
 'D': D, 'services': svc, 'picalls': {k: [v[0], v[1], v[2], v[3], v[4]] for k, v in pc.items()},
 'RV': n0['RV'], 'JOURS': n0['JOURS'], 'BURGERS': n0['BURGERS'], 'SUPP': n0['SUPP'], 'mq_items': n0['mq_items'],
 'LAT': n0['LAT'], 'LON': n0['LON'], 'PLACE': n0['PLACE'], 'GMAP': n0['GMAP'], 'IG': n0['IG'], 'TEL': n0['TEL'], 'TELD': n0['TELD'],
 'URL': n0['URL'], 'TITLE': n0['TITLE'], 'DESC': n0['DESC'], 'ld': n0['ld'],
}
json.dump(content_seed, open(os.path.join(HERE, 'seed.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('OK template', len(tpl), 'markers', sorted(set(re.findall(r'@@(\w+)@@', tpl))))
