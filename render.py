#!/usr/bin/env python3
"""Whoopy Burger — génère site/index.html à partir de content.json (bibliothèque standard uniquement).

Utilisation :  python3 render.py            -> lit content.json, écrit site/index.html (+ robots.txt, sitemap.xml)
               python3 render.py --check    -> vérifie content.json sans rien écrire
"""
import html, json, os, re, sys, datetime, copy

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site')
TEMPLATE = os.path.join(ROOT, 'template', 'index.template.html')
PARTS = os.path.join(ROOT, 'template', 'parts.json')
DEFAULTS = os.path.join(ROOT, 'template', 'default_content.json')
CONTENT = os.path.join(ROOT, 'content.json')

COLORS = {'rose': 'v', 'jaune': 'p', 'bleu': 'f'}
ICONS = ('burger', 'fries', 'seat', 'moto')
EXTS = ('webp', 'jpg', 'png')
HEURE = re.compile(r'^([01]?\d|2[0-3]):([0-5]\d)$')


class ContentError(ValueError):
    pass


# ───────────────────────── validation / normalisation ─────────────────────────
def _s(v, path, n=600, req=False, multiline=False):
    if v is None: v = ''
    if not isinstance(v, (str, int, float)) or isinstance(v, bool): raise ContentError(f'{path} : texte attendu')
    v = str(v).replace('\r\n', '\n').replace('\r', '\n').replace('\x00', '')
    if not multiline: v = v.replace('\n', ' ')
    v = v.strip()
    if len(v) > n: raise ContentError(f'{path} : trop long ({len(v)} caractères, maximum {n})')
    if req and not v: raise ContentError(f'{path} : champ obligatoire')
    return v


def _i(v, path, lo, hi):
    try:
        if isinstance(v, bool): raise ValueError
        if isinstance(v, str): v = v.strip().replace(' ', '').replace(',', '.')
        f = float(v); 
        if f != int(f): raise ValueError
        v = int(f)
    except (ValueError, TypeError, OverflowError):
        raise ContentError(f'{path} : nombre entier attendu')
    if not lo <= v <= hi: raise ContentError(f'{path} : doit être entre {lo} et {hi}')
    return v


def _url(v, path, req=True):
    v = _s(v, path, 500, req)
    if v and not re.match(r'^https?://[^\s<>"\']+$', v): raise ContentError(f'{path} : adresse web invalide (doit commencer par http:// ou https://)')
    return v


def _list(v, path, mx):
    if not isinstance(v, list): raise ContentError(f'{path} : liste attendue')
    if len(v) > mx: raise ContentError(f'{path} : {len(v)} éléments, maximum {mx}')
    return v


def _dict(v, path):
    if not isinstance(v, dict): raise ContentError(f'{path} : bloc attendu')
    return v


def _hm(v, path):
    v = _s(v, path, 5)
    m = HEURE.match(v)
    if not m: raise ContentError(f'{path} : heure invalide « {v} » (format 11:30)')
    return f'{int(m.group(1)):02d}:{m.group(2)}'


def load_defaults():
    with open(DEFAULTS, encoding='utf-8') as f: return json.load(f)


def normalize(c, check_files=True):
    """Valide et nettoie le contenu. Lève ContentError (message en français)."""
    D = load_defaults()
    c = _dict(c, 'contenu')
    out = {'version': 1}
    g = lambda blk: _dict(c.get(blk, {}), blk)
    s = g('site'); o = {}
    o['url'] = _url(s.get('url'), 'Site › adresse du site').rstrip('/')
    o['title'] = _s(s.get('title'), 'Site › titre', 200, True)
    o['description'] = _s(s.get('description'), 'Site › description', 400, True)
    o['og_title'] = _s(s.get('og_title'), 'Site › titre de partage', 200, True)
    o['og_description'] = _s(s.get('og_description'), 'Site › description de partage', 400, True)
    o['twitter_description'] = _s(s.get('twitter_description'), 'Site › description Twitter', 300, True)
    o['schema_description'] = _s(s.get('schema_description'), 'Site › description longue', 500, True)
    tz = _s(s.get('timezone') or 'Africa/Algiers', 'Site › fuseau horaire', 50)
    if not re.match(r'^[A-Za-z_]+(/[A-Za-z_+\-0-9]+){0,2}$', tz): raise ContentError('Site › fuseau horaire invalide')
    o['timezone'] = tz; out['site'] = o
    s = g('contact'); o = {}
    ph = re.sub(r'[ .\-()]', '', _s(s.get('phone_intl'), 'Téléphone (format international)', 25, True))
    if not re.match(r'^\+?\d{6,18}$', ph): raise ContentError('Téléphone (format international) : chiffres uniquement, par ex. +213552103462')
    o['phone_intl'] = ph
    o['phone_display'] = _s(s.get('phone_display'), 'Téléphone affiché', 30, True)
    o['address'] = _s(s.get('address'), 'Adresse affichée', 200, True, True)
    o['street'] = _s(s.get('street'), 'Adresse › rue/quartier', 150, True)
    o['city'] = _s(s.get('city'), 'Adresse › ville', 100, True)
    o['postal_code'] = _s(s.get('postal_code'), 'Adresse › code postal', 12)
    o['country'] = _s(s.get('country'), 'Adresse › pays (code)', 2, True).upper()
    o['instagram_url'] = _url(s.get('instagram_url'), 'Instagram › lien')
    o['instagram_handle'] = _s(s.get('instagram_handle'), 'Instagram › nom', 40, True)
    o['maps_url'] = _url(s.get('maps_url'), 'Google Maps › lien')
    o['place_id'] = _s(s.get('place_id'), 'Google Maps › identifiant du lieu', 80)
    if o['place_id'] and not re.match(r'^[\w\-]+$', o['place_id']): raise ContentError('Google Maps › identifiant du lieu invalide')
    for k, lab, lim in (('lat', 'Latitude', 90), ('lon', 'Longitude', 180)):
        try: v = float(str(s.get(k)).replace(',', '.'))
        except ValueError: raise ContentError(f'{lab} : nombre attendu')
        if not -lim <= v <= lim: raise ContentError(f'{lab} : hors limites')
        o[k] = v
    out['contact'] = o
    s = g('rating')
    out['rating'] = {'value': _s(s.get('value'), 'Note Google', 6, True), 'count': _i(s.get('count'), 'Nombre d’avis Google', 0, 1000000)}
    if not re.match(r'^\d([.,]\d)?$', out['rating']['value']): raise ContentError('Note Google : format attendu 5,0')
    s = g('hero')
    out['hero'] = {'kicker': _s(s.get('kicker'), 'Accueil › sur-titre', 150, True), 'lead': _s(s.get('lead'), 'Accueil › phrase', 300, True),
                   'bubble': _s(s.get('bubble'), 'Accueil › bulle', 80, False, True), 'badge_text': _s(s.get('badge_text'), 'Accueil › texte du badge rond', 80),
                   'marquee': [_s(x, f'Accueil › bandeau défilant #{i+1}', 80, True) for i, x in enumerate(_list(s.get('marquee', []), 'Accueil › bandeau défilant', 12))]}
    s = g('about')
    out['about'] = {'title': _s(s.get('title'), 'La maison › titre', 200, True), 'big': _s(s.get('big'), 'La maison › texte d’introduction', 700, True, True),
                    'text': _s(s.get('text'), 'La maison › texte', 900, False, True), 'quote': _s(s.get('quote'), 'La maison › citation', 300),
                    'quote_cite': _s(s.get('quote_cite'), 'La maison › source de la citation', 150),
                    'facts': [_s(x, 'La maison › mots-clés', 40, True) for x in _list(s.get('facts', []), 'La maison › mots-clés', 6)]}
    s = g('services'); items = []
    for i, it in enumerate(_list(s.get('items', []), 'Services', 8)):
        it = _dict(it, f'Service #{i+1}'); p = f'Service #{i+1}'
        ic = it.get('icon') if it.get('icon') in ICONS else 'burger'
        items.append({'icon': ic, 'title': _s(it.get('title'), p + ' › titre', 100, True), 'text': _s(it.get('text'), p + ' › texte', 500, False, True),
                      'quote': _s(it.get('quote'), p + ' › citation', 200), 'quote_cite': _s(it.get('quote_cite'), p + ' › source', 150)})
    out['services'] = {'title': _s(s.get('title'), 'Services › titre', 200, True), 'lead': _s(s.get('lead'), 'Services › phrase', 400), 'items': items}
    s = g('band'); out['band'] = {'title': _s(s.get('title'), 'Bandeau › titre', 200, True), 'sub': _s(s.get('sub'), 'Bandeau › sous-titre', 120)}
    s = g('menu'); bs = []; ss = []
    for i, b in enumerate(_list(s.get('burgers', []), 'Burgers', 60)):
        b = _dict(b, 'burger'); p = f'Burger #{i+1}'
        bs.append({'name': _s(b.get('name'), p + ' › nom', 80, True), 'desc': _s(b.get('desc'), p + ' › description', 300),
                   'price': _i(b.get('price'), p + ' › prix', 0, 99999), 'tag': _s(b.get('tag'), p + ' › étiquette', 20),
                   'color': b.get('color') if b.get('color') in COLORS else 'jaune', 'hot': bool(b.get('hot'))})
    for i, b in enumerate(_list(s.get('supplements', []), 'Suppléments', 40)):
        b = _dict(b, 'supplément'); p = f'Supplément #{i+1}'
        ss.append({'name': _s(b.get('name'), p + ' › nom', 80, True), 'price': _i(b.get('price'), p + ' › prix', 0, 99999), 'desc': _s(b.get('desc'), p + ' › description', 200)})
    out['menu'] = {'title': _s(s.get('title'), 'La carte › titre', 200, True), 'lead': _s(s.get('lead'), 'La carte › phrase', 400), 'burgers': bs, 'supplements': ss,
                   'included_title': _s(s.get('included_title'), 'La carte › encadré (titre)', 100), 'included_text': _s(s.get('included_text'), 'La carte › encadré (texte)', 300),
                   'note': _s(s.get('note'), 'La carte › note de bas de carte', 600, False, True)}
    out['gallery'] = {'title': _s(g('gallery').get('title'), 'Ambiance › titre', 200, True)}
    s = g('reviews'); its = []
    for i, r in enumerate(_list(s.get('items', []), 'Avis', 30)):
        r = _dict(r, 'avis'); p = f'Avis #{i+1}'
        its.append({'author': _s(r.get('author'), p + ' › auteur', 80, True), 'stars': _i(r.get('stars', 5), p + ' › étoiles', 1, 5),
                    'source': _s(r.get('source') or 'Google', p + ' › source', 30), 'text': _s(r.get('text'), p + ' › texte', 1500, True, True)})
    out['reviews'] = {'title': _s(s.get('title'), 'Avis › titre', 200, True), 'note': _s(s.get('note'), 'Avis › note', 300), 'items': its}
    s = g('hours'); days = _list(s.get('days', []), 'Horaires', 7)
    if len(days) != 7: raise ContentError('Horaires : les 7 jours sont obligatoires')
    dd = []
    for i, d in enumerate(days):
        d = _dict(d, 'jour'); name = _s(d.get('day'), 'Horaires › jour', 20, True)
        rs = []
        for j, r in enumerate(_list(d.get('ranges', []), f'Horaires › {name}', 2)):
            if isinstance(r, dict): r = [r.get('open'), r.get('close')]
            if not isinstance(r, list) or len(r) != 2: raise ContentError(f'Horaires › {name} : plage invalide')
            rs.append([_hm(r[0], f'Horaires › {name} › ouverture'), _hm(r[1], f'Horaires › {name} › fermeture')])
        dd.append({'day': name, 'ranges': rs})
    out['hours'] = {'title': _s(s.get('title'), 'Horaires › titre', 200, True), 'note': _s(s.get('note'), 'Horaires › note', 300), 'days': dd}
    out['footer'] = {'tagline': _s(g('footer').get('tagline'), 'Pied de page › phrase', 200)}
    # photos : les champs techniques (étiquette, tailles) viennent toujours des valeurs par défaut
    ph = _dict(c.get('photos', {}), 'photos'); out['photos'] = {}
    for slot, dflt in D['photos'].items():
        p = _dict(ph.get(slot, dflt), f'photo {slot}')
        src = _s(p.get('src'), f'Photo {slot} › fichier', 200).lstrip('/')
        if src:
            if not re.match(r'^assets/[A-Za-z0-9_./-]+\.(jpe?g|png|webp|avif)$', src) or '..' in src: raise ContentError(f'Photo {slot} : chemin d’image invalide')
            if check_files and not os.path.isfile(os.path.join(SITE, *src.split('/'))): raise ContentError(f'Photo {slot} : fichier introuvable {src}')
        base = _s(p.get('base') or (dflt['base'] if src else ''), f'Photo {slot} › fichier', 80, True)
        if not re.match(r'^[a-z0-9][a-z0-9_-]{0,70}$', base): raise ContentError(f'Photo {slot} : nom de fichier invalide')
        ext = p.get('ext') if p.get('ext') in EXTS else 'webp'
        widths = sorted({_i(w, f'Photo {slot} › largeur', 200, 3000) for w in _list(p.get('widths') or (dflt['widths'] if src else []), f'Photo {slot} › largeurs', 4)})
        if not widths: raise ContentError(f'Photo {slot} : aucune largeur')
        avif = bool(p.get('avif'))
        if check_files and not src:
            for w in widths:
                for e in ([ext] + (['avif'] if avif else [])):
                    if not os.path.isfile(os.path.join(SITE, 'assets', 'img', f'{base}-{w}.{e}')):
                        raise ContentError(f'Photo {slot} : fichier introuvable assets/img/{base}-{w}.{e}')
        out['photos'][slot] = {'label': dflt['label'], 'base': base, 'ext': ext, 'widths': widths, 'avif': avif,
                               'w': _i(p.get('w') or dflt['w'], f'Photo {slot} › largeur', 1, 6000), 'h': _i(p.get('h') or dflt['h'], f'Photo {slot} › hauteur', 1, 6000),
                               'alt': _s(p.get('alt'), f'Photo {slot} › description', 300), 'caption': _s(p.get('caption'), f'Photo {slot} › légende', 60),
                               'sizes': dflt['sizes'], 'upload_ratio': dflt['upload_ratio'], 'original': dflt['original']}
        if src: out['photos'][slot]['src'] = src
    return out


# ───────────────────────── rendu ─────────────────────────
T = lambda s: html.escape(s, quote=False)
A = lambda s: html.escape(s, quote=True)


_U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
_D = {2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante'}


def mots(n):
    """Nombre (0-99) en lettres, en français."""
    if n < 17: return _U[n]
    if n < 20: return 'dix-' + _U[n - 10]
    if n >= 100: return str(n)
    d, u = divmod(n, 10)
    if d in (7, 9):
        base = 'soixante' if d == 7 else 'quatre-vingt'
        r = 10 + u
        return base + (' et ' if (d == 7 and u == 1) else '-') + mots(r)
    if d == 8: return 'quatre-vingts' if u == 0 else 'quatre-vingt-' + _U[u]
    w = _D[d]
    return w if u == 0 else (w + ' et un' if u == 1 else w + '-' + _U[u])


def _tok(s, c):
    nb = len(c['menu']['burgers'])
    return (s.replace('{tel}', c['contact']['phone_display']).replace('{nb_burgers_lettres}', mots(nb))
             .replace('{Nb_burgers_lettres}', mots(nb).capitalize()).replace('{nb_burgers}', str(nb)))


def rich(s, c):
    """Texte → HTML : *mot* = mis en couleur, saut de ligne = <br>, {tel} = téléphone affiché."""
    e = T(_tok(s, c))
    e = re.sub(r'\*([^*\n]+)\*', r'<em>\1</em>', e)
    return e.replace('\n', '<br>')


def fmt_h(h):  # "11:30" -> "11h30"
    a, b = h.split(':'); return f'{int(a):02d}h{b}'


def minutes(h):
    a, b = h.split(':'); return int(a) * 60 + int(b)


def range_min(r):
    o, cl = minutes(r[0]), minutes(r[1])
    if cl <= o: cl += 1440
    return o, cl


def _parts():
    with open(PARTS, encoding='utf-8') as f: return json.load(f)


def photo_html(p, alt_override=None, loading='lazy'):
    if p.get('src'):  # image unique (mode Netlify/Decap : fichier envoyé tel quel)
        return f'<picture><img src="{A(p["src"])}" width="{p["w"]}" height="{p["h"]}" alt="{A(p["alt"])}" loading="{loading}" decoding="async"></picture>'
    ws = p['widths']; mid = ws[len(ws) // 2]; big = ws[-1]
    hh = round(big * p['h'] / p['w']) if p['w'] else p['h']
    mime = 'image/webp' if p['ext'] == 'webp' else ('image/jpeg' if p['ext'] == 'jpg' else 'image/png')
    wp = ', '.join('assets/img/%s-%d.%s %dw' % (p['base'], x, p['ext'], x) for x in ws)
    base = p['base']; sz = A(p['sizes'])
    src = ''
    if p['avif']:
        av = ', '.join('assets/img/%s-%d.avif %dw' % (base, x, x) for x in ws)
        src += '<source type="image/avif" srcset="%s" sizes="%s">' % (av, sz)
    src += '<source type="%s" srcset="%s" sizes="%s">' % (mime, wp, sz)
    return (f'<picture>{src}<img src="assets/img/{p["base"]}-{mid}.{p["ext"]}" width="{big}" height="{hh}" alt="{A(p["alt"])}" loading="{loading}" decoding="async"></picture>')


def build_values(c):
    P = _parts(); star = P['star']; ct = c['contact']
    stars = lambda n: f'<span class="stars" role="img" aria-label="{n} sur 5">' + star * n + '</span>'
    V = {}
    V['url'] = A(c['site']['url'])
    V['title'] = T(c['site']['title']); V['desc'] = A(_tok(c['site']['description'], c))
    V['og_title'] = A(c['site']['og_title']); V['og_desc'] = A(c['site']['og_description']); V['tw_desc'] = A(c['site']['twitter_description'])
    V['lat'] = repr(ct['lat']); V['lon'] = repr(ct['lon'])
    V['tel'] = A(ct['phone_intl']); V['teld'] = T(ct['phone_display'])
    V['ig'] = A(ct['instagram_url']); V['ig_handle'] = T(ct['instagram_handle']); V['gmap'] = A(ct['maps_url'])
    dest = f"{ct['lat']},{ct['lon']}" + (f"&destination_place_id={ct['place_id']}" if ct['place_id'] else '')
    V['dir'] = f'https://www.google.com/maps/dir/?api=1&destination={dest}'
    V['address_br'] = rich(ct['address'], c); V['timezone'] = A(c['site']['timezone'])
    V['rating_value'] = T(c['rating']['value']); V['rating_count'] = str(c['rating']['count'])
    h = c['hero']
    V['hero_kicker'] = rich(h['kicker'], c); V['hero_lead'] = rich(h['lead'], c); V['hero_bubble'] = rich(h['bubble'], c)
    V['badge_text'] = T(h['badge_text']) + ' ' if h['badge_text'] else ''
    V['marquee'] = ''.join(f'<span>{T(t)}{P["bsep"]}</span>' for t in h['marquee']) * 4
    a = c['about']
    V['about_title'] = rich(a['title'], c); V['about_big'] = rich(a['big'], c); V['about_text'] = rich(a['text'], c)
    V['about_quote'] = rich(a['quote'], c); V['about_cite'] = rich(a['quote_cite'], c)
    V['facts'] = ''.join(f'<span>{T(x)}</span>' for x in a['facts'])
    sv = c['services']; V['services_title'] = rich(sv['title'], c); V['services_lead'] = rich(sv['lead'], c)
    li = []
    for i, it in enumerate(sv['items']):
        d = f' style="--d:.{min(i, 12) * 8:02d}s"' if i else ''
        q = f'<blockquote class="quote-ig">{rich(it["quote"], c)}<cite>{rich(it["quote_cite"], c)}</cite></blockquote>' if it['quote'] else ''
        li.append(f'<li data-r{d}><span class="n">{i + 1:02d}</span>{P["icons"][it["icon"]]}<h3>{rich(it["title"], c)}</h3><p>{rich(it["text"], c)}</p>{q}</li>')
    V['services'] = '\n   ' + '\n   '.join(li) + '\n  ' if li else ''
    b = c['band']; V['band_title'] = rich(b['title'], c); V['band_sub'] = rich(b['sub'], c)
    m = c['menu']
    V['menu_title'] = rich(m['title'], c); V['menu_lead'] = rich(m['lead'], c); V['menu_note'] = rich(m['note'], c)
    fmtp = lambda n: f'{n}<small>DA</small>'
    V['menu_burgers'] = ''.join(
        f'<article class="mi{" hot" if x["hot"] else ""}" data-r style="--d:{(i % 3) * .08}s"><span class="price" aria-label="{x["price"]} dinars">{fmtp(x["price"])}</span>'
        + (f'<span class="tag {COLORS[x["color"]]}">{T(x["tag"])}</span>' if x['tag'] else '')
        + f'<h3>{T(x["name"])}</h3>' + (f'<p>{T(x["desc"])}</p>' if x['desc'] else '') + '</article>' for i, x in enumerate(m['burgers']))
    V['menu_supp'] = ''.join(
        f'<article class="mi" data-r style="--d:{(i % 3) * .08}s"><span class="price" aria-label="{x["price"]} dinars">{fmtp(x["price"])}</span><h3>{T(x["name"])}</h3>'
        + (f'<p>{T(x["desc"])}</p>' if x['desc'] else '') + '</article>' for i, x in enumerate(m['supplements']))
    nb, ns = len(m['burgers']), len(m['supplements'])
    V['n_burgers'] = f'{nb} recette' + ('s' if nb > 1 else ''); V['n_supp'] = f'{ns} extra' + ('s' if ns > 1 else '')
    V['menu_incl'] = (f'<p class="menu-incl" data-r><b>{T(m["included_title"])}</b> {T(m["included_text"])}</p>' if (m['included_title'] or m['included_text']) else '')
    V['gallery_title'] = rich(c['gallery']['title'], c)
    r = c['reviews']; V['reviews_title'] = rich(r['title'], c); V['reviews_note'] = rich(r['note'], c)
    def card(i, x):
        return (f'<article class="rv{" big" if i == 0 else ""}" data-r style="--d:{i * .12}s"><q>{T(x["text"])}</q><footer><span><b>{T(x["author"])}</b>'
                + (f' · avis {T(x["source"])}' if x['source'] else ' ') + f'</span>{stars(x["stars"])}</footer></article>')
    its = r['items']
    if not its: V['reviews'] = ''
    else:
        side = ''.join(card(i, x) for i, x in enumerate(its) if i)
        V['reviews'] = f'<div class="rv-grid">{card(0, its[0])}' + (f'<div class="rv-side">{side}</div>' if side else '') + '</div>'
    ho = c['hours']; V['hours_title'] = rich(ho['title'], c); V['hours_note'] = rich(ho['note'], c)
    lis = []
    for d in ho['days']:
        txt = ' / '.join(f'{fmt_h(a)} – {fmt_h(b)}' for a, b in d['ranges']) or 'Fermé'
        rng = '|'.join('%d-%d' % range_min(x) for x in d['ranges'])
        lis.append(f'<li data-o="{rng}"><span>{T(d["day"])}</span><span>{txt}</span></li>')
    V['hours_li'] = ''.join(lis)
    V['footer_tagline'] = rich(c['footer']['tagline'], c)
    for slot, p in c['photos'].items():
        V['photo_' + slot] = photo_html(p)
        cap = p['caption']
        if slot.startswith('menu'): V['cap_' + slot] = f'<span class="cap">{T(cap)}</span>' if cap else ''
        else: V['cap_' + slot] = f'<figcaption>{T(cap)}</figcaption>' if cap else ''
    # JSON-LD
    DOW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    groups = {}
    for i, d in enumerate(ho['days']):
        if d['ranges']: groups.setdefault(tuple(map(tuple, d['ranges'])), []).append(DOW[i])
    spec = []
    for rs, days in groups.items():
        for a, b in rs:
            spec.append({'@type': 'OpeningHoursSpecification', 'dayOfWeek': days if len(days) > 1 else days[0], 'opens': a, 'closes': b})
    u = c['site']['url']
    ld = {'@context': 'https://schema.org', '@type': 'Restaurant', '@id': u + '/#restaurant', 'name': 'Whoopy Burger', 'url': u + '/',
          'image': [u + '/assets/og-image.jpg'], 'logo': u + '/assets/logo.svg', 'description': _tok(c['site']['schema_description'], c),
          'servesCuisine': ['Burgers'], 'telephone': ct['phone_intl'], 'sameAs': [ct['instagram_url']],
          'address': {'@type': 'PostalAddress', 'streetAddress': ct['street'], 'addressLocality': ct['city'], 'postalCode': ct['postal_code'], 'addressCountry': ct['country']},
          'geo': {'@type': 'GeoCoordinates', 'latitude': ct['lat'], 'longitude': ct['lon']}, 'hasMap': ct['maps_url'],
          'openingHoursSpecification': spec,
          'aggregateRating': {'@type': 'AggregateRating', 'ratingValue': c['rating']['value'].replace(',', '.') if '.' in c['rating']['value'] or ',' in c['rating']['value'] else c['rating']['value'] + '.0',
                              'bestRating': '5', 'ratingCount': str(c['rating']['count'])}}
    V['jsonld'] = json.dumps(ld, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return V


def render_html(c):
    with open(TEMPLATE, encoding='utf-8') as f: tpl = f.read()
    V = build_values(c)
    return re.sub(r'@@(\w+)@@', lambda m: V[m.group(1)], tpl)


def write_site(c):
    """Écrit site/index.html, robots.txt et sitemap.xml. Retourne le HTML."""
    out = render_html(c); u = c['site']['url']
    def w(name, data):
        tmp = os.path.join(SITE, name + '.tmp')
        with open(tmp, 'w', encoding='utf-8') as f: f.write(data)
        os.replace(tmp, os.path.join(SITE, name))
    w('index.html', out)
    w('robots.txt', f'User-agent: *\nAllow: /\n\nSitemap: {u}/sitemap.xml\n')
    w('sitemap.xml', f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{u}/</loc><lastmod>{datetime.date.today().isoformat()}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url></urlset>\n')
    return out


def load_content(path=CONTENT):
    with open(path, encoding='utf-8') as f: return json.load(f)


if __name__ == '__main__':
    try:
        c = normalize(load_content())
        if '--check' in sys.argv: print('content.json valide.'); sys.exit(0)
        write_site(c); print('site/index.html régénéré depuis content.json')
    except (ContentError, OSError, json.JSONDecodeError) as e:
        print('Erreur :', e, file=sys.stderr); sys.exit(1)
