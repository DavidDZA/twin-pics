# Feuille de route — ce qui reste à faire

> État au 24/11/2026 (version 0.8.1). Comment l'appli marche : [ARCHITECTURE.md](ARCHITECTURE.md). Réflexions de départ :
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
> visionneuse (et glisser le doigt) ; habillage plus « fun » (ARCHITECTURE § 2.2). Idée de l'utilisateur : détecter
> les photos « pas intéressantes » — discutée, puis faite en 0.4.
>
> (22/11) **Version 0.4, photos inutiles** (ARCHITECTURE § 4.3) : onglet « Inutiles » (floues, sombres, claires,
> presque vides, captures par des règles ; documents, tickets, mèmes, prises par erreur par MobileCLIP), regroupées sans
> limite de temps, mode **swipe** (je garde / je jette) ; seuils calibrés sur 1 493 photos de l'utilisateur. La
> première analyse en 0.4 relit une fois toutes les photos (nouvelles mesures, et MobileCLIP).
>
> (23/11) **Essai de la 0.4 par l'utilisateur** (850 photos en 1 min 30) : modèle « retéléchargé » à chaque fois, appli
> lente à s'ouvrir, swipe à faire image par image et sans résumé, un cas bizarre (photos noires en double d'une photo de
> mer), fonctions à séparer, choix à pouvoir effacer, « Bien trouvé » / « Pas des doublons » sans effet, zoom manquant.
> Les erreurs des photos inutiles ne sont « pas graves pour l'instant ».
>
> (23/11) **Version 0.5**, en réponse : doublons et photos inutiles séparés (ARCHITECTURE § 1), swipe photo par photo
> (§ 4.3), « Pas des doublons » met vraiment le groupe de côté et « Effacer mes choix » (§ 4.4), zoom (§ 4.5), stats et
> badges (§ 4.6), toutes les copies exactes en un bouton (§ 4.2), photos noires hors des doublons (§ 3.3), modèles ni
> rechargés ni annoncés « téléchargés » à tort (§ 3), installateur (§ 2.1 : 36 s d'ouverture pour l'exe portable).
>
> (23/11) Essai de la 0.5 : **« tout est nickel »**. Demandes : une barre au démarrage, passer des doublons aux inutiles en
> un clic, 50 badges ; installateur pas compris (« il installe où ? »). **Version 0.6** : barre d'ouverture et portable
> rapide (0,4 s dès le deuxième lancement), installateur avec assistant, « Doublons | Photos inutiles », 50 badges
> (ARCHITECTURE § 1, § 2.1, § 4.6).
>
> (23/11) Essai de la 0.6 : « ça s'ouvre ultra vite ». **Version 0.7** : une seule page (plus de choix doublons / inutiles
> ni de « Retour » ; « Relancer », « Autre dossier » et « Effacer tous mes choix… » en haut), plus d'installateur.
>
> (24/11) **Version 0.8** (0.8.1 pour la poignée ; la 0.8.0 n'a pas été publiée), demandée par l'utilisateur : **plusieurs dossiers à la fois** (ARCHITECTURE § 1.1) : liste retenue,
> doublons d'un dossier à l'autre, copie du dossier le plus haut proposée (ordre à la poignée ⠿, comme Rank It All, demandé
> pendant le premier essai), « À supprimer » dans chaque dossier.
>
> **Reprendre ici** : 0.8 en cours d'essai par l'utilisateur. À regarder : le clic de plus (« Analyser »), l'ordre des
> dossiers, l'avertissement pour une sauvegarde. Ensuite, proposé : un vrai ménage de ses photos (seule l'utilisation
> montrera les manques), puis l'**appli Android** (§ 5.3, **rien commencer sans son feu vert**). Petits plus possibles
> avant, sur PC : astuces de première visite et annonce des nouvelles versions (§ 3), vidéos en double (§ 6).

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

### 1.2 Décisions du 23/11/2026

- **Ni Mac, ni iPhone / iPad** : pas de version, pas d'effort particulier (PhotoKit, signature Apple…).
- **WhatsApp seulement sur Android** (pas sous Windows, où les images n'indiquent pas leur conversation).
- **Deux fonctions séparées** : doublons, photos inutiles ; une seule page, un clic pour passer de l'une à l'autre.
- **Plus d'installateur** : seulement l'exe portable.
- Android : ne rien commencer pour l'instant.

## 2. Mesurer la détection sur les vraies photos (prochaine étape)

1. Lancer l'analyse sur un vrai dossier ; noter le nombre de photos et la durée de chaque étape (analyse, modèle).
2. Parcourir les groupes, marquer « Pas des doublons » les erreurs, jouer avec les curseurs.
3. Choisir les seuils par défaut à partir des groupes mis de côté (comme les propositions de Rank It All : test hors
   ligne sur les vraies données). Il faudra un **export** (groupes mis de côté + scores des paires).
4. Groupes manqués : ajouter un moyen de dire « ces deux photos sont des doublons » (aujourd'hui, seules les erreurs
   des groupes trouvés se voient).
5. Photos inutiles : même démarche — « Pas inutiles », « Je garde », mesures de qualité et scores MobileCLIP exportés, pour
   revoir `blurMax`, `clipMin` et `groupMin` (calibrage de départ : ARCHITECTURE § 4.3).

Questions encore ouvertes : nombre de photos ; vidéos ; ce que « similaire » veut dire pour l'utilisateur (rafales, même
scène à quelques minutes, copies retouchées).

## 3. Appli PC utilisable

- ~~**Trier** : duels, grille, « garder la suggestion », « tout supprimer », « passer »~~ — fait le 22/11 (0.3).
- ~~**Supprimer sans risque** : Corbeille de Windows ou dossier « À supprimer », récapitulatif, annulation~~ — fait le
  22/11 (0.3), dans l'appli PC seulement. Annulation : seulement pour le dossier « À supprimer », juste après (la
  Corbeille se vide ou se restaure depuis Windows).
- ~~**Ménage des copies exactes** en un bouton~~ — fait le 23/11 (0.5).
- Site : supprimer aussi (dossier « À supprimer » par la File System Access API en écriture) ? Pas utile tant que le
  site ne sert qu'aux essais.
- ~~**Plusieurs dossiers à la fois**~~ — fait le 24/11 (0.8). Reste, si besoin : déclarer un dossier « sauvegarde » (comparé,
  jamais supprimé).
- Exe : signature de code (évite l'avertissement de Windows, payante) ; annonce d'une nouvelle version (un exe portable ne se met pas à jour tout
  seul : prévenir et ouvrir la page des *Releases*). ~~Installateur~~ — fait en 0.5, retiré en 0.7.
- HEIC (certains téléphones Android aussi) dans l'appli PC : décodage par le processus principal (sharp / libheif), si
  l'utilisateur en a.
- ~~Groupes « pas des doublons » qui ne reviennent plus ; stats et badges~~ — fait le 23/11 (0.5). Reste : astuces de
  première visite (comme Rank It All).
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

## 5. Autres sources de photos

1. **Google Drive** : API Drive (connexion Google), `md5Checksum` sans téléchargement, miniatures analysées sur
   l'appareil, corbeille Drive. Accès complet = portée restreinte : vérification de sécurité payante pour une appli
   publique ; jusqu'à 100 testeurs déclarés sans.
2. **Google Photos** : l'API ne donne plus la bibliothèque depuis le 31/03/2025 ; passer par les copies du téléphone,
   ou un export **Google Takeout** sur le PC (que le prototype sait déjà lire comme un dossier).
3. **Android** (décidé le 22/11 : **Capacitor** ; rien à commencer avant le feu vert de l'utilisateur) : la même interface (React) dans une WebView, avec un module natif
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

## 6. Plus tard

### 6.1 Photos inutiles : la suite

~~Règles simples et MobileCLIP, groupes sans limite de temps, mode swipe~~ — fait le 22/11 (0.4, ARCHITECTURE § 4.3).
Restent :

- **WhatsApp par conversation ou groupe** (demandé le 22/11, « on verra plus tard ») : filtrer les images reçues par
  conversation, et marquer une conversation « normale » ou « poubelle » (tout ce qui en vient est proposé). **Sur Android
  seulement** (décision du 23/11) : dossiers par conversation dans certaines versions, à vérifier.
- Apprendre des choix de l'utilisateur (« Pas inutiles », « Je garde ») pour ajuster les seuils, voire un
  petit classifieur sur les vecteurs MobileCLIP.
- Mesurer la vitesse de MobileCLIP sur 10 000 photos (carte graphique, processeur) et le regroupement au-delà de
  4 000 photos inutiles.

Captures d'écran, photos floues ou ratées, mèmes reçus, vidéos en double ; visages et yeux ouverts (MediaPipe, local)
pour la suggestion ; préférences apprises des duels.
