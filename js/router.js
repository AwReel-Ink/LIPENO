// Simple hash-based router
const routes = new Map();
let _onChange = null;

export function registerRoute(name, render) {
  routes.set(name, render);
}

export function onRouteChange(cb) { _onChange = cb; }

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { segments, query, raw };
}

async function dispatch() {
  const { segments, query } = parseHash();
  let name = segments[0] || 'home';
  const handler = routes.get(name);
  if (!handler) {
    location.hash = '#/';
    return;
  }
  if (_onChange) _onChange({ name, segments, query });
  await handler({ segments, query });
}

export function navigate(path) {
  if (location.hash === '#' + path) {
    dispatch();
  } else {
    location.hash = path;
  }
}

export function initRouter() {
  window.addEventListener('hashchange', dispatch);
  if (!location.hash) location.hash = '#/';
  else dispatch();
}
