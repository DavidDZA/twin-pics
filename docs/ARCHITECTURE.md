# Architecture — comment marche Twin Pics

> **À lire en premier par toute nouvelle session de travail.** État au 24/11/2026 (version 0.10 : **doublons et photos inutiles
> séparés**, § 1 ; appli PC, § 2.1 ; habillage, § 2.2 ; tri et suppression, § 4 ; photos inutiles, § 4.3 ; groupes mis
> de côté et effacement des choix, § 4.4 ; zoom, § 4.5 ; stats et badges, § 4.6). Ce qui reste à faire est dans
> [ROADMAP.md](ROADMAP.md). L'histoire du projet (pourquoi cette appli, sources des photos,
> choix) est dans `DavidDZA\IDEES-APPLIS.md`, idée 1.

## 1. L'appli

On choisit un ou plusieurs dossiers de photos, l'appli trouve les groupes de doublons, propose la photo à garder, fait trier
chaque groupe et supprime ce qui doit l'être après un récapitulatif. **Rien ne quitte l'ordinateur** : les photos sont
lues et analysées sur place ; seul le modèle des photos similaires est téléchargé (une fois).

Une seule interface (React), sous trois formes (`src/platform/`) :

- **Appli PC** (Windows, exe portable, Electron, § 2.1) : la vraie appli. Elle seule supprime des photos.
- **Site** (GitHub Pages, Chrome ou Edge) : pour essayer. Il trouve et trie ; la fenêtre « Avant de supprimer » y
  explique que la suppression se fait dans l'appli PC (lien vers les *Releases*).
- **Android** (Capacitor) : à venir (ROADMAP § 5).

Pas de version Mac ni iPhone (décision du 23/11/2026).

Trois écrans (`App.tsx`), et le bouton « Stats et badges » en haut :

- **Départ** (`StartScreen`) : la **liste des dossiers** (§ 1.1), « Choisir un dossier de photos » puis « Ajouter un
  dossier », « Analyser » ; cases « Chercher aussi les photos similaires » et « Reconnaître aussi les documents… »
  (retenues : `opt-similar`, `opt-junk-model`, localStorage). Sur le site, une ligne renvoie vers l'appli PC.
- **Analyse** (`ScanScreen`) : étape en cours, barre de progression, temps restant estimé, « Arrêter ».
  « Téléchargement du modèle » ne s'affiche que s'il est vraiment téléchargé, sinon « Préparation du modèle ».
- **Résultats** (`Results`), **une seule page** (0.7). Une barre en haut : **« Doublons | Photos inutiles »** (nombre de
  photos ; un clic passe de l'une à l'autre, la dernière ouverte est retenue : `last-function`), « Relancer »,
  « Dossiers… » (retour à la liste), « Effacer tous mes choix… » (s'il y en a) ; puis une ligne : photos analysées, durée,
  noms des dossiers s'il y en a plusieurs, ce qui n'a pas été
  analysé, où ont tourné les modèles. En dessous, la fonction choisie (`Space`) : 3 cases, la barre de tri (« Trier… »,
  « Continuer le tri », « Revoir le tri » ; « Supprimer n photos… »), ses réglages (`SettingsPanel` ou `JunkSettings`,
  retenus : `detect-params`, `junk-params`), ses groupes (`GroupCard`, 30 puis « Voir plus » : état du tri photo par photo,
  « Trier ce groupe », « Pas des doublons » / « Pas inutiles ») et ses « Groupes mis de côté ». Les doublons ont en plus
  les onglets par niveau et « Supprimer toutes les copies exactes… ». Deux fonctions séparées depuis la 0.5 (« on se perd
  un peu ») ; la page intermédiaire à deux cartes et son « Retour » (0.5 et 0.6) ont été retirés à la demande de
  l'utilisateur.
  **Rien n'est partagé entre les deux** : choix (`marks`, `junkMarks`), groupes mis de côté, suppression. Une photo
  inutile qui a aussi un double apparaît dans les deux ; supprimée d'un côté, elle disparaît de l'autre.
- Par-dessus : l'**écran de tri** (`Sorter`, plein écran), la **visionneuse** (`Viewer`, § 4.5), les fenêtres **« Avant de
  supprimer »** (`RemoveDialog`), « Effacer mes choix » (`ResetDialog`, une fonction ou les deux), « Stats et badges » (`StatsDialog`), et les petits
  messages (`Toasts`, `notify.ts` : badge gagné, groupe mis de côté avec « Annuler »).

### 1.1 Plusieurs dossiers à la fois (0.8, 24/11/2026 ; `folders.ts`)

Demandé par l'utilisateur (deux disques, le PC et une clé).

- **Liste** retenue d'une fois à l'autre : `reglages.json` (`folders`) dans l'appli PC, meta `folders` sur le site (accès
  File System Access API ; pas les dossiers du champ d'envoi). L'ancien dossier unique (`lastFolder`, meta `folder`) est
  repris. Un clic de plus qu'avant pour un nouveau dossier (« Analyser »), autant que « Reprendre » pour l'ancien. Dans
  l'appli PC, la fenêtre de choix en accepte plusieurs d'un coup (Ctrl).
- **Jamais deux fois la même photo** : elle serait en double d'elle-même, et supprimée. Un dossier déjà compris dans un
  autre n'est pas ajouté ; un dossier qui en comprend d'autres prend leur place ; un message le dit (`addFolder`). Dans
  l'appli PC, second contrôle à la lecture, par le vrai emplacement (`independentRoots`, `realpath`) : lecteur réseau,
  « subst » ou jonction. Champ d'envoi du site : le navigateur cache les chemins, un dossier renvoyé (un fichier commun)
  remplace l'ancien.
- **L'ordre compte** : chaque photo a le rang de son dossier (`PhotoInfo.rank`) ; entre deux copies, celle du dossier le
  plus haut est proposée, avant les autres règles de l'originale (raison « dossier prioritaire »). Pour les quasi
  identiques et les similaires, la taille et la netteté passent toujours avant. La liste se range comme les classements de
  Rank It All (`FolderList`) : **poignée ⠿** à glisser (souris, doigt), ou flèches haut et bas du clavier ; code maison
  (`dropIndex`, `moveTo`), sans bibliothèque. Le premier essai, « Mettre en premier », n'était pas compris par
  l'utilisateur : le texte dit maintenant à quoi sert l'ordre.
- **Dossier débranché ou refusé** : il reste dans la liste (« Introuvable pour l'instant »), l'analyse se fait sans lui et
  le dit ; ses choix restent en base.
- **Noms** : dans l'appli PC, deux dossiers du même nom sont montrés avec leur chemin complet (`display.ts`) ; sur le
  site, « Photos » et « Photos (2) », sans quoi leurs photos auraient la même clé.
- **Suppression** : § 4.2. Le récapitulatif compte ce qui part de chaque dossier et, pour « toutes les copies exactes »,
  prévient si l'un d'eux est une sauvegarde.

## 2. Technique

| Élément | Choix |
|---|---|
| Front | Vite, React 19, TypeScript ; CSS `src/styles.css` (base, thème clair / sombre selon l'appareil), `src/sort.css` (tri, suppression), `src/junk.css` (swipe), `src/space.css` (deux cartes, stats), `src/theme.css` (habillage, § 2.2) |
| Appli PC | **Electron** 45 (`electron/`, construit par esbuild), exe portable par **electron-builder** (`npm run dist`, workflow `release.yml`) : § 2.1 |
| Base locale | IndexedDB via **Dexie** (`src/lib/db.ts`), base `twin-pics` : `photos`, `thumbs`, `labels`, `meta`, `marks`, `junkMarks` |
| Lecture des dossiers | Appli PC : le processus principal liste les dossiers (`electron/list.ts`), la page lit chaque photo par `app://twin-pics/_photo/…`. Site : **File System Access API** (`showDirectoryPicker`, Chrome / Edge), sinon champ `webkitdirectory` (`files.ts`) |
| Analyse | fichiers lus par la page (2 à la fois), analysés dans des workers (`analyze.worker.ts`), un par cœur moins un (6 au plus) ; EXIF par **exifr** |
| Photos similaires | **Transformers.js** + ONNX Runtime Web, modèle `onnx-community/dinov2-small` : carte graphique (WebGPU, `fp16`, 44 Mo), sinon processeur (WebAssembly, `q8`, 24 Mo) |
| Photos inutiles | règles sur des mesures de qualité (`quality.ts`) ; modèle **MobileCLIP-S1** (`Xenova/mobileclip_s1`, partie image) : carte graphique (`fp16`, 43 Mo), sinon processeur (`fp32`, 86 Mo) ; phrases livrées avec l'appli (`junkPrompts.json`), § 4.3 |
| Hébergement | Site : **GitHub Pages** (`https://daviddza.github.io/twin-pics/`), déployé à chaque push sur `main`. Appli PC : *Releases* GitHub, une par version de `package.json` |
| Tests | **Vitest** (`tests/`, Node : empreintes, regroupement, tri, liste et suppression de l'appli PC sur un vrai dossier temporaire, traductions) ; **Playwright** (`e2e/` : le site, Chrome installé, téléphone et PC ; `e2e-pc/` : la vraie appli Electron ou l'exe) |

```
electron/            appli PC (processus principal, Node) : construit en dist-electron/ par scripts/build-electron.mjs
  main.ts              fenêtre, protocole app://twin-pics/, échanges avec l'interface (IPC)
  preload.ts           window.twinPics (types : src/platform/bridge.ts)
  list.ts              liste des dossiers ; remove.ts : Corbeille, dossier « À supprimer », annulation ; paths.ts
src/
  App.tsx            les trois écrans, lancement de l'analyse
  platform/          site ou appli PC : index.ts (desktop, liste, réglages de suppression), bridge.ts (window.twinPics)
  lib/
    files.ts           une photo trouvée (FoundFile), lecture du dossier sur le site
    filetypes.ts       types de fichiers, dossiers ignorés (partagé avec electron/)
    choices.ts         le tri : garder / supprimer, photos à supprimer, copies exactes d'un coup, duels (code pur)
    ignored.ts         groupes mis de côté (« Pas des doublons », « Pas inutiles ») (code pur)
    stats.ts           stats et badges (code pur) ; statsStore.ts : leur enregistrement ; notify.ts : messages
    zoom.ts            zoom de la visionneuse : molette, clavier, deux doigts (code pur)
    quality.ts         netteté de la zone la plus nette, luminosité, contraste (code pur)
    junk.ts            photos inutiles : raisons, scores MobileCLIP, groupes (code pur) ; junkPrompts.json
    clip.worker.ts     MobileCLIP (vecteur de 512 nombres par photo)
    folders.ts         liste des dossiers (ajout, ordre, noms), § 1.1 ; components/FolderList : la poignée ⠿
    display.ts         chemins affichés à partir du dossier analysé
    scan.ts            l'analyse de bout en bout (base, lecture, workers, modèle, paires)
    pool.ts            limiter les tâches simultanées (Limiter), faire travailler des workers (WorkerPool)
    analyze.worker.ts  une photo : EXIF, décodage, dHash, netteté, miniature, SHA-256, entrée du modèle
    embed.worker.ts    le modèle des photos similaires (vecteur de 384 nombres par photo)
    pairs.worker.ts    paires candidates (findPairs) hors de l'interface
    imagehash.ts       dHash, Hamming, netteté, cosinus : code pur, testé sous Node
    groups.ts          paires candidates, groupes, suggestion : code pur
    db.ts model.ts messages.ts
  components/        écrans et briques (Results, Space, GroupCard, Sorter, SwipeSorter, RemoveDialog, Viewer, StatsDialog…)
  i18n/              un dictionnaire par langue (fr.ts en référence)
tests/  e2e/  e2e-pc/  Vitest, Playwright site, Playwright appli PC (e2e/photos.ts génère le dossier d'essai)
scripts/             construction et lancement de l'appli PC, icône (build/icon.ico, depuis public/favicon.svg)
tools/vitesse/       banc de mesure de vitesse (décodage, modèle sur processeur ou carte graphique), § 3.5
tools/inutiles/      phrases de MobileCLIP et calibrage des photos inutiles sur un dossier, § 4.3
tools/doublons/      paires quasi identiques d'un dossier, retenues ou refusées, § 3.3
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
  aussi de clé (`photoKey`). Affichés à partir de leur dossier analysé (`display.ts`), complets dans l'infobulle.
- **Pont** (`preload.ts`, `contextIsolation`, `sandbox`) : `window.twinPics` = choisir des dossiers, dossiers de la
  dernière fois (`reglages.json` dans le dossier de l'appli), lister, choisir le dossier « À supprimer », supprimer, annuler, ouvrir
  l'Explorateur, ouvrir un lien. Les liens `target="_blank"` s'ouvrent dans le navigateur.
- **Ouverture** (23/11/2026, l'utilisateur trouvait l'appli lente à s'ouvrir ; mesures sur son PC) : le portable
  d'electron-builder se décompresse à chaque lancement (≈ 300 Mo, vérifiés par l'antivirus), sans rien montrer : **34 à
  36 s** la première fois, 9 s ensuite ; l'appli elle-même s'ouvre en 0,5 s (5 s la toute première fois).
  Depuis la 0.6, **notre script d'exe portable** (`build/portable.nsi`, mis à la place du modèle d'electron-builder par
  `scripts/portable-nsi.mjs` dans `npm run dist` et `release.yml`) : fenêtre avec **barre de progression** et texte dans la
  langue de Windows, et appli décompressée **gardée** dans `%LOCALAPPDATA%\Twin Pics Portable\<construction>` (dossier
  d'attente renommé à la fin ; constructions précédentes effacées). Mesuré : barre à 0,6 s, appli à 8 à 11 s la première
  fois, **0,4 s ensuite**. Le modèle, lui, décompressait puis copiait tout une seconde fois.
  Dans la page, **barre d'ouverture** (`index.html`, sans code) jusqu'à ce que l'appli la remplace, sur le fond de la
  fenêtre (`backgroundColor` : pas d'éclair blanc).
- **Pas d'installateur** : il y en a eu un en 0.5 et 0.6, pour contourner la lenteur du portable ; inutile depuis que
  celui-ci s'ouvre tout de suite (décision de l'utilisateur, 23/11), et l'utilisateur ne comprenait pas où il installait.
  `release.yml` ouvre l'exe portable pour l'essayer avant de publier.
- **Une seule fenêtre** (`requestSingleInstanceLock`) : deux appli ouvertes se disputeraient la base locale.
- **Paquet** : toutes les dépendances sont des `devDependencies` (l'interface est empaquetée par Vite) : l'exe
  n'embarque aucun `node_modules` (≈ 110 Mo, Electron compris).
- Variables d'environnement des tests : `TP_USER_DATA` (dossier de l'appli), `TP_PICK_FOLDER` /
  `TP_PICK_REMOVE_FOLDER` (réponses des fenêtres de choix de dossier ; plusieurs séparés par « ; »), `TP_FAKE_TRASH` (dossier qui remplace la
  Corbeille), `TP_FAKE_TRASH_FAIL` (Corbeille refusée, comme sur une clé USB).

### 2.2 Habillage (`theme.css`)

Demandé le 22/11/2026 : « un peu plus fun ». Chargé en dernier, il ne change que l'apparence : les couleurs du logo
(bleu `--brand-a`, orange `--brand-b`) en dégradé (`--brand`) pour les boutons principaux, les onglets choisis, les
titres et les chiffres ; deux halos de couleur en fond ; boutons arrondis qui réagissent au survol et au clic ; cartes
douces avec ombre ; un emoji décoratif par case de chiffres (👯 🗂️ 💾, ignorés par les lecteurs d'écran) ;
**logo animé** (`TwinCards` : deux photos jumelles qui se rejoignent au départ, se mélangent pendant l'analyse) ;
barre de progression du tri ; « VS » entre les deux photos d'un duel ; 🎉 à la fin du tri et après une suppression.
Toutes les animations s'arrêtent si le système demande moins de mouvement (`prefers-reduced-motion`).

## 3. L'analyse (`scan.ts`)

**Chaque photo n'est lue qu'une fois sur le disque** (21/11/2026). La version 0.1 relisait toutes les photos pour le
modèle : sur un disque dur (60 à 150 Mo/s), 10 000 photos (56 Go) prenaient 15 min d'analyse puis 50 min de photos
similaires (§ 3.5).

```
lecture (la page, 2 fichiers à la fois) → analyse (workers) → modèles (carte graphique, ou 2 workers processeur)
```

Deux modèles, chacun s'il est demandé (cases de la page de départ) : DINOv2 (photos similaires, `embed.worker.ts`) et
MobileCLIP (photos inutiles, `clip.worker.ts`). Ils reçoivent la même petite version de la photo (petit côté de
256 px, préparée par l'analyse) : toujours une seule lecture du fichier.

1. **Liste** des photos (sous-dossiers compris ; corbeilles et dossiers système ignorés). Images lues : jpg, jpeg,
   png, webp, gif, bmp, avif. HEIC / HEIF (iPhone) et vidéos comptées à part : Chrome ne sait pas ouvrir le HEIC.
2. **Reprise** : chaque photo a une clé `chemin + taille + date de modification` (`photoKey`) ; une photo déjà en base
   n'est pas réanalysée. Relancer l'analyse d'un dossier déjà vu prend quelques secondes. Exception : une photo
   mesurée avec une autre version des mesures de qualité (`qv` ≠ `QUALITY_VERSION`) est réanalysée — la première
   analyse en version 0.4 relit donc une fois toutes les photos analysées avant.
3. **Les modèles se chargent** pendant que l'analyse commence, **seulement s'il y a des photos à leur montrer** : la
   version utilisée la dernière fois (meta `models`) suffit à savoir que toutes les photos ont déjà leur vecteur.
   Relancer un dossier déjà vu ne charge donc aucun modèle (1 493 photos : 0,5 s, au lieu de 10 à 20 s de préparation
   des modèles). Si un modèle n'est pas prêt à la fin de l'analyse, la progression montre son téléchargement, ou
   « Préparation du modèle » s'il est déjà sur l'appareil (`modelCached` regarde le cache de Transformers.js). Jusqu'à la
   0.4, elle disait « Téléchargement » dans les deux cas : les modèles n'étaient pourtant téléchargés qu'une fois.
4. **Lecture** : la page lit le fichier (`file.arrayBuffer()`), **2 à la fois au plus** (`READS_AT_ONCE` : un disque
   dur ralentit s'il saute d'un fichier à l'autre), et le transfère au worker (sans copie). Au plus « workers + 4 »
   photos en mémoire à la fois.
5. **Analyse** dans les workers (`analyze.worker.ts`, un par cœur moins un, 6 au plus) :
   - date de prise de vue (`DateTimeOriginal`, sinon `CreateDate`) et appareil (EXIF) ;
   - décodage avec l'orientation EXIF ; petite version de 256 px → **dHash** ; version de 1024 px → **netteté** et
     **mesures de qualité** (`quality.ts`, § 4.3) ;
   - **miniature** JPEG de 200 px (table `thumbs`) ;
   - **SHA-256** seulement si un autre fichier a la même taille (deux copies exactes ont forcément la même) ;
   - **entrée des modèles** (petit côté de 256 px) : pour toutes les photos si MobileCLIP est demandé, sinon pour les
     photos **datées** si les photos similaires le sont (`wantPixels` : `all` / `dated` / `none`).
   Une photo illisible garde `error: 'decode'`.
6. **Modèles**, au fil de l'analyse : chaque entrée part aussitôt dans DINOv2 (photo datée) et dans MobileCLIP
   (toujours ; une copie quand les deux la veulent, elle est transférée). Au plus 64 entrées
   en attente (`MODEL_QUEUE`, ≈ 350 Ko chacune) : au-delà, l'analyse attend le modèle. Toutes les photos datées passent
   dans le modèle (on ne sait qu'à la fin lesquelles ont une voisine dans le temps ; sur la carte graphique, ça ne coûte
   presque rien).
7. **Photos déjà analysées sans vecteur d'un modèle** (option cochée après coup, autre version du modèle) : relues
   une seule fois pour tous les modèles qui leur manquent, en mode `pixels` (décodage seul) ; pour DINOv2, seulement
   celles qui ont une voisine à moins de 30 min (`needsVector`) ; pour MobileCLIP, toutes.
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
  servi **ou si c'est une rafale**, sinon « quasi identiques ».
- **Rafale parmi les quasi identiques** (`burstShots`, 0.10, 24/11/2026) : deux prises de vue presque pareilles ont des dHash
  aussi proches qu'une photo et sa copie. Leur groupe, déjà relié par le dHash, restait « quasi identique », et l'appli y
  proposait le plus gros fichier au lieu de la photo la plus nette (26 des 32 groupes quasi identiques de `photos test` ; 8
  suggestions changent). Les dates tranchent : au moins deux photos datées, de la plus grande définition du groupe, à 1 s
  d'écart au moins (précision de l'EXIF) et `windowMin` au plus. La suggestion se choisit parmi ces prises de vue : jamais
  une copie réduite ou sans date (WhatsApp), même jugée plus nette. Même date = copie ou retouche : rien ne change. Sans
  modèle, donc aussi quand les photos similaires ne sont pas demandées. Sans date EXIF, la rafale reste « quasi identique »
  (les 6 autres groupes : ROADMAP § 6).
- **Suggestion** (`suggestBest`) : copies exactes → celle du dossier le plus haut (§ 1.1), sinon l'originale (pas dans un dossier WhatsApp, Telegram,
  téléchargements, pas de « (1) » ni « Copie » dans le nom ; puis la plus ancienne, puis le chemin le plus court) ;
  quasi identiques → la plus grande définition, puis le plus gros fichier ; similaires → la plus nette.
- Les photos **presque vides** (`isFlat` : dHash ≤ 4 ou ≥ 60 bits à 1, ou **contraste < 10**) ne sont jamais « quasi
  identiques » ni « similaires » (le modèle les juge pareilles, mais ce ne sont pas des doublons à départager) : elles
  vont dans les photos inutiles (§ 4.3). Le contraste a été ajouté le 23/11/2026 : les photos noires de l'utilisateur
  (une poche, à Cuba) ont une empreinte faite de bruit (31 bits à 1 sur 64, donc pas « uniforme »), à 6 ou 7 bits d'un
  ciel bleu de Croatie : 25 photos noires se retrouvaient en double d'une photo de mer. Vérifié sur ses 1 493 photos
  (`node tools/doublons/empreintes.mjs`) : seules ces paires sont refusées, 103 groupes de doublons, aucune photo noire.
- Groupes triés par date ; dans un groupe, la suggestion d'abord, puis par date. Identifiant stable (`groupId`) :
  empreinte des clés des photos, pour retrouver les groupes mis de côté.
- Sous chaque photo, sa ressemblance avec la suggestion : « identique », « n bits d'écart » ou « ressemble à n % ».

### 3.4 Base locale (`db.ts`)

- `photos` : une ligne par fichier (clé, chemin, taille, date de modification, SHA-256, dHash, netteté, dimensions,
  date EXIF, appareil, erreur, vecteur et nom du modèle).
- `thumbs` : miniatures (≈ 10 Ko chacune ; à surveiller pour 50 000 photos : ROADMAP).
- `labels` : groupes mis de côté (`groupId`, verdict `wrong`, nature, clés des photos), § 4.4. Les anciens verdicts
  `good` (« Bien trouvé », jusqu'à la 0.4, sans effet) sont ignorés.
- `meta` : `folders` (site : accès aux dossiers, gardés par Chrome ; redemandés au clic sur « Analyser ») ;
  `models` (versions des modèles), `stats` (§ 4.6).
- `photos` porte aussi, depuis la version 0.4 : `quality` et `qv` (mesures de qualité et leur version), `clip` et
  `clipModel` (vecteur MobileCLIP et sa version, `clipId(dtype)`).
- `marks` (version 2 de la base, doublons) et `junkMarks` (version 3, photos inutiles : copiées des `marks` des groupes
  « j… ») : le tri, photo par photo (`key`, `mark` = `keep` / `remove`, `groupId`, date), § 4.

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

- **Ce qui est supprimé** (`pendingRemoval`) : les photos « à supprimer » des groupes **triés** du moment, de la fonction
  ouverte seulement ; pour les photos inutiles, chaque photo jetée compte, même si son groupe n'est pas fini (et l'absence
  de photo gardée n'est pas signalée : c'est le but). Une photo
  marquée qui n'est plus dans aucun groupe (réglages changés) n'est jamais touchée.
- **Toutes les copies exactes** (`exactCleanup`, bouton de la page des doublons) : dans chaque groupe proposé (même
  quasi identique ou similaire), les fichiers identiques octet pour octet sauf un (la suggestion si elle en fait partie,
  sinon l'originale), sans les trier. Des copies déjà triées à la main ne sont pas concernées. Même récapitulatif.
- **« Avant de supprimer »** : « n photos à supprimer (taille), n gardées, dans n groupes », avertissement si des
  groupes ne gardent aucune photo, la liste des groupes (miniatures « Gardée » / « À supprimer », noms au clic ; 60
  groupes puis « et n autres groupes »), **« Où vont les photos supprimées »** (liste : Corbeille de Windows ou
  dossier « À supprimer », retenu : `remove-mode`, `remove-folder`), « Annuler » / « Supprimer n photos ».
- **Corbeille de Windows** (`shell.trashItem`) : sur un disque sans Corbeille (clé USB), Electron refuse au lieu
  d'effacer : la photo n'est pas touchée et le compte rendu conseille le dossier « À supprimer ».
- **Dossier « À supprimer »** : par défaut un dans chaque dossier analysé, `<dossier analysé>/Twin Pics - À supprimer`
  (même disque : déplacement immédiat ; nom traduit, toujours
  commencé par `Twin Pics - ` : jamais analysé, `isSkippedDir`), ou un seul dossier choisi (« Changer… », exclu de
  l'analyse ; les photos de plusieurs dossiers y sont séparées par le nom du leur). Les photos y gardent leurs sous-dossiers, jamais par-dessus un fichier (« plage (2).jpg ») ; d'un disque
  à l'autre, copie puis effacement. **« Annuler »** juste après les remet à leur place.
- Envoi par paquets de 20 (progression « Suppression… n / N ») ; le processus principal refuse tout fichier hors des
  dossiers analysés. Ensuite : compte rendu (« n photos supprimées, taille libérée », où elles sont, échecs), les photos
  disparaissent des groupes (`gone`) et leurs choix sont effacés. Les lignes de `photos` restent (une photo remise à
  sa place garde la même clé).

### 4.3 Photos inutiles (`quality.ts`, `junk.ts`, `clip.worker.ts`, 22/11/2026)

Idée de l'utilisateur : une catégorie à côté des doublons pour les photos « pas intéressantes » ; « tout » (floues,
sombres, poche, captures, documents, tickets, mèmes) ; un modèle téléchargé en plus, « pas de problème » ; les dossiers
WhatsApp traités comme les autres (filtres par conversation : ROADMAP § 6.1) ; des **groupes** de photos inutiles
semblables pour en traiter plusieurs d'un coup, **sans filtre de temps** ; un mode **swipe** (je garde / je jette) à la
place des duels.

- **Mesures** (`measureQuality`, sur la version de 1024 px) : `sharp` = netteté de la **zone la plus nette** (variance
  du laplacien, grille 4 × 4 ; un portrait au fond flou reste net), `lum` (luminosité moyenne), `dark` / `bright`
  (part des pixels presque noirs / blancs), `contrast` (écart type).
- **Raisons** (`junkReasons`), plusieurs possibles :
  - sans modèle : **presque vide** (contraste < 10 ; rien d'autre alors), **trop sombre** (luminosité < 35 et plus de
    55 % de pixels noirs), **trop claire** (> 228 et plus de 50 % de blancs), **floue** (`sharp` < `blurMax`, 30),
    **capture d'écran** (nom « Screenshot », « Capture d'écran »… ; ou PNG sans appareil photo aux proportions d'un
    écran ; une capture n'est jamais « floue » ni « trop claire ») ;
  - avec MobileCLIP : chaque photo comparée à 72 phrases (`tools/inutiles/prompts.ts` : catégories document, ticket,
    capture, mème, prise par erreur, et beaucoup de photos « normales ») ; softmax (échelle 100) ; une catégorie est
    retenue au-dessus de `clipMin` (70 %). **Prise par erreur** demande en plus une photo ratée (netteté < 300,
    luminosité < 50 ou contraste < 25) : le modèle seul se trompait sur les grottes, le sol d'une place, des selfies.
  - l'utilisateur décoche les raisons qu'il ne veut pas voir (`off`).
- **Les phrases** sont calculées une fois par la partie « texte » du modèle (`node tools/inutiles/calibrer.mjs
  --phrases`) et livrées (`src/lib/junkPrompts.json`, 72 vecteurs de 512) : l'utilisateur ne télécharge que la partie
  « image ». Changer une phrase : relancer `--phrases`.
- **Pas de version `q8`** du modèle : mesuré le 22/11, elle donne des résultats faux (photos de vacances « mèmes » à
  88 %) ; `fp16` et `fp32` s'accordent.
- **Calibrage** (22/11, 1 493 photos de voyage de l'utilisateur, `photos test/`) : 49 proposées (3 %), dont une série
  de 25 photos noires (une poche, à Cuba) ; sur les 24 autres, environ 6 erreurs (un distributeur, un panneau en cœur,
  un gaufrier…), à corriger par l'utilisateur ou le curseur « certitude ». Netteté des photos : 1 % sous 3,3, 5 % sous
  350, médiane 4 200. Outils : `calibrer.mjs [dossier] [nombre]` (répartitions, photos retenues par raison,
  `test-results/calibrage.json`) et `planche.mjs <raison>` (planche contact).
- **Groupes** (`buildJunkGroups`) : parmi les photos inutiles (celles des doublons comprises depuis la 0.5), deux photos
  qui partagent une raison sont reliées si MobileCLIP les juge proches (`groupMin`, 85 %), si leurs dHash sont à 6 bits
  au plus, ou si elles sont toutes deux presque vides ; même garde-fou contre les chaînes que les similaires ;
  **aucune limite de temps**. Plus gros groupes d'abord. Identifiant `j…`, pas de suggestion (`best` = −1), raisons par
  photo et raison principale (`junk`). Au-delà de 4 000 photos inutiles, pas de regroupement par le modèle (à mesurer).
- **Interface** : sa page (§ 1 ; réglages `JunkSettings` : raisons à cocher,
  curseurs netteté, certitude du modèle, ressemblance pour regrouper ; retenus : `junk-params`), cartes avec la raison
  principale et les raisons de chaque photo, « Pas inutiles ». Option de la page de départ
  « Reconnaître aussi les documents, tickets et mèmes » (`opt-junk-model`, cochée par défaut).
- **Tri** : « Affichage : Grille | Swipe » (retenu à part : `junk-view` ; swipe par défaut au téléphone). **Grille** : tout
  le groupe, à jeter par défaut (pas de suggestion). **Swipe** (`SwipeSorter`, `SwipeCard`) : **une photo à la fois**
  (demandé le 23/11/2026 ; jusqu'à la 0.4, une carte pour tout un groupe), dans l'ordre des groupes ; nom, raisons,
  taille, date ; la suivante est déjà visible sous la carte. Glissée à la souris ou au doigt (au-delà de 110 px ; tampons
  « Je garde » / « Je jette » qui apparaissent avec le geste), boutons, flèches ← → ; « Précédent » revient (le choix est
  montré et se change), « Passer » ne décide rien. **Pas de résumé à la fin** : après la dernière photo, retour à la liste.

### 4.4 Groupes mis de côté, effacer les choix (`ignored.ts`, 23/11/2026)

- **« Pas des doublons » / « Pas inutiles »** (carte du groupe, et pendant le tri) : le groupe n'est plus proposé, ni
  trié, ni supprimé ; message avec « Annuler », puis « Groupes mis de côté (n) » en bas de la page, « Remettre dans la
  liste ». Jusqu'à la 0.4, ces boutons (et « Bien trouvé », retiré) ne servaient qu'à noter la détection.
- Doublons : un groupe est caché si toutes ses photos étaient dans un même groupe mis de côté (il reste caché s'il
  rétrécit, il revient s'il gagne une photo : c'est peut-être un vrai double). Photos inutiles : photo par photo.
- **Mis de côté tout seul par le tri** (0.9, demandé le 24/11/2026 : ne plus repasser par la liste pour « Pas des
  doublons ») : déduit des choix eux-mêmes (`keptTogether`, `keptKeys`), rien de plus en base, donc un choix changé se
  répercute aussitôt et les tris d'avant la 0.9 comptent. Doublons : un groupe dont toutes les photos sont gardées, dans le
  même tri (`groupId`). S'il y a aussi des photos à supprimer, il reste « Trié » dans la liste jusqu'à leur suppression,
  puis ce qui reste est mis de côté. Photos inutiles : chaque photo gardée, tout de suite. La grille le dit (« Les photos
  gardées seront mises de côté »). « Remettre dans la liste » efface le choix de ces photos. Les deux boutons restent.
- **Photos à supprimer** : cadre rouge et étiquette, jamais de voile ni de gris (retirés en 0.9 : on ne les voyait plus,
  il fallait cliquer sur chacune), dans la grille, la liste et le récapitulatif.
- **Effacer les choix** : « Effacer tous mes choix… » (barre du haut, les deux fonctions) et, sur chaque page, **« Effacer mes
  choix des doublons… » / « … des photos inutiles… »** (0.9, celle-ci seulement). Après confirmation, les photos triées **des
  dossiers analysés** redeviennent à trier et leurs groupes mis de côté reviennent. Aucun fichier touché ; les stats restent.

### 4.5 Zoom (`zoom.ts`, `Viewer`, 23/11/2026)

Dans la visionneuse : **molette** (le point sous la souris ne bouge pas), touches **+ − 0**, double clic (250 %), boutons
− / + / « Photo entière », **deux doigts** sur un écran tactile (déjà prêt pour Android, événements « pointer »). La photo
agrandie se déplace à la souris ou au doigt, sans sortir de l'écran ; 100 % = photo entière, 1 200 % au plus. **Le zoom est
gardé en passant à la photo suivante** : on compare le même détail sur deux photos presque pareilles.

### 4.6 Stats et badges (`stats.ts`, `statsStore.ts`, `StatsDialog`, 23/11/2026)

- **Compteurs** en base (meta `stats`) : analyses, dossiers différents, plus grosse analyse ; photos triées (première
  décision seulement), gardées, la nuit (0 h à 5 h), âge de la plus ancienne (dates d'avant 1990 ignorées) ; groupes de
  doublons triés, gardés ou supprimés en entier, le plus gros ; duels, swipes, record en une minute ; photos supprimées par
  fonction (dont copies exactes), record d'un coup, suppressions, photos remises ; place libérée ; jours d'utilisation ;
  listes finies ; groupes mis de côté ; photos regardées en zoom. Les records ne baissent pas (`atLeast`), « Annuler » une
  suppression décompte.
- **Cinquante badges** (demandés par l'utilisateur ; `BADGES` : un compteur, un seuil), en 7 familles, un nom et un emoji
  chacun. Gagné = pour de bon (meta `badges` : sa date), même si le compteur redescend. Annoncé par un message (un seul
  s'il y en a plus de deux d'un coup). La 0.5 avait 8 badges à trois niveaux : ceux déjà mérités sont redonnés.
- Rien n'est envoyé. Ajouter un badge : une ligne dans `BADGES`, son nom dans les 6 langues (le test le vérifie).

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
  réglage, rafales parmi elles et copies qui n'en sont pas, images uniformes écartées, similaires selon la ressemblance et l'écart de temps, garde-fou contre les
  chaînes, photos sans date jamais similaires, ordre et identifiant des groupes, photos qui ont besoin du modèle) ;
  traductions (dont : le dossier « À supprimer » n'est jamais analysé, dans toutes les langues).
- **Version 0.5** : `ignored.test.ts` (groupes mis de côté : rétréci, agrandi, deux fonctions à part), `stats.test.ts`
  (50 badges différents et traduits, seuils, gardés après une annulation, annonce une seule fois, compteurs et records), `zoom.test.ts` (point fixe, bornes, deux doigts),
  `db.test.ts` (base de la 0.4 reprise), `groups.test.ts` (photos noires au bruit trompeur), `choices.test.ts` (copies
  exactes d'un coup).
- **Photos inutiles** (`junk.test.ts`) : mesures sur des images générées (nette, floue partout, sujet net sur fond
  flou, sombre, brûlée, vide), chaque règle, captures par le nom ou les proportions, certitude du modèle, « prise par
  erreur » seulement si ratée, raisons décochées, phrases livrées (normalisées, toutes les catégories), groupes sans
  limite de temps, raisons différentes jamais ensemble, photos à laisser de côté, photo décidée seule, garde-fou contre les chaînes,
  regroupement par dHash sans le modèle, tout à jeter par défaut. Images uniformes jamais « similaires »
  (`groups.test.ts`).
- **Mis de côté** (`ignored.test.ts`) : par un bouton, ou par le tri (tout gardé, gardé en partie, nouvelle photo, tris
  différents).
- **Tri** (`choices.test.ts`) : suggestion seule par défaut, en garder plusieurs ou aucune, groupe trié ou non, choix
  repris, photos à supprimer et place libérée, « tout supprimer » signalé, photo marquée hors groupe jamais supprimée,
  duels (la gagnante affronte la suivante, groupe de deux photos).
- **Dossiers** (`folders.test.ts`) : ajout, dossier répété ou compris dans un autre (chemins, File System Access API, champ
  d'envoi), disque entier, ordre et glissement, noms et chemins affichés ; `groups.test.ts` : copie du dossier le plus haut proposée.
- **Appli PC** (`pc.test.ts`, vrai dossier temporaire) : liste (sous-dossiers, HEIC et vidéos comptés, corbeilles et
  dossier « À supprimer » ignorés), chemins (« .. » refusé), Corbeille (refus = photo intacte), dossier « À supprimer »
  (sous-dossiers, pas d'écrasement, annulation), photo hors du dossier ou disparue, noms libres ; plusieurs
  dossiers (rangs, dossier répété, sous-dossier, jonction, dossier introuvable, « À supprimer » dans chacun ou choisi).
- **Outils de parallélisme** (`pool.test.ts`) : jamais plus de tâches simultanées que permis, place libérée après un
  échec, file d'attente du modèle qui bloque l'analyse quand elle est pleine ; une demande à la fois par worker, chaque
  réponse à sa demande, erreur limitée à sa demande, « Arrêter » qui annule tout.
- **Playwright** (`npm run e2e`) : dossier d'essai généré (`e2e/photos.ts` : copies exactes, copie WhatsApp, version
  réduite, rafale floue, photo cassée, HEIC, vidéo), lu par le champ `webkitdirectory` (la fenêtre de choix de dossier
  ne s'automatise pas). Parcours : écran de départ, groupes trouvés et suggestions, photos non analysées, curseurs,
  barre du haut sans page intermédiaire, « Pas des doublons » (annuler, retenu, remettre), seconde analyse sans rien refaire, visionneuse (zoom à la
  molette, au clavier, au double clic, à deux doigts, gardé d'une photo à l'autre), stats et badges (badge gagné et daté), un clic d'une fonction à l'autre (retenue), plusieurs dossiers (liste, ordre à la poignée et au clavier, doublons d'un dossier à l'autre, retrait), barre d'ouverture, miniatures, pas de défilement horizontal,
  anglais. Avec `E2E_MODELE=1` (télécharge le modèle) : rafale trouvée pendant l'analyse, la plus nette proposée, et
où a tourné le modèle affiché ; même chose sur le processeur forcé ; photos similaires demandées après une analyse
sans elles (photos déjà vues complétées).
- **Playwright, visionneuse** (`e2e/parcours.spec.ts`) : flèches à gauche et à droite de la photo, clavier ; au
  téléphone, glisser le doigt.
- **Playwright, tri sur le site** (`e2e/tri.spec.ts`, téléphone et PC) : groupe de deux photos directement au résumé
  (en garder deux), deux duels dans un groupe de trois (« VS », la copie gagne), « Plein écran » pendant un duel, fin du tri, fenêtre « Avant de supprimer » sans bouton de suppression mais avec le
  lien vers l'appli PC ; grille (« Tout garder », « Passer », « Revoir les groupes passés », choix changé dans la
  visionneuse, « Trier ce groupe ») ; tri retenu après une nouvelle analyse ; effacer tous mes choix (les deux fonctions) ou ceux d'une page ; tout garder met de côté tout seul (retour en arrière, retenu, remis) ; toutes les copies exactes ; téléphone : duel l'une sous l'autre en
  portrait, côte à côte en paysage (760 × 393), résumé sans défilement horizontal. Captures dans `test-results/`.
- **Playwright, photos inutiles** (`e2e/inutiles.spec.ts`, dossier d'essai `Ratées` : deux photos noires, une floue,
  une sombre, deux captures, une page de texte) : page (6 groupes, 7 photos, les noires regroupées, raisons), réglages
  (décocher « Floue »), swipe photo par photo (bouton, clavier, geste à la souris, geste trop court sans effet, retour en
  arrière, reprise, fin sans résumé, revoir le tri), « Pas inutiles »,
  grille (tout à jeter par défaut, plein écran), téléphone (swipe par défaut, carte et boutons à l'écran en portrait et
  en paysage) ; avec `E2E_MODELE=1` : page de texte « Document », photos noires « Prise par erreur », sur la carte
  graphique et sur le processeur ; deuxième analyse sans charger de modèle, modèle relu sans « Téléchargement ».
- **Playwright, appli PC** (`npm run e2e:pc`, `e2e-pc/appli.spec.ts`, vraie appli Electron, copie du dossier
  d'essai) : photos d'origine lues par `app://`, grille, récapitulatif, Corbeille (dossier d'essai), dossier « À
  supprimer » (sous-dossiers, ignoré par la nouvelle analyse), annulation, toutes les copies exactes, disque sans Corbeille, « Tout supprimer »
  et touches 1 à 9 / Entrée, tri et dossier retrouvés au lancement suivant, plusieurs dossiers (choisis d'un coup, « À supprimer » dans chacun,
  annulation, clé débranchée, dossier retenu par une version d'avant la 0.8), photos inutiles triées en swipe puis à la
  Corbeille ; avec `E2E_MODELE=1`, photos similaires
  sur la carte graphique.

## 7. Conventions

Les mêmes que Rank It All : messages de commit et commentaires en français, sobres ; textes de l'interface jamais en
dur (dictionnaires, 6 langues) ; un mot plutôt qu'une icône seule ; vérifier les écrans aux formats téléphone et PC ;
docs (README, ARCHITECTURE, ROADMAP) et tests livrés avec chaque changement ; push sur `main` une fois vérifié.
Chaque nouvelle version de l'appli PC : l'exe construit aussi en local dans `release/` (`npm run dist`, demandé par
l'utilisateur le 23/11), vérifié par `npm run e2e:exe` ; les anciens exe y restent.
