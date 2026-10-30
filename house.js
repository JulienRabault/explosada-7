"use strict";

/* L'icône de la page : la maison du réveillon en pixels, la nuit, fenêtres allumées,
   feux d'artifice au-dessus (tramage Bayer 4x4). Le ciel est le fond CSS du canvas. */

function house(canvas) {
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) return;
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const WALL = "#090b15", DOOR = "#b45309", STAR = "#6f7fc0";
  const STARS = [[2, 3], [9, 1], [21, 9], [3, 12], [20, 14], [16, 1]];
  const LIGHT = ["#f59e0b", "#fbbf24"];
  const SPARK = ["#fff3c4", "#fcd34d", "#f59e0b", "#d97706"];
  const DIRS = [[0, -1], [.72, -.72], [1, 0], [.72, .72], [0, 1], [-.72, .72], [-1, 0], [-.72, -.72]];
  const BURSTS = [{ x: 5, y: 5, at: 0 }, { x: 18, y: 4, at: .36 }, { x: 12, y: 3, at: .7 }];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dot = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
  const lit = (x, y, v) => v * 16 > B[(Math.round(y) & 3) * 4 + (Math.round(x) & 3)] + .5;

  function drawHouse(t) {
    STARS.forEach(([x, y]) => dot(x, y, STAR));
    for (let y = 9; y <= 14; y++) for (let x = 12 - (y - 8); x <= 11 + (y - 8); x++) dot(x, y, WALL); // toit
    for (let y = 9; y <= 11; y++) { dot(15, y, WALL); dot(16, y, WALL); } // cheminée
    for (let y = 15; y <= 21; y++) for (let x = 7; x <= 16; x++) dot(x, y, WALL);
    for (let y = 22; y <= 23; y++) for (let x = 0; x < 24; x++) dot(x, y, WALL); // le sol
    const glow = LIGHT[Math.sin(t * 3.1) > .6 ? 1 : 0];
    for (const [wx, wy] of [[8, 16], [14, 16]]) for (let i = 0; i < 4; i++) dot(wx + (i & 1), wy + (i >> 1), glow);
    for (let y = 18; y <= 21; y++) { dot(11, y, DOOR); dot(12, y, DOOR); }
  }

  function drawBurst(b, p) {
    if (p < .22) { dot(b.x, 9 - (9 - b.y) * (p / .22), SPARK[1]); return; } // la fusée qui monte
    const q = (p - .22) / .78, r = 1 + q * 3.6, fade = 1 - q;
    if (q < .12) dot(b.x, b.y, SPARK[0]);
    DIRS.forEach(([dx, dy]) => {
      const x = b.x + dx * r, y = b.y + dy * r;
      if (lit(x, y, fade)) dot(x, y, SPARK[Math.min(3, Math.floor(q * 4))]);
      const tx = b.x + dx * (r - 1), ty = b.y + dy * (r - 1);
      if (q > .2 && lit(tx, ty, fade * .45)) dot(tx, ty, SPARK[3]);
    });
  }

  let last = -1e9;
  function frame(now) {
    if (now - last > 90) {
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      BURSTS.forEach(b => drawBurst(b, still ? .5 : ((t / 2.6 + b.at) % 1)));
      drawHouse(still ? 0 : t);
    }
    raf = !still && !document.hidden ? requestAnimationFrame(frame) : 0;
  }
  let raf = requestAnimationFrame(frame);
  // une seule boucle : au retour sur la page, on ne la relance que si elle s'est arrêtée
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !still && !raf) raf = requestAnimationFrame(frame); });
}
