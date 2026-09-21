// HEIC/HEIF detection + decode via vendored lib
const HEIC_TYPES = new Set([
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
]);

export function isHeic(file) {
  if (!file) return false;
  if (HEIC_TYPES.has(file.type)) return true;
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
}

let _libPromise = null;
async function loadLib() {
  if (!_libPromise) {
    _libPromise = import('../vendor/heic2any.min.js').catch(() => null);
  }
  return _libPromise;
}

export async function decodeHeic(file) {
  const lib = await loadLib();
  if (!lib || !lib.default) {
    throw new Error('Décodeur HEIC indisponible (lib vendorisée absente)');
  }
  const heic2any = lib.default;
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.95,
  });
  // result peut être Blob ou Blob[]
  return Array.isArray(result) ? result[0] : result;
}
