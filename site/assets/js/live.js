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
    (m.burgers || []).forEach(function (x) { MENU.push({ name: x.name, desc: x.desc || '', price: parseInt(x.price, 10) || 0, cat: 'Burgers' }); });
    (m.supplements || []).forEach(function (x) { MENU.push({ name: x.name, desc: x.desc || '', price: parseInt(x.price, 10) || 0, cat: 'Suppléments' }); });
    phoneDisplay = (c && c.contact && c.contact.phone_display) || phoneDisplay;
    phoneIntl = (c && c.contact && c.contact.phone_intl) || phoneIntl;
    renderForm();
    if (!CONFIGURED) msg('Commande en ligne non configurée pour le moment' + (phoneDisplay ? ' : appelez le ' + phoneDisplay : '') + '.', 'warn');
  }
  function menuFromPage() {   // dernier recours : on lit la carte affichée dans la page
    var out = { menu: { burgers: [], supplements: [] } };
    [['#pn-b', 'burgers'], ['#pn-s', 'supplements']].forEach(function (a) {
      document.querySelectorAll(a[0] + ' .mi').forEach(function (e) {
        var h = e.querySelector('h3'), p = e.querySelector('.price'), d = e.querySelector('p');
        if (h && p) out.menu[a[1]].push({ name: h.textContent.trim(), desc: d ? d.textContent.trim() : '', price: parseInt(p.textContent, 10) || 0 });
      });
    });
    return out;
  }
  /* Icônes SVG générées à partir du nom + description (nouveaux produits CMS inclus) */
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe'); }
  function has(t, re) { return re.test(t); }
  var BUN = '#f2a33a', BUN_D = '#c9761c', K = '#0d0a09';
  function burgerSVG(t) {
    var L = [];   // couches de bas en haut : [hauteur, fonction(y) -> svg]
    var dbl = has(t, /double (viande|steak)|\bdouble\b.*(veau|boeuf)/);
    function patty(c, crisp) { return [7, function (y) { return '<rect x="9" y="' + y + '" width="46" height="7" rx="3.5" fill="' + c + '" stroke="' + K + '" stroke-width="1.5"/>' + (crisp ? '<path d="M14 ' + (y + 2) + 'h3M24 ' + (y + 4) + 'h3M34 ' + (y + 2) + 'h3M44 ' + (y + 4) + 'h3" stroke="#fff3" stroke-width="1.6" stroke-linecap="round"/>' : ''); }]; }
    function cheese(c) { return [3, function (y) { return '<path d="M8 ' + y + 'h48v3H40l-4 5-4-5H8z" fill="' + c + '" stroke="' + K + '" stroke-width="1.2" stroke-linejoin="round"/>'; }]; }
    function sauce(c, dots) { return [3, function (y) { return '<path d="M9 ' + (y + 1.5) + 'q4-3 8 0t8 0 8 0 8 0 8 0 6 0" fill="none" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>' + (dots ? '<circle cx="20" cy="' + (y + 1.5) + '" r="1.3" fill="#3b6fd8"/><circle cx="38" cy="' + (y + 1.5) + '" r="1.3" fill="#3b6fd8"/>' : ''); }]; }
    if (has(t, /poisson|fish/)) L.push([7, function (y) { return '<path d="M12 ' + (y + 3.5) + 'q14-8 32 0q-18 8-32 0z" fill="#f0c070" stroke="' + K + '" stroke-width="1.5"/><path d="M44 ' + (y + 3.5) + 'l9-4v8z" fill="#f0c070" stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round"/><circle cx="18" cy="' + (y + 2.5) + '" r="1" fill="' + K + '"/>'; }]);
    else if (has(t, /thon|tuna|ocean/)) L.push([7, function (y) { return '<rect x="9" y="' + y + '" width="46" height="7" rx="3.5" fill="#e98f8a" stroke="' + K + '" stroke-width="1.5"/><path d="M15 ' + (y + 3) + 'l4 2M27 ' + (y + 2) + 'l4 2M39 ' + (y + 3) + 'l4 2" stroke="#fff8" stroke-width="1.5" stroke-linecap="round"/>'; }]);
    else if (has(t, /poulet|chicken/)) L.push(has(t, /pane|crisp|tender/) ? patty('#e9a63a', true) : patty('#e8c48e'));
    else L.push(patty('#7a3b1e'));
    if (dbl) { L.push(cheese('#ffc22e')); L.push(patty('#7a3b1e')); }
    if (has(t, /mozzarella/)) L.push([4, function (y) { return '<rect x="13" y="' + y + '" width="38" height="4" rx="2" fill="#fff1c9" stroke="#e9a63a" stroke-width="1.5"/>'; }]);
    if (has(t, /camembert/)) L.push(cheese('#fff6e0'));
    if (has(t, /gouda|cheddar|slice|fromage|cheese/) && !has(t, /^blue|roquefort/) || has(t, /gouda/)) L.push(cheese('#ffc22e'));
    if (has(t, /oeuf|egg/)) L.push([5, function (y) { return '<ellipse cx="32" cy="' + (y + 2.5) + '" rx="20" ry="2.8" fill="#fff" stroke="' + K + '" stroke-width="1.2"/><circle cx="36" cy="' + (y + 2.3) + '" r="2.4" fill="#ffb300"/>'; }]);
    if (has(t, /oignon|onion/)) L.push([3, function (y) { return '<path d="M12 ' + (y + 1.5) + 'h40" stroke="#9b4dca" stroke-width="2.6" stroke-dasharray="6 3" stroke-linecap="round"/>'; }]);
    if (has(t, /champignon|mushroom/)) L.push([5, function (y) { return [16, 30, 44].map(function (x) { return '<path d="M' + (x - 5) + ' ' + (y + 4) + 'q5-7 10 0z" fill="#b98a5e" stroke="' + K + '" stroke-width="1.1"/>'; }).join(''); }]);
    if (has(t, /roquefort|blue/)) L.push(sauce('#e9eef7', true));
    if (has(t, /tartare/)) L.push(sauce('#f4f0dc'));
    if (has(t, /monster/)) L.push(sauce('#e0161e'));
    var y = 50, body = '';
    L.forEach(function (l) { y -= l[0]; body += '<g class="ly">' + l[1](y) + '</g>'; });
    var top = y - 1, extra = '';
    var bunTop = '<g class="top"><path d="M8 ' + top + 'c0-13 10-' + 14 + ' 24-14s24 1 24 14z" fill="' + BUN + '" stroke="' + K + '" stroke-width="1.8"/>' +
      '<path d="M22 ' + (top - 8) + 'l2 -1M31 ' + (top - 10) + 'l2 0M40 ' + (top - 8) + 'l2 1" stroke="#fff3df" stroke-width="1.8" stroke-linecap="round"/>';
    if (has(t, /monster/)) bunTop += '<circle cx="25" cy="' + (top - 6) + '" r="3.2" fill="#fff" stroke="' + K + '"/><circle cx="39" cy="' + (top - 6) + '" r="3.2" fill="#fff" stroke="' + K + '"/><circle cx="26" cy="' + (top - 5.5) + '" r="1.4" fill="' + K + '"/><circle cx="38" cy="' + (top - 5.5) + '" r="1.4" fill="' + K + '"/>';
    bunTop += '</g>';
    if (has(t, /miel|honey/)) extra += '<path class="fx" d="M50 ' + (top - 2) + 'q4 6 0 8q-4-2 0-8z" fill="#ffb300" stroke="' + K + '" stroke-width="1"/>';
    if (has(t, /epice|spicy|piquant/)) extra += '<g class="fx"><path d="M50 10q8 2 6 12q-1 3-3 1q1-7-4-10z" fill="#e0161e" stroke="' + K + '" stroke-width="1.2"/><path d="M50 10l-2-3" stroke="#3a9b3a" stroke-width="2" stroke-linecap="round"/></g>';
    if (has(t, /thon|tuna|ocean/)) extra += '<path class="fx" d="M4 60q4-3 8 0t8 0" fill="none" stroke="#4aa3e0" stroke-width="2" stroke-linecap="round"/>';
    if (has(t, /forest/)) extra += '<path class="fx" d="M54 8l-5 8h10z" fill="#3a9b3a" stroke="' + K + '" stroke-width="1"/>';
    return '<path d="M9 50h46q0 8-8 8H17q-8 0-8-8z" fill="' + BUN_D + '" stroke="' + K + '" stroke-width="1.8"/>' + body + bunTop + extra;
  }
  function sideSVG(t) {
    if (has(t, /frite|fries/)) return '<g class="top"><path d="M22 14v20M28 10v24M34 12v22M40 9v25M46 14v20" stroke="#ffd35a" stroke-width="4" stroke-linecap="round"/></g><path d="M16 26h34l-4 32H20z" fill="#e0161e" stroke="' + K + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M25 40q8 6 16 0" stroke="#fff" stroke-width="2" fill="none"/>';
    if (has(t, /oeuf|egg/)) return '<g class="top"><path d="M10 34c0-12 10-16 18-12s14-8 22 0 8 20-6 24-30 6-34-12z" fill="#fff" stroke="' + K + '" stroke-width="1.8"/><circle cx="32" cy="36" r="8" fill="#ffb300" stroke="' + K + '" stroke-width="1.4"/></g>';
    if (has(t, /mozzarella|stick/)) return '<g class="top"><rect x="12" y="24" width="40" height="14" rx="7" fill="#e9a63a" stroke="' + K + '" stroke-width="1.8" transform="rotate(-20 32 31)"/><path d="M44 22q4 8 2 14" stroke="#fff6e0" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
    if (has(t, /camembert|fromage|cheese|cheddar/)) return '<g class="top"><path d="M10 44l40-22 4 22z" fill="#fff6e0" stroke="' + K + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 44h44v8H10z" fill="#f3e3b8" stroke="' + K + '" stroke-width="1.8"/></g>';
    if (has(t, /nugget|tender/)) return '<g class="top"><path d="M14 30q2-12 14-10t12 10-10 12-16-12z" fill="#e9a63a" stroke="' + K + '" stroke-width="1.8"/><path d="M32 44q2-10 12-9t10 9-9 10-13-10z" fill="#e9a63a" stroke="' + K + '" stroke-width="1.8"/></g>';
    if (has(t, /steak|viande|patty/)) return '<g class="top"><ellipse cx="32" cy="36" rx="22" ry="10" fill="#7a3b1e" stroke="' + K + '" stroke-width="1.8"/><path d="M20 34l4 2M30 32l4 2M40 35l4 2" stroke="#fff4" stroke-width="2" stroke-linecap="round"/></g>';
    if (has(t, /boisson|soda|coca|jus|eau|drink|limonade|the\b|cafe/)) return '<g class="top"><path d="M36 6l-4 12" stroke="#e0161e" stroke-width="3" stroke-linecap="round"/></g><path d="M18 18h28l-4 40H22z" fill="#4aa3e0" stroke="' + K + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M19 28h26" stroke="#fff" stroke-width="3"/>';
    if (has(t, /dessert|glace|tiramisu|gateau|cookie|brownie|cheesecake|crepe|sundae/)) return '<g class="top"><circle cx="32" cy="24" r="12" fill="#ffd1dc" stroke="' + K + '" stroke-width="1.8"/><circle cx="36" cy="14" r="3" fill="#e0161e"/></g><path d="M21 30h22L32 58z" fill="#e9a63a" stroke="' + K + '" stroke-width="1.8" stroke-linejoin="round"/>';
    if (has(t, /sauce|mayo|ketchup/)) return '<g class="top"><path d="M20 22q12-10 24 0" fill="#e0161e" stroke="' + K + '" stroke-width="1.8"/></g><path d="M16 24h32l-4 28H20z" fill="#fff3df" stroke="' + K + '" stroke-width="1.8"/>';
    return '<g class="top"><path d="M32 10l6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2z" fill="#ffc22e" stroke="' + K + '" stroke-width="1.8" stroke-linejoin="round"/></g>';
  }
  function icon(x) {
    var t = norm(x.name + ' ' + (x.desc || ''));
    var isBurger = x.cat === 'Burgers' && !has(norm(x.name), /frite|boisson|dessert/);
    return '<svg class="ic-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + (isBurger ? burgerSVG(t) : sideSVG(t)) + '</svg>';
  }

  var QTY = [];
  function count() { return QTY.reduce(function (a, b) { return a + b; }, 0); }
  function total() { var t = 0; QTY.forEach(function (q, i) { t += q * MENU[i].price; }); return t; }
  function updTotal() {
    var n = count(), t = total() + ' DA';
    var e = $('#cmd-total'); if (e) e.textContent = t;
    var bar = $('#cmd-bar');
    if (bar) { bar.hidden = !n; $('#cmd-bar-n').textContent = n; $('#cmd-bar-l').textContent = n + ' article' + (n > 1 ? 's' : ''); $('#cmd-bar-t').textContent = t; }
    document.querySelectorAll('#cmd-items .cmd-card').forEach(function (c) {
      var i = +c.getAttribute('data-i'), q = QTY[i] || 0, b = c.querySelector('.cmd-badge');
      b.textContent = q; c.classList.toggle('on', q > 0);
      c.setAttribute('aria-label', 'Ajouter un ' + MENU[i].name + ', ' + MENU[i].price + ' dinars' + (q ? ' — ' + q + ' dans le panier' : ''));
    });
    renderRecap();
  }
  function renderRecap() {
    var box = $('#cmd-recap'); if (!box) return;
    var html = '';
    QTY.forEach(function (q, i) {
      if (!q) return;
      var x = MENU[i];
      html += '<li class="cmd-line" data-i="' + i + '"><span class="cmd-ic sm">' + icon(x) + '</span>' +
        '<span class="cmd-ln"><b>' + esc(x.name) + '</b><small>' + x.price + ' DA × ' + q + ' = ' + (x.price * q) + ' DA</small></span>' +
        '<span class="cmd-q"><button type="button" data-d="-1" aria-label="Retirer un ' + esc(x.name) + '">−</button><output aria-live="polite">' + q + '</output>' +
        '<button type="button" data-d="1" aria-label="Ajouter un ' + esc(x.name) + '">+</button></span>' +
        '<button type="button" class="cmd-del" data-del aria-label="Supprimer ' + esc(x.name) + ' de la commande">✕</button></li>';
    });
    box.innerHTML = html || '<li class="cmd-empty">Votre panier est vide : touchez un burger pour l’ajouter.</li>';
  }
  function renderForm() {
    var box = $('#cmd-items'); if (!box) return;
    QTY = MENU.map(function () { return 0; });
    var cat = '', html = '';
    MENU.forEach(function (x, i) {
      if (x.cat !== cat) { if (cat) html += '</div>'; cat = x.cat; html += '<p class="cmd-cat">' + esc(cat) + '</p><div class="cmd-cards">'; }
      html += '<button type="button" class="cmd-card" data-i="' + i + '"><span class="cmd-ic">' + icon(x) + '</span>' +
        '<span class="cmd-cn">' + esc(x.name) + '</span><span class="cmd-cp">' + x.price + ' DA</span>' +
        '<span class="cmd-badge" aria-hidden="true">0</span></button>';
    });
    if (cat) html += '</div><p class="cmd-hint">Touchez un produit pour l’ajouter : 2 touches = 2 burgers.</p>';
    box.innerHTML = html || '<p class="cmd-msg">La carte n’est pas disponible pour le moment.</p>';
    updTotal();
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
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
  function openSheet(on) {
    var s = $('#cmd-sheet'), bk = $('#cmd-backdrop'); if (!s) return;
    s.classList.toggle('open', on); bk.hidden = !on; document.documentElement.classList.toggle('cmd-lock', on);
    s.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) { var c = s.querySelector('.cmd-close'); try { c.focus({ preventScroll: true }); } catch (e) {} }
    else { var b = $('#cmd-bar-btn'); if (b && !$('#cmd-bar').hidden) try { b.focus({ preventScroll: true }); } catch (e) {} }
  }
  function initForm() {
    var f = $('#cmd-form'); if (!f) return;
    if (!CONFIGURED) {
      f.querySelector('fieldset').disabled = true;
      msg('Commande en ligne non configurée pour le moment' + (phoneDisplay ? ' : appelez le ' + phoneDisplay : '') + '.', 'warn');
    }
    f.addEventListener('click', function (e) {
      var c = e.target.closest('.cmd-card');
      if (c) {
        var i = +c.getAttribute('data-i');
        if (QTY[i] >= 20) { buzz([30, 40, 30]); return; }
        QTY[i]++; updTotal(); buzz(12);
        replay(c, 'bump'); replay($('#cmd-bar'), 'bump');
        var fly = document.createElement('span'); fly.className = 'cmd-fly'; fly.textContent = '+1'; c.appendChild(fly);
        setTimeout(function () { fly.remove(); }, 700);
        return;
      }
      if (e.target.closest('#cmd-bar-btn')) return openSheet(true);
      if (e.target.closest('.cmd-close')) return openSheet(false);
      var line = e.target.closest('.cmd-line'); if (!line) return;
      var k = +line.getAttribute('data-i'), b = e.target.closest('button[data-d]');
      if (b) { QTY[k] = Math.max(0, Math.min(20, QTY[k] + +b.getAttribute('data-d'))); buzz(8); }
      else if (e.target.closest('[data-del]')) { QTY[k] = 0; buzz(15); }
      else return;
      updTotal();
      if (!count()) openSheet(false);
    });
    $('#cmd-backdrop').addEventListener('click', function () { openSheet(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#cmd-sheet').classList.contains('open')) openSheet(false); });
    f.addEventListener('change', function (e) {
      if (e.target.name === 'mode') { var liv = f.mode.value === 'livraison'; $('#cmd-addr').hidden = !liv; f.address.required = liv; }
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!CONFIGURED) return;
      var items = [];
      QTY.forEach(function (q, i) { if (q > 0) items.push({ name: MENU[i].name, qty: Math.min(q, 20) }); });
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
        f.reset(); $('#cmd-addr').hidden = true; QTY = QTY.map(function () { return 0; }); openSheet(false); updTotal();
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
