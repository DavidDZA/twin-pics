import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { analysisSize, cosine, dHash, grayVariance, hamming, hashWords, isUniformHash, normalize, popcount32, sharpness } from '../src/lib/imagehash';
import { analyzeBuffer, photoJpeg } from './images';

describe('outils', () => {
  it('compte les bits', () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0b1011)).toBe(3);
  });

  it('distance de Hamming entre deux empreintes', () => {
    expect(hamming('0000000000000000', '0000000000000000')).toBe(0);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('8000000000000001', '0000000000000000')).toBe(2);
    expect(hashWords('ffffffff00000001')).toEqual([0xffffffff, 1]);
  });

  it('repère les empreintes d’images uniformes', () => {
    expect(isUniformHash('0000000000000000')).toBe(true);
    expect(isUniformHash('ffffffffffffffff')).toBe(true);
    expect(isUniformHash('5a3c96e1f00f33cc')).toBe(false);
  });

  it('petite version : 256 px au plus, proportions gardées', () => {
    expect(analysisSize(4000, 3000)).toEqual({ width: 256, height: 192 });
    expect(analysisSize(3000, 4000)).toEqual({ width: 192, height: 256 });
    expect(analysisSize(100, 50)).toEqual({ width: 100, height: 50 });
  });

  it('cosinus de vecteurs normalisés', () => {
    const a = normalize(new Float32Array([3, 4]));
    expect(a[0]).toBeCloseTo(0.6);
    expect(cosine(a, a)).toBeCloseTo(1);
    expect(cosine(a, normalize(new Float32Array([-4, 3])))).toBeCloseTo(0);
  });

  it('contraste et netteté d’une image uniforme : nuls', () => {
    const flat = new Float32Array(32 * 32).fill(90);
    expect(grayVariance(flat)).toBe(0);
    expect(sharpness(flat, 32, 32)).toBe(0);
  });

  it('dHash d’une image uniforme : que des zéros', () => {
    expect(dHash(new Float32Array(64 * 64).fill(128), 64, 64)).toBe('0000000000000000');
  });
});

describe('dHash sur des images', () => {
  it('même photo redimensionnée et recompressée : quasi identique', async () => {
    const original = await photoJpeg(1);
    const small = await sharp(original).resize(640).jpeg({ quality: 55 }).toBuffer();
    const a = await analyzeBuffer(original);
    const b = await analyzeBuffer(small);
    expect(hamming(a.dhash, b.dhash)).toBeLessThanOrEqual(4);
    expect(b.width).toBe(640);
  });

  it('même photo un peu éclaircie : quasi identique', async () => {
    const original = await photoJpeg(2);
    const brighter = await sharp(original).modulate({ brightness: 1.12 }).jpeg({ quality: 80 }).toBuffer();
    expect(hamming((await analyzeBuffer(original)).dhash, (await analyzeBuffer(brighter)).dhash)).toBeLessThanOrEqual(6);
  });

  it('photos différentes : très éloignées', async () => {
    for (const [x, y] of [
      [3, 4],
      [5, 6],
      [7, 8],
    ]) {
      const a = await analyzeBuffer(await photoJpeg(x));
      const b = await analyzeBuffer(await photoJpeg(y));
      expect(hamming(a.dhash, b.dhash)).toBeGreaterThan(16);
    }
  });

  it('netteté : une photo un peu floue mais plus claire reste jugée moins nette', async () => {
    const original = await photoJpeg(10, 1600, 1200);
    const soft = await sharp(original).blur(2).modulate({ brightness: 1.15 }).linear(1.2, -10).jpeg({ quality: 90 }).toBuffer();
    const a = await analyzeBuffer(original);
    const b = await analyzeBuffer(soft);
    expect(b.sharpness).toBeLessThan(a.sharpness * 0.8);
  });

  it('netteté : une photo floue a une variance du laplacien plus faible', async () => {
    const original = await photoJpeg(9);
    const blurred = await sharp(original).blur(6).jpeg().toBuffer();
    const a = await analyzeBuffer(original);
    const b = await analyzeBuffer(blurred);
    expect(b.sharpness).toBeLessThan(a.sharpness / 2);
  });
});
