/* Tableau de bord Whoopy Burger — JavaScript sans dépendance */
'use strict';
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var C = null;              // contenu en cours d'édition
  var dirty = false, mode = 'server', tab = 'carte', mustChange = false;
  var pending = new Map();   // nom de fichier → Blob (photos préparées, pour aperçu + export)
  var IMGPATH = '/assets/img/';

  /* ───────── utilitaires DOM ───────── */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(e, x); });
    else e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  }
  function toast(msg, type) {
    var t = h('div', { class: 'toast ' + (type || ''), role: type === 'er' ? 'alert' : 'status', text: msg });
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, type === 'er' ? 8000 : 3500);
  }
  function api(method, path, body, raw) {
    var o = { method: method, credentials: 'same-origin', headers: { 'X-Requested-With': 'whoopy-admin' } };
    if (body !== undefined) {
      if (raw) { o.body = body; o.headers['Content-Type'] = 'application/octet-stream'; }
      else { o.body = JSON.stringify(body); o.headers['Content-Type'] = 'application/json'; }
    }
    return fetch('/admin/api/' + path, o).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Réponse inattendue du serveur.' }; }).then(function (j) {
        if (r.status === 401 && path !== 'login') { showLogin('Votre session a expiré. Reconnectez-vous.'); }
        if (!r.ok) { var e = new Error(j.error || ('Erreur ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function get(o, p) { for (var i = 0; i < p.length; i++) o = o == null ? o : o[p[i]]; return o; }
  function put(o, p, v) { for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; }
  function markDirty() { if (!dirty) { dirty = true; updStatus(); } }
  function updStatus() {
    var s = $('#status'); if (!s) return;
    s.className = 'status' + (dirty ? ' dirty' : '');
    s.querySelector('span').textContent = dirty ? 'Modifications non enregistrées' : 'Tout est enregistré';
    var b = document.querySelectorAll('[data-save]'); b.forEach(function (x) { x.disabled = false; });
  }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ───────── champs liés au contenu ───────── */
  // F(libellé, objet, ['chemin'], {type, rows, hint, ph, options, after})
  function F(label, root, path, o) {
    o = o || {}; var v = get(root, path); var inp;
    var change = function (val) { put(root, path, val); markDirty(); if (o.after) o.after(val); };
    if (o.type === 'textarea') inp = h('textarea', { rows: o.rows || 3, maxlength: o.max, placeholder: o.ph, oninput: function (e) { change(e.target.value); } });
    else if (o.type === 'select') inp = h('select', { onchange: function (e) { var x = e.target.value; change(o.num ? +x : x); } },
      o.options.map(function (op) { return h('option', { value: op[0], selected: String(op[0]) === String(v) }, op[1]); }));
    else if (o.type === 'checkbox') {
      inp = h('input', { type: 'checkbox', checked: !!v, onchange: function (e) { change(e.target.checked); } });
      return h('label', { class: 'chk' }, inp, h('span', { text: label }));
    } else if (o.type === 'number') inp = h('input', { type: 'number', inputmode: 'numeric', min: 0, step: 1, placeholder: o.ph, oninput: function (e) { change(e.target.value === '' ? '' : Number(e.target.value)); } });
    else inp = h('input', { type: o.type || 'text', maxlength: o.max, placeholder: o.ph, inputmode: o.inputmode, oninput: function (e) { change(e.target.value); } });
    if (o.type !== 'select') inp.value = v == null ? '' : v;
    return h('label', { class: 'f' + (o.cls ? ' ' + o.cls : '') }, h('span', { text: label }), inp, o.hint ? h('small', { text: o.hint }) : null);
  }
  var RICH = 'Astuce : entourez un mot de *étoiles* pour le mettre en jaune. {tel} = votre téléphone.';

  function moveItem(list, i, d, re) { var j = i + d; if (j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; markDirty(); re(); }
  function delItem(list, i, what, re) { if (!confirm('Supprimer ' + what + ' ?\n\n(Rien n’est définitif tant que vous n’avez pas cliqué sur « Enregistrer ».)')) return; list.splice(i, 1); markDirty(); re(); }
  function acts(list, i, what, re) {
    return h('div', { class: 'acts' },
      h('button', { class: 'btn btn-line btn-ic', type: 'button', title: 'Monter', 'aria-label': 'Monter', disabled: i === 0, onclick: function () { moveItem(list, i, -1, re); }, text: '▲' }),
      h('button', { class: 'btn btn-line btn-ic', type: 'button', title: 'Descendre', 'aria-label': 'Descendre', disabled: i === list.length - 1, onclick: function () { moveItem(list, i, 1, re); }, text: '▼' }),
      h('button', { class: 'btn btn-danger btn-ic', type: 'button', title: 'Supprimer', 'aria-label': 'Supprimer ' + what, onclick: function () { delItem(list, i, what, re); }, text: '✕' }));
  }
  // liste simple de textes
  function strList(list, label, re, max) {
    var box = h('div', { class: 'grid2' });
    list.forEach(function (_, i) {
      box.appendChild(h('div', { class: 'item' }, F(label + ' ' + (i + 1), list, [i], {}), h('div', { class: 'item-h' }, h('span'), acts(list, i, label.toLowerCase(), re))));
    });
    return h('div', { style: 'display:grid;gap:.8rem' }, box,
      list.length < (max || 12) ? h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: function () { list.push(''); markDirty(); re(); } }, '＋ Ajouter') : null);
  }

  /* ───────── onglets ───────── */
  var TABS = [['carte', '🍔', 'La carte'], ['horaires', '🕐', 'Horaires'], ['infos', '📞', 'Contact'], ['textes', '✏️', 'Textes'], ['avis', '⭐', 'Avis'], ['photos', '📷', 'Photos'], ['apercu', '👁️', 'Aperçu'], ['reglages', '⚙️', 'Réglages']];
  function renderTab() {
    var y = window.scrollY, m = $('#main'); m.textContent = '';
    var fn = { carte: tCarte, horaires: tHoraires, infos: tInfos, textes: tTextes, avis: tAvis, photos: tPhotos, apercu: tApercu, reglages: tReglages }[tab];
    if (mustChange && tab !== 'reglages') m.appendChild(h('div', { class: 'note warn', style: 'margin-bottom:1.2rem' }, 'Vous utilisez encore le mot de passe par défaut. ', h('a', { href: '#reglages', onclick: function (e) { e.preventDefault(); go('reglages'); }, text: 'Le changer maintenant →' })));
    m.appendChild(fn());
    document.querySelectorAll('.side button').forEach(function (b) { b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'); });
    window.scrollTo(0, y);
  }
  function go(t) { tab = t; history.replaceState(null, '', '#' + t); renderTab(); window.scrollTo(0, 0); }
  function head(title, lead) { return [h('h2', { text: title }), lead ? h('p', { class: 'lead', text: lead }) : null]; }

  /* — La carte — */
  function hd(b) { var a = document.activeElement, it = a && a.closest && a.closest('.item'), x = it && it.querySelector('.item-h b'); if (x) x.textContent = (b.name || 'Sans nom') + ' — ' + (b.price === '' ? '?' : b.price) + ' DA'; }
  function tCarte() {
    var M = C.menu, re = renderTab, w = h('div');
    add(w, head('La carte', 'Modifiez les noms, descriptions et prix. Ajoutez ou supprimez des burgers et des suppléments. Les prix sont en dinars (DA).'));
    var bc = h('section', { class: 'card' }, h('h3', null, 'Burgers ', h('small', { text: M.burgers.length + ' au total' })));
    M.burgers.forEach(function (b, i) {
      bc.appendChild(h('div', { class: 'item' + (b.hot ? ' hot' : '') },
        h('div', { class: 'item-h' }, h('b', { text: (b.name || 'Sans nom') + ' — ' + (b.price === '' ? '?' : b.price) + ' DA' }), acts(M.burgers, i, 'ce burger', re)),
        h('div', { class: 'rowf' }, F('Nom', b, ['name'], { max: 80, after: function () { hd(b); } }), F('Prix', b, ['price'], { type: 'number', cls: 'price-f', inputmode: 'numeric', after: function () { hd(b); } })),
        F('Description (ingrédients)', b, ['desc'], { type: 'textarea', rows: 2, max: 300 }),
        h('div', { class: 'rowf3' },
          F('Étiquette', b, ['tag'], { max: 20, ph: 'Veau, Poulet…' }),
          F('Couleur de l’étiquette', b, ['color'], { type: 'select', options: [['rose', 'Rose'], ['jaune', 'Jaune'], ['bleu', 'Bleu']] }),
          F('🔥 Mettre en avant (flamme)', b, ['hot'], { type: 'checkbox' }))));
    });
    bc.appendChild(h('button', { class: 'btn btn-solid addbtn', type: 'button', onclick: function () { M.burgers.push({ name: '', desc: '', price: 0, tag: '', color: 'jaune', hot: false }); markDirty(); re(); focusLast('section.card:nth-of-type(1) .item'); } }, '＋ Ajouter un burger'));
    w.appendChild(bc);
    var sc = h('section', { class: 'card' }, h('h3', null, 'Suppléments ', h('small', { text: M.supplements.length + ' au total' })));
    M.supplements.forEach(function (b, i) {
      sc.appendChild(h('div', { class: 'item' },
        h('div', { class: 'item-h' }, h('b', { text: (b.name || 'Sans nom') + ' — ' + (b.price === '' ? '?' : b.price) + ' DA' }), acts(M.supplements, i, 'ce supplément', re)),
        h('div', { class: 'rowf' }, F('Nom', b, ['name'], { max: 80, after: function () { hd(b); } }), F('Prix', b, ['price'], { type: 'number', cls: 'price-f', after: function () { hd(b); } })),
        F('Phrase sous le nom (facultatif)', b, ['desc'], { max: 200 })));
    });
    sc.appendChild(h('button', { class: 'btn btn-solid addbtn', type: 'button', onclick: function () { M.supplements.push({ name: '', price: 0, desc: 'À ajouter à votre burger.' }); markDirty(); re(); focusLast('section.card:nth-of-type(2) .item'); } }, '＋ Ajouter un supplément'));
    w.appendChild(sc);
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Textes de la carte' }),
      F('Titre de la section', M, ['title'], { hint: RICH }), F('Phrase d’introduction', M, ['lead'], { type: 'textarea', rows: 2 }),
      h('div', { class: 'grid2' }, F('Encadré « tous les burgers… » — début en gras', M, ['included_title']), F('Encadré — suite', M, ['included_text'])),
      F('Note en bas de la carte', M, ['note'], { type: 'textarea', rows: 3 })));
    return w;
  }
  function focusLast(sel) { setTimeout(function () { var l = document.querySelectorAll(sel); var x = l[l.length - 1]; if (x) { x.scrollIntoView({ block: 'center', behavior: 'smooth' }); var i = x.querySelector('input'); if (i) i.focus({ preventScroll: true }); } }, 60); }

  /* — Horaires — */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function timeSel(r, i, label) {
    var pt = String(r[i]).split(':'), Hh = +pt[0] || 0, Mm = +pt[1] || 0, hs = [], ms = [], k;
    for (k = 0; k < 24; k++) hs.push(h('option', { value: k, selected: k === Hh }, pad(k)));
    for (k = 0; k < 60; k += 5) ms.push(h('option', { value: k, selected: k === Mm }, pad(k)));
    if (Mm % 5) ms.push(h('option', { value: Mm, selected: true }, pad(Mm)));
    var hh = h('select', { 'aria-label': label + ' (heures)' }, hs), mm = h('select', { 'aria-label': label + ' (minutes)' }, ms);
    var upd = function () { r[i] = pad(+hh.value) + ':' + pad(+mm.value); markDirty(); };
    hh.addEventListener('change', upd); mm.addEventListener('change', upd);
    return h('span', { class: 'tsel' }, hh, h('span', { class: 'sep', text: 'h' }), mm);
  }
  function tHoraires() {
    var H = C.hours, w = h('div'), re = renderTab;
    add(w, head('Horaires', 'Indiquez pour chaque jour les heures d’ouverture. Choisissez 00 h 00 pour minuit. Le site affiche aussi « Ouvert maintenant » ou « Fermé » automatiquement.'));
    var card = h('section', { class: 'card' });
    H.days.forEach(function (d, i) {
      var open = d.ranges.length > 0;
      var box = h('div', { class: 'day' }, h('div', { class: 'day-h' }, h('b', { text: d.day }),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: open, onchange: function (e) { d.ranges = e.target.checked ? [['11:30', '00:00']] : []; markDirty(); re(); } }), h('span', { text: 'Ouvert' })),
        h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: function () { H.days.forEach(function (o) { o.ranges = JSON.parse(JSON.stringify(d.ranges)); }); markDirty(); re(); toast('Horaires de ' + d.day + ' copiés sur tous les jours.', 'ok'); } }, 'Copier sur tous les jours')));
      if (!open) box.appendChild(h('p', { class: 'closed-t', text: 'Fermé toute la journée' }));
      d.ranges.forEach(function (r, j) {
        box.appendChild(h('div', { class: 'plage' }, h('span', { class: 'sep', text: j ? 'puis de' : 'de' }), timeSel(r, 0, d.day + ' ouverture'),
          h('span', { class: 'sep', text: 'à' }), timeSel(r, 1, d.day + ' fermeture'),
          d.ranges.length > 1 ? h('button', { class: 'btn btn-danger btn-sm btn-ic', type: 'button', 'aria-label': 'Retirer cette plage', onclick: function () { d.ranges.splice(j, 1); markDirty(); re(); } }, '✕') : null));
      });
      if (open && d.ranges.length < 2) box.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', style: 'justify-self:start', onclick: function () { d.ranges.push(['18:00', '23:00']); markDirty(); re(); } }, '＋ Ajouter une 2ᵉ plage (ex. pause de midi)'));
      card.appendChild(box);
    });
    w.appendChild(card);
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Textes' }), F('Titre', H, ['title'], { hint: RICH }), F('Petite note sous les horaires', H, ['note'])));
    return w;
  }

  /* — Contact — */
  function tInfos() {
    var K = C.contact, S = C.site, w = h('div');
    add(w, head('Contact & adresse', 'Téléphone, adresse, Instagram, Google Maps. Ces informations apparaissent partout sur le site (boutons « Appeler », pied de page, Google…).'));
    var tel = h('section', { class: 'card' }, h('h3', { text: 'Téléphone' }),
      h('div', { class: 'grid2' },
        F('Numéro affiché', K, ['phone_display'], { type: 'tel', max: 30, hint: 'Tel que vous voulez le voir sur le site, ex. 0552 10 34 62.', after: function (v) {
          var d = v.replace(/\D/g, ''); if (/^0\d{8,9}$/.test(d)) { K.phone_intl = '+213' + d.slice(1); var x = $('#f-intl'); if (x) x.value = K.phone_intl; }
        } }),
        h('div', { id: 'f-intl-w' }, F('Numéro pour le bouton « Appeler »', K, ['phone_intl'], { type: 'tel', max: 25, hint: 'Format international, ex. +213552103462 (rempli automatiquement).' }))));
    tel.querySelector('#f-intl-w input').id = 'f-intl';
    w.appendChild(tel);
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Adresse' }),
      F('Adresse affichée sur le site', K, ['address'], { type: 'textarea', rows: 2, hint: 'Une ligne par retour à la ligne.' }),
      h('details', { class: 'adv' }, h('summary', { text: 'Détails pour Google (avancé)' }), h('div', null,
        h('div', { class: 'grid2' }, F('Quartier / rue', K, ['street']), F('Ville', K, ['city']), F('Code postal', K, ['postal_code']), F('Pays (code à 2 lettres)', K, ['country'], { max: 2 })),
        h('div', { class: 'grid3' }, F('Latitude', K, ['lat'], { inputmode: 'decimal' }), F('Longitude', K, ['lon'], { inputmode: 'decimal' }), F('Identifiant Google du lieu', K, ['place_id'])),
        h('p', { class: 'sm mut', text: 'Latitude/longitude servent au bouton « Itinéraire » et à Google. Ne les changez que si vous déménagez.' })))));
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Réseaux & Google Maps' }),
      h('div', { class: 'grid2' }, F('Lien Instagram', K, ['instagram_url'], { type: 'url' }), F('Nom Instagram', K, ['instagram_handle'], { ph: '@votrenom' })),
      F('Lien de la fiche Google Maps', K, ['maps_url'], { type: 'url' })));
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Référencement Google & partage' }),
      h('p', { class: 'sm mut', text: 'Texte vu dans les résultats de recherche et lors d’un partage sur les réseaux. Utilisez {tel} pour insérer le téléphone.' }),
      F('Titre de l’onglet / de Google', S, ['title']), F('Description pour Google', S, ['description'], { type: 'textarea', rows: 3, max: 400 }),
      h('details', { class: 'adv' }, h('summary', { text: 'Autres textes de partage (avancé)' }), h('div', null,
        F('Titre de partage (WhatsApp, Facebook…)', S, ['og_title']), F('Description de partage', S, ['og_description'], { type: 'textarea', rows: 2 }),
        F('Description courte (Twitter/X)', S, ['twitter_description'], { type: 'textarea', rows: 2 }), F('Description longue (données Google)', S, ['schema_description'], { type: 'textarea', rows: 2 }),
        F('Adresse web publique du site', S, ['url'], { type: 'url', hint: 'À changer le jour de la mise en ligne, ex. https://whoopyburger.dz' }),
        F('Fuseau horaire', S, ['timezone'], { hint: 'Africa/Algiers pour l’Algérie.' })))));
    return w;
  }

  /* — Textes — */
  function tTextes() {
    var w = h('div'), re = renderTab;
    add(w, head('Textes du site', 'Les titres, phrases et paragraphes de chaque section. ' + RICH));
    var A = C.hero;
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Accueil (en haut de page)' }),
      F('Sur-titre', A, ['kicker']), F('Phrase d’accroche', A, ['lead'], { hint: RICH }), F('Bulle de la mascotte', A, ['bubble'], { type: 'textarea', rows: 2, hint: 'Retour à la ligne = nouvelle ligne dans la bulle.' }),
      F('Texte du badge rond', A, ['badge_text'], { hint: 'Texte qui tourne autour du badge (environ 40 caractères, finissant par « · »).' }),
      h('h4', { class: 'mut', text: 'Bandeau défilant' }), strList(A.marquee, 'Mot', re, 10)));
    var B = C.about;
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'La maison' }),
      F('Titre', B, ['title'], { hint: RICH }), F('Paragraphe d’introduction (gros texte)', B, ['big'], { type: 'textarea', rows: 4 }), F('Paragraphe', B, ['text'], { type: 'textarea', rows: 4 }),
      h('div', { class: 'grid2' }, F('Citation', B, ['quote'], { type: 'textarea', rows: 2 }), F('Source de la citation', B, ['quote_cite'])),
      h('h4', { class: 'mut', text: 'Mots-clés' }), strList(B.facts, 'Mot-clé', re, 6)));
    var SV = C.services, sc = h('section', { class: 'card' }, h('h3', { text: 'Services' }), F('Titre', SV, ['title'], { hint: RICH }), F('Phrase d’introduction', SV, ['lead'], { type: 'textarea', rows: 2 }));
    SV.items.forEach(function (it, i) {
      sc.appendChild(h('div', { class: 'item' }, h('div', { class: 'item-h' }, h('b', { text: (i + 1) + '. ' + (it.title || 'Service') }), acts(SV.items, i, 'ce service', re)),
        h('div', { class: 'rowf' }, F('Titre', it, ['title']), F('Icône', it, ['icon'], { type: 'select', options: [['burger', 'Burger'], ['fries', 'Frites'], ['seat', 'Salle'], ['moto', 'Livraison']] })),
        F('Texte', it, ['text'], { type: 'textarea', rows: 3, hint: '{tel} = téléphone · {nb_burgers_lettres} = nombre de burgers en lettres · {nb_burgers} = en chiffres' }),
        h('div', { class: 'grid2' }, F('Citation en encadré (facultatif)', it, ['quote']), F('Source de la citation', it, ['quote_cite']))));
    });
    if (SV.items.length < 8) sc.appendChild(h('button', { class: 'btn btn-line addbtn', type: 'button', onclick: function () { SV.items.push({ icon: 'burger', title: 'Nouveau service', text: '', quote: '', quote_cite: '' }); markDirty(); re(); } }, '＋ Ajouter un service'));
    w.appendChild(sc);
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Bandeau photo' }), F('Titre', C.band, ['title'], { hint: RICH }), F('Sous-titre', C.band, ['sub'])));
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Ambiance (galerie)' }), F('Titre', C.gallery, ['title'], { hint: RICH })));
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Pied de page' }), F('Phrase sous le logo', C.footer, ['tagline'])));
    return w;
  }

  /* — Avis — */
  function tAvis() {
    var R = C.reviews, w = h('div'), re = renderTab;
    add(w, head('Avis clients', 'Les avis affichés sur le site. Le premier s’affiche en grand. Recopiez-les tels quels (texte exact du client).'));
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Note Google affichée' }),
      h('div', { class: 'grid2' }, F('Note (sur 5)', C.rating, ['value'], { ph: '5,0', max: 4 }), F('Nombre d’avis Google', C.rating, ['count'], { type: 'number' })),
      F('Titre de la section', R, ['title'], { hint: RICH }), F('Note sous les avis', R, ['note'])));
    var cd = h('section', { class: 'card' }, h('h3', null, 'Avis ', h('small', { text: R.items.length + ' affichés' })));
    R.items.forEach(function (r, i) {
      cd.appendChild(h('div', { class: 'item' }, h('div', { class: 'item-h' }, h('b', { text: (r.author || 'Sans nom') + ' · ' + '★'.repeat(+r.stars || 0) }), acts(R.items, i, 'cet avis', re)),
        h('div', { class: 'rowf3' }, F('Auteur', r, ['author']), F('Étoiles', r, ['stars'], { type: 'select', num: true, options: [[5, '5 ★★★★★'], [4, '4 ★★★★'], [3, '3 ★★★'], [2, '2 ★★'], [1, '1 ★']] }), F('Source', r, ['source'], { ph: 'Google' })),
        F('Texte de l’avis', r, ['text'], { type: 'textarea', rows: 4, max: 1500 })));
    });
    cd.appendChild(h('button', { class: 'btn btn-solid addbtn', type: 'button', onclick: function () { R.items.push({ author: '', stars: 5, source: 'Google', text: '' }); markDirty(); re(); focusLast('section.card:nth-of-type(2) .item'); } }, '＋ Ajouter un avis'));
    w.appendChild(cd);
    return w;
  }

  /* — Photos — */
  function photoURL(p) {
    if (p.src) return '/' + p.src;
    var mid = p.widths[Math.floor(p.widths.length / 2)], name = p.base + '-' + mid + '.' + p.ext;
    if (pending.has(name)) { if (!pending.get(name).url) pending.get(name).url = URL.createObjectURL(pending.get(name).blob); return pending.get(name).url; }
    return IMGPATH + name;
  }
  function tPhotos() {
    var w = h('div'); add(w, head('Photos', 'Remplacez une photo : choisissez un fichier, cadrez-le, validez. L’image est automatiquement réduite et compressée pour que le site reste rapide.'));
    var g = h('div', { class: 'photos' });
    Object.keys(C.photos).forEach(function (slot) {
      var p = C.photos[slot], isNew = /^up-/.test(p.base), needAlt = isNew && !p.alt;
      var fi = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', hidden: true, onchange: function (e) { var f = e.target.files[0]; e.target.value = ''; if (f) cropper(slot, f); } });
      g.appendChild(h('div', { class: 'ph' },
        h('div', { class: 'ph-img' }, h('img', { src: photoURL(p), alt: p.alt || '', loading: 'lazy' }), isNew ? h('span', { class: 'new', text: 'NOUVELLE' }) : null),
        h('div', { class: 'ph-b' }, h('h4', { text: p.label }), fi,
          h('div', { class: 'ph-act' },
            h('button', { class: 'btn btn-solid btn-sm', type: 'button', onclick: function () { fi.click(); } }, '📷 Remplacer'),
            isNew ? h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: function () { var o = p.original; Object.assign(p, { base: o.base, ext: o.ext, widths: o.widths.slice(), avif: o.avif, w: o.w, h: o.h, alt: o.alt, caption: o.caption, src: '' }); markDirty(); renderTab(); } }, '↩ Photo d’origine') : null),
          F('Description (pour Google et les malvoyants)', p, ['alt'], { type: 'textarea', rows: 2, max: 300, cls: needAlt ? 'needalt' : '', after: function (v) { var l = document.querySelector('.needalt'); if (v && l) { l.classList.remove('needalt'); var s = l.querySelector('small'); if (s) s.remove(); } }, hint: needAlt ? 'Pensez à décrire cette nouvelle photo en une phrase.' : (slot === 'band' ? 'Photo décorative : peut rester vide.' : null) }),
          slot === 'band' ? null : F('Légende affichée sur la photo (facultatif)', p, ['caption'], { max: 60 }))));
    });
    w.appendChild(g);
    w.appendChild(h('p', { class: 'note', text: 'La grande image de l’accueil est une vidéo : elle n’est pas modifiable ici. Les 4 mascottes sont des illustrations fixes.' }));
    return w;
  }

  /* — Recadrage + compression côté navigateur — */
  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return viaImg(file); });
    return viaImg(file);
  }
  function viaImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), i = new Image();
      i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('Image illisible')); }; i.src = u;
    });
  }
  function sz(im) { return [im.width || im.naturalWidth, im.height || im.naturalHeight]; }
  function resample(im, sx, sy, sw, sh, W, H) {
    var cur = document.createElement('canvas'), k = Math.min(1, 2 * W / sw);
    cur.width = Math.max(1, Math.round(sw * k)); cur.height = Math.max(1, Math.round(sh * k));
    var x = cur.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, sx, sy, sw, sh, 0, 0, cur.width, cur.height);
    while (cur.width / 2 >= W) {
      var n = document.createElement('canvas'); n.width = Math.round(cur.width / 2); n.height = Math.round(cur.height / 2);
      var nx = n.getContext('2d'); nx.imageSmoothingQuality = 'high'; nx.drawImage(cur, 0, 0, n.width, n.height); cur = n;
    }
    var f = document.createElement('canvas'); f.width = W; f.height = H;
    var fx = f.getContext('2d'); fx.imageSmoothingQuality = 'high'; fx.drawImage(cur, 0, 0, W, H); return f;
  }
  function toBlob(cv) {
    return new Promise(function (res) {
      cv.toBlob(function (b) {
        if (b && b.type === 'image/webp') return res({ blob: b, ext: 'webp' });
        cv.toBlob(function (j) { res({ blob: j, ext: 'jpg' }); }, 'image/jpeg', 0.85);
      }, 'image/webp', 0.82);
    });
  }
  function cropper(slot, file) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return toast('Ce fichier n’est pas une image (JPG, PNG ou WebP).', 'er');
    if (file.size > 40 * 1024 * 1024) return toast('Photo trop lourde (maximum 40 Mo avant réduction).', 'er');
    var p = C.photos[slot], r = p.upload_ratio[0] / p.upload_ratio[1];
    loadBitmap(file).then(function (im) {
      var S = sz(im), iw = S[0], ih = S[1], z = 1, cx = iw / 2, cy = ih / 2, drag = null;
      var bw, bh; if (iw / ih > r) { bh = ih; bw = ih * r; } else { bw = iw; bh = iw / r; }
      var cv = h('canvas', { width: 640, height: Math.round(640 / r) }), box = h('div', { class: 'crop', style: 'aspect-ratio:' + p.upload_ratio[0] + '/' + p.upload_ratio[1] + ';width:min(100%,' + (44 * r).toFixed(1) + 'vh);margin:0 auto' }, cv);
      function rect() { var cw = bw / z, ch = bh / z; cx = Math.min(Math.max(cx, cw / 2), iw - cw / 2); cy = Math.min(Math.max(cy, ch / 2), ih - ch / 2); return [cx - cw / 2, cy - ch / 2, cw, ch]; }
      function draw() { var q = rect(), x = cv.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, q[0], q[1], q[2], q[3], 0, 0, cv.width, cv.height); }
      box.addEventListener('pointerdown', function (e) { drag = [e.clientX, e.clientY]; box.setPointerCapture(e.pointerId); });
      box.addEventListener('pointermove', function (e) { if (!drag) return; var k = (bw / z) / box.clientWidth; cx -= (e.clientX - drag[0]) * k; cy -= (e.clientY - drag[1]) * k; drag = [e.clientX, e.clientY]; draw(); });
      box.addEventListener('pointerup', function () { drag = null; });
      var zoom = h('input', { type: 'range', min: 1, max: 4, step: 0.02, value: 1, 'aria-label': 'Zoom', oninput: function (e) { z = +e.target.value; draw(); } });
      var bar = h('div', { class: 'bar', hidden: true }, h('i')), msg = h('p', { class: 'sm mut', text: 'Faites glisser l’image pour la cadrer. Format conseillé : la zone visible est celle affichée ci-dessus.' });
      var ok = h('button', { class: 'btn btn-solid', type: 'button', onclick: go2 }, 'Valider cette photo'), no = h('button', { class: 'btn btn-line', type: 'button', onclick: close }, 'Annuler');
      var modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Recadrer la photo' }, h('div', { class: 'modal-c' },
        h('h3', { text: 'Recadrer — ' + p.label }), box, h('div', { class: 'range' }, h('span', { text: '🔍−' }), zoom, h('span', { text: '🔍+' })), msg, bar, h('div', { style: 'display:flex;gap:.6rem;flex-wrap:wrap' }, ok, no)));
      function close() { modal.remove(); if (im.close) im.close(); }
      document.body.appendChild(modal); draw();
      function go2() {
        ok.disabled = no.disabled = true; bar.hidden = false; var q = rect();
        var widths = slot === 'band' ? [1600] : [480, 800, 1080], big = widths[widths.length - 1], set = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
        var base = 'up-' + slot + '-' + set, ext = 'webp', done = 0, outs = [];
        var chain = Promise.resolve();
        widths.forEach(function (W) {
          chain = chain.then(function () { var H = Math.round(W / r); return toBlob(resample(im, q[0], q[1], q[2], q[3], W, H)); }).then(function (o) {
            ext = o.ext; outs.push([W, o]);
            if (mode === 'server') return api('POST', 'upload?slot=' + slot + '&set=' + set + '&w=' + W + '&ext=' + o.ext, o.blob, true);
          }).then(function () { done++; bar.firstChild.style.width = Math.round(done / widths.length * 100) + '%'; });
        });
        chain.then(function () {
          outs.forEach(function (x) { pending.set(base + '-' + x[0] + '.' + ext, { blob: x[1].blob }); });
          Object.assign(p, { base: base, ext: ext, widths: widths, avif: false, w: big, h: Math.round(big / r), alt: '', src: '' });
          markDirty(); close(); renderTab(); toast('Photo prête. Décrivez-la, puis cliquez sur « Enregistrer ».', 'ok');
        }).catch(function (e) { ok.disabled = no.disabled = false; bar.hidden = true; msg.textContent = 'Échec : ' + e.message; msg.style.color = '#ff8d92'; });
      }
    }).catch(function () { toast('Impossible de lire cette image. Essayez un JPG ou un PNG (les photos HEIC d’iPhone doivent être converties).', 'er'); });
  }

  /* — Aperçu — */
  function tApercu() {
    var w = h('div'), phone = false;
    add(w, head('Aperçu', 'Voici le site avec vos modifications (même celles pas encore enregistrées).'));
    var wrap = h('div', { class: 'pv-wrap' }), fr = h('iframe', { class: 'pv-frame', title: 'Aperçu du site' });
    wrap.appendChild(fr);
    function load() {
      if (mode !== 'server') { wrap.replaceChildren(h('p', { class: 'note', text: 'L’aperçu n’est disponible qu’avec le serveur local (python3 server.py).' })); return; }
      api('POST', 'preview', C).then(function (j) { fr.src = j.url; }).catch(function (e) { toast(e.message, 'er'); });
    }
    w.appendChild(h('div', { class: 'pv-bar' },
      h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: function () { phone = false; wrap.classList.remove('phone'); } }, '🖥️ Ordinateur'),
      h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: function () { phone = true; wrap.classList.add('phone'); } }, '📱 Téléphone'),
      h('button', { class: 'btn btn-solid btn-sm', type: 'button', onclick: load }, '↻ Actualiser'),
      h('a', { class: 'btn btn-line btn-sm', href: '/', target: '_blank', rel: 'noopener' }, 'Ouvrir le vrai site ↗')));
    w.appendChild(wrap); load(); return w;
  }

  /* — Réglages — */
  function tReglages() {
    var w = h('div'); add(w, head('Réglages', 'Mot de passe, sauvegardes et export.'));
    var o = h('input', { type: 'password', autocomplete: 'current-password' }), n = h('input', { type: 'password', autocomplete: 'new-password' }), n2 = h('input', { type: 'password', autocomplete: 'new-password' });
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Changer le mot de passe' }),
      mustChange ? h('p', { class: 'note warn', text: 'Vous utilisez encore le mot de passe par défaut : changez-le maintenant.' }) : null,
      h('div', { class: 'grid3' }, h('label', { class: 'f' }, h('span', { text: 'Mot de passe actuel' }), o), h('label', { class: 'f' }, h('span', { text: 'Nouveau (8 caractères min.)' }), n), h('label', { class: 'f' }, h('span', { text: 'Confirmer' }), n2)),
      h('button', { class: 'btn btn-solid', type: 'button', style: 'justify-self:start', onclick: function () {
        if (n.value !== n2.value) return toast('Les deux nouveaux mots de passe sont différents.', 'er');
        api('POST', 'password', { old: o.value, 'new': n.value }).then(function () { mustChange = false; o.value = n.value = n2.value = ''; toast('Mot de passe modifié.', 'ok'); renderTab(); }).catch(function (e) { toast(e.message, 'er'); });
      } }, 'Changer le mot de passe')));
    var bl = h('div', { class: 'item' }, h('p', { class: 'mut', text: 'Chargement…' }));
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Sauvegardes automatiques' }),
      h('p', { class: 'sm mut', text: 'Une copie de l’ancien contenu est conservée à chaque enregistrement (les 40 dernières). Vous pouvez revenir en arrière.' }), bl));
    if (mode === 'server') api('GET', 'backups').then(function (j) {
      bl.textContent = '';
      if (!j.backups.length) bl.appendChild(h('p', { class: 'mut', text: 'Aucune sauvegarde pour l’instant.' }));
      j.backups.slice(0, 12).forEach(function (b) {
        bl.appendChild(h('div', { class: 'item-h' }, h('span', { text: b.label }), h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: function () {
          if (!confirm('Restaurer la version du ' + b.label + ' ?\nLa version actuelle sera elle-même sauvegardée.')) return;
          api('POST', 'restore', { name: b.name }).then(function (r) { C = r.content; dirty = false; updStatus(); toast('Version restaurée.', 'ok'); renderTab(); }).catch(function (e) { toast(e.message, 'er'); });
        } }, 'Restaurer')));
      });
    }).catch(function () { bl.textContent = 'Indisponible.'; }); else bl.textContent = 'Disponible avec le serveur local.';
    w.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Exporter' }),
      h('p', { class: 'sm mut', text: 'Télécharge un fichier .zip avec content.json et les nouvelles photos. Utile pour mettre le site en ligne (Netlify, etc.) — voir le README.' }),
      h('button', { class: 'btn btn-line', type: 'button', style: 'justify-self:start', onclick: doExport }, '⬇ Exporter content.json + photos')));
    return w;
  }

  /* ───────── enregistrer / exporter ───────── */
  function save() {
    if (mode !== 'server') return doExport();
    var bs = document.querySelectorAll('[data-save]'); bs.forEach(function (b) { b.disabled = true; });
    return api('PUT', 'content', C).then(function (j) {
      C = j.content; dirty = false; updStatus(); toast('✔ Enregistré à ' + j.saved_at + ' — le site est à jour.', 'ok'); renderTab();
    }).catch(function (e) { toast('Non enregistré : ' + e.message, 'er'); bs.forEach(function (b) { b.disabled = false; }); });
  }
  var crcT = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {  // files: [{name, data:Uint8Array}] — sans compression (« stored »)
    var enc = new TextEncoder(), parts = [], cen = [], off = 0, d = new Date();
    var dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    files.forEach(function (f) {
      var nm = enc.encode(f.name), crc = crc32(f.data), lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, nm, f.data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt, true); ch.setUint16(14, dd, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      cen.push(ch.buffer, nm); off += 30 + nm.length + f.data.length;
    });
    var cs = cen.reduce(function (a, b) { return a + (b.byteLength || b.length); }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(cen, [end.buffer]), { type: 'application/zip' });
  }
  function doExport() {
    var used = {}; Object.keys(C.photos).forEach(function (s) { used[C.photos[s].base] = 1; });
    var files = [], jobs = [];
    files.push({ name: 'content.json', data: new TextEncoder().encode(JSON.stringify(C, null, 1)) });
    pending.forEach(function (v, name) {
      var base = name.replace(/-\d+\.\w+$/, ''); if (!used[base]) return;
      jobs.push(v.blob.arrayBuffer().then(function (b) { files.push({ name: 'site/assets/img/' + name, data: new Uint8Array(b) }); }));
    });
    Promise.all(jobs).then(function () {
      files.push({ name: 'LISEZ-MOI.txt', data: new TextEncoder().encode('Export du tableau de bord Whoopy Burger\r\n\r\n1. Copiez content.json à la racine du projet (remplace l’ancien).\r\n2. Copiez le dossier site/assets/img/ dans site/assets/img/ du projet.\r\n3. Lancez : python3 render.py   (régénère site/index.html)\r\n') });
      var a = h('a', { href: URL.createObjectURL(zip(files)), download: 'whoopy-export-' + new Date().toISOString().slice(0, 10) + '.zip' });
      document.body.appendChild(a); a.click(); a.remove();
      toast('Export téléchargé (content.json + ' + (files.length - 2) + ' photo(s)).', 'ok');
    });
  }

  /* ───────── démarrage / connexion ───────── */
  function showLogin(msg) {
    $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
    var e = $('#login-err'); if (msg) { e.textContent = msg; e.hidden = false; } else e.hidden = true;
    setTimeout(function () { $('#login-pw').focus(); }, 50);
  }
  $('#login-form').addEventListener('submit', function (ev) {
    ev.preventDefault(); var pw = $('#login-pw').value, e = $('#login-err'); e.hidden = true;
    api('POST', 'login', { password: pw }).then(function (j) { $('#login-pw').value = ''; mustChange = j.must_change; start(); })
      .catch(function (er) { e.textContent = er.message; e.hidden = false; });
  });
  function build() {
    var app = $('#app'); app.textContent = '';
    var top = h('header', { class: 'top' }, h('div', { class: 'brand' }, h('img', { src: '/assets/logo.svg', alt: 'Whoopy Burger' }), h('b', { text: 'Tableau de bord' })), h('div', { class: 'sp' }),
      h('div', { class: 'status', id: 'status' }, h('i'), h('span', { text: 'Tout est enregistré' })),
      h('button', { class: 'btn btn-line btn-sm hide-m', type: 'button', onclick: doExport }, '⬇ Exporter'),
      h('button', { class: 'btn btn-solid btn-sm hide-m', type: 'button', 'data-save': '', onclick: save }, mode === 'server' ? '💾 Enregistrer' : '⬇ Exporter'),
      mode === 'server' ? h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: logout }, 'Quitter') : null);
    var side = h('nav', { class: 'side', 'aria-label': 'Sections' }, TABS.map(function (t) {
      return h('button', { type: 'button', 'data-tab': t[0], onclick: function () { go(t[0]); } }, h('span', { class: 'ic', text: t[1] }), h('span', { text: t[2] }));
    }), h('p', { class: 'hint', text: 'Vos modifications ne sont publiées sur le site qu’après « Enregistrer ».' }));
    var bar = h('div', { class: 'savebar' }, h('button', { class: 'btn btn-line', type: 'button', onclick: function () { go('apercu'); } }, '👁️ Aperçu'),
      h('button', { class: 'btn btn-solid', type: 'button', 'data-save': '', onclick: save }, mode === 'server' ? '💾 Enregistrer' : '⬇ Exporter'));
    app.appendChild(top);
    app.appendChild(h('div', { class: 'shell' }, side, h('main', { id: 'main', tabindex: '-1' })));
    app.appendChild(bar);
  }
  function logout() {
    if (dirty && !confirm('Des modifications ne sont pas enregistrées. Quitter quand même ?')) return;
    dirty = false; api('POST', 'logout', {}).finally(function () { location.reload(); });
  }
  function begin(content) {
    C = content; $('#boot').hidden = true; $('#login').hidden = true; $('#app').hidden = false;
    build(); var t = (location.hash || '').slice(1); tab = TABS.some(function (x) { return x[0] === t; }) ? t : 'carte'; renderTab();
  }
  function start() {
    api('GET', 'content').then(function (j) { begin(j.content); }).catch(function (e) { if (e.status !== 401) toast(e.message, 'er'); });
  }
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 's' && C) { e.preventDefault(); save(); } });

  fetch('/admin/api/session', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
    mode = 'server'; mustChange = !!j.must_change;
    if (j.auth) start(); else showLogin();
  }).catch(function () {
    // pas de serveur : mode « export » (hébergement statique ou fichier ouvert directement)
    mode = 'static'; IMGPATH = '../assets/img/';
    fetch('../content.json').then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(begin).catch(function () {
      $('#boot').textContent = 'Serveur introuvable. Lancez « python3 server.py » puis ouvrez http://127.0.0.1:8780/admin/';
    });
  });
})();
