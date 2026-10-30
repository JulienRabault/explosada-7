"use strict";

/* Mode swipe : une carte par lieu. À droite j'adore (5 étoiles), à gauche bof (1 étoile), en haut on passe.
   Les notes sont les mêmes que les étoiles de la fiche : elles comptent dans « Mieux notés ». */
const LIKE = 5, NOPE = 1;
const SWIPE_ICON = {
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  cards: '<rect x="8" y="3" width="12" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
// open : la carte du dessus est dépliée en fiche ; photo : la photo affichée sur cette carte
// done : lieux déjà vus avant d'ouvrir la pile, pour que le compteur reprenne où on en était
const deck = { ids: [], i: 0, done: 0, history: [], busy: false, open: false, photo: 0 };
let gallery = {}; // photos.json : plusieurs photos par lieu, la première en grand
const photosOf = l => ((gallery[l.id] || []).length ? gallery[l.id] : [l.photo]).map(safeUrl).filter(Boolean);

const swipeable = l => statutOf(l) !== "Abandonné";
const myNote = id => (data.avis.find(a => a.id === id && isMe(a.prenom)) || {}).note || 0;
// les lieux passés sans noter sont gardés sur le téléphone : on reprend là où on s'était arrêté
const skipped = {
  read() {
    try { return JSON.parse(store.get("passes")) || []; } catch (e) { return []; }
  },
  set(id, on) { store.set("passes", JSON.stringify([...this.read().filter(x => x !== id), ...(on ? [id] : [])])); },
};
const toRate = () => {
  const passed = skipped.read();
  return data.lieux.filter(l => swipeable(l) && !myNote(l.id) && !passed.includes(l.id));
};
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// le groupe vient surtout pour noter : grande carte ; les appelants gardent un petit bouton à côté du tri
function renderSwipeEntry() {
  $("swipe-open").hidden = !loaded || canEdit();
  $("swipe-mini").hidden = !loaded || !canEdit();
  const n = toRate().length;
  $("swipe-sub").textContent = !loaded ? ""
    : n ? `${n} ${n > 1 ? "lieux" : "lieu"} à noter d'un geste`
    : "Tout est noté. Tu peux revoir tes choix.";
}

// La pile est figée à l'ouverture : une mise à jour de la Sheet ne doit pas changer la carte sous le doigt.
function openDeck(all) {
  const list = all ? data.lieux.filter(swipeable) : toRate();
  deck.ids = [...list].sort((a, b) => (Number(b.prio) || 0) - (Number(a.prio) || 0)).map(l => l.id);
  deck.i = 0;
  deck.done = all ? 0 : data.lieux.filter(swipeable).length - list.length;
  deck.history = [];
  deck.open = false;
  deck.photo = 0;
  $("swipe-help").hidden = !!store.get("swipe-vu");
  renderDeck();
  if (!$("swipe").open) $("swipe").showModal();
}

function renderDeck() {
  const cur = findPlace(deck.ids[deck.i]), next = findPlace(deck.ids[deck.i + 1]);
  $("swipe-count").textContent = cur ? `${deck.done + deck.i + 1} / ${deck.done + deck.ids.length}` : "";
  $("swipe-undo").disabled = !deck.history.length;
  ["swipe-nope", "swipe-like", "swipe-skip"].forEach(id => { $(id).disabled = !cur; });
  if (!cur) return $("swipe-stack").replaceChildren(doneView());
  const top = card(cur, true);
  $("swipe-stack").replaceChildren(...(next ? [card(next, false)] : []), top);
  if (!deck.open) drag(top, cur);
  // les photos de la carte du dessus et la première de la suivante arrivent avant qu'on les demande
  [...photosOf(cur), ...(next ? photosOf(next).slice(0, 1) : [])].forEach(src => { new Image().src = src; });
}

function card(l, isTop) {
  const open = isTop && deck.open;
  return h("article", { class: "card " + (isTop ? "front" : "back") + (open ? " open" : ""), "aria-label": l.nom, "aria-hidden": isTop ? null : "true" },
    photoBox(l, isTop),
    open ? null : h("span", { class: "card-tint", "aria-hidden": "true" }),
    open ? null : h("span", { class: "stamp like", "aria-hidden": "true" }, "J'adore"),
    open ? null : h("span", { class: "stamp nope", "aria-hidden": "true" }, "Bof"),
    open ? null : h("span", { class: "stamp skip", "aria-hidden": "true" }, "Je passe"),
    open ? detail(l) : summary(l, isTop));
}

// Les photos d'annonce sont en paysage : plutôt que d'en étirer une sur toute la carte, on en montre trois
// à leur format (une grande, deux petites). Un tap fait tourner les trois ; carte dépliée, une seule en grand.
function photoBox(l, isTop) {
  const pics = photosOf(l), at = isTop ? Math.min(deck.photo, Math.max(0, pics.length - 1)) : 0;
  const open = isTop && deck.open;
  const slots = !open && pics.length >= 3 ? 3 : 1;
  const none = () => h("span", { class: "card-img none" }, icon(ICON.house, 56));
  const cell = k => {
    let media = none();
    if (pics.length) {
      media = h("img", { class: "card-img", src: pics[(at + k) % pics.length], alt: "", draggable: "false", decoding: "async", referrerpolicy: "no-referrer", "data-slot": k });
      media.addEventListener("error", () => media.replaceWith(none()));
    }
    return h("div", { class: "ph " + (k ? "small" : "main") }, media);
  };
  const box = h("div", { class: "card-photos" + (slots === 1 ? " single" : "") },
    Array.from({ length: slots }, (_, k) => cell(k)),
    pics.length > 1 ? h("div", { class: "card-bars", "aria-hidden": "true" }, pics.map((_, k) => h("span", { class: k === at ? "on" : null }))) : null,
    open ? h("button", { class: "card-fold", type: "button", "aria-label": "Refermer la fiche", onclick: () => fold(false) }, icon(SWIPE_ICON.down, 20)) : null);
  // carte dépliée : on change de photo d'un tap ; repliée, c'est le geste qui s'en charge (drag)
  if (open) box.addEventListener("click", ev => {
    if (ev.target.closest("button")) return;
    const r = box.getBoundingClientRect();
    flip(l, ev.clientX - r.left < r.width / 3 ? -1 : 1);
  });
  return box;
}

// passe à la photo voisine sans redessiner la carte (le geste en cours garde ses écouteurs)
function flip(l, dir) {
  const pics = photosOf(l), at = deck.photo + dir;
  if (at < 0 || at >= pics.length) return;
  deck.photo = at;
  const el = $("swipe-stack").querySelector(".card.front");
  el.querySelectorAll("img.card-img").forEach(img => { img.src = pics[(at + Number(img.dataset.slot)) % pics.length]; });
  el.querySelectorAll(".card-bars span").forEach((b, k) => b.classList.toggle("on", k === at));
}

function fold(open) {
  deck.open = open;
  renderDeck();
}

const pricePill = l => {
  const t = total(l), pp = t / data.nb;
  return h("span", { class: "card-price" + (t ? " " + toneOf(pp) : "") }, t ? euros(pp) + " / pers." : "Prix à demander");
};

// pas de moyenne dans le swipe, même pour les appelants : chacun vote sans voir les autres
function summary(l, isTop) {
  const mine = myNote(l.id), beds = shortBeds(l);
  return h("div", { class: "card-text" },
    h("h2", { class: "card-title" }, l.nom),
    h("p", { class: "card-meta" },
      pricePill(l),
      beds ? h("span", {}, beds) : null),
    l.infos || l.fete ? h("p", { class: "card-info" }, l.infos || l.fete) : null,
    mine ? h("p", { class: "card-mine" }, mine === LIKE ? "Tu as adoré" : mine === NOPE ? "Tu as dit bof" : `Ta note : ${mine} sur 5`) : null,
    isTop ? h("button", { class: "card-unfold", type: "button", "aria-label": "Tout voir sur " + l.nom, onclick: () => fold(true) }, icon(SWIPE_ICON.info, 22)) : null);
}

// la fiche dans la carte : tout ce qu'il faut pour se décider, sans quitter le swipe
function detail(l) {
  const st = statutOf(l), href = safeUrl(l.lien), v = checkOf(l);
  const [tone, label] = Object.prototype.hasOwnProperty.call(VERDICT, v.verdict) ? VERDICT[v.verdict] : [];
  const line = (k, val) => val ? h("div", { class: "dl-row" }, h("span", { class: "dl-k" }, k), h("span", { class: "dl-v" }, val)) : null;
  return h("div", { class: "card-detail" },
    h("h2", { class: "detail-title" }, l.nom),
    h("p", { class: "card-meta" },
      pricePill(l),
      href ? h("a", { class: "detail-chip", href, target: "_blank", rel: "noopener noreferrer", "aria-label": "Voir l'annonce sur " + host(href) }, host(href), icon(ICON.out, 13)) : null),
    l.infos ? h("p", { class: "detail-p" }, l.infos) : null,
    h("div", { class: "dl" },
      line("Prix 3 nuits", Number(l.prix) ? euros(Number(l.prix)) : "à demander"),
      line("Obtenu au tél.", Number(l.prixNego) ? euros(Number(l.prixNego)) : null),
      line("Couchages", l.couchages),
      line("Fête", l.fete),
      line("Où on en est", st ? st + (l.qui ? " · " + whoText(l) : "") : null)),
    label ? h("div", { class: "detail-check" },
      h("p", { class: "detail-h" }, "Vérifié le " + verif.date, h("span", { class: "pill " + tone }, label)),
      v.resume ? h("p", { class: "detail-p" }, v.resume) : null) : null,
    href ? h("a", { class: "detail-link", href, target: "_blank", rel: "noopener noreferrer" }, "Voir l'annonce sur " + host(href), icon(ICON.out, 15)) : null,
    canEdit() ? h("button", { class: "text-btn", type: "button", onclick: () => openPlace(l.id) }, "Suivi et appel") : null);
}

function doneView() {
  const any = deck.ids.length > 0;
  return h("div", { class: "deck-done" },
    h("h2", {}, any ? "C'est tout vu" : "Rien à noter"),
    h("p", {}, any ? (seesVotes() ? "Tes notes comptent dans le classement « Mieux notés »." : "Merci ! Le classement sera annoncé dans le groupe.") : "Tu as vu tous les lieux."),
    seesVotes()
      ? h("button", { class: "deck-cta", type: "button", onclick: showRanking }, "Voir le classement")
      : h("button", { class: "deck-cta", type: "button", onclick: () => $("swipe").close() }, "Retour à la liste"),
    h("button", { class: "text-btn", type: "button", onclick: () => openDeck(true) }, "Revoir tous les lieux"));
}

function showRanking() {
  sort = "avis";
  $("swipe").close();
  refresh();
  $("tabs").scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
}

/* ---------- le geste ---------- */
function drag(el, l) {
  const behind = el.previousElementSibling;
  let x0 = 0, y0 = 0, t0 = 0, dx = 0, dy = 0, active = false;
  const show = () => {
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    el.style.setProperty("--like", Math.max(0, Math.min(1, dx / 100)));
    el.style.setProperty("--nope", Math.max(0, Math.min(1, -dx / 100)));
    el.style.setProperty("--skip", Math.max(0, Math.min(1, (-dy - Math.abs(dx)) / 100)));
    if (behind) behind.style.setProperty("--p", Math.min(1, Math.hypot(dx, dy) / 160));
  };
  el.addEventListener("pointerdown", e => {
    if (e.button !== 0 || deck.busy || e.target.closest("button")) return;
    active = true;
    x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); dx = dy = 0;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  el.addEventListener("pointermove", e => {
    if (!active) return;
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    show();
  });
  const end = e => {
    if (!active) return;
    active = false;
    el.classList.remove("dragging");
    // un simple tap : en bas on déplie la fiche, ailleurs on change de photo (à gauche la précédente)
    if (e.type === "pointerup" && Math.hypot(dx, dy) < 8 && performance.now() - t0 < 350) {
      const r = el.getBoundingClientRect();
      if (e.clientY - r.top > r.height * 0.7) return fold(true);
      return flip(l, e.clientX - r.left < r.width / 3 ? -1 : 1);
    }
    // un geste vif compte même s'il est court
    const fast = Math.abs(dx) / Math.max(1, performance.now() - t0) > 0.6;
    if (dx > 110 || (dx > 40 && fast)) return decide(LIKE);
    if (dx < -110 || (dx < -40 && fast)) return decide(NOPE);
    if (dy < -120 && Math.abs(dx) < 80) return decide(0);
    dx = dy = 0;
    show();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

// note : LIKE, NOPE, ou 0 pour passer sans noter
function decide(note) {
  const l = findPlace(deck.ids[deck.i]);
  if (!l || deck.busy) return;
  deck.busy = true;
  deck.history.push({ id: l.id, before: myNote(l.id), note });
  if (note) rate(l, note);
  else skipped.set(l.id, true);
  if (note && navigator.vibrate) navigator.vibrate(12);
  if (!store.get("swipe-vu")) { store.set("swipe-vu", "1"); $("swipe-help").hidden = true; }
  deck.i++;
  deck.photo = 0;
  deck.open = false;
  fling($("swipe-stack").querySelector(".card.front"), note).then(() => {
    deck.busy = false;
    renderDeck();
  });
}

function fling(el, note) {
  if (!el || reduceMotion()) return Promise.resolve();
  const [x, y, r] = note === LIKE ? [innerWidth * 1.3, 40, 26] : note === NOPE ? [-innerWidth * 1.3, 40, -26] : [0, -innerHeight, 0];
  el.style.setProperty(note === LIKE ? "--like" : note === NOPE ? "--nope" : "--skip", 1);
  el.classList.remove("open");
  el.classList.add("gone");
  el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg)`;
  const behind = el.previousElementSibling;
  if (behind) behind.style.setProperty("--p", 1);
  return new Promise(resolve => setTimeout(resolve, 300));
}

function undo() {
  const last = deck.history.pop();
  if (!last || deck.busy) return;
  const l = findPlace(last.id);
  if (l && last.note && last.note !== last.before) rate(l, last.before);
  if (!last.note) skipped.set(last.id, false);
  deck.i = Math.max(0, deck.i - 1);
  deck.open = false;
  deck.photo = 0;
  renderDeck();
}

function setupSwipe() {
  $("swipe-open").prepend(h("span", { class: "swipe-ico" }, icon(SWIPE_ICON.cards, 22)));
  $("swipe-open").append(h("span", { class: "chev" }, icon(ICON.chevron, 16)));
  $("swipe-nope").append(icon(ICON.x, 30));
  $("swipe-like").append(icon(SWIPE_ICON.heart, 30));
  $("swipe-undo").append(icon(SWIPE_ICON.undo, 20));
  $("swipe-skip").append(icon(SWIPE_ICON.up, 20));
  $("swipe-mini").prepend(icon(SWIPE_ICON.cards, 14));
  [$("swipe-open"), $("swipe-mini")].forEach(b => b.addEventListener("click", () => withName(() => openDeck(!toRate().length))));
  $("swipe-close").addEventListener("click", () => $("swipe").close());
  $("swipe").addEventListener("close", sendNotes);
  // Échap replie d'abord la fiche avant de quitter le swipe
  $("swipe").addEventListener("cancel", ev => { if (deck.open) { ev.preventDefault(); fold(false); } });
  fetch("photos.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(g => { gallery = g || {}; })
    .catch(() => { /* sans galerie, une photo par lieu */ });
  $("swipe-like").addEventListener("click", () => decide(LIKE));
  $("swipe-nope").addEventListener("click", () => decide(NOPE));
  $("swipe-skip").addEventListener("click", () => decide(0));
  $("swipe-undo").addEventListener("click", undo);
  $("swipe").addEventListener("keydown", ev => {
    if ($("place").open) return;
    const act = { ArrowRight: () => decide(LIKE), ArrowLeft: () => decide(NOPE), ArrowUp: () => decide(0), ArrowDown: () => fold(!deck.open), Backspace: undo }[ev.key];
    if (!act) return;
    ev.preventDefault();
    act();
  });
}
