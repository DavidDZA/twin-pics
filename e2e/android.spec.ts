import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import { join } from 'node:path';
import { PHOTOS_DIR } from './photos';

/**
 * L'interface de l'appli Android, sur le site avec une fausse galerie (`window.twinPicsAndroid`) : autorisation,
 * dossiers, analyse, tri, corbeille du téléphone (refusée, acceptée, annulée), bouton Retour. La vraie appli, sur un
 * téléphone simulé : `e2e-android/`.
 */

const SHOTS = join(import.meta.dirname, '..', 'test-results');

interface Fake {
  access: 'all' | 'some' | 'none';
  /** Réponse à la demande d'autorisation. */
  answer: 'all' | 'some' | 'none';
  /** L'utilisateur refuse la corbeille. */
  refuse: boolean;
  calls: string[];
  photos: { id: number; path: string; size: number; lastModified: number }[];
}

/** Toutes les photos du dossier d'essai, rangées comme sur un téléphone. */
function gallery() {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  return walk(PHOTOS_DIR)
    .filter((f) => !f.endsWith('.mp4'))
    .map((file, i) => ({ id: i + 1, file, path: 'DCIM/' + file.slice(PHOTOS_DIR.length + 1).replaceAll('\\', '/'), size: fs.statSync(file).size, lastModified: 1_700_000_000_000 }));
}

async function openPhone(page: Page, access: Fake['access'], answer: Fake['answer'] = 'all') {
  const files = gallery();
  await page.route('**/_photo/*', (route) => {
    const f = files.find((x) => x.id === Number(route.request().url().split('/').pop()));
    return f ? route.fulfill({ body: fs.readFileSync(f.file), contentType: f.file.endsWith('.png') ? 'image/png' : 'image/jpeg' }) : route.fulfill({ status: 404 });
  });
  await page.addInitScript(
    ({ photos, access, answer }) => {
      const fake: Fake = { access, answer, refuse: false, calls: [], photos };
      const gone = new Set<number>();
      Object.assign(window, { fakePhone: fake });
      window.twinPicsAndroid = {
        access: async () => fake.access,
        requestAccess: async () => (fake.access = fake.answer),
        list: async () => fake.photos.filter((p) => !gone.has(p.id)),
        trash: async (ids, trashed) => {
          fake.calls.push(`${trashed ? 'corbeille' : 'retour'} ${ids.length}`);
          if (!fake.refuse) for (const id of ids) if (trashed) gone.add(id); else gone.delete(id);
          return { cancelled: fake.refuse, missing: [] };
        },
        keepAwake: (on) => void fake.calls.push(`écran ${on}`),
        openSettings: () => void fake.calls.push('réglages'),
      };
    },
    { photos: files.map(({ id, path, size, lastModified }) => ({ id, path, size, lastModified })), access, answer },
  );
  await page.goto('/');
}

const set = (page: Page, v: Partial<Fake>) => page.evaluate((x) => Object.assign((window as unknown as { fakePhone: Fake }).fakePhone, x), v);
const calls = (page: Page) => page.evaluate(() => (window as unknown as { fakePhone: Fake }).fakePhone.calls);
const back = (page: Page) => page.evaluate(() => window.twinPicsBack!());
const noScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

test('première ouverture : autorisation, refus, photos choisies', async ({ page }, info) => {
  await openPhone(page, 'none', 'none');
  await expect(page.getByText('Tout se passe sur ton téléphone')).toBeVisible();
  // Rien de l'appli PC ni du site.
  await expect(page.getByRole('button', { name: 'Choisir un dossier de photos' })).toHaveCount(0);
  await expect(page.getByText('Télécharger l’appli PC')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Confidentialité' })).toHaveAttribute('href', /confidentialite\.html$/);
  // Recherches longues : décochées au départ sur un téléphone.
  await expect(page.getByRole('checkbox', { name: /photos similaires/ })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: /documents, tickets et mèmes/ })).not.toBeChecked();

  await page.getByRole('button', { name: 'Autoriser l’accès à mes photos' }).click();
  await expect(page.getByText('Twin Pics n’a pas accès à tes photos.')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir les réglages' }).click();
  expect(await calls(page)).toContain('réglages');

  await set(page, { answer: 'some' });
  await page.getByRole('button', { name: 'Autoriser l’accès à mes photos' }).click();
  await expect(page.getByText('Twin Pics ne voit que les photos que tu as choisies.')).toBeVisible();
  await set(page, { answer: 'all' });
  await page.getByRole('button', { name: 'Changer les photos autorisées' }).click();
  await expect(page.getByText('Twin Pics ne voit que')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Analyser \d+ photos$/ })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, `android-depart-${info.project.name}.png`), fullPage: true });
  await noScroll(page);
});

test('dossiers : décochés, retenus ; plus rien à analyser', async ({ page }, info) => {
  await openPhone(page, 'all');
  const total = page.getByRole('button', { name: /^Analyser/ });
  const before = Number((await total.textContent())!.match(/\d+/)![0]);
  await page.getByRole('button', { name: 'Dossiers : tous (4)' }).click();
  const list = page.getByTestId('albums');
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await page.screenshot({ path: join(SHOTS, `android-dossiers-${info.project.name}.png`), fullPage: true });
  await noScroll(page);
  await list.getByRole('checkbox', { name: /Animaux/ }).uncheck();
  await expect(total).toHaveText(`Analyser ${before - 2} photos`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dossiers : 3 sur 4' })).toBeVisible();
  await page.getByRole('button', { name: 'Dossiers : 3 sur 4' }).click();
  await page.getByRole('button', { name: 'Tout décocher' }).click();
  await expect(total).toBeDisabled();
  await page.getByRole('button', { name: 'Tout cocher' }).click();
  await expect(total).toHaveText(`Analyser ${before} photos`);
});

test('analyse, tri, corbeille du téléphone : refusée, acceptée, annulée', async ({ page }, info) => {
  await openPhone(page, 'all');
  await page.getByRole('button', { name: /^Analyser/ }).click();
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 30_000 });
  expect((await calls(page)).filter((c) => c.startsWith('écran'))).toEqual(['écran true', 'écran false']);
  await expect(page.getByText('1 photo HEIC (iPhone)')).toBeVisible();
  await noScroll(page);

  await page.getByRole('button', { name: /Supprimer toutes les copies exactes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Avant de supprimer' });
  await expect(dialog.getByText('corbeille du téléphone')).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await page.screenshot({ path: join(SHOTS, `android-supprimer-${info.project.name}.png`) });

  // Refusé dans la fenêtre d'Android : on reste devant le récapitulatif, rien n'est compté.
  await set(page, { refuse: true });
  await dialog.getByRole('button', { name: 'Supprimer 2 photos' }).click();
  await expect(dialog.getByRole('button', { name: 'Supprimer 2 photos' })).toBeVisible();
  await expect(page.getByTestId('remove-report')).toHaveCount(0);

  await set(page, { refuse: false });
  await dialog.getByRole('button', { name: 'Supprimer 2 photos' }).click();
  const report = page.getByTestId('remove-report');
  await expect(report).toContainText('2 photos supprimées');
  await expect(report).toContainText('corbeille du téléphone pendant 30 jours');
  expect((await calls(page)).filter((c) => c.startsWith('corbeille'))).toEqual(['corbeille 2', 'corbeille 2']);

  // Annuler, refusé puis accepté.
  await set(page, { refuse: true });
  await report.getByRole('button', { name: 'Annuler' }).click();
  await expect(report.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await set(page, { refuse: false });
  await report.getByRole('button', { name: 'Annuler' }).click();
  await expect(report).toContainText('2 photos remises à leur place.');
  await expect(page.getByRole('button', { name: /Supprimer toutes les copies exactes/ })).toBeVisible();
});

test('photo disparue entre la liste et la lecture : l’analyse continue', async ({ page }) => {
  await openPhone(page, 'all');
  await page.unroute('**/_photo/*');
  const files = gallery();
  const lost = files.find((f) => f.path.endsWith('montagne.jpg'))!.id;
  await page.route('**/_photo/*', (route) => {
    const id = Number(route.request().url().split('/').pop());
    return id === lost ? route.fulfill({ status: 404 }) : route.fulfill({ body: fs.readFileSync(files[id - 1].file) });
  });
  await page.getByRole('button', { name: /^Analyser/ }).click();
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 30_000 });
  // La photo cassée du dossier d'essai, et celle qui a disparu.
  await expect(page.getByText('2 photos illisibles')).toBeVisible();
});

test('bouton Retour : visionneuse, tri, résultats, puis plus rien', async ({ page }) => {
  await openPhone(page, 'all');
  expect(await back(page)).toBe(false);
  await page.getByRole('button', { name: /^Analyser/ }).click();
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Stats et badges' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  const sorter = page.getByRole('dialog', { name: 'Trier les doublons' });
  await sorter.getByRole('button', { name: 'Plein écran' }).first().click();
  await expect(page.getByTestId('zoom')).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(page.getByTestId('zoom')).toHaveCount(0);
  await expect(sorter).toBeVisible();
  expect(await back(page)).toBe(true);
  await expect(sorter).toHaveCount(0);
  expect(await back(page)).toBe(true);
  await expect(page.getByRole('button', { name: /^Analyser/ })).toBeVisible();
  expect(await back(page)).toBe(false);
});
