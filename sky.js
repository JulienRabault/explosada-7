/* Des feux d'artifice derrière le titre, en trame fine (Bayer 4x4) : des points ambrés sur le fond de la page.
   Plus le réveillon approche, plus ils éclatent souvent. */
function sky(canvas) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const DOT = 2; // un point de trame = 2 px à l'écran
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
  const HUES = [[245, 158, 11], [249, 115, 22], [251, 191, 36]];
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

  function burst(now, p) {
    const r = h * (.34 + Math.random() * .24);
    return {
      x: w * (.08 + Math.random() * .84), y: h * (.3 + Math.random() * .22), r,
      rays: 10 + Math.floor(Math.random() * 6), turn: Math.random() * 6.28,
      hue: HUES[Math.floor(Math.random() * HUES.length)], at: now - (p || 0) * 3200, dur: 3200,
    };
  }

  // une gerbe : des rayons qui s'ouvrent, une couronne qui s'éloigne, le tout qui retombe et s'éteint
  function light(b, x, y, p) {
    const dx = x - b.x, dy = y - b.y - p * p * b.r * .35;
    const d = Math.hypot(dx, dy), ring = b.r * (1 - Math.pow(1 - p, 3));
    if (d > ring + 3) return 0;
    const ray = Math.pow(.5 + .5 * Math.cos(b.rays * Math.atan2(dy, dx) + b.turn), 3);
    const shell = 1.2 * Math.exp(-Math.pow((d - ring) / (2 + ring * .22), 2));
    const trail = Math.pow(d / (ring || 1), 3) * .55;
    return (ray * (shell + trail) + (p < .12 ? Math.exp(-d * d / 6) * (1 - p / .12) : 0)) * Math.pow(1 - p, 1.4);
  }

  function draw(now) {
    const live = bursts.map(b => [b, (now - b.at) / b.dur]).filter(([, p]) => p >= 0 && p < 1);
    const px = img.data;
    px.fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = 0, hue = null;
        for (const [b, p] of live) {
          const v = light(b, x, y, p);
          if (v > best) { best = v; hue = b.hue; }
        }
        if (best <= BAYER[(y & 3) * 4 + (x & 3)]) continue;
        const i = (y * w + x) * 4;
        px[i] = hue[0]; px[i + 1] = hue[1]; px[i + 2] = hue[2]; px[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function frame(now) {
    if (now - last > 33) {
      last = now;
      if (now >= nextAt) {
        bursts = [...bursts.filter(b => now - b.at < b.dur), burst(now)];
        const days = Math.max(0, (NYE - Date.now()) / 864e5);
        nextAt = now + (500 + 1100 * Math.min(1, days / 60)) * (.6 + Math.random() * .8);
      }
      draw(now);
    }
    raf = document.hidden ? 0 : requestAnimationFrame(frame);
  }

  size();
  addEventListener("resize", () => { size(); if (still) draw(0); });
  if (still) {
    bursts = [burst(0, .3), burst(0, .45), burst(0, .6)];
    return draw(0);
  }
  raf = requestAnimationFrame(frame);
  // une seule boucle : au retour sur la page, on ne la relance que si elle s'est arrêtée
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
}
