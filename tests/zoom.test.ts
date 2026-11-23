import { describe, expect, it } from 'vitest';
import { clampZoom, FIT, pinch, wheelFactor, ZOOM_MAX, zoomAt } from '../src/lib/zoom';

/** Où tombe à l'écran un point de la photo (compté à partir de son centre, à la taille entière). */
const onScreen = (z: typeof FIT, x: number, y: number) => ({ x: z.x + x * z.scale, y: z.y + y * z.scale });

describe('zoom', () => {
  it('le point sous la souris ne bouge pas', () => {
    let z = zoomAt(FIT, 2, 100, -50);
    expect(onScreen(z, 100, -50)).toEqual({ x: 100, y: -50 });
    z = zoomAt(z, 1.5, 40, 30);
    // Le point de la photo qui était sous (40, 30) y est toujours.
    const before = zoomAt(FIT, 2, 100, -50);
    const px = (40 - before.x) / before.scale;
    const py = (30 - before.y) / before.scale;
    expect(onScreen(z, px, py).x).toBeCloseTo(40);
    expect(onScreen(z, px, py).y).toBeCloseTo(30);
  });

  it('entre la photo entière et le maximum', () => {
    expect(zoomAt(FIT, 0.5, 10, 10)).toEqual(FIT);
    expect(zoomAt(zoomAt(FIT, 3), 1 / 9)).toEqual(FIT);
    expect(zoomAt(FIT, 1000).scale).toBe(ZOOM_MAX);
  });

  it('molette : vers le haut agrandit, vers le bas réduit, aller-retour neutre', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1.1);
    expect(wheelFactor(100)).toBeLessThan(0.9);
    expect(wheelFactor(100) * wheelFactor(-100)).toBeCloseTo(1);
    // Un geste brusque ne saute pas d'un coup au maximum.
    expect(wheelFactor(-5000)).toBeLessThan(2);
  });

  it('la photo ne sort pas de l’écran', () => {
    const screen = { width: 1000, height: 600 };
    const image = { width: 800, height: 600 };
    expect(clampZoom({ scale: 2, x: 5000, y: -5000 }, screen, image)).toEqual({ scale: 2, x: 300, y: -300 });
    expect(clampZoom({ scale: 2, x: 100, y: 50 }, screen, image)).toEqual({ scale: 2, x: 100, y: 50 });
    // Plus étroite que l'écran une fois agrandie : elle reste centrée.
    expect(clampZoom({ scale: 1.1, x: 80, y: 0 }, screen, image).x).toBeCloseTo(0);
    expect(clampZoom({ scale: 1, x: 80, y: 10 }, screen, image)).toEqual(FIT);
  });

  it('deux doigts : écarter agrandit, déplacer décale', () => {
    const a = { x: -50, y: 0 };
    const b = { x: 50, y: 0 };
    const z = pinch(FIT, [a, b], [{ x: -100, y: 0 }, { x: 100, y: 0 }]);
    expect(z).toEqual({ scale: 2, x: 0, y: 0 });
    expect(pinch(z, [a, b], [{ x: -30, y: 10 }, { x: 70, y: 10 }])).toEqual({ scale: 2, x: 20, y: 10 });
    expect(pinch(z, [a, b], [{ x: -10, y: 0 }, { x: 10, y: 0 }])).toEqual(FIT);
  });
});
