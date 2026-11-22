/**
 * Types de fichiers et dossiers ignorés : code pur, partagé par l'interface (`files.ts`) et le processus principal de
 * l'appli PC (`electron/list.ts`).
 */

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

/**
 * Début du nom du dossier « À supprimer » de l'appli (« Twin Pics - À supprimer », « Twin Pics - To delete »…) : il
 * n'est jamais analysé, quelle que soit la langue.
 */
export const REMOVE_DIR_PREFIX = 'Twin Pics - ';

/** Dossiers ignorés : corbeilles, miniatures, fichiers système et le dossier « À supprimer » de l'appli. */
const SKIPPED_DIRS = /^(\$RECYCLE\.BIN|System Volume Information|\.thumbnails|\.trashed.*|\.git|node_modules)$/i;

export function isSkippedDir(name: string): boolean {
  return SKIPPED_DIRS.test(name) || name.startsWith(REMOVE_DIR_PREFIX);
}

/** Dossier d'une photo (sans le nom du fichier). */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
