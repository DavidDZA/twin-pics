/**
 * Lance `calibrer.ts` (construit par esbuild, comme le processus principal de l'appli PC). Exemples :
 *   node tools/inutiles/calibrer.mjs --phrases          vecteurs des phrases → src/lib/junkPrompts.json
 *   node tools/inutiles/calibrer.mjs "photos test" 400  mesure 400 photos du dossier → test-results/calibrage.json
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', '..', 'test-results', 'calibrer.mjs');
await build({
  entryPoints: [join(import.meta.dirname, 'calibrer.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['@huggingface/transformers', 'sharp', 'exifr'],
  logLevel: 'warning',
  define: { 'import.meta.dirname': JSON.stringify(import.meta.dirname) },
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
