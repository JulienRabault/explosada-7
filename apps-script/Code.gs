/**
 * @OnlyCurrentDoc
 * Explosada 7.0 — base partagée des lieux.
 * À coller dans la Google Sheet : Extensions > Apps Script, puis Déployer > Application Web
 * (Exécuter en tant que : moi · Qui a accès : tout le monde).
 * @OnlyCurrentDoc limite le script à cette seule Sheet : il ne peut rien lire d'autre dans le Drive.
 * Les onglets Lieux, Avis, Journal, Personnes et Réglages sont créés tout seuls.
 *
 * Accès : rien ne répond sans la clé d'un lien de partage, et chaque écriture est signée d'un prénom.
 * Deux liens : celui des appelants peut tout faire, celui du groupe peut seulement voir et noter.
 * - creerLienDePartage() : affiche les deux liens dans le journal d'exécution.
 * - changerLienDuGroupe() : si le lien du groupe a fuité, l'ancien cesse de marcher.
 * - changerLienDePartage() : change les deux liens.
 * - fermerLaPage() / rouvrirLaPage() : coupe tout d'un coup, sans rien effacer.
 */

const PAGE = "https://julienrabault.github.io/explosada-7/";
const CACHE = "etat";
const MAX_LIEUX = 200;
const MAX_AVIS = 2000;
const MAX_JOURNAL = 5000;
const MAX_PERSONNES = 300;
const JOURNAL_ENVOYE = 300;
const PAR_MINUTE_PERSONNE = 40;
const PAR_MINUTE_TOUS = 300;

const LIEUX = "Lieux";
const AVIS = "Avis";
const JOURNAL = "Journal";
const PERSONNES = "Personnes";
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
  ["depuis", "Pris le"],
];
const ENTETES = {
  [AVIS]: ["ID", "Prénom", "Note", "Mis à jour"],
  [JOURNAL]: ["Date", "Prénom", "ID", "Lieu", "Action"],
  [PERSONNES]: ["Prénom", "Première visite", "Dernière visite"],
  [REGLAGES]: ["Réglage", "Valeur"],
};
const STATUTS = ["À appeler", "Pas de réponse", "Dispo", "Option posée", "Réservé", "Abandonné"];
const PRENOM = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' .-]{0,29}$/;
const ID = /^[\w-]{1,24}$/;
const CLE_APPEL = "CLE";
const CLE_GROUPE = "CLE_GROUPE";
const GROUPE_PEUT = ["avis", "bonjour"];

/* ---------- entrées ---------- */

function doGet(e) {
  const qui = role(e && e.parameter && e.parameter.k);
  if (!qui) return json({ error: refus() });
  const lock = LockService.getScriptLock();
  let verrou = false;
  try {
    // chaque téléphone relit la liste toutes les minutes : on sert une copie en cache
    const copie = cacheLire();
    if (copie) return json(Object.assign(copie, { role: qui }));
    // sans le verrou, une lecture lente pourrait remettre en cache un état plus ancien qu'une écriture
    verrou = lock.tryLock(3000);
    return json(Object.assign(etat(verrou), { role: qui }));
  } catch (err) {
    console.error(err);
    return json({ error: "Erreur, réessaie" });
  } finally {
    if (verrou) lock.releaseLock();
  }
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return json({ error: "Requête illisible" });
  }
  const qui = role(req && req.k);
  if (!qui) return json({ error: refus() });
  const lock = LockService.getScriptLock();
  try {
    if (qui === "groupe" && !GROUPE_PEUT.includes(req.action)) throw oups("Ce lien sert seulement à noter les lieux");
    const par = req.action === "seed" ? "page" : prenom(req.par);
    limiter(par);
    // noter une visite n'est pas urgent : si la Sheet est occupée, on laisse tomber sans faire attendre
    if (req.action === "bonjour" && !lock.tryLock(2000)) return json(Object.assign(etat(false), { role: qui }));
    lock.waitLock(15000);
    const actions = { maj: majLieu, prendre: prendre, appel: appel, ajout: ajoutLieu, avis: donnerAvis, nb: changerNb, bonjour: bonjour, seed: seed };
    if (!Object.prototype.hasOwnProperty.call(actions, req.action)) throw oups("Action inconnue");
    const extra = actions[req.action](req, par) || {};
    return json(Object.assign(etat(true), extra, { role: qui }));
  } catch (err) {
    console.error(err);
    return json({ error: err && err.pourLaPage ? err.message : "Erreur, réessaie" });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- accès ---------- */

// "appel" (peut tout faire), "groupe" (voir et noter) ou null si la page est fermée ou la clé fausse
function role(k) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("FERME") === "oui" || typeof k !== "string" || !k) return null;
  if (k === props.getProperty(CLE_APPEL)) return "appel";
  if (k === props.getProperty(CLE_GROUPE)) return "groupe";
  return null;
}

function refus() {
  return PropertiesService.getScriptProperties().getProperty("FERME") === "oui" ? "Page fermée" : "Lien invalide";
}

function limiter(par) {
  const cache = CacheService.getScriptCache();
  const minute = Math.floor(Date.now() / 60000);
  [["rl:" + par.toLowerCase() + ":" + minute, PAR_MINUTE_PERSONNE], ["rl:*:" + minute, PAR_MINUTE_TOUS]].forEach(([cle, max]) => {
    const n = Number(cache.get(cle) || 0) + 1;
    if (n > max) throw oups("Trop de requêtes, attends une minute");
    cache.put(cle, String(n), 120);
  });
}

function creerLienDePartage() {
  console.log("Lien des appelants, peut tout faire : " + PAGE + "#k=" + cle(CLE_APPEL));
  console.log("Lien du groupe, voir et noter : " + PAGE + "#k=" + cle(CLE_GROUPE));
}

function changerLienDuGroupe() {
  PropertiesService.getScriptProperties().deleteProperty(CLE_GROUPE);
  creerLienDePartage();
}

function changerLienDePartage() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(CLE_APPEL);
  props.deleteProperty(CLE_GROUPE);
  creerLienDePartage();
}

function cle(nom) {
  const props = PropertiesService.getScriptProperties();
  let valeur = props.getProperty(nom);
  if (!valeur) {
    valeur = Utilities.getUuid().replace(/-/g, "");
    props.setProperty(nom, valeur);
  }
  return valeur;
}

function fermerLaPage() {
  PropertiesService.getScriptProperties().setProperty("FERME", "oui");
}

function rouvrirLaPage() {
  PropertiesService.getScriptProperties().deleteProperty("FERME");
}

/* ---------- lecture ---------- */

function etat(garder) {
  const lieux = lignes(feuille(LIEUX)).map(r => {
    const o = {};
    COLS.forEach(([k], i) => (o[k] = r[i] instanceof Date ? r[i].getTime() : typeof r[i] === "string" ? sansApostrophe(r[i]) : r[i]));
    return o;
  }).filter(o => o.id);
  const avis = lignes(feuille(AVIS)).filter(r => r[0]).map(r => ({ id: String(r[0]), prenom: sansApostrophe(r[1]), note: Number(r[2]) }));
  const journal = lignes(feuille(JOURNAL)).slice(-JOURNAL_ENVOYE)
    .map(r => ({ t: r[0] instanceof Date ? r[0].getTime() : 0, par: sansApostrophe(r[1]), id: String(r[2]), quoi: sansApostrophe(r[4]) }));
  const personnes = lignes(feuille(PERSONNES)).filter(r => r[0]).map(r => sansApostrophe(r[0]));
  const o = { lieux, avis, journal, personnes, nb: nbPersonnes() };
  if (!garder) return o;
  try {
    cacheEcrire(JSON.stringify(o));
  } catch (err) {
    CacheService.getScriptCache().remove(CACHE); // surtout ne pas laisser l'ancienne copie
    console.warn("Cache indisponible, on sert sans cache : " + err);
  }
  return o;
}

// Une valeur de cache est limitée à 100 Ko : la liste, avec les notes de 40 personnes, est coupée en morceaux.
const MORCEAU = 25000; // caractères ; 4 octets au pire chacun
function cacheEcrire(texte) {
  const morceaux = {};
  const n = Math.ceil(texte.length / MORCEAU);
  for (let i = 0; i < n; i++) morceaux[CACHE + i] = texte.slice(i * MORCEAU, (i + 1) * MORCEAU);
  morceaux[CACHE] = String(n);
  CacheService.getScriptCache().putAll(morceaux, 60);
}

function cacheLire() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(CACHE));
  if (!n) return null;
  const cles = Array.from({ length: n }, (_, i) => CACHE + i);
  const morceaux = cache.getAll(cles);
  if (!cles.every(k => morceaux[k] != null)) return null;
  try {
    return JSON.parse(cles.map(k => morceaux[k]).join(""));
  } catch (err) {
    return null; // copie lue pendant qu'une autre s'écrivait : on relira la Sheet
  }
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

function majLieu(req, par) {
  const sh = feuille(LIEUX);
  const row = trouver(sh, req.id);
  const ligne = lireLigne(sh, row);
  const champs = {};
  const faits = [];
  if ("statut" in req) {
    if (!STATUTS.includes(req.statut)) throw oups("Statut inconnu");
    champs.statut = req.statut;
    faits.push("statut : " + req.statut);
    // donner un statut, c'est s'en occuper, sauf si quelqu'un l'a déjà
    if (req.statut !== "À appeler" && !ligne.qui) Object.assign(champs, { qui: par, depuis: new Date() });
  }
  if ("qui" in req) {
    // on ne met que soi-même, et jamais à la place de quelqu'un qui l'a déjà ;
    // libérer reste possible pour tous (quelqu'un peut oublier), et c'est noté au journal
    const tenu = ligne.qui && !memePrenom(ligne.qui, par) ? sansApostrophe(ligne.qui) : "";
    if (req.qui && !memePrenom(req.qui, par)) throw oups("Tu ne peux mettre que ton prénom");
    if (req.qui && tenu) throw oups(tenu + " s'en occupe déjà");
    champs.qui = req.qui ? par : "";
    champs.depuis = req.qui ? new Date() : "";
    faits.push(req.qui ? "prend le lieu" : tenu ? "libère le lieu de " + tenu : "libère le lieu");
  }
  if ("prixNego" in req) {
    champs.prixNego = montant(req.prixNego);
    faits.push(champs.prixNego ? "prix obtenu : " + champs.prixNego + " €" : "efface le prix");
  }
  if ("commentaire" in req) {
    champs.commentaire = texte(req.commentaire, 600);
    faits.push("note : " + (champs.commentaire.replace(/^'/, "").slice(0, 120) || "(effacée)"));
  }
  if (!faits.length) return;
  champs.maj = new Date();
  Object.keys(champs).forEach(k => sh.getRange(row, colonne(k)).setValue(champs[k]));
  faits.forEach(f => noter(par, req.id, ligne.nom, f));
}

// Prendre un lieu avant d'appeler. Le verrou du script rend l'opération atomique :
// si deux personnes touchent « Appeler » en même temps, la seconde est prévenue.
function prendre(req, par) {
  const sh = feuille(LIEUX);
  const row = trouver(sh, req.id);
  const ligne = lireLigne(sh, row);
  if (ligne.qui && !memePrenom(ligne.qui, par)) {
    return { conflit: { qui: sansApostrophe(ligne.qui), depuis: ligne.depuis instanceof Date ? ligne.depuis.getTime() : 0 } };
  }
  if (ligne.qui) return null;
  sh.getRange(row, colonne("qui")).setValue(par);
  sh.getRange(row, colonne("depuis")).setValue(new Date());
  sh.getRange(row, colonne("maj")).setValue(new Date());
  noter(par, req.id, ligne.nom, "prend le lieu");
  return null;
}

function appel(req, par) {
  const sh = feuille(LIEUX);
  const ligne = lireLigne(sh, trouver(sh, req.id));
  noter(par, req.id, ligne.nom, ligne.qui && !memePrenom(ligne.qui, par) ? "appelle aussi" : "appelle");
}

function ajoutLieu(req, par) {
  const nom = texte(req.nom, 80);
  if (!nom) throw oups("Il faut un nom");
  const sh = feuille(LIEUX);
  if (sh.getLastRow() - 1 >= MAX_LIEUX) throw oups("Liste pleine");
  const ligne = {
    id: "u" + Date.now().toString(36),
    nom,
    statut: "À appeler",
    qui: "",
    prix: montant(req.prix),
    prixNego: "",
    couchages: texte(req.couchages, 60),
    fete: "",
    tel: texte(req.tel, 40),
    email: "",
    lien: url(req.lien),
    photo: url(req.photo),
    aAppeler: req.aAppeler === false ? "non" : "oui",
    prio: 2,
    infos: "",
    commentaire: "",
    maj: new Date(),
    depuis: "",
  };
  sh.appendRow(COLS.map(([k]) => ligne[k]));
  noter(par, ligne.id, nom, "ajoute le lieu");
}

// Les notes arrivent par paquets (le mode swipe en envoie plusieurs d'un coup) : une seule écriture
// de l'onglet Avis et une seule ligne au journal, pour tenir quand tout le groupe note en même temps.
// Une note à 0 retire la note.
function donnerAvis(req, par) {
  const liste = (Array.isArray(req.notes) ? req.notes : [{ id: req.id, note: req.note }]).slice(0, MAX_LIEUX);
  const noms = {};
  lignes(feuille(LIEUX)).forEach(r => (noms[String(r[0])] = sansApostrophe(r[1])));
  const av = feuille(AVIS);
  const avant = lignes(av).filter(r => r[0]).map(r => r.slice(0, 4));
  let rows = avant;
  const faites = liste.map(x => {
    const id = String(x && x.id);
    const note = Math.round(Number(x && x.note));
    if (!ID.test(id) || !Object.prototype.hasOwnProperty.call(noms, id)) throw oups("Lieu introuvable");
    if (!(note >= 0 && note <= 5)) throw oups("Note entre 1 et 5");
    rows = rows.filter(r => !(String(r[0]) === id && memePrenom(r[1], par)));
    if (note) rows.push([id, par, note, new Date()]);
    return { id, note };
  });
  if (!faites.length) return;
  if (rows.length > MAX_AVIS) throw oups("Trop d'avis");
  if (rows.length) av.getRange(2, 1, rows.length, 4).setValues(rows);
  const fin = av.getLastRow() - 1;
  if (fin > rows.length) av.getRange(2 + rows.length, 1, fin - rows.length, 4).clearContent();
  if (faites.length > 1) return noter(par, "", "", "note " + faites.length + " lieux");
  const { id, note } = faites[0];
  noter(par, id, noms[id], note ? "note " + note + "/5" : "retire sa note");
}

function changerNb(req, par) {
  const n = Math.round(Number(req.nb));
  if (!(n >= 10 && n <= 80)) throw oups("Entre 10 et 80 personnes");
  feuille(REGLAGES).getRange("B2").setValue(n);
  noter(par, "", "", "passe à " + n + " personnes");
}

function bonjour(req, par) {
  const sh = feuille(PERSONNES);
  const data = lignes(sh);
  const i = data.findIndex(r => memePrenom(r[0], par));
  if (i >= 0) {
    sh.getRange(i + 2, 3).setValue(new Date());
    return;
  }
  if (data.length >= MAX_PERSONNES) return; // liste pleine : on n'ajoute plus personne, sans bloquer la page
  sh.appendRow([par, new Date(), new Date()]);
  noter(par, "", "", "arrive");
}

function seed(req) {
  const sh = feuille(LIEUX);
  if (sh.getLastRow() > 1) return; // déjà rempli : on ne touche à rien
  const rows = (Array.isArray(req.lieux) ? req.lieux : []).slice(0, 150).filter(l => l && ID.test(String(l.id))).map(l => COLS.map(([k]) => {
    if (k === "maj") return new Date();
    if (k === "statut") return "À appeler";
    if (k === "qui" || k === "depuis" || k === "commentaire" || k === "prixNego") return "";
    if (k === "prix" || k === "prio") return montant(l[k]);
    if (k === "lien" || k === "photo") return url(l[k]);
    return texte(l[k], 400);
  }));
  if (rows.length) sh.getRange(2, 1, rows.length, COLS.length).setValues(rows);
}

/* ---------- journal ---------- */

function noter(par, id, nom, quoi) {
  const sh = feuille(JOURNAL);
  sh.appendRow([new Date(), par, String(id || ""), texte(sansApostrophe(nom), 80), texte(quoi, 200)]);
  const trop = sh.getLastRow() - 1 - MAX_JOURNAL;
  if (trop > 0) sh.deleteRows(2, trop); // on garde les 5 000 dernières lignes
}

/* ---------- outils ---------- */

function feuille(nom) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nom);
  if (sh) return sh;
  sh = ss.insertSheet(nom);
  // texte brut partout : un numéro « 0561… » ou une note « 12/05 » restent tels quels
  sh.getRange(1, 1, 1000, nom === LIEUX ? COLS.length : 5).setNumberFormat("@");
  if (nom === LIEUX) {
    ["prix", "prixNego"].forEach(k => sh.getRange(1, colonne(k), 1000, 1).setNumberFormat("#,##0 €"));
    sh.getRange(1, colonne("prio"), 1000, 1).setNumberFormat("0");
    ["maj", "depuis"].forEach(k => sh.getRange(1, colonne(k), 1000, 1).setNumberFormat("dd/mm/yyyy hh:mm"));
    sh.appendRow(COLS.map(c => c[1]));
  } else {
    const dates = { [AVIS]: [4], [JOURNAL]: [1], [PERSONNES]: [2, 3] }[nom] || [];
    dates.forEach(c => sh.getRange(1, c, 6000, 1).setNumberFormat("dd/mm/yyyy hh:mm"));
    if (nom === AVIS) sh.getRange(1, 3, 6000, 1).setNumberFormat("0");
    sh.appendRow(ENTETES[nom]);
    if (nom === REGLAGES) {
      sh.getRange(2, 2).setNumberFormat("0");
      sh.appendRow(["Nombre de personnes", 35]);
    }
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight("bold");
  return sh;
}

function lireLigne(sh, row) {
  const r = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  const o = {};
  COLS.forEach(([k], i) => (o[k] = r[i]));
  return o;
}

function colonne(k) {
  return COLS.findIndex(c => c[0] === k) + 1;
}

function trouver(sh, id) {
  if (!ID.test(String(id))) throw oups("Lieu introuvable");
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  const i = ids.findIndex(r => String(r[0]) === String(id));
  if (i < 0) throw oups("Lieu introuvable");
  return i + 2;
}

function prenom(v) {
  const s = String(v == null ? "" : v).trim();
  if (!PRENOM.test(s)) throw oups("Dis-nous qui tu es");
  return s;
}

function memePrenom(a, b) {
  return sansApostrophe(a).trim().toLowerCase() === sansApostrophe(b).trim().toLowerCase();
}

function sansApostrophe(v) {
  return String(v == null ? "" : v).replace(/^'/, "");
}

function texte(v, max) {
  let s = String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // pas de formule injectée dans la Sheet
  return s;
}

function montant(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 1000000 ? n : "";
}

function url(v) {
  const s = String(v == null ? "" : v).trim().slice(0, 500);
  return /^https:\/\/[^\s"'<>]+$/i.test(s) || /^img\/[\w.-]+$/.test(s) ? s : "";
}

// erreur dont le message peut être montré tel quel sur la page
function oups(message) {
  const e = new Error(message);
  e.pourLaPage = true;
  return e;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
