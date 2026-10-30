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
