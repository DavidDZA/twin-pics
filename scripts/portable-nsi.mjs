/**
 * Met notre script d'exe portable (build/portable.nsi) à la place du modèle d'electron-builder, qui n'a pas d'option
 * pour ça : lancé par `npm run dist` (et release.yml) juste avant electron-builder. S'arrête si le modèle a changé
 * (nouvelle version d'electron-builder) : relire alors le nouveau modèle et ajuster build/portable.nsi.
 */
import { copyFileSync, readFileSync } from 'node:fs';

const template = 'node_modules/app-builder-lib/templates/nsis/portable.nsi';
const ours = 'build/portable.nsi';
const current = readFileSync(template, 'utf8');
const mine = readFileSync(ours, 'utf8');
if (current !== mine && !current.startsWith('# Exe portable de Twin Pics') && !(current.includes('UNPACK_DIR_NAME') && current.includes('extractEmbeddedAppPackage'))) {
  console.error(`Le modèle ${template} a changé : vérifier ${ours} avant de construire.`);
  process.exit(1);
}
copyFileSync(ours, template);
console.log('exe portable : build/portable.nsi');
