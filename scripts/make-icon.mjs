/**
 * Icône de l'appli PC (`npm run icon`) : le logo du site (public/favicon.svg) rendu par Chrome sans fenêtre en PNG à
 * chaque taille, puis assemblé en .ico (PNG dans un ICO, lu par Windows depuis Vista). Résultat : build/icon.ico
 * (exe), build/icon.png (fenêtre, 512 × 512). À relancer seulement si le logo change ; les fichiers sont dans le dépôt.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SVG = readFileSync('public/favicon.svg', 'utf8');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const browser = await chromium.launch({ channel: 'chrome', env });
const page = await browser.newPage();
const render = async (size) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${SVG.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
};

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', await render(512));
const pngs = [];
for (const s of SIZES) pngs.push(await render(s));
await browser.close();

// ICO : en-tête (6 octets), une entrée de 16 octets par taille, puis les PNG.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(SIZES.length, 4);
let offset = 6 + 16 * SIZES.length;
const entries = SIZES.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync('build/icon.ico', Buffer.concat([header, ...entries, ...pngs]));
console.log('build/icon.ico, build/icon.png');
