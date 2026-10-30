# Explosada 7.0, la maison

Page de suivi des lieux pour le réveillon 2026 (31 déc. → 3 janv.).
Les données vivent dans une Google Sheet, la page ne fait que les afficher.

La page ne s'ouvre qu'avec le lien de partage (`…/explosada-7/#k=…`).
Sans la clé, la Sheet refuse toute lecture et toute écriture.

## Brancher la Sheet

1. Créer une Google Sheet dans le dossier Drive « Explosada 7.0 ».
2. Extensions > Apps Script, coller `apps-script/Code.gs`, enregistrer.
3. Exécuter `creerLienDePartage`, autoriser, lire le lien dans le journal d'exécution.
4. Déployer > Nouveau déploiement > Application Web.
   Exécuter en tant que : moi. Qui a accès : tout le monde.
5. Copier l'adresse `/exec` dans `config.js` (`API_URL`).

Lien qui a fuité : exécuter `changerLienDePartage`, puis repartager le nouveau lien.
Couper l'accès à tout le monde d'un coup : `fermerLaPage` (et `rouvrirLaPage`).

## Mettre à jour le script

Coller le nouveau `Code.gs`, enregistrer, puis Déployer > Gérer les déploiements >
crayon > Version : Nouvelle version > Déployer. L'adresse `/exec` et la clé ne changent pas.

## Ce que la Sheet garde

- Lieux : statut, qui s'en occupe et depuis quand (`Pris le`).
- Journal : chaque geste daté, avec le prénom (appelle, prend le lieu, statut, prix, note…).
- Personnes : première et dernière visite de chacun.
- Deux personnes qui touchent « Appeler » en même temps : la Sheet donne le lieu à la première,
  la seconde est prévenue et peut renoncer ou appeler quand même (noté « appelle aussi »).

## Fichiers

`config.js` (adresses), `data.js` (lecture et écriture, mode essai local), `app.js` (l'interface), `seed.json` (les 37 lieux de départ), `verif.json` (la relecture des
annonces du 30/10, affichée dans chaque fiche ; fichier fixe, la Sheet n'y touche pas).
