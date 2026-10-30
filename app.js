"use strict";

/* ---------- réglages ---------- */
const STATUTS = ["À appeler", "Pas de réponse", "Dispo", "Option posée", "Réservé", "Abandonné"];
const EN_COURS = ["Pas de réponse", "Dispo", "Option posée", "Réservé"];
const TONE = { "Pas de réponse": "gray", "Dispo": "green", "Option posée": "orange", "Réservé": "blue", "Abandonné": "red" };
// réponses proposées juste après un appel : [statut enregistré, libellé du bouton]
const RESULTS = [["Dispo", "C'est dispo"], ["Abandonné", "Pas dispo"], ["Pas de réponse", "Pas de réponse"], ["Option posée", "Option posée"]];
const ASK = [
  "Libre du jeudi 31/12 au dimanche 03/01, les 3 nuits ?",
  "Prix exact pour 35, tout compris : ménage, draps, taxe de séjour, chauffage ?",
  "Le propriétaire ou des voisins vivent sur place ou juste à côté ?",
  "On peut mettre des enceintes et faire la fête tard ? Jusqu'à quelle heure ?",
  "La cuisine suffit pour 35 : frigos, feux, four, vaisselle ?",
  "Rien que pour nous ? Caution et acompte ?",
];
const TABS = [
  { key: "call", label: "À appeler", note: "Pas de calendrier en ligne : il faut appeler pour savoir si c'est libre." },
  { key: "doing", label: "En cours", note: "Quelqu'un a déjà appelé. Touche un lieu pour voir où on en est." },
  { key: "online", label: "En ligne", note: "Affichés libres en ligne le 29/10. Le calendrier peut bouger d'ici la réservation." },
  { key: "out", label: "Écartés", note: "Pas dispo, trop cher ou fête refusée." },
];
const SORTS = [
  { key: "prio", label: "Conseillés", hint: "nos préférés d'abord" },
  { key: "prix", label: "Moins chers", hint: "prix par personne" },
  { key: "avis", label: "Mieux notés", hint: "par les copains" },
];
const MIDNIGHT = Date.parse("2027-01-01T00:00:00+01:00");

/* ---------- état ---------- */
let data = VIDE();
let tab = "call", sort = "prio", openId = null, afterCall = null, loaded = false;
let verif = { date: "", lieux: {} }; // la vérification des annonces, fichier fixe verif.json

/* ---------- petits outils ---------- */
const $ = id => document.getElementById(id);
const euros = n => Math.round(n).toLocaleString("fr-FR") + " €";
const virgule = n => n.toFixed(1).replace(".", ",");
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false && k !== "") e.append(k);
  return e;
}
function icon(path, size = 18) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  s.innerHTML = path;
  return s;
}
const ICON = {
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  updown: '<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>',
  house: '<path d="M4 11 12 4l8 7v9h-5v-6h-6v6H4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
function host(u) {
  try {
    const d = new URL(u).hostname.replace(/^www\./, "");
    return { "airbnb.fr": "Airbnb", "abritel.fr": "Abritel", "grandsgites.com": "Grands Gîtes" }[d] || "Site";
  } catch (e) { return "Site"; }
}
const telHref = t => {
  const d = t.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) return "tel:+" + d.slice(2);
  return "tel:" + (d.startsWith("0") ? "+33" + d.slice(1) : d);
};
const safeUrl = u => /^https:\/\//i.test(u || "") || /^img\/([tp]\/)?[\w.-]+$/.test(u || "") ? u : null;
// les photos du site ont une miniature légère dans img/t/ pour la liste
const thumbUrl = u => /^img\/[\w.-]+$/.test(u || "") ? u.replace(/^img\//, "img/t/") : u;
const canEdit = () => data.role !== "groupe";
const phones = l => String(l.tel || "").split("/").map(t => t.trim()).filter(Boolean);
const shortBeds = l => String(l.couchages || "").replace(/\s*\(.*?\)/g, "").trim();
const toneOf = pp => pp <= 150 ? "green" : pp <= 200 ? "orange" : "red";
const typing = () => { const a = document.activeElement; return !!a && $("place").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
const findPlace = id => data.lieux.find(x => x.id === id);

// gardé en mémoire : le message peut vivre dans une feuille, reconstruite à chaque mise à jour
let toastTimer, toastEl;
function toast(t) {
  const el = toastEl || (toastEl = $("toast"));
  // une feuille ouverte passe au-dessus de tout : le message doit vivre dedans pour rester visible
  const top = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
  if (el.parentNode !== top) top.append(el);
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function ago(v) {
  const t = typeof v === "number" ? v : Date.parse(v);
  if (!Number.isFinite(t) || !t) return "";
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return "le " + new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ---------- boîte de confirmation façon iOS ---------- */
// onYes s'exécute dans le geste même (un appel téléphonique doit partir du tap)
function askBox(title, text, yes, no, onYes) {
  const dlg = $("ask");
  $("ask-title").textContent = title;
  $("ask-text").textContent = text;
  $("ask-yes").textContent = yes;
  $("ask-no").textContent = no;
  dlg.showModal();
  $("ask-no").focus();
  return new Promise(resolve => {
    const done = ok => () => { dlg.close(); if (ok && onYes) onYes(); resolve(ok); };
    $("ask-yes").onclick = done(true);
    $("ask-no").onclick = done(false);
    dlg.oncancel = ev => { ev.preventDefault(); done(false)(); };
  });
}

/* ---------- prénom : obligatoire dès l'arrivée ---------- */
let afterName = null;
function withName(fn) {
  const n = myName();
  if (n) return fn(n);
  afterName = fn;
  openWho();
}
function openWho() {
  const others = data.personnes.filter(p => !isMe(p));
  $("who-list").textContent = others.length ? "Déjà là : " + others.join(", ") + "." : "";
  $("whomsg").textContent = "";
  $("whoname").value = myName();
  $("who-title").textContent = myName() ? "Changer de prénom" : "Bienvenue";
  $("who").showModal();
  $("whoname").focus();
}
function setupWho() {
  $("who-btn").addEventListener("click", () => { afterName = null; openWho(); });
  // sans prénom, on ne peut pas fermer la fenêtre
  $("who").addEventListener("cancel", ev => { if (!myName()) ev.preventDefault(); });
  // Chrome ferme quand même au second Échap : on rouvre tant qu'il manque le prénom
  $("who").addEventListener("close", () => { if (!myName() && !locked) setTimeout(openWho); });
  $("whoform").addEventListener("submit", ev => {
    ev.preventDefault();
    const n = $("whoname").value.trim().replace(/\s+/g, " ");
    if (!PRENOM.test(n)) {
      $("whomsg").textContent = "Juste ton prénom, en lettres (30 au plus).";
      return $("whoname").focus();
    }
    if (sameName(n, myName())) return acceptName(n);
    // deux copains du même prénom seraient confondus : on le signale avant
    const twin = data.personnes.find(p => sameName(p, n));
    if (twin) {
      return askBox(`Il y a déjà un ${twin}`,
        `Si c'est toi sur un autre téléphone, continue. Sinon, ajoute l'initiale de ton nom (${n} B.) pour qu'on ne vous mélange pas.`,
        "C'est moi", "Changer", () => acceptName(n)).then(ok => { if (!ok) $("whoname").focus(); });
    }
    acceptName(n);
  });
}
function acceptName(n) {
  const changed = !sameName(n, myName());
  store.set("prenom", n);
  $("who").close();
  renderWho();
  refresh();
  if (changed) sayHello(true);
  const next = afterName;
  afterName = null;
  if (next) next(n);
}
function renderWho() {
  const n = myName();
  $("who-btn").replaceChildren(n ? n[0].toUpperCase() : icon(ICON.person, 18));
  $("who-btn").setAttribute("aria-label", n ? `Tu es ${n}. Changer de prénom` : "Dire qui tu es");
}
// note la visite dans l'onglet Personnes, au plus une fois toutes les 6 h par téléphone
let helloing = false;
async function sayHello(force) {
  if (!myName() || helloing) return;
  if (!force && Date.now() - (Number(store.get("bonjour")) || 0) < 6 * 36e5) return;
  helloing = true;
  const d = await send({ action: "bonjour" });
  helloing = false;
  // la Sheet occupée laisse tomber la visite : elle ne compte que si le prénom figure dans Personnes
  if (d && d.personnes.some(isMe)) store.set("bonjour", String(Date.now()));
}

/* ---------- lecture des lieux ---------- */
const statutOf = l => (l.statut && l.statut !== "À appeler" ? l.statut : null);
function bucket(l) {
  const st = statutOf(l);
  if (st === "Abandonné") return "out";
  if (EN_COURS.includes(st)) return "doing";
  return l.aAppeler === "non" ? "online" : "call";
}
const total = l => Number(l.prixNego) || Number(l.prix) || 0;
function notes(id) {
  const list = data.avis.filter(a => a.id === id && a.note > 0);
  const avg = list.length ? list.reduce((s, a) => s + a.note, 0) / list.length : 0;
  return { list, avg };
}
function sorted(list) {
  const by = {
    prio: (a, b) => (Number(b.prio) || 0) - (Number(a.prio) || 0),
    prix: (a, b) => (total(a) || 1e9) - (total(b) || 1e9),
    avis: (a, b) => notes(b.id).avg - notes(a.id).avg || notes(b.id).list.length - notes(a.id).list.length,
  }[sort];
  return [...list].sort(by);
}
const pill = st => h("span", { class: "pill " + TONE[st] }, st);
const whoText = l => isMe(l.qui) ? "Toi" : l.qui;

/* ---------- liste ---------- */
function thumb(l) {
  const src = safeUrl(thumbUrl(l.photo));
  if (!src) return h("span", { class: "thumb none" }, icon(ICON.house, 22));
  const img = h("img", { class: "thumb", src, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("span", { class: "thumb none" }, icon(ICON.house, 22))));
  return img;
}

function row(l) {
  const { list, avg } = notes(l.id);
  const st = statutOf(l), t = total(l), pp = t / data.nb, tels = phones(l);
  const beds = shortBeds(l);
  const since = l.qui && l.depuis ? " · " + ago(l.depuis) : "";
  const foot = st
    ? [pill(st), l.qui ? h("span", { class: "who" }, whoText(l)) : null]
    : l.qui ? [h("span", { class: "who tint" }, (isMe(l.qui) ? "Tu t'en occupes" : l.qui + " s'en occupe") + since)]
    : checkTag(l);
  return h("li", { class: "row" },
    h("button", { class: "row-main", type: "button", onclick: () => openPlace(l.id) },
      thumb(l),
      h("span", { class: "row-text" },
        h("span", { class: "row-title" }, l.nom),
        h("span", { class: "row-sub" },
          t ? h("span", { class: toneOf(pp) }, euros(pp) + " / pers.") : "Prix à demander",
          beds ? " · " + beds : ""),
        foot ? h("span", { class: "row-foot" }, foot) : null),
      list.length ? h("span", { class: "row-avg", "aria-label": `Moyenne ${virgule(avg)} sur 5` }, icon(ICON.star, 13), virgule(avg)) : null,
      h("span", { class: "chev" }, icon(ICON.chevron, 16))),
    canEdit() && tab === "call" && tels.length
      ? h("button", { class: "row-call" + (l.qui && !isMe(l.qui) ? " taken" : ""), type: "button", "aria-label": "Appeler " + l.nom, onclick: () => call(l, tels[0]) }, icon(ICON.phone, 20))
      : null);
}

function logLine(e, withPlace) {
  const nom = withPlace && e.id ? (findPlace(e.id) || {}).nom : "";
  return h("div", { class: "cell log" },
    h("span", { class: "log-text" }, h("b", {}, e.par), " ", e.quoi, nom ? h("span", { class: "log-place" }, " · " + nom) : null),
    h("span", { class: "log-time" }, ago(e.t)));
}

function renderList() {
  const nb = data.nb;
  $("nb").textContent = nb;
  $("cap").textContent = `Budget max ${euros(200 * nb)}, soit 200 € chacun`;
  $("less").disabled = nb <= 10;
  $("more").disabled = nb >= 80;
  $("stepper").hidden = !canEdit();
  $("add-group").hidden = !canEdit();
  $("sheet-group").hidden = !SHEET || !canEdit();
  const counts = {};
  data.lieux.forEach(l => { counts[bucket(l)] = (counts[bucket(l)] || 0) + 1; });
  $("tabs").replaceChildren(...TABS.map(t => h("button", {
    class: "seg-btn", type: "button", "aria-pressed": String(tab === t.key),
    "aria-label": loaded ? `${t.label}, ${counts[t.key] || 0}` : null,
    onclick: () => { tab = t.key; renderList(); },
  }, t.label, loaded ? h("span", { class: "seg-n" }, String(counts[t.key] || 0)) : null)));
  const shown = sorted(data.lieux.filter(l => bucket(l) === tab));
  const n = shown.length;
  $("count").textContent = loaded ? `${n} ${n > 1 ? "lieux" : "lieu"}` : "";
  $("note").textContent = loaded && n ? TABS.find(t => t.key === tab).note : "";
  renderSort();
  $("list").replaceChildren(...(n ? shown.map(row) : [h("li", { class: "empty" }, loaded ? "Rien ici pour l'instant." : "Chargement des lieux…")]));
  renderSwipeEntry();
  const recent = data.journal.slice(-6).reverse();
  $("activity").hidden = !recent.length;
  $("activity-list").replaceChildren(...recent.map(e => logLine(e, true)));
}

/* ---------- menu de tri ---------- */
function renderSort() {
  $("sort-btn").replaceChildren(SORTS.find(s => s.key === sort).label, icon(ICON.updown, 13));
  $("sort-btn").setAttribute("aria-label", "Trier : " + SORTS.find(s => s.key === sort).label);
}
function toggleSort(open) {
  const menu = $("sort-menu");
  open = open === undefined ? menu.hidden : open;
  if (open) {
    menu.replaceChildren(...SORTS.map(s => h("button", {
      class: "menu-item", type: "button", role: "menuitemradio", "aria-checked": String(s.key === sort),
      onclick: () => { sort = s.key; toggleSort(false); renderList(); $("sort-btn").focus(); },
    }, h("span", { class: "check" }, icon(ICON.check, 18)), h("span", {}, s.label, h("small", {}, s.hint)))));
  }
  menu.hidden = !open;
  $("sort-btn").setAttribute("aria-expanded", String(open));
  if (open) menu.querySelector("[aria-checked=true]").focus();
}
function setupSort() {
  $("sort-btn").addEventListener("click", ev => { ev.stopPropagation(); toggleSort(); });
  document.addEventListener("click", ev => { if (!$("sort-menu").hidden && !$("sort-menu").contains(ev.target)) toggleSort(false); });
  document.addEventListener("keydown", ev => {
    if ($("sort-menu").hidden) return;
    if (ev.key === "Escape") { toggleSort(false); $("sort-btn").focus(); }
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const items = [...$("sort-menu").children], i = items.indexOf(document.activeElement);
      items[(i + (ev.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    }
  });
}

function refresh() {
  renderList();
  if (openId && $("place").open && !typing()) renderPlace();
}

/* ---------- fiche d'un lieu ---------- */
function section(title, cells, footer) {
  return h("section", { class: "sec" },
    title ? h("h3", { class: "sec-h" }, title) : null,
    h("div", { class: "group" }, cells),
    footer ? h("p", { class: "sec-f" }, footer) : null);
}
const cell = (k, v) => h("div", { class: "cell" }, h("span", { class: "k" }, k), h("span", { class: "v" }, v));

function hero(l) {
  const src = safeUrl(l.photo), href = safeUrl(l.lien);
  let media = h("span", { class: "hero-none" }, icon(ICON.house, 40));
  if (src) {
    media = h("img", { src, alt: "", decoding: "async", referrerpolicy: "no-referrer" });
    media.addEventListener("error", () => media.replaceWith(h("span", { class: "hero-none" }, icon(ICON.house, 40))));
  }
  const kids = [media, href ? h("span", { class: "hero-go" }, "Voir l'annonce", icon(ICON.out, 14)) : null];
  return href
    ? h("a", { class: "hero", href, target: "_blank", rel: "noopener noreferrer", "aria-label": "Ouvrir l'annonce de " + l.nom }, kids)
    : h("div", { class: "hero" }, kids);
}

function actions(l) {
  const tels = phones(l), href = safeUrl(l.lien);
  const canCall = canEdit() && l.aAppeler !== "non" && tels.length;
  return h("div", { class: "actions" },
    canCall ? h("button", { class: "act primary", type: "button", onclick: () => call(l, tels[0]) }, icon(ICON.phone, 22), "Appeler") : null,
    href ? h("a", { class: "act" + (canCall ? "" : " primary"), href, target: "_blank", rel: "noopener noreferrer" }, icon(ICON.out, 22), host(href)) : null);
}

function busyNote(l) {
  if (!canEdit() || !l.qui || isMe(l.qui)) return null;
  return h("p", { class: "busy" }, h("b", {}, l.qui), " s'en occupe" + (l.depuis ? " depuis " + ago(l.depuis).replace(/^il y a /, "") : "") + ". Vois avec ", l.qui, " avant d'appeler.");
}

function resultPrompt(l) {
  return h("section", { class: "result" },
    h("h3", {}, "Alors, ça donne quoi ?"),
    h("div", { class: "result-grid" }, RESULTS.map(([st, label]) => h("button", {
      class: "result-btn " + TONE[st], type: "button",
      onclick: () => { afterCall = null; save(l, { statut: st }); toast(label === "Pas dispo" ? "Lieu écarté" : "C'est noté"); },
    }, label))),
    h("button", { class: "text-btn", type: "button", onclick: () => { afterCall = null; renderPlace(); } }, "Plus tard"));
}

// le lien du groupe voit où en sont les appels sans pouvoir les changer
function trackView(l) {
  const com = String(l.commentaire || "").replace(/^'/, "");
  return section("Suivi", [
    cell("Où on en est", l.statut || "À appeler"),
    l.qui ? cell("S'en occupe", whoText(l)) : null,
    com ? h("div", { class: "cell" }, h("span", { class: "k wrap" }, com)) : null,
  ], l.maj ? "Mis à jour " + ago(l.maj) + "." : null);
}

function trackSection(l) {
  if (!canEdit()) return trackView(l);
  const sel = h("select", { class: "cell-select", "aria-label": "Où on en est" },
    STATUTS.map(s => h("option", { value: s, selected: (l.statut || "À appeler") === s }, s)));
  sel.addEventListener("change", () => withName(() => save(l, { statut: sel.value })));
  const who = l.qui
    ? h("span", { class: "v" }, whoText(l),
      h("button", { class: "mini", type: "button", onclick: () => release(l) }, "Libérer"))
    : h("button", { class: "mini tint", type: "button", onclick: () => withName(() => takeOnly(l)) }, "Je m'en occupe");
  const com = h("textarea", { class: "cell-notes", rows: "3", maxlength: "600", placeholder: "Ce qu'ils ont dit : musique jusqu'à 3 h, caution 1 500 €, rappeler mardi…", "aria-label": "Notes" });
  com.value = String(l.commentaire || "").replace(/^'/, "");
  com.addEventListener("change", () => save(l, { commentaire: com.value.trim().slice(0, 600) }));
  return section("Suivi", [
    h("div", { class: "cell" }, h("span", { class: "k" }, "S'en occupe"), who),
    h("label", { class: "cell" }, h("span", { class: "k" }, "Où on en est"), h("span", { class: "select-wrap" }, sel, icon(ICON.updown, 14))),
    h("div", { class: "cell stack" }, com),
  ], l.maj ? "Mis à jour " + ago(l.maj) + "." : null);
}

function priceSection(l) {
  const t = total(l), nb = data.nb, pp = t / nb;
  const input = h("input", { class: "cell-input", type: "number", min: "0", step: "50", inputmode: "numeric", placeholder: "à noter", "aria-label": "Prix total obtenu, en euros" });
  input.value = Number(l.prixNego) || "";
  input.addEventListener("change", () => {
    const p = parseInt(input.value, 10);
    save(l, { prixNego: Number.isFinite(p) && p > 0 ? p : "" });
  });
  const footer = !t ? `Objectif : moins de ${euros(200 * nb)} pour ${nb}.`
    : pp <= 150 ? "Dans le budget."
    : pp <= 200 ? "Haut du budget, mais ça passe."
    : `Trop cher de ${euros(t - 200 * nb)}. À négocier.`;
  return section("Prix", [
    cell("Par personne", t ? h("span", { class: "strong " + toneOf(pp) }, euros(pp)) : "à demander"),
    cell("Affiché, 3 nuits", Number(l.prix) ? euros(Number(l.prix)) : "—"),
    canEdit()
      ? h("label", { class: "cell" }, h("span", { class: "k" }, "Obtenu au tél."), input)
      : cell("Obtenu au tél.", Number(l.prixNego) ? euros(Number(l.prixNego)) : "—"),
  ], footer);
}

function rateSection(l) {
  const { list, avg } = notes(l.id);
  const mine = (list.find(a => isMe(a.prenom)) || {}).note || 0;
  const others = list.filter(a => !isMe(a.prenom));
  const stars = h("div", { class: "stars", role: "group", "aria-label": "Ta note sur 5" },
    [1, 2, 3, 4, 5].map(k => h("button", {
      type: "button", class: k <= mine ? "on" : null, "aria-label": `${k} sur 5`, "aria-pressed": String(k === mine),
      onclick: () => rate(l, k === mine ? 0 : k),
    }, icon(ICON.star, 28))));
  const small = n => h("span", { class: "mini-stars", "aria-label": `${n} sur 5` }, [1, 2, 3, 4, 5].map(k => h("span", { class: k <= n ? "on" : null }, icon(ICON.star, 15))));
  return section("Avis", [
    h("div", { class: "cell" }, h("span", { class: "k" }, "Toi"), stars),
    ...others.map(a => cell(a.prenom, small(a.note))),
  ], list.length ? `Moyenne ${virgule(avg)} sur 5, ${list.length} avis.` : "Personne n'a encore noté. Touche une étoile.");
}

function copyButton(t) {
  const b = h("button", { class: "copy", type: "button", "aria-label": "Copier " + t }, icon(ICON.copy, 18));
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(t);
      b.replaceChildren(icon(ICON.check, 18));
      setTimeout(() => b.replaceChildren(icon(ICON.copy, 18)), 1500);
    } catch (e) { toast("Copie impossible, appuie longuement sur le numéro"); }
  });
  return b;
}

function contactSection(l) {
  const tels = phones(l);
  if (!canEdit() || (!tels.length && !l.email)) return null;
  return section("Contact", [
    ...tels.map(t => h("div", { class: "cell" },
      h("button", { class: "cell-link", type: "button", onclick: () => call(l, t) }, icon(ICON.phone, 18), t), copyButton(t))),
    l.email ? h("div", { class: "cell" }, h("a", { class: "cell-link", href: "mailto:" + l.email }, icon(ICON.mail, 18), l.email)) : null,
  ]);
}

const checkOf = l => verif.lieux[l.id] || {};
const VERDICT = { "ok": ["green", "Colle à ce qu'on cherche"], "à vérifier": ["orange", "À confirmer au téléphone"], "problème": ["red", "À revoir"] };

// ce que la vérification a trouvé de bloquant, en une étiquette sur la ligne
function checkTag(l) {
  const v = checkOf(l);
  if (v.dispo === "indispo") return [h("span", { class: "pill red" }, "Pris selon l'annonce")];
  return v.verdict === "problème" ? [h("span", { class: "pill red" }, "À revoir")] : null;
}

function verifSection(l) {
  const v = checkOf(l), [tone, label] = Object.prototype.hasOwnProperty.call(VERDICT, v.verdict) ? VERDICT[v.verdict] : [];
  if (!label) return null;
  return section("Vérifié le " + verif.date, [
    h("div", { class: "cell" }, h("span", { class: "pill " + tone }, label)),
    v.resume ? h("div", { class: "cell" }, h("span", { class: "k wrap" }, v.resume)) : null,
  ], v.dispo === "dispo" ? "Annoncé libre en ligne pour nos dates." : v.dispo === "indispo" ? "Annoncé pris en ligne pour nos dates." : "Pas de calendrier en ligne : la dispo se confirme au téléphone.");
}

function askSection(l) {
  if (!canEdit() || l.aAppeler === "non") return null;
  const own = typeof checkOf(l).demander === "string" ? checkOf(l).demander : "";
  const ask = q => h("div", { class: "cell" }, h("span", { class: "k wrap" }, q));
  return section("À demander", [own ? h("div", { class: "cell" }, h("span", { class: "k wrap" }, h("b", {}, "Pour ce lieu : "), own)) : null, ...ASK.map(ask)]);
}

function historySection(l) {
  const list = data.journal.filter(e => e.id === l.id).slice(-8).reverse();
  return list.length ? section("Historique", list.map(e => logLine(e, false))) : null;
}

function placeView(l) {
  const st = statutOf(l);
  const sub = [shortBeds(l), l.fete].filter(Boolean).join(" · ");
  return h("div", { class: "place" },
    hero(l),
    h("div", { class: "sheet-body" },
      h("h2", { class: "place-title" }, l.nom),
      sub ? h("p", { class: "place-sub" }, sub) : null,
      l.infos ? h("p", { class: "place-info" }, l.infos) : null,
      busyNote(l),
      actions(l),
      canEdit() && afterCall === l.id ? resultPrompt(l) : null,
      trackSection(l),
      priceSection(l),
      rateSection(l),
      contactSection(l),
      verifSection(l),
      askSection(l),
      historySection(l),
      canEdit() ? h("div", { class: "group" }, st === "Abandonné"
        ? h("button", { class: "row-btn tint", type: "button", onclick: () => save(l, { statut: "À appeler" }) }, "Remettre dans la liste")
        : h("button", { class: "row-btn danger", type: "button", onclick: () => { save(l, { statut: "Abandonné" }); toast("Lieu écarté"); } }, "Écarter ce lieu")) : null));
}

function renderPlace() {
  const dlg = $("place");
  const l = findPlace(openId);
  if (!l) { if (dlg.open) dlg.close(); return; }
  const scroller = dlg.querySelector(".scroll");
  const top = scroller ? scroller.scrollTop : 0;
  const next = h("div", { class: "scroll" }, placeView(l));
  // le message furtif peut vivre dans la fiche : il ne doit pas disparaître quand elle se redessine
  const keep = toastEl && toastEl.parentNode === dlg ? [toastEl] : [];
  dlg.replaceChildren(h("button", { class: "close", type: "button", "aria-label": "Fermer", onclick: () => dlg.close() }, icon(ICON.x, 16)), next, ...keep);
  next.scrollTop = top;
}

function openPlace(id) {
  const dlg = $("place");
  const changed = openId !== id;
  openId = id;
  renderPlace();
  if (changed) dlg.querySelector(".scroll").scrollTop = 0;
  if (!dlg.open) dlg.showModal();
}

/* ---------- écritures : affichage immédiat, envoi en file ---------- */
// writes : compte les gestes, pour jeter une lecture partie avant l'un d'eux
let pending = 0, writes = 0, failed = false, chain = Promise.resolve();
// Renvoie la réponse du script (null si l'envoi a échoué). Un affichage raté ne doit jamais bloquer la file.
function send(req, optimistic) {
  writes++;
  if (optimistic) { data = optimistic(data); refresh(); }
  pending++;
  let reply = null;
  chain = chain.catch(() => {}).then(async () => {
    try {
      reply = await db.post(req);
      // sinon une réponse plus ancienne écraserait un geste plus récent ; un +/− pas encore envoyé garde la main
      if (pending === 1) data = withUnsent(nbTimer ? { ...reply, nb: data.nb } : reply);
      snapshot.save(reply);
    } catch (e) {
      // un refus du script a un message fait pour la page ; une panne de réseau, non
      // une note ratée reste sur le téléphone et repart toute seule plus tard
      if (req.action === "avis" && !e.server) planNotes(30000);
      else failed = e.server ? e.message : true;
    } finally {
      pending--;
    }
    if (pending) return;
    try {
      if (failed) {
        const why = failed;
        failed = false;
        if (why === "Lien invalide" || why === "Page fermée") return lock(why);
        toast(typeof why === "string" ? why : "Pas enregistré, vérifie ta connexion et réessaie");
        await load(true);
      }
      refresh();
    } catch (e) { /* on garde la file en vie */ }
  });
  return chain.then(() => reply, () => reply);
}

const patchPlace = (d, id, p) => ({ ...d, lieux: d.lieux.map(x => x.id === id ? { ...x, ...p, maj: Date.now() } : x) });

function save(l, patch) {
  const cur = findPlace(l.id) || l;
  const full = { ...patch };
  const shown = { ...patch };
  if (patch.statut && patch.statut !== "À appeler" && !cur.qui && myName()) Object.assign(shown, { qui: myName(), depuis: Date.now() });
  if ("qui" in patch) { full.qui = patch.qui ? myName() : ""; Object.assign(shown, { qui: full.qui, depuis: full.qui ? Date.now() : "" }); }
  return send({ action: "maj", id: l.id, ...full }, d => patchPlace(d, l.id, shown));
}

// Prend le lieu auprès de la Sheet, qui tranche sous verrou si deux personnes le font en même temps.
// Renvoie {qui, depuis} si quelqu'un d'autre l'a déjà, sinon null.
async function take(l) {
  const cur = findPlace(l.id) || l;
  if (cur.qui) return isMe(cur.qui) ? null : { qui: cur.qui, depuis: cur.depuis };
  const d = await send({ action: "prendre", id: l.id }, x => patchPlace(x, l.id, { qui: myName(), depuis: Date.now() }));
  return (d && d.conflit) || null;
}

async function takeOnly(l) {
  const other = await take(l);
  if (other) toast(other.qui + " s'en occupe déjà");
}

function release(l) {
  const cur = findPlace(l.id) || l;
  if (!cur.qui || isMe(cur.qui)) return save(l, { qui: "" });
  askBox(`Libérer le lieu de ${cur.qui} ?`, `${cur.qui} ne s'en occupera plus. Ce sera noté dans l'historique.`,
    "Libérer", "Annuler", () => save(l, { qui: "" }));
}

function call(l, tel) {
  withName(() => {
    const cur = findPlace(l.id) || l;
    const free = !cur.qui;
    // le numéro est composé pendant le geste : iOS refuse un appel lancé quelques secondes plus tard
    const dial = () => {
      afterCall = l.id;
      openPlace(l.id);
      location.href = telHref(tel);
      // les autres téléphones ont pu prendre le lieu depuis la dernière mise à jour : la Sheet tranche
      if (free) take(l).then(other => { if (other) toast(`${other.qui} a pris ce lieu juste avant toi`); });
      send({ action: "appel", id: l.id });
    };
    if (free || isMe(cur.qui)) return dial();
    openPlace(l.id);
    const since = cur.depuis ? " " + ago(cur.depuis) : "";
    askBox(`${cur.qui} s'en occupe déjà`,
      `${cur.qui} a pris ce lieu${since}. Pour ne pas appeler deux fois, vois d'abord avec ${cur.qui}.`,
      "Appeler quand même", "Ne pas appeler", dial);
  });
}

/* ---------- notes : gardées sur le téléphone, envoyées par paquets ---------- */
// Quand tout le groupe swipe en même temps, une requête par carte saturerait la Sheet.
// On envoie après 3 s de calme, au plus tard 20 s après la première note, et on réessaie si la Sheet est occupée.
let notesTimer = null, notesSince = 0;
function rate(l, note) {
  withName(() => {
    unsent.put(l.id, note);
    data = withUnsent(data);
    refresh();
    if (!notesSince) notesSince = Date.now();
    planNotes(Math.min(3000, notesSince + 20000 - Date.now()));
  });
}
function planNotes(ms) {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(sendNotes, Math.max(0, ms));
}
async function sendNotes() {
  clearTimeout(notesTimer);
  notesTimer = null;
  notesSince = 0;
  const q = unsent.read();
  const notes = Object.entries(q).map(([id, note]) => ({ id, note }));
  if (!notes.length || !myName()) return;
  if (await send({ action: "avis", notes })) unsent.drop(q);
}
// ses propres notes pas encore envoyées passent devant ce que dit la Sheet
function withUnsent(d) {
  const q = unsent.read(), me = myName(), ids = Object.keys(q);
  if (!ids.length || !me) return d;
  const rest = d.avis.filter(a => !(ids.includes(a.id) && sameName(a.prenom, me)));
  return { ...d, avis: [...rest, ...ids.filter(id => q[id] > 0).map(id => ({ id, prenom: me, note: q[id] }))] };
}

let nbTimer = null;
function bumpNb(delta) {
  withName(() => {
    const nb = Math.min(80, Math.max(10, data.nb + delta));
    data = { ...data, nb };
    writes++;
    renderList();
    clearTimeout(nbTimer);
    nbTimer = setTimeout(() => { nbTimer = null; send({ action: "nb", nb }); }, 700);
  });
}

/* ---------- ajout d'un lieu ---------- */
function setupAdd() {
  const dlg = $("dlg"), form = $("addform"), msg = $("addmsg");
  $("add").addEventListener("click", () => withName(() => { msg.textContent = ""; form.reset(); dlg.showModal(); }));
  $("cancel").addEventListener("click", () => dlg.close());
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = new FormData(form);
    const nom = String(f.get("nom") || "").trim();
    const lien = String(f.get("lien") || "").trim();
    const photoUrl = String(f.get("photo") || "").trim();
    if (!nom) { msg.textContent = "Il faut au moins un nom."; form.elements.nom.focus(); return; }
    if (lien && !/^https:\/\//i.test(lien)) { msg.textContent = "Le lien de l'annonce doit commencer par https://"; return; }
    if (photoUrl && !/^https:\/\//i.test(photoUrl)) { msg.textContent = "Le lien de la photo doit commencer par https://"; return; }
    const enLigne = f.get("enligne") === "on";
    $("addok").disabled = true;
    dlg.close();
    tab = enLigne ? "online" : "call";
    toast(nom + " ajouté");
    await send({
      action: "ajout", nom, lien, photo: photoUrl, prix: Number(f.get("prix")) || "",
      couchages: String(f.get("couchages") || "").trim(), tel: String(f.get("tel") || "").trim(),
      aAppeler: !enLigne,
    });
    $("addok").disabled = false;
  });
}

/* ---------- fenêtres : un tap sur le fond ferme (sauf le prénom tant qu'il manque) ---------- */
function setupSheets() {
  document.querySelectorAll("dialog.sheet").forEach(d => {
    d.addEventListener("click", ev => {
      if (ev.target !== d) return;
      if (d.id === "who" && !myName()) return;
      d.close();
    });
  });
  $("place").addEventListener("close", () => { openId = null; afterCall = null; });
}

/* ---------- compte à rebours ---------- */
function tick() {
  const ms = MIDNIGHT - Date.now();
  if (ms <= 0) { $("countdown").textContent = "bonne année"; return; }
  const d = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24;
  $("countdown").textContent = d > 0 ? `J-${d}` : `minuit dans ${hh} h`;
}

/* ---------- démarrage ---------- */
let locked = false;
function lock(why) {
  locked = true;
  if (why !== "Page fermée") store.set("cle", "");
  snapshot.clear();
  document.querySelectorAll("dialog[open]").forEach(d => d.close());
  $("lock-text").textContent = why === "Page fermée"
    ? "La page est fermée pour le moment."
    : "Cette page s'ouvre avec le lien de partage. Rouvre le lien reçu dans le groupe, ou demande-le à l'orga.";
  $("app").hidden = true;
  $("lock").hidden = false;
}

async function load(force) {
  if (locked) return;
  if (API && !KEY) return lock("Lien invalide");
  const seq = writes;
  try {
    let d = await db.get();
    if (!d.lieux.length && d.role !== "groupe") {
      const seed = await (await fetch("seed.json")).json();
      d = await db.post({ action: "seed", lieux: seed });
    }
    const quiet = seq === writes && !pending && !nbTimer && !typing() && !$("dlg").open && !$("who").open && !$("ask").open;
    if (!force && !quiet) return;
    d = withUnsent(d);
    const same = loaded && JSON.stringify(d) === JSON.stringify(data);
    data = d;
    loaded = true;
    snapshot.save(d);
    // sans ça, un homonyme arrivé plus tard ne serait pas prévenu que le prénom est pris
    if (myName() && !d.personnes.some(isMe)) sayHello(true);
    if (!same) refresh();
  } catch (e) {
    if (e.message === "Lien invalide" || e.message === "Page fermée") return lock(e.message);
    loaded = true;
    refresh();
    toast("Impossible de charger la liste, réessaie dans un instant");
  }
}

async function start() {
  $("less").addEventListener("click", () => bumpNb(-1));
  $("more").addEventListener("click", () => bumpNb(1));
  setupSort();
  if (SHEET) $("sheet-link").href = SHEET;
  const snap = snapshot.read();
  if (snap) { data = withUnsent(snap); loaded = true; }
  $("mode").textContent = API ? "" : "Mode essai : ce que tu notes reste sur ce téléphone tant que le Drive n'est pas branché.";
  setupWho();
  setupAdd();
  setupSheets();
  setupSwipe();
  renderWho();
  tick();
  setInterval(tick, 60000);
  // les gerbes restent entre le titre et la pastille, au-dessus du sous-titre
  sky($("sky"), () => {
    const c = $("sky").getBoundingClientRect(), t = document.querySelector(".title-row h1").getBoundingClientRect();
    const a = $("who-btn").getBoundingClientRect(), s = document.querySelector(".subtitle").getBoundingClientRect();
    return { x0: t.right - c.left + 10, x1: a.left - c.left - 10, y0: 4, y1: s.top - c.top - 2 };
  });
  renderList();
  fetch("verif.json").then(r => r.ok ? r.json() : null).then(v => {
    if (v && v.lieux) { verif = { date: String(v.date || ""), lieux: v.lieux }; refresh(); }
  }).catch(() => { /* sans le fichier, la page marche pareil */ });
  await load();
  if (locked) return;
  if (!myName()) openWho();
  else sayHello();
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) sendNotes(); else load(); });
  if (Object.keys(unsent.read()).length) planNotes(0);
}
start();
