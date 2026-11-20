// Mesure de vitesse des photos similaires, dans le Chrome installé, sur ce PC :
//   node tools/vitesse/mesure.mjs [dossier de photos]
// Sans dossier : 30 photos de 12 Mpx générées (fonds d'écran de Windows agrandis, avec du grain comme une vraie
// photo). Lance Vite sur le port 5199, ouvre tools/vitesse/index.html, affiche les résultats.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from '@playwright/test';

const PORT = 5199;
let dir = process.argv[2];

if (!dir) {
  dir = path.join(os.tmpdir(), 'twin-pics-vitesse');
  fs.mkdirSync(dir, { recursive: true });
  const W = 'C:/Windows/Web/Wallpaper/';
  const sources = ['ThemeA/img20.jpg', 'ThemeA/img21.jpg', 'ThemeB/img24.jpg', 'ThemeB/img25.jpg', 'ThemeC/img28.jpg', 'ThemeC/img29.jpg', 'Spotlight/img14.jpg', 'Spotlight/img50.jpg', 'ThemeD/img32.jpg', 'ThemeA/img22.jpg'];
  const noise = Buffer.alloc(4000 * 3000 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 255;
  const grain = await sharp(noise, { raw: { width: 4000, height: 3000, channels: 3 } }).png().toBuffer();
  for (let i = 0; i < 30; i++) {
    const out = path.join(dir, `photo-${String(i).padStart(2, '0')}.jpg`);
    if (fs.existsSync(out)) continue;
    await sharp(W + sources[i % sources.length])
      .resize(4000, 3000, { fit: 'cover', position: ['centre', 'north', 'south'][i % 3] })
      .composite([{ input: grain, blend: 'soft-light' }])
      .jpeg({ quality: 92 })
      .toFile(out);
  }
}
const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => path.join(dir, f));
const mb = files.reduce((s, f) => s + fs.statSync(f).size, 0) / 1e6;
console.log(`${files.length} photos, ${mb.toFixed(0)} Mo`);

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${PORT}/tools/vitesse/index.html`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const browser = await chromium.launch({ channel: 'chrome', headless: !process.env.VISIBLE, args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.goto(`http://localhost:${PORT}/tools/vitesse/index.html`);
  await page.locator('#files').setInputFiles(files);
  await page.waitForFunction(() => window.__resultats, null, { timeout: 15 * 60_000, polling: 1000 });
  console.log(await page.locator('#out').textContent());
  await browser.close();
} finally {
  vite.kill();
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' });
}
