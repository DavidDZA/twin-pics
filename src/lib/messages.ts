/**
 * Messages échangés avec les workers d'analyse (`analyze.worker.ts`) et des modèles (`embed.worker.ts` : photos
 * similaires ; `clip.worker.ts` : photos inutiles, mêmes messages).
 */
import type { Quality } from './quality';

/** Pixels RGBA d'une petite version de la photo (petit côté de 256 px) : l'entrée du modèle. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface AnalyzeRequest {
  id: number;
  /** Le fichier, lu une seule fois par la page et transféré au worker. */
  buffer: ArrayBuffer;
  /**
   * `full` : toute l'analyse ; `pixels` : seulement l'entrée du modèle (photo déjà analysée, sans vecteur).
   */
  mode: 'full' | 'pixels';
  needSha: boolean;
  /**
   * Préparer l'entrée des modèles : `dated` si la photo est datée (photos similaires seulement), `all` pour toute photo
   * (MobileCLIP, photos inutiles), `none`.
   */
  wantPixels: 'none' | 'dated' | 'all';
}

export interface AnalyzeResult {
  id: number;
  ok: boolean;
  /** Pourquoi la photo n'a pas pu être lue (« decode » : format que le navigateur ne sait pas ouvrir…). */
  error?: string;
  sha?: string;
  dhash?: string;
  sharpness?: number;
  width?: number;
  height?: number;
  time?: number;
  camera?: string;
  /** Mesures de qualité (photos inutiles). */
  quality?: Quality;
  thumb?: Blob;
  pixels?: Pixels;
}

/** Où tourne le modèle : la carte graphique (WebGPU) ou le processeur (WebAssembly). */
export type ModelDevice = 'webgpu' | 'wasm';

export type EmbedRequest = { type: 'load'; device: 'auto' | 'wasm' } | { type: 'embed'; id: number; pixels: Pixels };

export type EmbedMessage =
  /** `cached` : le modèle est déjà sur l'appareil, rien n'est téléchargé. */
  | { type: 'progress'; loaded: number; total: number; cached: boolean }
  | { type: 'ready'; device: ModelDevice; dtype: string }
  | { type: 'vector'; id: number; vector: Float32Array }
  | { type: 'failed'; id: number; error: string }
  | { type: 'error'; error: string };
