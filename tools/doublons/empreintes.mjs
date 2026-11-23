/** Lance `empreintes.ts` (construit par esbuild) : `node tools/doublons/empreintes.mjs [dossier]`. */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', '..', 'test-results', 'empreintes.mjs');
await build({
  entryPoints: [join(import.meta.dirname, 'empreintes.ts')],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['sharp'],
  logLevel: 'warning',
  define: { 'import.meta.dirname': JSON.stringify(import.meta.dirname) },
});
const r = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
