#!/usr/bin/env python3
"""Whoopy Burger — serveur local : sert le site + tableau de bord /admin/ (bibliothèque standard uniquement).

    python3 server.py                  # http://127.0.0.1:8780  (site)   et   http://127.0.0.1:8780/admin/
    python3 server.py --port 9000
    python3 server.py --host 0.0.0.0   # accessible depuis un téléphone du même Wi-Fi (HTTP non chiffré !)
    python3 server.py --set-password   # change le mot de passe en ligne de commande
"""
import argparse, datetime, getpass, gzip, hashlib, hmac, http.server, json, mimetypes, os, re, secrets, shutil, socketserver, sys, threading, time
from urllib.parse import urlsplit, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(ROOT, 'site')
ADMIN = os.path.join(ROOT, 'admin')
DATA = os.path.join(ROOT, 'data')
BACKUPS = os.path.join(DATA, 'backups')
AUTH = os.path.join(DATA, 'auth.json')
CONTENT = os.path.join(ROOT, 'content.json')
IMG = os.path.join(SITE, 'assets', 'img')
sys.path.insert(0, ROOT)
import render  # noqa: E402

DEFAULT_PASSWORD = 'Whoopy2026!'
SESSION_TTL = 8 * 3600
MAX_UPLOAD = 6 * 1024 * 1024        # 6 Mo par image (le tableau de bord les réduit à ~100-300 Ko)
MAX_JSON = 1024 * 1024              # 1 Mo pour content.json
PBKDF2_ITER = 200_000
LOCK = threading.RLock()
SESSIONS = {}                        # sid -> {'exp': t, 'preview': html}
FAILS = {}                           # ip -> (nb, bloqué_jusqu'à)
mimetypes.add_type('image/avif', '.avif'); mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('application/manifest+json', '.webmanifest'); mimetypes.add_type('font/woff2', '.woff2')
TEXT_EXT = {'.html', '.css', '.js', '.svg', '.json', '.webmanifest', '.txt', '.xml'}


# ───────────── mot de passe ─────────────
def hash_pw(pw, salt=None, it=PBKDF2_ITER):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), bytes.fromhex(salt), it).hex()
    return f'pbkdf2_sha256${it}${salt}${h}'


def check_pw(pw, stored):
    try:
        _, it, salt, h = stored.split('$')
        calc = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), bytes.fromhex(salt), int(it)).hex()
        return hmac.compare_digest(calc, h)
    except Exception:
        return False


def load_auth():
    os.makedirs(DATA, exist_ok=True)
    if not os.path.isfile(AUTH):
        save_auth({'hash': hash_pw(DEFAULT_PASSWORD), 'must_change': True})
    with open(AUTH, encoding='utf-8') as f: return json.load(f)


def save_auth(a):
    os.makedirs(DATA, exist_ok=True)
    tmp = AUTH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(a, f)
    os.chmod(tmp, 0o600); os.replace(tmp, AUTH)


# ───────────── contenu ─────────────
def read_content():
    with open(CONTENT, encoding='utf-8') as f: return json.load(f)


def write_atomic(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: f.write(data)
    os.replace(tmp, path)


def make_backup():
    if not os.path.isfile(CONTENT): return
    os.makedirs(BACKUPS, exist_ok=True)
    name = 'content-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.json'
    shutil.copy2(CONTENT, os.path.join(BACKUPS, name))
    for old in sorted(os.listdir(BACKUPS))[:-40]:
        try: os.remove(os.path.join(BACKUPS, old))
        except OSError: pass


def referenced_images(c):
    return {p['base'] for p in c['photos'].values()}


def clean_orphans(c):
    """Supprime les photos téléversées (up-*) qui ne sont plus utilisées, de plus d'une heure (ni sauvegarde ne les référence)."""
    keep = referenced_images(c)
    # on garde aussi celles référencées par les sauvegardes récentes (pour pouvoir restaurer)
    if os.path.isdir(BACKUPS):
        for n in sorted(os.listdir(BACKUPS))[-40:]:
            try:
                with open(os.path.join(BACKUPS, n), encoding='utf-8') as f:
                    for p in json.load(f).get('photos', {}).values(): keep.add(p.get('base'))
            except Exception: pass
    now = time.time()
    for fn in os.listdir(IMG):
        m = re.match(r'^(up-[a-z0-9_-]+?)-(\d+)\.(webp|jpg|png)$', fn)
        if m and m.group(1) not in keep and now - os.path.getmtime(os.path.join(IMG, fn)) > 3600:
            try: os.remove(os.path.join(IMG, fn))
            except OSError: pass


def save_content(raw):
    with LOCK:
        c = render.normalize(raw)
        old = None
        if os.path.isfile(CONTENT):
            with open(CONTENT, encoding='utf-8') as f: old = f.read()
        make_backup()
        try:
            write_atomic(CONTENT, json.dumps(c, ensure_ascii=False, indent=1))
            render.write_site(c)
        except Exception:
            if old is not None: write_atomic(CONTENT, old)
            raise
        clean_orphans(c)
        return c


MAGIC = {'webp': lambda b: b[:4] == b'RIFF' and b[8:12] == b'WEBP', 'jpg': lambda b: b[:3] == b'\xff\xd8\xff', 'png': lambda b: b[:8] == b'\x89PNG\r\n\x1a\n'}


# ───────────── HTTP ─────────────
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'WhoopyCMS'
    sys_version = ''
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *a):
        if os.environ.get('WHOOPY_VERBOSE'): sys.stderr.write('%s %s\n' % (self.address_string(), fmt % a))

    # --- utilitaires
    def ip(self): return self.client_address[0]

    def cookie_sid(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == 'wb_sid': return v
        return None

    def session(self):
        sid = self.cookie_sid(); s = SESSIONS.get(sid)
        if s and s['exp'] > time.time(): return sid, s
        if s: SESSIONS.pop(sid, None)
        return None, None

    def send_bytes(self, code, body, ctype='text/plain; charset=utf-8', extra=None, head=False):
        if isinstance(body, str): body = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (extra or {}).items(): self.send_header(k, v)
        if self.command in ('POST', 'PUT', 'DELETE') and not getattr(self, '_consumed', False):
            self.send_header('Connection', 'close'); self.close_connection = True
        self.end_headers()
        if not head and self.command != 'HEAD':
            try: self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError): pass

    def jsend(self, code, obj, extra=None):
        self.send_bytes(code, json.dumps(obj, ensure_ascii=False), 'application/json; charset=utf-8', {'Cache-Control': 'no-store', **(extra or {})})

    def err(self, code, msg): self.jsend(code, {'ok': False, 'error': msg})

    def host_ok(self):
        if self.server.allow_any_host: return True
        h = (self.headers.get('Host') or '').strip().lower()
        h = h[1:h.index(']')] if h.startswith('[') and ']' in h else h.rsplit(':', 1)[0]
        return h in ('localhost', '127.0.0.1', '::1')

    def origin_ok(self):
        o = self.headers.get('Origin')
        if not o: return True
        return urlsplit(o).netloc == self.headers.get('Host')

    def read_body(self, limit):
        try: n = int(self.headers.get('Content-Length', ''))
        except ValueError: return None, (411, 'Longueur de la requête manquante.')
        if n < 0 or n > limit:
            return None, (413, f'Fichier trop volumineux (maximum {max(limit // 1024 // 1024, 1)} Mo).')
        self._consumed = True
        return self.rfile.read(n), None

    def read_json(self, limit=MAX_JSON):
        b, e = self.read_body(limit)
        if e: self.err(*e); return None
        try: return json.loads(b.decode('utf-8'))
        except Exception: self.err(400, 'JSON invalide.'); return None

    # --- routage
    def do_HEAD(self): self.route()
    def do_GET(self): self.route()
    def do_POST(self): self.route()
    def do_PUT(self): self.route()
    def do_DELETE(self): self.route()
    def do_OPTIONS(self): self.send_bytes(405, 'Méthode non autorisée')

    def route(self):
        try:
            if not self.host_ok(): return self.send_bytes(421, 'Hôte non autorisé.')
            u = urlsplit(self.path); path = unquote(u.path)
            if '\x00' in path or '\\' in path: return self.send_bytes(400, 'Chemin invalide.')
            if path.startswith('/admin/api/'): return self.api(path[len('/admin/api/'):], u)
            if self.command not in ('GET', 'HEAD'): return self.send_bytes(405, 'Méthode non autorisée', extra={'Allow': 'GET, HEAD'})
            if path == '/admin': return self.send_bytes(301, '', extra={'Location': '/admin/'})
            if path.startswith('/admin/'): return self.static(ADMIN, path[len('/admin/'):] or 'index.html', admin=True)
            if path == '/_preview' or path.startswith('/_preview/'): return self.preview(path[len('/_preview'):].lstrip('/'))
            return self.static(SITE, path.lstrip('/'))
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as e:  # ne jamais divulguer de trace
            sys.stderr.write(f'Erreur interne: {e!r}\n')
            try: self.send_bytes(500, 'Erreur interne du serveur.')
            except Exception: pass

    # --- fichiers statiques (sans sortir du dossier)
    def safe_path(self, base, rel):
        rel = rel.strip('/')
        parts = [p for p in rel.split('/') if p not in ('', '.')]
        if any(p == '..' or p.startswith('.') or p.endswith('.tmp') for p in parts): return None
        p = os.path.realpath(os.path.join(base, *parts)) if parts else os.path.realpath(base)
        b = os.path.realpath(base)
        if p != b and not p.startswith(b + os.sep): return None
        if os.path.isdir(p): p = os.path.join(p, 'index.html')
        return p if os.path.isfile(p) else None

    def static(self, base, rel, admin=False):
        p = self.safe_path(base, rel)
        if not p: return self.send_bytes(404, 'Page introuvable.' if not rel.endswith('.html') else '404')
        ext = os.path.splitext(p)[1].lower()
        ct = mimetypes.guess_type(p)[0] or 'application/octet-stream'
        if ct.startswith('text/') or ext in ('.js', '.svg', '.json', '.xml'): ct += '; charset=utf-8' if 'charset' not in ct else ''
        with open(p, 'rb') as f: data = f.read()
        hdr = {'X-Content-Type-Options': 'nosniff'}
        if admin:
            hdr.update({'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
                        'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"})
        else:
            hdr['Cache-Control'] = 'public, max-age=31536000, immutable' if rel.startswith('assets/') else 'no-cache'
            hdr['Accept-Ranges'] = 'bytes'
            if rel.startswith('_'): pass
        rng = self.headers.get('Range'); m = re.match(r'bytes=(\d*)-(\d*)$', rng or '')
        if m and (m.group(1) or m.group(2)) and not admin:
            if m.group(1): a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else len(data) - 1
            else: a = max(0, len(data) - int(m.group(2))); b = len(data) - 1
            b = min(b, len(data) - 1)
            if a > b: return self.send_bytes(416, '', extra={'Content-Range': f'bytes */{len(data)}'})
            return self.send_bytes(206, data[a:b + 1], ct, {**hdr, 'Content-Range': f'bytes {a}-{b}/{len(data)}'})
        if ext in TEXT_EXT and 'gzip' in (self.headers.get('Accept-Encoding') or ''):
            data = gzip.compress(data, 6); hdr['Content-Encoding'] = 'gzip'; hdr['Vary'] = 'Accept-Encoding'
        self.send_bytes(200, data, ct, hdr)

    def preview(self, rel):
        sid, s = self.session()
        if not sid: return self.send_bytes(401, 'Connexion requise.')
        if rel == '' or rel == 'index.html':
            with LOCK:
                htm = s.get('preview')
                if not htm: htm = render.render_html(render.normalize(read_content()))
            return self.send_bytes(200, htm, 'text/html; charset=utf-8', {'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN'})
        return self.static(SITE, rel)

    # --- API
    def api(self, name, u):
        if self.command in ('POST', 'PUT', 'DELETE'):
            if not self.origin_ok(): return self.err(403, 'Origine refusée.')
            if self.headers.get('X-Requested-With') != 'whoopy-admin': return self.err(403, 'En-tête de sécurité manquant.')
        if name == 'login' and self.command == 'POST': return self.login()
        if name == 'session' and self.command == 'GET':
            sid, s = self.session()
            return self.jsend(200, {'auth': bool(sid), 'must_change': bool(sid and load_auth().get('must_change'))})
        sid, s = self.session()
        if not sid: return self.err(401, 'Session expirée. Reconnectez-vous.')
        s['exp'] = time.time() + SESSION_TTL
        if name == 'logout' and self.command == 'POST':
            SESSIONS.pop(sid, None)
            return self.jsend(200, {'ok': True}, {'Set-Cookie': 'wb_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})
        if name == 'content' and self.command == 'GET':
            with LOCK: return self.jsend(200, {'ok': True, 'content': read_content()})
        if name == 'content' and self.command == 'PUT':
            raw = self.read_json()
            if raw is None: return
            try: save_content(raw)
            except render.ContentError as e: return self.err(422, str(e))
            except OSError as e: return self.err(500, f'Écriture impossible : {e.strerror}')
            print(f'[{time.strftime("%H:%M:%S")}] contenu enregistré par {self.ip()}', flush=True)
            return self.jsend(200, {'ok': True, 'saved_at': time.strftime('%H:%M:%S'), 'content': read_content()})
        if name == 'preview' and self.command == 'POST':
            raw = self.read_json()
            if raw is None: return
            try: htm = render.render_html(render.normalize(raw))
            except render.ContentError as e: return self.err(422, str(e))
            s['preview'] = htm
            return self.jsend(200, {'ok': True, 'url': f'/_preview/?t={int(time.time() * 1000)}'})
        if name == 'upload' and self.command == 'POST': return self.upload(u)
        if name == 'password' and self.command == 'POST': return self.password(sid)
        if name == 'backups' and self.command == 'GET':
            L = sorted(os.listdir(BACKUPS), reverse=True) if os.path.isdir(BACKUPS) else []
            return self.jsend(200, {'ok': True, 'backups': [{'name': n, 'label': datetime.datetime.strptime(n[8:23], '%Y%m%d-%H%M%S').strftime('%d/%m/%Y %H:%M:%S')} for n in L if re.match(r'^content-\d{8}-\d{6}\.json$', n)]})
        if name == 'restore' and self.command == 'POST':
            body = self.read_json(); n = (body or {}).get('name', '')
            if not re.match(r'^content-\d{8}-\d{6}\.json$', n or ''): return self.err(400, 'Sauvegarde invalide.')
            p = os.path.join(BACKUPS, n)
            if not os.path.isfile(p): return self.err(404, 'Sauvegarde introuvable.')
            try:
                with open(p, encoding='utf-8') as f: c = save_content(json.load(f))
            except render.ContentError as e: return self.err(422, str(e))
            return self.jsend(200, {'ok': True, 'content': c})
        return self.err(404, 'Service inconnu.')

    def login(self):
        ip = self.ip(); n, until = FAILS.get(ip, (0, 0))
        if until > time.time(): return self.err(429, f'Trop d’essais. Réessayez dans {int(until - time.time()) + 1} secondes.')
        body = self.read_json(4096)
        if body is None: return
        pw = body.get('password') if isinstance(body, dict) else None
        if isinstance(pw, str) and check_pw(pw, load_auth()['hash']):
            FAILS.pop(ip, None)
            sid = secrets.token_urlsafe(32); SESSIONS[sid] = {'exp': time.time() + SESSION_TTL}
            for k in [k for k, v in SESSIONS.items() if v['exp'] < time.time()]: SESSIONS.pop(k, None)
            print(f'[{time.strftime("%H:%M:%S")}] connexion réussie ({ip})', flush=True)
            return self.jsend(200, {'ok': True, 'must_change': bool(load_auth().get('must_change'))},
                              {'Set-Cookie': f'wb_sid={sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL}'})
        n += 1; FAILS[ip] = (n, time.time() + (min(2 ** (n - 4) * 15, 900) if n >= 5 else 0))
        print(f'[{time.strftime("%H:%M:%S")}] échec de connexion ({ip})', flush=True)
        time.sleep(0.6)
        return self.err(401, 'Mot de passe incorrect.')

    def password(self, sid):
        b = self.read_json(4096)
        if b is None: return
        old, new = b.get('old'), b.get('new')
        if not (isinstance(old, str) and isinstance(new, str)): return self.err(400, 'Données invalides.')
        a = load_auth()
        if not check_pw(old, a['hash']): return self.err(403, 'Ancien mot de passe incorrect.')
        if len(new) < 8: return self.err(422, 'Le nouveau mot de passe doit contenir au moins 8 caractères.')
        if new == DEFAULT_PASSWORD: return self.err(422, 'Choisissez un mot de passe différent de celui par défaut.')
        save_auth({'hash': hash_pw(new), 'must_change': False})
        for k in [k for k in SESSIONS if k != sid]: SESSIONS.pop(k, None)
        return self.jsend(200, {'ok': True})

    def upload(self, u):
        q = parse_qs(u.query)
        g = lambda k: (q.get(k) or [''])[0]
        slot, sset, w, ext = g('slot'), g('set'), g('w'), g('ext').lower()
        if not re.match(r'^[a-z0-9_]{1,20}$', slot) or slot not in render.load_defaults()['photos']: return self.err(400, 'Emplacement de photo inconnu.')
        if not re.match(r'^[a-z0-9]{6,16}$', sset): return self.err(400, 'Identifiant d’envoi invalide.')
        if not w.isdigit() or not 200 <= int(w) <= 3000: return self.err(400, 'Largeur invalide.')
        if ext not in MAGIC: return self.err(415, 'Format refusé : seuls JPG, PNG et WebP sont acceptés.')
        data, e = self.read_body(MAX_UPLOAD)
        if e: return self.err(*e)
        if not data or not MAGIC[ext](data[:16]): return self.err(415, 'Ce fichier n’est pas une image ' + ext.upper() + ' valide.')
        base = f'up-{slot}-{sset}'
        with LOCK:
            if len([f for f in os.listdir(IMG) if f.startswith('up-')]) > 400: return self.err(507, 'Trop de photos téléversées : enregistrez d’abord, ou videz assets/img/up-*.')
            tmp = os.path.join(IMG, f'{base}-{int(w)}.{ext}.tmp')
            with open(tmp, 'wb') as f: f.write(data)
            os.replace(tmp, os.path.join(IMG, f'{base}-{int(w)}.{ext}'))
        return self.jsend(200, {'ok': True, 'base': base, 'w': int(w), 'ext': ext, 'bytes': len(data)})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True; allow_reuse_address = True; allow_any_host = False


def main():
    ap = argparse.ArgumentParser(description='Serveur local Whoopy Burger + tableau de bord /admin/')
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8780)))
    ap.add_argument('--host', default='127.0.0.1', help='127.0.0.1 (défaut, ce PC seulement) ou 0.0.0.0 (réseau local)')
    ap.add_argument('--set-password', action='store_true', help='change le mot de passe puis quitte')
    ap.add_argument('--reset-password', action='store_true', help=f'remet le mot de passe par défaut ({DEFAULT_PASSWORD}) puis quitte')
    a = ap.parse_args()
    if a.reset_password:
        save_auth({'hash': hash_pw(DEFAULT_PASSWORD), 'must_change': True}); print('Mot de passe remis à la valeur par défaut :', DEFAULT_PASSWORD); return
    if a.set_password:
        p1 = getpass.getpass('Nouveau mot de passe (8 caractères minimum) : '); p2 = getpass.getpass('Confirmez : ')
        if p1 != p2 or len(p1) < 8 or p1 == DEFAULT_PASSWORD: sys.exit('Refusé : mots de passe différents, trop courts (<8) ou identiques au mot de passe par défaut.')
        save_auth({'hash': hash_pw(p1), 'must_change': False}); print('Mot de passe modifié.'); return
    auth = load_auth()
    if not os.path.isfile(CONTENT): sys.exit('content.json introuvable.')
    try: render.normalize(read_content())
    except render.ContentError as e: sys.exit(f'content.json invalide : {e}')
    srv = Server((a.host, a.port), Handler)
    srv.allow_any_host = a.host not in ('127.0.0.1', 'localhost', '::1')
    shown = '127.0.0.1' if a.host in ('0.0.0.0', '') else a.host
    print(f'\n  Whoopy Burger — serveur local démarré\n  Site      : http://{shown}:{a.port}/\n  Admin     : http://{shown}:{a.port}/admin/')
    if auth.get('must_change'): print(f'  Mot de passe par défaut : {DEFAULT_PASSWORD}   (à changer dès la première connexion !)')
    if srv.allow_any_host: print('  ⚠ Accessible depuis le réseau local en HTTP non chiffré : n’utilisez que sur un Wi-Fi de confiance.')
    print('  Ctrl+C pour arrêter.\n', flush=True)
    try: srv.serve_forever()
    except KeyboardInterrupt: print('\nArrêt.')


if __name__ == '__main__':
    main()
