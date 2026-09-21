// Indicateur de progression simple (barre + texte)
let _node = null;

function ensureNode() {
  if (_node) return _node;
  let host = document.getElementById('progress-region');
  if (!host) {
    host = document.createElement('div');
    host.id = 'progress-region';
    document.body.appendChild(host);
  }
  host.removeAttribute('hidden');
  host.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <h3 id="progress-title">Traitement…</h3>
        <div class="progress-bar"><span style="width:0%"></span></div>
        <p id="progress-msg" style="margin:0;color:var(--color-text-muted);">0%</p>
      </div>
    </div>`;
  _node = host;
  return host;
}

export function showProgress(title = 'Traitement…') {
  const node = ensureNode();
  node.querySelector('#progress-title').textContent = title;
  node.querySelector('#progress-msg').textContent = '0%';
  node.querySelector('.progress-bar > span').style.width = '0%';
}

export function updateProgress(ratioOrInfo, msg) {
  if (!_node) return;
  const bar = _node.querySelector('.progress-bar > span');
  const txt = _node.querySelector('#progress-msg');
  if (typeof ratioOrInfo === 'number') {
    const pct = Math.max(0, Math.min(1, ratioOrInfo));
    bar.style.width = (pct * 100).toFixed(0) + '%';
    if (msg) txt.textContent = msg;
  } else if (ratioOrInfo && typeof ratioOrInfo === 'object') {
    const { done, total, current } = ratioOrInfo;
    const pct = total ? done / total : 0;
    bar.style.width = (pct * 100).toFixed(0) + '%';
    txt.textContent = `${done}/${total}${current ? ' — ' + current : ''}`;
  }
}

export function hideProgress() {
  if (!_node) return;
  _node.setAttribute('hidden', '');
  _node.innerHTML = '';
  _node = null;
}