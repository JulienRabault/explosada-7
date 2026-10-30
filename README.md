# Explosada 7.0, la maison

Page de suivi des lieux pour le réveillon 2026 (31 déc. → 3 janv.).
Les données vivent dans une Google Sheet, la page ne fait que les afficher.

La page ne s'ouvre qu'avec un lien de partage (`…/explosada-7/#k=…`).
Sans clé, la Sheet refuse toute lecture et toute écriture. Il y a deux liens :

- **appelants** : peut tout faire (prendre un lieu, statut, prix, notes, ajouter un lieu) ;
- **groupe** : voit tout et met des étoiles, rien d'autre. La Sheet refuse le reste.

## Brancher la Sheet

1. Créer une Google Sheet dans le dossier Drive « Explosada 7.0 ».
2. Extensions > Apps Script, coller `apps-script/Code.gs`, enregistrer.
3. Choisir `creerLienDePartage` dans la liste des fonctions (en haut de l'éditeur), Exécuter,
   autoriser, puis lire les deux liens dans le journal d'exécution.
4. Déployer > Nouveau déploiement > Application Web.
   Exécuter en tant que : moi. Qui a accès : tout le monde.
5. Copier l'adresse `/exec` dans `config.js` (`API_URL`).

Lien du groupe qui a fuité : exécuter `changerLienDuGroupe` (le lien des appelants ne change pas).
Changer les deux : `changerLienDePartage`.
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

`img/t/` (miniatures 128 px de la liste), `config.js` (adresses), `data.js` (lecture et écriture, mode essai local), `swipe.js` (le mode swipe : à droite 5 étoiles, à gauche 1, en haut on passe), `sky.js` (les feux
d'artifice du titre), `app.js` (l'interface), `seed.json` (les 37 lieux de départ), `verif.json` (la relecture des
annonces du 30/10, affichée dans chaque fiche ; fichier fixe, la Sheet n'y touche pas).
