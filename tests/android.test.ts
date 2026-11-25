/** Appli Android : dossiers de la galerie, corbeille du téléphone, bouton Retour (code pur, fausse galerie). */
import { describe, expect, it } from 'vitest';
import { albumsOf, selectPhotos } from '../src/lib/albums';
import { goBack, pushBack } from '../src/lib/back';
import { listGallery, trashPhotos, untrashPhotos } from '../src/platform/android';
import type { GalleryPhoto } from '../src/platform/bridge';

const photo = (id: number, path: string): GalleryPhoto => ({ id, path, size: 1000 + id, lastModified: 1 });

const GALLERY = [
  photo(1, 'DCIM/Camera/IMG_1.jpg'),
  photo(2, 'DCIM/Camera/IMG_2.jpg'),
  photo(3, 'DCIM/Camera/IMG_3.HEIC'),
  photo(4, 'Pictures/Screenshots/Screenshot_1.png'),
  photo(5, '1a2b-3c4d/DCIM/Camera/IMG_5.jpg'),
  photo(6, 'DCIM/.thumbnails/6.jpg'),
  photo(7, 'Pictures/image.svg'),
  photo(8, 'Pictures/HEIC/8.heic'),
];

describe('dossiers de la galerie', () => {
  it('les plus remplis d’abord ; dossiers ignorés, fichiers inconnus et HEIC pas comptés', () => {
    expect(albumsOf(GALLERY)).toEqual([
      { path: 'DCIM/Camera', count: 2 },
      { path: '1a2b-3c4d/DCIM/Camera', count: 1 },
      { path: 'Pictures/Screenshots', count: 1 },
    ]);
  });

  it('l’analyse ne voit que les dossiers cochés, HEIC comptées à part', () => {
    const all = selectPhotos(GALLERY, new Set());
    expect(all.images.map((p) => p.id)).toEqual([1, 2, 4, 5]);
    expect(all.unsupported).toBe(2);
    const some = selectPhotos(GALLERY, new Set(['DCIM/Camera']));
    expect(some.images.map((p) => p.id)).toEqual([4, 5]);
    expect(some.unsupported).toBe(1);
  });

  it('chaque photo est lue par son numéro', () => {
    const l = listGallery(GALLERY, new Set());
    expect(l.images[1].path).toBe('DCIM/Camera/IMG_2.jpg');
    expect(l.images[1].open().url).toBe('/_photo/2');
  });
});

describe('corbeille du téléphone', () => {
  const idOf = (path: string) => GALLERY.find((p) => p.path === path)?.id;
  const paths = ['DCIM/Camera/IMG_1.jpg', 'DCIM/Camera/IMG_2.jpg'];

  it('acceptée : chaque photo est supprimée, sauf celles disparues', async () => {
    const asked: number[][] = [];
    const api = { trash: async (ids: number[]) => (asked.push(ids), { cancelled: false, missing: [2] }) };
    const out = await trashPhotos(api, idOf, [...paths, 'inconnue.jpg']);
    expect(asked).toEqual([[1, 2]]);
    expect(out).toEqual([
      { path: paths[0], ok: true, movedTo: '1' },
      { path: paths[1], ok: false, error: 'missing' },
      { path: 'inconnue.jpg', ok: false, error: 'missing' },
    ]);
  });

  it('refusée par l’utilisateur : rien n’est touché', async () => {
    const out = await trashPhotos({ trash: async () => ({ cancelled: true, missing: [] }) }, idOf, paths);
    expect(out.map((o) => o.error)).toEqual(['cancelled', 'cancelled']);
  });

  it('erreur d’Android : signalée, rien n’est compté supprimé', async () => {
    const api = {
      trash: async () => {
        throw new Error('refus');
      },
    };
    expect((await trashPhotos(api, idOf, paths)).map((o) => o.error)).toEqual(['other', 'other']);
  });

  it('annuler : par lots ; un refus arrête la suite', async () => {
    const calls: [number[], boolean][] = [];
    const moves = [1, 2, 3, 4, 5].map((n) => ({ from: String(n), to: `p${n}` }));
    const api = { trash: async (ids: number[], trashed: boolean) => (calls.push([ids, trashed]), { cancelled: calls.length === 2, missing: [] }) };
    const out = await untrashPhotos(api, moves, 2);
    expect(calls).toEqual([
      [[1, 2], false],
      [[3, 4], false],
    ]);
    expect(out.map((o) => [o.path, o.ok])).toEqual([
      ['p1', true],
      ['p2', true],
      ['p3', false],
      ['p4', false],
    ]);
  });
});

describe('bouton Retour', () => {
  it('ferme la dernière chose ouverte, puis rien', () => {
    const log: string[] = [];
    const offA = pushBack({ run: () => log.push('résultats') });
    const offB = pushBack({ run: () => log.push('visionneuse') });
    expect(goBack()).toBe(true);
    offB();
    expect(goBack()).toBe(true);
    offA();
    expect(goBack()).toBe(false);
    expect(log).toEqual(['visionneuse', 'résultats']);
  });
});
