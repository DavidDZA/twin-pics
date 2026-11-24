import { describe, expect, it } from 'vitest';
import { buildGroups, DEFAULTS, findPairs, groupId, LIMITS, type PhotoInfo } from '../src/lib/groups';
import { needsVector } from '../src/lib/scan';
import type { PhotoRow } from '../src/lib/db';

const MIN = 60_000;
let n = 0;
function photo(p: Partial<PhotoInfo> & { path: string }): PhotoInfo {
  n++;
  return { key: `${p.path}#${n}`, name: p.path.split('/').pop()!, size: 1_000_000, lastModified: 1_700_000_000_000 + n, ...p };
}

/** Vecteur unitaire dans le plan, à `deg` degrés (cosinus entre deux vecteurs = cosinus de l'écart d'angle). */
function vec(deg: number): Float32Array {
  const r = (deg * Math.PI) / 180;
  return new Float32Array([Math.cos(r), Math.sin(r), 0, 0]);
}

const HASH = '5a3c96e1f00f33cc';
/** Empreinte avec `bits` bits changés. */
function flip(hex: string, bits: number): string {
  let v = BigInt('0x' + hex);
  for (let i = 0; i < bits; i++) v ^= 1n << BigInt((i * 5) % 64 + Math.floor((i * 5) / 64));
  return v.toString(16).padStart(16, '0');
}

const group = (photos: PhotoInfo[], params = DEFAULTS) => buildGroups(photos, findPairs(photos), params);

describe('copies exactes', () => {
  it('regroupe les fichiers identiques et propose l’original plutôt que la copie WhatsApp', () => {
    const photos = [
      photo({ path: 'Photos/WhatsApp Images/IMG-2024.jpg', sha: 'aaa', dhash: HASH, size: 2_000_000, lastModified: 5 }),
      photo({ path: 'Photos/2024/vacances.jpg', sha: 'aaa', dhash: HASH, size: 2_000_000, lastModified: 9 }),
      photo({ path: 'Photos/autre.jpg', sha: 'bbb', dhash: flip(HASH, 40) }),
    ];
    const groups = group(photos);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('exact');
    expect(photos[groups[0].best].path).toBe('Photos/2024/vacances.jpg');
    expect(groups[0].reason).toBe('original');
    expect(groups[0].wasted).toBe(2_000_000);
  });

  it('« (1) » trahit la copie', () => {
    const photos = [photo({ path: 'A/photo (1).jpg', sha: 'x', lastModified: 1 }), photo({ path: 'A/photo.jpg', sha: 'x', lastModified: 2 })];
    expect(photos[group(photos)[0].best].path).toBe('A/photo.jpg');
  });
});

describe('plusieurs dossiers', () => {
  it('copies exactes : celle du dossier le plus haut, même plus récente ou dans WhatsApp', () => {
    const photos = [
      photo({ path: 'E:/Clé/plage.jpg', sha: 'x', lastModified: 1, rank: 1 }),
      photo({ path: 'F:/Photos/WhatsApp/plage (1).jpg', sha: 'x', lastModified: 9, rank: 0 }),
      photo({ path: 'G:/Disque/plage.jpg', sha: 'x', lastModified: 2, rank: 2 }),
    ];
    const [g] = group(photos);
    expect(photos[g.best].path).toBe('F:/Photos/WhatsApp/plage (1).jpg');
    expect(g.reason).toBe('folder');
  });

  it('dans un même dossier, l’originale comme avant', () => {
    const photos = [photo({ path: 'F:/A/photo (1).jpg', sha: 'x', lastModified: 1, rank: 1 }), photo({ path: 'F:/A/photo.jpg', sha: 'x', lastModified: 2, rank: 1 })];
    const [g] = group(photos);
    expect(photos[g.best].path).toBe('F:/A/photo.jpg');
    expect(g.reason).toBe('original');
  });

  it('quasi identiques : la plus grande gagne, où qu’elle soit ; à égalité, le dossier le plus haut', () => {
    const big = [photo({ path: 'F:/a.jpg', dhash: HASH, width: 800, height: 600, rank: 0 }), photo({ path: 'E:/a.jpg', dhash: HASH, width: 4000, height: 3000, rank: 1 })];
    expect(big[group(big)[0].best].path).toBe('E:/a.jpg');
    expect(group(big)[0].reason).toBe('resolution');
    const same = [photo({ path: 'E:/b.jpg', dhash: HASH, width: 800, height: 600, lastModified: 1, rank: 1 }), photo({ path: 'F:/b.jpg', dhash: HASH, width: 800, height: 600, lastModified: 5, rank: 0 })];
    expect(same[group(same)[0].best].path).toBe('F:/b.jpg');
    expect(group(same)[0].reason).toBe('folder');
  });
});

describe('quasi identiques', () => {
  it('regroupées selon l’écart choisi, la plus grande proposée', () => {
    const photos = [
      photo({ path: 'A/petite.jpg', dhash: flip(HASH, 5), width: 800, height: 600 }),
      photo({ path: 'A/grande.jpg', dhash: HASH, width: 4000, height: 3000 }),
    ];
    const groups = group(photos, { ...DEFAULTS, nearMax: 8 });
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('near');
    expect(photos[groups[0].best].path).toBe('A/grande.jpg');
    expect(groups[0].reason).toBe('resolution');
    expect(group(photos, { ...DEFAULTS, nearMax: 4 })).toHaveLength(0);
  });

  it('cherchées partout, quelle que soit la date', () => {
    const photos = [photo({ path: 'A/a.jpg', dhash: HASH, time: 0 }), photo({ path: 'B/b.jpg', dhash: flip(HASH, 2), time: 1000 * 24 * 60 * MIN })];
    expect(group(photos)).toHaveLength(1);
  });

  it('images uniformes (noires…) jamais rapprochées par leur empreinte, ni par le modèle', () => {
    const photos = [photo({ path: 'a.jpg', dhash: '0000000000000000' }), photo({ path: 'b.jpg', dhash: '0000000000000001' })];
    expect(findPairs(photos)).toHaveLength(0);
    // Deux photos noires prises à 30 s d'écart, vecteurs identiques : pas « similaires » (elles vont dans les inutiles).
    const black = [photo({ path: 'n1.jpg', dhash: '0000000000000000', time: 0, emb: vec(0) }), photo({ path: 'n2.jpg', dhash: '0000000000000000', time: 30_000, emb: vec(0) })];
    expect(findPairs(black)).toHaveLength(0);
  });

  it('photo noire au bruit trompeur (empreinte proche d’un ciel bleu) : écartée par son contraste', () => {
    const quality = (contrast: number) => ({ sharp: 500, lum: contrast < 10 ? 1 : 90, dark: 0, bright: 0, contrast });
    const sky = photo({ path: 'Croatie/mer.jpg', dhash: HASH, quality: quality(49), time: 0, emb: vec(0) });
    const black = [1, 2, 3].map((k) => photo({ path: `Cuba/noire-${k}.jpg`, dhash: flip(HASH, 5 + k), quality: quality(1), time: k * 1000, emb: vec(1) }));
    const photos = [sky, ...black];
    expect(findPairs(photos)).toHaveLength(0);
    // Le même fichier deux fois reste une copie exacte.
    const twice = [{ ...black[0], sha: 'n' }, photo({ path: 'Cuba/noire - Copie.jpg', dhash: HASH, quality: quality(1), sha: 'n' })];
    expect(group(twice).map((g) => g.kind)).toEqual(['exact']);
    // Un vrai ciel, lui, garde ses doublons.
    expect(group([sky, photo({ path: 'b.jpg', dhash: flip(HASH, 3), quality: quality(48) })])).toHaveLength(1);
  });

  it('copies exactes et quasi identiques ensemble : groupe « quasi identiques »', () => {
    const photos = [photo({ path: 'a.jpg', sha: 's', dhash: HASH }), photo({ path: 'b.jpg', sha: 's', dhash: HASH }), photo({ path: 'c.jpg', dhash: flip(HASH, 3) })];
    const groups = group(photos);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('near');
    expect(groups[0].members).toHaveLength(3);
  });
});

describe('rafales parmi les quasi identiques', () => {
  const size = { width: 4000, height: 3000 };
  const shot = (path: string, seconds: number, sharpness: number, bits = 0) => photo({ path, dhash: flip(HASH, bits), time: seconds * 1000, sharpness, ...size });

  it('deux prises de vue à quelques secondes : « similaires », la plus nette proposée, même plus légère', () => {
    const photos = [{ ...shot('a.jpg', 0, 0.2), size: 5_000_000 }, { ...shot('b.jpg', 1, 0.6, 3), size: 3_000_000 }];
    const [g] = group(photos);
    expect(g.kind).toBe('similar');
    expect(photos[g.best].path).toBe('b.jpg');
    expect(g.reason).toBe('sharpness');
  });

  it('sans le modèle aussi (photos similaires non demandées)', () => {
    const photos = [shot('a.jpg', 0, 0.2), shot('b.jpg', 4, 0.6, 2)];
    expect(photos.every((p) => !p.emb)).toBe(true);
    expect(group(photos)[0].kind).toBe('similar');
  });

  it('même date (copie retouchée), ou une photo sans date (WhatsApp) : toujours « quasi identiques », la plus grosse proposée', () => {
    const edited = [{ ...shot('a.jpg', 0, 0.2), size: 5_000_000 }, { ...shot('a-retouche.jpg', 0, 0.9, 2), size: 3_000_000 }];
    expect(group(edited)[0].kind).toBe('near');
    expect(edited[group(edited)[0].best].path).toBe('a.jpg');
    const sent = [{ ...shot('b.jpg', 0, 0.2), size: 5_000_000 }, { ...shot('b-wa.jpg', 0, 0.9, 2), time: undefined }];
    expect(group(sent)[0].kind).toBe('near');
    expect(sent[group(sent)[0].best].path).toBe('b.jpg');
  });

  it('copie réduite dont la date a changé : toujours « quasi identiques », la plus grande proposée', () => {
    const photos = [shot('a.jpg', 0, 0.2), { ...shot('petite.jpg', 5, 0.9, 2), width: 1600, height: 1200 }];
    const [g] = group(photos);
    expect(g.kind).toBe('near');
    expect(photos[g.best].path).toBe('a.jpg');
  });

  it('dates plus éloignées que l’écart réglé : « quasi identiques »', () => {
    const photos = [shot('a.jpg', 0, 0.2), shot('b.jpg', 15 * 60, 0.9, 2)];
    expect(group(photos, { ...DEFAULTS, windowMin: 10 })[0].kind).toBe('near');
    expect(group(photos, { ...DEFAULTS, windowMin: 20 })[0].kind).toBe('similar');
  });

  it('une rafale et des copies réduites : la plus nette des prises de vue, jamais une copie', () => {
    const photos = [
      shot('1.jpg', 0, 0.2),
      shot('2.jpg', 2, 0.5, 2),
      { ...shot('2-petite.jpg', 2, 0.9, 2), width: 1600, height: 1200 },
      { ...shot('2-wa.jpg', 2, 0.95, 3), time: undefined },
    ];
    const [g] = group(photos);
    expect(g.kind).toBe('similar');
    expect(g.members).toHaveLength(4);
    expect(photos[g.best].path).toBe('2.jpg');
  });

  it('dates lues dans les noms : rafale aussi', () => {
    const photos = [{ ...shot('a.jpg', 0, 0.2), named: true }, { ...shot('b.jpg', 1, 0.6, 2), named: true }];
    const [g] = group(photos);
    expect(g.kind).toBe('similar');
    expect(photos[g.best].path).toBe('b.jpg');
  });

  it('une photo et sa copie sans EXIF (date du nom, à 2 s près) : toujours « quasi identiques »', () => {
    const photos = [{ ...shot('a.jpg', 0, 0.2), size: 5_000_000 }, { ...shot('copie.jpg', 2, 0.9, 2), named: true }];
    const [g] = group(photos);
    expect(g.kind).toBe('near');
    expect(photos[g.best].path).toBe('a.jpg');
  });

  it('une rafale et les copies sans EXIF de ses photos : jamais une copie proposée', () => {
    const photos = [shot('1.jpg', 0, 0.2), shot('2.jpg', 4, 0.5, 2), { ...shot('c1.jpg', 2, 0.8, 1), named: true }, { ...shot('c2.jpg', 6, 0.9, 3), named: true }];
    const [g] = group(photos);
    expect(g.kind).toBe('similar');
    expect(photos[g.best].path).toBe('2.jpg');
  });

  it('définition ou dates inconnues : « quasi identiques »', () => {
    expect(group([photo({ path: 'a.jpg', dhash: HASH, time: 0 }), photo({ path: 'b.jpg', dhash: flip(HASH, 2), time: 3000 })])[0].kind).toBe('near');
    expect(group([photo({ path: 'a.jpg', dhash: HASH, ...size }), photo({ path: 'b.jpg', dhash: flip(HASH, 2), ...size })])[0].kind).toBe('near');
  });
});

describe('similaires', () => {
  it('même scène à quelques secondes : regroupées, la plus nette proposée', () => {
    const photos = [
      photo({ path: 'r/1.jpg', dhash: HASH, time: 0, emb: vec(0), sharpness: 50 }),
      photo({ path: 'r/2.jpg', dhash: flip(HASH, 30), time: 2000, emb: vec(10), sharpness: 300 }),
    ];
    const groups = group(photos);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe('similar');
    expect(photos[groups[0].best].path).toBe('r/2.jpg');
    expect(groups[0].reason).toBe('sharpness');
  });

  it('seulement dans l’écart de temps choisi', () => {
    const photos = [photo({ path: 'a.jpg', time: 0, emb: vec(0) }), photo({ path: 'b.jpg', time: 20 * MIN, emb: vec(5) })];
    expect(group(photos, { ...DEFAULTS, windowMin: 10 })).toHaveLength(0);
    expect(group(photos, { ...DEFAULTS, windowMin: 30 })).toHaveLength(1);
    // Au-delà des seuils les plus larges, la paire n'est même pas candidate.
    const far = [photo({ path: 'a.jpg', time: 0, emb: vec(0) }), photo({ path: 'b.jpg', time: (LIMITS.windowMin + 1) * MIN, emb: vec(0) })];
    expect(findPairs(far)).toHaveLength(0);
  });

  it('ressemblance minimale réglable', () => {
    // cos 30° ≈ 0,87
    const photos = [photo({ path: 'a.jpg', time: 0, emb: vec(0) }), photo({ path: 'b.jpg', time: MIN, emb: vec(30) })];
    expect(group(photos, { ...DEFAULTS, simMin: 0.9 })).toHaveLength(0);
    expect(group(photos, { ...DEFAULTS, simMin: 0.85 })).toHaveLength(1);
  });

  it('garde-fou contre les chaînes : A ressemble à B, B à C, mais pas A à C', () => {
    // A–B et B–C : cos 20° ≈ 0,94 ; A–C : cos 40° ≈ 0,77.
    const photos = [photo({ path: 'a.jpg', time: 0, emb: vec(0) }), photo({ path: 'b.jpg', time: MIN, emb: vec(20) }), photo({ path: 'c.jpg', time: 2 * MIN, emb: vec(40) })];
    const strict = group(photos, { ...DEFAULTS, simMin: 0.9 });
    expect(strict).toHaveLength(1);
    expect(strict[0].members).toHaveLength(2);
    const loose = group(photos, { ...DEFAULTS, simMin: 0.8 });
    expect(loose[0].members).toHaveLength(3);
  });

  it('photos sans date ou sans vecteur : jamais « similaires »', () => {
    const photos = [photo({ path: 'a.jpg', emb: vec(0) }), photo({ path: 'b.jpg', emb: vec(0) }), photo({ path: 'c.jpg', time: 0 }), photo({ path: 'd.jpg', time: 1 })];
    expect(findPairs(photos)).toHaveLength(0);
  });
});

describe('groupes', () => {
  it('identifiant stable, quel que soit l’ordre des photos', () => {
    const photos = [photo({ path: 'a.jpg' }), photo({ path: 'b.jpg' })];
    expect(groupId(photos, [0, 1])).toBe(groupId(photos, [1, 0]));
  });

  it('suggestion d’abord, puis par date ; groupes triés par date', () => {
    const photos = [
      photo({ path: 'x/3.jpg', time: 3 * MIN, emb: vec(0), sharpness: 10 }),
      photo({ path: 'x/1.jpg', time: 1 * MIN, emb: vec(2), sharpness: 10 }),
      photo({ path: 'x/2.jpg', time: 2 * MIN, emb: vec(4), sharpness: 99 }),
      photo({ path: 'y/old.jpg', sha: 'o', lastModified: 1 }),
      photo({ path: 'y/old2.jpg', sha: 'o', lastModified: 2 }),
    ];
    const groups = group(photos);
    expect(groups.map((g) => g.kind)).toEqual(['exact', 'similar']);
    expect(groups[1].members.map((i) => photos[i].path)).toEqual(['x/2.jpg', 'x/1.jpg', 'x/3.jpg']);
  });
});

describe('photos qui ont besoin du modèle', () => {
  it('seulement les photos datées qui ont une voisine dans le temps', () => {
    const row = (key: string, time?: number, error?: string): PhotoRow => ({ key, path: key, size: 1, lastModified: 1, time, error });
    const rows = [row('seule', 0), row('a', 100 * MIN), row('b', 101 * MIN), row('sans-date'), row('illisible', 101 * MIN, 'decode')];
    expect(needsVector(rows).map((r) => r.key)).toEqual(['a', 'b']);
  });

  it('une photo datée par son nom en est une, la date EXIF passe avant', () => {
    const row = (path: string, time?: number): PhotoRow => ({ key: path, path, size: 1, lastModified: 1, time });
    const at = new Date(2021, 4, 5, 17, 20, 47).getTime();
    expect(needsVector([row('D/IMG_20210505_172047.jpg'), row('exif.jpg', at + MIN), row('D/IMG_20210505_235900.jpg')]).map((r) => r.key)).toEqual(['D/IMG_20210505_172047.jpg', 'exif.jpg']);
    expect(needsVector([row('D/IMG_20210505_172047.jpg', at - 100 * MIN), row('exif.jpg', at + MIN)])).toHaveLength(0);
  });
});
