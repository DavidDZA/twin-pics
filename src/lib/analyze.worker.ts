/**
 * Analyse d'une photo, dans un worker (plusieurs en parallèle : `scan.ts`) : date EXIF, décodage, petite version de
 * 256 px pour le dHash, version de 1024 px pour la netteté, miniature JPEG pour l'affichage, et SHA-256 si demandé
 * (seulement quand un autre fichier a la même taille : deux copies exactes ont forcément la même).
 */
import exifr from 'exifr';
import { analysisSize, dHash, grayFromRGBA, SHARPNESS_SIZE, sharpness } from './imagehash';
import type { AnalyzeRequest, AnalyzeResult } from './messages';

/** Grand côté de la miniature affichée dans les groupes. */
const THUMB_MAX = 200;

async function exifInfo(file: File): Promise<{ time?: number; camera?: string }> {
  try {
    const tags = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model'] });
    if (!tags) return {};
    const date: unknown = tags.DateTimeOriginal ?? tags.CreateDate;
    const time = date instanceof Date && !isNaN(date.getTime()) ? date.getTime() : undefined;
    const camera = [tags.Make, tags.Model].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim() || undefined;
    return { time, camera };
  } catch {
    return {};
  }
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
  const { id, file, needSha } = req;
  const [exif, sha] = await Promise.all([exifInfo(file), needSha ? sha256(file) : Promise.resolve(undefined)]);
  let full: ImageBitmap;
  try {
    // Orientation EXIF appliquée : une photo prise en portrait est analysée debout.
    full = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { id, ok: false, error: 'decode', sha, ...exif };
  }
  const width = full.width;
  const height = full.height;
  const small = analysisSize(width, height);
  const bitmap = await createImageBitmap(full, { resizeWidth: small.width, resizeHeight: small.height, resizeQuality: 'high' });

  // Netteté sur une version plus grande : à 256 px, un léger flou ne se voit plus.
  const big = analysisSize(width, height, SHARPNESS_SIZE);
  const bigCanvas = new OffscreenCanvas(big.width, big.height);
  const bigCtx = bigCanvas.getContext('2d', { willReadFrequently: true })!;
  bigCtx.drawImage(full, 0, 0, big.width, big.height);
  full.close();
  const bigGray = grayFromRGBA(bigCtx.getImageData(0, 0, big.width, big.height).data, big.width, big.height);

  const canvas = new OffscreenCanvas(small.width, small.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, small.width, small.height).data;
  const gray = grayFromRGBA(pixels, small.width, small.height);

  const t = analysisSize(width, height, THUMB_MAX);
  const thumbCanvas = new OffscreenCanvas(t.width, t.height);
  thumbCanvas.getContext('2d')!.drawImage(bitmap, 0, 0, t.width, t.height);
  bitmap.close();
  const thumb = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });

  return {
    id,
    ok: true,
    sha,
    dhash: dHash(gray, small.width, small.height),
    sharpness: sharpness(bigGray, big.width, big.height),
    width,
    height,
    thumb,
    ...exif,
  };
}

self.onmessage = async (e: MessageEvent<AnalyzeRequest>) => {
  let result: AnalyzeResult;
  try {
    result = await analyze(e.data);
  } catch (err) {
    result = { id: e.data.id, ok: false, error: String(err) };
  }
  self.postMessage(result);
};
