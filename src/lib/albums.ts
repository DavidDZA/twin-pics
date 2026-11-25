/**
 * Les dossiers de la galerie du téléphone (Android) : code pur. Tous sont analysés, sauf ceux que l'utilisateur
 * décoche (retenus : un nouveau dossier est donc analysé d'office).
 */
import type { GalleryPhoto } from '../platform/bridge';
import { fileType, folderOf, isSkippedDir } from './filetypes';

export interface Album {
  /** Chemin du dossier : « DCIM/Camera ». */
  path: string;
  /** Photos analysables (les HEIC sont comptées à part). */
  count: number;
}

/** Une photo que l'appli peut analyser ou compter (pas dans un dossier ignoré). */
function kept(p: GalleryPhoto): boolean {
  const type = fileType(p.path);
  return (type === 'image' || type === 'unsupported') && !folderOf(p.path).split('/').some(isSkippedDir);
}

/** Les dossiers, les plus remplis d'abord. */
export function albumsOf(photos: GalleryPhoto[]): Album[] {
  const counts = new Map<string, number>();
  for (const p of photos) {
    if (!kept(p)) continue;
    const folder = folderOf(p.path);
    counts.set(folder, (counts.get(folder) ?? 0) + (fileType(p.path) === 'image' ? 1 : 0));
  }
  return [...counts]
    .filter(([, count]) => count > 0)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

/** Ce que l'analyse verra : les photos des dossiers cochés, et le nombre de HEIC laissées de côté. */
export function selectPhotos(photos: GalleryPhoto[], off: ReadonlySet<string>): { images: GalleryPhoto[]; unsupported: number } {
  const here = photos.filter((p) => kept(p) && !off.has(folderOf(p.path)));
  const images = here.filter((p) => fileType(p.path) === 'image');
  return { images, unsupported: here.length - images.length };
}

const OFF_KEY = 'albums-off';

export function readAlbumsOff(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(OFF_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveAlbumsOff(off: ReadonlySet<string>): void {
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify([...off]));
  } catch {
    // Choix non retenu.
  }
}
