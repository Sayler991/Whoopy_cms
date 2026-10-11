#!/usr/bin/env python3
"""Génère content.json (contenu actuel du site, extrait de l'original) depuis tools/seed.json."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
S = json.load(open(os.path.join(HERE, 'seed.json'), encoding='utf-8')); D = S['D']
COLOR = {'v': 'rose', 'p': 'jaune', 'f': 'bleu'}
def hm(t): return re.sub(r'h', ':', t.strip())
days = []
for j, h in S['JOURS']:
    a, b = [x.strip() for x in h.split('–')]
    days.append({'day': j, 'ranges': [[hm(a), hm(b)]]})
META = {  # slot -> (étiquette, ratio d'envoi, largeurs)
 'about_1': ('La maison — grande photo en arche', (3, 4)), 'about_2': ('La maison — petite photo en bas', (3, 4)),
 'menu_1': ('La carte — grande photo « Burger & frites »', (4, 3)), 'menu_2': ('La carte — photo « Poulet pané »', (3, 4)), 'menu_3': ('La carte — photo « Pain brioché »', (3, 4)),
 'band': ('Bandeau pleine largeur « Le plaisir se sert sur un plateau »', (5, 2)),
 'gal_1': ('Ambiance — grande photo (fresque)', (3, 2)), 'gal_2': ('Ambiance — photo verticale (rouge & blanc)', (3, 4)),
 'gal_3': ('Ambiance — rangée du bas, 1re photo', (3, 4)), 'gal_4': ('Ambiance — rangée du bas, 2e photo', (3, 4)), 'gal_5': ('Ambiance — rangée du bas, 3e photo', (3, 4)),
}
photos = {}
for slot, (name, widths, sizes, alt, ratio) in S['picalls'].items():
    big = max(widths)
    photos[slot] = {'label': META[slot][0], 'base': name, 'ext': 'webp', 'widths': widths, 'avif': True,
                    'w': big, 'h': round(big * ratio[1] / ratio[0]), 'alt': alt, 'caption': D.get('cap_' + slot, ''), 'sizes': sizes,
                    'upload_ratio': list(META[slot][1])}
S['services'][0]['text'] = S['services'][0]['text'].replace('Douze recettes', '{Nb_burgers_lettres} recettes', 1)
content = {
 'version': 1,
 'site': {'url': S['URL'], 'title': S['TITLE'], 'description': S['DESC'].replace(S['TELD'], '{tel}'), 'og_title': D['og_title'], 'og_description': D['og_desc'],
          'twitter_description': D['tw_desc'], 'schema_description': S['ld']['description'], 'timezone': 'Africa/Algiers'},
 'contact': {'phone_intl': S['TEL'], 'phone_display': S['TELD'], 'address': D['address'], 'street': S['ld']['address']['streetAddress'],
             'city': S['ld']['address']['addressLocality'], 'postal_code': S['ld']['address']['postalCode'], 'country': S['ld']['address']['addressCountry'],
             'instagram_url': S['IG'], 'instagram_handle': '@whoopy13', 'maps_url': S['GMAP'], 'place_id': S['PLACE'], 'lat': S['LAT'], 'lon': S['LON']},
 'rating': {'value': D['rating_value'], 'count': D['rating_count']},
 'hero': {'kicker': D['hero_kicker'], 'lead': D['hero_lead'], 'bubble': D['hero_bubble'], 'badge_text': D['badge_text'], 'marquee': S['mq_items']},
 'about': {'title': D['about_title'], 'big': D['about_big'], 'text': D['about_text'], 'quote': D['about_quote'], 'quote_cite': D['about_cite'], 'facts': ['Frais', 'Gourmand', 'Irrésistible']},
 'services': {'title': D['services_title'], 'lead': D['services_lead'], 'items': S['services']},
 'band': {'title': D['band_title'], 'sub': D['band_sub']},
 'menu': {'title': D['menu_title'], 'lead': D['menu_lead'],
          'burgers': [{'name': n, 'desc': d, 'price': p, 'tag': t, 'color': COLOR[c], 'hot': bool(h)} for n, d, p, t, c, h in S['BURGERS']],
          'supplements': [{'name': n, 'price': p, 'desc': 'À ajouter à votre burger.'} for n, p in S['SUPP']],
          'included_title': D['menu_incl_title'], 'included_text': D['menu_incl_text'], 'note': D['menu_note']},
 'gallery': {'title': D['gallery_title']},
 'reviews': {'title': D['reviews_title'], 'note': D['reviews_note'], 'items': [{'author': a, 'stars': s, 'source': src, 'text': t} for a, s, src, t in S['RV']]},
 'hours': {'title': D['hours_title'], 'note': D['hours_note'], 'days': days},
 'footer': {'tagline': D['footer_tagline']},
 'photos': photos,
}
for k, p_ in photos.items(): p_['original'] = {x: p_[x] for x in ('base', 'ext', 'widths', 'avif', 'w', 'h', 'alt', 'caption')}
json.dump(content, open(os.path.join(ROOT, 'content.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(content, open(os.path.join(ROOT, 'template/default_content.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('content.json écrit')
