/**
 * Chemins : l'interface les voit avec des « / » (`F:/Photos/a.jpg`), le disque avec ceux du système.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const toSlash = (p: string): string => p.split(sep).join('/');

export const toNative = (p: string): string => resolve(p);

/** `path` est-il dans `root` (ou `root` lui-même) ? Refuse « .. » et les autres disques. */
export function isInside(root: string, path: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}

export function insideAny(roots: Iterable<string>, path: string): boolean {
  for (const r of roots) if (isInside(r, path)) return true;
  return false;
}
