/** Worker du banc de mesure : charge le modèle sur le périphérique demandé, puis calcule les vecteurs d'images. */
import { env, pipeline, RawImage, type ImageFeatureExtractionPipeline } from '@huggingface/transformers';
import { EMBED_MODEL } from '../../src/lib/model';

env.allowLocalModels = false;
let extractor: ImageFeatureExtractionPipeline;

self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  try {
    if (m.load) {
      extractor = (await pipeline('image-feature-extraction', EMBED_MODEL, { device: m.device, dtype: m.dtype })) as ImageFeatureExtractionPipeline;
      // Premier passage (compilation des noyaux WebGPU) hors mesure.
      await extractor(new RawImage(new Uint8ClampedArray(256 * 256 * 3).fill(128), 256, 256, 3));
      self.postMessage({ ready: true });
      return;
    }
    const vectors: Float32Array[] = [];
    for (const img of m.images as ImageData[]) {
      const o = await extractor(new RawImage(img.data, img.width, img.height, 4).rgb());
      const v = (o.data as Float32Array).slice(0, o.dims[o.dims.length - 1]);
      let n = 0;
      for (const x of v) n += x * x;
      vectors.push(v.map((x) => x / Math.sqrt(n)));
    }
    self.postMessage({ done: true, vectors });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
