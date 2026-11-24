import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { KEY_DIR, PHOTOS_DIR } from '../e2e/photos';

/**
 * L'appli PC de bout en bout : dossier choisi (la fenêtre de choix est remplacée par TP_PICK_FOLDER), analyse, tri
 * en grille, fenêtre « Avant de supprimer », suppression dans la Corbeille (un dossier d'essai, TP_FAKE_TRASH) ou
 * dans le dossier « À supprimer », annulation, reprise au lancement suivant.
 *
 * Dossier d'essai : copies exactes (chat.jpg, « chat - Copie.jpg ») et quasi identiques (plage.jpg, sa copie
 * WhatsApp, une version réduite) ; par défaut on garde chat.jpg et plage.jpg : 3 photos à supprimer.
 */

const ROOT = resolve(import.meta.dirname, '..');
const SHOTS = join(ROOT, 'test-results');
let dir: string;
let photos: string;
let trash: string;
let app: ElectronApplication;
let page: Page;

async function launch(extra: Record<string, string> = {}) {
  const env = { ...process.env } as Record<string, string>;
  delete env.VITE_DEV_URL;
  delete env.ELECTRON_RUN_AS_NODE; // posée par VS Code : Electron démarrerait comme un simple Node
  const exe = process.env.TP_E2E_EXE;
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: ['.'] }),
    cwd: ROOT,
    env: { ...env, TP_USER_DATA: join(dir, 'appli'), TP_PICK_FOLDER: photos, TP_FAKE_TRASH: trash, ...extra },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 860 });
}

test.beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'twin-pics-pc-'));
  photos = join(dir, 'Mes photos');
  trash = join(dir, 'Corbeille');
  mkdirSync(trash);
  cpSync(PHOTOS_DIR, photos, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dir, { recursive: true, force: true });
});

async function analyze(open: 'doublons' | 'photos inutiles' = 'doublons') {
  const box = page.getByRole('checkbox', { name: /photos similaires/ });
  if (await box.isChecked()) await box.click();
  await page.getByRole('checkbox', { name: /documents, tickets et mèmes/ }).uncheck();
  await page.getByRole('button', { name: 'Choisir un dossier de photos' }).click();
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByTestId('analyzed')).toHaveText('15 photos analysées.', { timeout: 30_000 });
  if (open === 'photos inutiles') await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
}

/** Trie les deux groupes avec la suggestion seule (bouton « Valider »). */
async function sortDefault() {
  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  const sorter = page.getByRole('dialog', { name: 'Trier les doublons' });
  await expect(sorter.getByText('Groupe 1 sur 2')).toBeVisible();
  await sorter.getByRole('button', { name: 'Valider ›' }).click();
  await expect(sorter.getByText('Groupe 2 sur 2')).toBeVisible();
  await sorter.getByRole('button', { name: 'Valider ›' }).click();
  await expect(sorter.getByText('Tous les groupes sont triés.')).toBeVisible();
  return sorter;
}

test('appli PC : analyse, tri en grille, Corbeille', async () => {
  await launch();
  await expect(page.getByText('Retrouve tes photos en double')).toBeVisible();
  // Pas de message « version d'essai » dans l'appli PC.
  await expect(page.getByText('Version d’essai en ligne')).toHaveCount(0);
  await analyze();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 2');

  // Grille : photos en grand (fichier d'origine lu par l'appli), la suggestion gardée, les autres à supprimer.
  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  const sorter = page.getByRole('dialog', { name: 'Trier les doublons' });
  await expect(sorter.getByRole('button', { name: 'Grille', pressed: true })).toBeVisible();
  const tiles = sorter.getByTestId('sort-photo');
  await expect(tiles).toHaveCount(2);
  const img = tiles.first().locator('img');
  await expect(img).toHaveAttribute('src', /^app:\/\/twin-pics\/_photo\//);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  await expect(sorter.getByTestId('counts')).toHaveText('1 gardée, 1 à supprimer');
  await page.screenshot({ path: join(SHOTS, 'pc-grille.png') });
  await sorter.getByRole('button', { name: 'Valider ›' }).click();
  await expect(sorter.getByText('Groupe 2 sur 2')).toBeVisible();
  await expect(tiles).toHaveCount(3);
  await sorter.getByRole('button', { name: 'Valider ›' }).click();
  await expect(sorter.getByText('Tous les groupes sont triés.')).toBeVisible();

  // Fenêtre « Avant de supprimer » : résumé, Corbeille par défaut.
  await sorter.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(modal.getByTestId('remove-summary')).toContainText('3 photos à supprimer');
  await expect(modal.getByTestId('remove-summary')).toContainText('2 gardées, dans 2 groupes');
  await expect(modal.getByTestId('plan')).toHaveCount(2);
  await expect(modal.getByRole('combobox', { name: 'Où vont les photos supprimées' })).toHaveValue('trash');
  await page.screenshot({ path: join(SHOTS, 'pc-avant-de-supprimer.png') });
  await modal.getByRole('button', { name: 'Supprimer 3 photos' }).click();

  await expect(page.getByTestId('remove-report')).toContainText('3 photos supprimées');
  await expect(page.getByTestId('remove-report')).toContainText('Corbeille de Windows');
  expect(readdirSync(trash).sort()).toEqual(['IMG-20240714-WA0001.jpg', 'chat - Copie.jpg', 'plage-petite.jpg']);
  expect(existsSync(join(photos, 'Animaux', 'chat.jpg'))).toBe(true);
  expect(existsSync(join(photos, 'Vacances', 'plage.jpg'))).toBe(true);
  await expect(page.getByTestId('group')).toHaveCount(0);
  // Stats : 3 photos supprimées.
  await page.getByRole('button', { name: 'Stats et badges' }).click();
  await expect(page.locator('.stat-list > div', { hasText: 'photos supprimées' }).locator('dd')).toHaveText('3');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('analyzed')).toHaveText('12 photos analysées.');
});

test('appli PC : dossier « À supprimer », annulation', async () => {
  await launch();
  await analyze();
  const sorter = await sortDefault();
  await sorter.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await modal.getByRole('combobox', { name: 'Où vont les photos supprimées' }).selectOption('folder');
  await expect(modal.locator('code')).toHaveText(/Mes photos\/Twin Pics - À supprimer$/);
  await modal.getByRole('button', { name: 'Supprimer 3 photos' }).click();

  const bin = join(photos, 'Twin Pics - À supprimer');
  await expect(page.getByTestId('remove-report')).toContainText('Elles sont dans le dossier');
  // Sous-dossiers gardés.
  expect(existsSync(join(bin, 'Animaux', 'chat - Copie.jpg'))).toBe(true);
  expect(existsSync(join(bin, 'WhatsApp Images', 'IMG-20240714-WA0001.jpg'))).toBe(true);
  expect(existsSync(join(bin, 'Vacances', 'plage-petite.jpg'))).toBe(true);
  expect(existsSync(join(photos, 'Animaux', 'chat - Copie.jpg'))).toBe(false);

  // Une nouvelle analyse n'y regarde pas : plus aucun groupe.
  await page.getByRole('button', { name: 'Relancer' }).click();
  await expect(page.getByText('rien de nouveau')).toBeVisible();
  await expect(page.getByTestId('analyzed')).toHaveText('12 photos analysées.');
});

test('appli PC : annuler remet les photos à leur place', async () => {
  await launch();
  await analyze();
  const sorter = await sortDefault();
  await sorter.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await modal.getByRole('combobox', { name: 'Où vont les photos supprimées' }).selectOption('folder');
  await modal.getByRole('button', { name: 'Supprimer 3 photos' }).click();
  await page.getByTestId('remove-report').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('remove-report')).toContainText('3 photos remises à leur place.');
  expect(existsSync(join(photos, 'Animaux', 'chat - Copie.jpg'))).toBe(true);
  expect(existsSync(join(photos, 'WhatsApp Images', 'IMG-20240714-WA0001.jpg'))).toBe(true);
  await expect(page.getByTestId('group')).toHaveCount(2);
});

test('appli PC : toutes les copies exactes en un bouton, puis annuler', async () => {
  await launch();
  await analyze();
  await page.getByRole('button', { name: /Supprimer toutes les copies exactes \(2 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await modal.getByRole('combobox', { name: 'Où vont les photos supprimées' }).selectOption('folder');
  await modal.getByRole('button', { name: 'Supprimer 2 photos' }).click();
  await expect(page.getByTestId('remove-report')).toContainText('2 photos supprimées');
  expect(existsSync(join(photos, 'Animaux', 'chat - Copie.jpg'))).toBe(false);
  expect(existsSync(join(photos, 'Animaux', 'chat.jpg'))).toBe(true);
  expect(existsSync(join(photos, 'WhatsApp Images', 'IMG-20240714-WA0001.jpg'))).toBe(false);
  expect(existsSync(join(photos, 'Vacances', 'plage.jpg'))).toBe(true);
  expect(existsSync(join(photos, 'Vacances', 'plage-petite.jpg'))).toBe(true);
  // Il reste plage.jpg et sa version réduite ; plus de copie exacte.
  await expect(page.getByTestId('group')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /copies exactes/ })).toHaveCount(0);
  await page.getByTestId('remove-report').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('group')).toHaveCount(2);
  expect(existsSync(join(photos, 'Animaux', 'chat - Copie.jpg'))).toBe(true);
});

test('appli PC : disque sans Corbeille, rien n’est touché', async () => {
  await launch({ TP_FAKE_TRASH_FAIL: '1' });
  await analyze();
  const sorter = await sortDefault();
  await sorter.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  await page.getByRole('dialog', { name: 'Avant de supprimer' }).getByRole('button', { name: 'Supprimer 3 photos' }).click();
  await expect(page.getByTestId('remove-report')).toContainText('3 photos n’ont pas pu aller dans la Corbeille');
  expect(existsSync(join(photos, 'Animaux', 'chat - Copie.jpg'))).toBe(true);
  await expect(page.getByTestId('group')).toHaveCount(2);
});

test('appli PC : photos inutiles triées en swipe, puis à la Corbeille', async () => {
  await launch();
  await analyze('photos inutiles');
  await page.getByRole('button', { name: 'Trier les photos inutiles' }).click();
  const sorter = page.getByRole('dialog', { name: 'Trier les photos inutiles' });
  await sorter.getByRole('button', { name: 'Swipe' }).click();
  // Les deux photos noires, puis la floue gardée, la sombre jetée.
  await expect(sorter.getByText('noire-1.jpg')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(sorter.getByText('noire-2.jpg')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(sorter.getByText('floue.jpg')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(sorter.getByText('sombre.jpg')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await sorter.getByRole('button', { name: 'Retour aux groupes' }).click();
  await page.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  await page.getByRole('dialog', { name: 'Avant de supprimer' }).getByRole('button', { name: 'Supprimer 3 photos' }).click();
  await expect(page.getByTestId('remove-report')).toContainText('3 photos supprimées');
  expect(readdirSync(trash).sort()).toEqual(['noire-1.jpg', 'noire-2.jpg', 'sombre.jpg']);
  expect(existsSync(join(photos, 'Ratées', 'floue.jpg'))).toBe(true);
  // Restent : la floue (gardée), la rafale floue et les deux captures d'écran.
  await expect(page.getByTestId('group')).toHaveCount(4);
});

test('appli PC : photos similaires sur la carte graphique (E2E_MODELE=1 : télécharge le modèle)', async () => {
  test.skip(!process.env.E2E_MODELE, 'télécharge le modèle');
  test.setTimeout(240_000);
  await launch();
  await page.getByRole('button', { name: 'Choisir un dossier de photos' }).click();
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText(/Photos similaires calculées par (la carte graphique|le processeur)/)).toBeVisible();
  console.log(await page.getByText(/Photos similaires calculées par/).textContent());
  await page.getByText('Réglages de la détection').click();
  await page.locator('.slider', { hasText: 'ressemblance minimale' }).locator('input').fill('80');
  await page.getByRole('tab', { name: /Similaires/ }).click();
  await expect(page.getByTestId('group').first().locator('li.best .name')).toHaveText('rafale-1.jpg');
});

test('appli PC : garder plusieurs photos, tout supprimer, tri retenu au lancement suivant', async () => {
  await launch();
  await analyze();
  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  const sorter = page.getByRole('dialog', { name: 'Trier les doublons' });
  // Groupe 1 (copies du chat) : tout supprimer → avertissement.
  await sorter.getByRole('button', { name: 'Tout supprimer' }).click();
  await expect(sorter.getByText('Aucune photo gardée : tout le groupe sera supprimé.')).toBeVisible();
  await sorter.getByRole('button', { name: 'Valider ›' }).click();
  // Groupe 2 (plage) : touches 1 à 3 et Entrée — garder aussi la version réduite.
  await expect(sorter.getByText('Groupe 2 sur 2')).toBeVisible();
  await page.keyboard.press('3');
  await expect(sorter.getByTestId('counts')).toHaveText('2 gardées, 1 à supprimer');
  await page.keyboard.press('Enter');
  await expect(sorter.getByText('Tous les groupes sont triés.')).toBeVisible();
  await sorter.getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 2 groupes sur 2');
  await page.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  await expect(page.getByRole('dialog', { name: 'Avant de supprimer' }).getByText('Attention : dans 1 groupe, tu ne gardes aucune photo.')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();

  // Lancement suivant : le dossier et le tri sont retenus.
  await app.close();
  await launch();
  await expect(page.getByTestId('folders').locator('strong')).toHaveText(['Mes photos']);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByText('rien de nouveau')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 2 groupes sur 2');
  await expect(page.getByRole('button', { name: /Supprimer 3 photos/ })).toBeVisible();
});

test('appli PC : plusieurs dossiers, « À supprimer » dans chacun, annulation, liste retenue, clé débranchée', async () => {
  const key = join(dir, 'Clé');
  cpSync(KEY_DIR, key, { recursive: true });
  // Trois dossiers choisis d'un coup : le sous-dossier, déjà compris, n'est pas ajouté.
  await launch({ TP_PICK_FOLDER: [photos, join(photos, 'Vacances'), key].join(delimiter) });
  for (const name of [/photos similaires/, /documents, tickets et mèmes/]) await page.getByRole('checkbox', { name }).uncheck();
  await page.getByRole('button', { name: 'Choisir un dossier de photos' }).click();
  await expect(page.getByText('« Vacances » est déjà compris dans « Mes photos ».')).toBeVisible();
  const names = () => page.getByTestId('folders').locator('strong');
  await expect(names()).toHaveText(['Mes photos', 'Clé']);
  await page.screenshot({ path: join(SHOTS, 'pc-dossiers.png') });
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByTestId('analyzed')).toHaveText('18 photos analysées.', { timeout: 30_000 });
  await expect(page.getByTestId('group').filter({ hasText: 'montagne.jpg' }).locator('li.best')).toContainText('Mes photos/Vacances');

  // Copies exactes : 2 dans « Mes photos », 2 sur la clé.
  await page.getByRole('button', { name: /Supprimer toutes les copies exactes \(4 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(modal.getByTestId('by-folder').locator('li')).toHaveText(['Mes photos 2 photos à supprimer', 'Clé 2 photos à supprimer']);
  await modal.getByRole('combobox', { name: 'Où vont les photos supprimées' }).selectOption('folder');
  await expect(modal.locator('code')).toHaveText([/Mes photos\/Twin Pics - À supprimer$/, /Clé\/Twin Pics - À supprimer$/]);
  await page.screenshot({ path: join(SHOTS, 'pc-dossiers-supprimer.png') });
  await modal.getByRole('button', { name: 'Supprimer 4 photos' }).click();
  const report = page.getByTestId('remove-report');
  await expect(report).toContainText('4 photos supprimées');
  await expect(report.getByRole('button', { name: 'Ouvrir les dossiers' })).toBeVisible();
  const bin = 'Twin Pics - À supprimer';
  expect(readdirSync(join(key, bin, 'Sauvegarde')).sort()).toEqual(['chat.jpg', 'montagne.jpg']);
  expect(existsSync(join(photos, bin, 'Animaux', 'chat - Copie.jpg'))).toBe(true);
  expect(existsSync(join(photos, 'Vacances', 'montagne.jpg'))).toBe(true);
  await report.getByRole('button', { name: 'Annuler' }).click();
  await expect(report).toContainText('4 photos remises à leur place.');
  expect(existsSync(join(key, 'Sauvegarde', 'montagne.jpg'))).toBe(true);

  // Lancement suivant : les deux dossiers sont là ; la clé débranchée est signalée, l'autre dossier s'analyse.
  await app.close();
  rmSync(key, { recursive: true });
  await launch();
  await expect(names()).toHaveText(['Mes photos', 'Clé']);
  await expect(page.getByText('Introuvable pour l’instant.')).toBeVisible();
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByText('« Clé » est introuvable ou refusé : pas analysé.')).toBeVisible();
  await expect(page.getByTestId('analyzed')).toHaveText('15 photos analysées.', { timeout: 30_000 });
  // Elle reste dans la liste pour la prochaine fois.
  await page.getByRole('button', { name: 'Dossiers…' }).click();
  await expect(names()).toHaveText(['Mes photos', 'Clé']);
});

test('appli PC : le dossier retenu par une version d’avant la 0.8 est repris', async () => {
  mkdirSync(join(dir, 'appli'));
  writeFileSync(join(dir, 'appli', 'reglages.json'), JSON.stringify({ lastFolder: photos }));
  await launch();
  await expect(page.getByTestId('folders').locator('strong')).toHaveText(['Mes photos']);
});
