/**
 * Qualité d'une photo, pour repérer les photos « inutiles » (`junk.ts`) : code pur, testé sous Node.
 *
 * Mesuré sur la version de 1024 px (celle de la netteté) en niveaux de gris :
 * - `sharp` : netteté de la **zone la plus nette** (variance du laplacien, grille de 4 × 4). Une photo au sujet net et
 *   au fond flou (portrait) reste nette ; une photo floue partout ne l'est nulle part. Valeur absolue (pas rapportée
 *   au contraste, contrairement à `sharpness` qui compare les photos d'un même groupe) ;
 * - `lum` : luminosité moyenne (0 à 255) ; `dark` / `bright` : part des pixels presque noirs / presque blancs ;
 * - `contrast` : écart type des niveaux de gris (une photo presque uniforme, prise dans la poche, en a très peu).
 */
import { laplacianVariance } from './imagehash';

export interface Quality {
  sharp: number;
  lum: number;
  dark: number;
  bright: number;
  contrast: number;
}

/** Version des mesures : une photo mesurée avec une autre version est réanalysée. */
export const QUALITY_VERSION = 1;

const TILES = 4;

export function measureQuality(gray: Float32Array, width: number, height: number): Quality {
  let sum = 0;
  let sum2 = 0;
  let dark = 0;
  let bright = 0;
  for (const v of gray) {
    sum += v;
    sum2 += v * v;
    if (v < 24) dark++;
    else if (v > 240) bright++;
  }
  const n = gray.length || 1;
  const lum = sum / n;
  const contrast = Math.sqrt(Math.max(0, sum2 / n - lum * lum));

  let sharp = 0;
  const tw = Math.floor(width / TILES);
  const th = Math.floor(height / TILES);
  if (tw >= 3 && th >= 3) {
    const tile = new Float32Array(tw * th);
    for (let ty = 0; ty < TILES; ty++) {
      for (let tx = 0; tx < TILES; tx++) {
        for (let y = 0; y < th; y++) {
          const row = (ty * th + y) * width + tx * tw;
          tile.set(gray.subarray(row, row + tw), y * tw);
        }
        sharp = Math.max(sharp, laplacianVariance(tile, tw, th));
      }
    }
  }
  return { sharp, lum, dark: dark / n, bright: bright / n, contrast };
}
