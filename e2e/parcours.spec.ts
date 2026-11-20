import { expect, test, type Page } from '@playwright/test';
import { PHOTOS_DIR } from './photos';

/** Analyse le dossier d'essai (par le champ d'envoi de dossier), photos similaires comprises ou non. */
async function analyze(page: Page, similar = false) {
  await page.goto('/');
  const box = page.getByRole('checkbox', { name: /photos similaires/ });
  if ((await box.isChecked()) !== similar) await box.click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('photos analysées')).toBeVisible({ timeout: similar ? 120_000 : 30_000 });
}

const tile = (page: Page, label: string) => page.locator('.tile', { hasText: label }).locator('strong');

test('départ : promesse, confidentialité, option des photos similaires', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Retrouve tes photos en double')).toBeVisible();
  await expect(page.getByText('aucune photo n’est envoyée')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choisir un dossier de photos' })).toBeVisible();
  await expect(page.getByText(/Un modèle de 45 Mo/)).toBeVisible();
});

test('trouve les copies exactes et les quasi identiques', async ({ page }) => {
  await analyze(page);
  // 8 photos lisibles (la photo cassée, le HEIC et la vidéo sont à part).
  await expect(tile(page, 'photos analysées')).toHaveText('8');
  await expect(page.getByText(/1 photo illisible, 1 photo HEIC \(iPhone\).*1 vidéo/)).toBeVisible();

  const groups = page.getByTestId('group');
  await expect(groups).toHaveCount(2);

  // Copies exactes : chat.jpg proposée plutôt que « chat - Copie.jpg ».
  await page.getByRole('tab', { name: /Copies exactes/ }).click();
  await expect(groups).toHaveCount(1);
  const exact = groups.first();
  await expect(exact.locator('li.best .name')).toHaveText('chat.jpg');
  await expect(exact.getByText('Suggestion · l’originale')).toBeVisible();
  await expect(exact.getByText('identique')).toBeVisible();

  // Quasi identiques : plage.jpg, sa copie WhatsApp et la version réduite ; la plus grande proposée.
  await page.getByRole('tab', { name: /Quasi identiques/ }).click();
  await expect(groups).toHaveCount(1);
  const near = groups.first();
  await expect(near.locator('li')).toHaveCount(3);
  await expect(near.locator('li.best .name')).toHaveText('plage.jpg');
  await expect(near.locator('li', { hasText: 'IMG-20240714-WA0001.jpg' })).toContainText('identique');
  await expect(near.locator('li', { hasText: 'plage-petite.jpg' })).toContainText('640 × 480');

  // Sans le modèle, pas de photos similaires.
  await page.getByRole('tab', { name: /Similaires/ }).click();
  await expect(page.getByText('Aucun doublon trouvé avec ces réglages.')).toBeVisible();
});

test('les curseurs refont les groupes en direct', async ({ page }) => {
  await analyze(page);
  await expect(page.getByTestId('group')).toHaveCount(2);
  await page.getByText('Réglages de la détection').click();
  const slider = page.locator('.slider', { hasText: 'Quasi identiques' }).locator('input');
  await slider.fill('16');
  await expect(page.locator('.slider', { hasText: 'Quasi identiques' }).locator('output')).toHaveText('16 bits sur 64');
  await page.getByRole('button', { name: 'Réglages par défaut' }).click();
  await expect(page.locator('.slider', { hasText: 'Quasi identiques' }).locator('output')).toHaveText('8 bits sur 64');
});

test('« bien trouvé » est retenu, et une nouvelle analyse ne refait rien', async ({ page }) => {
  await analyze(page);
  await expect(page.getByText(/nouvelles?\)/)).toBeVisible();
  const first = page.getByTestId('group').first();
  await first.getByRole('button', { name: 'Bien trouvé' }).click();
  await expect(first.getByRole('button', { name: 'Bien trouvé' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Vérifiés : 1 bien trouvé, 0 erreur')).toBeVisible();

  // Même dossier, nouvelle analyse : tout vient de la base, la réponse est toujours là.
  await page.getByRole('button', { name: 'Autre dossier' }).click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('rien de nouveau')).toBeVisible();
  await expect(page.getByTestId('group').first().getByRole('button', { name: 'Bien trouvé' })).toHaveAttribute('aria-pressed', 'true');
});

test('visionneuse : photo en grand, suivante, fermeture', async ({ page }) => {
  await analyze(page);
  const group = page.getByTestId('group').first();
  await group.locator('.thumb').first().click();
  const viewer = page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();
  await expect(viewer).toContainText('1 / 2');
  await viewer.getByRole('button', { name: /Suivante/ }).click();
  await expect(viewer).toContainText('2 / 2');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('miniatures affichées, aucune barre de défilement horizontale', async ({ page }) => {
  await analyze(page);
  const img = page.getByTestId('group').first().locator('.thumb img').first();
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('langue : en anglais, toute l’interface suit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Langue' }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Choose a photo folder' })).toBeVisible();
  await page.getByRole('checkbox', { name: /similar photos/ }).uncheck();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('photos analyzed')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Exact copies/ })).toBeVisible();
  await expect(page.getByText('Suggestion · the original')).toBeVisible();
});

/** La rafale d'essai (cadrage décalé, plus claire, floue) dans l'onglet « Similaires », la plus nette proposée. */
async function expectBurst(page: Page) {
  await page.getByText('Réglages de la détection').click();
  // Ressemblance minimale abaissée : la rafale d'essai ressemble à environ 87 %.
  await page.locator('.slider', { hasText: 'ressemblance minimale' }).locator('input').fill('80');
  await page.getByRole('tab', { name: /Similaires/ }).click();
  const group = page.getByTestId('group').first();
  await expect(group).toBeVisible();
  await expect(group.locator('li')).toHaveCount(2);
  await expect(group.locator('li.best .name')).toHaveText('rafale-1.jpg');
  await expect(group.getByText('Suggestion · la plus nette')).toBeVisible();
  await expect(group.getByText(/ressemble à \d+ %/)).toBeVisible();
}

test.describe('modèle des photos similaires (téléchargé : E2E_MODELE=1)', () => {
  test.skip(!process.env.E2E_MODELE, 'télécharge le modèle');
  test.setTimeout(240_000);

  test('carte graphique si possible, rafale trouvée pendant l’analyse', async ({ page }) => {
    await analyze(page, true);
    await expect(page.getByText(/Photos similaires calculées par (la carte graphique|le processeur)/)).toBeVisible();
    await expectBurst(page);
  });

  test('sur le processeur (sans carte graphique), même résultat', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('model-device', 'wasm'));
    await analyze(page, true);
    await expect(page.getByText(/Photos similaires calculées par le processeur/)).toBeVisible();
    await expectBurst(page);
  });

  test('photos similaires demandées après une analyse sans elles : les photos déjà vues sont complétées', async ({ page }) => {
    await analyze(page, false);
    await expect(page.getByText(/calculées par/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Autre dossier' }).click();
    await page.getByRole('checkbox', { name: /photos similaires/ }).check();
    await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
    await expect(page.getByText('rien de nouveau')).toBeVisible({ timeout: 120_000 });
    await expectBurst(page);
  });
});
