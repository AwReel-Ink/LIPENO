import { db, ageFromDate } from '../db.js';

export const AVATAR_CHOICES = ['🎅','🤶','🦌','⛄','🎄','🎁','🧝','🦌','🛷','🔔','⭐','🦊'];

function avatarSvg(emoji, size = 80) {
  return `<div style="font-size:${size * 0.65}px;line-height:1;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">${emoji}</div>`;
}

export async function renderHome(root) {
  const profils = await db.listProfils();
  const wrap = document.createElement('div');
  wrap.className = 'view-enter';
  wrap.innerHTML = `
    <div class="section">
      <h2>Mes profils enfants</h2>
      <p style="color:var(--color-text-muted);margin:0;">Choisissez un profil pour gérer sa liste de jouets.</p>
    </div>
    <div class="grid-profiles">
      ${profils.map((p) => `
        <button class="card profile" data-id="${p.id}" aria-label="Ouvrir le profil de ${escapeHtml(p.nom)}">
          <div class="avatar">${escapeHtml(p.avatar || '🎁')}</div>
          <div class="name">${escapeHtml(p.nom)}</div>
          <div class="age">${ageFromDate(p.dateNaissance) != null ? ageFromDate(p.dateNaissance) + ' ans' : ''}</div>
        </button>
      `).join('')}
      <button class="card profile add" id="btn-add-profile" aria-label="Ajouter un profil">
        <span style="font-size:2rem;">＋</span>
        <div>Ajouter un profil</div>
      </button>
    </div>
  `;
  root.replaceChildren(wrap);
  wrap.querySelectorAll('.card.profile[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      location.hash = `#/profil/${btn.dataset.id}`;
    });
  });
  wrap.querySelector('#btn-add-profile').addEventListener('click', () => openAddProfile(root));
}

export function openAddProfile(root, onCreated) {
  const region = document.getElementById('modal-region');
  region.removeAttribute('hidden');
  region.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal">
        <h2>Nouveau profil</h2>
        <div class="field">
          <label for="np-nom">Prénom</label>
          <input id="np-nom" class="input" type="text" maxlength="40" required>
        </div>
        <div class="field">
          <label for="np-date">Date de naissance</label>
          <input id="np-date" class="input" type="date" required>
        </div>
        <div class="field">
          <label>Avatar</label>
          <div class="avatar-picker" role="radiogroup">
            ${AVATAR_CHOICES.slice(0, 12).map((em, i) => `
              <button type="button" data-emoji="${em}" role="radio" aria-checked="${i === 0}" class="${i === 0 ? 'selected' : ''}">${em}</button>
            `).join('')}
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-act="cancel">Annuler</button>
          <button class="btn" data-act="save">Créer</button>
        </div>
      </div>
    </div>`;
  let avatar = AVATAR_CHOICES[0];
  region.querySelectorAll('.avatar-picker button').forEach((b) => {
    b.addEventListener('click', () => {
      region.querySelectorAll('.avatar-picker button').forEach((x) => { x.classList.remove('selected'); x.setAttribute('aria-checked', 'false'); });
      b.classList.add('selected');
      b.setAttribute('aria-checked', 'true');
      avatar = b.dataset.emoji;
    });
  });
  function close() { region.setAttribute('hidden', ''); region.innerHTML = ''; }
  region.querySelector('[data-act=cancel]').addEventListener('click', close);
  region.querySelector('[data-act=save]').addEventListener('click', async () => {
    const nom = region.querySelector('#np-nom').value.trim();
    const dateNaissance = region.querySelector('#np-date').value;
    if (!nom) { alert('Veuillez saisir un prénom.'); return; }
    if (!dateNaissance) { alert('Veuillez saisir la date de naissance.'); return; }
    const id = await db.addProfil({ nom, dateNaissance, avatar });
    close();
    if (onCreated) onCreated(id);
    else { location.hash = `#/profil/${id}`; }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}