# Appli Android — mise en route

Le téléphone de l'utilisateur est professionnel (pas d'APK hors magasin) : les essais passent par le **test interne** de la
Play Console, comme Rank It All. Le test interne n'est pas soumis à l'examen complet de Google ; l'appli arrive en quelques
minutes sur les comptes choisis.

## État au 25/11/2026 (version 0.12.1)

| Étape | État |
|---|---|
| Code, 6 langues, tests, docs, règles de confidentialité | fait |
| Compilation et essai sur téléphone simulé (GitHub Actions) | vert |
| Secrets de signature dans le dépôt `twin-pics` | **à faire** (§ 1) ; sans eux, le workflow est vert mais ne produit pas `twin-pics.aab` |
| Appli dans la Play Console, test interne | **à faire** (§ 1) |
| Premier essai sur un vrai téléphone, mesures | **à faire** (§ 2) |
| Fiche du Store, test fermé (14 jours), production | plus tard (ROADMAP § 5) |

**Vérifié sur le téléphone simulé** (Android 15, WebView 124) : autorisation, liste de la galerie, analyse, photos d'origine
affichées, paysage, corbeille d'Android refusée puis acceptée, annulation, bouton Retour jusqu'à l'arrière-plan, photos
similaires sur le processeur (16 photos en 26 à 40 s, téléchargement du modèle compris : ne dit rien d'un vrai téléphone).

**Pas vérifié** : vitesse, mémoire sur une grande galerie, carte graphique (pas utilisable sur le téléphone simulé),
documents et mèmes (MobileCLIP), « photos choisies » d'Android 14 et Android 11 à 13 (testés seulement avec une fausse
galerie, ou pas du tout), carte SD, bascule clair / sombre, page rouverte par manque de mémoire.

## 1. Par l'utilisateur, une seule fois

1. **Clé de signature** : la même clé de dépôt que Rank It All convient (`upload-key.p12`, alias `upload`). Sur GitHub,
   dépôt `twin-pics` → *Settings → Secrets and variables → Actions → New repository secret*, deux secrets identiques à
   ceux de Rank It All :
   - `ANDROID_KEYSTORE_BASE64` : la clé en base64. Dans PowerShell, à côté du fichier :
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\upload-key.p12")) | Set-Clipboard`, puis coller ;
   - `ANDROID_KEYSTORE_PASSWORD` : son mot de passe.
2. **Play Console** → *Créer une application* : nom **Twin Pics**, langue par défaut anglais (en-US), application,
   gratuite. Le nom du paquet est `io.github.daviddza.twinpics` (fixé par le premier envoi).
3. Sur GitHub : *Actions → Appli Android → Run workflow* (branche `main`). À la fin, télécharger l'artefact
   **twin-pics-android** (il contient `twin-pics.aab`).
4. **Play Console** → *Tester et publier → Tests → Tests internes* : créer une version, importer `twin-pics.aab` ;
   onglet *Testeurs* : une liste avec l'adresse Google du téléphone ; copier le lien d'inscription et l'ouvrir sur le
   téléphone.
5. Ce que la Play Console peut demander au passage :
   - **Règles de confidentialité** : `https://daviddza.github.io/twin-pics/confidentialite.html` ;
   - **Autorisations photos et vidéos** (`READ_MEDIA_IMAGES`) : fonction principale de l'appli (gestion de la galerie :
     trouver et supprimer les doublons), accès fréquent à toutes les photos ;
   - **Sécurité des données** : aucune donnée collectée ni partagée ; **annonces** : non ; **identifiant publicitaire** : non.

## 2. Le premier essai : ce qu'on cherche à savoir

Noter, dans la barre du haut des résultats (« Analyse faite en… », « calculées par la carte graphique / le processeur ») :

1. une analyse **sans** les deux cases (doublons et règles simples) : nombre de photos, durée, l'appli tient-elle ?
2. puis avec « Chercher aussi les photos similaires », d'abord sur **un seul dossier** de quelques centaines de photos :
   durée, carte graphique ou processeur ;
3. puis avec les documents et mèmes, pareil ;
4. supprimer quelques photos, les revoir dans la corbeille de la galerie, les remettre.

Ces chiffres diront s'il faut un moteur natif pour les modèles (ROADMAP § 5).

## 3. Chaque nouvelle version

La version est celle de `package.json` (0.12.1 → code 1201) : elle doit augmenter à chaque envoi dans la Play Console.
`.github/workflows/android.yml` compile, essaie l'appli sur un téléphone simulé et, sur `main`, signe `twin-pics.aab`.
Les étapes et les erreurs se lisent sans connexion par l'API de GitHub (annotations du workflow) ; l'APK d'essai, les
captures et l'AAB sont dans ses artefacts (connexion requise).

## 4. À savoir

- Google Play exige l'**API 36** pour les nouvelles applis depuis le 31/08/2026 : c'est la version visée
  (`android/variables.gradle`). Source : developer.android.com/google/play/requirements/target-sdk.
- **WebGPU dans la WebView** : annoncé à partir de la version 146 ; `shader-f16`, dont l'appli a besoin, n'est confirmé nulle
  part pour la WebView. Seul un vrai téléphone le dira. Source : annonce « WebGPU Compatibility mode » de blink-dev.
- **Corbeille** : lots de 1 000 par prudence ; la limite exacte d'Android n'a pas été retrouvée dans la documentation.
- `npx cap sync android` ne touche pas au code natif ; `android/app/src/main/assets/` et `capacitor-cordova-android-plugins/`
  sont regénérés (hors du dépôt).
