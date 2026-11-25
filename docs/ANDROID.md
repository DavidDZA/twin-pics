# Appli Android — mise en route

Le téléphone de l'utilisateur est professionnel (pas d'APK hors magasin) : les essais passent par le **test interne** de la
Play Console, comme Rank It All. Le test interne n'est pas soumis à l'examen complet de Google ; l'appli arrive en quelques
minutes sur les comptes choisis.

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

La version est celle de `package.json` (0.12.0 → code 1200) : elle doit augmenter à chaque envoi dans la Play Console.
`.github/workflows/android.yml` compile, essaie l'appli sur un téléphone simulé et, sur `main`, signe `twin-pics.aab`.
