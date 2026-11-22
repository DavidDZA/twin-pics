/**
 * Les photos d'un dossier, sous-dossiers compris (appli PC). Mêmes règles que le site (`src/lib/filetypes.ts`) :
 * corbeilles, dossiers système et dossier « À supprimer » de l'appli ignorés.
 */
import { opendir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileType, isSkippedDir } from '../src/lib/filetypes';
import type { DesktopListing } from '../src/platform/bridge';
import { isInside, toSlash } from './paths';

/** `exclude` : dossiers à ne pas parcourir (le dossier « À supprimer » choisi, s'il est dans le dossier analysé). */
export async function listFolder(root: string, onProgress: (found: number) => void, exclude: string[] = []): Promise<DesktopListing> {
  const out: DesktopListing = { files: [], unsupported: 0, videos: 0 };
  const walk = async (dir: string) => {
    let handle;
    try {
      handle = await opendir(dir);
    } catch {
      return; // Dossier illisible (droits) : ignoré.
    }
    for await (const entry of handle) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isSkippedDir(entry.name) && !exclude.some((e) => isInside(e, full))) await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const type = fileType(entry.name);
      if (type === 'image') {
        try {
          const s = await stat(full);
          out.files.push({ path: toSlash(full), size: s.size, lastModified: Math.floor(s.mtimeMs) });
          if (out.files.length % 200 === 0) onProgress(out.files.length);
        } catch {
          // Fichier disparu entre-temps.
        }
      } else if (type === 'unsupported') out.unsupported++;
      else if (type === 'video') out.videos++;
    }
  };
  await walk(root);
  onProgress(out.files.length);
  return out;
}
