/**
 * Icône de l'appli Android (`npm run icon:android`) : le logo (public/favicon.svg) au centre de l'icône adaptative, à
 * chaque densité. À relancer seulement si le logo change ; les fichiers sont dans le dépôt.
 */
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

/** Icône adaptative : 108 dp, dont les 66 dp du centre toujours visibles ; le logo tient dans ce cercle. */
const FULL = 108;
const LOGO = 58;
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [name, k] of Object.entries(DENSITIES)) {
  const dir = `android/app/src/main/res/mipmap-${name}`;
  mkdirSync(dir, { recursive: true });
  const size = Math.round(FULL * k);
  const logo = await sharp('public/favicon.svg', { density: 72 * 8 }).resize(Math.round(LOGO * k)).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${dir}/ic_launcher_foreground.png`);
}
console.log('android/app/src/main/res/mipmap-*/ic_launcher_foreground.png');
