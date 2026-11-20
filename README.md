# Twin Pics

Retrouver les photos en double et garder la meilleure. Tout se passe **sur l'appareil** : aucune photo n'est
envoyée sur un serveur. Gratuit, sans publicité, open source. En 6 langues (français, anglais, espagnol, allemand,
italien, portugais du Brésil), selon l'appareil ou au choix.

**État : prototype PC** (version 0.2, 21/11/2026). Il trouve les groupes de doublons d'un dossier et sert à régler la
détection sur de vraies photos. Il ne supprime encore rien.

## Ce qu'il trouve

| Niveau | Exemple | Comment |
|---|---|---|
| **Copies exactes** | le même fichier deux fois, copie WhatsApp identique | empreinte SHA-256 (seulement pour les fichiers de même taille) |
| **Quasi identiques** | même photo redimensionnée, recompressée, un peu retouchée | empreinte perceptuelle dHash (64 bits), cherchée partout |
| **Similaires** | rafale, même scène prise plusieurs fois | modèle DINOv2-small exécuté dans le navigateur (sur la carte graphique si possible), seulement entre photos prises à quelques minutes d'écart (date EXIF) |

Pour chaque groupe, une **suggestion** : l'originale (pas la copie WhatsApp), la plus grande, ou la plus nette. Des
curseurs règlent les seuils en direct, et chaque groupe peut être marqué « Bien trouvé » ou « Pas des doublons » :
ces réponses serviront à choisir les meilleurs réglages.

## Utilisation

Ouvrir le site dans **Chrome ou Edge sur PC**, « Choisir un dossier de photos » (sous-dossiers compris). La première
analyse lit toutes les photos ; les suivantes ne relisent que les nouvelles. Les photos HEIC (iPhone) et les vidéos
ne sont pas encore analysées. Chaque photo n'est lue qu'une fois ; sur un disque dur, la vitesse du disque
fixe la durée (environ 15 min pour 56 Go).

## Développement

```sh
npm install
npm run dev      # http://localhost:5173
npm run build
npm test         # tests automatiques (Vitest), aussi lancés avant chaque déploiement
npm run e2e      # tests de bout en bout (Playwright, Chrome installé, formats téléphone et PC)
E2E_MODELE=1 npm run e2e   # idem, avec les tests des photos similaires (télécharge le modèle)
node tools/vitesse/mesure.mjs [dossier]   # banc de mesure de vitesse (décodage, modèle processeur / carte graphique)
```

Stack : Vite, React, TypeScript, Dexie (IndexedDB), exifr, Transformers.js (ONNX Runtime Web), Vitest, Playwright.

Fonctionnement détaillé : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Suite du projet : [docs/ROADMAP.md](docs/ROADMAP.md).

## Déploiement

Chaque push sur `main` déploie sur GitHub Pages via `.github/workflows/deploy.yml`
(Settings → Pages → Source : **GitHub Actions**).

## Licence

[MIT](LICENSE) © 2026 Super Bobiz. Modèle DINOv2 (Meta) : licence Apache 2.0.
