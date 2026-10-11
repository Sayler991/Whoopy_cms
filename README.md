# Whoopy Burger — site + tableau de bord (CMS local)

Le site statique Whoopy Burger (inchangé visuellement) avec un **tableau de bord `/admin/`** : le patron modifie lui-même
la carte, les prix, les horaires, le téléphone, l'adresse, les textes, les avis et les photos — sans toucher au code,
sans hébergement en ligne. Tout fonctionne avec **Python 3.8+ seul** (aucune installation, aucun module à ajouter).

## 1. Lancer (30 secondes)

```bash
cd whoopy_cms
python3 server.py          # Windows : py server.py   (ou python server.py)
```

| | |
|---|---|
| **Site** | <http://127.0.0.1:8780/> |
| **Tableau de bord** | <http://127.0.0.1:8780/admin/> |
| **Mot de passe par défaut** | `Whoopy2026!`  ← **à changer dès la première connexion** (onglet *Réglages*) |

Autres options : `python3 server.py --port 9000` · `python3 server.py --set-password` (change le mot de passe en ligne de commande) ·
`python3 server.py --reset-password` (remet `Whoopy2026!` si vous avez oublié le vôtre) · `python3 server.py --host 0.0.0.0`
(accès depuis un téléphone sur le même Wi-Fi : `http://<IP-du-PC>:8780/admin/` — attention, connexion **non chiffrée**, Wi-Fi de confiance uniquement).
Arrêt : `Ctrl+C`.

## 2. Utiliser le tableau de bord

1. Ouvrez `/admin/`, saisissez le mot de passe.
2. Choisissez une section (menu à gauche sur ordinateur, barre du bas sur téléphone) :
   - **La carte** : nom, description, prix, étiquette (Veau, Poulet…), flamme 🔥 de chaque burger ; boutons ▲ ▼ pour réordonner, ✕ pour supprimer, « ＋ Ajouter un burger / un supplément ». Les compteurs « 13 recettes » se mettent à jour tout seuls.
   - **Horaires** : 7 jours, ouvert/fermé, 1 ou 2 plages (pause de midi), fermeture après minuit possible (« 01 h 00 »). Le bandeau « Ouvert maintenant / Fermé · ouvre à… » du site suit ces horaires.
   - **Contact** : téléphone (le numéro du bouton « Appeler » se calcule seul), adresse, Instagram, lien Google Maps, textes pour Google.
   - **Textes** : titres et paragraphes de chaque section, services (ajout/suppression), bandeau défilant, pied de page.
   - **Avis** : note Google affichée, avis clients (ajout/suppression/ordre ; le 1ᵉʳ s'affiche en grand).
   - **Photos** : « 📷 Remplacer » → choisir un fichier → cadrer (glisser + zoom) → valider. La photo est **réduite et compressée dans le navigateur** (3 tailles WebP) puis envoyée au serveur. Pensez à remplir la *description* de la photo (accessibilité + Google).
   - **Aperçu** : le site avec vos modifications **non encore enregistrées** (version ordinateur ou téléphone).
   - **Réglages** : mot de passe, sauvegardes (restaurer une ancienne version), export.
3. Cliquez sur **« 💾 Enregistrer »** (ou `Ctrl+S`) : `content.json` et les images sont écrits sur le disque et `site/index.html` est régénéré. Rechargez le site : c'est à jour.
   Tant que vous n'avez pas enregistré, rien n'est modifié.

Astuces de saisie dans les textes : `*mot*` met le mot en jaune (comme les titres du site) · `{tel}` est remplacé par le téléphone affiché ·
`{nb_burgers_lettres}` / `{nb_burgers}` donnent le nombre de burgers (« douze » / « 12 »).
Une copie de l'ancien contenu est conservée à chaque enregistrement (40 dernières, dans `data/backups/`).

## 3. Contenu du dossier

```
whoopy_cms/
├─ server.py            serveur local (stdlib) : sert le site, /admin/, l'API protégée
├─ render.py            content.json  →  site/index.html  (aussi utilisable seul : python3 render.py)
├─ content.json         TOUT le contenu éditable (source de vérité)
├─ site/                le site statique à publier (index.html est GÉNÉRÉ — ne pas l'éditer à la main)
│  └─ assets/img/       photos (les photos téléversées s'appellent up-<emplacement>-<id>-<largeur>.webp)
├─ admin/               le tableau de bord (HTML/CSS/JS, sans dépendance)
├─ template/            gabarit du site (index.template.html), icônes, contenu par défaut
├─ data/                (créé au 1ᵉʳ lancement) auth.json = mot de passe haché, backups/  — jamais servi, jamais publié
├─ extras/netlify/      netlify.toml + Decap CMS pour la mise en ligne (voir §5)
├─ docs/captures/       captures d'écran des tests
└─ tools/               outils de développement (tests, génération du gabarit depuis le site d'origine)
```
Le site d'origine (`whoopy_site/`) n'a pas été modifié : ceci en est une copie. À l'état initial, `site/index.html` régénéré est **identique octet pour octet**
au HTML d'origine (et les captures plein écran ordinateur + mobile sont identiques au pixel près).
Seule différence technique : `assets/js/app.min.js` lit désormais les horaires dans la page (au lieu de les avoir codés en dur).

## 4. Sans serveur / sur un autre poste (mode export)

Le tableau de bord peut aussi produire un **export** (bouton « ⬇ Exporter », ou *Réglages*) : un `.zip` avec `content.json` + les nouvelles photos.
Pour l'appliquer : copier `content.json` à la racine du projet, copier `site/assets/img/*` dans `site/assets/img/`, puis `python3 render.py`.
(Aperçu et enregistrement direct demandent `server.py`.)

## 5. Mise en ligne plus tard (Netlify + Decap CMS, ou autre)

Le site reste **100 % statique** : en ligne, on publie simplement le dossier `site/`. Deux façons de continuer à le modifier :

**A. Le plus simple — rester en local.** On modifie avec `python3 server.py`, puis on envoie le dossier `site/` chez l'hébergeur
(Netlify Drop, Cloudflare Pages, GitHub Pages, FTP…). Dans *Contact → Autres textes de partage*, mettez l'**adresse publique du site**
(`https://…`) avant de publier (balises Google/partage, sitemap). Le tableau de bord, `data/` et `content.json` ne font jamais partie de `site/`.

**B. Édition en ligne avec Decap CMS (ex-Netlify CMS) — modèle fourni, non testé en conditions réelles.**
1. Créez un dépôt Git (GitHub/GitLab) avec tout le contenu de ce dossier (le `.gitignore` exclut `data/`).
2. Netlify → *Add new site → Import from Git* ; il lira `extras/netlify/netlify.toml` : copie la même chose dans `netlify.toml` à la racine du dépôt
   (`cp extras/netlify/netlify.toml .`). La commande de build exécute `python3 render.py` : le HTML est régénéré depuis `content.json` à chaque changement.
3. Netlify → *Site configuration → Identity* : activer, puis *Registration : Invite only* ; *Services → Git Gateway* : activer ; inviter le patron par e-mail.
4. Dans `extras/netlify/decap/config.yml`, remplacer `VOTRE-SITE.netlify.app` et vérifier `branch`.
5. Le patron ouvre `https://votre-site/admin/` (Decap), se connecte, modifie, « Publier » → Netlify reconstruit tout seul.
   Les champs Decap correspondent à ceux du tableau de bord local ; pour les photos, Decap envoie le fichier tel quel (champ `src`, dossier
   `site/assets/img/uploads/`) : envoyer des images déjà légères (≈ 200 Ko, WebP/JPEG). Le redimensionnement automatique est une fonction du tableau de bord local.
   `config.yml` est généré par `tools/make_decap_config.py` si le modèle de `content.json` évolue.

Autres CMS « Git » (TinaCMS, Sveltia CMS, CloudCannon, Pages CMS) fonctionnent aussi sur le même `content.json` + `render.py`.

## 6. Sécurité (ce qui est en place)

- Connexion par mot de passe, stocké **haché** (PBKDF2-SHA256, 200 000 itérations, sel aléatoire) dans `data/auth.json` (droits 600) ; ralentissement puis blocage temporaire après 5 échecs.
- Session par cookie `HttpOnly` + `SameSite=Strict` (8 h) ; toute l'API (`/admin/api/…`) et l'aperçu exigent la session ; en-tête anti-CSRF + contrôle d'origine sur les requêtes qui modifient.
- Serveur lié à `127.0.0.1` par défaut ; contrôle de l'en-tête `Host` (anti « DNS rebinding ») ; en-têtes `X-Content-Type-Options`, CSP stricte sur `/admin/`.
- Aucun accès hors de `site/` (chemins `..`, fichiers cachés, `content.json`, `data/` → 404). Les téléversements ne peuvent écrire que dans `site/assets/img/` sous un nom généré par le serveur.
- Images : extensions JPG/PNG/WebP seulement, **signature du fichier vérifiée** (pas de SVG/HTML déguisé), 6 Mo max par envoi (le navigateur réduit à ~100–300 Ko), 400 fichiers téléversés max.
- Contenu : validé et plafonné côté serveur (longueurs, nombres, URLs `http(s)` uniquement, heures) ; tout le texte est échappé avant d'être écrit dans le HTML ; sauvegarde automatique avant chaque écriture, écriture atomique.

## 7. Limites connues

- C'est un outil **local mono-utilisateur** : un seul mot de passe, pas de comptes ni d'historique par personne. Pas de HTTPS intégré (donc `--host 0.0.0.0` seulement sur réseau de confiance, ou derrière un proxy HTTPS).
- Les sessions sont en mémoire : redémarrer `server.py` déconnecte.
- Non modifiables dans le tableau de bord : la **vidéo/affiche d'accueil**, le logo, les 4 mascottes, la **carte du plan** (`map.webp`), les polices, les couleurs, la mise en page, la bulle « Un croc et tu comprends ! » est un texte (modifiable) mais pas sa forme. Pour cela il faut toujours un développeur.
- Photos : le navigateur doit savoir décoder l'image (JPG/PNG/WebP). Les photos **HEIC/HEIF** d'iPhone brutes ne passent que sur Safari ; sinon les convertir en JPG. Le navigateur sait écrire du WebP (Chrome, Edge, Firefox) ; sous Safari les photos sont enregistrées en JPEG (plus lourdes). Les photos téléversées n'ont pas de version AVIF (les photos d'origine en ont).
- Le nom du restaurant (« Whoopy Burger »), le texte alternatif de la carte et des mascottes sont fixes dans le gabarit.
- Si un texte libre mentionne le nombre de burgers ou le téléphone en dur (ex. « Douze recettes »), il ne se met pas à jour : utiliser les repères `{nb_burgers_lettres}`, `{tel}` (déjà en place pour le texte d'origine).
- Les horaires affichés « Ouvert maintenant » utilisent l'heure de l'ordinateur du visiteur convertie dans le fuseau configuré (Africa/Algiers).
- L'adresse publique du site (balise canonique, Google, partage) vaut encore `http://127.0.0.1:8768` comme dans le site d'origine : à changer avant la mise en ligne.
- Mode Decap/Netlify : modèle fourni mais non testé avec un vrai compte Netlify ; le redimensionnement d'images n'y est pas automatique.

## 8. Pour les développeurs

- Le gabarit `template/index.template.html` et `content.json` ont été dérivés du `work/build.py` d'origine par `tools/build_template.py` + `tools/make_content.py` (sans modifier l'original).
- `python3 render.py --check` valide `content.json` ; `python3 render.py` régénère le site. `tools/reset_to_original.sh` remet le contenu d'origine.
- Tests de bout en bout (Puppeteer) : `tools/e2e/` (identité pixel, parcours /admin, statut d'ouverture).
- Le code n'utilise que la bibliothèque standard Python (testé avec Python 3.8 et 3.13).
