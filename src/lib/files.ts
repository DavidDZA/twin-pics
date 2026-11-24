/**
 * Les photos des dossiers, quelle que soit la façon de le lire :
 * - **site web** : File System Access API (Chrome, Edge sur PC ; le dossier peut être repris au lancement suivant),
 *   sinon champ d'envoi de dossier (`webkitdirectory`), en lecture seule (`platform/web.ts`) ;
 * - **appli PC** : le processus principal d'Electron liste le dossier, la page lit chaque photo par l'adresse
 *   `app://twin-pics/_photo/…` (`platform/desktop.ts`).
 */
import { fileType, isSkippedDir } from './filetypes';

export { folderOf, nameOf } from './filetypes';

/** Une photo trouvée dans le dossier. */
export interface FoundFile {
  /** Chemin affiché, avec des « / » : commence par le nom du dossier choisi (site) ou est complet (appli PC). */
  path: string;
  size: number;
  lastModified: number;
  /** Rang de son dossier dans la liste des dossiers analysés. */
  rank: number;
  /** Le contenu du fichier (lu une seule fois par l'analyse). */
  read(): Promise<ArrayBuffer>;
  /** Une adresse pour l'afficher en grand ; `release` la libère. */
  open(): { url: string; release(): void };
}

export interface Listing {
  images: FoundFile[];
  unsupported: number;
  videos: number;
}

export const canPickDirectory = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Une photo d'un navigateur (objet `File`). */
export function fromFile(path: string, file: File, rank: number): FoundFile {
  return {
    path,
    size: file.size,
    lastModified: file.lastModified,
    rank,
    read: () => file.arrayBuffer(),
    open: () => {
      const url = URL.createObjectURL(file);
      return { url, release: () => URL.revokeObjectURL(url) };
    },
  };
}

/** Parcourt un dossier choisi avec la File System Access API (sous-dossiers compris) ; `name` commence les chemins. */
export async function listDirectory(
  root: FileSystemDirectoryHandle,
  name: string,
  rank: number,
  onProgress: (found: number) => void,
  signal: AbortSignal,
): Promise<Listing> {
  const listing: Listing = { images: [], unsupported: 0, videos: 0 };
  const walk = async (dir: FileSystemDirectoryHandle, path: string) => {
    for await (const entry of dir.values()) {
      if (signal.aborted) return;
      if (entry.kind === 'directory') {
        if (!isSkippedDir(entry.name)) await walk(entry as FileSystemDirectoryHandle, `${path}/${entry.name}`);
        continue;
      }
      const type = fileType(entry.name);
      if (type === 'image') {
        listing.images.push(fromFile(`${path}/${entry.name}`, await (entry as FileSystemFileHandle).getFile(), rank));
        if (listing.images.length % 100 === 0) onProgress(listing.images.length);
      } else if (type === 'unsupported') listing.unsupported++;
      else if (type === 'video') listing.videos++;
    }
  };
  await walk(root, name);
  onProgress(listing.images.length);
  return listing;
}

/** Les fichiers d'un champ `webkitdirectory` : chemin relatif fourni par le navigateur, commencé par `name`. */
export function listFileList(files: FileList | File[], name: string, rank: number): Listing {
  const listing: Listing = { images: [], unsupported: 0, videos: 0 };
  for (const file of Array.from(files)) {
    const rel = file.webkitRelativePath;
    const path = rel ? name + rel.slice(rel.indexOf('/')) : `${name}/${file.name}`;
    if (path.split('/').slice(0, -1).some(isSkippedDir)) continue;
    const type = fileType(file.name);
    if (type === 'image') listing.images.push(fromFile(path, file, rank));
    else if (type === 'unsupported') listing.unsupported++;
    else if (type === 'video') listing.videos++;
  }
  return listing;
}

/** Plusieurs listes en une. */
export function mergeListings(lists: Listing[]): Listing {
  return {
    images: lists.flatMap((l) => l.images),
    unsupported: lists.reduce((s, l) => s + l.unsupported, 0),
    videos: lists.reduce((s, l) => s + l.videos, 0),
  };
}
