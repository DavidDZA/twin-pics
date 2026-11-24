/**
 * Les dossiers à analyser (un ou plusieurs, dans l'ordre choisi) : code pur, chemins avec des « / ».
 *
 * Deux règles : un dossier déjà compris dans un autre n'est jamais ajouté (chaque photo serait vue deux fois, donc en
 * double d'elle-même), et l'ordre compte : entre deux copies, celle du dossier le plus haut est proposée.
 */

/** Un dossier de la liste. */
export type Folder =
  /** Appli PC : son chemin ; `missing` : introuvable pour l'instant (clé USB débranchée). */
  | { kind: 'desktop'; path: string; missing?: boolean }
  /** Site, File System Access API : son accès (redemandé au lancement suivant). */
  | { kind: 'handle'; handle: FileSystemDirectoryHandle }
  /** Site, champ d'envoi : ses fichiers (pas retenus au lancement suivant). */
  | { kind: 'files'; name: string; files: File[] };

const trim = (p: string) => p.replace(/\/+$/, '');

/** Nom d'un dossier : la fin de son chemin (« D: » pour un disque entier). */
export function baseName(path: string): string {
  const p = trim(path);
  return p.slice(p.lastIndexOf('/') + 1) || path;
}

export function folderName(f: Folder): string {
  return f.kind === 'desktop' ? baseName(f.path) : f.kind === 'handle' ? f.handle.name : f.name;
}

/** `path` est-il dans `root` (ou `root` lui-même) ? Windows ne distingue pas majuscules et minuscules. */
export function insidePath(root: string, path: string): boolean {
  const r = trim(root).toLowerCase();
  const p = trim(path).toLowerCase();
  return p === r || p.startsWith(r + '/');
}

/** Le dossier qui contient `path` (le plus proche s'il y en a plusieurs), ou -1. */
export function rootOf(roots: string[], path: string): number {
  let best = -1;
  roots.forEach((r, i) => {
    if (insidePath(r, path) && (best < 0 || trim(r).length > trim(roots[best]).length)) best = i;
  });
  return best;
}

/** Noms affichés des dossiers analysés : leur nom, ou le chemin complet quand deux portent le même. */
export function folderLabels(roots: string[]): string[] {
  const names = roots.map(baseName);
  return roots.map((r, i) => (names.some((n, j) => j !== i && n.toLowerCase() === names[i].toLowerCase()) ? trim(r) : names[i]));
}

/** Noms différents pour des dossiers qui portent parfois le même : « Photos », « Photos (2) » (site). */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let out = name;
    for (let n = 2; used.has(out); n++) out = `${name} (${n})`;
    used.add(out);
    return out;
  });
}

/**
 * Ajout à la liste : `covered`, le nom du dossier qui le comprend déjà (rien n'est ajouté) ; `replaced`, les noms des
 * dossiers qu'il comprend (il prend leur place).
 */
export interface Added {
  list: Folder[];
  covered?: string;
  replaced: string[];
}

/** `b` est-il dans `a` (ou le même dossier) ? */
async function contains(a: Folder, b: Folder): Promise<boolean> {
  if (a.kind === 'desktop' && b.kind === 'desktop') return insidePath(a.path, b.path);
  if (a.kind === 'handle' && b.kind === 'handle') return (await a.handle.resolve(b.handle)) !== null;
  // Champ d'envoi : le navigateur ne dit pas d'où viennent les fichiers ; un fichier commun suffit (dossier renvoyé).
  if (a.kind === 'files' && b.kind === 'files') {
    const id = (f: File) => `${f.webkitRelativePath}|${f.size}|${f.lastModified}`;
    const known = new Set(a.files.map(id));
    return b.files.some((f) => known.has(id(f)));
  }
  return false;
}

export async function addFolder(list: Folder[], folder: Folder): Promise<Added> {
  // Fichiers renvoyés : les nouveaux remplacent les anciens (illisibles s'ils ont changé entre-temps).
  if (folder.kind !== 'files') {
    for (const f of list) if (await contains(f, folder)) return { list, covered: folderName(f), replaced: [] };
  }
  const inside: Folder[] = [];
  for (const f of list) if (await contains(folder, f)) inside.push(f);
  if (!inside.length) return { list: [...list, folder], replaced: [] };
  const out = list.flatMap((f) => (f === inside[0] ? [folder] : inside.includes(f) ? [] : [f]));
  return { list: out, replaced: folder.kind === 'files' ? [] : inside.map(folderName) };
}

/** Déplace l'élément de la place `from` à la place `to` ; les autres gardent leur ordre. */
export function moveTo<F>(list: F[], from: number, to: number): F[] {
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  return out;
}

/** Une ligne à l'écran : sa position et sa hauteur. */
export interface Row {
  top: number;
  height: number;
}

/** Où tombe la ligne `from`, glissée de `dy` : elle prend la place d'une autre dès que leurs milieux se croisent. */
export function dropIndex(rows: Row[], from: number, dy: number): number {
  const top = rows[from].top + dy;
  const bottom = top + rows[from].height;
  const middle = (r: Row) => r.top + r.height / 2;
  let to = from;
  while (to < rows.length - 1 && bottom > middle(rows[to + 1])) to++;
  while (to > 0 && to <= from && top < middle(rows[to - 1])) to--;
  return to;
}
