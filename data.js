"use strict";

/* Accès aux données : la Google Sheet (via Apps Script), ou un essai local quand elle n'est pas branchée. */

const API = (window.API_URL || "").trim();
const SHEET = (window.SHEET_URL || "").trim();
const PRENOM = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' .-]{0,29}$/;
// role : "appel" (peut tout faire) ou "groupe" (voir et noter), donné par la Sheet selon le lien
const VIDE = () => ({ lieux: [], avis: [], journal: [], personnes: [], nb: 35, role: "appel" });

// préfixe : toutes les pages julienrabault.github.io partagent le même stockage
const store = {
  get(k) { try { return localStorage.getItem("explosada-" + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem("explosada-" + k, v); } catch (e) { /* stockage indisponible : on continue sans */ } },
};
const myName = () => (store.get("prenom") || "").trim().slice(0, 30);
const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const isMe = n => !!n && sameName(n, myName());

// La clé arrive dans le lien de partage (#k=… ou ?k=…) et reste dans l'adresse en ?k=… :
// « Ouvrir dans le navigateur » depuis Instagram ou WhatsApp ne transmet que l'adresse affichée,
// et certains de ces navigateurs perdent la partie après #. On la garde aussi sur le téléphone.
const KEY = (() => {
  const valid = k => (/^[\w-]{8,64}$/.test(k || "") ? k : "");
  const fromHash = (location.hash.match(/k=([\w-]{8,64})/) || [])[1];
  const fromQuery = valid(new URLSearchParams(location.search).get("k"));
  const key = fromHash || fromQuery || store.get("cle") || "";
  if (!key) return "";
  store.set("cle", key);
  const url = location.pathname + "?k=" + key;
  if (location.pathname + location.search + location.hash !== url) history.replaceState(null, "", url);
  return key;
})();

// Dernière liste reçue, gardée sur le téléphone : la page s'affiche tout de suite, la Sheet confirme ensuite.
const snapshot = {
  read() {
    try {
      const s = JSON.parse(store.get("etat"));
      return s && s.k === KEY ? { ...VIDE(), ...s.d } : null;
    } catch (e) { return null; }
  },
  save(d) { store.set("etat", JSON.stringify({ k: KEY, d })); },
  clear() { store.set("etat", ""); },
};

// Notes pas encore confirmées par la Sheet ({id: note}), gardées sur le téléphone jusqu'à l'envoi réussi.
const unsent = {
  read() {
    try { return JSON.parse(store.get("notes")) || {}; } catch (e) { return {}; }
  },
  put(id, note) { store.set("notes", JSON.stringify({ ...this.read(), [id]: note })); },
  // on n'efface que ce qui est parti : une note changée pendant l'envoi reste à envoyer
  drop(sent) {
    const q = this.read();
    for (const [id, note] of Object.entries(sent)) if (q[id] === note) delete q[id];
    store.set("notes", JSON.stringify(q));
  },
};

// un réseau qui ne répond pas ne doit pas bloquer la file d'envoi
async function fetch20(url, opts = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); } finally { clearTimeout(timer); }
}
// refus du script : message fait pour la page (à l'inverse d'une panne de réseau)
function refus(msg) {
  const e = new Error(msg);
  e.server = true;
  return e;
}
function check(res) {
  if (res && res.error) throw refus(res.error);
  if (!res) throw new Error("Réponse vide");
  return { ...VIDE(), ...res };
}

const remote = {
  async get() {
    const r = await fetch20(API + (API.includes("?") ? "&" : "?") + "k=" + encodeURIComponent(KEY) + "&t=" + Date.now(), { cache: "no-store" });
    return check(await r.json());
  },
  async post(req) {
    // text/plain : pas de requête préalable CORS, Apps Script lit le corps tel quel
    const r = await fetch20(API, { method: "POST", body: JSON.stringify({ ...req, k: KEY, par: myName() }) });
    return check(await r.json());
  },
};

/* Essai local : rejoue les règles du script Apps Script, enregistré sur ce téléphone seulement. */
const local = {
  read() {
    try { return { ...VIDE(), ...JSON.parse(store.get("local")) }; } catch (e) { return VIDE(); }
  },
  async get() { return this.read(); },
  async post(req) {
    const d = this.read();
    const par = myName(), now = Date.now();
    const find = id => d.lieux.find(l => l.id === id);
    const log = (id, quoi) => { d.journal = [...d.journal, { t: now, par, id: id || "", quoi }].slice(-300); };
    const patch = (id, p) => { d.lieux = d.lieux.map(l => l.id === id ? { ...l, ...p, maj: now } : l); };
    let extra = {};
    if (req.action === "seed" && !d.lieux.length) d.lieux = req.lieux.map(l => ({ ...l, statut: "À appeler", qui: "", depuis: "", prixNego: "", commentaire: "", maj: now }));
    if (req.action === "maj") {
      const l = find(req.id), p = pick(req, ["statut", "prixNego", "commentaire"]);
      const tenu = l.qui && !sameName(l.qui, par) ? l.qui : "";
      if (req.qui && tenu) throw refus(tenu + " s'en occupe déjà");
      if (req.statut && req.statut !== "À appeler" && !l.qui) Object.assign(p, { qui: par, depuis: now });
      if ("qui" in req) Object.assign(p, { qui: req.qui ? par : "", depuis: req.qui ? now : "" });
      patch(req.id, p);
      if ("statut" in req) log(req.id, "statut : " + req.statut);
      if ("qui" in req) log(req.id, req.qui ? "prend le lieu" : tenu ? "libère le lieu de " + tenu : "libère le lieu");
      if ("prixNego" in req) log(req.id, req.prixNego ? `prix obtenu : ${req.prixNego} €` : "efface le prix");
      if ("commentaire" in req) log(req.id, "note : " + (req.commentaire.slice(0, 120) || "(effacée)"));
    }
    if (req.action === "prendre") {
      const l = find(req.id);
      if (l.qui && !sameName(l.qui, par)) extra = { conflit: { qui: l.qui, depuis: l.depuis } };
      else if (!l.qui) { patch(req.id, { qui: par, depuis: now }); log(req.id, "prend le lieu"); }
    }
    if (req.action === "appel") {
      const l = find(req.id);
      log(req.id, l.qui && !sameName(l.qui, par) ? "appelle aussi" : "appelle");
    }
    if (req.action === "ajout") {
      const id = "u" + now.toString(36);
      d.lieux = [...d.lieux, { ...pick(req, ["nom", "lien", "prix", "couchages", "tel", "photo"]), id, qui: "", depuis: "", statut: "À appeler", aAppeler: req.aAppeler === false ? "non" : "oui", prio: 2, maj: now }];
      log(id, "ajoute le lieu");
    }
    if (req.action === "avis") {
      req.notes.forEach(({ id, note }) => {
        d.avis = [...d.avis.filter(a => !(a.id === id && sameName(a.prenom, par))), ...(note > 0 ? [{ id, prenom: par, note }] : [])];
      });
      const [one] = req.notes;
      if (req.notes.length > 1) log("", `note ${req.notes.length} lieux`);
      else if (one) log(one.id, one.note > 0 ? `note ${one.note}/5` : "retire sa note");
    }
    if (req.action === "nb") { d.nb = req.nb; log("", `passe à ${req.nb} personnes`); }
    if (req.action === "bonjour" && !d.personnes.some(p => sameName(p, par))) { d.personnes = [...d.personnes, par]; log("", "arrive"); }
    store.set("local", JSON.stringify(d));
    return { ...d, ...extra };
  },
};
const db = API ? remote : local;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
