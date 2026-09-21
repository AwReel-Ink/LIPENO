// Conversion d'image -> WebP redimensionné (max 800px sur le plus grand côté)
import { isHeic, decodeHeic } from './heicFallback.js';

const MAX_DIM = 800;
const WEBP_QUALITY = 0.82;

async function fileToBitmap(file) {
  if (isHeic(file)) {
    const jpegBlob = await decodeHeic(file);
    return await createImageBitmap(jpegBlob);
  }
  // PNG, JPG, WebP, GIF, etc.
  return await createImageBitmap(file);
}

function fitDims(w, h, max) {
  if (w <= max && h <= max) return { w, h };
  if (w >= h) return { w: max, h: Math.round(h * max / w) };
  return { w: Math.round(w * max / h), h: max };
}

async function drawToBlob(bitmap) {
  const { w, h } = fitDims(bitmap.width, bitmap.height, MAX_DIM);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (typeof canvas.toBlob !== 'function') {
    // Safari < 14 fallback
    const dataUrl = canvas.toDataURL('image/webp', WEBP_QUALITY);
    const res = await fetch(dataUrl);
    return await res.blob();
  }
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob a renvoyé null')), 'image/webp', WEBP_QUALITY);
  });
}

// Convertit un fichier en Blob WebP
export async function convertToWebp(file, onProgress) {
  if (onProgress) onProgress(0.1, 'Lecture du fichier…');
  const bitmap = await fileToBitmap(file);
  if (onProgress) onProgress(0.7, 'Redimensionnement…');
  const blob = await drawToBlob(bitmap);
  if (onProgress) onProgress(1, 'Terminé');
  if (bitmap.close) bitmap.close();
  return blob;
}

// Convertit plusieurs fichiers en lot avec callback de progression
export async function convertBatch(files, onProgress) {
  const total = files.length;
  const out = [];
  for (let i = 0; i < total; i++) {
    const f = files[i];
    try {
      if (onProgress) onProgress({ done: i, total, current: f.name, ok: true });
      const blob = await convertToWebp(f);
      out.push({ file: f, blob, ok: true });
    } catch (err) {
      out.push({ file: f, error: err.message || String(err), ok: false });
    }
  }
  if (onProgress) onProgress({ done: total, total, current: null, ok: true });
  return out;
}
