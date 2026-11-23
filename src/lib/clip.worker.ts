/**
 * MobileCLIP-S1 (partie « image »), dans un worker : un vecteur de 512 nombres par photo, comparé ensuite à des
 * phrases (« a photo of a receipt »…, `junk.ts`) pour reconnaître les photos inutiles. Mêmes messages que le modèle
 * des photos similaires (`embed.worker.ts`).
 *
 * Carte graphique (WebGPU, `fp16`, 43 Mo) si possible, sinon processeur (WebAssembly, `fp32`, 86 Mo). Pas de version
 * quantifiée `q8` : mesuré le 22/11/2026, elle donne des résultats faux (des photos de vacances reconnues comme des
 * mèmes à 88 %), alors que `fp16` et `fp32` s'accordent.
 */
import { AutoProcessor, CLIPVisionModelWithProjection, env, RawImage, type PreTrainedModel, type Processor } from '@huggingface/transformers';
import { CLIP_MODEL } from './junk';
import { modelCached } from './model';
import type { EmbedMessage, EmbedRequest, ModelDevice } from './messages';

env.allowLocalModels = false;

let processor: Processor | null = null;
let model: PreTrainedModel | null = null;

const post = (m: EmbedMessage, transfer: Transferable[] = []) => self.postMessage(m, { transfer });

interface GpuNavigator {
  gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
}

async function gpuWithF16(): Promise<boolean> {
  try {
    const adapter = await (navigator as unknown as GpuNavigator).gpu?.requestAdapter();
    return !!adapter && adapter.features.has('shader-f16');
  } catch {
    return false;
  }
}

async function create(device: ModelDevice, dtype: 'fp16' | 'fp32'): Promise<void> {
  const cached = await modelCached(CLIP_MODEL, dtype === 'fp16' ? 'vision_model_fp16.onnx' : 'vision_model.onnx');
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (e.status !== 'progress' || !e.file) return;
    files.set(e.file, { loaded: e.loaded ?? 0, total: e.total ?? 0 });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    post({ type: 'progress', loaded, total, cached });
  };
  processor = await AutoProcessor.from_pretrained(CLIP_MODEL, { progress_callback });
  model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { device, dtype, progress_callback });
  // Premier passage à vide : sur la carte graphique, il prépare les calculs.
  await embed(new RawImage(new Uint8ClampedArray(256 * 256 * 3).fill(128), 256, 256, 3));
}

async function embed(image: RawImage): Promise<Float32Array> {
  const inputs = await processor!(image);
  const { image_embeds } = await model!(inputs);
  const v = new Float32Array(image_embeds.data as Float32Array);
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

async function load(wanted: 'auto' | 'wasm'): Promise<void> {
  if (wanted === 'auto' && (await gpuWithF16())) {
    try {
      await create('webgpu', 'fp16');
      post({ type: 'ready', device: 'webgpu', dtype: 'fp16' });
      return;
    } catch {
      // Carte graphique refusée : le processeur prend le relais.
    }
  }
  await create('wasm', 'fp32');
  post({ type: 'ready', device: 'wasm', dtype: 'fp32' });
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
    const vector = await embed(new RawImage(data, width, height, 4).rgb());
    post({ type: 'vector', id: req.id, vector }, [vector.buffer]);
  } catch (err) {
    post({ type: 'failed', id: req.id, error: String(err) });
  }
};
