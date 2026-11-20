/**
 * Modèle des photos « similaires » : DINOv2-small, en deux versions selon l'ordinateur.
 * - **carte graphique** (WebGPU, demi-précision `fp16`, 44 Mo) : environ 30 ms par photo ;
 * - **processeur** (WebAssembly, quantifié `q8`, 24 Mo) : environ 280 ms par photo et par worker.
 *
 * Mesuré le 21/11/2026 (tools/vitesse) : les deux versions donnent presque les mêmes ressemblances (écart de 0,035
 * au plus). Un vecteur garde le nom de sa version (`embedId`) : changer de version le fait recalculer, pour ne
 * jamais comparer deux vecteurs de versions différentes.
 */
export const EMBED_MODEL = 'onnx-community/dinov2-small';

export const embedId = (dtype: string) => `${EMBED_MODEL}@${dtype}`;

/** Le plus gros téléchargement possible (version carte graphique), annoncé avant l'analyse (Mo). */
export const EMBED_SIZE_MB = 45;

/** localStorage : « wasm » force le processeur (tests, dépannage d'une carte graphique capricieuse). */
export const DEVICE_KEY = 'model-device';
