import { initRouter, registerRoute, onRouteChange } from './router.js';
import { renderHome } from './modules/profils.js';
import { renderProfil } from './modules/jouets.js';
import { db } from './db.js';

const root = document.getElementById('view-root');
const btnHome = document.getElementById('btn-home');
const btnMenu = document.getElementById('btn-menu');
const titleEl = document.getElementById('app-title');

btnHome.addEventListener('click', () => { location.hash = '#/'; });

registerRoute('home', async () => {
  titleEl.textContent = 'Lettre au Père Noël';
  btnHome.setAttribute('hidden', '');
  btnMenu.setAttribute('hidden', '');
  await renderHome(root);
});

registerRoute('profil', async ({ segments }) => {
  const id = Number(segments[1]);
  const p = await db.getProfil(id);
  titleEl.textContent = p ? `${p.avatar || '🎁'} ${p.nom}` : 'Profil';
  btnHome.removeAttribute('hidden');
  btnMenu.removeAttribute('hidden');
  await renderProfil(root, id);
});

onRouteChange(({ name }) => {
  // animations
  root.classList.remove('view-enter');
  void root.offsetWidth;
  root.classList.add('view-enter');
});

initRouter();

// Service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((e) => console.warn('SW registration failed', e));
  });
}