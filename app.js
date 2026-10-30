"use strict";

/* ---------- réglages ---------- */
const API = (window.API_URL || "").trim();
const SHEET = (window.SHEET_URL || "").trim();
const STATUTS = ["À appeler", "Pas de réponse", "Dispo", "Option posée", "Réservé", "Abandonné"];
const EN_COURS = ["Pas de réponse", "Dispo", "Option posée", "Réservé"];
const TONE = { "Pas de réponse": "gray", "Dispo": "green", "Option posée": "orange", "Réservé": "blue", "Abandonné": "red" };
// réponses proposées juste après un appel : [statut enregistré, libellé du bouton]
const RESULTS = [["Dispo", "C'est dispo"], ["Abandonné", "Pas dispo"], ["Pas de réponse", "Pas de réponse"], ["Option posée", "Option posée"]];
const ASK = [
  "Libre du jeudi 31/12 au dimanche 03/01 ?",
  "Prix total pour tout le groupe, ménage compris ?",
  "On peut faire une vraie soirée ? Musique jusqu'à quelle heure ?",
  "Le lieu est rien que pour nous ?",
  "Caution et acompte ?",
];
const TABS = [
  { key: "call", label: "À appeler", note: "pas de calendrier en ligne, il faut appeler" },
  { key: "doing", label: "En cours", note: "quelqu'un a déjà appelé" },
  { key: "online", label: "En ligne", note: "libres en ligne le 29/10, pas besoin d'appeler" },
  { key: "out", label: "Écartés", note: "pas dispo, trop cher ou fête refusée" },
];
const MIDNIGHT = Date.parse("2027-01-01T00:00:00+01:00");

/* ---------- état ---------- */
let data = { lieux: [], avis: [], nb: 35 };
let tab = "call", sort = "prio", openId = null, afterCall = null, loaded = false;

// préfixe : toutes les pages julienrabault.github.io partagent le même stockage
const store = {
  get(k) { try { return localStorage.getItem("explosada-" + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("explosada-" + k, v); } catch (e) { /* stockage indisponible : on continue sans */ } },
};

// La clé arrive dans le lien de partage (#k=…), jamais envoyée au serveur de la page.
// On la garde sur le téléphone et on l'enlève de la barre d'adresse.
const KEY = (() => {
  const m = location.hash.match(/k=([\w-]{8,64})/);
  if (!m) return store.get("cle") || "";
  store.set("cle", m[1]);
  history.replaceState(null, "", location.pathname + location.search);
  return m[1];
})();

/* ---------- accès aux données (Google Sheet, ou essai local) ---------- */
// un réseau qui ne répond pas ne doit pas bloquer la file d'envoi
async function fetch20(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(timer); }
}
const remote = {
  async get() {
    const r = await fetch20(API + (API.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(KEY) + "&t=" + Date.now(), { cache: "no-store" });
    return check(await r.json());
  },
  async post(req) {
    // text/plain : pas de requête préalable CORS, Apps Script lit le corps tel quel
    const r = await fetch20(API, { method: "POST", body: JSON.stringify({ ...req, k: KEY }) });
    return check(await r.json());
  },
};
function check(res) {
  if (!res || res.error) throw new Error((res && res.error) || "Réponse vide");
  return res;
}

const local = {
  read() { try { return JSON.parse(store.get("local")) || { lieux: [], avis: [], nb: 35 }; } catch (e) { return { lieux: [], avis: [], nb: 35 }; } },
  async get() { return this.read(); },
  async post(req) {
    const d = this.read();
    const now = Date.now();
    if (req.action === "seed" && !d.lieux.length) d.lieux = req.lieux.map(l => ({ ...l, statut: "À appeler", qui: "", prixNego: "", commentaire: "", maj: now }));
    if (req.action === "maj") d.lieux = d.lieux.map(l => l.id === req.id ? { ...l, ...pick(req, ["statut", "qui", "prixNego", "commentaire"]), maj: now } : l);
    if (req.action === "ajout") d.lieux = [...d.lieux, { ...pick(req, ["nom", "lien", "prix", "couchages", "tel", "photo", "qui"]), id: "u" + now.toString(36), statut: "À appeler", aAppeler: req.aAppeler === false ? "non" : "oui", prio: 2, maj: now }];
    if (req.action === "avis") {
      const rest = d.avis.filter(a => !(a.id === req.id && a.prenom.toLowerCase() === req.prenom.toLowerCase()));
      d.avis = req.note > 0 ? [...rest, { id: req.id, prenom: req.prenom, note: req.note }] : rest;
    }
    if (req.action === "nb") d.nb = req.nb;
    store.set("local", JSON.stringify(d));
    return d;
  },
};
const db = API ? remote : local;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

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
const safeUrl = u => /^https?:\/\//i.test(u || "") || /^img\/[\w.-]+$/.test(u || "") ? u : null;
const myName = () => (store.get("prenom") || "").trim().slice(0, 30);
const isMe = n => !!n && n.toLowerCase() === myName().toLowerCase();
const phones = l => String(l.tel || "").split("/").map(t => t.trim()).filter(Boolean);
const shortBeds = l => String(l.couchages || "").replace(/\s*\(.*?\)/g, "").trim();
const toneOf = pp => pp <= 150 ? "green" : pp <= 200 ? "orange" : "red";
const typing = () => { const a = document.activeElement; return !!a && $("place").contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };

// gardé en mémoire : le message peut vivre dans la fiche, qui est reconstruite à chaque mise à jour
let toastTimer, toastEl;
function toast(t) {
  const el = toastEl || (toastEl = $("toast"));
  // une feuille ouverte passe au-dessus de tout : le message doit vivre dedans pour rester visible
  const top = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
  if (el.parentNode !== top) top.append(el);
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function ago(v) {
  const t = typeof v === "number" ? v : Date.parse(v);
  if (!Number.isFinite(t)) return "";
  const m = Math.round((Date.now() - t) / 6e4);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return "le " + new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ---------- prénom : demandé une seule fois, au premier geste qui en a besoin ---------- */
let afterName = null;
function withName(fn) {
  const n = myName();
  if (n) return fn(n);
  afterName = fn;
  openWho();
}
function openWho() {
  $("whoname").value = myName();
  $("who").showModal();
  $("whoname").focus();
}
function setupWho() {
  $("who-btn").addEventListener("click", () => { afterName = null; openWho(); });
  $("whoform").addEventListener("submit", ev => {
    ev.preventDefault();
    const n = $("whoname").value.trim().slice(0, 30);
    if (!n) return $("whoname").focus();
    store.set("prenom", n);
    $("who").close();
    renderWho();
    refresh();
    const next = afterName;
    afterName = null;
    if (next) next(n);
  });
}
function renderWho() {
  const n = myName();
  $("who-btn").replaceChildren(n ? n[0].toUpperCase() : icon(ICON.person, 18));
  $("who-btn").setAttribute("aria-label", n ? `Tu es ${n}. Changer de prénom` : "Dire qui tu es");
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

/* ---------- liste ---------- */
function thumb(l) {
  const src = safeUrl(l.photo);
  if (!src) return h("span", { class: "thumb none" }, icon(ICON.house, 22));
  const img = h("img", { class: "thumb", src, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(h("span", { class: "thumb none" }, icon(ICON.house, 22))));
  return img;
}

function row(l) {
  const { list, avg } = notes(l.id);
  const st = statutOf(l), t = total(l), pp = t / data.nb, tels = phones(l);
  const beds = shortBeds(l);
  const foot = st
    ? [pill(st), l.qui ? h("span", { class: "who" }, isMe(l.qui) ? "toi" : l.qui) : null]
    : l.qui ? [h("span", { class: "who tint" }, (isMe(l.qui) ? "Tu t'en occupes" : l.qui + " s'en occupe"))] : null;
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
    tab === "call" && tels.length
      ? h("button", { class: "row-call", type: "button", "aria-label": "Appeler " + l.nom, onclick: () => call(l, tels[0]) }, icon(ICON.phone, 18))
      : null);
}

function renderList() {
  const nb = data.nb;
  $("nb").textContent = nb;
  $("cap").textContent = `Budget max ${euros(200 * nb)}, soit 200 € chacun`;
  $("less").disabled = nb <= 10;
  $("more").disabled = nb >= 80;
  $("tabs").replaceChildren(...TABS.map(t => h("button", {
    class: "seg-btn", type: "button", "aria-pressed": String(tab === t.key),
    onclick: () => { tab = t.key; renderList(); },
  }, t.label)));
  const shown = sorted(data.lieux.filter(l => bucket(l) === tab));
  const n = shown.length;
  $("note").textContent = loaded ? `${n} ${n > 1 ? "lieux" : "lieu"}, ${TABS.find(t => t.key === tab).note}` : "";
  $("list").replaceChildren(...(n ? shown.map(row) : [h("li", { class: "empty" }, loaded ? "Rien ici pour l'instant." : "Chargement des lieux…")]));
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
  const canCall = l.aAppeler !== "non" && tels.length;
  return h("div", { class: "actions" },
    canCall ? h("button", { class: "act primary", type: "button", onclick: () => call(l, tels[0]) }, icon(ICON.phone, 20), "Appeler") : null,
    href ? h("a", { class: "act" + (canCall ? "" : " primary"), href, target: "_blank", rel: "noopener noreferrer" }, icon(ICON.out, 20), host(href)) : null);
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
    h("label", { class: "cell" }, h("span", { class: "k" }, "Obtenu au tél."), input),
  ], footer);
}

function trackSection(l) {
  const sel = h("select", { class: "cell-select", "aria-label": "Où on en est" },
    STATUTS.map(s => h("option", { value: s, selected: (l.statut || "À appeler") === s }, s)));
  sel.addEventListener("change", () => save(l, { statut: sel.value }));
  const who = l.qui
    ? h("span", { class: "v" }, isMe(l.qui) ? "Toi" : l.qui,
      h("button", { class: "mini", type: "button", onclick: () => save(l, { qui: "" }) }, "Libérer"))
    : h("button", { class: "mini tint", type: "button", onclick: () => withName(n => save(l, { qui: n })) }, "Je m'en occupe");
  const com = h("textarea", { class: "cell-notes", rows: "3", maxlength: "600", placeholder: "Ce qu'ils ont dit : musique jusqu'à 3 h, caution 1 500 €, rappeler mardi…", "aria-label": "Notes" });
  com.value = l.commentaire || "";
  com.addEventListener("change", () => save(l, { commentaire: com.value.trim().slice(0, 600) }));
  return section("Suivi", [
    h("div", { class: "cell" }, h("span", { class: "k" }, "S'en occupe"), who),
    h("label", { class: "cell" }, h("span", { class: "k" }, "Où on en est"), h("span", { class: "select-wrap" }, sel, icon(ICON.updown, 14))),
    h("div", { class: "cell stack" }, com),
  ], l.maj ? "Mis à jour " + ago(l.maj) + "." : null);
}

function rateSection(l) {
  const { list, avg } = notes(l.id);
  const mine = (list.find(a => isMe(a.prenom)) || {}).note || 0;
  const others = list.filter(a => !isMe(a.prenom));
  const stars = h("div", { class: "stars", role: "group", "aria-label": "Ta note sur 5" },
    [1, 2, 3, 4, 5].map(k => h("button", {
      type: "button", class: k <= mine ? "on" : null, "aria-label": `${k} sur 5`, "aria-pressed": String(k === mine),
      onclick: () => rate(l, k === mine ? 0 : k),
    }, icon(ICON.star, 26))));
  const small = n => h("span", { class: "mini-stars", "aria-label": `${n} sur 5` }, [1, 2, 3, 4, 5].map(k => h("span", { class: k <= n ? "on" : null }, icon(ICON.star, 14))));
  return section("Avis", [
    h("div", { class: "cell" }, h("span", { class: "k" }, "Toi"), stars),
    ...others.map(a => cell(a.prenom, small(a.note))),
  ], list.length ? `Moyenne ${virgule(avg)} sur 5, ${list.length} avis.` : "Personne n'a encore noté. Touche une étoile.");
}

function copyButton(t) {
  const b = h("button", { class: "copy", type: "button", "aria-label": "Copier " + t }, icon(ICON.copy, 17));
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(t);
      b.replaceChildren(icon(ICON.check, 17));
      setTimeout(() => b.replaceChildren(icon(ICON.copy, 17)), 1500);
    } catch (e) { toast("Copie impossible, appuie longuement sur le numéro"); }
  });
  return b;
}

function contactSection(l) {
  const tels = phones(l);
  if (!tels.length && !l.email) return null;
  return section("Contact", [
    ...tels.map(t => h("div", { class: "cell" },
      h("button", { class: "cell-link", type: "button", onclick: () => call(l, t) }, icon(ICON.phone, 17), t), copyButton(t))),
    l.email ? h("div", { class: "cell" }, h("a", { class: "cell-link", href: "mailto:" + l.email }, icon(ICON.mail, 17), l.email)) : null,
  ]);
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
      actions(l),
      afterCall === l.id ? resultPrompt(l) : null,
      trackSection(l),
      priceSection(l),
      rateSection(l),
      contactSection(l),
      l.aAppeler !== "non" ? section("À demander", ASK.map(q => h("div", { class: "cell" }, h("span", { class: "k wrap" }, q)))) : null,
      h("div", { class: "group" }, st === "Abandonné"
        ? h("button", { class: "row-btn tint", type: "button", onclick: () => save(l, { statut: "À appeler" }) }, "Remettre dans la liste")
        : h("button", { class: "row-btn danger", type: "button", onclick: () => { save(l, { statut: "Abandonné" }); toast("Lieu écarté"); } }, "Écarter ce lieu"))));
}

function renderPlace() {
  const dlg = $("place");
  const l = data.lieux.find(x => x.id === openId);
  if (!l) { if (dlg.open) dlg.close(); return; }
  const scroller = dlg.querySelector(".scroll");
  const top = scroller ? scroller.scrollTop : 0;
  const next = h("div", { class: "scroll" }, placeView(l));
  dlg.replaceChildren(h("button", { class: "close", type: "button", "aria-label": "Fermer", onclick: () => dlg.close() }, icon(ICON.x, 16)), next);
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
function send(req, optimistic) {
  writes++;
  if (optimistic) { data = optimistic(data); refresh(); }
  pending++;
  chain = chain.then(async () => {
    try {
      const d = await db.post(req);
      if (pending === 1) data = d; // sinon une réponse plus ancienne écraserait un geste plus récent
    } catch (e) {
      failed = true;
    } finally {
      pending--;
    }
    if (pending) return;
    if (failed) {
      failed = false;
      toast("Pas enregistré, vérifie ta connexion et réessaie");
      await load(true);
    }
    refresh();
  });
  return chain;
}

function save(l, patch) {
  const cur = data.lieux.find(x => x.id === l.id) || l;
  const full = { ...patch };
  if (patch.statut && patch.statut !== "À appeler" && !cur.qui && !("qui" in patch) && myName()) full.qui = myName();
  return send({ action: "maj", id: l.id, ...full },
    d => ({ ...d, lieux: d.lieux.map(x => x.id === l.id ? { ...x, ...full, maj: Date.now() } : x) }));
}

function call(l, tel) {
  withName(n => {
    const cur = data.lieux.find(x => x.id === l.id) || l;
    afterCall = l.id;
    if (!cur.qui) save(l, { qui: n });
    openPlace(l.id);
    location.href = telHref(tel);
  });
}

function rate(l, note) {
  withName(n => send({ action: "avis", id: l.id, prenom: n, note }, d => {
    const rest = d.avis.filter(a => !(a.id === l.id && a.prenom.toLowerCase() === n.toLowerCase()));
    return { ...d, avis: note ? [...rest, { id: l.id, prenom: n, note }] : rest };
  }));
}

let nbTimer = null;
function bumpNb(delta) {
  const nb = Math.min(80, Math.max(10, data.nb + delta));
  data = { ...data, nb };
  writes++;
  renderList();
  clearTimeout(nbTimer);
  nbTimer = setTimeout(() => { nbTimer = null; send({ action: "nb", nb }); }, 700);
}

/* ---------- ajout d'un lieu ---------- */
function setupAdd() {
  const dlg = $("dlg"), form = $("addform"), msg = $("addmsg");
  $("add").addEventListener("click", () => { msg.textContent = ""; form.reset(); dlg.showModal(); });
  $("cancel").addEventListener("click", () => dlg.close());
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = new FormData(form);
    const nom = String(f.get("nom") || "").trim();
    const lien = String(f.get("lien") || "").trim();
    const photoUrl = String(f.get("photo") || "").trim();
    if (!nom) { msg.textContent = "Il faut au moins un nom."; form.elements.nom.focus(); return; }
    if (lien && !/^https?:\/\//i.test(lien)) { msg.textContent = "Le lien de l'annonce doit commencer par https://"; return; }
    if (photoUrl && !/^https?:\/\//i.test(photoUrl)) { msg.textContent = "Le lien de la photo doit commencer par https://"; return; }
    const enLigne = f.get("enligne") === "on";
    $("addok").disabled = true;
    dlg.close();
    tab = enLigne ? "online" : "call";
    toast(nom + " ajouté");
    await send({
      action: "ajout", nom, lien, photo: photoUrl, prix: Number(f.get("prix")) || "",
      couchages: String(f.get("couchages") || "").trim(), tel: String(f.get("tel") || "").trim(),
      aAppeler: !enLigne, qui: myName(),
    });
    $("addok").disabled = false;
  });
}

/* ---------- fenêtres : un tap sur le fond ferme ---------- */
function setupSheets() {
  document.querySelectorAll("dialog.sheet").forEach(d => {
    d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
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

/* ---------- la petite boule tramée (Bayer 4x4) à côté du titre ---------- */
function orb() {
  const c = $("orb"), ctx = c.getContext && c.getContext("2d"), N = c.width;
  if (!ctx) return;
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const img = ctx.createImageData(N, N);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const color = () => {
    const m = getComputedStyle(document.documentElement).getPropertyValue("--glow").trim().match(/^#(..)(..)(..)$/);
    return m ? m.slice(1).map(x => parseInt(x, 16)) : [223, 154, 78];
  };
  let rgb = color(), last = -1e9;
  function frame(t) {
    if (t - last > 80) {
      last = t;
      const k = t / 1000;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const nx = (x + .5 - N / 2) / (N / 2), ny = (y + .5 - N / 2) / (N / 2), r = Math.hypot(nx, ny);
        let v = 0;
        if (r < 1) {
          const z = Math.sqrt(1 - r * r), lx = nx * Math.cos(k * .3) + z * Math.sin(k * .3);
          const light = Math.max(0, .35 * lx - .55 * ny + .75 * z);
          const band = .5 + .5 * Math.sin(lx * 5 + ny * 2 + k * .8) * Math.sin(ny * 4 - k * .5);
          v = light * (.7 + .3 * band) + .08;
        }
        const i = (y * N + x) * 4;
        img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
        img.data[i + 3] = r < 1 && v * 16 > B[(y & 3) * 4 + (x & 3)] + .5 ? 255 : 0;
      }
      ctx.putImageData(img, 0, 0);
    }
    if (!still && !document.hidden) requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !still) requestAnimationFrame(frame); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { rgb = color(); last = -1e9; requestAnimationFrame(frame); });
  requestAnimationFrame(frame);
}

/* ---------- démarrage ---------- */
let locked = false;
function lock() {
  locked = true;
  store.set("cle", "");
  document.querySelectorAll("dialog[open]").forEach(d => d.close());
  $("app").hidden = true;
  $("lock").hidden = false;
}

async function load(force) {
  if (locked) return;
  if (API && !KEY) return lock();
  const seq = writes;
  try {
    let d = await db.get();
    if (!d.lieux.length) {
      const seed = await (await fetch("seed.json")).json();
      d = await db.post({ action: "seed", lieux: seed });
    }
    const quiet = seq === writes && !pending && !nbTimer && !typing() && !$("dlg").open && !$("who").open;
    if (!force && !quiet) return;
    const same = loaded && JSON.stringify(d) === JSON.stringify(data);
    data = d;
    loaded = true;
    if (!same) refresh();
  } catch (e) {
    if (e.message === "Lien invalide") return lock();
    loaded = true;
    refresh();
    toast("Impossible de charger la liste, réessaie dans un instant");
  }
}

$("less").addEventListener("click", () => bumpNb(-1));
$("more").addEventListener("click", () => bumpNb(1));
$("sort").addEventListener("change", ev => { sort = ev.target.value; renderList(); });
if (SHEET) { $("sheet-link").href = SHEET; $("sheet-group").hidden = false; }
$("mode").textContent = API ? "" : "Mode essai : ce que tu notes reste sur ce téléphone tant que le Drive n'est pas branché.";
setupWho();
setupAdd();
setupSheets();
renderWho();
tick();
setInterval(tick, 60000);
renderList();
load();
orb();
setInterval(() => { if (!document.hidden) load(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
