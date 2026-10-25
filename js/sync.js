/* =========================================================
   Lipeno – synchronisation entre appareils
   100 % locale : aucun serveur. Les deux appareils s'échangent leurs
   coordonnées par QR code, puis communiquent directement par le Wi-Fi
   (WebRTC, chiffré). Secours : échange par fichier.
   ========================================================= */

let C; // contexte fourni par app.js
export function init(ctx) { C = ctx; }
export function open(mode) { if (mode === 'file') openFileSync(); else openLive(mode); }

const PROTO = 1;                // version du protocole d'échange
const CHUNK = 16 * 1024;        // taille des morceaux envoyés
const $ = (sel, root = document) => root.querySelector(sel);
class SyncError extends Error {}

// =========================================================
//   1. FUSION (identique des deux côtés)
// =========================================================
// Sérialisation stable (clés triées) pour comparer deux enregistrements
function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
// Le plus récent gagne ; en cas d'égalité, un choix stable (le même sur les deux appareils)
function newer(a, b) {
  const ua = a.updatedAt || 0, ub = b.updatedAt || 0;
  if (ua !== ub) return ua > ub ? a : b;
  return stable(a) >= stable(b) ? a : b;
}
function newerTomb(a, b) {
  if ((a.at || 0) !== (b.at || 0)) return (a.at || 0) > (b.at || 0) ? a : b;
  return stable(a) >= stable(b) ? a : b;
}
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const minN = (a, b) => (a == null ? (b ?? null) : b == null ? a : Math.min(a, b));
const maxN = (a, b) => (a == null ? (b ?? null) : b == null ? a : Math.max(a, b));

// Première réunion de deux profils créés séparément : on garde le meilleur de chacun
function fuseKids(a, b, id) {
  const w = newer(a, b), o = w === a ? b : a;
  const wPhoto = w.avatar && w.avatar.type === 'photo', oPhoto = o.avatar && o.avatar.type === 'photo';
  return {
    ...w,
    id,
    birth: w.birth || o.birth || '',
    avatar: !wPhoto && oPhoto ? o.avatar : w.avatar,
    wisdom: w.wisdom ?? o.wisdom ?? null,
    sentAt: minN(w.sentAt, o.sentAt),
    psAt: maxN(w.psAt, o.psAt),
    createdAt: Math.min(a.createdAt || 0, b.createdAt || 0),
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0)
  };
}

/* Calcule l'état final commun à partir de l'inventaire local (L) et distant (R).
   Le résultat est le même quel que soit l'appareil qui le calcule. */
export function planMerge(L, R) {
  const tombs = new Map();
  const addTomb = (t) => { const e = tombs.get(t.id); tombs.set(t.id, e ? newerTomb(e, t) : t); };
  L.tombs.forEach(addTomb);
  R.tombs.forEach(addTomb);
  const resolve = (id) => {
    for (let i = 0; i < 20; i++) {
      const t = tombs.get(id);
      if (t && t.kind === 'alias' && t.to !== id) id = t.to; else break;
    }
    return id;
  };
  const isDead = (id) => { const t = tombs.get(id); return !!t && t.kind === 'kid'; };
  const kidMap = (list) => {
    const m = new Map();
    for (const k of list) { const r = { ...k, id: resolve(k.id) }; const e = m.get(r.id); m.set(r.id, e ? newer(e, r) : r); }
    return m;
  };

  // Profils créés séparément avec le même prénom : on les réunit
  let LK = kidMap(L.kids), RK = kidMap(R.kids);
  const groups = new Map();
  const push = (k, side) => {
    const key = norm(k.name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { l: [], r: [] });
    groups.get(key)[side].push(k);
  };
  for (const k of LK.values()) if (!RK.has(k.id) && !isDead(k.id)) push(k, 'l');
  for (const k of RK.values()) if (!LK.has(k.id) && !isDead(k.id)) push(k, 'r');
  const matched = [];
  for (const g of groups.values()) {
    g.l.sort(byId); g.r.sort(byId);
    for (let i = 0; i < Math.min(g.l.length, g.r.length); i++) {
      const a = g.l[i], b = g.r[i];
      const keep = a.id < b.id ? a.id : b.id, drop = keep === a.id ? b.id : a.id;
      addTomb({ id: drop, kind: 'alias', to: keep, at: 0 });
      matched.push({ id: keep, name: a.name });
    }
  }
  const matchedIds = new Set(matched.map((x) => x.id));
  LK = kidMap(L.kids); RK = kidMap(R.kids);

  const kids = new Map();
  for (const id of new Set([...LK.keys(), ...RK.keys()])) {
    if (isDead(id)) continue;
    const a = LK.get(id), b = RK.get(id);
    kids.set(id, a && b ? (matchedIds.has(id) ? fuseKids(a, b, id) : newer(a, b)) : (a || b));
  }

  // Jouets
  const toyMap = (list) => new Map(list.map((t) => [t.id, { ...t, kidId: resolve(t.kidId) }]));
  const LT = toyMap(L.toys), RT = toyMap(R.toys);
  const toys = new Map();
  for (const id of new Set([...LT.keys(), ...RT.keys()])) {
    const tb = tombs.get(id);
    if (tb && tb.kind === 'toy') continue;
    const a = LT.get(id), b = RT.get(id);
    const t = a && b ? newer(a, b) : (a || b);
    if (!kids.has(t.kidId)) { addTomb({ id, kind: 'toy', at: (tombs.get(t.kidId) || {}).at || 0 }); continue; }
    toys.set(id, t);
  }

  // Ce qu'il faut envoyer / recevoir (point de vue local)
  const send = [], recv = [];
  for (const id of toys.keys()) {
    const inL = LT.has(id), inR = RT.has(id);
    if (inL && !inR) send.push('t:' + id);
    if (!inL && inR) recv.push('t:' + id);
  }
  const avIds = (list) => new Set(list.map((k) => k.avatar && k.avatar.type === 'photo' && k.avatar.id).filter(Boolean));
  const avL = avIds(L.kids), avR = avIds(R.kids);
  for (const k of kids.values()) {
    const id = k.avatar && k.avatar.type === 'photo' && k.avatar.id;
    if (!id) continue;
    if (avL.has(id) && !avR.has(id)) send.push('a:' + id);
    if (!avL.has(id) && avR.has(id)) recv.push('a:' + id);
  }

  const sorted = (m) => [...m.values()].sort(byId);
  const finalKids = sorted(kids), finalToys = sorted(toys), finalTombs = sorted(tombs);
  const sig = (k, t, d) => stable([[...k].sort(byId), [...t].sort(byId), [...d].sort(byId)]);
  const finalSig = sig(finalKids, finalToys, finalTombs);
  const changedL = sig(L.kids, L.toys, L.tombs) !== finalSig;
  const changedR = sig(R.kids, R.toys, R.tombs) !== finalSig;
  const count = (keys) => keys.filter((k) => k.startsWith('t:')).length;

  return {
    kids: finalKids, toys: finalToys, tombs: finalTombs, send, recv, changedL, changedR,
    nothing: !changedL && !changedR,
    stats: {
      toysIn: count(recv),
      toysOut: count(send),
      toysUpdatedHere: finalToys.filter((t) => LT.has(t.id) && stable(t) !== stable(LT.get(t.id))).length,
      toysRemovedHere: [...LT.keys()].filter((id) => !toys.has(id)).length,
      kidsMatched: matched.map((x) => x.name),
      kidsNewHere: finalKids.filter((k) => !LK.has(k.id)).map((k) => k.name),
      kidsNewThere: finalKids.filter((k) => !RK.has(k.id)).map((k) => k.name),
      kidsRemovedHere: [...LK.values()].filter((k) => !kids.has(k.id)).map((k) => k.name)
    }
  };
}

// =========================================================
//   2. DONNÉES LOCALES
// =========================================================
async function loadLocal() {
  const [kids, toys, tombs] = await Promise.all([C.DB.kids(), C.DB.allToys(), C.DB.tombs()]);
  const blobs = new Map();
  const kidsMeta = kids.map((k) => {
    const m = { ...k };
    if (k.avatar) {
      const { blob, ...a } = k.avatar;
      if (a.type === 'photo') {
        if (!a.id) a.id = 'av-' + k.id;
        if (blob) blobs.set('a:' + a.id, blob);
      }
      m.avatar = a;
    }
    return m;
  });
  const toysMeta = toys.map((t) => { const { blob, ...m } = t; if (blob) blobs.set('t:' + t.id, blob); return m; });
  return { manifest: { kids: kidsMeta, toys: toysMeta, tombs }, blobs };
}

// Applique l'état final en une seule opération (tout ou rien)
async function applyPlan(plan, local, received) {
  const blobFor = (key) => local.blobs.get(key) || received.get(key);
  for (const t of plan.toys) if (!blobFor('t:' + t.id)) throw new SyncError('Une photo de jouet est manquante, la synchronisation a été annulée.');
  const finalKidIds = new Set(plan.kids.map((k) => k.id));
  const finalToyIds = new Set(plan.toys.map((t) => t.id));
  const oldKid = new Map(local.manifest.kids.map((k) => [k.id, k]));
  const oldToy = new Map(local.manifest.toys.map((t) => [t.id, t]));
  await C.run(['kids', 'toys', 'tombs'], 'readwrite', (tx) => {
    const ks = tx.objectStore('kids'), ts = tx.objectStore('toys'), tb = tx.objectStore('tombs');
    for (const k of local.manifest.kids) if (!finalKidIds.has(k.id)) ks.delete(k.id);
    for (const k of plan.kids) {
      const old = oldKid.get(k.id);
      if (old && stable(old) === stable(k)) continue;
      const rec = { ...k };
      if (k.avatar) {
        rec.avatar = { ...k.avatar };
        if (k.avatar.type === 'photo') {
          const b = blobFor('a:' + k.avatar.id);
          if (b) rec.avatar.blob = b; else rec.avatar = { type: 'emoji', value: '🎅' };
        }
      }
      ks.put(rec);
    }
    for (const t of local.manifest.toys) if (!finalToyIds.has(t.id)) ts.delete(t.id);
    for (const t of plan.toys) {
      const old = oldToy.get(t.id);
      if (old && stable(old) === stable(t)) continue;
      ts.put({ ...t, blob: blobFor('t:' + t.id) });
    }
    tb.clear();
    for (const x of plan.tombs) tb.put(x);
  });
}

// =========================================================
//   3. CODES QR : coordonnées de connexion compactées
// =========================================================
const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const PREFIX = 'LPN1:';
function b45enc(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      const n = bytes[i] * 256 + bytes[i + 1];
      s += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)];
    } else {
      const n = bytes[i];
      s += B45[n % 45] + B45[Math.floor(n / 45)];
    }
  }
  return s;
}
function b45dec(str) {
  const out = [];
  for (let i = 0; i < str.length; i += 3) {
    const v = [...str.slice(i, i + 3)].map((ch) => { const k = B45.indexOf(ch); if (k < 0) throw new Error('b45'); return k; });
    if (v.length === 3) {
      const n = v[0] + v[1] * 45 + v[2] * 2025;
      if (n > 65535) throw new Error('b45');
      out.push(n >> 8, n & 255);
    } else if (v.length === 2) {
      const n = v[0] + v[1] * 45;
      if (n > 255) throw new Error('b45');
      out.push(n);
    } else throw new Error('b45');
  }
  return Uint8Array.from(out);
}
class W {
  constructor() { this.a = []; }
  u8(n) { this.a.push(n & 255); }
  u16(n) { this.a.push((n >> 8) & 255, n & 255); }
  bytes(b) { for (const x of b) this.a.push(x); }
  str(s) { const b = new TextEncoder().encode(s); if (b.length > 255) throw new Error('long'); this.u8(b.length); this.bytes(b); }
  out() { return Uint8Array.from(this.a); }
}
class R {
  constructor(b) { this.b = b; this.i = 0; }
  u8() { if (this.i >= this.b.length) throw new Error('eof'); return this.b[this.i++]; }
  u16() { return (this.u8() << 8) | this.u8(); }
  bytes(n) { if (this.i + n > this.b.length) throw new Error('eof'); const r = this.b.slice(this.i, this.i + n); this.i += n; return r; }
  str() { return new TextDecoder().decode(this.bytes(this.u8())); }
  rest() { return this.b.slice(this.i); }
}
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0'));
function ipv6Bytes(s) {
  if (s.includes('.')) return null;
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [], tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (parts.length === 1 && fill !== 0)) return null;
  const groups = [...head, ...Array(parts.length === 2 ? fill : 0).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const out = [];
  groups.forEach((g) => { const n = parseInt(g, 16); out.push(n >> 8, n & 255); });
  return out;
}
const SETUPS = ['actpass', 'active', 'passive'];

function parseSdp(sdp) {
  const lines = sdp.split(/\r?\n/);
  const get = (p) => { const l = lines.find((x) => x.startsWith(p)); return l ? l.slice(p.length).trim() : ''; };
  const [algo, fpHex] = get('a=fingerprint:').split(/\s+/);
  const seen = new Set();
  const cands = [];
  for (const l of lines) {
    if (!l.startsWith('a=candidate:')) continue;
    const p = l.slice(12).split(/\s+/);
    if ((p[2] || '').toLowerCase() !== 'udp' || p[7] !== 'host') continue;
    const key = p[4] + ' ' + p[5];
    if (seen.has(key)) continue;
    seen.add(key);
    cands.push({ addr: p[4], port: +p[5] });
  }
  const rank = (c) => (/^\d+\.\d+\.\d+\.\d+$/.test(c.addr) ? 0 : /\.local$/i.test(c.addr) ? 1 : /^fe80/i.test(c.addr) ? 3 : 2);
  cands.sort((a, b) => rank(a) - rank(b));
  return { ufrag: get('a=ice-ufrag:'), pwd: get('a=ice-pwd:'), algo: (algo || '').toLowerCase(), fpHex: fpHex || '', setup: get('a=setup:') || 'actpass', cands: cands.slice(0, 6) };
}
function buildSdp(o) {
  const L = ['v=0', `o=- ${Math.floor(Math.random() * 1e15)} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0'];
  o.cands.forEach((c, i) => L.push(`a=candidate:${1000 + i} 1 udp ${2113937151 - i * 256} ${c.addr} ${c.port} typ host`));
  L.push(`a=ice-ufrag:${o.ufrag}`, `a=ice-pwd:${o.pwd}`, 'a=ice-options:trickle', `a=fingerprint:sha-256 ${o.fpHex}`,
    `a=setup:${o.setup}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144');
  return L.join('\r\n') + '\r\n';
}
async function zip(bytes, mode) {
  const cs = mode === 'in' ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
// kind : 1 = invitation, 2 = réponse
async function encodeSignal({ kind, tag, sdp }) {
  const p = parseSdp(sdp);
  const fp = p.fpHex.split(':').map((h) => parseInt(h, 16));
  const setup = Math.max(0, SETUPS.indexOf(p.setup));
  const w = new W();
  w.u8(kind);
  const compact = p.algo === 'sha-256' && fp.length === 32 && fp.every((x) => x >= 0 && x < 256) && p.ufrag && p.pwd && p.cands.length;
  if (compact) {
    try {
      const body = new W();
      body.str(p.ufrag); body.str(p.pwd); body.bytes(fp);
      body.u8(p.cands.length);
      for (const c of p.cands) {
        const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(c.addr);
        const uu = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i.exec(c.addr);
        const v6 = ipv6Bytes(c.addr);
        if (v4) { body.u8(4); body.bytes(v4.slice(1).map(Number)); }
        else if (uu) { body.u8(0x75); body.bytes(uu.slice(1).join('').match(/../g).map((h) => parseInt(h, 16))); }
        else if (v6) { body.u8(6); body.bytes(v6); }
        else { body.u8(0x6e); body.str(c.addr); }
        body.u16(c.port);
      }
      w.u8(setup << 2); w.bytes(tag); w.bytes(body.out());
      return PREFIX + b45enc(w.out());
    } catch (e) { /* format inhabituel : on passe au format complet */ }
  }
  // Format complet (secours) : description entière, compressée si possible
  const raw = new TextEncoder().encode(sdp);
  let flags = 1, data = raw;
  if ('CompressionStream' in window) { try { data = await zip(raw, 'out'); flags |= 2; } catch (e) { data = raw; } }
  const f = new W(); f.u8(kind); f.u8(flags | (setup << 2)); f.bytes(tag); f.bytes(data);
  return PREFIX + b45enc(f.out());
}
async function decodeSignal(text) {
  text = String(text || '').replace(/^[\r\n\t]+|[\r\n\t]+$/g, ''); // pas de trim : l'espace fait partie de l'alphabet
  if (!text.startsWith(PREFIX)) throw new Error('notlipeno');
  const r = new R(b45dec(text.slice(PREFIX.length)));
  const kind = r.u8(), flags = r.u8(), tag = r.bytes(3);
  if (kind !== 1 && kind !== 2) throw new Error('kind');
  if (flags & 1) {
    let data = r.rest();
    if (flags & 2) {
      if (!('DecompressionStream' in window)) throw new Error('nodecomp');
      data = await zip(data, 'in');
    }
    return { kind, tag, sdp: new TextDecoder().decode(data) };
  }
  const ufrag = r.str(), pwd = r.str(), fp = r.bytes(32), n = r.u8(), cands = [];
  for (let i = 0; i < n; i++) {
    const t = r.u8();
    let addr;
    if (t === 4) addr = [...r.bytes(4)].join('.');
    else if (t === 0x75) { const h = hex(r.bytes(16)).join(''); addr = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`; }
    else if (t === 6) { const b = r.bytes(16), g = []; for (let k = 0; k < 16; k += 2) g.push(((b[k] << 8) | b[k + 1]).toString(16)); addr = g.join(':'); }
    else if (t === 0x6e) addr = r.str();
    else throw new Error('cand');
    cands.push({ addr, port: r.u16() });
  }
  const setup = SETUPS[(flags >> 2) & 3] || 'actpass';
  return { kind, tag, sdp: buildSdp({ ufrag, pwd, fpHex: hex(fp).map((h) => h.toUpperCase()).join(':'), setup, cands }) };
}
const sameTag = (a, b) => a && b && a.length === b.length && [...a].every((x, i) => x === b[i]);

// =========================================================
//   4. AFFICHAGE ET LECTURE DES QR CODES
// =========================================================
let qrLib = null;
async function renderQR(box, text) {
  if (!qrLib) qrLib = (await import('../lib/qr/qrcode.mjs')).default;
  const qr = qrLib(0, 'M');
  qr.addData(text, 'Alphanumeric');
  qr.make();
  const n = qr.getModuleCount(), quiet = 4, cell = 10, size = (n + quiet * 2) * cell;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  cv.className = 'qr-canvas';
  const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
  x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) x.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  box.replaceChildren(cv);
  box.dataset.qr = text;
}
let jsqrPromise = null;
function loadJsQR() {
  return jsqrPromise ||= new Promise((resolve, reject) => {
    if (window.jsQR) return resolve(window.jsQR);
    const s = document.createElement('script');
    s.src = new URL('../lib/qr/jsQR.js', import.meta.url).href;
    s.onload = () => resolve(window.jsQR);
    s.onerror = () => { jsqrPromise = null; reject(new Error('jsQR')); };
    document.head.appendChild(s);
  });
}
async function makeDecoder() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => { const r = await det.detect(video); return r.length ? r[0].rawValue : null; };
      }
    } catch (e) { /* lecteur intégré indisponible */ }
  }
  const jsQR = await loadJsQR();
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const side = Math.min(vw, vh), size = Math.min(side, 800);
    cv.width = cv.height = size;
    cx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
    const img = cx.getImageData(0, 0, size, size);
    const r = jsQR(img.data, size, size, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  };
}
async function getCamera() {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
}
const stopStream = (st) => { if (st) st.getTracks().forEach((t) => t.stop()); };

let lastHint = '', lastHintAt = 0;
function hint(msg) {
  if (msg === lastHint && Date.now() - lastHintAt < 3000) return;
  lastHint = msg; lastHintAt = Date.now();
  C.toast(msg);
}

// =========================================================
//   5. SYNCHRONISATION DIRECTE (Wi-Fi)
// =========================================================
// --- Journal technique (affiché en cas d'échec, pour comprendre ce qui bloque) ---
function dlog(S, msg) {
  if (!S.logs) return;
  S.logs.push(`${((performance.now() - S.t0) / 1000).toFixed(1)}s  ${msg}`);
}
function deviceInfo() {
  const ua = navigator.userAgent;
  const os = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Linux';
  const br = /CriOS|Chrome\/(\d+)/.exec(ua) ? 'Chrome ' + ((/Chrome\/(\d+)/.exec(ua) || [])[1] || '') : /Firefox\/(\d+)/.test(ua) ? 'Firefox' : /Version\/([\d.]+).*Safari/.test(ua) ? 'Safari ' + /Version\/([\d.]+)/.exec(ua)[1] : 'navigateur';
  const pwa = window.matchMedia && matchMedia('(display-mode: standalone)').matches ? ' · appli installée' : '';
  return `${os} · ${br}${pwa}`;
}
function candKinds(sdp) {
  const c = parseSdp(sdp).cands;
  if (!c.length) return 'aucune';
  const n = { 'IPv4': 0, 'masquée (.local)': 0, 'IPv6': 0, 'autre': 0 };
  c.forEach((x) => { n[/^\d+\.\d+\.\d+\.\d+$/.test(x.addr) ? 'IPv4' : /\.local$/i.test(x.addr) ? 'masquée (.local)' : x.addr.includes(':') ? 'IPv6' : 'autre']++; });
  const v4 = c.filter((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x.addr)).map((x) => x.addr.replace(/\.\d+$/, '.x'));
  return Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${k}×${v}`).join(', ') + (v4.length ? ` [${v4.join(' ')}]` : '');
}
async function statsSummary(pc) {
  try {
    const r = await pc.getStats();
    const pairs = [], remote = {}, local = {};
    r.forEach((s) => {
      if (s.type === 'candidate-pair') pairs.push(s.state + (s.nominated ? '*' : '') + (s.requestsSent ? ` (${s.requestsSent}→/${s.responsesReceived || 0}←)` : ''));
      if (s.type === 'remote-candidate') remote[s.candidateType] = (remote[s.candidateType] || 0) + 1;
      if (s.type === 'local-candidate') local[s.candidateType] = (local[s.candidateType] || 0) + 1;
    });
    const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}×${v}`).join(', ') || 'aucun';
    return `paires testées : ${pairs.join(' ; ') || 'aucune'} · candidats locaux : ${fmt(local)} · distants : ${fmt(remote)}`;
  } catch (e) { return 'statistiques indisponibles'; }
}

function openLive(mode) {
  const S = { mode, pc: null, dc: null, stream: null, stopScan: null, timers: [], inbox: [], waiters: [], received: new Map(), cur: null };
  S.t0 = performance.now();
  S.logs = [];
  dlog(S, `${mode === 'invite' ? 'INVITE' : 'REJOINT'} · ${deviceInfo()} · Lipeno ${C.APP_VERSION}`);
  S.aborted = new Promise((_, rej) => { S.abort = rej; });
  S.aborted.catch(() => {});
  C.openModal((sheet, m) => {
    S.sheet = sheet; S.m = m;
    (mode === 'invite' ? startInvite : startJoin)(S).catch((e) => fail(S, e));
  }, { onClose: () => cleanup(S) });
}
function cleanup(S) {
  S.closedByUser = true;
  if (S.stopScan) S.stopScan();
  stopStream(S.stream); S.stream = null;
  S.timers.forEach(clearTimeout);
  if (!S.finished) { try { if (S.dc && S.dc.readyState === 'open') S.dc.send(JSON.stringify({ t: 'cancel' })); } catch (e) {} }
  setTimeout(() => { try { S.pc && S.pc.close(); } catch (e) {} }, 300);
}
function setView(S, html, closable = true) {
  if (S.closedByUser) return;
  S.sheet.innerHTML = `<div class="grab"></div>${closable ? C.closeX() : ''}${html}`;
  if (closable) C.bindCloseX(S.sheet, S.m);
  S.m.dismissible = closable;
}
const peerName = (d) => (d && d.name ? `${d.emoji || '📱'} ${C.esc(d.name)}` : "l'autre appareil");
function viewWorking(S, title, text, emoji = '✨', closable = true) {
  setView(S, `<div class="sync-icon">${emoji}</div><h2 class="title-text">${title}</h2>${text ? `<p class="sync-lead">${text}</p>` : ''}<div class="sync-spinner"><i></i><i></i><i></i></div>`, closable);
}
function fail(S, e) {
  if (S.finished || S.closedByUser) return;
  console.warn(e);
  dlog(S, 'ERREUR : ' + (e && e.message ? e.message.slice(0, 120) : e));
  const msg = e instanceof SyncError ? e.message : "Une erreur est survenue pendant la synchronisation.";
  viewError(S, 'Oups…', msg);
}
function viewError(S, title, text) {
  if (S.stopScan) { S.stopScan(); S.stopScan = null; }
  stopStream(S.stream); S.stream = null;
  S.failed = true;
  const diag = S.logs && S.logs.length ? `<details class="diag"><summary>🔧 Détails techniques</summary><pre>${C.esc(S.logs.join('\n'))}</pre></details>` : '';
  setView(S, `<div class="sync-icon">😕</div><h2 class="title-text">${title}</h2><p class="sync-lead">${text}</p>
    <div class="actions col"><button class="btn" data-retry>🔁 Réessayer</button><button class="btn ghost" data-file>📤 Utiliser le partage par fichier</button></div>${diag}`);
  $('[data-retry]', S.sheet).onclick = async () => { await S.m.close(); open(S.mode); };
  $('[data-file]', S.sheet).onclick = async () => { await S.m.close(); openFileSync(); };
}
function viewScan(S, title, text, extra = '') {
  setView(S, `<h2 class="title-text">${title}</h2><p class="sync-lead">${text}</p>
    <div class="scan-box"><video playsinline muted autoplay></video><div class="scan-frame"><i></i><i></i><i></i><i></i></div></div>${extra}`);
  return $('video', S.sheet);
}
async function startScanning(S, video, onText) {
  try {
    if (!S.stream) S.stream = await getCamera();
  } catch (e) {
    throw new SyncError("Impossible d'utiliser la caméra. Autorisez-la dans les réglages du navigateur pour scanner le QR code, ou utilisez le partage par fichier.");
  }
  video.srcObject = S.stream;
  video.muted = true;
  await video.play().catch(() => {});
  const decode = await makeDecoder();
  let stop = false, busy = false;
  const tick = async () => {
    if (stop) return;
    if (!busy && video.readyState >= 2) {
      busy = true;
      try { const t = await decode(video); if (t && !stop) await onText(t); } catch (e) { /* image suivante */ }
      busy = false;
    }
    if (!stop) setTimeout(tick, 150);
  };
  window.__lipenoScan = (t) => { if (!stop) onText(t); }; // utilisé pour les tests automatiques
  S.stopScan = () => { stop = true; if (window.__lipenoScan) delete window.__lipenoScan; };
  tick();
}
function newPC(S) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  pc.oniceconnectionstatechange = () => dlog(S, 'ICE : ' + pc.iceConnectionState);
  pc.onicegatheringstatechange = () => dlog(S, 'collecte : ' + pc.iceGatheringState);
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    dlog(S, 'connexion : ' + st);
    // Avant la connexion, un échec peut n'être que passager (l'autre appareil peut encore nous joindre) :
    // on laisse le délai d'attente décider.
    if (!S.connected) return;
    if ((st === 'failed' || st === 'closed' || st === 'disconnected') && !S.finished && !S.closedByUser) {
      if (st === 'disconnected') { S.timers.push(setTimeout(() => { if (pc.connectionState !== 'connected' && !S.finished) S.abort(new SyncError(S.connected ? 'La connexion a été coupée. Gardez les deux appareils allumés, l\'application ouverte, et réessayez.' : notConnected)); }, 4000)); return; }
      S.abort(new SyncError('La connexion a été coupée. Gardez les deux appareils allumés, l\'application ouverte, et réessayez.'));
    }
  };
  return pc;
}
const notConnected = "Les deux appareils n'ont pas réussi à se connecter. Vérifiez qu'ils sont sur le même Wi-Fi (pas un Wi-Fi « invité »), puis réessayez. Sinon, le partage par fichier fonctionne toujours.";
function gather(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const t = setTimeout(resolve, 4000);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } });
  });
}
function connectTimeout(S, ms) {
  S.timers.push(setTimeout(async () => {
    if (S.connected || S.finished || S.closedByUser) return;
    if (S.pc) dlog(S, await statsSummary(S.pc));
    fail(S, new SyncError(notConnected));
  }, ms));
}
const hasCandidates = (sdp) => /a=candidate:\S+ \d+ udp .* typ host/i.test(sdp);

// --- L'appareil qui invite ---
async function startInvite(S) {
  viewWorking(S, 'Préparation…', "Si on vous le demande, autorisez la caméra : elle servira à scanner la réponse de l'autre appareil.", '📲');
  // Caméra allumée pendant la préparation : les navigateurs donnent alors l'adresse locale exacte, ce qui facilite la connexion
  try { S.stream = await getCamera(); dlog(S, 'caméra : OK'); } catch (e) { S.stream = null; dlog(S, 'caméra : refusée (' + e.name + ')'); }
  if (S.closedByUser) return;
  S.pc = newPC(S);
  S.dc = S.pc.createDataChannel('lipeno', { ordered: true });
  setupChannel(S, S.dc);
  await S.pc.setLocalDescription(await S.pc.createOffer());
  await gather(S.pc);
  if (S.closedByUser) return;
  if (!hasCandidates(S.pc.localDescription.sdp)) throw new SyncError('Aucun réseau détecté. Connectez cet appareil au Wi-Fi puis réessayez.');
  S.tag = crypto.getRandomValues(new Uint8Array(3));
  S.offerText = await encodeSignal({ kind: 1, tag: S.tag, sdp: S.pc.localDescription.sdp });
  dlog(S, `mes adresses : ${candKinds(S.pc.localDescription.sdp)} · QR ${S.offerText.length} car.`);
  showOffer(S);
}
function showOffer(S) {
  setView(S, `<h2 class="title-text">Inviter un appareil</h2>
    <ol class="sync-steps"><li>Sur l'autre appareil : <b>Paramètres → Rejoindre</b></li><li>Scannez ce code avec lui</li></ol>
    <div class="qr-box" id="qr-offer"></div>
    <div class="actions"><button class="btn" data-next>📷 Puis scanner sa réponse</button></div>`);
  renderQR($('#qr-offer', S.sheet), S.offerText);
  $('[data-next]', S.sheet).onclick = () => scanAnswer(S).catch((e) => fail(S, e));
}
async function scanAnswer(S) {
  const video = viewScan(S, 'Scanner la réponse', "Visez le QR code affiché maintenant sur l'autre appareil.", '<button class="link-btn" data-back>← Revoir mon code</button>');
  $('[data-back]', S.sheet).onclick = () => { if (S.stopScan) S.stopScan(); showOffer(S); };
  let handled = false;
  await startScanning(S, video, async (text) => {
    if (handled) return;
    let sig;
    try { sig = await decodeSignal(text); } catch (e) { hint("Ce QR code n'est pas un code Lipeno"); return; }
    if (sig.kind === 1) { hint("C'est un code d'invitation : scannez la réponse affichée par l'autre appareil"); return; }
    if (!sameTag(sig.tag, S.tag)) { hint('Cette réponse correspond à une autre invitation'); return; }
    handled = true;
    S.stopScan(); // caméra gardée allumée jusqu'à la connexion (Safari et Chrome autorisent alors mieux le réseau local)
    dlog(S, `réponse reçue : adresses ${candKinds(sig.sdp)}`);
    viewWorking(S, 'Connexion…', 'Les deux appareils se connectent', '🔗');
    try { await S.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp }); }
    catch (e) { dlog(S, 'réponse refusée : ' + e.name + ' ' + (e.message || '').slice(0, 160)); throw new SyncError('Ce code de réponse est illisible. Recommencez depuis le début.'); }
    connectTimeout(S, 45000);
  });
}

// --- L'appareil qui rejoint ---
async function startJoin(S) {
  const video = viewScan(S, 'Rejoindre', "Scannez le QR code affiché sur l'appareil qui invite (Paramètres → Inviter).");
  let handled = false;
  await startScanning(S, video, async (text) => {
    if (handled) return;
    let sig;
    try { sig = await decodeSignal(text); } catch (e) { hint("Ce QR code n'est pas un code Lipeno"); return; }
    if (sig.kind !== 1) { hint("C'est un code de réponse : scannez le code d'invitation de l'autre appareil"); return; }
    handled = true;
    S.stopScan(); // la caméra reste allumée jusqu'à la connexion (meilleure connexion locale)
    dlog(S, `invitation reçue : adresses ${candKinds(sig.sdp)}`);
    viewWorking(S, 'Préparation de la réponse…', '', '📲');
    try {
      S.pc = newPC(S);
      S.pc.ondatachannel = (e) => { S.dc = e.channel; setupChannel(S, S.dc); };
      await S.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
      await S.pc.setLocalDescription(await S.pc.createAnswer());
      await gather(S.pc);
    } catch (e) {
      dlog(S, 'invitation refusée : ' + e.name + ' ' + (e.message || '').slice(0, 160));
      throw new SyncError("Ce code d'invitation est illisible. Créez une nouvelle invitation sur l'autre appareil.");
    }
    if (S.closedByUser) return;
    if (!hasCandidates(S.pc.localDescription.sdp)) throw new SyncError('Aucun réseau détecté. Connectez cet appareil au Wi-Fi puis réessayez.');
    const answer = await encodeSignal({ kind: 2, tag: sig.tag, sdp: S.pc.localDescription.sdp });
    dlog(S, `mes adresses : ${candKinds(S.pc.localDescription.sdp)} · QR ${answer.length} car.`);
    if (S.connected) return;
    setView(S, `<h2 class="title-text">Presque fini !</h2>
      <p class="sync-lead">Sur l'appareil qui invite, touchez <b>« Puis scanner sa réponse »</b> et scannez ce code :</p>
      <div class="qr-box" id="qr-answer"></div>
      <p class="sync-wait"><span class="sync-spinner small"><i></i><i></i><i></i></span> En attente de connexion…</p>`);
    renderQR($('#qr-answer', S.sheet), answer);
    connectTimeout(S, 120000);
  });
}

// --- Canal de données ---
function setupChannel(S, dc) {
  dc.binaryType = 'arraybuffer';
  dc.bufferedAmountLowThreshold = 256 * 1024;
  dc.onopen = () => onConnected(S);
  dc.onclose = () => {
    S.closed = true;
    if (!S.finished) S.abort(new SyncError("La connexion a été coupée. Gardez les deux appareils allumés, l'application ouverte, et réessayez."));
    deliver(S, { t: 'closed' });
  };
  dc.onmessage = (e) => {
    if (typeof e.data === 'string') {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.t === 'blob') {
        S.cur = { key: msg.key, type: msg.type || '', size: msg.size || 0, parts: [], got: 0 };
        if (!S.cur.size) finishBlob(S);
        return;
      }
      if (msg.t === 'cancel') { S.abort(new SyncError("La synchronisation a été annulée sur l'autre appareil.")); return; }
      deliver(S, msg);
    } else {
      const c = S.cur;
      if (!c) return;
      c.parts.push(e.data);
      c.got += e.data.byteLength;
      if (c.got >= c.size) finishBlob(S);
    }
  };
  if (dc.readyState === 'open') setTimeout(() => onConnected(S), 0);
}
function finishBlob(S) {
  const c = S.cur;
  S.cur = null;
  S.received.set(c.key, new Blob(c.parts, { type: c.type }));
  if (S.onBlob) S.onBlob();
}
function deliver(S, msg) { const w = S.waiters.shift(); if (w) w(msg); else S.inbox.push(msg); }
function nextMsg(S) {
  if (S.inbox.length) return Promise.resolve(S.inbox.shift());
  if (S.closed) return Promise.resolve({ t: 'closed' });
  return new Promise((r) => S.waiters.push(r));
}
async function expect(S, type) {
  for (;;) {
    const m = await Promise.race([nextMsg(S), S.aborted]);
    if (m.t === type) return m;
    if (m.t === 'closed') throw new SyncError("La connexion a été coupée. Gardez les deux appareils allumés, l'application ouverte, et réessayez.");
    // autres messages ignorés
  }
}
const race = (S, p) => Promise.race([p, S.aborted]);
function sendJSON(S, obj) { S.dc.send(JSON.stringify(obj)); }
async function waitLow(dc) {
  if (dc.bufferedAmount <= 1024 * 1024) return;
  await new Promise((resolve) => {
    const h = () => { dc.removeEventListener('bufferedamountlow', h); resolve(); };
    dc.addEventListener('bufferedamountlow', h);
    setTimeout(h, 5000);
  });
}
async function sendBlob(S, key, blob) {
  const dc = S.dc;
  sendJSON(S, { t: 'blob', key, size: blob.size, type: blob.type });
  const buf = new Uint8Array(await blob.arrayBuffer());
  for (let o = 0; o < buf.length; o += CHUNK) {
    if (dc.readyState !== 'open') throw new SyncError("La connexion a été coupée. Gardez les deux appareils allumés, l'application ouverte, et réessayez.");
    await waitLow(dc);
    dc.send(buf.slice(o, o + CHUNK).buffer);
  }
}

// --- Déroulement une fois connectés ---
function onConnected(S) {
  if (S.started || S.closedByUser) return;
  S.started = true;
  S.connected = true;
  S.timers.forEach(clearTimeout);
  dlog(S, 'canal ouvert ✓');
  stopStream(S.stream); S.stream = null;
  runProtocol(S).catch((e) => fail(S, e));
}
async function runProtocol(S) {
  viewWorking(S, 'Connectés !', 'Comparaison des deux listes…', '🤝');
  const local = await loadLocal();
  await sendBlob(S, 'manifest', new Blob([JSON.stringify(local.manifest)], { type: 'application/json' }));
  sendJSON(S, { t: 'hello', proto: PROTO, app: C.APP_VERSION, device: C.device() });
  const hello = await expect(S, 'hello');
  if (hello.proto !== PROTO) throw new SyncError("Les deux appareils n'ont pas la même version de Lipeno. Fermez puis rouvrez l'application sur chacun pour la mettre à jour.");
  const mf = S.received.get('manifest');
  if (!mf) throw new SyncError('Échange incomplet, réessayez.');
  const remote = JSON.parse(await mf.text());
  S.received.delete('manifest');
  S.peer = hello.device;
  const plan = planMerge(local.manifest, remote);

  if (plan.nothing) {
    S.finished = true;
    viewDone(S, null, true);
    setTimeout(() => { try { S.pc.close(); } catch (e) {} }, 5000);
    return;
  }

  const ok = await race(S, confirmPlan(S, plan, {
    title: 'Prêt à synchroniser',
    intro: `Connecté à <b>${peerName(S.peer)}</b>`,
    okLabel: 'Synchroniser ✓'
  }));
  if (!ok) return;
  sendJSON(S, { t: 'go' });
  viewWorking(S, 'Validation…', `En attente de la validation sur ${peerName(S.peer)}`, '⏳');
  await expect(S, 'go');

  // Transfert dans les deux sens en même temps
  setView(S, `<div class="sync-icon">🎁</div><h2 class="title-text">Synchronisation…</h2>
    <div class="xfer"><div>📥 Réception<b id="x-in">0 / ${plan.recv.length}</b></div><div>📤 Envoi<b id="x-out">0 / ${plan.send.length}</b></div></div>
    <div class="bar"><i id="x-bar"></i></div>
    <p class="sync-hint">Gardez les deux appareils allumés et l'application ouverte.</p>`, false);
  let sent = 0, got = 0;
  const total = Math.max(1, plan.send.length + plan.recv.length);
  const progress = () => {
    const i = $('#x-in', S.sheet), o = $('#x-out', S.sheet), b = $('#x-bar', S.sheet);
    if (i) i.textContent = `${got} / ${plan.recv.length}`;
    if (o) o.textContent = `${sent} / ${plan.send.length}`;
    if (b) b.style.width = Math.round(((sent + got) / total) * 100) + '%';
  };
  const receiving = new Promise((resolve) => {
    S.onBlob = () => { got = plan.recv.filter((k) => S.received.has(k)).length; progress(); if (got >= plan.recv.length) resolve(); };
    S.onBlob();
  });
  const sending = (async () => {
    for (const key of plan.send) {
      const blob = local.blobs.get(key);
      if (!blob) throw new SyncError('Une photo est illisible sur cet appareil.');
      await sendBlob(S, key, blob);
      sent++; progress();
    }
    sendJSON(S, { t: 'sent' });
  })();
  await race(S, Promise.all([sending, receiving, expect(S, 'sent')]));

  viewWorking(S, 'Enregistrement…', '', '💾', false);
  await applyPlan(plan, local, S.received);
  S.finished = true;
  try { sendJSON(S, { t: 'applied' }); } catch (e) {}
  // On ne coupe qu'une fois que l'autre appareil a tout reçu et enregistré
  Promise.race([expect(S, 'applied'), new Promise((r) => setTimeout(r, 60000))])
    .catch(() => {}).finally(() => setTimeout(() => { try { S.pc.close(); } catch (e) {} }, 500));
  await C.onSynced();
  viewDone(S, plan, false);
}

// --- Écrans de résumé ---
function summary(st, { done = false, file = false } = {}) {
  const P = C.plural, L = [];
  if (st.toysIn) L.push(['📥', done ? `${P(st.toysIn, 'jouet reçu', 'jouets reçus')}` : `${P(st.toysIn, 'jouet', 'jouets')} à recevoir`]);
  if (!file && st.toysOut) L.push(['📤', done ? `${P(st.toysOut, 'jouet envoyé', 'jouets envoyés')}` : `${P(st.toysOut, 'jouet', 'jouets')} à envoyer`]);
  if (st.toysUpdatedHere) L.push(['✏️', `${P(st.toysUpdatedHere, 'jouet modifié', 'jouets modifiés')} ${done ? 'mis à jour' : 'à mettre à jour'} ici`]);
  if (st.toysRemovedHere) L.push(['🗑️', `${P(st.toysRemovedHere, 'jouet supprimé', 'jouets supprimés')} sur l'autre appareil ${done ? 'retiré' + (st.toysRemovedHere > 1 ? 's' : '') : 'à retirer'} ici`]);
  st.kidsMatched.forEach((n) => L.push(['🤝', file ? `Profil « ${C.esc(n)} » reconnu (même prénom)` : `Profil « ${C.esc(n)} » ${done ? 'réuni' : 'à réunir'} sur les deux appareils`]));
  if (st.kidsNewHere.length) L.push(['👶', `Nouveau profil ici : ${st.kidsNewHere.map(C.esc).join(', ')}`]);
  if (!file && st.kidsNewThere.length) L.push(['📲', `Nouveau profil sur l'autre appareil : ${st.kidsNewThere.map(C.esc).join(', ')}`]);
  if (st.kidsRemovedHere.length) L.push(['🗑️', `Profil supprimé ici : ${st.kidsRemovedHere.map(C.esc).join(', ')}`]);
  if (!L.length) L.push(['🔄', 'Petites mises à jour (sagesse, coups de cœur, dates d\'envoi…)']);
  return `<ul class="sync-summary">${L.map(([e, t]) => `<li><span>${e}</span><span>${t}</span></li>`).join('')}</ul>`;
}
function confirmPlan(S, plan, { title, intro, okLabel, file = false }) {
  return new Promise((resolve) => {
    setView(S, `<div class="sync-icon">🔄</div><h2 class="title-text">${title}</h2>
      <p class="sync-lead">${intro}</p>
      ${summary(plan.stats, { file })}
      <p class="sync-hint">${file ? 'Les éléments de ce fichier seront ajoutés à cet appareil.' : 'Les deux appareils auront ensuite exactement la même liste.'}</p>
      <div class="actions"><button class="btn ghost" data-no>Annuler</button><button class="btn" data-yes>${okLabel}</button></div>`);
    $('[data-no]', S.sheet).onclick = () => { resolve(false); S.m.close(); };
    $('[data-yes]', S.sheet).onclick = () => resolve(true);
  });
}
function viewDone(S, plan, already) {
  setView(S, already
    ? `<div class="sync-icon">✅</div><h2 class="title-text">Déjà synchronisés</h2><p class="sync-lead">Les deux appareils ont exactement la même liste.</p><div class="actions"><button class="btn" data-ok>Parfait</button></div>`
    : `<div class="sync-icon pop">🎉</div><h2 class="title-text">C'est fait !</h2>${summary(plan.stats, { done: true })}<p class="sync-lead">Les deux appareils ont maintenant la même liste.</p><div class="actions"><button class="btn" data-ok>Super !</button></div>`);
  $('[data-ok]', S.sheet).onclick = () => S.m.close();
}

// =========================================================
//   6. PARTAGE PAR FICHIER (secours)
// =========================================================
function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type });
}
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'appareil';
const sizeTxt = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko');

function openFileSync() {
  const S = {};
  C.openModal((sheet, m) => { S.sheet = sheet; S.m = m; fileHome(S); });
}
function fileHome(S) {
  setView(S, `<div class="sync-icon">📁</div><h2 class="title-text">Partage par fichier</h2>
    <p class="sync-lead">Les listes voyagent dans un fichier que vous vous envoyez (WhatsApp, mail, Drive…).</p>
    <ol class="sync-steps">
      <li><b>Ici</b> : créez votre fichier et envoyez-le.</li>
      <li><b>Sur l'autre appareil</b> : Paramètres → Partage par fichier → Importer.</li>
      <li><b>Puis dans l'autre sens</b>, pour que les deux aient la même liste.</li>
    </ol>
    <div class="actions col"><button class="btn" data-export>📤 Créer mon fichier</button><button class="btn secondary" data-import>📥 Importer un fichier reçu</button></div>
    <input type="file" hidden>`);
  const input = $('input[type=file]', S.sheet);
  $('[data-export]', S.sheet).onclick = () => exportFile(S);
  $('[data-import]', S.sheet).onclick = () => input.click();
  input.onchange = () => { const f = input.files[0]; input.value = ''; if (f) importFile(S, f); };
}
async function exportFile(S) {
  viewWorking(S, 'Création du fichier…', '', '📦', false);
  let file;
  try {
    const local = await loadLocal();
    const blobs = {};
    for (const [key, blob] of local.blobs) blobs[key] = { type: blob.type, data: await blobToB64(blob) };
    const dev = C.device();
    const payload = { lipeno: 'sync', proto: PROTO, app: C.APP_VERSION, device: dev, at: Date.now(), manifest: local.manifest, blobs };
    const d = new Date();
    const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    file = new File([JSON.stringify(payload)], `Lipeno-synchro-${slug(dev.name)}-${date}.txt`, { type: 'text/plain' });
  } catch (e) {
    console.error(e);
    return viewFileError(S, "Le fichier n'a pas pu être créé.");
  }
  const toys = (await C.DB.allToys()).length;
  setView(S, `<div class="sync-icon pop">📦</div><h2 class="title-text">Fichier prêt</h2>
    <p class="sync-lead">${C.plural(toys, 'jouet', 'jouets')} · ${sizeTxt(file.size)}</p>
    <p class="sync-hint">Envoyez-le à vous-même (WhatsApp, mail…), puis sur l'autre appareil : <b>Paramètres → Partage par fichier → Importer</b>.</p>
    <div class="actions col"><button class="btn" data-share>📤 Envoyer le fichier</button><button class="btn ghost" data-dl>💾 Enregistrer sur l'appareil</button></div>
    <button class="link-btn" data-back>← Retour</button>`);
  const download = () => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(file);
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  $('[data-dl]', S.sheet).onclick = download;
  $('[data-back]', S.sheet).onclick = () => fileHome(S);
  $('[data-share]', S.sheet).onclick = async () => {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Synchronisation Lipeno' }); }
      catch (e) { if (e.name !== 'AbortError') download(); }
    } else download();
  };
}
function viewFileError(S, text) {
  setView(S, `<div class="sync-icon">😕</div><h2 class="title-text">Oups…</h2><p class="sync-lead">${text}</p><div class="actions"><button class="btn" data-back>Retour</button></div>`);
  $('[data-back]', S.sheet).onclick = () => fileHome(S);
}
async function importFile(S, f) {
  viewWorking(S, 'Lecture du fichier…', '', '📖', false);
  let payload, local, plan;
  try {
    payload = JSON.parse(await f.text());
    if (!payload || payload.lipeno !== 'sync' || !payload.manifest) throw new Error('format');
  } catch (e) {
    return viewFileError(S, "Ce fichier n'est pas un fichier de synchronisation Lipeno.");
  }
  if (payload.proto !== PROTO) return viewFileError(S, "Ce fichier vient d'une autre version de Lipeno. Mettez à jour l'application sur les deux appareils (fermez-la puis rouvrez-la).");
  try {
    local = await loadLocal();
    plan = planMerge(local.manifest, payload.manifest);
  } catch (e) {
    console.error(e);
    return viewFileError(S, 'Le fichier est illisible.');
  }
  const from = `Fichier de <b>${peerName(payload.device)}</b> · créé le ${C.fmtDate(payload.at || Date.now())}`;
  if (!plan.changedL) {
    setView(S, `<div class="sync-icon">✅</div><h2 class="title-text">Déjà à jour</h2><p class="sync-lead">${from}</p>
      <p class="sync-lead">Cet appareil contient déjà tout ce qu'il y a dans ce fichier.</p>
      ${plan.changedR ? `<p class="sync-hint">L'autre appareil n'a pas encore tout : envoyez-lui votre fichier.</p><div class="actions col"><button class="btn" data-export>📤 Créer mon fichier</button></div>` : '<div class="actions"><button class="btn" data-ok>Parfait</button></div>'}`);
    const ex = $('[data-export]', S.sheet); if (ex) ex.onclick = () => exportFile(S);
    const ok = $('[data-ok]', S.sheet); if (ok) ok.onclick = () => S.m.close();
    return;
  }
  const yes = await confirmPlan(S, plan, { title: 'Importer ce fichier ?', intro: from, okLabel: 'Importer ✓', file: true });
  if (!yes) return;
  viewWorking(S, 'Importation…', '', '💾', false);
  try {
    const received = new Map();
    for (const key of plan.recv) {
      const b = payload.blobs && payload.blobs[key];
      if (b) received.set(key, b64ToBlob(b.data, b.type));
    }
    await applyPlan(plan, local, received);
  } catch (e) {
    console.error(e);
    return viewFileError(S, e instanceof SyncError ? e.message : "L'importation a échoué. Rien n'a été modifié.");
  }
  await C.onSynced();
  setView(S, `<div class="sync-icon pop">🎉</div><h2 class="title-text">Importé !</h2>${summary(plan.stats, { done: true, file: true })}
    ${plan.changedR
      ? `<p class="sync-lead">Pour que <b>${peerName(payload.device)}</b> ait aussi la liste complète, envoyez-lui maintenant votre fichier.</p>
         <div class="actions col"><button class="btn" data-export>📤 Créer le fichier de retour</button><button class="btn ghost" data-ok>Plus tard</button></div>`
      : `<p class="sync-lead">Les deux appareils ont maintenant la même liste.</p><div class="actions"><button class="btn" data-ok>Super !</button></div>`}`);
  const ex = $('[data-export]', S.sheet); if (ex) ex.onclick = () => exportFile(S);
  $('[data-ok]', S.sheet).onclick = () => S.m.close();
}
