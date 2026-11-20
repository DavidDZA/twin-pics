# Architecture — comment marche Twin Pics

> **À lire en premier par toute nouvelle session de travail.** État au 21/11/2026 (prototype PC, version 0.2 : analyse
> 4 fois plus rapide, § 3). Ce qui
> reste à faire est dans [ROADMAP.md](ROADMAP.md). L'histoire du projet (pourquoi cette appli, sources des photos,
> choix) est dans `DavidDZA\IDEES-APPLIS.md`, idée 1.

## 1. L'appli

Une page web (Chrome, Edge) : on choisit un dossier de photos, elle trouve les groupes de doublons et propose la
photo à garder. **Rien ne quitte l'ordinateur** : les photos sont lues et analysées dans le navigateur ; seul le
modèle des photos similaires est téléchargé (une fois). Le prototype ne supprime rien.

Trois écrans (`App.tsx`) :

- **Départ** (`StartScreen`) : « Choisir un dossier de photos », « Reprendre « dossier » » (le dernier dossier, s'il a
  été choisi avec la File System Access API), case « Chercher aussi les photos similaires » (retenue :
  `opt-similar`, localStorage).
- **Analyse** (`ScanScreen`) : étape en cours, barre de progression, temps restant estimé, « Arrêter ».
- **Résultats** (`Results`) : 4 cases (photos analysées, groupes, photos en trop, place récupérable), ce qui n'a pas
  été analysé, réglages de la détection (`SettingsPanel`, curseurs, retenus : `detect-params`), onglets par niveau,
  groupes (`GroupCard`, 30 puis « Voir plus »), visionneuse (`Viewer` : le fichier d'origine en grand, flèches,
  Échap).

## 2. Technique

| Élément | Choix |
|---|---|
| Front | Vite, React 19, TypeScript, un seul fichier CSS (`src/styles.css`, thème clair / sombre selon l'appareil) |
| Base locale | IndexedDB via **Dexie** (`src/lib/db.ts`), base `twin-pics` : `photos`, `thumbs`, `labels`, `meta` |
| Lecture du dossier | **File System Access API** (`showDirectoryPicker`, Chrome / Edge) ; sinon champ `webkitdirectory` (`files.ts`) |
| Analyse | fichiers lus par la page (2 à la fois), analysés dans des workers (`analyze.worker.ts`), un par cœur moins un (6 au plus) ; EXIF par **exifr** |
| Photos similaires | **Transformers.js** + ONNX Runtime Web, modèle `onnx-community/dinov2-small` : carte graphique (WebGPU, `fp16`, 44 Mo), sinon processeur (WebAssembly, `q8`, 24 Mo) |
| Hébergement | **GitHub Pages** (`https://daviddza.github.io/twin-pics/`), déployé à chaque push sur `main` |
| Tests | **Vitest** (`tests/`, Node : empreintes sur des images générées par sharp, regroupement, traductions) ; **Playwright** (`e2e/`, appli construite, Chrome installé, téléphone et PC) |

```
src/
  App.tsx            les trois écrans, lancement de l'analyse
  lib/
    files.ts           lecture du dossier (deux méthodes), types de fichiers
    scan.ts            l'analyse de bout en bout (base, lecture, workers, modèle, paires)
    pool.ts            limiter les tâches simultanées (Limiter), faire travailler des workers (WorkerPool)
    analyze.worker.ts  une photo : EXIF, décodage, dHash, netteté, miniature, SHA-256, entrée du modèle
    embed.worker.ts    le modèle des photos similaires (vecteur de 384 nombres par photo)
    pairs.worker.ts    paires candidates (findPairs) hors de l'interface
    imagehash.ts       dHash, Hamming, netteté, cosinus : code pur, testé sous Node
    groups.ts          paires candidates, groupes, suggestion : code pur
    db.ts model.ts messages.ts
  components/        écrans et briques (GroupCard, SettingsPanel, Viewer, useThumbs…)
  i18n/              un dictionnaire par langue (fr.ts en référence)
tests/  e2e/         Vitest, Playwright (e2e/photos.ts génère le dossier d'essai)
tools/vitesse/       banc de mesure de vitesse (décodage, modèle sur processeur ou carte graphique), § 3.5
```

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
- `meta` : `folder` (accès au dernier dossier, gardé par Chrome ; redemandé au clic sur « Reprendre »).

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

## 4. Traduction

6 langues, ton familier. Langue de l'appareil si elle est traduite, sinon l'anglais ; choix en bas de page
(`app-lang`, localStorage), qui recharge la page. Dictionnaires `src/i18n/*.ts` typés sur `fr.ts` : la compilation
échoue s'il manque un texte. `tests/i18n.test.ts` : mêmes clés, aucun texte vide, aucun texte resté en français (sauf
les mots qui s'écrivent pareil, listés dans le test), pas d'espace avant « : ! ? ; » hors du français. Tailles et
durées par `Intl` (`bytes`, `duration`).

## 5. Tests

- `npx tsc -b`, `npm test`, `npm run build` avant chaque push ; le déploiement relance `npm test`.
- **Vitest** : empreintes sur des images générées par sharp (`tests/images.ts` : même calcul que le worker, sous
  Node) — copie réduite et recompressée ≤ 4 bits, éclaircie ≤ 6 bits, photos différentes > 16 bits, photo floue (même
  plus claire) moins nette ; regroupement (copies exactes et suggestion de l'originale, quasi identiques selon le
  réglage, images uniformes écartées, similaires selon la ressemblance et l'écart de temps, garde-fou contre les
  chaînes, photos sans date jamais similaires, ordre et identifiant des groupes, photos qui ont besoin du modèle) ;
  traductions.
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

## 6. Conventions

Les mêmes que Rank It All : messages de commit et commentaires en français, sobres ; textes de l'interface jamais en
dur (dictionnaires, 6 langues) ; un mot plutôt qu'une icône seule ; vérifier les écrans aux formats téléphone et PC ;
docs (README, ARCHITECTURE, ROADMAP) et tests livrés avec chaque changement ; push sur `main` une fois vérifié.
