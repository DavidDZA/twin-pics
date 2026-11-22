/**
 * Tests de l'appli PC empaquetée (`npm run e2e:exe`, après `npm run dist`) : mêmes tests que `npm run e2e:pc`, sur
 * release/win-unpacked/Twin Pics.exe (vérifie que l'exe trouve son interface et lit les photos).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const exe = resolve('release/win-unpacked/Twin Pics.exe');
if (!existsSync(exe)) {
  console.error('Appli empaquetée introuvable : lance d’abord « npm run dist ».');
  process.exit(1);
}
const r = spawnSync('npx', ['playwright', 'test', '--config', 'playwright.pc.config.ts'], { stdio: 'inherit', shell: true, env: { ...process.env, TP_E2E_EXE: exe } });
process.exit(r.status ?? 1);
