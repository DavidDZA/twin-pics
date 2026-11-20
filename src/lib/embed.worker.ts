/**
 * Le modèle des photos « similaires » (DINOv2-small, quantifié : 24 Mo), dans un worker. Il transforme chaque photo
 * en un vecteur de 384 nombres ; deux photos de la même scène ont des vecteurs proches.
 *
 * Téléchargé depuis Hugging Face la première fois, puis gardé par le navigateur (Cache Storage). Les photos, elles,
 * ne quittent jamais l'ordinateur : le modèle tourne ici (WebAssembly).
 */
import { env, pipeline, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBED_DTYPE, EMBED_MODEL } from './model';
import type { EmbedMessage, EmbedRequest } from './messages';

env.allowLocalModels = false;

let extractor: ImageFeatureExtractionPipeline | null = null;

const post = (m: EmbedMessage, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

async function load(): Promise<void> {
  const files = new Map<string, { loaded: number; total: number }>();
  extractor = (await pipeline('image-feature-extraction', EMBED_MODEL, {
    dtype: EMBED_DTYPE,
    device: 'wasm',
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', loaded, total });
    },
  })) as ImageFeatureExtractionPipeline;
  post({ type: 'ready', device: 'wasm' });
}

async function embed(file: File): Promise<Float32Array> {
  const full = await createImageBitmap(file, { imageOrientation: 'from-image' });
  // Petit côté à 256 px : le modèle redimensionne à 256 puis garde le carré central de 224.
  const scale = Math.min(1, 256 / Math.min(full.width, full.height));
  const w = Math.max(1, Math.round(full.width * scale));
  const h = Math.max(1, Math.round(full.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(full, 0, 0, w, h);
  full.close();
  const image = new RawImage(ctx.getImageData(0, 0, w, h).data, w, h, 4).rgb();
  const out = await extractor!(image);
  // Sortie [1, jetons, 384] : le premier jeton (CLS) résume l'image.
  const dims = out.dims;
  const size = dims[dims.length - 1];
  const cls = (out.data as Float32Array).slice(0, size);
  let n = 0;
  for (const x of cls) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < cls.length; i++) cls[i] /= n;
  return cls;
}

self.onmessage = async (e: MessageEvent<EmbedRequest>) => {
  const req = e.data;
  if (req.type === 'load') {
    try {
      await load();
    } catch (err) {
      post({ type: 'error', error: String(err) });
    }
    return;
  }
  try {
    const vector = await embed(req.file);
    post({ type: 'vector', id: req.id, vector }, [vector.buffer]);
  } catch (err) {
    post({ type: 'failed', id: req.id, error: String(err) });
  }
};
