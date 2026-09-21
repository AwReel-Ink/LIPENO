// Slider de sagesse : 5 paliers d'émojis
const FACES = ['😢', '🙁', '😐', '🙂', '😄'];
const LABELS = ['Très sage', 'Sage', 'Normal', 'Espiègle', 'Très espiègle'];

export function mountWisdomSlider({ value = null, onChange }) {
  let current = (value == null || value < 0 || value > 4) ? -1 : value;
  const root = document.createElement('div');
  root.className = 'wisdom-slider';
  root.innerHTML = `
    <div class="face" aria-live="polite">${current >= 0 ? FACES[current] : '➖'}</div>
    <div class="track" role="slider" aria-label="Niveau de sagesse" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${current}" tabindex="0">
      <div class="dot" style="left: ${current < 0 ? 0 : (current / 4) * 100}%"></div>
    </div>
    <div class="legend">
      <span>Pas Sage</span>
      <span>Très Sage</span>
    </div>
    <button class="btn btn-ghost" style="min-height:36px;padding:6px 12px;font-size:.85rem;" data-clear>Effacer</button>
  `;
  const track = root.querySelector('.track');
  const face = root.querySelector('.face');
  const dot = root.querySelector('.dot');

  function apply(v) {
    if (v == null) {
      current = -1;
      face.textContent = '➖';
      dot.style.left = '0%';
      track.setAttribute('aria-valuenow', '');
    } else {
      current = Math.max(0, Math.min(4, v));
      face.textContent = FACES[current];
      dot.style.left = (current / 4) * 100 + '%';
      track.setAttribute('aria-valuenow', String(current));
      track.setAttribute('aria-valuetext', LABELS[current]);
    }
    if (onChange) onChange(current < 0 ? null : current);
  }

  function pickFromEvent(e) {
    const rect = track.getBoundingClientRect();
    const x = (e.clientX != null ? e.clientX : e.touches[0].clientX) - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(ratio * 4);
  }

  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    apply(pickFromEvent(e));
  });
  track.addEventListener('pointermove', (e) => {
    if (dragging) apply(pickFromEvent(e));
  });
  track.addEventListener('pointerup', (e) => {
    dragging = false;
    try { track.releasePointerCapture(e.pointerId); } catch {}
  });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') apply((current < 0 ? 2 : current) - 1);
    else if (e.key === 'ArrowRight') apply((current < 0 ? 2 : current) + 1);
  });
  root.querySelector('[data-clear]').addEventListener('click', () => apply(null));

  return { root, value: () => (current < 0 ? null : current) };
}
