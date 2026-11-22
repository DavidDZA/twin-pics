/**
 * Planche contact des photos retenues par une raison (après `calibrer.mjs`), pour les vérifier à l'œil :
 *   node tools/inutiles/planche.mjs <raison> [dossier] [nombre]  → test-results/planche-<raison>.jpg
 * Sous chaque photo : sa probabilité pour la catégorie et sa netteté.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [reason, dir = 'photos test', max = '24'] = process.argv.slice(2);
const rows = JSON.parse(readFileSync('test-results/calibrage.json', 'utf8')).filter((r) => r.reasons.includes(reason)).slice(0, Number(max));
const W = 240;
const H = 200;
const cols = 6;
const tiles = await Promise.all(
  rows.map(async (r) => {
    const img = await sharp(join(dir, r.path)).rotate().resize(W, H - 28, { fit: 'contain', background: '#222' }).toBuffer();
    const s = r.scores[reason] !== undefined ? `${Math.round(r.scores[reason] * 100)} %` : '';
    const label = `${s} n=${Math.round(r.q.sharp)} l=${Math.round(r.q.lum)} c=${Math.round(r.q.contrast)}`;
    const text = Buffer.from(`<svg width="${W}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="4" y="19" font-size="14" fill="#fff" font-family="Arial">${label}</text></svg>`);
    return sharp({ create: { width: W, height: H, channels: 3, background: '#222' } })
      .composite([{ input: img, top: 0, left: 0 }, { input: text, top: H - 28, left: 0 }])
      .png()
      .toBuffer();
  }),
);
const lines = Math.max(1, Math.ceil(tiles.length / cols));
await sharp({ create: { width: W * cols, height: H * lines, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
  .jpeg({ quality: 80 })
  .toFile(`test-results/planche-${reason}.jpg`);
console.log(`test-results/planche-${reason}.jpg (${tiles.length} photos)`);
