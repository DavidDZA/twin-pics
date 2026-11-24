/**
 * Appli PC : liste d'un dossier, suppression (Corbeille ou dossier « À supprimer ») et annulation, sur un vrai
 * dossier temporaire. La Corbeille de Windows est remplacée par une fonction d'essai.
 */
import { mkdtempSync, symlinkSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { independentRoots, listFolders } from '../electron/list';
import { freePath, removePhotos, restorePhotos } from '../electron/remove';
import { isInside, toSlash } from '../electron/paths';

const BIN = 'Twin Pics - À supprimer';
let dir: string;
let root: string;
const slash = (...p: string[]) => toSlash(join(...p));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'twin-pics-'));
  root = join(dir, 'Mes photos');
  for (const d of ['Vacances', 'WhatsApp Images', '$RECYCLE.BIN', 'Twin Pics - À supprimer', 'Autre']) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, 'Vacances', 'plage.jpg'), 'plage');
  writeFileSync(join(root, 'Vacances', 'iphone.HEIC'), 'heic');
  writeFileSync(join(root, 'Vacances', 'film.mp4'), 'mp4');
  writeFileSync(join(root, 'Vacances', 'notes.txt'), 'txt');
  writeFileSync(join(root, 'WhatsApp Images', 'IMG-1.jpg'), 'plage');
  writeFileSync(join(root, '$RECYCLE.BIN', 'vieille.jpg'), 'x');
  writeFileSync(join(root, 'Twin Pics - À supprimer', 'deja.jpg'), 'x');
  writeFileSync(join(root, 'Autre', 'chat.png'), 'chat');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('liste d’un dossier (appli PC)', () => {
  it('trouve les photos des sous-dossiers, compte HEIC et vidéos, ignore corbeilles et dossier « À supprimer »', async () => {
    const found: number[] = [];
    const l = await listFolders([root], (n) => found.push(n));
    expect(l.files.map((f) => f.path).sort()).toEqual([slash(root, 'Autre', 'chat.png'), slash(root, 'Vacances', 'plage.jpg'), slash(root, 'WhatsApp Images', 'IMG-1.jpg')].sort());
    expect(l.unsupported).toBe(1);
    expect(l.videos).toBe(1);
    expect(l.files[0].size).toBeGreaterThan(0);
    expect(Number.isInteger(l.files[0].lastModified)).toBe(true);
    expect(found.at(-1)).toBe(3);
  });

  it('ignore aussi le dossier « À supprimer » choisi par l’utilisateur', async () => {
    const l = await listFolders([root], () => undefined, [join(root, 'Autre')]);
    expect(l.files.map((f) => f.path)).not.toContain(slash(root, 'Autre', 'chat.png'));
  });
});

describe('plusieurs dossiers (appli PC)', () => {
  let key: string;
  beforeEach(() => {
    key = join(dir, 'Clé');
    mkdirSync(join(key, 'Vacances'), { recursive: true });
    writeFileSync(join(key, 'Vacances', 'plage.jpg'), 'plage');
    writeFileSync(join(key, 'film.mp4'), 'mp4');
  });

  it('une seule liste, chaque photo avec le rang de son dossier', async () => {
    const l = await listFolders([key, root], () => undefined);
    expect(l.files).toHaveLength(4);
    expect(l.files.filter((f) => f.root === 0).map((f) => f.path)).toEqual([slash(key, 'Vacances', 'plage.jpg')]);
    expect(l.files.filter((f) => f.root === 1)).toHaveLength(3);
    expect(l.videos).toBe(2);
  });

  it('jamais deux fois la même photo : dossier répété, sous-dossier, jonction', async () => {
    expect(await independentRoots([root, root])).toEqual([root]);
    expect(await independentRoots([join(root, 'Vacances'), root])).toEqual([root]);
    expect(await independentRoots([root, join(root, 'Vacances'), key])).toEqual([root, key]);
    const link = join(dir, 'Lien');
    symlinkSync(root, link, 'junction');
    expect(await independentRoots([root, link])).toEqual([root]);
    const l = await listFolders([join(link, 'Vacances'), root], () => undefined);
    expect(l.files).toHaveLength(3);
    expect(new Set(l.files.map((f) => f.root))).toEqual(new Set([1]));
  });

  it('un dossier introuvable n’empêche pas les autres', async () => {
    const l = await listFolders([join(dir, 'débranché'), key], () => undefined);
    expect(l.files.map((f) => f.root)).toEqual([1]);
  });

  it('« À supprimer » : un dans chaque dossier, ou celui choisi avec un sous-dossier par dossier', async () => {
    const a = slash(root, 'Vacances', 'plage.jpg');
    const b = slash(key, 'Vacances', 'plage.jpg');
    const roots = [toSlash(root), toSlash(key)];
    const deps = { trash: async () => undefined };
    const out = await removePhotos({ roots, paths: [a, b], mode: 'folder', folder: '', folderName: BIN }, deps);
    expect(out.map((o) => o.movedTo)).toEqual([slash(root, BIN, 'Vacances', 'plage.jpg'), slash(key, BIN, 'Vacances', 'plage.jpg')]);
    expect((await restorePhotos(out.map((o) => ({ from: o.movedTo!, to: o.path })))).every((o) => o.ok)).toBe(true);

    const chosen = join(dir, 'Poubelle');
    const again = await removePhotos({ roots, paths: [a, b], mode: 'folder', folder: toSlash(chosen), folderName: BIN }, deps);
    expect(again.map((o) => o.movedTo)).toEqual([slash(chosen, 'Mes photos', 'Vacances', 'plage.jpg'), slash(chosen, 'Clé', 'Vacances', 'plage.jpg')]);
  });
});

describe('chemins', () => {
  it('« dans le dossier » refuse « .. » et les dossiers voisins', () => {
    expect(isInside(root, join(root, 'Vacances', 'plage.jpg'))).toBe(true);
    expect(isInside(root, join(root, '..', 'ailleurs.jpg'))).toBe(false);
    expect(isInside(root, root + ' 2')).toBe(false);
    expect(isInside(root, toSlash(join(root, 'Vacances')))).toBe(true);
  });
});

describe('suppression (appli PC)', () => {
  const plage = () => slash(root, 'Vacances', 'plage.jpg');
  const wa = () => slash(root, 'WhatsApp Images', 'IMG-1.jpg');

  it('Corbeille : chaque photo y part ; un disque sans Corbeille laisse la photo en place', async () => {
    const trashed: string[] = [];
    const ok = await removePhotos({ roots: [toSlash(root)], paths: [wa()], mode: 'trash', folder: '', folderName: BIN }, { trash: async (p) => void trashed.push(toSlash(p)) });
    expect(ok).toEqual([{ path: wa(), ok: true }]);
    expect(trashed).toEqual([wa()]);

    const refused = await removePhotos({ roots: [toSlash(root)], paths: [plage()], mode: 'trash', folder: '', folderName: BIN }, { trash: async () => Promise.reject(new Error('pas de Corbeille')) });
    expect(refused[0]).toMatchObject({ ok: false, error: 'trash' });
    expect(existsSync(join(root, 'Vacances', 'plage.jpg'))).toBe(true);
  });

  it('dossier « À supprimer » : sous-dossiers gardés, jamais par-dessus un fichier, puis annulation', async () => {
    const folder = join(dir, 'Corbeille perso');
    mkdirSync(join(folder, 'Vacances'), { recursive: true });
    writeFileSync(join(folder, 'Vacances', 'plage.jpg'), 'autre photo');
    const out = await removePhotos({ roots: [toSlash(root)], paths: [plage(), wa()], mode: 'folder', folder: toSlash(folder), folderName: BIN }, { trash: async () => undefined });
    expect(out.every((o) => o.ok)).toBe(true);
    expect(out[0].movedTo).toBe(slash(folder, 'Vacances', 'plage (2).jpg'));
    expect(out[1].movedTo).toBe(slash(folder, 'WhatsApp Images', 'IMG-1.jpg'));
    expect(existsSync(join(root, 'Vacances', 'plage.jpg'))).toBe(false);
    expect(readFileSync(join(folder, 'Vacances', 'plage.jpg'), 'utf8')).toBe('autre photo');

    const back = await restorePhotos(out.map((o) => ({ from: o.movedTo!, to: o.path })));
    expect(back.every((o) => o.ok)).toBe(true);
    expect(readFileSync(join(root, 'Vacances', 'plage.jpg'), 'utf8')).toBe('plage');
    expect(existsSync(join(folder, 'Vacances', 'plage (2).jpg'))).toBe(false);
  });

  it('refuse une photo hors du dossier analysé ; signale une photo disparue', async () => {
    writeFileSync(join(dir, 'dehors.jpg'), 'x');
    const out = await removePhotos(
      { roots: [toSlash(root)], paths: [slash(dir, 'dehors.jpg'), slash(root, 'Vacances', 'absente.jpg')], mode: 'trash', folder: '', folderName: BIN },
      { trash: async () => undefined },
    );
    expect(out[0]).toMatchObject({ ok: false, error: 'other' });
    expect(out[1]).toMatchObject({ ok: false, error: 'missing' });
    expect(existsSync(join(dir, 'dehors.jpg'))).toBe(true);
  });

  it('un nom libre : « (2) », « (3) »…', async () => {
    const f = join(root, 'Vacances', 'plage.jpg');
    expect(await freePath(f)).toBe(join(root, 'Vacances', 'plage (2).jpg'));
    writeFileSync(join(root, 'Vacances', 'plage (2).jpg'), 'x');
    expect(await freePath(f)).toBe(join(root, 'Vacances', 'plage (3).jpg'));
    expect(await freePath(join(root, 'Vacances', 'neuve.jpg'))).toBe(join(root, 'Vacances', 'neuve.jpg'));
  });
});
