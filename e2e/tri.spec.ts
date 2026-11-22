import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { PHOTOS_DIR } from './photos';

/**
 * Le tri sur le site (téléphone et PC) : duels, grille, groupes passés, fenêtre « Avant de supprimer » (le site ne
 * supprime pas : il propose l'appli PC). Dossier d'essai : groupe 1 = chat.jpg et sa copie, groupe 2 = plage.jpg,
 * sa copie WhatsApp et une version réduite.
 */

const SHOTS = join(import.meta.dirname, '..', 'test-results');

async function analyze(page: Page) {
  await page.goto('/');
  const box = page.getByRole('checkbox', { name: /photos similaires/ });
  if (await box.isChecked()) await box.click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('photos analysées')).toBeVisible({ timeout: 30_000 });
}

const sorter = (page: Page) => page.getByRole('dialog', { name: 'Trier les doublons' });

async function openSorter(page: Page, view: 'Grille' | 'Duels') {
  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  await sorter(page).getByRole('button', { name: view }).click();
  await expect(sorter(page).getByRole('button', { name: view, pressed: true })).toBeVisible();
}

test('duels : on touche la préférée, puis le résumé permet d’en garder plusieurs', async ({ page }, info) => {
  await analyze(page);
  await openSorter(page, 'Duels');
  const s = sorter(page);
  await expect(s.getByText('Groupe 1 sur 2')).toBeVisible();
  await expect(s.getByText('Touche celle que tu préfères.')).toBeVisible();
  await expect(s.getByText('Duel 1 sur 1')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `duel-${info.project.name}.png`) });
  // La copie gagne : c'est elle qu'on garde.
  await s.getByRole('button', { name: 'chat - Copie.jpg' }).click();
  await expect(s.getByTestId('counts')).toHaveText('1 gardée, 1 à supprimer');
  await expect(s.getByRole('button', { name: 'chat - Copie.jpg · Gardée' })).toBeVisible();
  await expect(s.getByRole('button', { name: 'Refaire les duels' })).toBeVisible();
  // Résumé : on garde les deux.
  await s.getByRole('button', { name: 'chat.jpg · À supprimer' }).click();
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 0 à supprimer');
  await s.getByRole('button', { name: 'Valider ›' }).click();

  // Groupe 2 : trois photos, deux duels ; la suggestion gagne deux fois.
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
  await expect(s.getByText('Duel 1 sur 2')).toBeVisible();
  await s.getByRole('button', { name: 'plage.jpg' }).click();
  await expect(s.getByText('Duel 2 sur 2')).toBeVisible();
  await s.getByRole('button', { name: 'plage.jpg' }).click();
  await expect(s.getByTestId('counts')).toHaveText('1 gardée, 2 à supprimer');
  await s.getByRole('button', { name: 'Valider ›' }).click();

  // Fin : 2 photos à supprimer ; le site ne supprime pas, il propose l'appli PC.
  await expect(s.getByText('Tous les groupes sont triés.')).toBeVisible();
  await s.getByRole('button', { name: /Supprimer 2 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(modal.getByTestId('remove-summary')).toContainText('2 photos à supprimer');
  await expect(modal.getByTestId('remove-summary')).toContainText('1 gardée, dans 1 groupe');
  await expect(modal.getByText('Le site sert à essayer')).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Télécharger l’appli PC' })).toHaveAttribute('href', /github\.com\/DavidDZA\/twin-pics\/releases/);
  await expect(modal.getByRole('button', { name: /^Supprimer/ })).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, `avant-de-supprimer-${info.project.name}.png`) });
  await modal.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 2 groupes sur 2');
  await expect(page.getByTestId('group').first()).toContainText('Trié');
});

test('grille : tout garder, passer un groupe, le revoir à la fin', async ({ page }, info) => {
  await analyze(page);
  await openSorter(page, 'Grille');
  const s = sorter(page);
  await expect(s.getByTestId('sort-photo')).toHaveCount(2);
  await expect(s.getByText('Suggestion · l’originale')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `grille-${info.project.name}.png`) });
  await s.getByRole('button', { name: 'Tout garder' }).click();
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 0 à supprimer');
  await s.getByRole('button', { name: 'Valider ›' }).click();
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
  await s.getByRole('button', { name: 'Passer' }).click();
  await expect(s.getByText('Fin de la liste : 1 groupe passé reste à trier.')).toBeVisible();
  await expect(s.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
  await s.getByRole('button', { name: 'Revoir les groupes passés' }).click();
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
  // Agrandir : la visionneuse, avec le choix de la photo.
  await s.getByRole('button', { name: 'Agrandir' }).nth(1).click();
  const viewer = page.getByRole('dialog', { name: 'IMG-20240714-WA0001.jpg' });
  await expect(viewer.getByRole('button', { name: '✕ À supprimer' })).toBeVisible();
  await viewer.getByRole('button', { name: '✕ À supprimer' }).click();
  await expect(viewer.getByRole('button', { name: '✓ Gardée' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 1 à supprimer');
  await s.getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 2');
  // « Trier ce groupe » rouvre le tri sur ce groupe.
  await page.getByTestId('group').nth(1).getByRole('button', { name: 'Trier ce groupe' }).click();
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
});

test('le tri est retenu après une nouvelle analyse', async ({ page }) => {
  await analyze(page);
  await openSorter(page, 'Grille');
  await sorter(page).getByRole('button', { name: 'Valider ›' }).click();
  await sorter(page).getByRole('button', { name: 'Retour aux groupes' }).click();
  await page.getByRole('button', { name: 'Autre dossier' }).click();
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await expect(page.getByText('rien de nouveau')).toBeVisible();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 2');
  await expect(page.getByRole('button', { name: 'Continuer le tri' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Supprimer 1 photo/ })).toBeVisible();
});

test.describe('téléphone en paysage', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone seulement');

  test('duel : photos côte à côte en paysage, l’une sous l’autre en portrait', async ({ page }) => {
    await analyze(page);
    await openSorter(page, 'Duels');
    const photos = sorter(page).locator('.duel-photo');
    let a = (await photos.nth(0).boundingBox())!;
    let b = (await photos.nth(1).boundingBox())!;
    expect(b.y).toBeGreaterThan(a.y + a.height - 1);

    await page.setViewportSize({ width: 760, height: 393 });
    await expect.poll(async () => (await photos.nth(1).boundingBox())!.x).toBeGreaterThan(300);
    a = (await photos.nth(0).boundingBox())!;
    b = (await photos.nth(1).boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(a.height).toBeGreaterThan(180);
    await page.screenshot({ path: join(SHOTS, 'duel-paysage.png') });
    // Le résumé (grille) tient aussi en paysage, sans défilement horizontal.
    await sorter(page).getByRole('button', { name: 'chat.jpg' }).click();
    await expect(sorter(page).getByTestId('counts')).toBeVisible();
    await page.screenshot({ path: join(SHOTS, 'resume-paysage.png') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
