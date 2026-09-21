// IndexedDB layer for profils & jouets
const DB_NAME = 'lettre-pere-noel';
const DB_VERSION = 1;

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profils')) {
        const s = db.createObjectStore('profils', { keyPath: 'id', autoIncrement: true });
        s.createIndex('nom', 'nom', { unique: false });
      }
      if (!db.objectStoreNames.contains('jouets')) {
        const s = db.createObjectStore('jouets', { keyPath: 'id', autoIncrement: true });
        s.createIndex('profilId', 'profilId', { unique: false });
        s.createIndex('ordre', 'ordre', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const db = {
  // Profils
  async listProfils() {
    const store = await tx('profils');
    return reqP(store.getAll());
  },
  async getProfil(id) {
    const store = await tx('profils');
    return reqP(store.get(id));
  },
  async addProfil({ nom, dateNaissance, avatar, sagesse = null }) {
    const store = await tx('profils', 'readwrite');
    const data = {
      nom,
      dateNaissance,
      avatar,
      sagesse,
      dateCreation: new Date().toISOString(),
    };
    return reqP(store.add(data));
  },
  async updateProfil(id, patch) {
    const store = await tx('profils', 'readwrite');
    const cur = await reqP(store.get(id));
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await reqP(store.put(next));
    return next;
  },
  async deleteProfil(id) {
    // Supprimer aussi ses jouets
    const store = await tx('jouets', 'readwrite');
    const idx = store.index('profilId');
    const range = IDBKeyRange.only(id);
    await new Promise((resolve, reject) => {
      const cur = idx.openCursor(range);
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { c.delete(); c.continue(); }
        else resolve();
      };
      cur.onerror = () => reject(cur.error);
    });
    const ps = await tx('profils', 'readwrite');
    return reqP(ps.delete(id));
  },

  // Jouets
  async listJouets(profilId) {
    const store = await tx('jouets');
    const idx = store.index('profilId');
    return new Promise((resolve, reject) => {
      const out = [];
      const cur = idx.openCursor(IDBKeyRange.only(profilId));
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out.push(c.value); c.continue(); }
        else { out.sort((a, b) => (a.ordre || 0) - (b.ordre || 0)); resolve(out); }
      };
      cur.onerror = () => reject(cur.error);
    });
  },
  async getJouet(id) {
    const store = await tx('jouets');
    return reqP(store.get(id));
  },
  async addJouet({ profilId, blobWebp, nomJouet = '', magasin = '' }) {
    const store = await tx('jouets', 'readwrite');
    // ordre = max + 1
    const all = await this.listJouets(profilId);
    const ordre = all.length ? Math.max(...all.map(j => j.ordre || 0)) + 1 : 1;
    const data = {
      profilId,
      blobWebp,
      nomJouet,
      magasin,
      ordre,
      dateAjout: new Date().toISOString(),
      dateEnvoiPereNoel: null,
    };
    return reqP(store.add(data));
  },
  async updateJouet(id, patch) {
    const store = await tx('jouets', 'readwrite');
    const cur = await reqP(store.get(id));
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await reqP(store.put(next));
    return next;
  },
  async deleteJouet(id) {
    const store = await tx('jouets', 'readwrite');
    return reqP(store.delete(id));
  },
  async deleteJouetsForProfil(profilId) {
    const store = await tx('jouets', 'readwrite');
    const idx = store.index('profilId');
    return new Promise((resolve, reject) => {
      let count = 0;
      const cur = idx.openCursor(IDBKeyRange.only(profilId));
      cur.onsuccess = (e) => {
        const c = e.target.result;
        if (c) { c.delete(); count++; c.continue(); }
        else resolve(count);
      };
      cur.onerror = () => reject(cur.error);
    });
  },
  async setEnvoiPereNoel(profilId, dateISO) {
    const all = await this.listJouets(profilId);
    for (const j of all) {
      await this.updateJouet(j.id, { dateEnvoiPereNoel: dateISO });
    }
  },
};

export function ageFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  return years;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
