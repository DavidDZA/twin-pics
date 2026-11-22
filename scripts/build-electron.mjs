/**
 * Processus principal et preload de l'appli PC → dist-electron/main.cjs, dist-electron/preload.cjs (esbuild).
 * L'interface, elle, est le site construit par Vite (dist/). `--watch` : reconstruit à chaque modification.
 */
import { build, context } from 'esbuild';

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', sourcemap: true, external: ['electron'], logLevel: 'warning' };
const entries = [
  { entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' },
  { entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' },
];

if (process.argv.includes('--watch')) {
  for (const e of entries) await (await context({ ...common, ...e })).watch();
} else {
  await Promise.all(entries.map((e) => build({ ...common, ...e })));
}
