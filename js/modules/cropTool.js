// Outil de recadrage en forme libre : canvas + path fermé utilisé comme clip
export async function openCropTool({ imageBlob }) {
  return new Promise((resolve, reject) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal" style="max-width:560px;">
        <h2>Recadrer en forme libre</h2>
        <p style="font-size:.85rem;color:var(--color-text-muted);">Tracez un contour fermé sur l'image, puis validez.</p>
        <div class="crop-canvas-wrap">
          <canvas></canvas>
          <svg class="poly-preview" xmlns="http://www.w3.org/2000/svg"></svg>
        </div>
        <div class="actions">
          <button class="btn btn-ghost" data-act="undo">↶ Annuler point</button>
          <button class="btn btn-ghost" data-act="cancel">Annuler</button>
          <button class="btn" data-act="ok" disabled>Valider</button>
        </div>
      </div>`;
    document.getElementById('modal-region').appendChild(wrap);

    const canvas = wrap.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const svg = wrap.querySelector('.poly-preview');
    let img = null;
    let points = [];
    let scale = 1;

    const imgUrl = URL.createObjectURL(imageBlob);
    const im = new Image();
    im.onload = () => {
      img = im;
      const maxW = 520;
      scale = Math.min(1, maxW / im.naturalWidth);
      canvas.width = Math.round(im.naturalWidth * scale);
      canvas.height = Math.round(im.naturalHeight * scale);
      draw();
    };
    im.onerror = () => { URL.revokeObjectURL(imgUrl); reject(new Error('Image illisible')); cleanup(); };
    im.src = imgUrl;

    function draw() {
      if (!img) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    function renderSvg() {
      if (points.length < 2) { svg.innerHTML = ''; return; }
      const d = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ') + (points.length > 2 ? ' Z' : '');
      svg.innerHTML = `<path d="${d}" stroke="#ffd700" stroke-width="2" fill="rgba(255,215,0,0.15)" />`;
      // points
      svg.innerHTML += points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#fff" stroke="#ffd700" stroke-width="1.5"/>`).join('');
    }

    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      const cx = (e.clientX != null ? e.clientX : e.touches[0].clientX);
      const cy = (e.clientY != null ? e.clientY : e.touches[0].clientY);
      return { x: (cx - r.left) * (canvas.width / r.width), y: (cy - r.top) * (canvas.height / r.height) };
    }

    function pushPoint(p) {
      // fermeture si proche du premier point et > 3 points
      if (points.length > 3) {
        const f = points[0];
        const dx = p.x - f.x, dy = p.y - f.y;
        if (Math.hypot(dx, dy) < 12) { points.push({ x: f.x, y: f.y }); renderSvg(); updateOk(); return; }
      }
      points.push(p);
      renderSvg();
      updateOk();
    }

    function updateOk() {
      wrap.querySelector('[data-act=ok]').disabled = points.length < 3;
    }

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = getPos(e);
      // Si on clique près du premier point et on a un polygone, on ferme.
      if (points.length > 2) {
        const f = points[0];
        const dx = p.x - f.x, dy = p.y - f.y;
        if (Math.hypot(dx, dy) < 12) { points.push({ x: f.x, y: f.y }); renderSvg(); updateOk(); return; }
      }
      pushPoint(p);
    });

    wrap.querySelector('[data-act=undo]').addEventListener('click', () => {
      if (points.length === 0) return;
      if (points.length > 0 && points[points.length - 1].x === points[0].x && points[points.length - 1].y === points[0].y && points.length > 1) {
        // retire le point de fermeture
        points.pop();
      } else {
        points.pop();
      }
      renderSvg();
      updateOk();
    });

    wrap.querySelector('[data-act=cancel]').addEventListener('click', () => {
      URL.revokeObjectURL(imgUrl);
      cleanup();
      resolve(null);
    });

    wrap.querySelector('[data-act=ok]').addEventListener('click', async () => {
      try {
        const blob = await exportCropped(img, points, scale);
        URL.revokeObjectURL(imgUrl);
        cleanup();
        resolve(blob);
      } catch (err) {
        alert('Erreur recadrage : ' + err.message);
      }
    });

    function cleanup() {
      wrap.remove();
    }
  });
}

async function exportCropped(img, points, scale) {
  // Bounding box approximative
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let minX = Math.min(...xs), minY = Math.min(...ys);
  let maxX = Math.max(...xs), maxY = Math.max(...ys);
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(img.naturalWidth * scale, maxX + pad);
  maxY = Math.min(img.naturalHeight * scale, maxY + pad);
  const w = Math.max(1, Math.round(maxX - minX));
  const h = Math.max(1, Math.round(maxY - minY));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = p.x - minX, y = p.y - minY;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.clip();
  // dessine l'image (en taille canvas = en pixels canvas qui sont déjà scale)
  ctx.drawImage(img, 0, 0, img.naturalWidth * scale, img.naturalHeight * scale, -minX, -minY, img.naturalWidth * scale, img.naturalHeight * scale);
  ctx.restore();

  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob null')), 'image/webp', 0.85);
  });
}