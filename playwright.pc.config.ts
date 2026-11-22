import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout de l'appli PC (`npm run e2e:pc`) : la vraie appli Electron (construite par `npm run build`),
 * sur une copie du dossier de photos d'essai (`e2e/photos.ts`) ; la Corbeille est remplacée par un dossier d'essai.
 * `npm run e2e:exe` : les mêmes tests sur l'exe empaqueté.
 */
export default defineConfig({
  testDir: 'e2e-pc',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/photos.ts',
  use: { trace: 'retain-on-failure', locale: 'fr-FR' },
});
