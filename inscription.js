"use strict";

/* Inscription : qui vient vraiment. Une ligne par personne dans l'onglet Inscriptions de la Sheet. */
const PRIX = "entre 100 et 170 € par personne pour les 3 nuits, selon la maison et le nombre de partants";
const LIMITE = "mardi 10 novembre, 20h";
const NUITS = ["31 → 1er", "1er → 2", "2 → 3"];
const NUITS_LABEL = { "31 → 1er": "Jeu. 31 → ven. 1er (réveillon)", "1er → 2": "Ven. 1er → sam. 2", "2 → 3": "Sam. 2 → dim. 3" };

const $ = id => document.getElementById(id);
let inscrits = [];

function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function lock(why) {
  $("lock-text").textContent = why === "Page fermée" ? "La page est fermée pour le moment." : "Cette page s'ouvre avec le lien de partage. Rouvre le lien reçu dans le groupe.";
  $("app").hidden = true;
  $("lock").hidden = false;
}

const mine = () => inscrits.find(i => sameName(i.prenom, myName()));

function renderCount() {
  const n = inscrits.length;
  $("count-top").textContent = n ? `${n} ${n > 1 ? "inscrits" : "inscrit"}` : "inscriptions ouvertes";
}

function showDone() {
  const n = inscrits.length;
  $("done-text").textContent = `${myName()}, tu es sur la liste${n > 1 ? `, avec ${n - 1} autre${n > 2 ? "s" : ""}` : ""}. `
    + "Tu seras ajouté·e à la conv d'orga, et c'est là qu'on te demandera ta part. Si le séjour ne se fait pas, tout le monde est remboursé.";
  $("form").hidden = true;
  $("done").hidden = false;
}

function setup() {
  $("price").textContent = PRIX;
  $("deadline").textContent = LIMITE;
  $("engage-text").textContent = `Je viens et je m'engage à payer ma part du logement (${PRIX.split(" par personne")[0]}) quand on me la demandera, sous 48 h. `
    + "Si le séjour ne se fait pas, tout le monde est remboursé.";
  $("nights").replaceChildren(...NUITS.map(n => {
    const label = document.createElement("label");
    label.className = "field toggle";
    const span = document.createElement("span");
    span.textContent = NUITS_LABEL[n];
    const input = document.createElement("input");
    Object.assign(input, { type: "checkbox", name: "nuit", value: n, checked: true });
    input.setAttribute("role", "switch");
    label.append(span, input);
    return label;
  }));
  $("back").href = "./" + location.search;
  const f = $("form");
  f.elements.prenom.value = myName();
  $("edit").addEventListener("click", () => { $("done").hidden = true; f.hidden = false; });
  f.addEventListener("submit", async ev => {
    ev.preventDefault();
    const msg = $("msg");
    const prenom = f.elements.prenom.value.trim().replace(/\s+/g, " ");
    const nom = f.elements.nom.value.trim();
    const insta = f.elements.insta.value.trim();
    const nuits = [...f.querySelectorAll("input[name=nuit]:checked")].map(i => i.value);
    msg.textContent = "";
    if (!PRENOM.test(prenom)) return (msg.textContent = "Ton prénom, en lettres (30 au plus).");
    if (!nom) return (msg.textContent = "Il manque ton nom.");
    if (!insta) return (msg.textContent = "Ton pseudo Insta, pour t'ajouter à la conv d'orga.");
    if (!nuits.length) return (msg.textContent = "Choisis au moins une nuit.");
    if (!f.elements.engage.checked) return (msg.textContent = "Coche l'engagement pour t'inscrire.");
    store.set("prenom", prenom);
    $("submit").disabled = true;
    try {
      const d = await db.post({ action: "inscription", nom, insta, nuits, engage: true });
      inscrits = d.inscrits || [];
      store.set("inscription", JSON.stringify({ nom, insta, nuits }));
      renderCount();
      showDone();
      toast("Inscription enregistrée");
    } catch (e) {
      if (e.message === "Lien invalide" || e.message === "Page fermée") return lock(e.message);
      msg.textContent = e.server ? e.message : "Pas enregistré, vérifie ta connexion et réessaie.";
    } finally {
      $("submit").disabled = false;
    }
  });
  // ce qu'on avait rempli sur ce téléphone revient, pour pouvoir modifier
  try {
    const prev = JSON.parse(store.get("inscription"));
    if (prev) {
      f.elements.nom.value = prev.nom || "";
      f.elements.insta.value = prev.insta || "";
      f.querySelectorAll("input[name=nuit]").forEach(i => { i.checked = (prev.nuits || []).includes(i.value); });
    }
  } catch (e) { /* rien de gardé */ }
}

async function start() {
  setup();
  if (API && !KEY) return lock("Lien invalide");
  try {
    const d = await db.get();
    inscrits = d.inscrits || [];
    renderCount();
    if (myName() && mine()) showDone();
  } catch (e) {
    if (e.message === "Lien invalide" || e.message === "Page fermée") return lock(e.message);
    renderCount();
  }
}
start();
