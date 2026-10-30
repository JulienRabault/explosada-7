/**
 * Réveillon 26/27 — base partagée des lieux.
 * À coller dans la Google Sheet : Extensions > Apps Script, puis Déployer > Application Web
 * (Exécuter en tant que : moi · Qui a accès : tout le monde).
 * Les onglets Lieux, Avis et Réglages sont créés tout seuls au premier appel.
 *
 * Accès : rien ne répond sans la clé du lien de partage.
 * Lance creerLienDePartage() une fois dans l'éditeur, le lien s'affiche dans le journal.
 * Si le lien a fuité, lance changerLienDePartage() : l'ancien cesse de marcher.
 */

const PAGE = "https://julienrabault.github.io/explosada-7/";
const CACHE = "etat";
const MAX_LIEUX = 200;
const MAX_AVIS = 2000;
const LIEUX = "Lieux";
const AVIS = "Avis";
const REGLAGES = "Réglages";

const COLS = [
  ["id", "ID"],
  ["nom", "Nom"],
  ["statut", "Statut"],
  ["qui", "Qui s'en occupe"],
  ["prix", "Prix affiché 3 nuits (€)"],
  ["prixNego", "Prix négocié (€)"],
  ["couchages", "Couchages"],
  ["fete", "Fête"],
  ["tel", "Téléphone"],
  ["email", "Email"],
  ["lien", "Lien"],
  ["photo", "Photo"],
  ["aAppeler", "À appeler"],
  ["prio", "Priorité"],
  ["infos", "Infos"],
  ["commentaire", "Commentaire"],
  ["maj", "Mis à jour"],
];
const AVIS_COLS = ["ID", "Prénom", "Note", "Mis à jour"];
const STATUTS = ["À appeler", "Pas de réponse", "Dispo", "Option posée", "Réservé", "Abandonné"];

function doGet(e) {
  if (!autorise(e && e.parameter && e.parameter.k)) return json({ error: "Lien invalide" });
  // chaque téléphone relit la liste toutes les minutes : on sert une copie en cache
  const cache = CacheService.getScriptCache();
  const copie = cache.get(CACHE);
  if (copie) return ContentService.createTextOutput(copie).setMimeType(ContentService.MimeType.JSON);
  return json(etat());
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json({ error: "Requête illisible" });
  }
  if (!autorise(req && req.k)) return json({ error: "Lien invalide" });
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (req.action === "maj") majLieu(req);
    else if (req.action === "ajout") ajoutLieu(req);
    else if (req.action === "avis") donnerAvis(req);
    else if (req.action === "nb") changerNb(req);
    else if (req.action === "seed") seed(req);
    else throw new Error("Action inconnue");
    return json(etat());
  } catch (err) {
    console.error(err);
    return json({ error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- lien de partage ---------- */

function autorise(k) {
  const cle = PropertiesService.getScriptProperties().getProperty("CLE");
  return !!cle && typeof k === "string" && k === cle;
}

function creerLienDePartage() {
  const props = PropertiesService.getScriptProperties();
  let cle = props.getProperty("CLE");
  if (!cle) {
    cle = Utilities.getUuid().replace(/-/g, "");
    props.setProperty("CLE", cle);
  }
  console.log("Lien à partager : " + PAGE + "#k=" + cle);
}

function changerLienDePartage() {
  PropertiesService.getScriptProperties().deleteProperty("CLE");
  creerLienDePartage();
}

/* ---------- lecture ---------- */

function etat() {
  const lieux = lignes(feuille(LIEUX)).map(r => {
    const o = {};
    COLS.forEach(([k], i) => (o[k] = r[i] instanceof Date ? r[i].getTime() : r[i]));
    return o;
  }).filter(o => o.id);
  const avis = lignes(feuille(AVIS)).filter(r => r[0]).map(r => ({ id: String(r[0]), prenom: sansApostrophe(r[1]), note: Number(r[2]) }));
  const o = { lieux, avis, nb: nbPersonnes() };
  try {
    CacheService.getScriptCache().put(CACHE, JSON.stringify(o), 60);
  } catch (err) {
    console.warn("Cache plein, on sert sans cache : " + err); // au-delà de 100 Ko
  }
  return o;
}

function lignes(sh) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
}

function nbPersonnes() {
  const v = Number(feuille(REGLAGES).getRange("B2").getValue());
  return v >= 10 && v <= 80 ? v : 35;
}

/* ---------- écritures ---------- */

function majLieu(req) {
  const sh = feuille(LIEUX);
  const row = trouver(sh, req.id);
  const champs = {};
  if ("statut" in req) {
    if (!STATUTS.includes(req.statut)) throw new Error("Statut inconnu");
    champs.statut = req.statut;
  }
  if ("qui" in req) champs.qui = texte(req.qui, 30);
  if ("prixNego" in req) champs.prixNego = montant(req.prixNego);
  if ("commentaire" in req) champs.commentaire = texte(req.commentaire, 600);
  champs.maj = new Date();
  Object.keys(champs).forEach(k => {
    sh.getRange(row, colonne(k)).setValue(champs[k]);
  });
}

function ajoutLieu(req) {
  const nom = texte(req.nom, 80);
  if (!nom) throw new Error("Il faut un nom");
  if (feuille(LIEUX).getLastRow() - 1 >= MAX_LIEUX) throw new Error("Liste pleine");
  const lien = url(req.lien);
  const ligne = {
    id: "u" + Date.now().toString(36),
    nom,
    statut: "À appeler",
    qui: texte(req.qui, 30),
    prix: montant(req.prix),
    prixNego: "",
    couchages: texte(req.couchages, 60),
    fete: "",
    tel: texte(req.tel, 40),
    email: "",
    lien,
    photo: url(req.photo),
    aAppeler: req.aAppeler === false ? "non" : "oui",
    prio: 2,
    infos: texte(req.infos, 200),
    commentaire: "",
    maj: new Date(),
  };
  feuille(LIEUX).appendRow(COLS.map(([k]) => ligne[k]));
}

function donnerAvis(req) {
  const id = texte(req.id, 20);
  trouver(feuille(LIEUX), id);
  const prenom = texte(req.prenom, 30);
  if (!prenom) throw new Error("Il faut un prénom");
  const note = Math.round(Number(req.note));
  if (!(note >= 0 && note <= 5)) throw new Error("Note entre 1 et 5");
  const sh = feuille(AVIS);
  const data = lignes(sh);
  const qui = sansApostrophe(prenom).toLowerCase();
  const i = data.findIndex(r => String(r[0]) === id && sansApostrophe(r[1]).toLowerCase() === qui);
  if (note === 0) {
    if (i >= 0) sh.deleteRow(i + 2);
    return;
  }
  const valeurs = [[id, prenom, note, new Date()]];
  if (i >= 0) sh.getRange(i + 2, 1, 1, 4).setValues(valeurs);
  else if (data.length >= MAX_AVIS) throw new Error("Trop d'avis");
  else sh.appendRow(valeurs[0]);
}

function changerNb(req) {
  const n = Math.round(Number(req.nb));
  if (!(n >= 10 && n <= 80)) throw new Error("Entre 10 et 80 personnes");
  feuille(REGLAGES).getRange("B2").setValue(n);
}

function seed(req) {
  const sh = feuille(LIEUX);
  if (sh.getLastRow() > 1) return; // déjà rempli : on ne touche à rien
  const rows = (Array.isArray(req.lieux) ? req.lieux : []).slice(0, 150).map(l => COLS.map(([k]) => {
    if (k === "maj") return new Date();
    if (k === "statut") return "À appeler";
    if (k === "prix" || k === "prio") return montant(l[k]);
    if (k === "lien") return url(l[k]);
    return texte(l[k], 400);
  }));
  if (rows.length) sh.getRange(2, 1, rows.length, COLS.length).setValues(rows);
}

/* ---------- outils ---------- */

function feuille(nom) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (sh) return sh;
  sh = ss.insertSheet(nom);
  if (nom === LIEUX) {
    // texte brut partout : un numéro « 0561… » ou une note « 12/05 » restent tels quels
    sh.getRange(1, 1, 1000, COLS.length).setNumberFormat("@");
    sh.getRange(1, colonne("prixNego"), 1000, 1).setNumberFormat("#,##0 €");
    sh.getRange(1, colonne("prix"), 1000, 1).setNumberFormat("#,##0 €");
    sh.getRange(1, colonne("prio"), 1000, 1).setNumberFormat("0");
    sh.getRange(1, colonne("maj"), 1000, 1).setNumberFormat("dd/mm/yyyy hh:mm");
    sh.appendRow(COLS.map(c => c[1]));
  } else if (nom === AVIS) {
    sh.getRange(1, 1, 3000, 2).setNumberFormat("@");
    sh.getRange(1, 4, 3000, 1).setNumberFormat("dd/mm/yyyy hh:mm");
    sh.appendRow(AVIS_COLS);
  } else if (nom === REGLAGES) {
    sh.appendRow(["Réglage", "Valeur"]);
    sh.appendRow(["Nombre de personnes", 35]);
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight("bold");
  return sh;
}

function sansApostrophe(v) {
  return String(v == null ? "" : v).replace(/^'/, "");
}

function colonne(k) {
  return COLS.findIndex(c => c[0] === k) + 1;
}

function trouver(sh, id) {
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  const i = ids.findIndex(r => String(r[0]) === String(id));
  if (i < 0) throw new Error("Lieu introuvable");
  return i + 2;
}

function texte(v, max) {
  let s = String(v == null ? "" : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // pas de formule injectée dans la Sheet
  return s;
}

function montant(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 1000000 ? n : "";
}

function url(v) {
  const s = String(v == null ? "" : v).trim().slice(0, 500);
  return /^https?:\/\/\S+$/i.test(s) || /^img\/[\w.-]+$/.test(s) ? s : "";
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
