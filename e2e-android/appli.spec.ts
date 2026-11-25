import { _android, expect, test, type AndroidDevice, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { PHOTOS_DIR } from '../e2e/photos';

/**
 * La vraie appli sur un téléphone simulé : autorisation d'Android, galerie, analyse dans la WebView, corbeille du
 * téléphone (fenêtre d'Android refusée, acceptée, annulée), bouton Retour, rotation. La page est pilotée par le
 * débogage de la WebView, les fenêtres d'Android par `uiautomator`.
 */

const PKG = 'io.github.daviddza.twinpics';
const APK = process.env.TP_APK ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
const SHOTS = join(import.meta.dirname, '..', 'test-results');

const adb = (...args: string[]) => execFileSync('adb', args, { encoding: 'utf8', maxBuffer: 32_000_000 });
const shell = (cmd: string) => adb('shell', cmd);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appuie sur un bouton d'une fenêtre d'Android (texte ou identifiant). */
async function tapSystem(what: RegExp): Promise<void> {
  let xml = '';
  for (let i = 0; i < 30; i++) {
    try {
      shell('uiautomator dump /sdcard/ui.xml');
      xml = shell('cat /sdcard/ui.xml');
      for (const node of xml.match(/<node [^>]*>/g) ?? []) {
        const get = (k: string) => new RegExp(`${k}="([^"]*)"`).exec(node)?.[1] ?? '';
        if (!what.test(get('text')) && !what.test(get('resource-id'))) continue;
        const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(get('bounds'));
        if (!b) continue;
        const [x1, y1, x2, y2] = b.slice(1).map(Number);
        shell(`input tap ${Math.round((x1 + x2) / 2)} ${Math.round((y1 + y2) / 2)}`);
        await sleep(1500);
        return;
      }
    } catch {
      // Écran en mouvement : nouvel essai.
    }
    await sleep(1000);
  }
  const seen = [...xml.matchAll(/(?:text|resource-id)="([^"]+)"/g)].map((m) => m[1]).join(' | ');
  throw new Error(`bouton d'Android introuvable : ${what} ; à l'écran : ${seen.slice(0, 1500)}`);
}

const screenshot = (name: string) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(join(SHOTS, name), execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 32_000_000 }));
};

/** Images de la galerie d'Android (hors corbeille). */
const galleryCount = () => (shell('content query --uri content://media/external/images/media --projection _id').match(/^Row:/gm) ?? []).length;

let device: AndroidDevice;

async function open(): Promise<Page> {
  shell(`am force-stop ${PKG}`);
  shell(`am start -W -n ${PKG}/.MainActivity`);
  const page = await (await device.webView({ pkg: PKG }, { timeout: 60_000 })).page();
  page.setDefaultTimeout(30_000);
  return page;
}

test.beforeAll(async () => {
  [device] = await _android.devices();
  expect(device, 'aucun appareil').toBeTruthy();
  shell('settings put system accelerometer_rotation 0');
  shell('rm -rf /sdcard/DCIM /sdcard/Pictures/Mes');
  shell('mkdir -p /sdcard/DCIM');
  for (const dir of fs.readdirSync(PHOTOS_DIR)) adb('push', join(PHOTOS_DIR, dir), '/sdcard/DCIM/');
  shell('content call --uri content://media --method scan_volume --arg external_primary');
  for (let i = 0; i < 30 && galleryCount() < 14; i++) await sleep(1000);
});

test.beforeEach(() => {
  try {
    adb('uninstall', PKG);
  } catch {
    // Pas encore installée.
  }
  adb('install', '-r', APK);
});

test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus) {
    screenshot(`android-echec-${info.retry}.png`);
    const log = adb('logcat', '-d', '-t', '300', '*:E');
    fs.writeFileSync(join(SHOTS, `android-logcat-${info.retry}.txt`), log);
  }
});

test.afterAll(async () => {
  await device?.close();
});

test('autorisation, analyse, corbeille du téléphone, bouton Retour, rotation', async () => {
  const total = galleryCount();
  let page = await open();
  await page.getByRole('button', { name: /Autoriser l’accès|Allow access/ }).click();
  await tapSystem(/permission_allow_all_button|permission_allow_button|^Allow all$/);
  const analyze = page.getByRole('button', { name: /^(Analyser|Analyze) \d+ photos$/ });
  await expect(analyze).toBeVisible({ timeout: 30_000 });
  screenshot('android-depart.png');

  // En français, pour la suite (choix retenu, comme par l'utilisateur).
  await page.evaluate(() => localStorage.setItem('app-lang', 'fr'));
  page = await open();
  await page.getByRole('button', { name: /^Analyser \d+ photos$/ }).click();
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 120_000 });
  screenshot('android-resultats.png');

  // Les barres d'Android ne cachent rien : la page ne commence pas sous la barre d'état, rien ne déborde.
  const size = await page.evaluate(() => ({ h: window.innerHeight * devicePixelRatio, screen: window.screen.height * devicePixelRatio, wide: document.documentElement.scrollWidth - window.innerWidth }));
  expect(size.wide).toBeLessThanOrEqual(0);
  expect(size.h).toBeLessThan(size.screen);

  // Miniatures et photos d'origine lues dans la galerie.
  await page.getByRole('button', { name: 'Trier les doublons' }).click();
  const sorter = page.getByRole('dialog', { name: 'Trier les doublons' });
  await expect.poll(() => sorter.locator('img').first().evaluate((i: HTMLImageElement) => i.src.includes('/_photo/') && i.naturalWidth)).toBeTruthy();
  shell('settings put system user_rotation 1');
  await expect.poll(() => page.evaluate(() => window.innerWidth > window.innerHeight)).toBe(true);
  screenshot('android-paysage.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  shell('settings put system user_rotation 0');
  await expect.poll(() => page.evaluate(() => window.innerWidth < window.innerHeight)).toBe(true);
  // Bouton Retour : le tri se ferme, l'appli reste.
  shell('input keyevent KEYCODE_BACK');
  await expect(sorter).toHaveCount(0);

  // Corbeille du téléphone : refusée, puis acceptée.
  await page.getByRole('button', { name: /Supprimer toutes les copies exactes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Avant de supprimer' });
  const confirm = dialog.getByRole('button', { name: 'Supprimer 2 photos' });
  await confirm.click();
  await sleep(2000);
  screenshot('android-corbeille.png');
  await tapSystem(/^(Deny|Don.t allow|Cancel)$/i);
  await expect(confirm).toBeVisible();
  expect(galleryCount()).toBe(total);
  await confirm.click();
  await tapSystem(/^Allow$|^Move to trash$/i);
  const report = page.getByTestId('remove-report');
  await expect(report).toContainText('2 photos supprimées');
  expect(galleryCount()).toBe(total - 2);

  // Annuler : Android redemande, les photos reviennent à leur place.
  await report.getByRole('button', { name: 'Annuler' }).click();
  await tapSystem(/^Allow$|^Restore$/i);
  await expect(report).toContainText('2 photos remises à leur place.');
  expect(galleryCount()).toBe(total);

  // Retour : résultats → départ → arrière-plan, sans perdre la page.
  shell('input keyevent KEYCODE_BACK');
  await expect(page.getByRole('button', { name: /^Analyser/ })).toBeVisible();
  shell('input keyevent KEYCODE_BACK');
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
  expect(await page.getByRole('button', { name: /^Analyser/ }).count()).toBe(1);

  // Pour information : la carte graphique dans la WebView de cet appareil.
  const gpu = await page.evaluate(async () => {
    const g = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const a = await g?.requestAdapter();
    return `${navigator.userAgent.match(/Chrome\/\d+/)?.[0]} ; WebGPU ${g ? (a ? `oui, f16 ${a.features.has('shader-f16')}` : 'sans carte') : 'non'} ; mémoire ${(navigator as { deviceMemory?: number }).deviceMemory} Go`;
  });
  console.log(`::notice title=WebView::${gpu}`);
});

test('modèle des photos similaires dans la WebView', async () => {
  test.skip(!process.env.E2E_MODELE, 'télécharge le modèle : E2E_MODELE=1');
  for (const p of ['READ_MEDIA_IMAGES', 'ACCESS_MEDIA_LOCATION']) shell(`pm grant ${PKG} android.permission.${p}`);
  let page = await open();
  await page.evaluate(() => {
    localStorage.setItem('app-lang', 'fr');
    localStorage.setItem('opt-similar', 'true');
  });
  page = await open();
  await page.getByRole('button', { name: /^Analyser \d+ photos$/ }).click();
  await expect(page.getByTestId('analyzed')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText(/Photos similaires calculées par/)).toBeVisible();
  console.log(`::notice title=Modèle::${await page.locator('.scan-info').innerText()}`);
  await expect(page.getByText('rafale-1.jpg').first()).toBeVisible();
});
