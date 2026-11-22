/**
 * Ce que l'appli PC (Electron) donne à l'interface : `window.twinPics`, défini par `electron/preload.ts`. Les chemins
 * sont complets, avec des « / » (`F:/Photos/Vacances/plage.jpg`) ; le processus principal les remet à la mode
 * Windows. Il n'ouvre et ne touche que les photos des dossiers choisis par l'utilisateur.
 */

export interface ListedFile {
  path: string;
  size: number;
  lastModified: number;
}

export interface DesktopListing {
  files: ListedFile[];
  unsupported: number;
  videos: number;
}

/** Où vont les photos supprimées : la Corbeille de Windows, ou un dossier « À supprimer ». */
export type RemoveMode = 'trash' | 'folder';

export interface RemoveRequest {
  /** Dossier analysé : la structure des sous-dossiers est gardée dans le dossier « À supprimer ». */
  root: string;
  paths: string[];
  mode: RemoveMode;
  /** Dossier « À supprimer » (mode `folder`). */
  folder?: string;
}

/**
 * Le sort d'une photo. `error` : `trash` (pas de Corbeille sur ce disque, une clé USB par exemple : la photo n'est
 * pas touchée), `missing` (le fichier n'est plus là), `other`.
 */
export interface RemoveOutcome {
  path: string;
  ok: boolean;
  /** Mode `folder` : où la photo a été déplacée. */
  movedTo?: string;
  error?: 'trash' | 'missing' | 'other';
  message?: string;
}

export interface Move {
  from: string;
  to: string;
}

export interface DesktopApi {
  /** Fenêtre de choix d'un dossier de photos ; `null` si annulée. */
  pickFolder(): Promise<string | null>;
  /** Le dernier dossier analysé, s'il existe encore. */
  lastFolder(): Promise<string | null>;
  /** Rouvre un dossier déjà choisi (« Reprendre ») ; `false` s'il n'existe plus. */
  openFolder(path: string): Promise<boolean>;
  /**
   * Les photos d'un dossier choisi, sous-dossiers compris, sauf `exclude` (le dossier « À supprimer ») ;
   * `onListProgress` donne le nombre trouvé.
   */
  list(root: string, exclude?: string[]): Promise<DesktopListing>;
  onListProgress(listener: (found: number) => void): () => void;
  /** Fenêtre de choix du dossier « À supprimer ». */
  pickRemoveFolder(defaultPath?: string): Promise<string | null>;
  remove(request: RemoveRequest): Promise<RemoveOutcome[]>;
  /** Remet des photos déplacées à leur place (`from` : où elles sont, `to` : leur place d'origine). */
  restore(moves: Move[]): Promise<RemoveOutcome[]>;
  /** Ouvre l'Explorateur sur un fichier ou un dossier. */
  showInFolder(path: string): Promise<void>;
  /** Ouvre un lien dans le navigateur. */
  openExternal(url: string): Promise<void>;
}

/** Adresse d'une photo pour l'interface de l'appli PC (lue par le processus principal). */
export const PHOTO_URL = 'app://twin-pics/_photo/';

export function photoUrl(path: string): string {
  return PHOTO_URL + encodeURIComponent(path);
}

declare global {
  interface Window {
    twinPics?: DesktopApi;
  }
}
