/**
 * Supprimer des photos (appli PC), de deux façons au choix :
 * - **Corbeille de Windows** (`shell.trashItem`) : récupérables depuis la Corbeille. Sur un disque sans Corbeille
 *   (clé USB…), Electron refuse au lieu d'effacer définitivement : la photo reste en place, signalée `trash` ;
 * - **dossier « À supprimer »** : la photo y est déplacée en gardant ses sous-dossiers (`Vacances/plage.jpg` →
 *   `À supprimer/Vacances/plage.jpg`), jamais par-dessus un fichier existant (« plage (2).jpg »). Annulable
 *   (`restore`).
 */
import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import type { Move, RemoveOutcome, RemoveRequest } from '../src/platform/bridge';
import { isInside, toNative, toSlash } from './paths';

export interface RemoveDeps {
  /** Mettre un fichier dans la Corbeille (rejette si impossible). */
  trash(path: string): Promise<void>;
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Un nom libre à côté de `path` : « plage.jpg », sinon « plage (2).jpg », « plage (3).jpg »… */
export async function freePath(path: string): Promise<string> {
  if (!(await exists(path))) return path;
  const ext = extname(path);
  const stem = join(dirname(path), basename(path, ext));
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
}

/** Déplace un fichier ; d'un disque à l'autre, copie puis efface l'original. */
export async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  try {
    await rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await copyFile(from, to);
    await unlink(from);
  }
}

function failure(path: string, err: unknown, trash = false): RemoveOutcome {
  const code = (err as NodeJS.ErrnoException)?.code;
  return { path, ok: false, error: code === 'ENOENT' ? 'missing' : trash ? 'trash' : 'other', message: String((err as Error)?.message ?? err) };
}

export async function removePhotos(req: RemoveRequest, deps: RemoveDeps): Promise<RemoveOutcome[]> {
  const out: RemoveOutcome[] = [];
  for (const path of req.paths) {
    const native = toNative(path);
    if (!isInside(req.root, native)) {
      out.push({ path, ok: false, error: 'other', message: 'hors du dossier analysé' });
      continue;
    }
    if (!(await exists(native))) {
      out.push({ path, ok: false, error: 'missing' });
      continue;
    }
    if (req.mode === 'trash') {
      try {
        await deps.trash(native);
        out.push({ path, ok: true });
      } catch (err) {
        out.push(failure(path, err, true));
      }
      continue;
    }
    try {
      if (!req.folder) throw new Error('dossier « À supprimer » manquant');
      const dest = await freePath(join(toNative(req.folder), relative(toNative(req.root), native)));
      await moveFile(native, dest);
      out.push({ path, ok: true, movedTo: toSlash(dest) });
    } catch (err) {
      out.push(failure(path, err));
    }
  }
  return out;
}

/** Remet des photos déplacées à leur place (sans écraser une photo revenue entre-temps). */
export async function restorePhotos(moves: Move[]): Promise<RemoveOutcome[]> {
  const out: RemoveOutcome[] = [];
  for (const m of moves) {
    try {
      const dest = await freePath(toNative(m.to));
      await moveFile(toNative(m.from), dest);
      out.push({ path: m.to, ok: true, movedTo: toSlash(dest) });
    } catch (err) {
      out.push(failure(m.to, err));
    }
  }
  return out;
}
