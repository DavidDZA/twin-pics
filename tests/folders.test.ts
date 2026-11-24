/** Plusieurs dossiers : la liste (jamais deux fois les mêmes photos), l'ordre, les noms affichés. */
import { afterEach, describe, expect, it } from 'vitest';
import { addFolder, baseName, dropIndex, folderLabels, folderName, insidePath, moveTo, rootOf, uniqueNames, type Folder } from '../src/lib/folders';
import { setDisplayRoots, shortPath } from '../src/lib/display';
import { listFileList, mergeListings } from '../src/lib/files';

const pc = (path: string): Folder => ({ kind: 'desktop', path });
const paths = (list: Folder[]) => list.map((f) => (f.kind === 'desktop' ? f.path : folderName(f)));
const file = (path: string, size = 10, lastModified = 1): File => ({ name: path.split('/').pop()!, webkitRelativePath: path, size, lastModified }) as File;

/** Faux dossier de la File System Access API : `resolve` répond d'après les chemins. */
const handle = (path: string): Folder => {
  const h = {
    name: path.split('/').pop()!,
    path,
    resolve: async (o: { path: string }) => (o.path === path ? [] : o.path.startsWith(path + '/') ? o.path.slice(path.length + 1).split('/') : null),
  };
  return { kind: 'handle', handle: h as unknown as FileSystemDirectoryHandle };
};

describe('liste des dossiers', () => {
  it('ajoute à la suite deux dossiers différents, même voisins de nom', async () => {
    const r = await addFolder([pc('F:/Photos')], pc('F:/Photos 2'));
    expect(paths(r.list)).toEqual(['F:/Photos', 'F:/Photos 2']);
    expect(r.covered).toBeUndefined();
  });

  it('refuse le même dossier et un sous-dossier (majuscules ou non, « / » final)', async () => {
    const list = [pc('F:/Photos')];
    for (const p of ['F:/Photos', 'f:/photos/', 'F:/PHOTOS/Vacances/2024']) {
      const r = await addFolder(list, pc(p));
      expect(r.covered).toBe('Photos');
      expect(r.list).toBe(list);
    }
  });

  it('un dossier qui en comprend d’autres prend leur place, au rang du premier', async () => {
    const r = await addFolder([pc('E:/Clé'), pc('F:/Photos/A'), pc('G:/Autre'), pc('F:/Photos/B')], pc('F:/Photos'));
    expect(paths(r.list)).toEqual(['E:/Clé', 'F:/Photos', 'G:/Autre']);
    expect(r.replaced).toEqual(['A', 'B']);
  });

  it('un disque entier comprend ses dossiers', async () => {
    expect((await addFolder([pc('D:/')], pc('D:/Photos'))).covered).toBe('D:');
    expect((await addFolder([pc('D:/Photos')], pc('D:/'))).replaced).toEqual(['Photos']);
    expect((await addFolder([pc('D:/')], pc('E:/Photos'))).list).toHaveLength(2);
  });

  it('site : mêmes règles avec la File System Access API', async () => {
    const list = [handle('Images/Photos')];
    expect((await addFolder(list, handle('Images/Photos'))).covered).toBe('Photos');
    expect((await addFolder(list, handle('Images/Photos/Été'))).covered).toBe('Photos');
    expect((await addFolder(list, handle('Images'))).replaced).toEqual(['Photos']);
    expect((await addFolder(list, handle('Clé/Photos'))).list).toHaveLength(2);
  });

  it('champ d’envoi : un dossier renvoyé remplace l’ancien, un autre s’ajoute', async () => {
    const a: Folder = { kind: 'files', name: 'Photos', files: [file('Photos/a.jpg'), file('Photos/b.jpg')] };
    const again: Folder = { kind: 'files', name: 'Photos', files: [file('Photos/a.jpg'), file('Photos/c.jpg')] };
    const other: Folder = { kind: 'files', name: 'Photos', files: [file('Photos/z.jpg', 99)] };
    expect((await addFolder([a], again)).list).toEqual([again]);
    expect((await addFolder([a], other)).list).toEqual([a, other]);
  });

  it('monter ou descendre un dossier', () => {
    expect(moveTo(['1', '2', '3'], 2, 0)).toEqual(['3', '1', '2']);
    expect(moveTo(['1', '2', '3'], 0, 1)).toEqual(['2', '1', '3']);
    expect(moveTo(['1', '2', '3'], 1, 1)).toEqual(['1', '2', '3']);
  });

  it('glisser : la place change quand une ligne dépasse le milieu d’une autre', () => {
    const rows = [0, 58, 116].map((top) => ({ top, height: 50 }));
    expect(dropIndex(rows, 0, 10)).toBe(0);
    expect(dropIndex(rows, 0, 34)).toBe(1);
    expect(dropIndex(rows, 0, 500)).toBe(2);
    expect(dropIndex(rows, 2, -20)).toBe(2);
    expect(dropIndex(rows, 2, -60)).toBe(1);
    expect(dropIndex(rows, 2, -500)).toBe(0);
    expect(dropIndex(rows, 1, 40)).toBe(2);
    expect(dropIndex(rows, 1, -40)).toBe(0);
  });
});

describe('chemins et noms', () => {
  afterEach(() => setDisplayRoots([]));

  it('dans un dossier ou non ; le dossier le plus proche', () => {
    expect(insidePath('F:/Photos', 'f:/photos/a.jpg')).toBe(true);
    expect(insidePath('F:/Photos', 'F:/Photos 2/a.jpg')).toBe(false);
    expect(rootOf(['F:/Photos', 'E:/', 'F:/Photos/Été'], 'F:/Photos/Été/a.jpg')).toBe(2);
    expect(rootOf(['F:/Photos', 'E:/'], 'E:/a.jpg')).toBe(1);
    expect(rootOf(['F:/Photos'], 'G:/a.jpg')).toBe(-1);
  });

  it('noms : la fin du chemin, le chemin complet si deux portent le même', () => {
    expect(baseName('F:/Mes photos/')).toBe('Mes photos');
    expect(baseName('D:/')).toBe('D:');
    expect(folderLabels(['F:/Photos', 'E:/Clé'])).toEqual(['Photos', 'Clé']);
    expect(folderLabels(['F:/Photos', 'E:/photos/', 'E:/Clé'])).toEqual(['F:/Photos', 'E:/photos', 'Clé']);
    expect(uniqueNames(['Photos', 'Photos', 'Clé', 'Photos'])).toEqual(['Photos', 'Photos (2)', 'Clé', 'Photos (3)']);
  });

  it('chemins affichés à partir du dossier analysé', () => {
    setDisplayRoots(['F:/Nos photos/Photos', 'E:/Clé']);
    expect(shortPath('F:/Nos photos/Photos/Été/a.jpg')).toBe('Photos/Été/a.jpg');
    expect(shortPath('E:/Clé/b.jpg')).toBe('Clé/b.jpg');
    setDisplayRoots(['F:/Photos', 'E:/Photos']);
    expect(shortPath('E:/Photos/Été/a.jpg')).toBe('E:/Photos/Été/a.jpg');
    setDisplayRoots(['D:/']);
    expect(shortPath('D:/Été/a.jpg')).toBe('D:/Été/a.jpg');
    setDisplayRoots([]);
    expect(shortPath('Photos/a.jpg')).toBe('Photos/a.jpg');
  });

  it('site : deux dossiers du même nom gardent des chemins différents', () => {
    const l = mergeListings([listFileList([file('Photos/a.jpg'), file('Photos/film.mp4')], 'Photos', 0), listFileList([file('Photos/a.jpg'), file('Photos/b.heic')], 'Photos (2)', 1)]);
    expect(l.images.map((f) => [f.path, f.rank])).toEqual([
      ['Photos/a.jpg', 0],
      ['Photos (2)/a.jpg', 1],
    ]);
    expect([l.videos, l.unsupported]).toEqual([1, 1]);
  });
});
