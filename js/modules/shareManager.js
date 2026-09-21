// Génère des JPEG par page A4 + partage navigator.share avec fallback download
const A4_W_MM = 210, A4_H_MM = 297;
const MARGIN_MM = 12;
const COLS = 2;
const JPEG_QUALITY = 0.8;
const PX_PER_MM = 4; // ~96 dpi => 4px/mm

async function blobToBitmap(blob) {
  return await createImageBitmap(blob);
}

function drawPageToCanvas(canvas, items, pageNum, totalPages, title) {
  const w = A4_W_MM * PX_PER_MM;
  const h = A4_H_MM * PX_PER_MM;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  // Header
  ctx.fillStyle = '#b30000';
  ctx.fillRect(0, 0, w, 32 * PX_PER_MM / 4);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(14 * PX_PER_MM / 4)}px sans-serif`;
  ctx.fillText(`Lettre au Père Noël — ${title}`, MARGIN_MM * PX_PER_MM, 14 * PX_PER_MM / 4 * 2.2);
  ctx.font = `${Math.round(9 * PX_PER_MM / 4)}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Page ${pageNum}/${totalPages}`, w - 80 * PX_PER_MM / 4, 14 * PX_PER_MM / 4 * 2.2);

  const cellW = (A4_W_MM - MARGIN_MM * 2) / COLS * PX_PER_MM;
  const cellImgH = cellW;
  const cellH = cellImgH + 30;

  items.forEach((it, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN_MM * PX_PER_MM + col * cellW;
    const y = 16 + row * cellH;

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(x, y, cellW, cellImgH);
    if (it.bitmap) {
      const bmp = it.bitmap;
      const ratio = bmp.width / bmp.height;
      let dw = cellW, dh = cellImgH, ox = 0, oy = 0;
      if (ratio > 1) { dh = cellW / ratio; oy = (cellImgH - dh) / 2; }
      else { dw = cellImgH * ratio; ox = (cellW - dw) / 2; }
      ctx.drawImage(bmp, x + ox, y + oy, dw, dh);
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `bold ${Math.round(8 * PX_PER_MM / 4)}px sans-serif`;
    const label = `${it.idx}. ${it.j.nomJouet || 'Jouet'}`;
    ctx.fillText(truncate(label, 36), x + 4, y + cellImgH + 12);
    if (it.j.magasin) {
      ctx.fillStyle = '#666';
      ctx.font = `${Math.round(7 * PX_PER_MM / 4)}px sans-serif`;
      ctx.fillText(truncate(it.j.magasin, 40), x + 4, y + cellImgH + 22);
    }
  });
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function canvasToJpegBlob(canvas) {
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob null')), 'image/jpeg', JPEG_QUALITY);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function shareListe({ jouets, profileName }) {
  const title = profileName || 'Mon enfant';
  if (!jouets.length) {
    showToast('Aucun jouet à partager.');
    return;
  }
  // Précharge bitmaps
  const items = [];
  for (let i = 0; i < jouets.length; i++) {
    try {
      const bmp = await blobToBitmap(jouets[i].blobWebp);
      items.push({ j: jouets[i], idx: i + 1, bitmap: bmp });
    } catch {
      items.push({ j: jouets[i], idx: i + 1, bitmap: null });
    }
  }

  // Découpe en pages
  const cellW = (A4_W_MM - MARGIN_MM * 2) / COLS * PX_PER_MM;
  const cellImgH = cellW;
  const cellH = cellImgH + 30;
  const rowsPerPage = Math.floor((A4_H_MM - 20 - MARGIN_MM * 2) / (cellH / PX_PER_MM));
  const perPage = COLS * rowsPerPage;

  const canvas = document.createElement('canvas');
  const pages = [];
  for (let p = 0; p * perPage < items.length; p++) {
    const slice = items.slice(p * perPage, (p + 1) * perPage);
    drawPageToCanvas(canvas, slice, p + 1, Math.ceil(items.length / perPage), title);
    const blob = await canvasToJpegBlob(canvas);
    pages.push(blob);
  }
  // Libère bitmaps
  items.forEach((it) => { if (it.bitmap && it.bitmap.close) it.bitmap.close(); });

  const baseName = `lettre-${slugify(title)}`;
  const fileNames = pages.map((_, i) => `${baseName}-p${i + 1}.jpg`);

  if (navigator.canShare && navigator.share) {
    try {
      const files = pages.map((blob, i) => new File([blob], fileNames[i], { type: 'image/jpeg' }));
      if (navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: `Lettre au Père Noël — ${title}`,
          text: `La liste de jouets de ${title} 🎅`,
        });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // utilisateur a annulé
      // fallback ci-dessous
    }
  }
  // Fallback : téléchargement direct
  pages.forEach((blob, i) => downloadBlob(blob, fileNames[i]));
  showToast(`Partage natif indisponible. ${pages.length} image(s) téléchargée(s).`);
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'liste';
}

export function showToast(msg) {
  let host = document.getElementById('toast-region');
  if (!host) return;
  host.innerHTML = `<div class="toast">${msg}</div>`;
  setTimeout(() => { host.innerHTML = ''; }, 3500);
}