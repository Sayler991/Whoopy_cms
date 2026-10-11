#!/usr/bin/env python3
"""Génère extras/netlify/decap/config.yml (Decap CMS) à partir du modèle de content.json."""
import json, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
D = json.load(open(os.path.join(ROOT, 'template/default_content.json'), encoding='utf-8'))
def s(name, label, **k): return dict(name=name, label=label, widget=k.pop('widget', 'string'), **k)
def txt(name, label, **k): return s(name, label, widget='text', **k)
def obj(name, label, fields, **k): return dict(name=name, label=label, widget='object', collapsed=True, fields=fields, **k)
def lst(name, label, fields=None, field=None, **k):
    d = dict(name=name, label=label, widget='list', collapsed=True, **k)
    if fields: d['fields'] = fields
    if field: d['field'] = field
    return d
RICH = 'Entourez un mot de *étoiles* pour le mettre en jaune. {tel} = téléphone.'
photos = [obj(slot, p['label'], [
    dict(name='src', label='Photo (envoyez un fichier déjà léger, ~200 Ko, format 4:3 ou 3:4 selon l’emplacement)', widget='image', required=False),
    s('alt', 'Description (Google, malvoyants)', required=False), s('caption', 'Légende affichée (facultatif)', required=False)]) for slot, p in D['photos'].items()]
days = [lst('days', 'Jours (7, dans l’ordre lundi → dimanche)', min=7, max=7, fields=[
    s('day', 'Jour'), lst('ranges', 'Plages d’ouverture (aucune = fermé)', max=2, fields=[
        s('open', 'Ouverture (HH:MM)', pattern=['^([01]?\\d|2[0-3]):[0-5]\\d$', 'Format 11:30']), s('close', 'Fermeture (HH:MM, 00:00 = minuit)', pattern=['^([01]?\\d|2[0-3]):[0-5]\\d$', 'Format 00:00'])])])]
fields = [
 obj('site', 'Référencement Google & partage', [s('url', 'Adresse publique du site'), s('title', 'Titre'), txt('description', 'Description'), s('og_title', 'Titre de partage'),
     txt('og_description', 'Description de partage'), txt('twitter_description', 'Description Twitter/X'), txt('schema_description', 'Description longue'), s('timezone', 'Fuseau horaire')]),
 obj('contact', 'Contact & adresse', [s('phone_display', 'Téléphone affiché'), s('phone_intl', 'Téléphone (format +213…)'), txt('address', 'Adresse affichée'), s('street', 'Quartier / rue'),
     s('city', 'Ville'), s('postal_code', 'Code postal', required=False), s('country', 'Pays (code)'), s('instagram_url', 'Lien Instagram'), s('instagram_handle', 'Nom Instagram'),
     s('maps_url', 'Lien Google Maps'), s('place_id', 'Identifiant Google du lieu', required=False), s('lat', 'Latitude', widget='number', value_type='float'), s('lon', 'Longitude', widget='number', value_type='float')]),
 obj('rating', 'Note Google', [s('value', 'Note (ex. 5,0)'), s('count', 'Nombre d’avis', widget='number', value_type='int')]),
 obj('hero', 'Accueil', [s('kicker', 'Sur-titre'), s('lead', 'Phrase d’accroche', hint=RICH), txt('bubble', 'Bulle de la mascotte'), s('badge_text', 'Texte du badge rond', required=False), lst('marquee', 'Bandeau défilant', field=s('mot', 'Mot'))]),
 obj('about', 'La maison', [s('title', 'Titre', hint=RICH), txt('big', 'Introduction'), txt('text', 'Paragraphe', required=False), txt('quote', 'Citation', required=False), s('quote_cite', 'Source de la citation', required=False), lst('facts', 'Mots-clés', field=s('mot', 'Mot'))]),
 obj('services', 'Services', [s('title', 'Titre', hint=RICH), txt('lead', 'Introduction', required=False), lst('items', 'Services', fields=[
     s('title', 'Titre'), s('icon', 'Icône', widget='select', options=['burger', 'fries', 'seat', 'moto']), txt('text', 'Texte', required=False), s('quote', 'Citation (facultatif)', required=False), s('quote_cite', 'Source', required=False)])]),
 obj('band', 'Bandeau photo', [s('title', 'Titre', hint=RICH), s('sub', 'Sous-titre', required=False)]),
 obj('menu', 'La carte', [s('title', 'Titre', hint=RICH), txt('lead', 'Introduction', required=False),
     lst('burgers', 'Burgers', fields=[s('name', 'Nom'), txt('desc', 'Description', required=False), s('price', 'Prix (DA)', widget='number', value_type='int', min=0),
         s('tag', 'Étiquette', required=False), s('color', 'Couleur', widget='select', options=['rose', 'jaune', 'bleu']), s('hot', '🔥 Mis en avant', widget='boolean', default=False, required=False)]),
     lst('supplements', 'Suppléments', fields=[s('name', 'Nom'), s('price', 'Prix (DA)', widget='number', value_type='int', min=0), s('desc', 'Phrase (facultatif)', required=False)]),
     s('included_title', 'Encadré — début en gras', required=False), s('included_text', 'Encadré — suite', required=False), txt('note', 'Note de bas de carte', required=False)]),
 obj('gallery', 'Ambiance', [s('title', 'Titre', hint=RICH)]),
 obj('reviews', 'Avis', [s('title', 'Titre', hint=RICH), s('note', 'Note sous les avis', required=False), lst('items', 'Avis', fields=[
     s('author', 'Auteur'), s('stars', 'Étoiles', widget='number', value_type='int', min=1, max=5), s('source', 'Source', required=False), txt('text', 'Texte')])]),
 obj('hours', 'Horaires', [s('title', 'Titre', hint=RICH), s('note', 'Note', required=False)] + days),
 obj('footer', 'Pied de page', [s('tagline', 'Phrase sous le logo', required=False)]),
 obj('photos', 'Photos', photos),
]
cfg = {'backend': {'name': 'git-gateway', 'branch': 'main'}, 'locale': 'fr', 'media_folder': 'site/assets/img/uploads', 'public_folder': '/assets/img/uploads',
       'site_url': 'https://VOTRE-SITE.netlify.app', 'display_url': 'https://VOTRE-SITE.netlify.app',
       'collections': [{'name': 'contenu', 'label': 'Contenu du site', 'files': [{'name': 'content', 'label': 'Whoopy Burger — tout le site', 'file': 'content.json', 'format': 'json', 'fields': fields}]}]}
def y(v, ind=0):
    pad = '  ' * ind
    if isinstance(v, dict):
        out = ''
        for k, x in v.items():
            if isinstance(x, (dict, list)) and x: out += f'{pad}{k}:\n' + y(x, ind + 1)
            else: out += f'{pad}{k}: {y(x)}\n'
        return out
    if isinstance(v, list):
        if all(not isinstance(i, (dict, list)) for i in v): return '[' + ', '.join(y(i) for i in v) + ']' if ind == -1 else ''.join(f'{pad}- {y(i)}\n' for i in v)
        out = ''
        for i in v:
            body = y(i, ind + 1).splitlines()
            out += f'{pad}- ' + body[0].lstrip() + '\n' + '\n'.join(body[1:]) + ('\n' if len(body) > 1 else '')
        return out
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    return json.dumps(v, ensure_ascii=False)
open(os.path.join(ROOT, 'extras/netlify/decap/config.yml'), 'w', encoding='utf-8').write(
    '# Configuration Decap CMS pour Whoopy Burger (voir README, section « Mise en ligne »).\n# Généré par tools/make_decap_config.py — à adapter à votre dépôt.\n' + y(cfg))
print('config.yml écrit')
