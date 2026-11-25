/**
 * Ce que l'appli PC (Electron) donne à l'interface : `window.twinPics`, défini par `electron/preload.ts`. Les chemins
 * sont complets, avec des « / » (`F:/Photos/Vacances/plage.jpg`) ; le processus principal les remet à la mode
 * Windows. Il n'ouvre et ne touche que les photos des dossiers choisis par l'utilisateur.
 */

export interface ListedFile {
  path: string;
  size: number;
  lastModified: number;
  /** Rang du dossier analysé d'où elle vient. */
  root: number;
}

export interface DesktopListing {
  files: ListedFile[];
  unsupported: number;
  videos: number;
}

/** Où vont les photos supprimées : la Corbeille de Windows, ou un dossier « À supprimer ». */
export type RemoveMode = 'trash' | 'folder';

export interface RemoveRequest {
  /** Dossiers analysés : la structure des sous-dossiers est gardée dans le dossier « À supprimer ». */
  roots: string[];
  paths: string[];
  mode: RemoveMode;
  /** Dossier « À supprimer » choisi (mode `folder`) ; vide : un dans chaque dossier analysé, nommé `folderName`. */
  folder: string;
  folderName: string;
}

/**
 * Le sort d'une photo. `error` : `trash` (pas de Corbeille sur ce disque, une clé USB par exemple : la photo n'est
 * pas touchée), `missing` (le fichier n'est plus là), `cancelled` (Android : refusé par l'utilisateur), `other`.
 */
export interface RemoveOutcome {
  path: string;
  ok: boolean;
  /** Mode `folder` : où la photo a été déplacée. */
  movedTo?: string;
  error?: 'trash' | 'missing' | 'cancelled' | 'other';
  message?: string;
}

export interface Move {
  from: string;
  to: string;
}

export interface DesktopApi {
  /** Fenêtre de choix d'un ou plusieurs dossiers de photos ; aucun si annulée. */
  pickFolders(): Promise<string[]>;
  /** Les dossiers de la dernière fois ; `missing` : introuvable pour l'instant (clé USB débranchée). */
  lastFolders(): Promise<{ path: string; missing: boolean }[]>;
  saveFolders(paths: string[]): Promise<void>;
  /** Rouvre des dossiers déjà choisis : ceux qui existent encore. */
  openFolders(paths: string[]): Promise<string[]>;
  /**
   * Les photos des dossiers choisis, sous-dossiers compris, sauf `exclude` (le dossier « À supprimer ») ;
   * `onListProgress` donne le nombre trouvé.
   */
  list(roots: string[], exclude?: string[]): Promise<DesktopListing>;
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

/** Une photo de la galerie du téléphone : son numéro, son chemin (« DCIM/Camera/IMG_1.jpg »). */
export interface GalleryPhoto {
  id: number;
  path: string;
  size: number;
  lastModified: number;
}

/** Accès à la galerie : toutes les photos, celles choisies par l'utilisateur (Android 14 et plus), aucune. */
export type GalleryAccess = 'all' | 'some' | 'none';

/** Ce que l'appli Android donne à l'interface (`android.ts`). */
export interface AndroidApi {
  access(): Promise<GalleryAccess>;
  /** Android demande l'autorisation (plus après deux refus : `openSettings`). */
  requestAccess(): Promise<GalleryAccess>;
  list(): Promise<GalleryPhoto[]>;
  /** Corbeille du téléphone (`trashed`) ou retour à leur place ; Android demande confirmation. */
  trash(ids: number[], trashed: boolean): Promise<{ cancelled: boolean; missing: number[] }>;
  /** Garde l'écran allumé. */
  keepAwake(on: boolean): void;
  openSettings(): void;
}

declare global {
  interface Window {
    twinPics?: DesktopApi;
    /** Fausse galerie des tests. */
    twinPicsAndroid?: AndroidApi;
  }
}
