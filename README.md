# Twin Pics

Retrouver les photos en double et garder la meilleure. Tout se passe **sur l'appareil** : aucune photo n'est
envoyée sur un serveur. Gratuit, sans publicité, open source. En 6 langues (français, anglais, espagnol, allemand,
italien, portugais du Brésil), selon l'appareil ou au choix.

**État : appli PC** (version 0.4, 22/11/2026) : un exe pour Windows qui trouve les groupes de doublons d'un dossier
et les photos inutiles (floues, ratées, captures d'écran, documents…),
les fait trier (garder une photo, plusieurs ou aucune) et supprime ce qui doit l'être, après un récapitulatif. Le
site web reste là pour essayer (il trouve et trie, il ne supprime pas). L'appli Android viendra ensuite.

## Ce qu'il trouve

| Niveau | Exemple | Comment |
|---|---|---|
| **Copies exactes** | le même fichier deux fois, copie WhatsApp identique | empreinte SHA-256 (seulement pour les fichiers de même taille) |
| **Quasi identiques** | même photo redimensionnée, recompressée, un peu retouchée | empreinte perceptuelle dHash (64 bits), cherchée partout |
| **Similaires** | rafale, même scène prise plusieurs fois | modèle DINOv2-small exécuté dans le navigateur (sur la carte graphique si possible), seulement entre photos prises à quelques minutes d'écart (date EXIF) |

**Photos inutiles** (onglet « Inutiles ») : floues, trop sombres, trop claires, presque vides (prises dans la poche),
captures d'écran (règles simples, sans modèle) ; documents, tickets et factures, mèmes et dessins, photos prises par
erreur (modèle MobileCLIP, option). Chaque photo dit pourquoi ; celles qui se ressemblent sont **regroupées, quelle que
soit leur date**, pour en trier beaucoup d'un coup. Une photo déjà dans un groupe de doublons n'y est pas.

Pour chaque groupe de doublons, une **suggestion** : l'originale (pas la copie WhatsApp), la plus grande, ou la plus nette. Des
curseurs règlent les seuils en direct, et chaque groupe peut être marqué « Bien trouvé » ou « Pas des doublons » :
ces réponses serviront à choisir les meilleurs réglages.

## Utilisation

1. **Appli PC** : télécharger `Twin.Pics.0.4.0.exe` dans les
   [*Releases*](https://github.com/DavidDZA/twin-pics/releases/latest) (rien à installer). Windows peut afficher
   « Windows a protégé votre ordinateur » (appli non signée) : *Informations complémentaires → Exécuter quand même*.
   Sur le PC de développement, chaque version est aussi construite dans le dossier `release/` du projet
   (`release/Twin Pics 0.4.0.exe`, hors du dépôt).
   Pour essayer sans rien installer : le [site](https://daviddza.github.io/twin-pics/), dans Chrome ou Edge.
2. « Choisir un dossier de photos » (sous-dossiers compris). La première analyse lit toutes les photos ; les suivantes
   ne relisent que les nouvelles (« Reprendre » rouvre le dernier dossier). Les photos HEIC (iPhone) et les vidéos ne
   sont pas encore analysées. Sur un disque dur, la vitesse du disque fixe la durée (environ 15 min pour 56 Go).
3. **Trier les doublons**, groupe par groupe. Par défaut on ne garde que la suggestion ; on peut en garder plusieurs,
   ou aucune. Deux façons, au choix (bouton « Affichage ») :
   - **Grille** (PC) : tout le groupe à l'écran ; un clic sur une photo la garde ou la supprime (touches 1 à 9,
     Entrée pour valider) ; « Garder la suggestion », « Tout garder », « Tout supprimer », « Passer » ;
   - **Duels** (téléphone) : deux photos à la fois, on touche celle qu'on préfère, la gagnante affronte la suivante ;
     à la fin, le résumé du groupe permet d'en garder d'autres avant de valider. Un groupe de deux photos va
     directement au résumé. En paysage, les deux photos sont côte à côte.
   Pour les photos inutiles, **Grille** ou **Swipe** : une carte à la fois (une photo, ou tout un groupe de photos
   semblables), glissée à gauche « Je jette » ou à droite « Je garde » (ou les deux boutons, ou les flèches du
   clavier). Par défaut, tout est à jeter.
   Chaque photo a un bouton **« Plein écran »** ; en plein écran, les flèches à gauche et à droite (ou le clavier, ou
   glisser le doigt) passent aux autres photos du groupe.
   Le tri est retenu, même si on ferme l'appli.
4. **Supprimer n photos** : une fenêtre récapitule, groupe par groupe, ce qui est gardé et supprimé (et prévient si un
   groupe n'en garde aucune). Les photos vont, au choix, dans la **Corbeille de Windows** ou dans un **dossier « À
   supprimer »** (rangées avec leurs sous-dossiers, annulable juste après). Sur un disque sans Corbeille (clé USB),
   l'appli ne touche à rien et le dit.

## Développement

```sh
npm install
npm run dev      # le site, http://localhost:5173
npm run dev:pc   # l'appli PC (Electron), interface rechargée à chaud
npm run build    # le site (dist/) et le processus principal de l'appli PC (dist-electron/)
npm run pc       # construire puis lancer l'appli PC
npm run dist     # exe portable → release/Twin Pics <version>.exe
npm test         # tests automatiques (Vitest), aussi lancés avant chaque déploiement
npm run e2e      # tests de bout en bout du site (Playwright, Chrome installé, formats téléphone et PC)
npm run e2e:pc   # tests de bout en bout de l'appli PC (vraie appli Electron)
npm run e2e:exe  # les mêmes, sur l'exe construit par npm run dist
E2E_MODELE=1 npm run e2e   # avec les tests des photos similaires (télécharge le modèle) ; marche aussi avec e2e:pc
npm run icon     # refaire l'icône de l'exe (build/) depuis public/favicon.svg
node tools/vitesse/mesure.mjs [dossier]   # banc de mesure de vitesse (décodage, modèle processeur / carte graphique)
node tools/inutiles/calibrer.mjs --phrases          # vecteurs des phrases de MobileCLIP → src/lib/junkPrompts.json
node tools/inutiles/calibrer.mjs [dossier] [nombre] # photos inutiles trouvées dans un dossier (seuils), test-results/
node tools/inutiles/planche.mjs <raison>            # planche contact des photos retenues par une raison
```

Stack : Vite, React, TypeScript, Dexie (IndexedDB), exifr, Transformers.js (ONNX Runtime Web), Electron et
electron-builder (appli PC), Vitest, Playwright. Toutes les dépendances sont des `devDependencies` : l'interface est
empaquetée par Vite, l'exe n'embarque aucun `node_modules`.

Fonctionnement détaillé : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Suite du projet : [docs/ROADMAP.md](docs/ROADMAP.md).

## Déploiement

- **Site** : chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/deploy.yml`
  (Settings → Pages → Source : **GitHub Actions**).
- **Appli PC** : à chaque push sur `main` avec une **nouvelle version** dans `package.json`, `.github/workflows/release.yml`
  teste, construit l'exe sous Windows et crée la release `vX.Y.Z` (Actions → Appli PC → Run workflow pour la
  reconstruire). Chaque nouvelle version est aussi construite en local (`npm run dist` → `release/`), puis vérifiée
  par `npm run e2e:exe`.

## Licence

[MIT](LICENSE) © 2026 Super Bobiz. Modèle DINOv2 (Meta) : licence Apache 2.0.
