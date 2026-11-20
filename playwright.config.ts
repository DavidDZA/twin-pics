import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout (npm run e2e) : l'appli construite, dans le Chrome installé, formats téléphone et PC, sur un
 * dossier de photos d'essai généré au lancement (`e2e/photos.ts`). Le test du modèle (photos similaires) le
 * télécharge depuis Hugging Face : il ne tourne qu'avec E2E_MODELE=1.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 2,
  reporter: [['list']],
  globalSetup: './e2e/photos.ts',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    locale: 'fr-FR',
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'téléphone', use: { viewport: { width: 393, height: 760 }, isMobile: true, hasTouch: true } },
    { name: 'pc', use: { viewport: { width: 1280, height: 860 } } },
  ],
});
