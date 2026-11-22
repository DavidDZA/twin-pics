/**
 * Développement de l'appli PC : `npm run dev:pc` → Vite (interface rechargée à chaud), esbuild en surveillance
 * (processus principal), puis Electron qui charge l'interface depuis Vite. Fermer la fenêtre arrête tout.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const vite = await createServer({ configFile: 'vite.config.ts' });
await vite.listen();
const url = vite.resolvedUrls.local[0];
const watcher = spawn(process.execPath, ['scripts/build-electron.mjs', '--watch'], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1500)); // premier build d'esbuild
const electronBin = (await import('electron')).default;
const env = { ...process.env, VITE_DEV_URL: url };
delete env.ELECTRON_RUN_AS_NODE; // posée par VS Code : Electron démarrerait comme un simple Node
const app = spawn(electronBin, ['.'], { stdio: 'inherit', env });
app.on('close', async () => {
  watcher.kill();
  await vite.close();
  process.exit(0);
});
