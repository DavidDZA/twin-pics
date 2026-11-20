# Feuille de route — ce qui reste à faire

> État au 20/11/2026. Comment l'appli marche : [ARCHITECTURE.md](ARCHITECTURE.md). Réflexions de départ :
> `DavidDZA\IDEES-APPLIS.md`, idée 1.
>
> Fait (20/11) : **prototype PC** — dossier choisi dans Chrome / Edge, copies exactes, quasi identiques et similaires
> (modèle DINOv2 dans le navigateur), suggestion de la photo à garder, curseurs de réglage en direct, réponses « Bien
> trouvé » / « Pas des doublons » gardées, visionneuse, 6 langues, tests Vitest et Playwright, déploiement GitHub Pages.
>
> **Reprendre ici** : l'utilisateur essaie le prototype sur ses vraies photos (un dossier de quelques milliers pour
> commencer), dit ce qui est bien ou mal trouvé, et note le temps d'analyse.

## 1. Décisions prises (20/11/2026)

- Photos de l'utilisateur : **dossiers du PC**, **galerie du téléphone**, **Google Photos**.
- Appli **publiée** : dépôt public, open source (MIT), 6 langues, Play Store plus tard.
- On commence par le **prototype PC**. Nom : **Twin Pics**.

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

- **Trier** : duels dans un groupe (la gagnante affronte la suivante), grille « touche celles à garder », « garder la
  suggestion » en un geste, « tout supprimer », « passer ».
- **Supprimer sans risque** : déplacer dans un dossier « À supprimer » choisi par l'utilisateur (une appli web efface
  définitivement, sans corbeille Windows) ; récapitulatif avant d'appliquer (« 37 photos, 412 Mo ») ; annulation.
  Demande l'accès en écriture au dossier (`mode: 'readwrite'`).
- **Ménage des copies exactes** en un bouton, avec la copie à garder choisie par règle (dossier d'origine).
- Groupes « pas des doublons » qui ne reviennent plus.
- Stats et badges (place libérée, photos triées), astuces de première visite (comme Rank It All).
- PWA (installable, hors ligne).

## 4. Performances (à mesurer d'abord)

- Grosse bibliothèque (50 000 photos) : comparaison dHash de toutes les paires (1,25 milliard, quelques secondes dans
  un worker) → index multi-blocs si besoin ; miniatures en base (≈ 500 Mo) → n'en garder que pour les photos d'un
  groupe possible.
- Modèle : WebGPU quand il est disponible (bien plus rapide que WebAssembly), ou plusieurs fils d'exécution
  (isolation cross-origin, impossible sur GitHub Pages sans astuce de service worker) ; ne calculer les vecteurs que
  des photos datées avec une voisine (déjà le cas).
- Décodage : Chrome décode la photo entière ; la miniature EXIF intégrée pourrait servir au tri préalable.
- HEIC (iPhone) : décodeur WebAssembly (libheif) si l'utilisateur en a.

## 5. Autres sources de photos

1. **Google Drive** : API Drive (connexion Google), `md5Checksum` sans téléchargement, miniatures analysées sur
   l'appareil, corbeille Drive. Accès complet = portée restreinte : vérification de sécurité payante pour une appli
   publique ; jusqu'à 100 testeurs déclarés sans.
2. **Google Photos** : l'API ne donne plus la bibliothèque depuis le 31/03/2025 ; passer par les copies du téléphone,
   ou un export **Google Takeout** sur le PC (que le prototype sait déjà lire comme un dossier).
3. **Android** : appli native (Capacitor + module natif MediaStore, corbeille système d'Android 11+), déclaration de
   la permission photos sur le Play Store (fonction principale de l'appli : autorisée), test fermé de 14 jours.
4. iPhone (PhotoKit), plus tard.

## 6. Plus tard

Captures d'écran, photos floues ou ratées, mèmes reçus, vidéos en double ; visages et yeux ouverts (MediaPipe, local)
pour la suggestion ; préférences apprises des duels.
