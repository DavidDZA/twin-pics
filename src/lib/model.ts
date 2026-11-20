/**
 * Modèle des photos « similaires ». Les vecteurs gardés en base portent ce nom : changer de modèle (ou de
 * précision) les fait recalculer, car des vecteurs de deux modèles ne se comparent pas.
 */
export const EMBED_MODEL = 'onnx-community/dinov2-small';
export const EMBED_DTYPE = 'q8';
export const EMBED_ID = `${EMBED_MODEL}@${EMBED_DTYPE}`;
/** Taille du téléchargement, pour prévenir l'utilisateur (Mo). */
export const EMBED_SIZE_MB = 24;
