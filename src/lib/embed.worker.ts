/**
 * Le modèle des photos « similaires » (DINOv2-small), dans un worker. Il transforme chaque photo en un vecteur de 384
 * nombres ; deux photos de la même scène ont des vecteurs proches.
 *
 * Sur la carte graphique si le navigateur le permet (WebGPU, demi-précision), sinon sur le processeur (WebAssembly) :
 * voir `model.ts`. Téléchargé depuis Hugging Face la première fois, puis gardé par le navigateur (Cache Storage). Les
 * photos, elles, ne quittent jamais l'ordinateur : le worker reçoit leurs pixels, réduits par `analyze.worker.ts`.
 */
import { env, pipeline, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBED_MODEL } from './model';
import type { EmbedMessage, EmbedRequest, ModelDevice } from './messages';

env.allowLocalModels = false;

let extractor: ImageFeatureExtractionPipeline | null = null;

const post = (m: EmbedMessage, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
}

/** La carte graphique, si elle sait calculer en demi-précision (presque toutes depuis 2020). */
async function gpuWithF16(): Promise<boolean> {
  try {
    const adapter = await (navigator as unknown as GpuNavigator).gpu?.requestAdapter();
    return !!adapter && adapter.features.has('shader-f16');
  } catch {
    return false;
  }
}

async function create(device: ModelDevice, dtype: string): Promise<ImageFeatureExtractionPipeline> {
  const files = new Map<string, { loaded: number; total: number }>();
  const p = (await pipeline('image-feature-extraction', EMBED_MODEL, {
    device,
    dtype: dtype as 'fp16' | 'q8',
    progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== 'progress' || !e.file) return;
      files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', loaded, total });
    },
  })) as ImageFeatureExtractionPipeline;
  // Premier passage à vide : sur la carte graphique, il prépare les calculs (quelques secondes, une fois).
  await p(new RawImage(new Uint8ClampedArray(224 * 224 * 3).fill(128), 224, 224, 3));
  return p;
}

async function load(wanted: 'auto' | 'wasm'): Promise<void> {
  if (wanted === 'auto' && (await gpuWithF16())) {
    try {
      extractor = await create('webgpu', 'fp16');
      post({ type: 'ready', device: 'webgpu', dtype: 'fp16' });
      return;
    } catch {
      // Carte graphique refusée en cours de route : le processeur prend le relais.
    }
  }
  extractor = await create('wasm', 'q8');
  post({ type: 'ready', device: 'wasm', dtype: 'q8' });
}

self.onmessage = async (e: MessageEvent<EmbedRequest>) => {
  const req = e.data;
  if (req.type === 'load') {
    try {
      await load(req.device);
    } catch (err) {
      post({ type: 'error', error: String(err) });
    }
    return;
  }
  try {
    const { data, width, height } = req.pixels;
    const out = await extractor!(new RawImage(data, width, height, 4).rgb());
    // Sortie [1, jetons, 384] : le premier jeton (CLS) résume l'image.
    const size = out.dims[out.dims.length - 1];
    const vector = new Float32Array((out.data as Float32Array).slice(0, size));
    let n = 0;
    for (const x of vector) n += x * x;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < vector.length; i++) vector[i] /= n;
    post({ type: 'vector', id: req.id, vector }, [vector.buffer]);
  } catch (err) {
    post({ type: 'failed', id: req.id, error: String(err) });
  }
};
