import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { openPhotos } from './photos';

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
  await page.getByRole('checkbox', { name: /documents, tickets et mèmes/ }).uncheck();
  await openPhotos(page);
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 30_000 });
}

const sorter = (page: Page) => page.getByRole('dialog', { name: 'Trier les doublons' });

async function openSorter(page: Page, view: 'Grille' | 'Duels') {
  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  await sorter(page).getByRole('button', { name: view }).click();
  await expect(sorter(page).getByRole('button', { name: view, pressed: true })).toBeVisible();
}

test('duels : deux photos vont droit au résumé ; à trois, la gagnante affronte la suivante', async ({ page }, info) => {
  await analyze(page);
  await openSorter(page, 'Duels');
  const s = sorter(page);
  // Groupe 1 : deux photos seulement, pas de duel (il ne dirait rien de plus que le résumé).
  await expect(s.getByText('Groupe 1 sur 2')).toBeVisible();
  await expect(s.getByText('Touche celle que tu préfères.')).toHaveCount(0);
  await expect(s.getByTestId('counts')).toHaveText('1 gardée, 1 à supprimer');
  await expect(s.getByRole('button', { name: 'Refaire les duels' })).toHaveCount(0);
  // Résumé : on garde les deux.
  await expect(s.getByText('Les photos gardées seront mises de côté.')).toHaveCount(0);
  await s.getByRole('button', { name: 'chat - Copie.jpg · À supprimer' }).click();
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 0 à supprimer');
  await expect(s.getByText('Les photos gardées seront mises de côté.')).toBeVisible();
  await s.getByRole('button', { name: 'Valider ›' }).click();

  // Groupe 2 : trois photos, deux duels ; la copie WhatsApp gagne les deux.
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
  await expect(s.getByText('Touche celle que tu préfères.')).toBeVisible();
  await expect(s.getByText('Duel 1 sur 2')).toBeVisible();
  await expect(s.getByText('VS', { exact: true })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `duel-${info.project.name}.png`) });
  await s.getByRole('button', { name: 'IMG-20240714-WA0001.jpg' }).click();
  await expect(s.getByText('Duel 2 sur 2')).toBeVisible();
  await s.getByRole('button', { name: 'IMG-20240714-WA0001.jpg' }).click();
  await expect(s.getByTestId('counts')).toHaveText('1 gardée, 2 à supprimer');
  await expect(s.getByRole('button', { name: 'IMG-20240714-WA0001.jpg · Gardée' })).toBeVisible();
  await expect(s.getByRole('button', { name: 'Refaire les duels' })).toBeVisible();
  await s.getByRole('button', { name: 'Valider ›' }).click();

  // Fin : 2 photos à supprimer ; le site ne supprime pas, il propose l'appli PC.
  await expect(s.getByText('Tous les groupes sont triés.')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `fin-${info.project.name}.png`) });
  await s.getByRole('button', { name: /Supprimer 2 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(modal.getByTestId('remove-summary')).toContainText('2 photos à supprimer');
  await expect(modal.getByTestId('remove-summary')).toContainText('1 gardée, dans 1 groupe');
  await expect(modal.getByText('Le site sert à essayer')).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Télécharger l’appli PC' })).toHaveAttribute('href', /github\.com\/DavidDZA\/twin-pics\/releases/);
  await expect(modal.getByRole('button', { name: /^Supprimer/ })).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, `avant-de-supprimer-${info.project.name}.png`) });
  await modal.getByRole('button', { name: 'Fermer' }).click();
  // Le groupe du chat, tout gardé, est mis de côté tout seul ; celui de la plage attend sa suppression.
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 1');
  await expect(page.getByTestId('group').first()).toContainText('Trié');
  await expect(page.getByText('Groupes mis de côté (1)')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `resultats-${info.project.name}.png`) });
});

test('plein écran pendant un duel, flèches pour passer aux autres photos du groupe', async ({ page }) => {
  await analyze(page);
  await openSorter(page, 'Duels');
  const s = sorter(page);
  await s.getByRole('button', { name: 'Passer' }).click();
  await expect(s.getByText('Duel 1 sur 2')).toBeVisible();
  await s.getByRole('button', { name: 'Plein écran' }).first().click();
  const viewer = page.getByRole('dialog', { name: 'plage.jpg' });
  await expect(viewer).toContainText('1 / 3');
  await viewer.getByRole('button', { name: 'Suivante' }).click();
  await expect(page.getByRole('dialog', { name: 'IMG-20240714-WA0001.jpg' })).toContainText('2 / 3');
  await page.keyboard.press('Escape');
  await expect(s.getByText('Duel 1 sur 2')).toBeVisible();
});

test('grille : tout garder, passer un groupe, le revoir à la fin', async ({ page }, info) => {
  await analyze(page);
  await openSorter(page, 'Grille');
  const s = sorter(page);
  await expect(s.getByTestId('sort-photo')).toHaveCount(2);
  await expect(s.getByText('Suggestion · l’originale')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `grille-${info.project.name}.png`) });
  // La photo à supprimer reste bien visible : ni voile, ni gris.
  const out = s.locator('.grid-photos li.remove img').first();
  await expect(out).toHaveCSS('opacity', '1');
  await expect(out).toHaveCSS('filter', 'none');
  await s.getByRole('button', { name: 'Tout garder' }).click();
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 0 à supprimer');
  await s.getByRole('button', { name: 'Valider ›' }).click();
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
  await s.getByRole('button', { name: 'Passer' }).click();
  await expect(s.getByText('Fin de la liste : 1 groupe passé reste à trier.')).toBeVisible();
  await expect(s.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
  await s.getByRole('button', { name: 'Revoir les groupes passés' }).click();
  await expect(s.getByText('Groupe 2 sur 2')).toBeVisible();
  // Plein écran : la visionneuse, avec le choix de la photo.
  await s.getByRole('button', { name: 'Plein écran' }).nth(1).click();
  const viewer = page.getByRole('dialog', { name: 'IMG-20240714-WA0001.jpg' });
  await expect(viewer.getByRole('button', { name: '✕ À supprimer' })).toBeVisible();
  await viewer.getByRole('button', { name: '✕ À supprimer' }).click();
  await expect(viewer.getByRole('button', { name: '✓ Gardée' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 1 à supprimer');
  await s.getByRole('button', { name: 'Retour aux groupes' }).click();
  // Le groupe tout gardé n'est plus dans la liste.
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 1');
  // « Trier ce groupe » rouvre le tri sur ce groupe.
  await page.getByTestId('group').first().getByRole('button', { name: 'Trier ce groupe' }).click();
  await expect(s.getByText('Groupe 1 sur 1')).toBeVisible();
});

test('tout garder met le groupe de côté tout seul : retenu, changé en revenant en arrière, remis dans la liste', async ({ page }) => {
  await analyze(page);
  await openSorter(page, 'Grille');
  const s = sorter(page);
  await s.getByRole('button', { name: 'Tout garder' }).click();
  await s.getByRole('button', { name: 'Valider ›' }).click();
  // Retour en arrière : on n'en garde qu'une, le groupe revient dans la liste.
  await s.getByRole('button', { name: 'Précédent' }).click();
  await expect(s.getByTestId('counts')).toHaveText('2 gardées, 0 à supprimer');
  await s.getByRole('button', { name: 'Garder la suggestion' }).click();
  await s.getByRole('button', { name: 'Valider ›' }).click();
  await s.getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 2');
  await expect(page.getByTestId('ignored')).toHaveCount(0);

  // Les deux groupes tout gardés : plus rien à trier, retenu après une nouvelle analyse.
  await page.getByTestId('group').first().getByRole('button', { name: 'Modifier le tri' }).click();
  await s.getByRole('button', { name: 'Tout garder' }).click();
  await s.getByRole('button', { name: 'Valider ›' }).click();
  await s.getByRole('button', { name: 'Tout garder' }).click();
  await s.getByRole('button', { name: 'Valider ›' }).click();
  await s.getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByText('Plus aucun groupe à trier : ils sont tous mis de côté.')).toBeVisible();
  await page.getByRole('button', { name: 'Dossiers…' }).click();
  await openPhotos(page);
  await expect(page.getByText('Groupes mis de côté (2)')).toBeVisible();

  // Remis dans la liste, il redevient à trier.
  await page.getByText('Groupes mis de côté (2)').click();
  await page.getByTestId('ignored').getByRole('button', { name: 'Remettre dans la liste' }).first().click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 1');
  await expect(page.getByText('Groupes mis de côté (1)')).toBeVisible();
});

test('effacer les choix d’une seule page', async ({ page }, info) => {
  await analyze(page);
  const reset = page.getByRole('button', { name: /Effacer mes choix des/ });
  await expect(reset).toHaveCount(0);
  await openSorter(page, 'Grille');
  await sorter(page).getByRole('button', { name: 'Valider ›' }).click();
  await sorter(page).getByRole('button', { name: 'Retour aux groupes' }).click();
  await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
  await expect(reset).toHaveCount(0);
  await page.getByTestId('group').filter({ hasText: 'floue.jpg' }).getByRole('button', { name: 'Pas inutiles' }).click();
  // Sur la page des photos inutiles : leurs choix seulement.
  await page.screenshot({ path: join(SHOTS, `effacer-page-${info.project.name}.png`) });
  await page.getByRole('button', { name: 'Effacer mes choix des photos inutiles…' }).click();
  const modal = page.getByRole('dialog', { name: 'Effacer mes choix des photos inutiles' });
  await expect(modal).toContainText('1 groupe mis de côté revient dans la liste.');
  await expect(modal).not.toContainText('à trier');
  await modal.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triées : 0 photo sur 7');
  await expect(reset).toHaveCount(0);
  // Les doublons n'ont pas bougé ; leur bouton efface les leurs.
  await page.locator('.fn-switch').getByRole('button', { name: /Doublons/ }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 2');
  await page.getByRole('button', { name: 'Effacer mes choix des doublons…' }).click();
  await page.getByRole('dialog', { name: 'Effacer mes choix des doublons' }).getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 2');
});

test('le tri est retenu après une nouvelle analyse', async ({ page }) => {
  await analyze(page);
  await openSorter(page, 'Grille');
  await sorter(page).getByRole('button', { name: 'Valider ›' }).click();
  await sorter(page).getByRole('button', { name: 'Retour aux groupes' }).click();
  await page.getByRole('button', { name: 'Dossiers…' }).click();
  await openPhotos(page);
  await expect(page.getByText('rien de nouveau')).toBeVisible();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 2');
  await expect(page.getByRole('button', { name: 'Continuer le tri' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Supprimer 1 photo/ })).toBeVisible();
});

test('effacer mes choix : tout redevient à trier, rien n’est supprimé', async ({ page }) => {
  await analyze(page);
  await expect(page.getByRole('button', { name: /Effacer tous mes choix/ })).toHaveCount(0);
  await openSorter(page, 'Grille');
  await sorter(page).getByRole('button', { name: 'Valider ›' }).click();
  // « Pas des doublons » pendant le tri : le groupe est mis de côté, c'était le dernier.
  await expect(sorter(page).getByText('Groupe 2 sur 2')).toBeVisible();
  await sorter(page).getByRole('button', { name: 'Pas des doublons' }).click();
  await expect(sorter(page).getByText('Tous les groupes sont triés.')).toBeVisible();
  await sorter(page).getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 1');
  await expect(page.getByRole('button', { name: 'Revoir le tri' })).toBeVisible();

  // Les choix des photos inutiles comptent aussi.
  await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
  await page.getByTestId('group').filter({ hasText: 'floue.jpg' }).getByRole('button', { name: 'Pas inutiles' }).click();
  await page.locator('.fn-switch').getByRole('button', { name: /Doublons/ }).click();
  await page.getByRole('button', { name: 'Effacer tous mes choix…' }).click();
  const modal = page.getByRole('dialog', { name: 'Effacer tous mes choix' });
  await expect(modal).toContainText('2 photos redeviennent à trier.');
  await expect(modal).toContainText('2 groupes mis de côté reviennent dans la liste.');
  await modal.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 1 groupe sur 1');
  await page.getByRole('button', { name: 'Effacer tous mes choix…' }).click();
  await modal.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 2');
  await expect(page.getByRole('button', { name: /Supprimer 1 photo/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Effacer tous mes choix/ })).toHaveCount(0);
  // Retenu après rechargement.
  await page.getByRole('button', { name: 'Dossiers…' }).click();
  await openPhotos(page);
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 2');
});

test('toutes les copies exactes en un bouton : récapitulatif sans trier', async ({ page }) => {
  await analyze(page);
  // chat - Copie.jpg, et la copie WhatsApp de plage.jpg (dans un groupe quasi identique).
  await page.getByRole('button', { name: /Supprimer toutes les copies exactes \(2 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(modal.getByTestId('remove-summary')).toContainText('2 photos à supprimer');
  await expect(modal.getByText('seule l’originale est gardée')).toBeVisible();
  await modal.getByRole('button', { name: 'Fermer' }).click();
  // Rien n'a été trié ; un groupe trié à la main n'est plus concerné.
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 2');
  await openSorter(page, 'Grille');
  await sorter(page).getByRole('button', { name: 'Tout garder' }).click();
  await sorter(page).getByRole('button', { name: 'Valider ›' }).click();
  await sorter(page).getByRole('button', { name: 'Retour aux groupes' }).click();
  await expect(page.getByRole('button', { name: /Supprimer toutes les copies exactes \(1 photo,/ })).toBeVisible();
});

test.describe('téléphone en paysage', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone seulement');

  test('duel : photos côte à côte en paysage, l’une sous l’autre en portrait', async ({ page }) => {
    await analyze(page);
    await openSorter(page, 'Duels');
    await sorter(page).getByRole('button', { name: 'Passer' }).click();
    await expect(sorter(page).getByText('Duel 1 sur 2')).toBeVisible();
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
    await sorter(page).getByRole('button', { name: 'plage.jpg' }).click();
    await sorter(page).getByRole('button', { name: 'plage.jpg' }).click();
    await expect(sorter(page).getByTestId('counts')).toBeVisible();
    await page.screenshot({ path: join(SHOTS, 'resume-paysage.png') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
