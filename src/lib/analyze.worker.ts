/**
 * Analyse d'une photo, dans un worker (plusieurs en parallèle : `scan.ts`). Le fichier arrive déjà lu (la page le lit
 * une seule fois et le transfère) : date EXIF, décodage, petite version de 256 px pour le dHash, version de 1024 px
 * pour la netteté, miniature JPEG pour l'affichage, SHA-256 si demandé (seulement quand un autre fichier a la même
 * taille : deux copies exactes ont forcément la même), et l'entrée du modèle des photos similaires si la photo est
 * datée.
 */
import exifr from 'exifr';
import { analysisSize, dHash, grayFromRGBA, SHARPNESS_SIZE, sharpness } from './imagehash';
import type { AnalyzeRequest, AnalyzeResult, Pixels } from './messages';
import { measureQuality } from './quality';

/** Grand côté de la miniature affichée dans les groupes. */
const THUMB_MAX = 200;
/** Petit côté de l'entrée du modèle (il la réduit à 256 puis garde le carré central de 224). */
const MODEL_SIDE = 256;

async function exifInfo(buffer: ArrayBuffer): Promise<{ time?: number; camera?: string }> {
  try {
    const tags = await exifr.parse(buffer, { pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model'] });
    if (!tags) return {};
    const date: unknown = tags.DateTimeOriginal ?? tags.CreateDate;
    const time = date instanceof Date && !isNaN(date.getTime()) ? date.getTime() : undefined;
    const camera = [tags.Make, tags.Model].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || undefined;
    return { time, camera };
  } catch {
    return {};
  }
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Photo redessinée à une taille donnée, et ses pixels. */
function draw(source: ImageBitmap, width: number, height: number): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function modelPixels(full: ImageBitmap): Pixels {
  const scale = Math.min(1, MODEL_SIDE / Math.min(full.width, full.height));
  const width = Math.max(1, Math.round(full.width * scale));
  const height = Math.max(1, Math.round(full.height * scale));
  return { data: draw(full, width, height), width, height };
}

async function analyze(req: AnalyzeRequest): Promise<{ result: AnalyzeResult; transfer: Transferable[] }> {
  const { id, buffer, mode, needSha, wantPixels } = req;
  const blob = new Blob([buffer]);

  if (mode === 'pixels') {
    const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const pixels = modelPixels(full);
    full.close();
    return { result: { id, ok: true, pixels }, transfer: [pixels.data.buffer] };
  }

  const [exif, sha] = await Promise.all([exifInfo(buffer), needSha ? sha256(buffer) : Promise.resolve(undefined)]);
  let full: ImageBitmap;
  try {
    // Orientation EXIF appliquée : une photo prise en portrait est analysée debout.
    full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return { result: { id, ok: false, error: 'decode', sha, ...exif }, transfer: [] };
  }
  const width = full.width;
  const height = full.height;

  const small = analysisSize(width, height);
  const gray = grayFromRGBA(draw(full, small.width, small.height), small.width, small.height);
  // Netteté sur une version plus grande : à 256 px, un léger flou ne se voit plus.
  const big = analysisSize(width, height, SHARPNESS_SIZE);
  const bigGray = grayFromRGBA(draw(full, big.width, big.height), big.width, big.height);

  const t = analysisSize(width, height, THUMB_MAX);
  const thumbCanvas = new OffscreenCanvas(t.width, t.height);
  thumbCanvas.getContext('2d')!.drawImage(full, 0, 0, t.width, t.height);
  const thumb = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });

  // Entrée des modèles : les photos similaires se cherchent dans le temps (photos datées) ; MobileCLIP voit tout.
  const pixels = wantPixels === 'all' || (wantPixels === 'dated' && exif.time !== undefined) ? modelPixels(full) : undefined;
  full.close();

  return {
    result: {
      id,
      ok: true,
      sha,
      dhash: dHash(gray, small.width, small.height),
      sharpness: sharpness(bigGray, big.width, big.height),
      quality: measureQuality(bigGray, big.width, big.height),
      width,
      height,
      thumb,
      pixels,
      ...exif,
    },
    transfer: pixels ? [pixels.data.buffer] : [],
  };
}

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  try {
    const { result, transfer } = await analyze(e.data);
    self.postMessage(result, { transfer });
  } catch (err) {
    self.postMessage({ id: e.data.id, ok: false, error: String(err) } satisfies AnalyzeResult);
  }
};
