// Animation "Envoi au Père Noël" - SVG + canvas neige + timing 8-9s
export function playSantaAnimation() {
  return new Promise((resolve) => {
    const stage = document.getElementById('santa-stage');
    stage.removeAttribute('hidden');
    stage.innerHTML = `
      <canvas class="snow-canvas"></canvas>
      <div class="sky-content">
        <div class="status" id="santa-status">Envoi en cours chez le Père Noël...</div>
      </div>
      <svg class="letter-svg" viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="10" y="10" width="200" height="130" fill="#fff" stroke="#d4a017" stroke-width="2"/>
        <line x1="30" y1="50" x2="190" y2="50" stroke="#bbb" stroke-width="2"/>
        <line x1="30" y1="75" x2="190" y2="75" stroke="#bbb" stroke-width="2"/>
        <line x1="30" y1="100" x2="190" y2="100" stroke="#bbb" stroke-width="2"/>
        <polygon points="10,10 110,90 210,10" fill="none" stroke="#d4a017" stroke-width="2"/>
      </svg>
      <svg class="envelope-svg" viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="10" y="40" width="200" height="100" fill="#fff" stroke="#d4a017" stroke-width="2"/>
        <polygon points="10,40 110,110 210,40" fill="#f7f1e8" stroke="#d4a017" stroke-width="2"/>
        <circle cx="110" cy="40" r="14" fill="#b30000"/>
        <text x="110" y="46" text-anchor="middle" font-size="18" fill="#fff" font-family="sans-serif" font-weight="bold">♥</text>
      </svg>
      <button class="skip-btn" id="santa-skip">Passer ✕</button>
    `;

    const statusEl = stage.querySelector('#santa-status');
    const snowCanvas = stage.querySelector('.snow-canvas');
    const ctx = snowCanvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    const flakes = [];
    const FLAKE_COUNT = 80;
    for (let i = 0; i < FLAKE_COUNT; i++) {
      flakes.push({
        x: Math.random() * snowCanvas.width,
        y: Math.random() * snowCanvas.height,
        r: 1 + Math.random() * 2.5,
        s: 0.3 + Math.random() * 1.2,
        d: Math.random() * Math.PI * 2,
      });
    }
    let raf = null;
    function drawSnow() {
      ctx.clearRect(0, 0, snowCanvas.width, snowCanvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of flakes) {
        f.y += f.s;
        f.x += Math.sin(f.d) * 0.4;
        f.d += 0.01;
        if (f.y > snowCanvas.height) { f.y = -5; f.x = Math.random() * snowCanvas.width; }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(drawSnow);
    }
    drawSnow();

    function resize() {
      snowCanvas.width = window.innerWidth * devicePixelRatio;
      snowCanvas.height = window.innerHeight * devicePixelRatio;
      snowCanvas.style.width = window.innerWidth + 'px';
      snowCanvas.style.height = window.innerHeight + 'px';
      ctx.scale(devicePixelRatio, devicePixelRatio);
      // Note : le scale s'applique plusieurs fois en cas de resize répété ; on compense :
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    // Phase 2 : 4s -> changement de texte en fondu
    setTimeout(() => {
      statusEl.classList.add('fading');
      setTimeout(() => {
        statusEl.innerHTML = 'Lettre reçue ! <span class="emoji">🎅</span>';
        statusEl.classList.remove('fading');
      }, 800);
    }, 4000);

    // Fin : ~9s -> fondu de sortie, resolve
    let resolved = false;
    function end() {
      if (resolved) return;
      resolved = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      stage.classList.add('fade-out');
      setTimeout(() => {
        stage.setAttribute('hidden', '');
        stage.innerHTML = '';
        stage.classList.remove('fade-out');
        resolve();
      }, 700);
    }

    stage.querySelector('#santa-skip').addEventListener('click', end);
    setTimeout(end, 9000);
  });
}