/** Images d'essai générées (formes au hasard, reproductibles) et leur analyse avec le code de l'appli, sous Node. */
import sharp from 'sharp';
import { analysisSize, dHash, grayFromRGBA, SHARPNESS_SIZE, sharpness } from '../src/lib/imagehash';

/** Générateur pseudo-aléatoire reproductible. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Une « photo » : un dégradé et des formes de couleur, différente pour chaque graine. */
export function photoSvg(seed: number, width = 1200, height = 900): Buffer {
  const r = rng(seed * 7919);
  const color = () => `hsl(${Math.round(r() * 360)},${50 + Math.round(r() * 40)}%,${30 + Math.round(r() * 40)}%)`;
  let shapes = '';
  for (let i = 0; i < 14; i++) {
    const x = Math.round(r() * width);
    const y = Math.round(r() * height);
    const s = Math.round(60 + r() * 260);
    shapes +=
      r() < 0.5
        ? `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${color()}"/>`
        : `<rect x="${x - s / 2}" y="${y - s / 3}" width="${s}" height="${(s * 2) / 3}" fill="${color()}" transform="rotate(${Math.round(r() * 90)} ${x} ${y})"/>`;
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="${color()}"/><stop offset="1" stop-color="${color()}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${shapes}</svg>`,
  );
}

export async function photoJpeg(seed: number, width = 1200, height = 900): Promise<Buffer> {
  return sharp(photoSvg(seed, width, height)).jpeg({ quality: 90 }).toBuffer();
}

async function grayAt(buf: Buffer, size: { width: number; height: number }) {
  const raw = await sharp(buf).resize(size.width, size.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  return grayFromRGBA(raw, size.width, size.height);
}

/** dHash (version de 256 px), netteté (version de 1024 px) et taille d'une image, comme le worker d'analyse. */
export async function analyzeBuffer(buf: Buffer) {
  const meta = await sharp(buf).metadata();
  const small = analysisSize(meta.width!, meta.height!);
  const big = analysisSize(meta.width!, meta.height!, SHARPNESS_SIZE);
  return {
    dhash: dHash(await grayAt(buf, small), small.width, small.height),
    sharpness: sharpness(await grayAt(buf, big), big.width, big.height),
    width: meta.width!,
    height: meta.height!,
  };
}
