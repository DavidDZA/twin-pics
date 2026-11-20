/**
 * Empreintes d'image calculées sur une petite version de la photo (256 px au plus), sans affichage ni navigateur :
 * le même code tourne dans les workers et dans les tests (Node).
 *
 * - dHash : 64 bits, « chaque case est-elle plus claire que sa voisine de droite ? » sur une grille de 9 × 8 en
 *   niveaux de gris. Insensible au redimensionnement, à la recompression, aux petites retouches de luminosité. Deux
 *   photos quasi identiques diffèrent de quelques bits (distance de Hamming).
 * - Netteté : variance du laplacien rapportée au contraste, sur une version de 1024 px. Une photo floue a peu de
 *   contours, donc une petite variance. Ne se compare qu'entre photos de la même scène.
 */

/** Niveaux de gris (luminance) d'une image RGBA. */
export function grayFromRGBA(data: ArrayLike<number>, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return gray;
}

/** Réduction par moyenne des surfaces (chaque case de destination = moyenne des pixels qu'elle couvre). */
export function resizeGray(gray: Float32Array, width: number, height: number, tw: number, th: number): Float32Array {
  const out = new Float32Array(tw * th);
  const sx = width / tw;
  const sy = height / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = ty * sy;
    const y1 = y0 + sy;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = tx * sx;
      const x1 = x0 + sx;
      let sum = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          sum += gray[y * width + x] * wx * wy;
          area += wx * wy;
        }
      }
      out[ty * tw + tx] = area ? sum / area : 0;
    }
  }
  return out;
}

/** dHash de 64 bits, en 16 caractères hexadécimaux. */
export function dHash(gray: Float32Array, width: number, height: number): string {
  const g = resizeGray(gray, width, height, 9, 8);
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) {
      byte = (byte << 1) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Nombre de bits à 1 d'un entier de 32 bits. */
export function popcount32(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Les 64 bits d'une empreinte en deux entiers de 32 bits (comparaisons rapides). */
export function hashWords(hex: string): [number, number] {
  return [parseInt(hex.slice(0, 8), 16) >>> 0, parseInt(hex.slice(8, 16), 16) >>> 0];
}

/** Distance de Hamming entre deux empreintes (nombre de bits différents, de 0 à 64). */
export function hamming(a: string, b: string): number {
  const [a1, a2] = hashWords(a);
  const [b1, b2] = hashWords(b);
  return popcount32(a1 ^ b1) + popcount32(a2 ^ b2);
}

/**
 * Empreinte d'une image presque uniforme (noire, blanche, ciel sans nuage) : presque tous les bits identiques.
 * Ces images se ressemblent toutes en dHash sans être des doublons ; elles ne sont rapprochées que si elles sont
 * identiques octet par octet.
 */
export function isUniformHash(hex: string): boolean {
  const [w1, w2] = hashWords(hex);
  const ones = popcount32(w1) + popcount32(w2);
  return ones <= 4 || ones >= 60;
}

/** Variance des niveaux de gris (le contraste de l'image). */
export function grayVariance(gray: Float32Array): number {
  let sum = 0;
  let sum2 = 0;
  for (const v of gray) {
    sum += v;
    sum2 += v * v;
  }
  const mean = sum / gray.length;
  return sum2 / gray.length - mean * mean;
}

/**
 * Netteté d'une photo : variance du laplacien rapportée au contraste, calculée sur une version de 1024 px
 * (`SHARPNESS_SIZE`) : à 256 px, un léger flou ne se voit plus. Rapportée au contraste, une photo simplement plus
 * claire ou plus contrastée n'est pas jugée plus nette.
 */
export function sharpness(gray: Float32Array, width: number, height: number): number {
  const contrast = grayVariance(gray);
  return contrast > 1 ? laplacianVariance(gray, width, height) / contrast : 0;
}

/** Grand côté de la version qui sert à mesurer la netteté. */
export const SHARPNESS_SIZE = 1024;

/** Variance du laplacien (4 voisins) sur l'image en niveaux de gris : peu de contours = petite variance. */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Taille de la petite version analysée : 256 px au plus sur le grand côté, proportions gardées. */
export function analysisSize(width: number, height: number, max = 256): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Similarité cosinus de deux vecteurs déjà normalisés (de −1 à 1 ; 1 = même direction). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Vecteur ramené à une longueur de 1. */
export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}
