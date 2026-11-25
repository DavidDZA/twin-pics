import { defineConfig } from '@playwright/test';

/**
 * La vraie appli Android, sur un téléphone simulé (`npm run e2e:android`, lancé par `.github/workflows/android.yml`) :
 * il faut un appareil visible par `adb` et l'APK de débogage construit (`TP_APK`).
 */
export default defineConfig({
  testDir: 'e2e-android',
  timeout: 400_000,
  workers: 1,
  retries: 1,
  reporter: [['list'], ['github']],
  globalSetup: './e2e/photos.ts',
});
