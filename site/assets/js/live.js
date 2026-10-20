/* Whoopy Burger — contenu en direct depuis Supabase + formulaire de commande.
   Sans dépendance. Si Supabase n'est pas configuré ou ne répond pas, le site
   garde le contenu intégré à la page (rien ne casse). */
(function () {
  'use strict';
  var CFG = window.WHOOPY_CONFIG || {};
  var URL_ = String(CFG.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  var KEY = String(CFG.SUPABASE_ANON_KEY || '').trim();
  var CONFIGURED = /^https:\/\/.+/.test(URL_) && KEY.length > 20;
  var STORAGE = URL_ + '/storage/v1/object/public/images/';
  var COLORS = { rose: 'v', jaune: 'p', bleu: 'f' };
  var SLOTS = ['about_1', 'about_2', 'band', 'menu_1', 'menu_2', 'menu_3', 'gal_1', 'gal_2', 'gal_3', 'gal_4', 'gal_5'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rest(path, opt) {
    opt = opt || {};
    var hd = { apikey: KEY, Authorization: 'Bearer ' + KEY };
    for (var k in (opt.headers || {})) hd[k] = opt.headers[k];
    return fetch(URL_ + '/rest/v1/' + path, { method: opt.method || 'GET', headers: hd, body: opt.body });
  }

  /* ---------- 1. affichage du contenu ---------- */
  function mi(x, i, burger) {
    var p = parseInt(x.price, 10) || 0;
    return '<article class="mi' + (burger && x.hot ? ' hot' : '') + ' in" data-r style="--d:' + ((i % 3) * 0.08) + 's">' +
      '<span class="price" aria-label="' + p + ' dinars">' + p + '<small>DA</small></span>' +
      (burger && x.tag ? '<span class="tag ' + (COLORS[x.color] || 'p') + '">' + esc(x.tag) + '</span>' : '') +
      '<h3>' + esc(x.name) + '</h3>' + (x.desc ? '<p>' + esc(x.desc) + '</p>' : '') + '</article>';
  }
  function fmtH(h) { var a = h.split(':'); return ('0' + parseInt(a[0], 10)).slice(-2) + 'h' + a[1]; }
  function mins(h) { var a = h.split(':'); return +a[0] * 60 + +a[1]; }
  function photoHTML(p) {
    if (!p || !p.widths || !p.widths.length) return null;
    var up = /^up-/.test(p.base), pre = up ? STORAGE : 'assets/img/';
    var ws = p.widths, mid = ws[Math.floor(ws.length / 2)], big = ws[ws.length - 1];
    var hh = p.w ? Math.round(big * p.h / p.w) : p.h;
    var mime = p.ext === 'webp' ? 'image/webp' : (p.ext === 'jpg' ? 'image/jpeg' : 'image/png');
    var src = function (ext) { return ws.map(function (x) { return pre + p.base + '-' + x + '.' + ext + ' ' + x + 'w'; }).join(', '); };
    var sz = esc(p.sizes || '100vw'), s = '';
    if (p.avif && !up) s += '<source type="image/avif" srcset="' + src('avif') + '" sizes="' + sz + '">';
    s += '<source type="' + mime + '" srcset="' + src(p.ext) + '" sizes="' + sz + '">';
    return s + '<img src="' + pre + p.base + '-' + mid + '.' + p.ext + '" width="' + big + '" height="' + hh + '" alt="' + esc(p.alt) + '" loading="lazy" decoding="async">';
  }
  function apply(c) {
    var m = c.menu || {};
    var pb = $('#pn-b .mgrid'), ps = $('#pn-s .mgrid');
    if (pb && Array.isArray(m.burgers)) pb.innerHTML = m.burgers.map(function (x, i) { return mi(x, i, true); }).join('');
    if (ps && Array.isArray(m.supplements)) ps.innerHTML = m.supplements.map(function (x, i) { return mi(x, i, false); }).join('');
    var nb = (m.burgers || []).length, ns = (m.supplements || []).length;
    var tb = $('#tab-b small'), ts = $('#tab-s small');
    if (tb && m.burgers) tb.textContent = nb + ' recette' + (nb > 1 ? 's' : '');
    if (ts && m.supplements) ts.textContent = ns + ' extra' + (ns > 1 ? 's' : '');
    var hu = $('ul.hours'), H = c.hours || {};
    if (hu && Array.isArray(H.days) && H.days.length === 7) {
      hu.innerHTML = H.days.map(function (d) {
        var r = d.ranges || [];
        var txt = r.map(function (x) { return fmtH(x[0]) + ' – ' + fmtH(x[1]); }).join(' / ') || 'Fermé';
        var o = r.map(function (x) { var a = mins(x[0]), b = mins(x[1]); if (b <= a) b += 1440; return a + '-' + b; }).join('|');
        return '<li data-o="' + o + '"><span>' + esc(d.day) + '</span><span>' + txt + '</span></li>';
      }).join('');
    }
    var pics = document.querySelectorAll('picture[data-slot]');
    Array.prototype.forEach.call(pics, function (pic) {
      var p = (c.photos || {})[pic.getAttribute('data-slot')], html = photoHTML(p);
      if (!html) return;
      var cur = pic.querySelector('img');
      if (cur && cur.getAttribute('src') === (/^up-/.test(p.base) ? STORAGE : 'assets/img/') + p.base + '-' + p.widths[Math.floor(p.widths.length / 2)] + '.' + p.ext && cur.alt === (p.alt || '')) return;
      pic.innerHTML = html;
      var fig = pic.parentElement, cap = fig && fig.querySelector('figcaption, .cap');
      if (cap && typeof p.caption === 'string') cap.textContent = p.caption;
    });
    var ig = c.contact && c.contact.instagram_url;
    if (/^https:\/\/(www\.)?instagram\.com\//.test(ig || '')) document.querySelectorAll('a.btn-ig').forEach(function (a) { a.href = ig; });
    document.documentElement.setAttribute('data-contenu', 'direct');
  }

  /* ---------- 2. formulaire de commande ---------- */
  var MENU = [], phoneDisplay = '', phoneIntl = '';
  (function () {   // valeur intégrée à la page (remplacée ensuite par le CMS)
    var a = document.querySelector('a[href^="tel:"]');
    if (a) { phoneIntl = a.getAttribute('href').slice(4); phoneDisplay = a.textContent.replace(/[^0-9+ ]/g, '').trim() || phoneDisplay; }
  })();
  function setMenu(c) {
    MENU = [];
    var m = (c && c.menu) || {};
    (m.burgers || []).forEach(function (x) { MENU.push({ name: x.name, price: parseInt(x.price, 10) || 0, cat: 'Burgers' }); });
    (m.supplements || []).forEach(function (x) { MENU.push({ name: x.name, price: parseInt(x.price, 10) || 0, cat: 'Suppléments' }); });
    phoneDisplay = (c && c.contact && c.contact.phone_display) || phoneDisplay;
    phoneIntl = (c && c.contact && c.contact.phone_intl) || phoneIntl;
    renderForm();
    if (!CONFIGURED) msg('Commande en ligne non configurée pour le moment' + (phoneDisplay ? ' : appelez le ' + phoneDisplay : '') + '.', 'warn');
  }
  function menuFromPage() {   // dernier recours : on lit la carte affichée dans la page
    var out = { menu: { burgers: [], supplements: [] } };
    [['#pn-b', 'burgers'], ['#pn-s', 'supplements']].forEach(function (a) {
      document.querySelectorAll(a[0] + ' .mi').forEach(function (e) {
        var h = e.querySelector('h3'), p = e.querySelector('.price');
        if (h && p) out.menu[a[1]].push({ name: h.textContent.trim(), price: parseInt(p.textContent, 10) || 0 });
      });
    });
    return out;
  }
  function total() {
    var t = 0;
    document.querySelectorAll('#cmd-items input[data-i]').forEach(function (inp) { t += (parseInt(inp.value, 10) || 0) * MENU[+inp.getAttribute('data-i')].price; });
    return t;
  }
  function updTotal() { var e = $('#cmd-total'); if (e) e.textContent = total() + ' DA'; }
  function renderForm() {
    var box = $('#cmd-items'); if (!box) return;
    var cat = '', html = '';
    MENU.forEach(function (x, i) {
      if (x.cat !== cat) { cat = x.cat; html += '<p class="cmd-cat">' + esc(cat) + '</p>'; }
      html += '<label class="cmd-it"><span class="cmd-n">' + esc(x.name) + ' <small>' + x.price + ' DA</small></span>' +
        '<span class="cmd-q"><button type="button" data-d="-1" aria-label="Retirer un ' + esc(x.name) + '">−</button>' +
        '<input type="number" inputmode="numeric" min="0" max="20" value="0" data-i="' + i + '" aria-label="Quantité ' + esc(x.name) + '">' +
        '<button type="button" data-d="1" aria-label="Ajouter un ' + esc(x.name) + '">+</button></span></label>';
    });
    box.innerHTML = html || '<p class="cmd-msg">La carte n’est pas disponible pour le moment.</p>';
    updTotal();
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function msg(t, kind) { var e = $('#cmd-msg'); if (!e) return; e.textContent = t; e.className = 'cmd-msg ' + (kind || ''); e.hidden = !t; }
  function errText(r) {
    return r.json().then(function (j) { return (j && j.message) || ''; }, function () { return ''; }).then(function (m) {
      if (/Trop de|plusieurs commandes|Article inconnu|Quantité|carte/.test(m)) return m;
      if (/phone|check constraint|violates/.test(m)) return 'Vérifiez votre nom (2 caractères min.), votre numéro de téléphone et l’adresse si vous choisissez la livraison.';
      return 'La commande n’a pas pu être envoyée (erreur ' + r.status + '). Réessayez ou appelez le restaurant' + (phoneDisplay ? ' au ' + phoneDisplay : '') + '.';
    });
  }
  function showDone(name) {   // écran de confirmation après envoi réussi
    var f = $('#cmd-form'), d = $('#cmd-done');
    var tel = (phoneIntl || (phoneDisplay || '').replace(/[^0-9+]/g, '')).replace(/[^0-9+]/g, '');
    if (!d) { d = document.createElement('div'); d.id = 'cmd-done'; d.className = 'cmd-done'; d.setAttribute('role', 'alert'); d.tabIndex = -1; f.parentNode.insertBefore(d, f.nextSibling); }
    d.innerHTML = '<div class="cmd-done-ic" aria-hidden="true">🍔</div>' +
      '<h3 class="cmd-done-t">Commande envoyée !</h3>' +
      '<p class="cmd-done-p">Merci ' + esc(name) + ' ! <b>Appelez-nous pour la confirmer</b> : elle sera préparée dès votre appel.</p>' +
      (tel ? '<a class="btn btn-solid cmd-call" href="tel:' + esc(tel) + '">📞 Appeler pour confirmer</a>' +
        (phoneDisplay ? '<p class="cmd-done-num">' + esc(phoneDisplay) + '</p>' : '') : '') +
      '<button type="button" class="btn btn-line cmd-again">Nouvelle commande</button>';
    f.hidden = true; d.hidden = false;
    d.querySelector('.cmd-again').addEventListener('click', function () { d.hidden = true; f.hidden = false; });
    d.scrollIntoView({ behavior: 'smooth', block: 'center' }); try { d.focus({ preventScroll: true }); } catch (e) {}
  }
  function initForm() {
    var f = $('#cmd-form'); if (!f) return;
    if (!CONFIGURED) {
      f.querySelector('fieldset').disabled = true;
      msg('Commande en ligne non configurée pour le moment' + (phoneDisplay ? ' : appelez le ' + phoneDisplay : '') + '.', 'warn');
    }
    f.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b) return;
      var inp = b.parentNode.querySelector('input'); inp.value = Math.max(0, Math.min(20, (parseInt(inp.value, 10) || 0) + +b.getAttribute('data-d'))); updTotal();
    });
    f.addEventListener('input', function (e) { if (e.target.matches('input[data-i]')) updTotal(); });
    f.addEventListener('change', function (e) {
      if (e.target.name === 'mode') { var liv = f.mode.value === 'livraison'; $('#cmd-addr').hidden = !liv; f.address.required = liv; }
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!CONFIGURED) return;
      var items = [];
      f.querySelectorAll('input[data-i]').forEach(function (inp) { var q = parseInt(inp.value, 10) || 0; if (q > 0) items.push({ name: MENU[+inp.getAttribute('data-i')].name, qty: Math.min(q, 20) }); });
      if (!items.length) return msg('Choisissez au moins un article.', 'er');
      var name = f.cname.value.trim(), phone = f.phone.value.trim(), mode = f.mode.value;
      if (name.length < 2) return msg('Indiquez votre nom.', 'er');
      if (!/^\+?[0-9][0-9 .-]{7,18}[0-9]$/.test(phone)) return msg('Numéro de téléphone invalide (ex. 05xx xx xx xx).', 'er');
      if (mode === 'livraison' && f.address.value.trim().length < 5) return msg('Indiquez l’adresse de livraison.', 'er');
      if (f.website && f.website.value) return msg('Merci !', 'ok');   // piège anti-robot
      var id = uuid(), btn = f.querySelector('button[type=submit]'); btn.disabled = true; msg('Envoi en cours…', '');
      var H = { 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      rest('customers', { method: 'POST', headers: H, body: JSON.stringify({ id: id, name: name, phone: phone }) }).then(function (r) {
        if (!r.ok) return errText(r).then(function (t) { throw new Error(t); });
        return rest('orders', { method: 'POST', headers: H, body: JSON.stringify({ customer_id: id, items: items, fulfillment: mode, address: mode === 'livraison' ? f.address.value.trim() : null, notes: f.notes.value.trim() || null }) });
      }).then(function (r) {
        if (!r.ok) return errText(r).then(function (t) { throw new Error(t); });
        f.reset(); $('#cmd-addr').hidden = true; updTotal();
        msg('', '');
        showDone(name);
      }).catch(function (er) {
        msg(er && er.message && !/Failed to fetch|NetworkError/.test(er.message) ? er.message : 'Connexion impossible. Vérifiez votre Internet ou appelez le restaurant' + (phoneDisplay ? ' au ' + phoneDisplay : '') + '.', 'er');
      }).then(function () { btn.disabled = false; });
    });
  }

  /* ---------- 3. démarrage ---------- */
  function boot() {
    initForm();
    var baked = fetch('content.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return menuFromPage(); });
    if (!CONFIGURED) { baked.then(setMenu); return; }
    rest('site_content?id=eq.1&select=data').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (rows) {
      if (!rows || !rows[0] || !rows[0].data) throw new Error('vide');
      var c = rows[0].data; apply(c); setMenu(c);
    }).catch(function (e) {
      if (window.console) console.info('[Whoopy] contenu en direct indisponible (' + (e && e.message) + ') : contenu intégré conservé.');
      baked.then(setMenu);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
