import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { PHOTOS_DIR } from './photos';

/** Analyse le dossier d'essai (par le champ d'envoi de dossier), photos similaires comprises ou non : les doublons s'ouvrent. */
async function analyze(page: Page, similar = false) {
  await page.goto('/');
  const box = page.getByRole('checkbox', { name: /photos similaires/ });
  if ((await box.isChecked()) !== similar) await box.click();
  await page.getByRole('checkbox', { name: /documents, tickets et mèmes/ }).uncheck();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: similar ? 120_000 : 30_000 });
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
  // 15 photos lisibles, dont 7 ratées (la photo cassée, le HEIC et la vidéo sont à part).
  await expect(page.getByTestId('analyzed')).toHaveText('15 photos analysées.');
  await expect(page.getByText(/1 photo illisible, 1 photo HEIC \(iPhone\).*1 vidéo/)).toBeVisible();
  // Deux fonctions séparées, les doublons d'abord ; pas de page intermédiaire.
  await expect(page.locator('.fn-switch').getByRole('button', { name: 'Doublons 3' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.fn-switch').getByRole('button', { name: 'Photos inutiles 7' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retour/ })).toHaveCount(0);
  await expect(tile(page, 'photos en trop')).toHaveText('3');
  await expect(page.getByRole('tab', { name: /Inutiles/ })).toHaveCount(0);

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

test('une nouvelle analyse ne refait rien, et ne recharge aucun modèle', async ({ page }) => {
  await analyze(page);
  await expect(page.getByText(/nouvelles?\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Autre dossier' }).click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('rien de nouveau')).toBeVisible();
});

test('« Pas des doublons » : le groupe disparaît, reste caché après une nouvelle analyse, se remet', async ({ page }) => {
  await analyze(page);
  const groups = page.getByTestId('space-dup').locator(':scope > .groups > [data-testid=group]');
  await expect(groups).toHaveCount(2);
  await groups.first().getByRole('button', { name: 'Pas des doublons' }).click();
  await expect(groups).toHaveCount(1);
  await expect(page.getByText('Groupe mis de côté.')).toBeVisible();
  // Annuler, dans le message.
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await expect(groups).toHaveCount(2);

  await groups.first().getByRole('button', { name: 'Pas des doublons' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 1');
  await page.getByRole('button', { name: 'Autre dossier' }).click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('rien de nouveau')).toBeVisible();
  await expect(groups).toHaveCount(1);
  await page.getByText('Groupes mis de côté (1)').click();
  await page.getByTestId('ignored').getByRole('button', { name: 'Remettre dans la liste' }).click();
  await expect(groups).toHaveCount(2);
  await expect(page.getByTestId('ignored')).toHaveCount(0);
});

test('visionneuse : zoom à la molette, au clavier, au double clic, déplacement, zoom gardé d’une photo à l’autre', async ({ page, isMobile }) => {
  await analyze(page);
  await page.getByTestId('group').first().locator('.thumb').first().click();
  const viewer = page.getByRole('dialog');
  const img = viewer.locator('.viewer-body img');
  const zoom = viewer.getByTestId('zoom');
  await expect(zoom).toHaveText('Zoom 100 %');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const box = (await img.boundingBox())!;
  const at = { x: box.x + box.width * 0.75, y: box.y + box.height * 0.5 };

  // Clavier : + agrandit, 0 revient à la photo entière.
  await page.keyboard.press('+');
  await expect(zoom).toHaveText('Zoom 140 %');
  await page.keyboard.press('-');
  await expect(zoom).toHaveText('Zoom 100 %');
  await page.keyboard.press('+');
  await page.keyboard.press('0');
  await expect(zoom).toHaveText('Zoom 100 %');

  if (!isMobile) {
    // Molette : autour de la souris.
    await page.mouse.move(at.x, at.y);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
    await expect(zoom).not.toHaveText('Zoom 100 %');
    const big = (await img.boundingBox())!;
    expect(big.width).toBeGreaterThan(box.width * 1.5);
    // Le point sous la souris est resté au même endroit de la photo.
    expect((at.x - big.x) / big.width).toBeCloseTo(0.75, 1);

    // Glisser : la photo suit la souris, sans fermer la visionneuse.
    await page.mouse.down();
    await page.mouse.move(at.x - 60, at.y - 10, { steps: 4 });
    await page.mouse.up();
    expect((await img.boundingBox())!.x).toBeLessThan(big.x - 30);
    await expect(viewer).toBeVisible();

    // Même zoom sur la photo suivante (comparer un détail).
    const text = await zoom.textContent();
    await page.keyboard.press('ArrowRight');
    await expect(viewer).toContainText('2 / 2');
    await expect(zoom).toHaveText(text!);
    await viewer.getByRole('button', { name: 'Photo entière' }).click();
    await expect(zoom).toHaveText('Zoom 100 %');
    await img.dblclick();
    await expect(zoom).toHaveText('Zoom 250 %');
    await img.dblclick();
    await expect(zoom).toHaveText('Zoom 100 %');
  }
  // Boutons.
  await viewer.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect(zoom).toHaveText('Zoom 140 %');
  await viewer.getByRole('button', { name: 'Dézoomer' }).click();
  await expect(zoom).toHaveText('Zoom 100 %');
});

test('visionneuse : écarter deux doigts agrandit', async ({ page }) => {
  await analyze(page);
  await page.getByTestId('group').first().locator('.thumb').first().click();
  const viewer = page.getByRole('dialog');
  const body = viewer.locator('.viewer-body');
  const b = (await body.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const finger = (pointerId: number, x: number) => ({ pointerId, pointerType: 'touch', clientX: x, clientY: cy, isPrimary: pointerId === 1 });
  await body.dispatchEvent('pointerdown', finger(1, cx - 40));
  await body.dispatchEvent('pointerdown', finger(2, cx + 40));
  await body.dispatchEvent('pointermove', finger(1, cx - 80));
  await body.dispatchEvent('pointermove', finger(2, cx + 80));
  await body.dispatchEvent('pointerup', finger(1, cx - 80));
  await body.dispatchEvent('pointerup', finger(2, cx + 80));
  await expect(viewer.getByTestId('zoom')).toHaveText('Zoom 200 %');
  await expect(viewer).toContainText('1 / 2');
});

test('stats et badges : photos analysées comptées, fermeture', async ({ page }, info) => {
  await analyze(page);
  await page.getByRole('button', { name: 'Stats et badges' }).click();
  const modal = page.getByRole('dialog', { name: 'Stats et badges' });
  await expect(modal.locator('.stat-list > div', { hasText: 'photos analysées' }).locator('dd')).toHaveText(/^1[5-9]$/);
  await expect(modal.getByTestId('badge-bigClean')).toContainText('Grand ménage');
  await expect(modal.getByTestId('badge-bigClean')).toContainText('0 / 500 photos supprimées');
  await expect(modal.locator('.badge-row')).toHaveCount(50);
  await expect(modal.getByTestId('badge-count')).toHaveText('Badges : 0 sur 50');
  await page.screenshot({ path: join(import.meta.dirname, '..', 'test-results', `stats-${info.project.name}.png`) });
  // La liste défile, « Fermer » reste à l'écran.
  await modal.getByTestId('badge-nightOwl').scrollIntoViewIfNeeded();
  await expect(modal.getByRole('button', { name: 'Fermer' })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  // Premier badge : 10 photos swipées ou triées ; annoncé, et daté dans la liste.
  await page.getByRole('button', { name: 'Photos inutiles' }).click();
  await page.getByRole('button', { name: 'Trier les photos inutiles' }).click();
  await page.getByRole('button', { name: 'Grille' }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Valider ›' }).click();
  await page.getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByText('Badge gagné : Zéro reste')).toBeVisible();
  await page.getByRole('button', { name: 'Stats et badges' }).click();
  await expect(modal.getByTestId('badge-perfectionist')).toContainText('Gagné le');
  await expect(modal.getByTestId('badge-count')).toHaveText(/Badges : [1-3] sur 50/);
});

test('un clic pour passer des doublons aux photos inutiles ; la dernière ouverte est retenue', async ({ page }, info) => {
  await analyze(page);
  const head = page.locator('.fn-switch');
  await expect(head.getByRole('button', { name: 'Doublons 3' })).toHaveAttribute('aria-current', 'page');
  await head.getByRole('button', { name: 'Photos inutiles 7' }).click();
  await expect(page.getByTestId('space-junk')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Trier les photos inutiles' })).toBeVisible();
  await head.getByRole('button', { name: 'Doublons 3' }).click();
  await expect(page.getByTestId('space-dup')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // « Relancer » n'existe que pour un dossier relançable (appli PC, File System Access API) ; « Autre dossier », toujours.
  await expect(page.getByRole('button', { name: 'Relancer' })).toHaveCount(0);
  await head.getByRole('button', { name: 'Photos inutiles 7' }).click();
  await page.screenshot({ path: join(import.meta.dirname, '..', 'test-results', `barre-${info.project.name}.png`) });
  await page.getByRole('button', { name: 'Autre dossier' }).click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByTestId('space-junk')).toBeVisible();
});

test('barre d’ouverture pendant le chargement de l’appli', async ({ page }) => {
  // Le code de l'appli tarde : la barre est déjà là, puis l'appli la remplace.
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route(/index-.*\.js/, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('.boot-bar')).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Choisir un dossier de photos' })).toBeVisible();
  await expect(page.locator('.boot')).toHaveCount(0);
});

test('visionneuse : photo en grand, suivante, fermeture', async ({ page }) => {
  await analyze(page);
  const group = page.getByTestId('group').first();
  await group.locator('.thumb').first().click();
  const viewer = page.getByRole('dialog');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toBeVisible();
  await expect(viewer).toContainText('1 / 2');
  // Flèches à gauche et à droite de la photo.
  const next = viewer.getByRole('button', { name: 'Suivante' });
  const prev = viewer.getByRole('button', { name: 'Précédente' });
  const img = (await viewer.locator('.viewer-body img').boundingBox())!;
  expect((await prev.boundingBox())!.x).toBeLessThan(img.x + img.width / 2);
  expect((await next.boundingBox())!.x).toBeGreaterThan(img.x + img.width / 2);
  await next.click();
  await expect(viewer).toContainText('2 / 2');
  await prev.click();
  await expect(viewer).toContainText('1 / 2');
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toContainText('2 / 2');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
});

test('visionneuse au téléphone : glisser le doigt passe à la photo suivante', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'téléphone seulement');
  await analyze(page);
  await page.getByTestId('group').first().locator('.thumb').first().click();
  const viewer = page.getByRole('dialog');
  await expect(viewer).toContainText('1 / 2');
  const body = viewer.locator('.viewer-body');
  const touch = (x: number) => ({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: 300, isPrimary: true });
  await body.dispatchEvent('pointerdown', touch(300));
  await body.dispatchEvent('pointermove', touch(200));
  await body.dispatchEvent('pointerup', touch(120));
  await expect(viewer).toContainText('2 / 2');
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
  await page.getByRole('checkbox', { name: /documents, receipts and memes/ }).uncheck();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('15 photos analyzed.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Duplicates 3' })).toBeVisible();
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
    await analyze(page);
    await expect(page.getByText(/calculées par/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Autre dossier' }).click();
    await page.getByRole('checkbox', { name: /photos similaires/ }).check();
    await page.getByRole('checkbox', { name: /documents, tickets et mèmes/ }).uncheck();
    await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
    await expect(page.getByText('rien de nouveau')).toBeVisible({ timeout: 120_000 });
    await expectBurst(page);
  });
});
