/* Des feux d'artifice en trame fine (Bayer 4x4) qui éclatent juste à côté du titre, dans la place libre
   entre le titre et la pastille : le mot « Explosada » qui explose. Plus le réveillon approche, plus ça part souvent.
   zone() rend, en px CSS depuis le coin du canvas, l'espace où les gerbes ont le droit d'aller : {x0, x1, y0, y1}. */
function sky(canvas, zone) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const DOT = 2; // un point de trame = 2 px à l'écran
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
  const HUES = [[245, 158, 11], [249, 115, 22], [234, 88, 12]];
  const DUR = 2400;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NYE = new Date(2026, 11, 31, 23, 59).getTime();
  let w = 0, h = 0, img = null, bursts = [], nextAt = 0, raf = 0, last = -1e9;

  function size() {
    w = Math.max(1, Math.round(canvas.clientWidth / DOT));
    h = Math.max(1, Math.round(canvas.clientHeight / DOT));
    canvas.width = w;
    canvas.height = h;
    img = ctx.createImageData(w, h);
  }

  // une gerbe tirée au hasard dans la zone libre, assez petite pour ne jamais passer sous du texte
  function burst(now, p) {
    const z = zone();
    const x0 = z.x0 / DOT, x1 = z.x1 / DOT, y0 = z.y0 / DOT, y1 = z.y1 / DOT;
    const room = Math.min(x1 - x0, y1 - y0) / 2;
    if (room < 6) return null;
    const r = room * (.62 + Math.random() * .3);
    return {
      x: x0 + r + Math.random() * Math.max(0, x1 - x0 - 2 * r),
      y: y0 + r + Math.random() * Math.max(0, y1 - y0 - 2 * r) - r * .12,
      r, rays: 9 + Math.floor(Math.random() * 5), turn: Math.random() * 6.28,
      hue: HUES[Math.floor(Math.random() * HUES.length)], at: now - (p || 0) * DUR,
    };
  }

  // des rayons qui s'ouvrent, une couronne qui s'éloigne, le tout qui retombe un peu et s'éteint
  function light(b, x, y, p) {
    const dx = x - b.x, dy = y - b.y - p * p * b.r * .12;
    const d = Math.hypot(dx, dy), ring = b.r * (1 - Math.pow(1 - p, 3));
    if (d > ring + 2) return 0;
    const ray = Math.pow(.5 + .5 * Math.cos(b.rays * Math.atan2(dy, dx) + b.turn), 3);
    const shell = 1.25 * Math.exp(-Math.pow((d - ring) / (1.5 + ring * .2), 2));
    const trail = Math.pow(d / (ring || 1), 3) * .5;
    const flash = p < .12 ? Math.exp(-d * d / 4) * (1 - p / .12) : 0;
    return (ray * (shell + trail) + flash) * Math.pow(1 - p, 1.3);
  }

  function draw(now) {
    const live = bursts.map(b => [b, (now - b.at) / DUR]).filter(([, p]) => p >= 0 && p < 1);
    const px = img.data;
    px.fill(0);
    for (const [b, p] of live) {
      const xa = Math.max(0, Math.floor(b.x - b.r - 3)), xb = Math.min(w - 1, Math.ceil(b.x + b.r + 3));
      const ya = Math.max(0, Math.floor(b.y - b.r - 3)), yb = Math.min(h - 1, Math.ceil(b.y + b.r + 3));
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const i = (y * w + x) * 4;
          if (px[i + 3] || light(b, x, y, p) <= BAYER[(y & 3) * 4 + (x & 3)]) continue;
          px[i] = b.hue[0]; px[i + 1] = b.hue[1]; px[i + 2] = b.hue[2]; px[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function frame(now) {
    if (now - last > 33) {
      last = now;
      if (now >= nextAt) {
        const b = burst(now);
        bursts = [...bursts.filter(o => now - o.at < DUR), ...(b ? [b] : [])];
        const days = Math.max(0, (NYE - Date.now()) / 864e5);
        nextAt = now + (450 + 1100 * Math.min(1, days / 60)) * (.6 + Math.random() * .8);
      }
      draw(now);
    }
    raf = document.hidden ? 0 : requestAnimationFrame(frame);
  }

  function frozen() {
    bursts = [burst(0, .4), burst(0, .55)].filter(Boolean);
    draw(0);
  }

  size();
  addEventListener("resize", () => { size(); bursts = []; if (still) frozen(); });
  if (still) return frozen();
  raf = requestAnimationFrame(frame);
  // une seule boucle : au retour sur la page, on ne la relance que si elle s'est arrêtée
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
}
