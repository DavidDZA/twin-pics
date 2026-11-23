import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { photoJpeg, photoSvg, qualityOf } from './images';
import { buildJunkGroups, clipScores, junkReasons, JUNK_DEFAULTS, type JunkParams, type JunkPrompts, type JunkReason } from '../src/lib/junk';
import { initialChoice, pendingRemoval } from '../src/lib/choices';
import type { PhotoInfo } from '../src/lib/groups';
import type { Quality } from '../src/lib/quality';
import prompts from '../src/lib/junkPrompts.json';

const P = JUNK_DEFAULTS;
const good: Quality = { sharp: 4000, lum: 120, dark: 0.05, bright: 0.02, contrast: 60 };

describe('mesures de qualité', () => {
  it('une photo nette, une photo floue partout, une photo au sujet net et au fond flou', async () => {
    const sharpPhoto = await qualityOf(await photoJpeg(31, 1600, 1200));
    const blurred = await qualityOf(await sharp(await photoJpeg(31, 1600, 1200)).blur(12).jpeg().toBuffer());
    expect(sharpPhoto.sharp).toBeGreaterThan(P.blurMax * 3);
    expect(blurred.sharp).toBeLessThan(P.blurMax);
    // Fond flou, sujet net dans un coin : la zone la plus nette compte.
    const background = await sharp(await photoJpeg(32, 1600, 1200)).blur(12).toBuffer();
    const subject = await sharp(await photoJpeg(33, 400, 300)).toBuffer();
    const portrait = await qualityOf(await sharp(background).composite([{ input: subject, left: 0, top: 0 }]).jpeg().toBuffer());
    expect(portrait.sharp).toBeGreaterThan(P.blurMax * 3);
  });

  it('sombre, brûlée, presque vide', async () => {
    const dark = await qualityOf(await sharp(await photoJpeg(34)).modulate({ brightness: 0.08 }).jpeg().toBuffer());
    expect(dark.lum).toBeLessThan(35);
    expect(dark.dark).toBeGreaterThan(0.55);
    const bright = await qualityOf(await sharp(await photoJpeg(35)).linear(0.15, 230).jpeg().toBuffer());
    expect(bright.lum).toBeGreaterThan(228);
    const empty = await qualityOf(await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#202020' } }).jpeg().toBuffer());
    expect(empty.contrast).toBeLessThan(10);
    const normal = await qualityOf(await sharp(photoSvg(36)).jpeg().toBuffer());
    expect(junkReasons({ path: 'a.jpg', quality: normal }, P)).toEqual([]);
  });
});

describe('raisons', () => {
  const q = (o: Partial<Quality>) => ({ ...good, ...o });

  it('règles sans modèle : floue, sombre, claire, presque vide', () => {
    expect(junkReasons({ path: 'a.jpg', quality: q({ sharp: 10 }) }, P)).toEqual(['blurry']);
    expect(junkReasons({ path: 'a.jpg', quality: q({ lum: 20, dark: 0.8 }) }, P)).toEqual(['dark']);
    expect(junkReasons({ path: 'a.jpg', quality: q({ lum: 240, bright: 0.8 }) }, P)).toEqual(['bright']);
    // Presque vide : rien d'autre (une photo noire est aussi « floue » et « sombre », inutile de le dire).
    expect(junkReasons({ path: 'a.jpg', quality: q({ contrast: 2, sharp: 1, lum: 3, dark: 1 }) }, P)).toEqual(['empty']);
  });

  it('captures d’écran : par le nom, ou PNG sans appareil aux proportions d’un écran', () => {
    expect(junkReasons({ path: 'Pictures/Screenshot_20240714-101112.jpg', quality: good }, P)).toEqual(['screenshot']);
    expect(junkReasons({ path: 'Bureau/Capture d’écran 2024-07-14.png', quality: good }, P)).toEqual(['screenshot']);
    expect(junkReasons({ path: 'x/img.png', width: 1080, height: 2400, quality: good }, P)).toEqual(['screenshot']);
    expect(junkReasons({ path: 'x/img.png', width: 1080, height: 2400, camera: 'Samsung', quality: good }, P)).toEqual([]);
    expect(junkReasons({ path: 'x/img.png', width: 1200, height: 900, quality: good }, P)).toEqual([]);
    // Une capture est souvent claire : pas « trop claire ».
    expect(junkReasons({ path: 'Screenshot_1.png', quality: q({ lum: 245, bright: 0.9 }) }, P)).toEqual(['screenshot']);
  });

  it('modèle : au-dessus de la certitude minimale ; « prise par erreur » seulement si la photo est aussi ratée', () => {
    const scores = { photo: 0.1, document: 0.8, receipt: 0.05, screenshot: 0.02, meme: 0.02, accident: 0.01 };
    expect(junkReasons({ path: 'a.jpg', quality: good, scores }, P)).toEqual(['document']);
    expect(junkReasons({ path: 'a.jpg', quality: good, scores }, { ...P, clipMin: 0.9 })).toEqual([]);
    const accident = { ...scores, document: 0, accident: 0.9 };
    expect(junkReasons({ path: 'a.jpg', quality: good, scores: accident }, P)).toEqual([]);
    expect(junkReasons({ path: 'a.jpg', quality: q({ sharp: 120 }), scores: accident }, P)).toEqual(['accident']);
  });

  it('les raisons décochées ne sont plus proposées', () => {
    expect(junkReasons({ path: 'Screenshot_1.png', quality: q({ sharp: 10 }) }, { ...P, off: ['screenshot'] })).toEqual([]);
    expect(junkReasons({ path: 'a.jpg', quality: q({ sharp: 10 }) }, { ...P, off: ['dark'] })).toEqual(['blurry']);
  });
});

describe('scores du modèle', () => {
  const ps = prompts as JunkPrompts;

  it('les phrases livrées : vecteurs normalisés, toutes les catégories présentes', () => {
    expect(ps.model).toBe('Xenova/mobileclip_s1');
    expect(ps.vectors).toHaveLength(ps.texts.length);
    for (const v of ps.vectors) expect(Math.hypot(...v)).toBeCloseTo(1, 3);
    expect(new Set(ps.categories)).toEqual(new Set(['photo', 'document', 'receipt', 'screenshot', 'meme', 'accident']));
  });

  it('une image proche d’une phrase « ticket » est un ticket ; les probabilités font 1', () => {
    const i = ps.texts.indexOf('a photo of a receipt');
    const s = clipScores(ps.vectors[i], ps);
    expect(s.receipt).toBeGreaterThan(0.5);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

/** Photos d'essai : `clip` = direction (degrés) d'un vecteur unitaire, pour régler les ressemblances. */
function photo(n: number, o: Partial<PhotoInfo> & { deg?: number } = {}): PhotoInfo {
  const { deg, ...rest } = o;
  const r = ((deg ?? n * 40) * Math.PI) / 180;
  return { key: `k${n}`, path: `D/p${n}.jpg`, name: `p${n}.jpg`, size: 1000 * (n + 1), lastModified: n, clip: new Float32Array([Math.cos(r), Math.sin(r), 0, 0]), ...rest };
}

describe('groupes de photos inutiles', () => {
  const params: JunkParams = { ...P, groupMin: 0.9 };

  it('les photos inutiles qui se ressemblent sont regroupées, sans limite de temps, les plus gros groupes d’abord', () => {
    const YEAR = 365 * 24 * 3600_000;
    const photos = [
      photo(0, { deg: 0, time: 0 }),
      photo(1, { deg: 5, time: 3 * YEAR }),
      photo(2, { deg: 10, time: 6 * YEAR }),
      photo(3, { deg: 90 }),
      photo(4, { deg: 2 }),
    ];
    const reasons: JunkReason[][] = [['screenshot'], ['screenshot'], ['screenshot'], ['screenshot'], []];
    const groups = buildJunkGroups(photos, reasons, params, new Set());
    expect(groups.map((g) => g.members)).toEqual([[0, 1, 2], [3]]);
    expect(groups[0].kind).toBe('junk');
    expect(groups[0].id.startsWith('j')).toBe(true);
    expect(groups[0].best).toBe(-1);
    expect(groups[0].junk!.main).toBe('screenshot');
    expect(groups[0].wasted).toBe(1000 + 2000 + 3000);
  });

  it('pas de groupe entre deux raisons différentes ; les photos à laisser de côté (supprimées, « Pas inutiles ») n’y sont pas', () => {
    const photos = [photo(0, { deg: 0 }), photo(1, { deg: 1 }), photo(2, { deg: 2 })];
    const reasons: JunkReason[][] = [['document'], ['blurry'], ['document']];
    const groups = buildJunkGroups(photos, reasons, params, new Set([2]));
    expect(groups.map((g) => g.members).sort()).toEqual([[0], [1]]);
  });

  it('garde-fou contre les chaînes ; sans le modèle, regroupées par dHash si quasi identiques', () => {
    const photos = [photo(0, { deg: 0 }), photo(1, { deg: 20 }), photo(2, { deg: 40 })];
    const reasons: JunkReason[][] = [['blurry'], ['blurry'], ['blurry']];
    // 20° d'écart : cos ≈ 0,94 ; 40° : 0,77 — A-B et B-C passent, A-C non : pas un seul groupe de trois.
    const chained = buildJunkGroups(photos, reasons, params, new Set());
    expect(chained.find((g) => g.members.length === 3)).toBeUndefined();

    const noModel = [0, 1, 2].map((n) => ({ ...photo(n), clip: undefined, dhash: n < 2 ? '5a3c96e1f00f33cc' : 'a5c3691e0ff0cc33' }));
    expect(buildJunkGroups(noModel, reasons, params, new Set()).map((g) => g.members.length)).toEqual([2, 1]);
  });

  it('chaque photo se décide seule (swipe) : une photo jetée compte même si le reste du groupe n’est pas trié', () => {
    const photos = [photo(0, { deg: 0 }), photo(1, { deg: 3 }), photo(2, { deg: 5 })];
    const [g] = buildJunkGroups(photos, [['receipt'], ['receipt'], ['receipt']], params, new Set());
    expect(g.members).toHaveLength(3);
    const pending = pendingRemoval([g], photos, new Map([['k0', 'remove'], ['k1', 'keep']]));
    expect(pending.remove).toEqual([0]);
    expect(pending.keep).toBe(1);
    expect(pending.sorted).toBe(0);
  });

  it('tri par défaut : tout le groupe à jeter, sans avertissement (c’est le but)', () => {
    const photos = [photo(0, { deg: 0 }), photo(1, { deg: 3 })];
    const [g] = buildJunkGroups(photos, [['receipt'], ['receipt']], params, new Set());
    const choice = initialChoice(g, photos, new Map());
    expect(Object.values(choice)).toEqual(['remove', 'remove']);
    const pending = pendingRemoval([g], photos, new Map(Object.entries(choice)));
    expect(pending.remove).toHaveLength(2);
    expect(pending.noneKept).toBe(0);
  });
});
