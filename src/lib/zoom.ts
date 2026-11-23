/**
 * Zoom de la visionneuse : molette, clavier, double clic, deux doigts. Code pur, testé sous Node.
 *
 * L'image est posée au centre de l'écran, à sa taille « entière » (échelle 1), puis décalée de (`x`, `y`) et agrandie
 * de `scale` autour de son centre. Les points sont comptés à partir du centre de l'écran.
 */
export interface Zoom {
  scale: number;
  x: number;
  y: number;
}

/** La photo entière. */
export const FIT: Zoom = { scale: 1, x: 0, y: 0 };

export const ZOOM_MAX = 12;
/** Un cran de clavier ou de bouton. */
export const ZOOM_STEP = 1.4;
/** Double clic : gros plan. */
export const ZOOM_CLOSE = 2.5;

interface Size {
  width: number;
  height: number;
}

/** Agrandit de `factor` en gardant immobile le point (`px`, `py`) de l'écran. */
export function zoomAt(z: Zoom, factor: number, px = 0, py = 0): Zoom {
  const scale = Math.min(ZOOM_MAX, Math.max(1, z.scale * factor));
  if (scale === 1) return FIT;
  const k = scale / z.scale;
  return { scale, x: px - (px - z.x) * k, y: py - (py - z.y) * k };
}

/** Molette : un cran (≈ 100) agrandit d'environ 20 % ; pavé tactile : en continu. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-Math.max(-300, Math.min(300, deltaY)) * 0.0018);
}

/** Ne laisse pas la photo sortir de l'écran : ses bords s'arrêtent à ceux de l'écran. `image` : sa taille entière. */
export function clampZoom(z: Zoom, screen: Size, image: Size): Zoom {
  if (z.scale <= 1) return FIT;
  const mx = Math.max(0, (image.width * z.scale - screen.width) / 2);
  const my = Math.max(0, (image.height * z.scale - screen.height) / 2);
  return { scale: z.scale, x: Math.min(mx, Math.max(-mx, z.x)), y: Math.min(my, Math.max(-my, z.y)) };
}

interface Point {
  x: number;
  y: number;
}

/** Deux doigts : `from` et `to`, les deux points avant et après ; écarter agrandit, déplacer les deux décale. */
export function pinch(z: Zoom, from: [Point, Point], to: [Point, Point]): Zoom {
  const dist = ([a, b]: [Point, Point]) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  const mid = ([a, b]: [Point, Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const m0 = mid(from);
  const m1 = mid(to);
  const out = zoomAt(z, dist(to) / dist(from), m0.x, m0.y);
  return out.scale === 1 ? FIT : { ...out, x: out.x + m1.x - m0.x, y: out.y + m1.y - m0.y };
}
