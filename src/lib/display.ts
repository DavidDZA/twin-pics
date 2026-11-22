/**
 * Chemins affichés : dans l'appli PC, les chemins sont complets (`F:/Photos/Mes photos/Vacances/plage.jpg`) ; on les
 * montre à partir du dossier analysé (`Mes photos/Vacances/plage.jpg`), comme sur le site. Le chemin complet reste
 * dans l'infobulle.
 */
let base = '';

/** Dossier analysé (appli PC) : les chemins sont montrés à partir de son nom. */
export function setDisplayRoot(root: string | null): void {
  if (!root) {
    base = '';
    return;
  }
  const r = root.replace(/\/+$/, '');
  base = r.slice(0, r.lastIndexOf('/') + 1);
}

export function shortPath(path: string): string {
  return base && path.startsWith(base) ? path.slice(base.length) : path;
}
