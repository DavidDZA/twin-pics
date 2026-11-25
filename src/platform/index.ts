/**
 * Sur quoi tourne l'interface : le **site** (test, Chrome ou Edge), l'**appli PC** (Electron, `window.twinPics`) ou
 * l'**appli Android** (Capacitor, `android.ts`).
 *
 * Le site ne supprime pas : il ne peut ni mettre les photos dans la Corbeille, ni les déplacer sans risque.
 */
import type { Listing } from '../lib/files';
import { android, trashGallery, untrashPhotos } from './android';
import { photoUrl, type AndroidApi, type DesktopApi, type Move, type RemoveMode, type RemoveOutcome, type RemoveRequest } from './bridge';

export type { Move, RemoveMode, RemoveOutcome };
export { android };

export const desktop: DesktopApi | undefined = typeof window !== 'undefined' ? window.twinPics : undefined;

/** Ce qui supprime des photos (appli PC, appli Android) ; absent sur le site. */
export interface Remover {
  /** Photos par envoi : sur Android, une confirmation par lot (au plus 2 000 photos par demande). */
  batch: number;
  remove(req: RemoveRequest): Promise<RemoveOutcome[]>;
  restore(moves: Move[]): Promise<RemoveOutcome[]>;
}

const TRASH_BATCH = 1000;

function androidRemover(api: AndroidApi): Remover {
  return { batch: TRASH_BATCH, remove: (r) => trashGallery(api, r), restore: (m) => untrashPhotos(api, m, TRASH_BATCH) };
}

export const remover: Remover | undefined = desktop
  ? { batch: 20, remove: (r) => desktop.remove(r), restore: (m) => desktop.restore(m) }
  : android && androidRemover(android);

/** Page des versions de l'appli PC (exe), proposée sur le site. */
export const RELEASES_URL = 'https://github.com/DavidDZA/twin-pics/releases/latest';

/** Les photos des dossiers, lues par l'appli PC. */
export async function listDesktop(api: DesktopApi, roots: string[], exclude: string[], onProgress: (found: number) => void): Promise<Listing> {
  const off = api.onListProgress(onProgress);
  try {
    const l = await api.list(roots, exclude);
    return {
      images: l.files.map((f) => ({
        path: f.path,
        size: f.size,
        lastModified: f.lastModified,
        rank: f.root,
        read: async () => {
          const res = await fetch(photoUrl(f.path));
          if (!res.ok) throw new Error(`lecture impossible (${res.status})`);
          return res.arrayBuffer();
        },
        open: () => ({ url: photoUrl(f.path), release: () => undefined }),
      })),
      unsupported: l.unsupported,
      videos: l.videos,
    };
  } finally {
    off();
  }
}

const MODE_KEY = 'remove-mode';
const FOLDER_KEY = 'remove-folder';

export interface RemoveSettings {
  mode: RemoveMode;
  /** Dossier « À supprimer » choisi ; vide : ceux par défaut, un dans chaque dossier analysé. */
  folder: string;
}

export function readRemoveSettings(): RemoveSettings {
  try {
    return { mode: localStorage.getItem(MODE_KEY) === 'folder' ? 'folder' : 'trash', folder: localStorage.getItem(FOLDER_KEY) ?? '' };
  } catch {
    return { mode: 'trash', folder: '' };
  }
}

export function saveRemoveSettings(s: RemoveSettings): void {
  try {
    localStorage.setItem(MODE_KEY, s.mode);
    localStorage.setItem(FOLDER_KEY, s.folder);
  } catch {
    // Réglage non retenu.
  }
}

/** Les dossiers « À supprimer » utilisés : celui choisi, sinon `<dossier analysé>/<nom par défaut>` pour chacun. */
export function removeFolders(s: RemoveSettings, roots: string[], defaultName: string): string[] {
  return s.folder ? [s.folder] : roots.map((r) => `${r.replace(/\/$/, '')}/${defaultName}`);
}
