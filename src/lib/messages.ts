/** Messages échangés avec les workers d'analyse (`analyze.worker.ts`) et du modèle (`embed.worker.ts`). */

export interface AnalyzeRequest {
  id: number;
  file: File;
  needSha: boolean;
}

export interface AnalyzeResult {
  id: number;
  ok: boolean;
  /** Pourquoi la photo n'a pas pu être lue (« decode » : format que le navigateur ne sait pas ouvrir, HEIC…). */
  error?: string;
  sha?: string;
  dhash?: string;
  sharpness?: number;
  width?: number;
  height?: number;
  time?: number;
  camera?: string;
  thumb?: Blob;
}

export type EmbedRequest = { type: 'load' } | { type: 'embed'; id: number; file: File };

export type EmbedMessage =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'vector'; id: number; vector: Float32Array }
  | { type: 'failed'; id: number; error: string }
  | { type: 'error'; error: string };
