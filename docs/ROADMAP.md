# Feuille de route — ce qui reste à faire

> État au 22/11/2026. Comment l'appli marche : [ARCHITECTURE.md](ARCHITECTURE.md). Réflexions de départ :
> `DavidDZA\IDEES-APPLIS.md`, idée 1.
>
> Fait (20/11) : **prototype PC** — dossier choisi dans Chrome / Edge, copies exactes, quasi identiques et similaires
> (modèle DINOv2 dans le navigateur), suggestion de la photo à garder, curseurs de réglage en direct, réponses « Bien
> trouvé » / « Pas des doublons » gardées, visionneuse, 6 langues, tests Vitest et Playwright, déploiement GitHub Pages.
>
> (21/11) Premier essai de l'utilisateur : 10 000 photos (56 Go, disque dur) en 15 min + 50 min de photos similaires.
> **Version 0.2** : chaque photo lue une seule fois, modèle sur la carte graphique (WebGPU) pendant l'analyse, lectures
> limitées à 2 à la fois ; 4 fois plus rapide sur des photos de 12 Mpx (ARCHITECTURE § 3.5).
>
> (21/11) Essai de la version 0.2 par l'utilisateur sur ses vraies photos : **« la détection a super bien marché »**.
> Projet mis en pause, à reprendre plus tard.
>
> (22/11) **Version 0.3, appli PC** (décisions § 1.1) : exe portable (Electron), le site gardé pour essayer ; tri en
> **grille** (PC) ou en **duels** (téléphone, portrait et paysage), bouton pour passer de l'un à l'autre ; garder une
> photo, plusieurs ou aucune ; fenêtre « Avant de supprimer » ; Corbeille de Windows ou dossier « À supprimer » au
> choix, annulable ; tri retenu entre deux lancements. ARCHITECTURE § 2.1 et § 4.
>
> (22/11, retour de l'utilisateur) **Version 0.3.1** : un groupe de deux photos va directement au résumé en mode
> duels ; bouton « Plein écran » sur chaque photo (grille et duels) ; flèches à gauche et à droite dans la
> visionneuse (et glisser le doigt) ; habillage plus « fun » (ARCHITECTURE § 2.2). Question ouverte : détecter les
> photos « pas intéressantes » (§ 6.1), en discussion avant de coder.
>
> **Reprendre ici** : retour de l'utilisateur sur l'exe (télécharger `Twin Pics 0.3.0.exe` dans les *Releases*,
> l'essayer sur un vrai dossier, d'abord avec le dossier « À supprimer » pour pouvoir annuler). Puis § 3 (ménage des
> copies exactes en un bouton…) ou § 5.3 (appli Android).

## 1. Décisions prises (20/11/2026)

- Photos de l'utilisateur : **dossiers du PC**, **galerie du téléphone**, **Google Photos**.
- Appli **publiée** : dépôt public, open source (MIT), 6 langues, Play Store plus tard.
- On commence par le **prototype PC**. Nom : **Twin Pics**.

### 1.1 Décisions du 22/11/2026

- **PC : un exe** (Electron), pas un site ; le site reste pour les essais (il ne supprime pas).
- **Android : Capacitor** (§ 5.3).
- **Deux façons de trier**, avec un bouton pour passer de l'une à l'autre : **grille** sur PC (tout le groupe à
  l'écran, plus de place), **duels** sur téléphone. Sur Android, penser au **paysage** (pour regarder les photos).
- Cas de base : **garder une seule photo** ; possible d'en garder plusieurs, ou de toutes les supprimer.
- **Récapitulatif** avant de supprimer vraiment (ce qui est gardé / supprimé).
- Questions posées le 22/11, réponses : photos supprimées **au choix** (Corbeille de Windows ou dossier « À
  supprimer ») ; grille = **tout le groupe d'un coup** (pas 4 par 4 en séries) ; duels = **duel simple + résumé** (le
  duel choisit la meilleure, garder plusieurs ou aucune se fait dans le résumé du groupe) ; suppression **à la fin, en
  une fois** (pas après chaque groupe).

## 2. Mesurer la détection sur les vraies photos (prochaine étape)

1. Lancer l'analyse sur un vrai dossier ; noter le nombre de photos et la durée de chaque étape (analyse, modèle).
2. Parcourir les groupes, répondre « Bien trouvé » / « Pas des doublons », jouer avec les curseurs.
3. Choisir les seuils par défaut à partir des réponses (comme les propositions de Rank It All : test hors ligne sur
   les vraies données). Il faudra un **export des réponses** (labels + scores des paires) pour le faire hors de l'appli.
4. Groupes manqués : ajouter un moyen de dire « ces deux photos sont des doublons » (aujourd'hui, seules les erreurs
   des groupes trouvés se voient).

Questions encore ouvertes : nombre de photos ; vidéos ; iPhone ; ce que « similaire » veut dire pour l'utilisateur
(rafales, même scène à quelques minutes, copies retouchées).

## 3. Appli PC utilisable

- ~~**Trier** : duels, grille, « garder la suggestion », « tout supprimer », « passer »~~ — fait le 22/11 (0.3).
- ~~**Supprimer sans risque** : Corbeille de Windows ou dossier « À supprimer », récapitulatif, annulation~~ — fait le
  22/11 (0.3), dans l'appli PC seulement. Annulation : seulement pour le dossier « À supprimer », juste après (la
  Corbeille se vide ou se restaure depuis Windows).
- **Ménage des copies exactes** en un bouton : marquer tous les groupes « copies exactes » non triés avec la
  suggestion seule (l'originale), puis la fenêtre « Avant de supprimer ».
- Site : supprimer aussi (dossier « À supprimer » par la File System Access API en écriture) ? Pas utile tant que le
  site ne sert qu'aux essais.
- Exe : signature de code (évite l'avertissement de Windows, payante) ; mise à jour automatique (electron-updater et
  les *Releases*) ; installateur plutôt que portable si l'utilisateur le préfère.
- HEIC dans l'appli PC : décodage par le processus principal (sharp / libheif) au lieu du navigateur.
- Groupes « pas des doublons » qui ne reviennent plus.
- Stats et badges (place libérée, photos triées), astuces de première visite (comme Rank It All).
- PWA (installable, hors ligne).

## 4. Performances (à mesurer d'abord)

- Grosse bibliothèque (50 000 photos) : comparaison dHash de toutes les paires (1,25 milliard, quelques secondes dans
  un worker) → index multi-blocs si besoin ; miniatures en base (≈ 500 Mo) → n'en garder que pour les photos d'un
  groupe possible.
- ~~Modèle sur la carte graphique, une seule lecture des photos~~ — fait le 21/11 (version 0.2). Reste, sur le
  processeur : plusieurs fils d'exécution (isolation cross-origin, impossible sur GitHub Pages sans astuce de service
  worker).
- Décodage (110 ms par photo de 12 Mpx) : décoder directement à taille réduite (−20 %) quand les dimensions sont
  connues (EXIF) ; la miniature EXIF intégrée pourrait servir au tri préalable.
- HEIC (iPhone) : décodeur WebAssembly (libheif) si l'utilisateur en a.

## 5. Autres sources de photos

1. **Google Drive** : API Drive (connexion Google), `md5Checksum` sans téléchargement, miniatures analysées sur
   l'appareil, corbeille Drive. Accès complet = portée restreinte : vérification de sécurité payante pour une appli
   publique ; jusqu'à 100 testeurs déclarés sans.
2. **Google Photos** : l'API ne donne plus la bibliothèque depuis le 31/03/2025 ; passer par les copies du téléphone,
   ou un export **Google Takeout** sur le PC (que le prototype sait déjà lire comme un dossier).
3. **Android** (décidé le 22/11 : **Capacitor**) : la même interface (React) dans une WebView, avec un module natif
   (Kotlin) pour la galerie :
   - liste des photos par **MediaStore** (`READ_MEDIA_IMAGES`, Android 13+ ; accès partiel « photos choisies » à
     gérer), lecture des fichiers par un chemin servi à la WebView (comme `app://` sur PC) ;
   - suppression par la **corbeille système** (`MediaStore.createTrashRequest`, Android 11+ : une seule
     confirmation d'Android pour tout le lot, récupérable 30 jours dans Google Photos / la galerie) ;
   - nouvelle plateforme dans `src/platform/` (à côté de `desktop`) ; duels par défaut ; paysage déjà prêt (§ 4.1
     d'ARCHITECTURE) ;
   - à vérifier tôt : WebGPU dans la WebView Android (sinon modèle sur le processeur, plus lent), mémoire avec
     10 000 photos, vitesse de décodage sur téléphone ;
   - publication : le téléphone de l'utilisateur est professionnel (pas d'APK hors magasin) → test interne de la Play
     Console dès les premiers essais (comme Rank It All), déclaration de la permission photos (fonction principale :
     autorisée), test fermé de 14 jours avant la production. Compilation par GitHub Actions (rien à installer sur le
     PC), comme l'AAB de Rank It All.
4. iPhone (PhotoKit), plus tard.

## 6. Plus tard

### 6.1 Photos « pas intéressantes » (idée de l'utilisateur, 22/11/2026)

Une nouvelle catégorie à côté des doublons : photos floues, ratées (trop sombres, brûlées, prises dans la poche),
captures d'écran, photos de documents ou de tickets, images reçues par messagerie. Pistes proposées à l'utilisateur,
à décider avant de coder : d'abord des règles simples sur ce que l'analyse calcule déjà ou presque (netteté, exposition,
image presque uniforme, format d'écran sans appareil photo dans l'EXIF, dossier WhatsApp…), chaque photo avec sa
raison ; ensuite un modèle qui comprend des phrases (CLIP / MobileCLIP) pour « un ticket de caisse », « une capture
d'écran », « une photo floue » ; enfin, apprendre des choix de l'utilisateur.

Captures d'écran, photos floues ou ratées, mèmes reçus, vidéos en double ; visages et yeux ouverts (MediaPipe, local)
pour la suggestion ; préférences apprises des duels.
