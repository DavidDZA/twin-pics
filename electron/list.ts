/**
 * Les photos d'un ou plusieurs dossiers, sous-dossiers compris (appli PC). Mêmes règles que le site
 * (`src/lib/filetypes.ts`) : corbeilles, dossiers système et dossier « À supprimer » de l'appli ignorés.
 */
import { opendir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileType, isSkippedDir } from '../src/lib/filetypes';
import type { DesktopListing } from '../src/platform/bridge';
import { isInside, toSlash } from './paths';

/**
 * Les dossiers à parcourir : ceux compris dans un autre de la liste sont écartés, sinon leurs photos, vues deux fois,
 * seraient en double d'elles-mêmes (et supprimées !). Comparés par leur vrai emplacement : un lecteur réseau, un
 * « subst » ou une jonction peuvent mener au même endroit.
 */
export async function independentRoots(roots: string[]): Promise<string[]> {
  const real = await Promise.all(roots.map((r) => realpath(r).catch(() => resolve(r))));
  return roots.filter((_, i) => !real.some((r, j) => j !== i && isInside(r, real[i]) && (j < i || !isInside(real[i], r))));
}

/** `exclude` : dossiers à ne pas parcourir (le dossier « À supprimer » choisi, s'il est dans un dossier analysé). */
export async function listFolders(roots: string[], onProgress: (found: number) => void, exclude: string[] = []): Promise<DesktopListing> {
  const out: DesktopListing = { files: [], unsupported: 0, videos: 0 };
  const walk = async (dir: string, root: number) => {
    let handle;
    try {
      handle = await opendir(dir);
    } catch {
      return; // Dossier illisible (droits) : ignoré.
    }
    for await (const entry of handle) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isSkippedDir(entry.name) && !exclude.some((e) => isInside(e, full))) await walk(full, root);
        continue;
      }
      if (!entry.isFile()) continue;
      const type = fileType(entry.name);
      if (type === 'image') {
        try {
          const s = await stat(full);
          out.files.push({ path: toSlash(full), size: s.size, lastModified: Math.floor(s.mtimeMs), root });
          if (out.files.length % 200 === 0) onProgress(out.files.length);
        } catch {
          // Fichier disparu entre-temps.
        }
      } else if (type === 'unsupported') out.unsupported++;
      else if (type === 'video') out.videos++;
    }
  };
  for (const root of await independentRoots(roots)) await walk(root, roots.indexOf(root));
  onProgress(out.files.length);
  return out;
}
