import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { openPhotos } from './photos';

/**
 * Photos inutiles sur le site (téléphone et PC), sans le modèle (règles simples) : dossier d'essai `Ratées` — deux
 * photos noires (un groupe « Presque vide »), une floue, une très sombre, deux captures d'écran ; la rafale floue
 * (`rafale-2.jpg`) est aussi « Floue » quand les photos similaires ne sont pas cherchées. Avec E2E_MODELE=1 : la page
 * de texte reconnue comme document.
 */

const SHOTS = join(import.meta.dirname, '..', 'test-results');

async function analyze(page: Page, junkModel = false, open = true) {
  await page.goto('/');
  await page.getByRole('checkbox', { name: /photos similaires/ }).uncheck();
  const box = page.getByRole('checkbox', { name: /documents, tickets et mèmes/ });
  if (junkModel) await box.check();
  else await box.uncheck();
  await openPhotos(page);
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: junkModel ? 200_000 : 30_000 });
  if (open) await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
}

const sorter = (page: Page) => page.getByRole('dialog', { name: 'Trier les photos inutiles' });

test('page des photos inutiles : raisons, photos noires regroupées, réglages', async ({ page }, info) => {
  await analyze(page);
  const groups = page.getByTestId('group');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(groups).toHaveCount(6);
  await expect(page.locator('.tile', { hasText: 'photos inutiles' }).locator('strong')).toHaveText('7');
  // Le plus gros groupe d'abord : les deux photos noires, ensemble.
  const first = groups.first();
  await expect(first).toContainText('2 photos');
  await expect(first.locator('.chip.junk-reason')).toHaveText('Presque vide');
  await expect(first.getByRole('button', { name: 'Pas inutiles' })).toBeVisible();
  await expect(page.getByTestId('group').filter({ hasText: 'floue.jpg' })).toContainText('Floue');
  await expect(page.getByTestId('group').filter({ hasText: 'sombre.jpg' })).toContainText('Trop sombre');
  await expect(page.getByTestId('group').filter({ hasText: 'Screenshot_20240714-101112.png' })).toContainText('Capture d’écran');
  await page.screenshot({ path: join(SHOTS, `inutiles-${info.project.name}.png`), fullPage: true });

  // Réglages : décocher « Floue » retire la photo floue et la rafale floue.
  await page.getByText('Réglages des photos inutiles').click();
  await expect(page.getByText(/demandent le modèle/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Floue' }).uncheck();
  await expect(groups).toHaveCount(4);
  await page.getByRole('checkbox', { name: 'Floue' }).check();
  await expect(groups).toHaveCount(6);
  // Les doublons, eux, n'ont pas changé.
  await page.locator('.fn-switch').getByRole('button', { name: /Doublons/ }).click();
  await expect(groups).toHaveCount(2);
});

test('swipe : une photo à la fois (bouton, clavier, geste), sans résumé à la fin', async ({ page }, info) => {
  await analyze(page);
  await page.getByRole('button', { name: 'Trier les photos inutiles' }).click();
  const s = sorter(page);
  await s.getByRole('button', { name: 'Swipe' }).click();
  // Les deux photos noires, l'une après l'autre (plus de carte pour tout le groupe).
  await expect(s.getByText('Photo 1 sur 7')).toBeVisible();
  await expect(s.getByText('noire-1.jpg')).toBeVisible();
  await expect(s.locator('.reasons-line')).toHaveText('Presque vide');
  await page.screenshot({ path: join(SHOTS, `swipe-${info.project.name}.png`) });
  await s.getByRole('button', { name: '✕ Je jette' }).click();
  await expect(s.getByText('Photo 2 sur 7')).toBeVisible();
  await expect(s.getByText('noire-2.jpg')).toBeVisible();
  // Retour en arrière : le choix est montré, et se change.
  await s.getByRole('button', { name: 'Précédent' }).click();
  await expect(s.locator('.mark.remove')).toBeVisible();
  await s.getByRole('button', { name: '✕ Je jette' }).click();
  await expect(s.getByText('Photo 2 sur 7')).toBeVisible();
  await s.getByRole('button', { name: '✕ Je jette' }).click();
  // La photo floue, gardée au clavier.
  await expect(s.getByText('Photo 3 sur 7')).toBeVisible();
  await expect(s.getByText('floue.jpg')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  // La photo sombre, jetée d'un geste vers la gauche.
  await expect(s.getByText('Photo 4 sur 7')).toBeVisible();
  await expect(s.getByText('sombre.jpg')).toBeVisible();
  const card = (await s.getByTestId('swipe-card').boundingBox())!;
  const y = card.y + card.height / 2;
  await page.mouse.move(card.x + card.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(card.x + card.width / 2 - 80, y, { steps: 4 });
  await expect(s.locator('.stamp.remove')).not.toHaveCSS('opacity', '0');
  await page.mouse.move(card.x + card.width / 2 - 220, y, { steps: 4 });
  await page.mouse.up();
  await expect(s.getByText('Photo 5 sur 7')).toBeVisible();
  // Un geste trop court ne décide rien.
  const card5 = (await s.getByTestId('swipe-card').boundingBox())!;
  await page.mouse.move(card5.x + card5.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(card5.x + card5.width / 2 + 40, y, { steps: 3 });
  await page.mouse.up();
  await expect(s.getByText('Photo 5 sur 7')).toBeVisible();

  // Fermer en cours de route : les photos jetées comptent déjà, sans finir leur groupe.
  await s.getByRole('button', { name: 'Retour aux groupes' }).click();
  // La photo gardée est mise de côté tout de suite.
  await expect(page.getByTestId('sort-progress')).toHaveText('Triées : 3 photos sur 6');
  await expect(page.getByText('Groupes mis de côté (1)')).toBeVisible();
  await page.getByRole('button', { name: /Supprimer 3 photos/ }).click();
  const modal = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(modal.getByTestId('remove-summary')).toContainText('3 photos à supprimer');
  await expect(modal.getByText(/tu ne gardes aucune photo/)).toHaveCount(0);
  await modal.getByRole('button', { name: 'Fermer' }).click();

  // Reprise où on en était ; après la dernière photo, retour direct à la liste.
  await page.getByRole('button', { name: 'Continuer le tri' }).click();
  for (let n = 4; n <= 6; n++) {
    await expect(s.getByText(`Photo ${n} sur 6`)).toBeVisible();
    await page.keyboard.press('ArrowRight');
  }
  await expect(s).toBeHidden();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triées : 3 photos sur 3');
  await expect(page.getByTestId('ignored').getByText('floue.jpg')).toHaveCount(1);
  // Les doublons n'ont pas bougé : chaque fonction a ses choix.
  await page.locator('.fn-switch').getByRole('button', { name: /Doublons/ }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triés : 0 groupe sur 2');
  await page.screenshot({ path: join(SHOTS, `resultats-inutiles-${info.project.name}.png`), fullPage: true });
  // « Revoir le tri » : toutes les photos défilent de nouveau.
  await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
  await page.getByRole('button', { name: 'Revoir le tri' }).click();
  await expect(s.getByText('Photo 1 sur 3')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(s.getByText('Photo 2 sur 3')).toBeVisible();
});

test('« Pas inutiles » : ces photos ne sont plus proposées ; se remettent', async ({ page }) => {
  await analyze(page);
  await page.getByTestId('group').filter({ hasText: 'floue.jpg' }).getByRole('button', { name: 'Pas inutiles' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triées : 0 photo sur 6');
  await page.getByText('Groupes mis de côté (1)').click();
  await page.getByRole('button', { name: 'Remettre dans la liste' }).click();
  await expect(page.getByTestId('sort-progress')).toHaveText('Triées : 0 photo sur 7');
});

test('grille des photos inutiles : tout à jeter par défaut, plein écran', async ({ page }) => {
  await analyze(page);
  await page.getByRole('button', { name: 'Trier les photos inutiles' }).click();
  const s = sorter(page);
  await s.getByRole('button', { name: 'Grille' }).click();
  await expect(s.getByTestId('counts')).toHaveText('0 gardée, 2 à supprimer');
  await expect(s.getByText('Aucune photo gardée : tout le groupe sera supprimé.')).toBeVisible();
  await expect(s.getByRole('button', { name: 'Garder la suggestion' })).toHaveCount(0);
  await expect(s.getByRole('button', { name: 'Refaire les duels' })).toHaveCount(0);
  await expect(s.getByTestId('sort-photo').first()).toContainText('Presque vide');
  await s.getByRole('button', { name: 'noire-1.jpg · À supprimer' }).click();
  await expect(s.getByTestId('counts')).toHaveText('1 gardée, 1 à supprimer');
  await s.getByRole('button', { name: 'Plein écran' }).first().click();
  await expect(page.getByRole('dialog', { name: 'noire-1.jpg' })).toContainText('1 / 2');
});

test.describe('téléphone', () => {
  test.skip(({ isMobile }) => !isMobile, 'téléphone seulement');

  test('swipe en portrait et en paysage : la carte et les deux boutons tiennent à l’écran', async ({ page }) => {
    await analyze(page);
    await page.getByRole('button', { name: 'Trier les photos inutiles' }).click();
    const s = sorter(page);
    // Au téléphone, le swipe est la façon par défaut.
    await expect(s.getByRole('button', { name: 'Swipe', pressed: true })).toBeVisible();
    for (const [w, h, name] of [
      [393, 760, 'portrait'],
      [760, 393, 'paysage'],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      const card = (await s.getByTestId('swipe-card').boundingBox())!;
      const keep = (await s.getByRole('button', { name: '✓ Je garde' }).boundingBox())!;
      expect(card.height).toBeGreaterThan(h * 0.3);
      expect(keep.y + keep.height).toBeLessThanOrEqual(h);
      await page.screenshot({ path: join(SHOTS, `swipe-${name}.png`) });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('modèle des photos inutiles (téléchargé : E2E_MODELE=1)', () => {
  test.skip(!process.env.E2E_MODELE, 'télécharge le modèle');
  test.setTimeout(300_000);

  test('la page de texte est un document ; les photos noires, prises par erreur', async ({ page }) => {
    await analyze(page, true, false);
    await expect(page.getByText(/Photos inutiles reconnues par (la carte graphique|le processeur)/)).toBeVisible();
    await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
    await expect(page.getByTestId('group').filter({ hasText: 'page.jpg' })).toContainText('Document');
    await expect(page.getByTestId('group').filter({ hasText: 'noire-1.jpg' })).toContainText('Prise par erreur');
  });

  test('deuxième analyse : modèle déjà là, ni téléchargé ni rechargé', async ({ page }) => {
    await analyze(page, true, false);
    // Relancer ne recharge aucun modèle (rien de nouveau à reconnaître), mais garde ce qu'il avait reconnu.
    const workers: string[] = [];
    page.on('worker', (w) => workers.push(w.url()));
    await page.getByRole('button', { name: 'Dossiers…' }).click();
    await openPhotos(page);
    await expect(page.getByText('rien de nouveau')).toBeVisible({ timeout: 30_000 });
    expect(workers.filter((u) => /clip|embed/.test(u))).toEqual([]);
    await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
    await expect(page.getByTestId('group').filter({ hasText: 'page.jpg' })).toContainText('Document');

    // Une photo à reconnaître : le modèle est relu du disque, l'écran ne parle pas de téléchargement.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const open = indexedDB.open('twin-pics');
          open.onsuccess = () => {
            const tx = open.result.transaction('photos', 'readwrite');
            const all = tx.objectStore('photos').openCursor();
            all.onsuccess = () => {
              const c = all.result;
              if (!c) return;
              c.update({ ...c.value, clipModel: 'ancien' });
              c.continue();
            };
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
          };
        }),
    );
    await page.evaluate(() => {
      (window as unknown as { seen: string }).seen = '';
      new MutationObserver(() => ((window as unknown as { seen: string }).seen += document.querySelector('.scan h2')?.textContent ?? '')).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await page.getByRole('button', { name: 'Dossiers…' }).click();
    await openPhotos(page);
    await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 120_000 });
    const seen = await page.evaluate(() => (window as unknown as { seen: string }).seen);
    expect(seen).toContain('Préparation du modèle');
    expect(seen).not.toContain('Téléchargement');
  });

  test('sur le processeur (version fp32), même résultat', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('model-device', 'wasm'));
    await analyze(page, true, false);
    await expect(page.getByText('Photos inutiles reconnues par le processeur, plus lent.')).toBeVisible();
    await page.locator('.fn-switch').getByRole('button', { name: /Photos inutiles/ }).click();
    await expect(page.getByTestId('group').filter({ hasText: 'page.jpg' })).toContainText('Document');
  });
});
