import { db, formatDate } from '../db.js';
import { convertToWebp, convertBatch } from './imageConverter.js';
import { showProgress, updateProgress, hideProgress } from './progressIndicator.js';
import { confirmDialog, infoDialog } from './confirmDialog.js';
import { mountWisdomSlider } from './wisdomSlider.js';
import { openCropTool } from './cropTool.js';
import { playSantaAnimation } from './santaAnimation.js';
import { exportPdf } from './pdfExport.js';
import { shareListe, showToast } from './shareManager.js';

let _menuOpen = false;

export async function renderProfil(root, profilId) {
  const profil = await db.getProfil(profilId);
  if (!profil) { location.hash = '#/'; return; }
  const jouets = await db.listJouets(profilId);
  const sentDate = jouets.find((j) => j.dateEnvoiPereNoel)?.dateEnvoiPereNoel;

  const wrap = document.createElement('div');
  wrap.className = 'view-enter';
  wrap.innerHTML = `
    <div class="section">
      <div class="row row-between" style="align-items:flex-start;">
        <div>
          <div style="font-size:3rem;line-height:1;">${escapeHtml(profil.avatar || '🎁')}</div>
          <h2 style="margin:8px 0 0;">${escapeHtml(profil.nom)}</h2>
          <div style="color:var(--color-text-muted);">${ageFromDateStr(profil.dateNaissance)}</div>
          ${sentDate ? `<div style="margin-top:8px;"><span class="badge">Envoyé le ${formatDate(sentDate)}</span></div>` : ''}
        </div>
      </div>
    </div>
    <div class="section" id="wisdom-section"></div>
    <div class="section">
      <div class="upload-btns">
        <label class="btn btn-gold">
          ＋ Ajouter une photo
          <input type="file" accept="image/*" capture="environment" hidden id="file-single">
        </label>
        <label class="btn btn-green">
          ＋＋＋ Ajouter plusieurs photos
          <input type="file" accept="image/*" multiple hidden id="file-multi">
        </label>
      </div>
      <div class="row">
        <button class="btn" id="btn-send" ${jouets.length === 0 ? 'disabled' : ''}>🎅 Envoyer au Père Noël</button>
        <button class="btn btn-ghost" id="btn-share" ${jouets.length === 0 ? 'disabled' : ''}>📤 Partager</button>
        <button class="btn btn-ghost" id="btn-pdf" ${jouets.length === 0 ? 'disabled' : ''}>📄 Exporter en PDF</button>
      </div>
    </div>
    <div class="section">
      <h3>Liste de jouets (${jouets.length})</h3>
      ${jouets.length === 0
        ? `<div class="empty"><div class="emoji">🎁</div><p>Pas encore de jouet.<br>Ajoutez une photo pour commencer !</p></div>`
        : `<div class="grid-toys">${jouets.map(j => toyCard(j)).join('')}</div>`}
    </div>
  `;
  root.replaceChildren(wrap);

  // Wisom slider
  const wisdomSection = wrap.querySelector('#wisdom-section');
  const slider = mountWisdomSlider({
    value: profil.sagesse,
    onChange: (v) => { db.updateProfil(profilId, { sagesse: v }); },
  });
  wisdomSection.appendChild(slider.root);

  // File inputs
  wrap.querySelector('#file-single').addEventListener('change', (e) => {
    if (e.target.files.length) handleSingleUpload(profilId, e.target.files[0], root);
    e.target.value = '';
  });
  wrap.querySelector('#file-multi').addEventListener('change', (e) => {
    if (e.target.files.length) handleMultiUpload(profilId, Array.from(e.target.files), root);
    e.target.value = '';
  });

  // Send to Santa
  wrap.querySelector('#btn-send').addEventListener('click', async () => {
    if (!jouets.length) return;
    const ok = await confirmDialog({
      title: 'Envoyer au Père Noël ?',
      message: 'Une animation festive va se jouer. Vos données ne sont pas supprimées.',
      confirmLabel: 'Envoyer',
    });
    if (!ok) return;
    await playSantaAnimation();
    const dateISO = new Date().toISOString();
    await db.setEnvoiPereNoel(profilId, dateISO);
    await renderProfil(root, profilId);
    showToast('Lettre envoyée ! 🎅');
  });

  wrap.querySelector('#btn-share').addEventListener('click', () => shareListe({ jouets, profileName: profil.nom }));
  wrap.querySelector('#btn-pdf').addEventListener('click', () => exportPdf({ jouets, profileName: profil.nom }));

  // Toy card click -> modal
  wrap.querySelectorAll('.toy-card[data-id]').forEach((c) => {
    c.addEventListener('click', () => openToyModal(profilId, Number(c.dataset.id), root));
  });

  // Menu
  wrap.querySelector('#btn-menu')?.addEventListener('click', toggleMenu);
}

function toyCard(j) {
  const url = URL.createObjectURL(j.blobWebp);
  // attach cleanup via dataset, but cleanup on unmount happens automatically when DOM removed
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60000);
  return `
    <div class="toy-card" data-id="${j.id}" role="button" tabindex="0" aria-label="${escapeHtml(j.nomJouet || 'Jouet')}">
      ${j.dateEnvoiPereNoel ? `<span class="sent-badge">Envoyé le ${formatDate(j.dateEnvoiPereNoel)}</span>` : ''}
      <div class="thumb"><img src="${url}" alt=""></div>
      <div class="meta">
        <div class="name">${escapeHtml(j.nomJouet || '— sans nom —')}</div>
        <div class="shop">${escapeHtml(j.magasin || '')}</div>
      </div>
    </div>`;
}

function toggleMenu() {
  const header = document.getElementById('app-header');
  const existing = document.querySelector('.menu-popover');
  if (existing) { existing.remove(); _menuOpen = false; return; }
  const pop = document.createElement('div');
  pop.className = 'menu-popover';
  pop.innerHTML = `
    <button data-act="delete-profile">Supprimer le profil</button>
    <button data-act="clear-list" class="danger">Vider la liste</button>
  `;
  header.appendChild(pop);
  _menuOpen = true;
  function close() { pop.remove(); _menuOpen = false; document.removeEventListener('click', outside); }
  function outside(e) { if (!pop.contains(e.target) && e.target.id !== 'btn-menu') close(); }
  setTimeout(() => document.addEventListener('click', outside), 0);
  pop.querySelector('[data-act=delete-profile]').addEventListener('click', async (e) => {
    e.stopPropagation();
    close();
    const ok1 = await confirmDialog({ title: 'Supprimer le profil ?', message: 'Tous les jouets associés seront aussi supprimés.', confirmLabel: 'Continuer', danger: true });
    if (!ok1) return;
    const ok2 = await confirmDialog({ title: 'Confirmation finale', message: 'Cette action est irréversible. Continuer ?', confirmLabel: 'Supprimer définitivement', danger: true });
    if (!ok2) return;
    const id = Number(location.hash.split('/')[2]);
    await db.deleteProfil(id);
    location.hash = '#/';
    showToast('Profil supprimé.');
  });
  pop.querySelector('[data-act=clear-list]').addEventListener('click', async (e) => {
    e.stopPropagation();
    close();
    const ok1 = await confirmDialog({ title: 'Vider la liste de jouets ?', message: 'Toutes les photos de cet enfant seront supprimées.', confirmLabel: 'Continuer', danger: true });
    if (!ok1) return;
    const ok2 = await confirmDialog({ title: 'Confirmation finale', message: 'Êtes-vous absolument sûr ?', confirmLabel: 'Vider définitivement', danger: true });
    if (!ok2) return;
    const id = Number(location.hash.split('/')[2]);
    await db.deleteJouetsForProfil(id);
    location.reload();
  });
}

async function handleSingleUpload(profilId, file, root) {
  // 1. convertir en webp
  // 2. formulaire nom + magasin
  // 3. sauvegarde
  showProgress('Conversion de l\'image…');
  let blobWebp;
  try {
    blobWebp = await convertToWebp(file, (r, msg) => updateProgress(r, msg));
  } catch (e) {
    hideProgress();
    await infoDialog({ title: 'Erreur de conversion', message: e.message || String(e) });
    return;
  }
  hideProgress();
  await askToyMeta({ blobWebp, file, onSave: async ({ nomJouet, magasin }) => {
    await db.addJouet({ profilId, blobWebp, nomJouet, magasin });
    await renderProfil(root, profilId);
  }});
}

async function handleMultiUpload(profilId, files, root) {
  // 1. convertir en lot avec progress
  showProgress(`Conversion de ${files.length} photos…`);
  let results;
  try {
    results = await convertBatch(files, (info) => updateProgress(info));
  } catch (e) {
    hideProgress();
    await infoDialog({ title: 'Erreur de conversion', message: e.message || String(e) });
    return;
  }
  hideProgress();
  // 2. demander un magasin global optionnel
  const { magasin } = await askBatchMeta(results.filter(r => r.ok).length);
  // 3. sauvegarder
  for (const r of results) {
    if (!r.ok) continue;
    await db.addJouet({ profilId, blobWebp: r.blob, nomJouet: '', magasin });
  }
  await renderProfil(root, profilId);
  showToast(`${results.filter(r => r.ok).length} jouet(s) ajouté(s).`);
}

function askToyMeta({ blobWebp, file, onSave }) {
  return new Promise((resolve) => {
    const region = document.getElementById('modal-region');
    region.removeAttribute('hidden');
    const url = URL.createObjectURL(blobWebp);
    region.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>Détails du jouet</h2>
          <div style="background:#fafafa;border-radius:8px;padding:8px;text-align:center;margin-bottom:12px;">
            <img src="${url}" alt="" style="max-height:160px;object-fit:contain;">
          </div>
          <div class="field"><label>Nom du jouet (optionnel)</label>
            <input id="j-nom" class="input" type="text" maxlength="80" placeholder="ex. Lego Harry Potter">
          </div>
          <div class="field"><label>Magasin (optionnel)</label>
            <input id="j-mag" class="input" type="text" maxlength="80" placeholder="ex. Amazon">
          </div>
          <div class="actions">
            <button class="btn btn-ghost" data-act="cancel">Annuler</button>
            <button class="btn" data-act="save">Ajouter</button>
          </div>
        </div>
      </div>`;
    function close() { region.setAttribute('hidden', ''); region.innerHTML = ''; URL.revokeObjectURL(url); }
    region.querySelector('[data-act=cancel]').addEventListener('click', () => { close(); resolve(); });
    region.querySelector('[data-act=save]').addEventListener('click', async () => {
      const nomJouet = region.querySelector('#j-nom').value.trim();
      const magasin = region.querySelector('#j-mag').value.trim();
      close();
      await onSave({ nomJouet, magasin });
      resolve();
    });
  });
}

function askBatchMeta(count) {
  return new Promise((resolve) => {
    if (count === 0) return resolve({ magasin: '' });
    const region = document.getElementById('modal-region');
    region.removeAttribute('hidden');
    region.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h2>${count} photos prêtes</h2>
          <p>Optionnel : un magasin commun à appliquer à toutes les photos.</p>
          <div class="field"><label>Magasin (optionnel)</label>
            <input id="b-mag" class="input" type="text" maxlength="80" placeholder="ex. Fnac">
          </div>
          <div class="actions">
            <button class="btn btn-ghost" data-act="skip">Sans magasin</button>
            <button class="btn" data-act="save">Ajouter ${count} jouets</button>
          </div>
        </div>
      </div>`;
    function close(v) { region.setAttribute('hidden', ''); region.innerHTML = ''; resolve(v); }
    region.querySelector('[data-act=skip]').addEventListener('click', () => close({ magasin: '' }));
    region.querySelector('[data-act=save]').addEventListener('click', () => close({ magasin: region.querySelector('#b-mag').value.trim() }));
  });
}

async function openToyModal(profilId, jouetId, root) {
  const jouet = await db.getJouet(jouetId);
  if (!jouet) return;
  const region = document.getElementById('modal-region');
  region.removeAttribute('hidden');
  const url = URL.createObjectURL(jouet.blobWebp);
  let pendingBlob = jouet.blobWebp;
  region.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:560px;">
        <h2>Modifier le jouet</h2>
        <div style="background:#fafafa;border-radius:8px;padding:8px;text-align:center;margin-bottom:12px;">
          <img id="j-preview" src="${url}" alt="" style="max-height:240px;object-fit:contain;">
        </div>
        <div class="field"><label>Nom du jouet</label>
          <input id="j-nom" class="input" type="text" maxlength="80" value="${escapeAttr(jouet.nomJouet || '')}">
        </div>
        <div class="field"><label>Magasin</label>
          <input id="j-mag" class="input" type="text" maxlength="80" value="${escapeAttr(jouet.magasin || '')}">
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-act="change">Changer la photo</button>
          <button class="btn btn-ghost" data-act="crop">Recadrer</button>
          <button class="btn btn-danger" data-act="delete">Supprimer</button>
          <button class="btn" data-act="ok">Valider</button>
        </div>
      </div>
    </div>`;
  function close() { region.setAttribute('hidden', ''); region.innerHTML = ''; URL.revokeObjectURL(url); }
  region.querySelector('[data-act=change]').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      showProgress('Conversion…');
      try {
        const blob = await convertToWebp(e.target.files[0], (r, m) => updateProgress(r, m));
        hideProgress();
        pendingBlob = blob;
        const newUrl = URL.createObjectURL(blob);
        region.querySelector('#j-preview').src = newUrl;
      } catch (err) {
        hideProgress();
        await infoDialog({ title: 'Erreur', message: err.message });
      }
    });
    input.click();
  });
  region.querySelector('[data-act=crop]').addEventListener('click', async () => {
    const blob = await openCropTool({ imageBlob: pendingBlob });
    if (blob) {
      pendingBlob = blob;
      const newUrl = URL.createObjectURL(blob);
      region.querySelector('#j-preview').src = newUrl;
    }
  });
  region.querySelector('[data-act=delete]').addEventListener('click', async () => {
    const ok1 = await confirmDialog({ title: 'Supprimer ce jouet ?', message: 'Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true });
    if (!ok1) return;
    const ok2 = await confirmDialog({ title: 'Confirmation finale', message: 'Vraiment supprimer ?', confirmLabel: 'Supprimer définitivement', danger: true });
    if (!ok2) return;
    await db.deleteJouet(jouetId);
    close();
    await renderProfil(root, profilId);
  });
  region.querySelector('[data-act=ok]').addEventListener('click', async () => {
    const nomJouet = region.querySelector('#j-nom').value.trim();
    const magasin = region.querySelector('#j-mag').value.trim();
    await db.updateJouet(jouetId, { blobWebp: pendingBlob, nomJouet, magasin });
    close();
    await renderProfil(root, profilId);
  });
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function ageFromDateStr(s) { if (!s) return ''; const a = (function(d){const dt=new Date(d); const n=new Date(); let y=n.getFullYear()-dt.getFullYear(); const m=n.getMonth()-dt.getMonth(); if(m<0||(m===0&&n.getDate()<dt.getDate()))y--; return y;})(s); return a != null ? a + ' ans' : ''; }