/**
 * Lire un dossier de photos, de deux façons :
 * - **File System Access API** (Chrome, Edge sur PC) : on choisit un dossier, l'appli garde son accès et pourra plus
 *   tard y déplacer des photos (dossier « À supprimer ») ; le dossier peut être repris au lancement suivant ;
 * - **champ d'envoi de dossier** (`webkitdirectory`) : partout ailleurs, en lecture seule.
 */

/** Une photo trouvée dans le dossier. `path` commence par le nom du dossier choisi. */
export interface FoundFile {
  path: string;
  file: File;
}

/** Extensions lues par le navigateur. */
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];
/** Photos que Chrome ne sait pas ouvrir (iPhone) : comptées à part, pas analysées. */
export const UNSUPPORTED_EXT = ['heic', 'heif'];
export const VIDEO_EXT = ['mp4', 'mov', 'm4v', '3gp', 'avi', 'mkv', 'webm'];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export type FileType = 'image' | 'unsupported' | 'video' | 'other';

export function fileType(name: string): FileType {
  const ext = extensionOf(name);
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (UNSUPPORTED_EXT.includes(ext)) return 'unsupported';
  if (VIDEO_EXT.includes(ext)) return 'video';
  return 'other';
}

/** Dossiers ignorés : corbeilles, miniatures et fichiers système. */
const SKIPPED_DIRS = /^(\$RECYCLE\.BIN|System Volume Information|\.thumbnails|\.trashed.*|\.git|node_modules)$/i;

export const canPickDirectory = (): boolean => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export interface Listing {
  images: FoundFile[];
  unsupported: number;
  videos: number;
}

/** Parcourt un dossier choisi avec la File System Access API (sous-dossiers compris). */
export async function listDirectory(
  root: FileSystemDirectoryHandle,
  onProgress: (found: number) => void,
  signal: AbortSignal,
): Promise<Listing> {
  const listing: Listing = { images: [], unsupported: 0, videos: 0 };
  const walk = async (dir: FileSystemDirectoryHandle, path: string) => {
    for await (const entry of dir.values()) {
      if (signal.aborted) return;
      if (entry.kind === 'directory') {
        if (!SKIPPED_DIRS.test(entry.name)) await walk(entry as FileSystemDirectoryHandle, `${path}/${entry.name}`);
        continue;
      }
      const type = fileType(entry.name);
      if (type === 'image') {
        listing.images.push({ path: `${path}/${entry.name}`, file: await (entry as FileSystemFileHandle).getFile() });
        if (listing.images.length % 100 === 0) onProgress(listing.images.length);
      } else if (type === 'unsupported') listing.unsupported++;
      else if (type === 'video') listing.videos++;
    }
  };
  await walk(root, root.name);
  onProgress(listing.images.length);
  return listing;
}

/** Les fichiers d'un champ `webkitdirectory` (chemin relatif fourni par le navigateur). */
export function listFileList(files: FileList | File[]): Listing {
  const listing: Listing = { images: [], unsupported: 0, videos: 0 };
  for (const file of Array.from(files)) {
    const path = file.webkitRelativePath || file.name;
    if (path.split('/').some((part) => SKIPPED_DIRS.test(part))) continue;
    const type = fileType(file.name);
    if (type === 'image') listing.images.push({ path, file });
    else if (type === 'unsupported') listing.unsupported++;
    else if (type === 'video') listing.videos++;
  }
  return listing;
}

/** Dossier d'une photo (sans le nom du fichier). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
