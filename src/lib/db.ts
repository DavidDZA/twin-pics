/**
 * Base locale (IndexedDB, Dexie) : rien ne quitte l'ordinateur.
 *
 * - `photos` : ce que l'analyse a trouvé pour chaque fichier (empreintes, date, vecteur du modèle). Une photo
 *   inchangée (même chemin, même taille, même date de modification) n'est jamais réanalysée : relancer l'analyse
 *   d'un dossier déjà vu prend quelques secondes.
 * - `thumbs` : miniatures JPEG (200 px), à part pour garder `photos` légère.
 * - `labels` : les groupes « Pas des doublons » / « Pas inutiles », mis de côté (`ignored.ts`).
 * - `marks` (doublons) et `junkMarks` (photos inutiles) : le tri, photo par photo (« garder » / « supprimer »), retenu
 *   jusqu'à la suppression (`choices.ts`). Deux tables : les deux fonctions ne se mélangent pas.
 * - `meta` : dernier dossier ouvert (son accès, avec la File System Access API), versions des modèles, stats.
 */
import Dexie, { type Table } from 'dexie';
import type { Kind, Params } from './groups';
import type { Mark } from './choices';
import type { Quality } from './quality';

export interface PhotoRow {
  key: string;
  path: string;
  size: number;
  lastModified: number;
  sha?: string;
  dhash?: string;
  sharpness?: number;
  width?: number;
  height?: number;
  time?: number;
  camera?: string;
  /** La photo n'a pas pu être lue : « decode », format non pris en charge ; « read », disparue (jamais en base). */
  error?: string;
  emb?: Float32Array;
  /** Modèle qui a calculé `emb` (`EMBED_ID`). */
  embModel?: string;
  /** Mesures de qualité (photos inutiles) et leur version (`QUALITY_VERSION`). */
  quality?: Quality;
  qv?: number;
  /** Vecteur MobileCLIP (photos inutiles) et le modèle qui l'a calculé (`clipId`). */
  clip?: Float32Array;
  clipModel?: string;
}

export interface ThumbRow {
  key: string;
  blob: Blob;
}

/** `good` (« Bien trouvé ») : anciennes réponses (jusqu'à la version 0.4), plus utilisées. */
export type Verdict = 'good' | 'wrong';

export interface LabelRow {
  groupId: string;
  verdict: Verdict;
  kind: Kind;
  keys: string[];
  params?: Params;
  at: number;
}

/** Le tri d'une photo : à garder ou à supprimer (version 2 de la base). */
export interface MarkRow {
  key: string;
  mark: Mark;
  /** Groupe dans lequel elle a été triée. */
  groupId: string;
  at: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

class TwinPicsDB extends Dexie {
  photos!: Table<PhotoRow, string>;
  thumbs!: Table<ThumbRow, string>;
  labels!: Table<LabelRow, string>;
  meta!: Table<MetaRow, string>;
  marks!: Table<MarkRow, string>;
  junkMarks!: Table<MarkRow, string>;

  constructor() {
    super('twin-pics');
    this.version(1).stores({
      photos: '&key',
      thumbs: '&key',
      labels: '&groupId, verdict',
      meta: '&key',
    });
    this.version(2).stores({ marks: '&key, groupId' });
    // Version 3 (appli 0.5) : le tri des photos inutiles (groupes « j… ») a sa propre table.
    this.version(3)
      .stores({ junkMarks: '&key, groupId' })
      .upgrade(async (tx) => {
        const rows = await tx.table<MarkRow>('marks').where('groupId').startsWith('j').toArray();
        await tx.table('junkMarks').bulkPut(rows);
      });
  }
}

export const db = new TwinPicsDB();

/** Clé d'une photo : chemin (dossier choisi compris), taille, date de modification. */
export function photoKey(path: string, size: number, lastModified: number): string {
  return `${path}\u0000${size}\u0000${lastModified}`;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
