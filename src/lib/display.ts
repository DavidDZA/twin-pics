/**
 * Chemins affichés : dans l'appli PC, les chemins sont complets (`F:/Photos/Mes photos/Vacances/plage.jpg`) ; on les
 * montre à partir du dossier analysé (`Mes photos/Vacances/plage.jpg`), comme sur le site. Deux dossiers du même nom
 * sont montrés avec leur chemin complet. Le chemin complet reste dans l'infobulle.
 */
import { folderLabels, rootOf } from './folders';

let roots: string[] = [];
let labels: string[] = [];

/** Dossiers analysés (appli PC ; aucun sur le site) : les chemins sont montrés à partir de leur nom. */
export function setDisplayRoots(list: string[]): void {
  roots = list;
  labels = folderLabels(list);
}

export function shortPath(path: string): string {
  const i = rootOf(roots, path);
  return i < 0 ? path : labels[i] + path.slice(roots[i].replace(/\/+$/, '').length);
}
