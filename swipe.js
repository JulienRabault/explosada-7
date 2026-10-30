"use strict";

/* Mode swipe : une carte par lieu. À droite j'adore (5 étoiles), à gauche bof (1 étoile), en haut on passe.
   Les notes sont les mêmes que les étoiles de la fiche : elles comptent dans « Mieux notés ». */
const LIKE = 5, NOPE = 1;
const SWIPE_ICON = {
  heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  cards: '<rect x="8" y="3" width="12" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/>',
};
const deck = { ids: [], i: 0, history: [], busy: false };

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
  deck.history = [];
  renderDeck();
  if (!$("swipe").open) $("swipe").showModal();
}

function renderDeck() {
  const cur = findPlace(deck.ids[deck.i]), next = findPlace(deck.ids[deck.i + 1]);
  $("swipe-count").textContent = cur ? `${deck.i + 1} / ${deck.ids.length}` : "";
  $("swipe-undo").disabled = !deck.history.length;
  ["swipe-nope", "swipe-like", "swipe-skip"].forEach(id => { $(id).disabled = !cur; });
  if (!cur) return $("swipe-stack").replaceChildren(doneView());
  const top = card(cur, true);
  $("swipe-stack").replaceChildren(...(next ? [card(next, false)] : []), top);
  drag(top);
}

function card(l, isTop) {
  const t = total(l), pp = t / data.nb, src = safeUrl(l.photo), beds = shortBeds(l);
  const { list, avg } = notes(l.id);
  const mine = myNote(l.id);
  let media = h("span", { class: "card-img none" }, icon(ICON.house, 56));
  if (src) {
    media = h("img", { class: "card-img", src, alt: "", draggable: "false", decoding: "async", referrerpolicy: "no-referrer" });
    media.addEventListener("error", () => media.replaceWith(h("span", { class: "card-img none" }, icon(ICON.house, 56))));
  }
  return h("article", { class: "card " + (isTop ? "top" : "next"), "aria-label": l.nom, "aria-hidden": isTop ? null : "true" },
    media,
    h("span", { class: "stamp like", "aria-hidden": "true" }, "J'adore"),
    h("span", { class: "stamp nope", "aria-hidden": "true" }, "Bof"),
    h("span", { class: "stamp skip", "aria-hidden": "true" }, "Je passe"),
    h("div", { class: "card-text" },
      h("h2", { class: "card-title" }, l.nom),
      h("p", { class: "card-meta" },
        h("span", { class: "card-price" + (t ? " " + toneOf(pp) : "") }, t ? euros(pp) + " / pers." : "Prix à demander"),
        beds ? h("span", {}, beds) : null,
        list.length ? h("span", { class: "card-avg" }, icon(ICON.star, 14), `${virgule(avg)} (${list.length})`) : null),
      l.infos || l.fete ? h("p", { class: "card-info" }, l.infos || l.fete) : null,
      mine ? h("p", { class: "card-mine" }, mine === LIKE ? "Tu as adoré" : mine === NOPE ? "Tu as dit bof" : `Ta note : ${mine} sur 5`) : null),
    isTop ? h("button", { class: "card-more", type: "button", onclick: () => openPlace(l.id) }, "Voir la fiche", icon(ICON.chevron, 14)) : null);
}

function doneView() {
  const any = deck.ids.length > 0;
  return h("div", { class: "deck-done" },
    h("h2", {}, any ? "C'est tout vu" : "Rien à noter"),
    h("p", {}, any ? "Tes notes comptent dans le classement « Mieux notés »." : "Tu as vu tous les lieux."),
    h("button", { class: "deck-cta", type: "button", onclick: showRanking }, "Voir le classement"),
    h("button", { class: "text-btn", type: "button", onclick: () => openDeck(true) }, "Revoir tous les lieux"));
}

function showRanking() {
  sort = "avis";
  $("swipe").close();
  refresh();
  $("tabs").scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
}

/* ---------- le geste ---------- */
function drag(el) {
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
  const end = () => {
    if (!active) return;
    active = false;
    el.classList.remove("dragging");
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
  deck.i++;
  fling($("swipe-stack").querySelector(".card.top"), note).then(() => {
    deck.busy = false;
    renderDeck();
  });
}

function fling(el, note) {
  if (!el || reduceMotion()) return Promise.resolve();
  const [x, y, r] = note === LIKE ? [innerWidth * 1.3, 40, 26] : note === NOPE ? [-innerWidth * 1.3, 40, -26] : [0, -innerHeight, 0];
  el.style.setProperty(note === LIKE ? "--like" : note === NOPE ? "--nope" : "--skip", 1);
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
  $("swipe-like").addEventListener("click", () => decide(LIKE));
  $("swipe-nope").addEventListener("click", () => decide(NOPE));
  $("swipe-skip").addEventListener("click", () => decide(0));
  $("swipe-undo").addEventListener("click", undo);
  $("swipe").addEventListener("keydown", ev => {
    if ($("place").open) return;
    const act = { ArrowRight: () => decide(LIKE), ArrowLeft: () => decide(NOPE), ArrowUp: () => decide(0), Backspace: undo }[ev.key];
    if (!act) return;
    ev.preventDefault();
    act();
  });
}
