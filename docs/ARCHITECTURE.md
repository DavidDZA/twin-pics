# Architecture — comment marche Twin Pics

> **À lire en premier par toute nouvelle session de travail.** État au 22/11/2026 (version 0.3.1 : appli PC en exe,
> tri en grille ou en duels, suppression après récapitulatif, § 2.1 et § 4 ; habillage plus « fun », § 2.2). Ce qui reste à faire est dans
> [ROADMAP.md](ROADMAP.md). L'histoire du projet (pourquoi cette appli, sources des photos,
> choix) est dans `DavidDZA\IDEES-APPLIS.md`, idée 1.

## 1. L'appli

On choisit un dossier de photos, l'appli trouve les groupes de doublons, propose la photo à garder, fait trier
chaque groupe et supprime ce qui doit l'être après un récapitulatif. **Rien ne quitte l'ordinateur** : les photos sont
lues et analysées sur place ; seul le modèle des photos similaires est téléchargé (une fois).

Une seule interface (React), sous trois formes (`src/platform/`) :

- **Appli PC** (Windows, exe portable, Electron, § 2.1) : la vraie appli. Elle seule supprime des photos.
- **Site** (GitHub Pages, Chrome ou Edge) : pour essayer. Il trouve et trie ; la fenêtre « Avant de supprimer » y
  explique que la suppression se fait dans l'appli PC (lien vers les *Releases*).
- **Android** (Capacitor) : à venir (ROADMAP § 5).

Trois écrans (`App.tsx`) :

- **Départ** (`StartScreen`) : « Choisir un dossier de photos », « Reprendre « dossier » » (le dernier dossier : son
  chemin dans l'appli PC, son accès File System Access API sur le site), case « Chercher aussi les photos
  similaires » (retenue : `opt-similar`, localStorage). Sur le site, une ligne renvoie vers l'appli PC.
- **Analyse** (`ScanScreen`) : étape en cours, barre de progression, temps restant estimé, « Arrêter ».
- **Résultats** (`Results`) : 4 cases (photos analysées, groupes, photos en trop, place récupérable), barre de tri
  (« Triés : n groupes sur N », « Trier les doublons » / « Continuer le tri », « Supprimer n photos (taille)… »),
  compte rendu de la dernière suppression, ce qui n'a pas été analysé, réglages de la détection (`SettingsPanel`,
  curseurs, retenus : `detect-params`), onglets par niveau, groupes (`GroupCard`, 30 puis « Voir plus » : état du tri
  photo par photo, « Trier ce groupe » / « Modifier le tri », « Bien trouvé » / « Pas des doublons »), visionneuse
  (`Viewer` : le fichier d'origine en plein écran ; pour passer aux autres photos du groupe, grandes flèches à gauche
  et à droite de la photo, flèches du clavier ou glisser le doigt ; Échap ferme ; pendant le tri, le choix « Gardée » /
  « À supprimer » de la photo).
- Par-dessus les résultats : l'**écran de tri** (`Sorter`, plein écran) et la fenêtre **« Avant de supprimer »**
  (`RemoveDialog`), § 4.

## 2. Technique

| Élément | Choix |
|---|---|
| Front | Vite, React 19, TypeScript ; CSS `src/styles.css` (base, thème clair / sombre selon l'appareil), `src/sort.css` (tri, suppression), `src/theme.css` (habillage, § 2.2) |
| Appli PC | **Electron** 45 (`electron/`, construit par esbuild), exe portable par **electron-builder** (`npm run dist`, workflow `release.yml`) : § 2.1 |
| Base locale | IndexedDB via **Dexie** (`src/lib/db.ts`), base `twin-pics` : `photos`, `thumbs`, `labels`, `meta`, `marks` |
| Lecture du dossier | Appli PC : le processus principal liste le dossier (`electron/list.ts`), la page lit chaque photo par `app://twin-pics/_photo/…`. Site : **File System Access API** (`showDirectoryPicker`, Chrome / Edge), sinon champ `webkitdirectory` (`files.ts`) |
| Analyse | fichiers lus par la page (2 à la fois), analysés dans des workers (`analyze.worker.ts`), un par cœur moins un (6 au plus) ; EXIF par **exifr** |
| Photos similaires | **Transformers.js** + ONNX Runtime Web, modèle `onnx-community/dinov2-small` : carte graphique (WebGPU, `fp16`, 44 Mo), sinon processeur (WebAssembly, `q8`, 24 Mo) |
| Hébergement | Site : **GitHub Pages** (`https://daviddza.github.io/twin-pics/`), déployé à chaque push sur `main`. Appli PC : *Releases* GitHub, une par version de `package.json` |
| Tests | **Vitest** (`tests/`, Node : empreintes, regroupement, tri, liste et suppression de l'appli PC sur un vrai dossier temporaire, traductions) ; **Playwright** (`e2e/` : le site, Chrome installé, téléphone et PC ; `e2e-pc/` : la vraie appli Electron ou l'exe) |

```
electron/            appli PC (processus principal, Node) : construit en dist-electron/ par scripts/build-electron.mjs
  main.ts              fenêtre, protocole app://twin-pics/, échanges avec l'interface (IPC)
  preload.ts           window.twinPics (types : src/platform/bridge.ts)
  list.ts              liste d'un dossier ; remove.ts : Corbeille, dossier « À supprimer », annulation ; paths.ts
src/
  App.tsx            les trois écrans, lancement de l'analyse
  platform/          site ou appli PC : index.ts (desktop, liste, réglages de suppression), bridge.ts (window.twinPics)
  lib/
    files.ts           une photo trouvée (FoundFile), lecture du dossier sur le site
    filetypes.ts       types de fichiers, dossiers ignorés (partagé avec electron/)
    choices.ts         le tri : garder / supprimer, photos à supprimer, duels (code pur)
    display.ts         chemins affichés à partir du dossier analysé
    scan.ts            l'analyse de bout en bout (base, lecture, workers, modèle, paires)
    pool.ts            limiter les tâches simultanées (Limiter), faire travailler des workers (WorkerPool)
    analyze.worker.ts  une photo : EXIF, décodage, dHash, netteté, miniature, SHA-256, entrée du modèle
    embed.worker.ts    le modèle des photos similaires (vecteur de 384 nombres par photo)
    pairs.worker.ts    paires candidates (findPairs) hors de l'interface
    imagehash.ts       dHash, Hamming, netteté, cosinus : code pur, testé sous Node
    groups.ts          paires candidates, groupes, suggestion : code pur
    db.ts model.ts messages.ts
  components/        écrans et briques (GroupCard, Sorter, RemoveDialog, SettingsPanel, Viewer, PhotoImage…)
  i18n/              un dictionnaire par langue (fr.ts en référence)
tests/  e2e/  e2e-pc/  Vitest, Playwright site, Playwright appli PC (e2e/photos.ts génère le dossier d'essai)
scripts/             construction et lancement de l'appli PC, icône (build/icon.ico, depuis public/favicon.svg)
tools/vitesse/       banc de mesure de vitesse (décodage, modèle sur processeur ou carte graphique), § 3.5
```

### 2.1 Appli PC (Electron)

Décidée le 22/11/2026 : un exe plutôt qu'un site, pour un vrai accès au disque (Corbeille de Windows, dossier
« À supprimer », pas de permission à redonner à chaque lancement). Même modèle que My Concert Setlists : exe
**portable** (rien à installer, non signé), construit et publié par GitHub Actions.

- **L'interface est le site construit** (`dist/`), servie par le protocole `app://twin-pics/` (`protocol.handle`,
  schéma déclaré `standard` et `secure`) : une origine stable où marchent IndexedDB, les workers en module, le cache
  du modèle (Cache Storage) et la carte graphique (WebGPU, vérifié : « calculées par la carte graphique »). En
  développement (`npm run dev:pc`), elle vient de Vite (`VITE_DEV_URL`).
- **Photos** : `app://twin-pics/_photo/<chemin>` ; le processus principal ne sert que les fichiers des dossiers
  choisis pendant la session (`roots`). Les chemins sont complets, avec des « / » (`F:/Photos/a.jpg`) ; ils servent
  aussi de clé (`photoKey`). Affichés à partir du dossier analysé (`display.ts`), complets dans l'infobulle.
- **Pont** (`preload.ts`, `contextIsolation`, `sandbox`) : `window.twinPics` = choisir un dossier, dernier dossier
  (`reglages.json` dans le dossier de l'appli), lister, choisir le dossier « À supprimer », supprimer, annuler, ouvrir
  l'Explorateur, ouvrir un lien. Les liens `target="_blank"` s'ouvrent dans le navigateur.
- **Une seule fenêtre** (`requestSingleInstanceLock`) : deux appli ouvertes se disputeraient la base locale.
- **Paquet** : toutes les dépendances sont des `devDependencies` (l'interface est empaquetée par Vite) : l'exe
  n'embarque aucun `node_modules` (≈ 110 Mo, Electron compris).
- Variables d'environnement des tests : `TP_USER_DATA` (dossier de l'appli), `TP_PICK_FOLDER` /
  `TP_PICK_REMOVE_FOLDER` (réponses des fenêtres de choix de dossier), `TP_FAKE_TRASH` (dossier qui remplace la
  Corbeille), `TP_FAKE_TRASH_FAIL` (Corbeille refusée, comme sur une clé USB).

### 2.2 Habillage (`theme.css`)

Demandé le 22/11/2026 : « un peu plus fun ». Chargé en dernier, il ne change que l'apparence : les couleurs du logo
(bleu `--brand-a`, orange `--brand-b`) en dégradé (`--brand`) pour les boutons principaux, les onglets choisis, les
titres et les chiffres ; deux halos de couleur en fond ; boutons arrondis qui réagissent au survol et au clic ; cartes
douces avec ombre ; un emoji décoratif par case de chiffres (📸 👯 🗂️ 💾, ignorés par les lecteurs d'écran) ;
**logo animé** (`TwinCards` : deux photos jumelles qui se rejoignent au départ, se mélangent pendant l'analyse) ;
barre de progression du tri ; « VS » entre les deux photos d'un duel ; 🎉 à la fin du tri et après une suppression.
Toutes les animations s'arrêtent si le système demande moins de mouvement (`prefers-reduced-motion`).

## 3. L'analyse (`scan.ts`)

**Chaque photo n'est lue qu'une fois sur le disque** (21/11/2026). La version 0.1 relisait toutes les photos pour le
modèle : sur un disque dur (60 à 150 Mo/s), 10 000 photos (56 Go) prenaient 15 min d'analyse puis 50 min de photos
similaires (§ 3.5).

```
lecture (la page, 2 fichiers à la fois) → analyse (workers) → modèle (carte graphique, ou 2 workers processeur)
```

1. **Liste** des photos (sous-dossiers compris ; corbeilles et dossiers système ignorés). Images lues : jpg, jpeg,
   png, webp, gif, bmp, avif. HEIC / HEIF (iPhone) et vidéos comptées à part : Chrome ne sait pas ouvrir le HEIC.
2. **Reprise** : chaque photo a une clé `chemin + taille + date de modification` (`photoKey`) ; une photo déjà en base
   n'est pas réanalysée. Relancer l'analyse d'un dossier déjà vu prend quelques secondes.
3. **Le modèle se charge** (photos similaires cochées) pendant que l'analyse commence. S'il n'est pas prêt à la fin de
   l'analyse (premier téléchargement), la progression montre son téléchargement.
4. **Lecture** : la page lit le fichier (`file.arrayBuffer()`), **2 à la fois au plus** (`READS_AT_ONCE` : un disque
   dur ralentit s'il saute d'un fichier à l'autre), et le transfère au worker (sans copie). Au plus « workers + 4 »
   photos en mémoire à la fois.
5. **Analyse** dans les workers (`analyze.worker.ts`, un par cœur moins un, 6 au plus) :
   - date de prise de vue (`DateTimeOriginal`, sinon `CreateDate`) et appareil (EXIF) ;
   - décodage avec l'orientation EXIF ; petite version de 256 px → **dHash** ; version de 1024 px → **netteté** ;
   - **miniature** JPEG de 200 px (table `thumbs`) ;
   - **SHA-256** seulement si un autre fichier a la même taille (deux copies exactes ont forcément la même) ;
   - **entrée du modèle** (petit côté de 256 px) si la photo est **datée** et les photos similaires demandées.
   Une photo illisible garde `error: 'decode'`.
6. **Modèle**, au fil de l'analyse : chaque entrée part aussitôt dans le modèle (`embed.worker.ts`). Au plus 64 entrées
   en attente (`MODEL_QUEUE`, ≈ 350 Ko chacune) : au-delà, l'analyse attend le modèle. Toutes les photos datées passent
   dans le modèle (on ne sait qu'à la fin lesquelles ont une voisine dans le temps ; sur la carte graphique, ça ne coûte
   presque rien).
7. **Photos déjà analysées sans vecteur de ce modèle** (première analyse sans les photos similaires, ou autre version
   du modèle) : relues, seulement celles qui ont une voisine à moins de 30 min (`needsVector`), en mode `pixels`
   (décodage seul).
8. **Paires candidates** (`findPairs`, dans `pairs.worker.ts`) avec les seuils les plus larges des curseurs
   (`LIMITS`) ; ensuite, chaque mouvement de curseur ne fait que `buildGroups` sur ces paires : instantané.

« Arrêter » arrête tous les workers (`WorkerPool.terminate`) ; ce qui a été analysé est déjà en base.

### 3.1 Empreintes (`imagehash.ts`)

- **dHash** : image en niveaux de gris réduite à 9 × 8 (moyenne des surfaces), chaque bit dit si une case est plus
  claire que sa voisine de droite. Insensible au redimensionnement, à la recompression, aux petites retouches.
  Distance = nombre de bits différents (Hamming). Les images presque uniformes (≤ 4 ou ≥ 60 bits à 1 : photos noires,
  ciel uni) ne sont jamais rapprochées par leur dHash, seulement par leur SHA-256.
- **Netteté** : variance du laplacien **rapportée au contraste** (variance des niveaux de gris), sur une version de
  1024 px. Mesurée d'abord sur la version de 256 px, elle jugeait plus nette une photo légèrement floue mais plus
  claire (photos d'essai, 20/11) : à 256 px un léger flou disparaît, et la variance du laplacien grandit avec le
  contraste. Ne se compare qu'entre photos d'un même groupe.

### 3.2 Modèle des photos similaires (`embed.worker.ts`, `model.ts`)

DINOv2-small (Meta, Apache 2.0) : bon pour reconnaître « la même scène », mieux que CLIP qui rapproche plutôt « le même
sujet ». Vecteur = jeton CLS (384 nombres), normalisé ; ressemblance = cosinus. Entrée : petit côté de 256 px (le
modèle garde le carré central de 224 px). Téléchargé depuis Hugging Face et gardé par le navigateur (Cache Storage) ;
le moteur WebAssembly d'ONNX Runtime (27 Mo) est servi par le site lui-même.

- **Carte graphique** (WebGPU) si elle calcule en demi-précision (`shader-f16`) : version `fp16` (44 Mo), un worker.
- Sinon **processeur** (WebAssembly) : version `q8` (24 Mo), deux workers. `localStorage['model-device'] = 'wasm'`
  force le processeur (tests, dépannage).
- Un vecteur garde le nom de sa version (`embModel` = `embedId(dtype)`) : changer de version le fait recalculer.
  Les deux versions donnent presque les mêmes ressemblances (écart de 0,035 au plus, § 3.5), mais les seuils sont à
  régler sur la version de la carte graphique.
- Les résultats disent où le modèle a tourné (« calculées par la carte graphique / le processeur »).

Mesures du 20/11 (Node, q8, fonds d'écran de Windows et variantes) : même image décalée de 6 % ou retouchée 0,91 à
0,98 ; images différentes 0,56 à 0,72 ; deux fonds d'écran du même thème (même composition, autres couleurs) 0,98.
Rafale d'essai (cadrage décalé de 14 %, plus claire, floue) : 0,877.

### 3.3 Groupes (`groups.ts`)

- **Copies exactes** et **quasi identiques** (dHash ≤ `nearMax`, 8 par défaut) : reliées directement, cherchées
  partout, quelle que soit la date.
- **Similaires** (cosinus ≥ `simMin`, 0,90 par défaut, et écart de prise de vue ≤ `windowMin`, 10 min par défaut) :
  des paires les plus ressemblantes aux moins ressemblantes, avec un **garde-fou contre les chaînes** : deux groupes ne
  fusionnent que si toutes leurs photos se ressemblent au moins à `simMin − 0,05` (`CHAIN_SLACK`). Sans lui, A
  ressemble à B, B à C… et le groupe réunit des photos sans rapport.
- Nature du groupe : « copies exactes » si tous les fichiers sont identiques, « similaires » si un lien « similaire » a
  servi, sinon « quasi identiques ».
- **Suggestion** (`suggestBest`) : copies exactes → l'originale (pas dans un dossier WhatsApp, Telegram,
  téléchargements, pas de « (1) » ni « Copie » dans le nom ; puis la plus ancienne, puis le chemin le plus court) ;
  quasi identiques → la plus grande définition, puis le plus gros fichier ; similaires → la plus nette.
- Groupes triés par date ; dans un groupe, la suggestion d'abord, puis par date. Identifiant stable (`groupId`) :
  empreinte des clés des photos, pour retrouver les réponses « Bien trouvé » / « Pas des doublons ».
- Sous chaque photo, sa ressemblance avec la suggestion : « identique », « n bits d'écart » ou « ressemble à n % ».

### 3.4 Base locale (`db.ts`)

- `photos` : une ligne par fichier (clé, chemin, taille, date de modification, SHA-256, dHash, netteté, dimensions,
  date EXIF, appareil, erreur, vecteur et nom du modèle).
- `thumbs` : miniatures (≈ 10 Ko chacune ; à surveiller pour 50 000 photos : ROADMAP).
- `labels` : réponses sur les groupes (`groupId`, verdict `good` / `wrong`, nature, clés des photos, réglages du moment).
- `meta` : `folder` (site : accès au dernier dossier, gardé par Chrome ; redemandé au clic sur « Reprendre »).
- `marks` (version 2 de la base) : le tri, photo par photo (`key`, `mark` = `keep` / `remove`, `groupId`, date), § 4.

### 3.5 Vitesse (21/11/2026)

Premier essai de l'utilisateur (version 0.1) : 10 000 photos, 56 Go, sur un **disque dur** : 15 min d'analyse, puis
50 min de photos similaires. Banc de mesure `node tools/vitesse/mesure.mjs [dossier]` (Chrome installé, 30 photos de
12 Mpx générées si aucun dossier), sur le PC de l'utilisateur (Ryzen 5 5600G, 12 fils ; carte NVIDIA) :

| Étape | Par photo |
|---|---|
| Décodage d'une photo de 12 Mpx | 110 à 122 ms (87 à 101 ms en la décodant directement réduite) |
| Modèle, processeur `q8`, 1 worker | 278 à 286 ms |
| Modèle, processeur `q8`, 4 workers | 105 à 140 ms |
| Modèle, carte graphique `fp32` / `fp16` | 34 / 29 à 31 ms (chargement 7 à 16 s, une fois) |
| Modèle, carte graphique `q8` | 351 ms (à éviter) |

Accord avec le processeur `q8` : vecteurs d'une même photo à 0,984 au moins, ressemblances entre photos à 0,035 près.

Appli entière, 60 photos datées de 12 Mpx sur SSD : **372 ms par photo en version 0.1, 93 ms en 0.2** (4 fois plus
rapide). Sur un disque dur, la lecture des fichiers devient la limite (56 Go à ≈ 60 Mo/s ≈ 15 min), lue une seule
fois au lieu de deux.

## 4. Tri et suppression

Demandé le 22/11/2026 : deux façons de trier, une pour le PC (plus de place) et une pour le téléphone, avec un bouton
pour passer de l'une à l'autre ; garder une photo (cas de base), plusieurs, ou aucune ; un récapitulatif avant de
supprimer ; les suppressions faites à la fin, en une fois.

### 4.1 Le tri (`Sorter`, `choices.ts`)

- **Plein écran**, groupe par groupe : « Groupe i sur N », nature, nombre de photos, date, « n gardées, n à supprimer ».
  Bouton **« Affichage : Grille | Duels »** (retenu : `sort-view` ; par défaut, duels si l'écran est tactile ou petit,
  grille sinon). « Retour aux groupes » ferme.
- **Grille** : tout le groupe à l'écran, aussi grand que possible (2 colonnes jusqu'à 4 photos, 3 jusqu'à 9, puis 4 ;
  les lignes se partagent la hauteur), la suggestion gardée et les autres à supprimer (`suggestionOnly`). Un clic sur
  une photo change son choix (cadre vert plein « ✓ Gardée » / rouge pointillé « ✕ À supprimer », photo pâlie) ;
  touches 1 à 9 et Entrée ; **« Plein écran »**, posé sur chaque photo (sous la photo au téléphone, en grille), ouvre
  la visionneuse (où le choix se change aussi). Boutons « Garder la
  suggestion », « Tout garder », « Tout supprimer » (avertissement « Aucune photo gardée »), « ‹ Précédent »,
  « Passer », « Valider › ». Les photos d'origine sont affichées jusqu'à 12 par groupe, les miniatures au-delà
  (`PhotoImage` : la miniature d'abord, puis le fichier).
- **Duels** (« duel simple + résumé », choix de l'utilisateur) : la suggestion affronte la photo suivante, on touche la
  préférée, la gagnante affronte la suivante (`startDuel`, `pickWinner`) ; à la fin, le **résumé** du groupe est la
  grille, avec seulement la gagnante gardée (`onlyKeep`) : c'est là qu'on en garde plusieurs ou aucune, ou « Refaire
  les duels ». Un groupe déjà trié s'ouvre directement sur son résumé, **un groupe de deux photos aussi** (le duel
  n'apporterait rien de plus, remarque de l'utilisateur le 22/11). « Plein écran » sur chaque photo du duel.
- **Téléphone en paysage** : les deux photos du duel côte à côte, barres compactes, consigne masquée ; le résumé défile
  et « Valider » reste collé en bas (aussi en portrait).
- **Retenu** : « Valider » enregistre le choix de chaque photo (`marks`) et passe au groupe suivant **non trié**.
  « Passer » ne retient rien ; en fin de liste, « Revoir les groupes passés ». Un groupe est trié quand toutes ses
  photos le sont (`isSorted`) : si les réglages changent et qu'il gagne une photo, il redevient à trier (ses choix
  restent proposés, `initialChoice`).

### 4.2 La suppression (`RemoveDialog`, `electron/remove.ts`)

- **Ce qui est supprimé** (`pendingRemoval`) : les photos « à supprimer » des groupes **triés** du moment. Une photo
  marquée qui n'est plus dans aucun groupe (réglages changés) n'est jamais touchée.
- **« Avant de supprimer »** : « n photos à supprimer (taille), n gardées, dans n groupes », avertissement si des
  groupes ne gardent aucune photo, la liste des groupes (miniatures « Gardée » / « À supprimer », noms au clic ; 60
  groupes puis « et n autres groupes »), **« Où vont les photos supprimées »** (liste : Corbeille de Windows ou
  dossier « À supprimer », retenu : `remove-mode`, `remove-folder`), « Annuler » / « Supprimer n photos ».
- **Corbeille de Windows** (`shell.trashItem`) : sur un disque sans Corbeille (clé USB), Electron refuse au lieu
  d'effacer : la photo n'est pas touchée et le compte rendu conseille le dossier « À supprimer ».
- **Dossier « À supprimer »** : par défaut `<dossier analysé>/Twin Pics - À supprimer` (nom traduit, toujours
  commencé par `Twin Pics - ` : jamais analysé, `isSkippedDir`), ou un dossier choisi (« Changer… », exclu de
  l'analyse). Les photos y gardent leurs sous-dossiers, jamais par-dessus un fichier (« plage (2).jpg ») ; d'un disque
  à l'autre, copie puis effacement. **« Annuler »** juste après les remet à leur place.
- Envoi par paquets de 20 (progression « Suppression… n / N ») ; le processus principal refuse tout fichier hors du
  dossier analysé. Ensuite : compte rendu (« n photos supprimées, taille libérée », où elles sont, échecs), les photos
  disparaissent des groupes (`gone`) et leurs choix sont effacés. Les lignes de `photos` restent (une photo remise à
  sa place garde la même clé).

## 5. Traduction

6 langues, ton familier. Langue de l'appareil si elle est traduite, sinon l'anglais ; choix en bas de page
(`app-lang`, localStorage), qui recharge la page. Dictionnaires `src/i18n/*.ts` typés sur `fr.ts` : la compilation
échoue s'il manque un texte. `tests/i18n.test.ts` : mêmes clés, aucun texte vide, aucun texte resté en français (sauf
les mots qui s'écrivent pareil, listés dans le test), pas d'espace avant « : ! ? ; » hors du français. Tailles et
durées par `Intl` (`bytes`, `duration`).

## 6. Tests

- `npx tsc -b`, `npm test`, `npm run build`, `npm run e2e`, `npm run e2e:pc` avant chaque push ; le déploiement et la
  construction de l'exe relancent `npm test`. Après `npm run dist`, `npm run e2e:exe` passe les tests sur l'exe.
- **Vitest** : empreintes sur des images générées par sharp (`tests/images.ts` : même calcul que le worker, sous
  Node) — copie réduite et recompressée ≤ 4 bits, éclaircie ≤ 6 bits, photos différentes > 16 bits, photo floue (même
  plus claire) moins nette ; regroupement (copies exactes et suggestion de l'originale, quasi identiques selon le
  réglage, images uniformes écartées, similaires selon la ressemblance et l'écart de temps, garde-fou contre les
  chaînes, photos sans date jamais similaires, ordre et identifiant des groupes, photos qui ont besoin du modèle) ;
  traductions (dont : le dossier « À supprimer » n'est jamais analysé, dans toutes les langues).
- **Tri** (`choices.test.ts`) : suggestion seule par défaut, en garder plusieurs ou aucune, groupe trié ou non, choix
  repris, photos à supprimer et place libérée, « tout supprimer » signalé, photo marquée hors groupe jamais supprimée,
  duels (la gagnante affronte la suivante, groupe de deux photos).
- **Appli PC** (`pc.test.ts`, vrai dossier temporaire) : liste (sous-dossiers, HEIC et vidéos comptés, corbeilles et
  dossier « À supprimer » ignorés), chemins (« .. » refusé), Corbeille (refus = photo intacte), dossier « À supprimer »
  (sous-dossiers, pas d'écrasement, annulation), photo hors du dossier ou disparue, noms libres.
- **Outils de parallélisme** (`pool.test.ts`) : jamais plus de tâches simultanées que permis, place libérée après un
  échec, file d'attente du modèle qui bloque l'analyse quand elle est pleine ; une demande à la fois par worker, chaque
  réponse à sa demande, erreur limitée à sa demande, « Arrêter » qui annule tout.
- **Playwright** (`npm run e2e`) : dossier d'essai généré (`e2e/photos.ts` : copies exactes, copie WhatsApp, version
  réduite, rafale floue, photo cassée, HEIC, vidéo), lu par le champ `webkitdirectory` (la fenêtre de choix de dossier
  ne s'automatise pas). Parcours : écran de départ, groupes trouvés et suggestions, photos non analysées, curseurs,
  « Bien trouvé » retenu et seconde analyse sans rien refaire, visionneuse, miniatures, pas de défilement horizontal,
  anglais. Avec `E2E_MODELE=1` (télécharge le modèle) : rafale trouvée pendant l'analyse, la plus nette proposée, et
où a tourné le modèle affiché ; même chose sur le processeur forcé ; photos similaires demandées après une analyse
sans elles (photos déjà vues complétées).
- **Playwright, visionneuse** (`e2e/parcours.spec.ts`) : flèches à gauche et à droite de la photo, clavier ; au
  téléphone, glisser le doigt.
- **Playwright, tri sur le site** (`e2e/tri.spec.ts`, téléphone et PC) : groupe de deux photos directement au résumé
  (en garder deux), deux duels dans un groupe de trois (« VS », la copie gagne), « Plein écran » pendant un duel, fin du tri, fenêtre « Avant de supprimer » sans bouton de suppression mais avec le
  lien vers l'appli PC ; grille (« Tout garder », « Passer », « Revoir les groupes passés », choix changé dans la
  visionneuse, « Trier ce groupe ») ; tri retenu après une nouvelle analyse ; téléphone : duel l'une sous l'autre en
  portrait, côte à côte en paysage (760 × 393), résumé sans défilement horizontal. Captures dans `test-results/`.
- **Playwright, appli PC** (`npm run e2e:pc`, `e2e-pc/appli.spec.ts`, vraie appli Electron, copie du dossier
  d'essai) : photos d'origine lues par `app://`, grille, récapitulatif, Corbeille (dossier d'essai), dossier « À
  supprimer » (sous-dossiers, ignoré par la nouvelle analyse), annulation, disque sans Corbeille, « Tout supprimer »
  et touches 1 à 9 / Entrée, tri et dossier retrouvés au lancement suivant ; avec `E2E_MODELE=1`, photos similaires
  sur la carte graphique.

## 7. Conventions

Les mêmes que Rank It All : messages de commit et commentaires en français, sobres ; textes de l'interface jamais en
dur (dictionnaires, 6 langues) ; un mot plutôt qu'une icône seule ; vérifier les écrans aux formats téléphone et PC ;
docs (README, ARCHITECTURE, ROADMAP) et tests livrés avec chaque changement ; push sur `main` une fois vérifié.
