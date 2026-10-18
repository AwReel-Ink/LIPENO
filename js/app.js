/* =========================================================
   Lipeno – Ma liste au Père Noël
   Application PWA 100 % hors ligne (HTML / CSS / JS, sans dépendance réseau)
   ========================================================= */

// ---------- Constantes ----------
const APP_VERSION = '1.0.0';
const AVATARS = ['🎅', '🤶', '🧝', '🦌', '⛄', '🎄', '🎁', '⭐', '🔔', '🍪', '🧦', '🛷', '❄️', '🐧', '🐻‍❄️', '🧸', '🍭', '🎀', '🕯️', '🌟'];
const WISDOM = [
  { e: '😈', t: 'Pas sage du tout', c: '#d93a3a' },
  { e: '😬', t: 'Un peu sage', c: '#e9762b' },
  { e: '🙂', t: 'Moyennement sage', c: '#d9a514' },
  { e: '😊', t: 'Sage', c: '#5aa83a' },
  { e: '😇', t: 'Très sage', c: '#2a9a62' }
];
const TOY_MAX = 800;        // dimension max des photos de jouets (px)
const AVATAR_MAX = 400;     // dimension max des photos de profil (px)
const QUALITY = 0.75;       // qualité WebP
const LONG_PRESS_MS = 650;  // durée de l'appui long sur le bouton de partage
const THEMES = {
  classique: { label: 'Classique', meta: '#b1262b', sample: 'Noël' },
  feerique: { label: 'Féerique', meta: '#0b1734', sample: 'Noël' },
  cartoon: { label: 'Dessin animé', meta: '#ff4f5e', sample: 'Noël' }
};
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// ---------- Petits utilitaires ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
let lastOrder = 0;
const nextOrder = () => (lastOrder = Math.max(Date.now(), lastOrder + 1));
const fmtDate = (ts) => new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const slug = (s) => String(s || 'enfant').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'enfant';

function ageText(birth) {
  if (!birth) return '';
  const b = new Date(birth + 'T00:00:00');
  if (isNaN(b)) return '';
  const n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months--;
  if (months < 0) return '';
  if (months < 24) return months <= 1 ? `${Math.max(months, 0)} mois` : `${months} mois`;
  const y = Math.floor(months / 12);
  return `${y} ans`;
}
function isBirthday(birth) {
  if (!birth) return false;
  const [, m, d] = birth.split('-').map(Number);
  const n = new Date();
  return n.getMonth() + 1 === m && n.getDate() === d;
}
function daysToChristmas() {
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  let xmas = new Date(n.getFullYear(), 11, 25);
  if (today > xmas) xmas = new Date(n.getFullYear() + 1, 11, 25);
  return Math.round((xmas - today) / 86400000);
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Réglages (petits, en localStorage) ----------
const Settings = {
  data: { theme: 'classique', snow: true },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem('lipeno.settings') || '{}')); } catch (e) {}
    if (!THEMES[this.data.theme]) this.data.theme = 'classique';
  },
  save() { try { localStorage.setItem('lipeno.settings', JSON.stringify(this.data)); } catch (e) {} }
};
function applyTheme() {
  const t = Settings.data.theme;
  document.documentElement.dataset.theme = t;
  $('meta[name="theme-color"]').setAttribute('content', THEMES[t].meta);
  Snow.refresh();
}

// ---------- Base de données (IndexedDB) ----------
let dbPromise;
function openDB() {
  return dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('lipeno', 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kids')) d.createObjectStore('kids', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('toys')) d.createObjectStore('toys', { keyPath: 'id' }).createIndex('kid', 'kidId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function run(stores, mode, fn) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let result;
    const r = fn(t);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const DB = {
  kids: () => run('kids', 'readonly', (t) => t.objectStore('kids').getAll()).then((a) => a.sort((x, y) => x.createdAt - y.createdAt)),
  kid: (id) => run('kids', 'readonly', (t) => t.objectStore('kids').get(id)),
  putKid: (k) => run('kids', 'readwrite', (t) => t.objectStore('kids').put(k)),
  toys: (kidId) => run('toys', 'readonly', (t) => t.objectStore('toys').index('kid').getAll(kidId)).then((a) => a.sort((x, y) => x.order - y.order)),
  countToys: (kidId) => run('toys', 'readonly', (t) => t.objectStore('toys').index('kid').count(kidId)),
  allToys: () => run('toys', 'readonly', (t) => t.objectStore('toys').getAll()),
  putToy: (toy) => run('toys', 'readwrite', (t) => t.objectStore('toys').put(toy)),
  delToy: (id) => run('toys', 'readwrite', (t) => t.objectStore('toys').delete(id)),
  clearToys: (kidId) => run('toys', 'readwrite', (t) => {
    const store = t.objectStore('toys');
    const req = store.index('kid').openKeyCursor(IDBKeyRange.only(kidId));
    req.onsuccess = () => { const c = req.result; if (c) { store.delete(c.primaryKey); c.continue(); } };
  }),
  delKid: async (id) => { await DB.clearToys(id); await run('kids', 'readwrite', (t) => t.objectStore('kids').delete(id)); },
  wipe: () => run(['kids', 'toys'], 'readwrite', (t) => { t.objectStore('kids').clear(); t.objectStore('toys').clear(); })
};

// Liste des magasins déjà utilisés (pour la saisie assistée)
const Shops = {
  map: new Map(),
  add(name) { const n = (name || '').trim(); if (n) this.map.set(n.toLocaleLowerCase('fr'), n); },
  async load() { (await DB.allToys()).forEach((t) => this.add(t.shop)); },
  datalist(id) { return `<datalist id="${id}">${[...this.map.values()].sort((a, b) => a.localeCompare(b, 'fr')).map((s) => `<option value="${esc(s)}"></option>`).join('')}</datalist>`; }
};

// ---------- Traitement des photos ----------
// Décodage de tous les formats modernes (JPG, PNG, WebP, AVIF, GIF, HEIC/HEIF…),
// orientation respectée, réduction à TOY_MAX px et compression WebP 75 %.
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];
async function looksLikeHeic(file) {
  if (/\.(heic|heif)$/i.test(file.name || '') || /hei[cf]/i.test(file.type || '')) return true;
  try {
    const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const s = String.fromCharCode(...b.slice(4, 12));
    return s.startsWith('ftyp') && HEIC_BRANDS.includes(s.slice(4));
  } catch (e) { return false; }
}
async function decodeNative(blob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* on essaie autrement */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}
let heicLib;
function loadHeicLib() {
  return heicLib ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../lib/heic2any.min.js', import.meta.url).href;
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => { heicLib = null; reject(new Error('heic lib')); };
    document.head.appendChild(s);
  });
}
async function decodeAny(file) {
  try {
    return await decodeNative(file);
  } catch (e) {
    if (!(await looksLikeHeic(file))) throw e;
    const heic2any = await loadHeicLib();
    let jpg = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    if (Array.isArray(jpg)) jpg = jpg[0];
    return decodeNative(jpg);
  }
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasToBlob(canvas, type, q) { return new Promise((r) => canvas.toBlob(r, type, q)); }

// Safari (iPhone) ne sait pas produire de WebP : on utilise alors l'encodeur WebP embarqué (WebAssembly).
const WEBP_OPTIONS = {
  quality: 75, target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50, filter_strength: 60, filter_sharpness: 0,
  filter_type: 1, partitions: 0, segments: 4, pass: 1, show_compressed: 0, preprocessing: 0, autofilter: 0,
  partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100, lossless: 0, exact: 0,
  image_hint: 0, emulate_jpeg_size: 0, thread_level: 0, low_memory: 0, near_lossless: 100, use_delta_palette: 0, use_sharp_yuv: 0
};
let nativeWebp = null;
let webpEncoder;
function loadWebpEncoder() {
  return webpEncoder ||= import('../lib/webp/webp_enc.js').then((m) => m.default({
    noInitialRun: true,
    locateFile: (p) => new URL('../lib/webp/' + p, import.meta.url).href
  })).catch((e) => { webpEncoder = null; throw e; });
}
async function encodeWebp(canvas) {
  if (nativeWebp !== false) {
    const b = await canvasToBlob(canvas, 'image/webp', QUALITY);
    if (b && b.type === 'image/webp') { nativeWebp = true; return b; }
    nativeWebp = false;
  }
  try {
    const enc = await loadWebpEncoder();
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const out = enc.encode(data.data, data.width, data.height, WEBP_OPTIONS);
    if (out && out.length) return new Blob([out], { type: 'image/webp' });
  } catch (e) { console.warn('Encodeur WebP indisponible', e); }
  return canvasToBlob(canvas, 'image/jpeg', QUALITY);
}
async function processImage(file, max = TOY_MAX) {
  const src = await decodeAny(file);
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  if (!sw || !sh) throw new Error('empty');
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  // Réduction par paliers pour garder une image nette
  let cur = src, cw = sw, ch = sh;
  while (cw / 2 >= w && ch / 2 >= h) {
    const nw = Math.round(cw / 2), nh = Math.round(ch / 2);
    const c = makeCanvas(nw, nh);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, nw, nh);
    if (cur !== src) cur.width = 0;
    cur = c; cw = nw; ch = nh;
  }
  const out = makeCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  if (cur !== src) cur.width = 0;
  if (src.close) src.close();
  const blob = await encodeWebp(out);
  out.width = 0;
  return { blob, w, h };
}

// ---------- Neige ----------
const Snow = {
  canvas: $('#snow'), ctx: null, flakes: [], raf: 0, w: 0, h: 0, dpr: 1, style: null,
  init() {
    this.ctx = this.canvas.getContext('2d');
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.refresh()));
    this.refresh();
  },
  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
    const count = Math.min(80, Math.round((this.w * this.h) / 8000));
    this.flakes = Array.from({ length: count }, () => this.flake(true));
  },
  flake(anywhere) {
    const r = 1.2 + Math.random() * 3.2;
    return { x: Math.random() * this.w, y: anywhere ? Math.random() * this.h : -10, r, vy: 0.3 + r * 0.22, ph: Math.random() * 6.28, amp: 0.3 + Math.random() * 0.7 };
  },
  refresh() {
    const t = Settings.data.theme;
    this.style = t === 'classique' ? { fill: 'rgba(255,255,255,.95)', stroke: 'rgba(140,95,55,.28)' }
      : t === 'cartoon' ? { fill: '#ffffff', stroke: 'rgba(29,29,43,.55)' }
      : { fill: 'rgba(255,255,255,.9)', stroke: null };
    if (Settings.data.snow && !document.hidden) this.start(); else this.stop(true);
  },
  start() {
    if (!this.flakes.length) this.resize();
    if (this.raf) return;
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  stop(clear) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    if (clear && this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  },
  draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = this.style.fill;
    ctx.strokeStyle = this.style.stroke || 'transparent';
    ctx.lineWidth = 1;
    for (const f of this.flakes) {
      f.ph += 0.012;
      f.y += f.vy;
      f.x += Math.sin(f.ph) * f.amp * 0.5;
      if (f.y > this.h + 10) Object.assign(f, this.flake(false));
      if (f.x > this.w + 10) f.x = -10; else if (f.x < -10) f.x = this.w + 10;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, 6.2832);
      ctx.fill();
      if (this.style.stroke) ctx.stroke();
    }
  }
};

// ---------- Modales (feuilles) avec gestion du bouton retour ----------
const modalStack = [];
let backWaiters = [];
function openModal(build, { center = false, dismissible = true, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal' + (center ? ' center' : '');
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  wrap.appendChild(sheet);
  const m = { wrap, sheet, dismissible, onClose, urls: [], closed: false };
  m.close = (val) => closeModal(m, val);
  m.url = (blob) => { const u = URL.createObjectURL(blob); m.urls.push(u); return u; };
  wrap.addEventListener('click', (e) => { if (e.target === wrap && m.dismissible) m.close(); });
  $('#modal-root').appendChild(wrap);
  modalStack.push(m);
  document.body.style.overflow = 'hidden';
  history.pushState({ modal: modalStack.length }, '');
  build(sheet, m);
  return m;
}
async function closeModal(m, val, fromPop = false) {
  if (m.closed) return;
  m.closed = true;
  const i = modalStack.indexOf(m);
  if (i >= 0) modalStack.splice(i, 1);
  if (!modalStack.length) document.body.style.overflow = '';
  m.wrap.classList.add('closing');
  setTimeout(() => { m.wrap.remove(); m.urls.forEach((u) => URL.revokeObjectURL(u)); }, 220);
  if (!fromPop) {
    await new Promise((r) => { backWaiters.push(r); setTimeout(r, 600); history.back(); });
  }
  if (m.onClose) m.onClose(val);
}
addEventListener('popstate', (e) => {
  const waiting = backWaiters.length > 0;
  backWaiters.splice(0).forEach((r) => r());
  if (waiting) return;
  const depth = (e.state && e.state.modal) || 0;
  while (modalStack.length > depth) {
    const top = modalStack[modalStack.length - 1];
    if (!top.dismissible) { history.pushState({ modal: modalStack.length }, ''); break; }
    closeModal(top, undefined, true);
  }
});
function closeX() { return '<button class="close-x" data-x aria-label="Fermer">✕</button>'; }
function bindCloseX(sheet, m) { const x = $('[data-x]', sheet); if (x) x.onclick = () => m.close(); }

function confirmDialog({ title, message, ok = 'Confirmer', danger = false, emoji = '🤔' }) {
  return new Promise((resolve) => {
    let answer = false;
    openModal((s, m) => {
      s.innerHTML = `<div style="text-align:center;font-size:3rem;margin-top:6px">${emoji}</div>
        <h2 class="title-text">${esc(title)}</h2>
        ${message ? `<p style="text-align:center;margin:0;font-weight:700;color:var(--text-soft)">${message}</p>` : ''}
        <div class="actions"><button class="btn ghost" data-no>Annuler</button><button class="btn ${danger ? 'danger' : ''}" data-yes>${esc(ok)}</button></div>`;
      $('[data-no]', s).onclick = () => m.close();
      $('[data-yes]', s).onclick = () => { answer = true; m.close(); };
    }, { center: true, onClose: () => resolve(answer) });
  });
}

// ---------- Barre de progression ----------
function showProgress(title, emoji = '🎁') {
  const w = document.createElement('div');
  w.className = 'progress-wrap';
  w.innerHTML = `<div class="progress-card"><div class="gift">${emoji}</div><h3>${esc(title)}</h3><p>&nbsp;</p><div class="bar"><i></i></div></div>`;
  document.body.appendChild(w);
  const bar = $('.bar i', w), p = $('p', w);
  return {
    update(done, total, text) {
      bar.style.width = Math.round((done / Math.max(total, 1)) * 100) + '%';
      if (text) p.textContent = text;
    },
    async close() { bar.style.width = '100%'; await sleep(180); w.style.transition = 'opacity .2s'; w.style.opacity = '0'; setTimeout(() => w.remove(), 220); }
  };
}

// ---------- Icônes ----------
const ICON_BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/></svg>';
const ICON_GEAR = '⚙️';

function avatarHTML(kid, urlFn) {
  if (kid.avatar && kid.avatar.type === 'photo' && kid.avatar.blob) return `<img src="${urlFn(kid.avatar.blob)}" alt="">`;
  return esc((kid.avatar && kid.avatar.value) || '🎅');
}

// Guirlande lumineuse générée à la largeur de l'écran
function garlandSVG() {
  const W = Math.min(innerWidth, 752), seg = W / Math.max(3, Math.round(W / 110));
  let wire = '', bulbs = '', k = 0;
  for (let x = 0; x < W - 1; x += seg) {
    const x2 = x + seg, cx = x + seg / 2, top = 4, sag = 30;
    wire += `M${x} ${top} Q${cx} ${sag} ${x2} ${top} `;
    for (const t of [0.22, 0.5, 0.78]) {
      const px = (1 - t) ** 2 * x + 2 * (1 - t) * t * cx + t ** 2 * x2;
      const py = (1 - t) ** 2 * top + 2 * (1 - t) * t * sag + t ** 2 * top;
      const c = (k++ % 4) + 1;
      bulbs += `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><rect class="cap" x="-3.5" y="0" width="7" height="6" rx="1.5"/><ellipse class="bulb b${c}" cx="0" cy="14" rx="6.5" ry="9.5"/></g>`;
    }
  }
  return `<svg class="garland" viewBox="0 0 ${W} 54" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><path class="wire" d="${wire}"/>${bulbs}</svg>`;
}

// =========================================================
//   VUE : ACCUEIL
// =========================================================
const view = { urls: [], kid: null, toys: [], selecting: false, selection: new Set(), cols: 0, fromHome: false };
function viewUrl(blob) { const u = URL.createObjectURL(blob); view.urls.push(u); return u; }
function resetViewUrls() { view.urls.forEach((u) => URL.revokeObjectURL(u)); view.urls = []; }

function countdownHTML() {
  const d = daysToChristmas();
  let num = d, small = 'Noël arrive dans', strong = `${d} dodos`, deco = '🎄';
  if (d === 0) { num = '🎄'; small = "C'est aujourd'hui"; strong = 'Joyeux Noël !'; deco = '🎅'; }
  else if (d === 1) { small = "C'est cette nuit"; strong = "Plus qu'un dodo !"; deco = '🛷'; }
  return `<section class="countdown" aria-label="Compte à rebours">
    <div class="num ${String(num).length > 2 ? 'long' : ''}">${num}</div>
    <div class="txt"><small>${small}</small><strong>${strong}</strong></div>
    <div class="deco" aria-hidden="true">${deco}</div>
  </section>`;
}

async function renderHome() {
  view.kid = null;
  const kids = await DB.kids();
  const counts = await Promise.all(kids.map((k) => DB.countToys(k.id)));
  resetViewUrls();
  const cards = kids.map((k, i) => {
    const w = k.wisdom != null ? WISDOM[k.wisdom] : null;
    return `<button class="kid-card" data-kid="${k.id}" style="animation-delay:${i * 60}ms">
      ${isBirthday(k.birth) ? '<span class="bday" title="Joyeux anniversaire !">🎂</span>' : ''}
      ${w ? `<span class="wis" title="${w.t}">${w.e}</span>` : ''}
      <div class="avatar">${avatarHTML(k, viewUrl)}</div>
      <div class="name">${esc(k.name)}</div>
      ${k.birth ? `<div class="age">${ageText(k.birth)}</div>` : ''}
      <div class="chips">
        <span class="chip">🎁 ${plural(counts[i], 'jouet', 'jouets')}</span>
        ${k.sentAt ? `<span class="chip sent">✉️ ${fmtDate(k.sentAt)}</span>` : ''}
      </div>
    </button>`;
  }).join('');

  app.innerHTML = `<div class="view-enter">
    ${garlandSVG()}
    <header class="home-head">
      <div class="brand"><h1 class="title-text">Lipeno</h1><p>Ma liste au Père Noël</p></div>
      <button class="icon-btn" data-act="settings" aria-label="Paramètres">${ICON_GEAR}</button>
    </header>
    ${countdownHTML()}
    ${kids.length ? `
      <div class="section-title"><h2 class="title-text">Les lutins</h2></div>
      <section class="kids-grid">
        ${cards}
        <button class="kid-card add" data-act="add-kid" style="animation-delay:${kids.length * 60}ms"><span class="plus">+</span>Ajouter un enfant</button>
      </section>` : `
      <section class="empty">
        <div class="big">🎅</div>
        <h3 class="title-text">Bienvenue !</h3>
        <p>Crée le profil de ton premier lutin pour commencer ta liste au Père Noël.</p>
        <button class="btn" data-act="add-kid">✨ Créer un profil</button>
      </section>`}
  </div>`;

  app.onclick = async (e) => {
    const card = e.target.closest('[data-kid]');
    if (card) { view.fromHome = true; location.hash = '#/kid/' + card.dataset.kid; return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add-kid') { const k = await openProfileEditor(null); if (k) renderHome(); }
    if (act === 'settings') { if (await parentGate()) openSettings(); }
  };
}

// =========================================================
//   VUE : PROFIL D'UN ENFANT
// =========================================================
async function renderKid(id) {
  const kid = await DB.kid(id);
  if (!kid) { location.replace('#/'); return; }
  view.kid = kid;
  view.toys = await DB.toys(id);
  view.selecting = false;
  resetViewUrls();
  app.innerHTML = `<div class="view-enter">
    <header class="child-head">
      <button class="icon-btn" data-act="back" aria-label="Retour">${ICON_BACK}</button>
      <div class="avatar lg">${avatarHTML(kid, viewUrl)}</div>
      <div class="who">
        <h1 class="title-text">${esc(kid.name)}</h1>
        <div class="meta">${kid.birth ? ageText(kid.birth) : ''}${isBirthday(kid.birth) ? ' · 🎂 Joyeux anniversaire !' : ''}</div>
        <div id="sent-line">${sentLineHTML(kid)}</div>
      </div>
    </header>
    <section class="panel wisdom" id="wisdom"></section>
    <section class="add-row">
      <button class="add-btn" data-act="add-one"><span class="ico">📸</span>Un jouet<small>Prendre ou choisir une photo</small></button>
      <button class="add-btn" data-act="add-many"><span class="ico">🖼️</span>Plusieurs jouets<small>Depuis la galerie</small></button>
    </section>
    <div id="sel-banner"></div>
    <section id="toys"></section>
    <div class="spacer-bar"></div>
  </div>
  <div class="action-bar" id="action-bar"></div>
  <input type="file" id="file-one" accept="image/*" hidden>
  <input type="file" id="file-many" accept="image/*" multiple hidden>`;

  mountWisdom($('#wisdom'), kid);
  renderToys();
  renderActionBar();

  $('#file-one').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addToys([f], true); };
  $('#file-many').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) addToys(fs, fs.length === 1); };

  app.onclick = async (e) => {
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const toyEl = e.target.closest('.toy');
    if (act === 'back') { goHome(); return; }
    if (act === 'add-one') { $('#file-one').click(); return; }
    if (act === 'add-many') { $('#file-many').click(); return; }
    if (act === 'send') { sendToSanta(); return; }
    if (act === 'sel-cancel') { exitSelection(); return; }
    if (act === 'sel-all') { view.selection = new Set(view.toys.map((t) => t.id)); syncSelection(); return; }
    if (act === 'sel-none') { view.selection.clear(); syncSelection(); return; }
    if (act === 'sel-share') {
      const items = numbered().filter((it) => view.selection.has(it.toy.id));
      if (!items.length) { toast('Sélectionne au moins un jouet'); return; }
      shareList(items);
      return;
    }
    if (act === 'fav' && toyEl && !view.selecting) { toggleFav(toyEl.dataset.id, actEl); return; }
    if (toyEl) {
      const id = toyEl.dataset.id;
      if (view.selecting) {
        view.selection.has(id) ? view.selection.delete(id) : view.selection.add(id);
        syncSelection();
      } else {
        const it = numbered().find((x) => x.toy.id === id);
        if (it) openToyDetail(it.toy, it.num);
      }
    }
  };
}
function goHome() {
  if (view.fromHome) { view.fromHome = false; history.back(); }
  else location.replace('#/');
}
function sentLineHTML(kid) {
  if (!kid.sentAt) return '';
  return `<span class="sent-line">✉️ Lettre envoyée le ${fmtDate(kid.sentAt)}${kid.psAt ? ` · P.S. le ${fmtDate(kid.psAt)}` : ''}</span>`;
}
const numbered = () => view.toys.map((toy, i) => ({ toy, num: i + 1 }));

// ---------- Barre de sagesse ----------
function mountWisdom(box, kid) {
  const dots = WISDOM.map((_, i) => `<span class="wis-dot" style="left:${i * 25}%"></span>`).join('');
  box.innerHTML = `<p class="q">Cette année, j'ai été…</p>
    <div class="now"></div>
    <div class="wis-track" role="slider" tabindex="0" aria-label="Niveau de sagesse" aria-valuemin="0" aria-valuemax="4">
      <div class="wis-rail"></div>${dots}
      <div class="wis-thumb"><span></span></div>
    </div>
    <div class="wis-ends"><span>Pas sage</span><span>Très sage</span></div>`;
  const track = $('.wis-track', box), thumb = $('.wis-thumb', box), now = $('.now', box), emo = $('span', thumb);
  track.style.margin = '6px 30px 0';
  let value = kid.wisdom;
  const show = (v, animate) => {
    if (v == null) {
      thumb.style.left = '50%'; emo.textContent = '❔'; thumb.classList.add('unset');
      now.textContent = 'Glisse pour te donner une note !'; now.style.color = ''; now.classList.add('hint');
      track.setAttribute('aria-valuetext', 'Pas encore noté');
      return;
    }
    const w = WISDOM[v];
    thumb.classList.remove('unset');
    thumb.style.left = v * 25 + '%';
    emo.textContent = w.e;
    now.textContent = w.t; now.style.color = w.c; now.classList.remove('hint');
    track.setAttribute('aria-valuenow', v);
    track.setAttribute('aria-valuetext', w.t);
    if (animate) { thumb.classList.remove('pop'); void thumb.offsetWidth; thumb.classList.add('pop'); }
  };
  const commit = async (v) => {
    const changed = v !== value;
    value = v;
    show(v, changed);
    if (changed) { kid.wisdom = v; await DB.putKid(kid); }
  };
  const ratioAt = (x) => { const r = track.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
  let dragging = false, lastIdx = value;
  track.addEventListener('pointerdown', (e) => {
    dragging = true; track.setPointerCapture(e.pointerId); track.classList.add('dragging');
    const r = ratioAt(e.clientX); thumb.style.left = r * 100 + '%';
    lastIdx = Math.round(r * 4); emo.textContent = WISDOM[lastIdx].e; thumb.classList.remove('unset');
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = ratioAt(e.clientX); thumb.style.left = r * 100 + '%';
    const idx = Math.round(r * 4);
    if (idx !== lastIdx) { lastIdx = idx; emo.textContent = WISDOM[idx].e; now.textContent = WISDOM[idx].t; now.style.color = WISDOM[idx].c; now.classList.remove('hint'); }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; track.classList.remove('dragging');
    commit(Math.round(ratioAt(e.clientX) * 4));
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', () => { dragging = false; track.classList.remove('dragging'); show(value); });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') commit(Math.min(4, (value ?? 1) + 1));
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') commit(Math.max(0, (value ?? 3) - 1));
  });
  show(value);
}

// ---------- Liste des jouets ----------
const colCount = () => (innerWidth >= 560 ? 3 : 2);
function renderToys() {
  const box = $('#toys');
  if (!box) return;
  (view.toyUrls || []).forEach((u) => URL.revokeObjectURL(u));
  view.toyUrls = [];
  const url = (b) => { const u = URL.createObjectURL(b); view.toyUrls.push(u); return u; };
  box.classList.toggle('selecting', view.selecting);
  if (!view.toys.length) {
    box.innerHTML = `<section class="empty"><div class="big">🧸</div><h3 class="title-text">Ta liste est vide</h3><p>Ajoute en photo les jouets dont tu rêves !</p></section>`;
    return;
  }
  const n = colCount();
  view.cols = n;
  const cols = Array.from({ length: n }, () => ({ h: 0, html: '' }));
  numbered().forEach(({ toy, num }, i) => {
    const hasInfo = toy.name || toy.shop;
    const est = toy.h / toy.w + (hasInfo ? 0.32 : 0.02);
    const col = cols.reduce((a, b) => (b.h < a.h - 0.001 ? b : a));
    col.h += est + 0.08;
    const sel = view.selection.has(toy.id) ? 'sel' : '';
    col.html += `<article class="toy ${sel}" data-id="${toy.id}" style="animation-delay:${Math.min(i, 14) * 35}ms">
      <div class="ph">
        <img src="${url(toy.blob)}" width="${toy.w}" height="${toy.h}" alt="${esc(toy.name || 'Jouet ' + num)}" draggable="false">
        <span class="num">${num}</span>
        <button class="fav ${toy.fav ? 'on' : ''}" data-act="fav" aria-label="Coup de cœur">${toy.fav ? '❤️' : '🤍'}</button>
        <span class="check">✓</span>
      </div>
      ${hasInfo ? `<div class="info">${toy.name ? `<b>${esc(toy.name)}</b>` : ''}${toy.shop ? `<span>📍 ${esc(toy.shop)}</span>` : ''}</div>` : ''}
    </article>`;
  });
  box.innerHTML = `<div class="toys-head"><h2 class="title-text">Ma liste</h2><span class="count">${plural(view.toys.length, 'jouet', 'jouets')}</span></div>
    <div class="masonry">${cols.map((c) => `<div class="col">${c.html}</div>`).join('')}</div>`;
}
addEventListener('resize', () => { if (view.kid && view.cols && colCount() !== view.cols) renderToys(); });

async function toggleFav(id, btn) {
  const toy = view.toys.find((t) => t.id === id);
  if (!toy) return;
  toy.fav = !toy.fav;
  btn.textContent = toy.fav ? '❤️' : '🤍';
  btn.classList.toggle('on', toy.fav);
  if (toy.fav) { btn.classList.remove('on'); void btn.offsetWidth; btn.classList.add('on'); }
  await DB.putToy(toy);
}

function renderActionBar() {
  const bar = $('#action-bar');
  if (!bar) return;
  if (view.selecting) {
    bar.innerHTML = `<div class="inner">
      <button class="btn ghost" data-act="sel-cancel">Annuler</button>
      <button class="btn send" data-act="sel-share" id="sel-share">📤 Partager (${view.selection.size})</button>
    </div>`;
    return;
  }
  const sent = !!view.kid.sentAt;
  bar.innerHTML = `<div class="inner">
    <button class="btn send" data-act="send">✉️ ${sent ? "P.S. J'ai oublié…" : 'Envoyer au Père Noël'}</button>
    <button class="share-btn" id="share-btn" aria-label="Partager la liste">${ICON_SHARE}</button>
  </div>`;
  bindShareButton($('#share-btn'));
}

// Appui court = partage de toute la liste · appui long = mode sélection (parents)
function bindShareButton(btn) {
  let timer = 0, fired = false, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); btn.classList.remove('pressing'); };
  btn.style.setProperty('--hold', LONG_PRESS_MS + 'ms');
  btn.addEventListener('pointerdown', (e) => {
    fired = false; sx = e.clientX; sy = e.clientY;
    btn.classList.add('pressing');
    timer = setTimeout(() => { fired = true; btn.classList.remove('pressing'); enterSelection(); }, LONG_PRESS_MS);
  });
  btn.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 14) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (fired) { fired = false; return; }
    if (!view.toys.length) { toast('Ajoute d\'abord des jouets à ta liste 🎁'); return; }
    shareList(numbered());
  });
}

function enterSelection() {
  if (!view.toys.length) { toast('La liste est vide'); return; }
  view.selecting = true;
  view.selection = new Set(view.toys.map((t) => t.id));
  $('#sel-banner').innerHTML = `<div class="select-banner"><span>👀 Mode parents : touchez les jouets à partager</span>
    <span style="display:flex;gap:6px;flex:none"><button class="btn" data-act="sel-all">Tout</button><button class="btn" data-act="sel-none">Aucun</button></span></div>`;
  renderToys();
  renderActionBar();
  $('#sel-banner').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function exitSelection() {
  view.selecting = false;
  view.selection.clear();
  $('#sel-banner').innerHTML = '';
  renderToys();
  renderActionBar();
}
function syncSelection() {
  $$('#toys .toy').forEach((el) => el.classList.toggle('sel', view.selection.has(el.dataset.id)));
  const b = $('#sel-share');
  if (b) b.textContent = `📤 Partager (${view.selection.size})`;
}

// ---------- Ajout de jouets ----------
async function addToys(files, single) {
  const total = files.length;
  const prog = showProgress(total > 1 ? 'Préparation des photos…' : 'Préparation de la photo…');
  const items = [];
  let failed = 0;
  for (let i = 0; i < total; i++) {
    prog.update(i + (total === 1 ? 0.35 : 0), total, total > 1 ? `Photo ${i + 1} sur ${total}` : 'Un instant…');
    await nextFrame();
    try { items.push(await processImage(files[i])); }
    catch (e) { console.warn(e); failed++; }
    prog.update(i + 1, total, total > 1 ? `Photo ${Math.min(i + 2, total)} sur ${total}` : 'Presque fini…');
  }
  await prog.close();
  if (failed) toast(failed > 1 ? `${failed} photos n'ont pas pu être lues 😕` : "Une photo n'a pas pu être lue 😕", 3500);
  if (items.length) openNaming(items, single && items.length === 1);
}

function openNaming(items, single) {
  const kid = view.kid;
  let idx = 0, currentShop = '', added = 0;
  const listId = 'shops-' + uid();
  const save = async (it, name, shop) => {
    const toy = { id: uid(), kidId: kid.id, blob: it.blob, w: it.w, h: it.h, name: name.trim(), shop: shop.trim(), fav: false, order: nextOrder(), createdAt: Date.now() };
    await DB.putToy(toy);
    Shops.add(toy.shop);
    view.toys.push(toy);
    added++;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  };
  openModal((s, m) => {
    const draw = () => {
      const it = items[idx], n = items.length, last = idx === n - 1;
      const dots = n > 1 && n <= 30 ? `<div class="dots">${items.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'cur' : ''}"></i>`).join('')}</div>` : '';
      s.innerHTML = `<div class="grab"></div>
        <h2 class="title-text">${single ? 'Mon nouveau jouet' : 'Mes nouveaux jouets'}</h2>
        ${!single ? `<div class="step-count">Photo ${idx + 1} sur ${n}</div>${dots}` : ''}
        <div class="toy-preview"><img src="${m.url(it.blob)}" alt=""><span class="num num-badge">${view.toys.length + 1}</span></div>
        <label class="field"><span>Nom du jouet <em>(facultatif)</em></span>
          <input class="input" name="name" maxlength="80" autocomplete="off" enterkeyhint="next" placeholder="Ex. : Château de princesse"></label>
        <label class="field"><span>Magasin <em>(facultatif)</em></span>
          <input class="input" name="shop" maxlength="60" autocomplete="off" list="${listId}" enterkeyhint="done" placeholder="Ex. : King Jouet"></label>
        ${Shops.datalist(listId)}
        <div class="actions">
          ${single ? '<button class="btn ghost" data-cancel>Annuler</button><button class="btn" data-next>Ajouter ✓</button>'
                   : `<button class="btn" data-next>${last ? 'Terminer ✓' : 'Suivant →'}</button>`}
        </div>
        ${!single && !last ? `<button class="link-btn" data-all>Tout valider avec ce magasin (${n - idx} restantes)</button>` : ''}
        ${!single ? '<button class="link-btn" data-skip>Ne pas garder cette photo</button>' : ''}`;
      const nameI = $('[name=name]', s), shopI = $('[name=shop]', s);
      shopI.value = currentShop;
      shopI.oninput = () => { currentShop = shopI.value; };
      nameI.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); shopI.focus(); } };
      shopI.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); shopI.blur(); } };
      const advance = () => { idx++; if (idx >= items.length) m.close(); else { draw(); s.scrollTop = 0; } };
      $('[data-next]', s).onclick = async (e) => {
        e.currentTarget.disabled = true;
        await save(it, nameI.value, shopI.value);
        advance();
      };
      const cancel = $('[data-cancel]', s);
      if (cancel) cancel.onclick = () => m.close();
      const skip = $('[data-skip]', s);
      if (skip) skip.onclick = advance;
      const all = $('[data-all]', s);
      if (all) all.onclick = async () => {
        all.disabled = true;
        await save(it, nameI.value, shopI.value);
        for (let j = idx + 1; j < items.length; j++) await save(items[j], '', currentShop);
        m.close();
      };
    };
    draw();
  }, {
    dismissible: single,
    onClose: () => {
      if (!added || view.kid !== kid) return;
      renderToys();
      toast(added > 1 ? `🎉 ${added} jouets ajoutés à ta liste !` : '🎉 Jouet ajouté à ta liste !');
      setTimeout(() => { const all = $$('#toys .toy'); const lastEl = all.find((el) => el.querySelector('.num')?.textContent === String(view.toys.length)); lastEl?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    }
  });
}

// ---------- Fiche d'un jouet ----------
function openToyDetail(toy, num) {
  const listId = 'shops-' + uid();
  openModal((s, m) => {
    s.innerHTML = `<div class="grab"></div>${closeX()}
      <h2 class="title-text">Jouet n°${num}</h2>
      <div class="toy-preview"><img src="${m.url(toy.blob)}" alt=""></div>
      <button class="fav-toggle ${toy.fav ? 'on' : ''}" data-fav>${toy.fav ? '❤️ Coup de cœur !' : '🤍 Mettre en coup de cœur'}</button>
      <label class="field"><span>Nom du jouet <em>(facultatif)</em></span><input class="input" name="name" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Magasin <em>(facultatif)</em></span><input class="input" name="shop" maxlength="60" autocomplete="off" list="${listId}"></label>
      ${Shops.datalist(listId)}
      <div class="actions">
        <button class="btn danger" data-del style="flex:0 0 auto;width:56px;padding:0" aria-label="Supprimer">🗑️</button>
        <button class="btn" data-save>Enregistrer</button>
      </div>`;
    bindCloseX(s, m);
    const nameI = $('[name=name]', s), shopI = $('[name=shop]', s), favB = $('[data-fav]', s);
    nameI.value = toy.name || '';
    shopI.value = toy.shop || '';
    let fav = !!toy.fav;
    favB.onclick = () => { fav = !fav; favB.classList.toggle('on', fav); favB.textContent = fav ? '❤️ Coup de cœur !' : '🤍 Mettre en coup de cœur'; };
    $('[data-save]', s).onclick = async () => {
      toy.name = nameI.value.trim(); toy.shop = shopI.value.trim(); toy.fav = fav;
      Shops.add(toy.shop);
      await DB.putToy(toy);
      await m.close();
      renderToys();
    };
    $('[data-del]', s).onclick = async () => {
      if (!(await confirmDialog({ title: 'Supprimer ce jouet ?', message: 'Il sera retiré de la liste.', ok: 'Supprimer', danger: true, emoji: '🗑️' }))) return;
      await DB.delToy(toy.id);
      view.toys = view.toys.filter((t) => t.id !== toy.id);
      await m.close();
      renderToys();
      toast('Jouet supprimé');
    };
  });
}

// =========================================================
//   ENVOI AU PÈRE NOËL (animation)
// =========================================================
async function sendToSanta() {
  const kid = view.kid;
  if (!view.toys.length) { toast('Ajoute d\'abord des jouets à ta liste 🎁'); return; }
  const isPS = !!kid.sentAt;
  const since = isPS ? (kid.psAt || kid.sentAt) : 0;
  let shown = isPS ? view.toys.filter((t) => t.createdAt > since) : view.toys;
  if (!shown.length) shown = view.toys;
  const now = Date.now();
  await playMailAnimation(kid, shown, isPS, now);
  if (isPS) kid.psAt = now; else kid.sentAt = now;
  await DB.putKid(kid);
  if (view.kid === kid) {
    $('#sent-line').innerHTML = sentLineHTML(kid);
    renderActionBar();
  }
}

function playMailAnimation(kid, toys, isPS, ts) {
  return new Promise(async (resolve) => {
    const urls = [];
    const u = (b) => { const x = URL.createObjectURL(b); urls.push(x); return x; };
    const max = toys.length > 9 ? 8 : 9;
    const thumbs = toys.slice(0, max).map((t) => `<div><img src="${u(t.blob)}" alt=""></div>`).join('')
      + (toys.length > max ? `<div>+${toys.length - max}</div>` : '');
    const emoji = kid.avatar && kid.avatar.type === 'emoji' ? kid.avatar.value : '⭐';
    const paper = `<div class="paper">
      <div class="dear">${isPS ? 'P.S. Père Noël,' : 'Cher Père Noël,'}</div>
      <div class="sub">${isPS ? "j'ai oublié de te demander :" : 'voici ma liste de cadeaux :'}</div>
      <div class="thumbs">${thumbs}</div>
      <div class="sign">${esc(kid.name)} ${emoji}</div>
    </div>`;
    const stars = Array.from({ length: 70 }, () => `<i style="left:${Math.random() * 100}%;top:${Math.random() * 75}%;animation-delay:${(Math.random() * 2).toFixed(2)}s;transform:scale(${(0.6 + Math.random()).toFixed(2)})"></i>`).join('');
    const scene = document.createElement('div');
    scene.className = 'mail-scene';
    scene.innerHTML = `
      <div class="stars">${stars}</div>
      <div class="moon"></div>
      <div class="pole"><span class="flag">🏔️</span>Pôle Nord</div>
      <svg class="hills" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 64 Q70 26 140 58 T280 52 T400 44 V120 H0Z" fill="#bcd2ef"/>
        <path d="M0 90 Q100 58 200 86 T400 76 V120 H0Z" fill="#f2f7ff"/>
      </svg>
      <div class="stage"><div class="env-group">
        <div class="envp env-back"></div>
        <div class="env-flap"></div>
        <div class="letter-wrap"><div class="letter3d">
          <div class="lp lp-top"><div class="face">${paper}</div><div class="back"></div></div>
          <div class="lp lp-mid"><div class="face">${paper}</div></div>
          <div class="lp lp-bot"><div class="face">${paper}</div><div class="back"></div></div>
        </div></div>
        <div class="envp env-front"></div>
        <div class="envp env-deco">
          <div class="env-name"><small>Pour le</small>Père Noël · Pôle Nord</div>
          <div class="env-stamp"><div>🎄</div></div>
          <div class="env-mark"><span><b>Pôle Nord</b>${fmtDate(ts)}<br>✶ Lipeno ✶</span></div>
          <div class="env-seal">⭐</div>
        </div>
      </div></div>
      <div class="mail-done">
        <div class="santa">🎅</div>
        <h2>Le Père Noël a bien reçu ${isPS ? 'ton P.S.' : 'ta lettre'} !</h2>
        <button class="btn" data-ok>Youpi ! 🎉</button>
      </div>`;
    document.body.appendChild(scene);
    document.body.style.overflow = 'hidden';
    const q = (s) => $(s, scene);
    const A = (el, kf, opt) => el.animate(kf, { fill: 'forwards', easing: 'ease-in-out', ...opt }).finished;
    const letter = q('.letter-wrap'), group = q('.env-group');
    const envParts = [q('.env-back'), q('.env-flap'), q('.env-front'), q('.env-deco')];
    envParts.forEach((p) => { p.style.opacity = '0'; });
    // attend que les miniatures soient prêtes
    await Promise.all($$('img', scene).map((im) => (im.decode ? im.decode().catch(() => {}) : null)));

    try {
      await A(scene, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
      await A(letter, [{ transform: 'translateY(60px) scale(.6) rotate(-6deg)', opacity: 0 }, { transform: 'translateY(0) scale(1) rotate(0)', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.2,1.3,.4,1)' });
      await sleep(900);
      // pliage en trois
      await A(q('.lp-bot'), [{ transform: 'rotateX(0deg)' }, { transform: 'translateZ(1px) rotateX(180deg)' }], { duration: 650 });
      await A(q('.lp-top'), [{ transform: 'rotateX(0deg)' }, { transform: 'translateZ(2px) rotateX(-180deg)' }], { duration: 650 });
      // la lettre remonte, l'enveloppe arrive
      const up = A(letter, [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-120px) scale(.98)' }], { duration: 550 });
      const envIn = envParts.map((p) => A(p, [{ opacity: 0, translate: '0 260px' }, { opacity: 1, translate: '0 0' }], { duration: 650, easing: 'cubic-bezier(.2,1.1,.4,1)' }));
      await Promise.all([up, ...envIn]);
      // la lettre glisse dans l'enveloppe
      await A(letter, [{ transform: 'translateY(-120px) scale(.98)' }, { transform: 'translateY(66px) scale(.98)' }], { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' });
      // fermeture du rabat
      const flap = q('.env-flap');
      flap.style.zIndex = '4';
      await A(flap, [{ transform: 'perspective(800px) rotateX(180deg)' }, { transform: 'perspective(800px) rotateX(0deg)' }], { duration: 520 });
      await A(q('.env-seal'), [{ opacity: 0, transform: 'scale(2.2)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      // timbre + tampon
      await A(q('.env-stamp'), [{ opacity: 0, transform: 'scale(.4) rotate(-20deg)' }, { opacity: 1, transform: 'scale(1) rotate(4deg)' }], { duration: 320, easing: 'cubic-bezier(.3,1.5,.5,1)' });
      await A(q('.env-mark'), [{ opacity: 0, transform: 'rotate(-16deg) scale(2.4)' }, { opacity: .9, transform: 'rotate(-16deg) scale(1)' }], { duration: 260, easing: 'ease-in' });
      A(group, [{ translate: '0 0' }, { translate: '0 6px' }, { translate: '0 -2px' }, { translate: '0 0' }], { duration: 220 });
      await sleep(650);
      // envol vers le pôle Nord
      const pole = q('.pole');
      A(pole, [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 500 });
      const stage = q('.stage').getBoundingClientRect();
      const pr = $('.flag', pole).getBoundingClientRect();
      const tx = pr.left + pr.width / 2 - stage.left, ty = pr.top + pr.height / 2 - stage.top;
      const sparkles = setInterval(() => {
        const r = q('.env-front').getBoundingClientRect();
        if (!r.width) return;
        const s = document.createElement('span');
        s.className = 'sparkle';
        s.textContent = ['✨', '⭐', '❄️', '✦'][Math.floor(Math.random() * 4)];
        s.style.left = r.left + r.width / 2 + (Math.random() - 0.5) * r.width * 0.6 + 'px';
        s.style.top = r.top + r.height / 2 + (Math.random() - 0.5) * r.height * 0.5 + 'px';
        s.style.setProperty('--dx', (Math.random() - 0.7) * 60 + 'px');
        s.style.setProperty('--dy', 20 + Math.random() * 50 + 'px');
        s.style.fontSize = 12 + Math.random() * 14 + 'px';
        scene.appendChild(s);
        setTimeout(() => s.remove(), 950);
      }, 45);
      await A(group, [
        { transform: 'translate(0,0) rotate(0) scale(1)' },
        { transform: 'translate(-14px,16px) rotate(-7deg) scale(1.04)', offset: 0.14 },
        { transform: `translate(${tx * 0.35}px,${ty * 0.2}px) rotate(6deg) scale(.75)`, offset: 0.45 },
        { transform: `translate(${tx * 0.8}px,${ty * 0.75}px) rotate(14deg) scale(.3)`, offset: 0.8 },
        { transform: `translate(${tx}px,${ty}px) rotate(20deg) scale(.04)`, opacity: 0.2 }
      ], { duration: 1700, easing: 'cubic-bezier(.45,0,.55,1)' });
      clearInterval(sparkles);
      group.style.visibility = 'hidden';
      const burst = document.createElement('div');
      burst.className = 'burst';
      burst.style.left = pr.left + pr.width / 2 + 'px';
      burst.style.top = pr.top + pr.height / 2 + 'px';
      scene.appendChild(burst);
      A($('.flag', pole), [{ transform: 'scale(1)' }, { transform: 'scale(1.5) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 500 });
      await sleep(450);
    } catch (e) { console.warn(e); }

    const done = q('.mail-done');
    await A(done, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 480, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    q('[data-ok]').onclick = async () => {
      await A(scene, [{ opacity: 1 }, { opacity: 0 }], { duration: 350 });
      scene.remove();
      urls.forEach((x) => URL.revokeObjectURL(x));
      if (!modalStack.length) document.body.style.overflow = '';
      resolve();
    };
  });
}

// =========================================================
//   PARTAGE : export JPG A4 300 dpi
// =========================================================
const EXPORT_THEMES = {
  classique: { paper: '#fffdf7', head: '#b1262b', headInk: '#fff8ec', accent: '#1f5c3d', gold: '#c9972c', title: 'Mountains of Christmas', body: 'Nunito', text: '#3b2416', soft: '#7a5a43', card: '#ffffff', cardLine: '#ecdcc0', deco: '❄', titleScale: 1 },
  feerique: { paper: '#f7f9ff', head: '#16285c', headInk: '#fbe7a6', accent: '#2b6cb0', gold: '#e0b84a', title: 'Cinzel Decorative', body: 'Nunito', text: '#1b2558', soft: '#5a6890', card: '#ffffff', cardLine: '#dfe5f5', deco: '✦', titleScale: 0.78 },
  cartoon: { paper: '#fffaeb', head: '#ff4f5e', headInk: '#ffffff', accent: '#2bb3a3', gold: '#ffc93c', title: 'Fredoka', body: 'Fredoka', text: '#1d1d2b', soft: '#545468', card: '#ffffff', cardLine: '#1d1d2b', deco: '★', outline: true, titleScale: 0.95 }
};
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  const pushWord = (w) => {
    // découpe des mots trop longs
    while (ctx.measureText(w).width > maxW) {
      let k = w.length;
      while (k > 1 && ctx.measureText(w.slice(0, k)).width > maxW) k--;
      if (line) { lines.push(line); line = ''; }
      lines.push(w.slice(0, k));
      w = w.slice(k);
    }
    return w;
  };
  for (let w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW) { line = test; continue; }
    if (line) lines.push(line);
    line = pushWord(w);
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

async function buildPages(kid, items, onPage) {
  const T = EXPORT_THEMES[Settings.data.theme] || EXPORT_THEMES.classique;
  try {
    await Promise.all([
      document.fonts.load(`700 120px "${T.title}"`),
      document.fonts.load(`800 60px "${T.body}"`),
      document.fonts.load(`700 60px "${T.body}"`),
      document.fonts.load(`500 60px "${T.body}"`)
    ]);
  } catch (e) {}
  const W = 2480, H = 3508, M = 150, GAP = 60;
  const colW = (W - 2 * M - GAP) / 2;
  const PAD = 36, IMG_W = colW - 2 * PAD, IMG_H = 950;
  const nameFont = `800 64px "${T.body}", ${EMOJI_FONT}`;
  const shopFont = `700 50px "${T.body}", ${EMOJI_FONT}`;
  const meas = makeCanvas(10, 10).getContext('2d');

  // Mesure de chaque carte
  const cards = items.map(({ toy, num }) => {
    const sc = Math.min(IMG_W / toy.w, IMG_H / toy.h);
    const dw = Math.round(toy.w * sc), dh = Math.round(toy.h * sc);
    meas.font = nameFont;
    const nameLines = toy.name ? wrapText(meas, toy.name, IMG_W, 2) : [];
    meas.font = shopFont;
    const shopLines = toy.shop ? wrapText(meas, '📍 ' + toy.shop, IMG_W, 2) : [];
    const textH = (nameLines.length || shopLines.length ? 34 : 0) + nameLines.length * 78 + shopLines.length * 64;
    return { toy, num, dw, dh, nameLines, shopLines, h: PAD + dh + textH + PAD };
  });
  const rows = [];
  for (let i = 0; i < cards.length; i += 2) {
    const row = cards.slice(i, i + 2);
    rows.push({ cards: row, h: Math.max(...row.map((c) => c.h)) });
  }
  const FIRST_HEAD = 590, NEXT_HEAD = 300, FOOT = 220;
  const pages = [];
  let page = { rows: [], first: true }, y = FIRST_HEAD;
  for (const row of rows) {
    if (page.rows.length && y + row.h > H - FOOT) {
      pages.push(page);
      page = { rows: [], first: false };
      y = NEXT_HEAD;
    }
    page.rows.push({ ...row, y });
    y += row.h + GAP;
  }
  pages.push(page);

  let avatarBmp = null;
  if (kid.avatar && kid.avatar.type === 'photo' && kid.avatar.blob) { try { avatarBmp = await createImageBitmap(kid.avatar.blob); } catch (e) {} }
  const dateTxt = fmtDate(Date.now());
  const blobs = [];
  for (let p = 0; p < pages.length; p++) {
    if (onPage) onPage(p, pages.length);
    await nextFrame();
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    // fond + cadre
    ctx.fillStyle = T.paper; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.09; ctx.fillStyle = T.head; ctx.font = `120px ${EMOJI_FONT}`; ctx.textAlign = 'center';
    [[80, 120], [W - 80, 120], [80, H - 80], [W - 80, H - 80], [W / 2, H - 60]].forEach(([x, yy]) => ctx.fillText(T.deco, x, yy));
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = T.gold; ctx.globalAlpha = 0.55; ctx.lineWidth = 6; ctx.setLineDash([26, 18]);
    rrect(ctx, 60, 60, W - 120, H - 120, 60); ctx.stroke();
    ctx.restore();

    // en-tête
    if (pages[p].first) {
      const hx = M, hy = 130, hw = W - 2 * M, hh = 400;
      if (T.outline) { ctx.fillStyle = '#1d1d2b'; rrect(ctx, hx + 16, hy + 16, hw, hh, 70); ctx.fill(); }
      ctx.fillStyle = T.head; rrect(ctx, hx, hy, hw, hh, 70); ctx.fill();
      if (T.outline) { ctx.lineWidth = 9; ctx.strokeStyle = '#1d1d2b'; ctx.stroke(); }
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 5; ctx.setLineDash([22, 16]); rrect(ctx, hx + 24, hy + 24, hw - 48, hh - 48, 52); ctx.stroke(); ctx.restore();
      // avatar
      const ax = hx + 230, ay = hy + hh / 2, ar = 140;
      ctx.beginPath(); ctx.arc(ax, ay, ar + 16, 0, Math.PI * 2); ctx.fillStyle = T.gold; ctx.fill();
      ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
      if (avatarBmp) {
        ctx.save(); ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
        const s = Math.max((ar * 2) / avatarBmp.width, (ar * 2) / avatarBmp.height);
        ctx.drawImage(avatarBmp, ax - (avatarBmp.width * s) / 2, ay - (avatarBmp.height * s) / 2, avatarBmp.width * s, avatarBmp.height * s);
        ctx.restore();
      } else {
        ctx.font = `170px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000'; ctx.fillText((kid.avatar && kid.avatar.value) || '🎅', ax, ay + 8);
        ctx.textBaseline = 'alphabetic';
      }
      // textes
      const tx = hx + 440, tw = hw - 440 - 70;
      ctx.textAlign = 'left'; ctx.fillStyle = T.headInk;
      ctx.globalAlpha = 0.85; ctx.font = `800 58px "${T.body}"`; ctx.fillText('Ma liste au Père Noël', tx, hy + 120); ctx.globalAlpha = 1;
      let size = Math.round(170 * T.titleScale);
      ctx.font = `700 ${size}px "${T.title}"`;
      while (ctx.measureText(kid.name).width > tw && size > 70) { size -= 6; ctx.font = `700 ${size}px "${T.title}"`; }
      ctx.fillText(kid.name, tx, hy + 120 + 30 + size * 0.8);
      const sub = [kid.birth ? ageText(kid.birth) : '', plural(items.length, 'idée cadeau', 'idées cadeaux')].filter(Boolean).join('  ·  ');
      ctx.font = `700 54px "${T.body}"`; ctx.globalAlpha = 0.9; ctx.fillText(sub, tx, hy + hh - 64); ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = T.head; ctx.textAlign = 'left';
      let size = Math.round(110 * T.titleScale);
      ctx.font = `700 ${size}px "${T.title}"`;
      ctx.fillText(`Liste de ${kid.name}`, M, 220);
      ctx.font = `800 54px "${T.body}"`; ctx.fillStyle = T.soft; ctx.textAlign = 'right';
      ctx.fillText('(suite)', W - M, 210);
    }

    // cartes jouets
    for (const row of pages[p].rows) {
      for (let k = 0; k < row.cards.length; k++) {
        const cd = row.cards[k];
        const x = M + k * (colW + GAP), yy = row.y, h = row.h;
        ctx.save();
        if (T.outline) { ctx.fillStyle = '#1d1d2b'; rrect(ctx, x + 14, yy + 14, colW, h, 44); ctx.fill(); }
        else { ctx.shadowColor = 'rgba(60,40,20,.14)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 12; }
        ctx.fillStyle = T.card; rrect(ctx, x, yy, colW, h, 44); ctx.fill();
        ctx.restore();
        ctx.lineWidth = T.outline ? 7 : 4; ctx.strokeStyle = T.cardLine; rrect(ctx, x, yy, colW, h, 44); ctx.stroke();
        // photo entière
        const bmp = await createImageBitmap(cd.toy.blob);
        const ix = x + (colW - cd.dw) / 2, iy = yy + PAD;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, ix, iy, cd.dw, cd.dh);
        if (bmp.close) bmp.close();
        // numéro
        const nx = x + 74, ny = yy + 74;
        ctx.beginPath(); ctx.arc(nx, ny, 66, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.beginPath(); ctx.arc(nx, ny, 56, 0, Math.PI * 2); ctx.fillStyle = T.head; ctx.fill();
        if (T.outline) { ctx.lineWidth = 6; ctx.strokeStyle = '#1d1d2b'; ctx.stroke(); }
        ctx.fillStyle = T.headInk; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `900 ${cd.num > 99 ? 46 : 62}px "${T.body}"`;
        ctx.fillText(String(cd.num), nx, ny + 4);
        // coup de cœur en bas à droite de l'image
        if (cd.toy.fav) {
          const hx = ix + cd.dw - 64, hy = iy + cd.dh - 64;
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
          ctx.beginPath(); ctx.arc(hx, hy, 58, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore();
          ctx.font = `74px ${EMOJI_FONT}`; ctx.fillStyle = '#e0245e'; ctx.fillText('❤️', hx, hy + 4);
        }
        ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        // nom + magasin
        let ty = iy + cd.dh + (cd.nameLines.length || cd.shopLines.length ? 34 : 0);
        ctx.fillStyle = T.text; ctx.font = nameFont;
        for (const l of cd.nameLines) { ty += 64; ctx.fillText(l, x + PAD, ty); ty += 14; }
        ctx.fillStyle = T.soft; ctx.font = shopFont;
        for (const l of cd.shopLines) { ty += 52; ctx.fillText(l, x + PAD, ty); ty += 12; }
      }
    }

    // pied de page
    ctx.textAlign = 'center'; ctx.fillStyle = T.soft; ctx.font = `700 44px "${T.body}", ${EMOJI_FONT}`;
    ctx.fillText(`🎄 Lipeno  ·  Liste du ${dateTxt}${pages.length > 1 ? `  ·  Page ${p + 1}/${pages.length}` : ''}`, W / 2, H - 150);

    blobs.push(await canvasToBlob(c, 'image/jpeg', 0.9));
    c.width = c.height = 0;
  }
  if (avatarBmp && avatarBmp.close) avatarBmp.close();
  return blobs;
}

async function shareList(items) {
  const kid = view.kid;
  const prog = showProgress('Préparation de la liste…', '📜');
  let blobs;
  try {
    blobs = await buildPages(kid, items, (i, n) => prog.update(i + 0.5, n, n > 1 ? `Page ${i + 1} sur ${n}` : 'Mise en page…'));
  } catch (e) {
    console.error(e);
    await prog.close();
    toast("Oups, la liste n'a pas pu être préparée");
    return;
  }
  await prog.close();
  const base = `Liste-Noel-${slug(kid.name)}`;
  const files = blobs.map((b, i) => new File([b], `${base}${blobs.length > 1 ? '-' + (i + 1) : ''}.jpg`, { type: 'image/jpeg' }));
  openModal((s, m) => {
    s.innerHTML = `<div class="grab"></div>${closeX()}
      <h2 class="title-text">Liste prête !</h2>
      <p class="share-info">${plural(files.length, 'page', 'pages')} A4 · ${plural(items.length, 'jouet', 'jouets')}</p>
      <div class="pages-preview">${files.map((f) => `<img src="${m.url(f)}" alt="">`).join('')}</div>
      <div class="actions"><button class="btn" data-share>📤 Partager</button></div>
      <button class="link-btn" data-dl>Enregistrer les images</button>`;
    bindCloseX(s, m);
    const download = async () => {
      for (const f of files) {
        const a = document.createElement('a');
        a.href = m.url(f); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        await sleep(400);
      }
    };
    $('[data-dl]', s).onclick = download;
    $('[data-share]', s).onclick = async () => {
      if (navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files, title: `Liste de Noël de ${kid.name}` }); }
        catch (e) { if (e.name !== 'AbortError') download(); }
      } else {
        download();
      }
    };
  }, { onClose: () => { if (view.selecting) exitSelection(); } });
}

// =========================================================
//   PROFILS
// =========================================================
function openProfileEditor(kid) {
  return new Promise((resolve) => {
    const draft = kid ? { ...kid, avatar: { ...kid.avatar } } : { id: uid(), name: '', avatar: { type: 'emoji', value: AVATARS[Math.floor(Math.random() * AVATARS.length)] }, birth: '', wisdom: null, sentAt: null, psAt: null, createdAt: Date.now() };
    let saved = null;
    openModal((s, m) => {
      const today = new Date().toISOString().slice(0, 10);
      s.innerHTML = `<div class="grab"></div>${closeX()}
        <h2 class="title-text">${kid ? 'Modifier le profil' : 'Nouveau lutin'}</h2>
        <div class="avatar-preview"><div class="avatar" id="av-prev"></div></div>
        <label class="field"><span>Prénom</span><input class="input" name="name" maxlength="24" autocomplete="off" autocapitalize="words" placeholder="Ex. : Léa"></label>
        <div class="field"><span>Avatar</span>
          <div class="emoji-grid">${AVATARS.map((a) => `<button type="button" data-emo="${a}">${a}</button>`).join('')}<button type="button" class="photo-pick" data-photo aria-label="Choisir une photo">📷</button></div>
        </div>
        <label class="field"><span>Date de naissance <em>(pour afficher l'âge)</em></span><input class="input" type="date" name="birth" max="${today}"></label>
        <div class="actions"><button class="btn ghost" data-cancel>Annuler</button><button class="btn" data-save>Enregistrer</button></div>
        <input type="file" accept="image/*" hidden>`;
      bindCloseX(s, m);
      const nameI = $('[name=name]', s), birthI = $('[name=birth]', s), prev = $('#av-prev', s), fileI = $('input[type=file]', s);
      nameI.value = draft.name; birthI.value = draft.birth || '';
      const paint = () => {
        prev.innerHTML = draft.avatar.type === 'photo' ? `<img src="${m.url(draft.avatar.blob)}" alt="">` : draft.avatar.value;
        prev.style.animation = 'none'; void prev.offsetWidth; prev.style.animation = '';
        $$('[data-emo]', s).forEach((b) => b.classList.toggle('on', draft.avatar.type === 'emoji' && b.dataset.emo === draft.avatar.value));
        $('[data-photo]', s).classList.toggle('on', draft.avatar.type === 'photo');
      };
      paint();
      $$('[data-emo]', s).forEach((b) => (b.onclick = () => { draft.avatar = { type: 'emoji', value: b.dataset.emo }; paint(); }));
      $('[data-photo]', s).onclick = () => fileI.click();
      fileI.onchange = async () => {
        const f = fileI.files[0]; fileI.value = '';
        if (!f) return;
        const prog = showProgress('Préparation de la photo…', '📷');
        prog.update(0.4, 1, 'Un instant…');
        try { const r = await processImage(f, AVATAR_MAX); draft.avatar = { type: 'photo', blob: r.blob }; paint(); }
        catch (e) { toast("Cette photo n'a pas pu être lue 😕"); }
        await prog.close();
      };
      $('[data-cancel]', s).onclick = () => m.close();
      $('[data-save]', s).onclick = async () => {
        const name = nameI.value.trim();
        if (!name) { nameI.classList.remove('shake'); void nameI.offsetWidth; nameI.classList.add('shake'); nameI.focus(); toast('Indique un prénom 🙂'); return; }
        draft.name = name;
        draft.birth = birthI.value || '';
        await DB.putKid(draft);
        saved = draft;
        m.close();
      };
    }, { onClose: () => resolve(saved) });
  });
}

// =========================================================
//   ESPACE PARENTS
// =========================================================
function parentGate() {
  return new Promise((resolve) => {
    let ok = false;
    openModal((s, m) => {
      let a, b;
      const gen = () => { a = 3 + Math.floor(Math.random() * 7); b = 3 + Math.floor(Math.random() * 7); $('#gq', s).textContent = `${a} × ${b}`; };
      s.innerHTML = `${closeX()}
        <div style="text-align:center;font-size:2.6rem;margin-top:4px">🔒</div>
        <h2 class="title-text">Espace parents</h2>
        <div class="gate-q"><small>Pour entrer, combien font…</small><span id="gq"></span></div>
        <input class="input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="Réponse" style="text-align:center;font-size:1.6rem">
        <div class="actions"><button class="btn" data-ok>Entrer</button></div>`;
      bindCloseX(s, m);
      gen();
      const input = $('input', s);
      setTimeout(() => input.focus(), 350);
      const check = () => {
        if (parseInt(input.value, 10) === a * b) { ok = true; input.blur(); m.close(); return; }
        s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake');
        input.value = ''; gen(); toast('Ce n\'est pas la bonne réponse');
      };
      $('[data-ok]', s).onclick = check;
      input.onkeydown = (e) => { if (e.key === 'Enter') check(); };
    }, { center: true, onClose: () => resolve(ok) });
  });
}

let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

function openSettings() {
  openModal((s, m) => {
    const draw = async () => {
      const kids = await DB.kids();
      const counts = await Promise.all(kids.map((k) => DB.countToys(k.id)));
      let usage = '';
      try { const est = await navigator.storage.estimate(); usage = ` · ${(est.usage / 1048576).toFixed(1)} Mo utilisés`; } catch (e) {}
      const t = Settings.data.theme;
      s.innerHTML = `<div class="grab"></div>${closeX()}
        <h2 class="title-text">Paramètres</h2>

        <h3>🎨 Ambiance</h3>
        <div class="theme-pick">${Object.entries(THEMES).map(([k, v]) => `<button class="theme-card t-${k} ${k === t ? 'on' : ''}" data-pick="${k}"><div class="sw">Noël</div><div class="lbl">${v.label}</div></button>`).join('')}</div>

        <h3>❄️ Effets</h3>
        <label class="row-setting">Neige qui tombe<span class="switch"><input type="checkbox" data-snow ${Settings.data.snow ? 'checked' : ''}><i></i></span></label>

        <h3>👧 Profils</h3>
        ${kids.length ? kids.map((k, i) => `<div class="profile-row" data-id="${k.id}">
            <div class="avatar sm">${avatarHTML(k, m.url)}</div>
            <div class="nm">${esc(k.name)}<small>${[k.birth ? ageText(k.birth) : '', plural(counts[i], 'jouet', 'jouets'), k.sentAt ? '✉️ envoyée' : ''].filter(Boolean).join(' · ')}</small></div>
            <div class="tools">
              <button data-edit aria-label="Modifier">✏️</button>
              <button data-clear aria-label="Vider la liste">🧹</button>
              <button data-del aria-label="Supprimer">🗑️</button>
            </div>
          </div>`).join('') : '<p style="margin:0;color:var(--text-soft);font-weight:700">Aucun profil pour le moment.</p>'}
        <button class="btn ghost block small" data-add style="margin-top:6px">+ Ajouter un enfant</button>

        <h3>📖 Notice pour les parents</h3>
        <div class="notice">
          <details><summary>🤫 Le partage secret (appui long)</summary><div class="body">
            <p>Un <b>appui court</b> sur le bouton de partage <span aria-hidden="true">(la flèche ronde en bas à droite)</span> exporte <b>toute</b> la liste de l'enfant.</p>
            <p>Un <b>appui long</b> (environ une seconde) ouvre discrètement le <b>mode parents</b> : tous les jouets sont présélectionnés, touchez ceux que vous voulez retirer (jouets déjà achetés, idées peu pertinentes…), puis « Partager ».</p>
            <p>L'enfant continue de voir sa liste complète : rien n'est supprimé.</p>
          </div></details>
          <details><summary>🔢 Numéros et « qui prend quoi »</summary><div class="body">
            <p>Chaque jouet est numéroté. Les numéros restent les mêmes dans la liste partagée, même si certains jouets n'ont pas été sélectionnés : la famille peut dire « je prends le n°4 » et vous retrouvez le jouet immédiatement.</p>
            <p>Si un jouet est supprimé, les numéros suivants se décalent.</p>
          </div></details>
          <details><summary>📤 Le fichier partagé</summary><div class="body">
            <p>La liste est exportée en images JPG au format A4 (300 dpi) : prénom de l'enfant, photo entière de chaque jouet, son nom et le magasin s'ils sont indiqués, et un ❤️ sur les coups de cœur. Plusieurs pages sont créées si besoin.</p>
            <p>Les images peuvent être envoyées par WhatsApp, Messenger, e-mail… ou imprimées.</p>
          </div></details>
          <details><summary>📸 Ajouter des jouets</summary><div class="body">
            <p><b>Un jouet</b> : prendre une photo ou en choisir une. <b>Plusieurs jouets</b> : sélection multiple dans la galerie.</p>
            <p>En ajout multiple, le magasin saisi est repris automatiquement pour les photos suivantes, jusqu'à ce que vous le changiez. « Tout valider » enregistre les photos restantes d'un coup.</p>
            <p>Les photos (JPG, PNG, HEIC, WebP, AVIF…) sont réduites à 800 px et compressées en WebP pour prendre peu de place. Touchez un jouet pour le renommer, changer le magasin ou le supprimer.</p>
          </div></details>
          <details><summary>✉️ La lettre au Père Noël</summary><div class="body">
            <p>Le bouton « Envoyer au Père Noël » lance une animation et affiche la date d'envoi. Il devient ensuite « P.S. J'ai oublié… » : la liste reste toujours modifiable. Rien n'est réellement envoyé, tout reste sur ce téléphone.</p>
          </div></details>
          <details><summary>📲 Installer l'application</summary><div class="body">
            <p><b>iPhone / iPad (Safari)</b> : bouton Partager <span aria-hidden="true">⬆️</span> puis « Sur l'écran d'accueil ».</p>
            <p><b>Android (Chrome)</b> : menu ⋮ puis « Installer l'application » ou « Ajouter à l'écran d'accueil ».</p>
            <p>Une fois installée, l'application fonctionne sans connexion internet.</p>
          </div></details>
          <details><summary>💾 Où sont mes données ?</summary><div class="body">
            <p>Tout est enregistré uniquement sur ce téléphone, rien n'est envoyé sur internet. Désinstaller l'application ou effacer les données du navigateur supprime les listes.</p>
          </div></details>
        </div>

        <h3>🧹 Réinitialiser</h3>
        <div class="danger-zone">
          <button class="btn ghost block" data-reset-lists>Vider toutes les listes</button>
          <button class="btn danger block" data-wipe>Tout effacer (profils compris)</button>
        </div>
        ${installPrompt ? '<h3>📲 Installation</h3><button class="btn secondary block" data-install>Installer Lipeno sur ce téléphone</button>' : ''}
        <p class="foot-note">Lipeno v${APP_VERSION}${usage}<br>Données stockées uniquement sur ce téléphone</p>`;
      bindCloseX(s, m);

      $$('[data-pick]', s).forEach((b) => (b.onclick = () => {
        Settings.data.theme = b.dataset.pick; Settings.save(); applyTheme();
        $$('[data-pick]', s).forEach((x) => x.classList.toggle('on', x === b));
      }));
      $('[data-snow]', s).onchange = (e) => { Settings.data.snow = e.target.checked; Settings.save(); Snow.refresh(); };
      $('[data-add]', s).onclick = async () => { if (await openProfileEditor(null)) { draw(); renderRoute(); } };
      $$('.profile-row', s).forEach((row) => {
        const k = kids.find((x) => x.id === row.dataset.id);
        $('[data-edit]', row).onclick = async () => { if (await openProfileEditor(k)) { draw(); renderRoute(); } };
        $('[data-clear]', row).onclick = async () => {
          if (!(await confirmDialog({ title: `Vider la liste de ${k.name} ?`, message: 'Tous ses jouets, la date d\'envoi et la note de sagesse seront effacés.', ok: 'Vider', danger: true, emoji: '🧹' }))) return;
          await DB.clearToys(k.id);
          Object.assign(k, { sentAt: null, psAt: null, wisdom: null });
          await DB.putKid(k);
          toast('Liste vidée'); draw(); renderRoute();
        };
        $('[data-del]', row).onclick = async () => {
          if (!(await confirmDialog({ title: `Supprimer ${k.name} ?`, message: 'Le profil et toute sa liste seront définitivement effacés.', ok: 'Supprimer', danger: true, emoji: '🗑️' }))) return;
          await DB.delKid(k.id);
          toast('Profil supprimé'); draw(); renderRoute();
        };
      });
      $('[data-reset-lists]', s).onclick = async () => {
        if (!(await confirmDialog({ title: 'Vider toutes les listes ?', message: 'Les profils sont conservés, mais tous les jouets, dates d\'envoi et notes de sagesse sont effacés.', ok: 'Tout vider', danger: true, emoji: '🧹' }))) return;
        for (const k of kids) { await DB.clearToys(k.id); Object.assign(k, { sentAt: null, psAt: null, wisdom: null }); await DB.putKid(k); }
        toast('Toutes les listes ont été vidées'); draw(); renderRoute();
      };
      $('[data-wipe]', s).onclick = async () => {
        if (!(await confirmDialog({ title: 'Tout effacer ?', message: 'Tous les profils et toutes les listes seront définitivement supprimés.', ok: 'Tout effacer', danger: true, emoji: '⚠️' }))) return;
        await DB.wipe(); Shops.map.clear();
        toast('Tout a été effacé'); draw(); renderRoute();
      };
      const inst = $('[data-install]', s);
      if (inst) inst.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; draw(); };
    };
    draw();
  });
}

// =========================================================
//   ROUTAGE & DÉMARRAGE
// =========================================================
function renderRoute() {
  const m = location.hash.match(/^#\/kid\/([\w-]+)/);
  if (m) renderKid(m[1]); else renderHome();
}
addEventListener('hashchange', () => { modalStack.slice().reverse().forEach((md) => closeModal(md, undefined, true)); renderRoute(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !view.kid && !modalStack.length && $('.countdown')) $('.countdown').outerHTML = countdownHTML();
});

async function start() {
  Settings.load();
  Snow.init();
  applyTheme();
  try { await openDB(); await Shops.load(); }
  catch (e) {
    app.innerHTML = `<section class="empty" style="margin-top:40px"><div class="big">😢</div><h3 class="title-text">Stockage indisponible</h3><p>Le navigateur empêche l'enregistrement des données (navigation privée ?). Ouvrez Lipeno dans une fenêtre normale.</p></section>`;
    return;
  }
  renderRoute();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
}
start();
