// Modale de confirmation réutilisable
function getModalRegion() {
  return document.getElementById('modal-region');
}

export function confirmDialog({ title = 'Confirmer', message = '', confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = {}) {
  return new Promise((resolve) => {
    const region = getModalRegion();
    region.removeAttribute('hidden');
    region.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cd-title">
          <h2 id="cd-title">${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <div class="actions">
            <button class="btn btn-ghost" data-act="cancel">${escapeHtml(cancelLabel)}</button>
            <button class="btn ${danger ? 'btn-danger' : ''}" data-act="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    function close(result) {
      region.setAttribute('hidden', '');
      region.innerHTML = '';
      resolve(result);
    }
    region.querySelector('[data-act=cancel]').addEventListener('click', () => close(false));
    region.querySelector('[data-act=confirm]').addEventListener('click', () => close(true));
    region.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(false);
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); }
    });
  });
}

export function infoDialog({ title = '', message = '', okLabel = 'OK' } = {}) {
  return new Promise((resolve) => {
    const region = getModalRegion();
    region.removeAttribute('hidden');
    region.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <div class="actions">
            <button class="btn" data-act="ok">${escapeHtml(okLabel)}</button>
          </div>
        </div>
      </div>`;
    region.querySelector('[data-act=ok]').addEventListener('click', () => {
      region.setAttribute('hidden', '');
      region.innerHTML = '';
      resolve();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}