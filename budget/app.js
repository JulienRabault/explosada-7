"use strict";
const $ = id => document.getElementById(id);
const CLE = "explosada-budget-v2";
const NUITS = [2, 3];
const MARGES = [0, 10, 15, 20];
const COMPARER = [20, 25, 30, 35, 40];
// trois façons de compter une dépense
const MODES = [
  ["jour", "/ pers. / jour"],
  ["pers", "/ pers."],
  ["total", "total"],
];
// exemples : maisons au plafond pour 30, gros buveurs
const EXEMPLE = {
  n: 30, log2: 3600, log3: 4500, plafond: 150, marge: 10,
  items: [
    { nom: "Bouffe", montant: 15, mode: "jour" },
    { nom: "Alcool et softs", montant: 20, mode: "jour" },
    { nom: "Feu d'artifice", montant: 300, mode: "total" },
    { nom: "Déco, gobelets, glace", montant: 150, mode: "total" },
  ],
};
const copie = o => JSON.parse(JSON.stringify(o));
const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = x => fmt.format(Math.round(x)) + " €";
const num = v => { const x = Number(String(v).replace(/[\s ]/g, "").replace(",", ".")); return Number.isFinite(x) && x >= 0 ? x : 0; };

function charger() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE));
    if (v && typeof v === "object" && Array.isArray(v.items)) return { ...copie(EXEMPLE), ...v };
  } catch (e) { /* rien de gardé : on part des exemples */ }
  return copie(EXEMPLE);
}
function garder() { try { localStorage.setItem(CLE, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ } }
let s = charger();

const total = (it, nuits, n) => it.mode === "jour" ? it.montant * nuits * n : it.mode === "pers" ? it.montant * n : it.montant;

// une formule (2 ou 3 nuits) pour n personnes
function calcul(nuits, n) {
  n = Math.max(1, Math.round(n));
  const logement = nuits === 2 ? s.log2 : s.log3;
  const L = [{ nom: "Logement", g: logement }, ...s.items.map(it => ({ nom: it.nom.trim() || "Sans nom", g: total(it, nuits, n) }))];
  const reste = L.slice(1).reduce((t, l) => t + l.g, 0);
  if (s.marge) L.push({ nom: `Marge ${s.marge} %`, g: reste * s.marge / 100 });
  const tout = L.reduce((t, l) => t + l.g, 0);
  return { nuits, n, logement, L, tout, pp: tout / n, demande: Math.ceil(tout / n / 5) * 5 };
}

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach(k => { if (k != null && k !== false) e.append(k); });
  return e;
}
const affiche = x => x ? String(x).replace(".", ",") : "";

/* ---------- les dépenses ---------- */

function carteDepense(it, i) {
  const seg = el("div", { class: "seg", role: "group", "aria-label": "Comment compter " + (it.nom || "cette dépense") },
    MODES.map(([m, t]) => el("button", { type: "button", "aria-pressed": String(it.mode === m),
      onclick: () => { it.mode = m; dessinerItems(); maj(); } }, t)));
  return el("div", { class: "card item" },
    el("div", { class: "item-top" },
      el("input", { id: "nom-" + i, value: it.nom, maxlength: "50", placeholder: "Nom de la dépense", "aria-label": "Nom de la dépense",
        oninput: e => { it.nom = e.target.value; maj(); } }),
      el("button", { type: "button", class: "del", "aria-label": "Retirer " + (it.nom || "cette dépense"),
        onclick: () => { s.items.splice(i, 1); dessinerItems(); maj(); } }, "×")),
    el("div", { class: "item-mid" },
      el("div", { class: "box" },
        el("input", { id: "montant-" + i, value: affiche(it.montant), inputmode: "decimal", placeholder: "0", "aria-label": "Montant de " + (it.nom || "la dépense"),
          oninput: e => { it.montant = num(e.target.value); maj(); } }),
        el("span", { class: "suf" }, "€")),
      seg),
    el("div", { class: "res", id: "res-it-" + i }));
}
function dessinerItems() { $("items").replaceChildren(...s.items.map(carteDepense)); }

function dessinerMarge() {
  $("marge").replaceChildren(...MARGES.map(m => el("button", { type: "button", "aria-pressed": String(s.marge === m),
    onclick: () => { s.marge = m; dessinerMarge(); maj(); } }, m + " %")));
}

function remplirChamps() {
  $("n").value = String(s.n);
  ["log2", "log3", "plafond"].forEach(k => { $(k).value = affiche(s[k]); });
}

/* ---------- les résultats ---------- */

function carteFormule(r) {
  return el("div", { class: "sc" },
    el("p", { class: "k" }, `${r.nuits} nuits`),
    el("p", { class: "big" }, fmt.format(Math.round(r.pp)), " ", el("small", null, "€ / pers.")),
    el("p", { class: "ask" }, `On demande ${eur(r.demande)}`),
    r.logement ? null : el("p", { class: "hint" }, `Mets le prix pour ${r.nuits} nuits`),
    el("dl", null,
      r.L.map(l => el("div", { class: "ln" }, el("dt", null, l.nom), el("dd", null, eur(l.g / r.n)))),
      el("div", { class: "ln sum" }, el("dt", null, `Total, ${r.n} pers.`), el("dd", null, eur(r.tout)))));
}

function noteLogement(prix, n) {
  if (!prix) return [el("span", { class: "pill mute" }, "pas encore de prix")];
  const pp = prix / n, trop = s.plafond > 0 && pp > s.plafond;
  return [el("span", { class: "pill " + (trop ? "warn" : "ok") }, `${eur(pp)} / pers.`), el("span", null, trop ? "au-dessus du plafond" : "ça passe")];
}

function maj() {
  const n = s.n;
  const rs = NUITS.map(d => calcul(d, n));
  $("duo").replaceChildren(...rs.map(carteFormule));
  $("dock2").textContent = eur(rs[0].pp);
  $("dock3").textContent = eur(rs[1].pp);

  $("res2").replaceChildren(...noteLogement(s.log2, n));
  $("res3").replaceChildren(...noteLogement(s.log3, n));
  $("resmax").replaceChildren(el("span", null, "Maison à ", el("b", null, eur(s.plafond * n)), " max pour ", el("b", null, String(n)), " pers."));

  s.items.forEach((it, i) => {
    const r = $("res-it-" + i);
    if (!r) return;
    r.replaceChildren(...NUITS.map((d, j) => el("span", null, j ? "· " : "", `${d} nuits : `, el("b", null, eur(total(it, d, n) / n)), " / pers.")));
  });

  const tailles = [...new Set([...COMPARER, n])].sort((a, b) => a - b);
  $("cmp").replaceChildren(
    el("thead", null, el("tr", null, el("th", null, "Personnes"), el("th", null, "2 nuits"), el("th", null, "3 nuits"))),
    el("tbody", null, tailles.map(t => el("tr", { class: t === n ? "cur" : null },
      el("td", null, String(t)), el("td", null, eur(calcul(2, t).pp)), el("td", null, eur(calcul(3, t).pp))))));
  garder();
}

function recap() {
  return [`Budget Explosada, ${s.n} personnes`, ""].concat(...NUITS.map(d => {
    const r = calcul(d, s.n);
    return [`${d} nuits : ${eur(r.pp)} par personne (on demande ${eur(r.demande)})`,
      ...r.L.map(l => `- ${l.nom} : ${eur(l.g)} en tout, ${eur(l.g / r.n)} / pers.`),
      `Total : ${eur(r.tout)}`, ""];
  })).join("\n").trim();
}

/* ---------- les entrées ---------- */

$("n").addEventListener("input", e => { s.n = Math.max(1, Math.round(num(e.target.value)) || 1); maj(); });
["log2", "log3", "plafond"].forEach(k => $(k).addEventListener("input", e => { s[k] = num(e.target.value); maj(); }));
$("n").addEventListener("blur", () => { $("n").value = String(s.n); });
document.querySelectorAll("[data-step]").forEach(b => b.addEventListener("click", () => {
  s.n = Math.max(1, s.n + Number(b.dataset.step));
  $("n").value = String(s.n);
  maj();
}));
$("form").addEventListener("submit", e => e.preventDefault());
$("add").addEventListener("click", () => {
  s.items.push({ nom: "", montant: 0, mode: "total" });
  dessinerItems();
  maj();
  $("nom-" + (s.items.length - 1)).focus();
});

$("copy").addEventListener("click", () => {
  const texte = recap(), b = $("copy");
  const fait = () => { b.textContent = "Copié"; setTimeout(() => { b.textContent = "Copier le récap"; }, 1800); };
  const secours = () => { const t = $("fallback"); t.value = texte; t.hidden = false; t.focus(); t.select(); b.textContent = "Copie-le à la main"; };
  try { navigator.clipboard.writeText(texte).then(fait, secours); } catch (e) { secours(); }
});

// deux appuis pour tout remettre : un seul effacerait les chiffres par erreur
let arme = 0;
$("reset").addEventListener("click", () => {
  const b = $("reset");
  if (!arme) {
    b.textContent = "Sûr ? Appuie encore";
    arme = setTimeout(() => { arme = 0; b.textContent = "Remettre les exemples"; }, 3000);
    return;
  }
  clearTimeout(arme);
  arme = 0;
  b.textContent = "Remettre les exemples";
  s = copie(EXEMPLE);
  remplirChamps(); dessinerItems(); dessinerMarge();
  $("fallback").hidden = true;
  maj();
});

remplirChamps();
dessinerItems();
dessinerMarge();
maj();
