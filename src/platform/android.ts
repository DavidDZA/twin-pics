/**
 * Appli Android (Capacitor) : la galerie du téléphone, par le module natif `GalleryPlugin.java`. Une photo se lit à
 * l'adresse `/_photo/<numéro>` (servie par `MainActivity.java`). Les tests du site donnent une fausse galerie
 * (`window.twinPicsAndroid`).
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Listing } from '../lib/files';
import type { AndroidApi, GalleryAccess, GalleryPhoto, Move, RemoveOutcome, RemoveRequest } from './bridge';
import { selectPhotos } from '../lib/albums';

interface GalleryPlugin {
  access(): Promise<{ access: GalleryAccess }>;
  requestAccess(): Promise<{ access: GalleryAccess }>;
  list(): Promise<{ photos: GalleryPhoto[] }>;
  trash(o: { ids: number[]; trashed: boolean }): Promise<{ cancelled: boolean; missing: number[] }>;
  keepAwake(o: { on: boolean }): Promise<void>;
  openSettings(): Promise<void>;
}

function native(): AndroidApi {
  const g = registerPlugin<GalleryPlugin>('Gallery');
  return {
    access: async () => (await g.access()).access,
    requestAccess: async () => (await g.requestAccess()).access,
    list: async () => (await g.list()).photos,
    trash: (ids, trashed) => g.trash({ ids, trashed }),
    keepAwake: (on) => void g.keepAwake({ on }).catch(() => undefined),
    openSettings: () => void g.openSettings(),
  };
}

export const android: AndroidApi | undefined =
  typeof window === 'undefined' ? undefined : (window.twinPicsAndroid ?? (Capacitor.getPlatform() === 'android' ? native() : undefined));

const photoUrl = (id: number) => `/_photo/${id}`;

/** Numéro de chaque photo analysée, pour la supprimer. */
const ids = new Map<string, number>();

/** Les photos des dossiers cochés de la galerie. */
export function listGallery(photos: GalleryPhoto[], off: ReadonlySet<string>): Listing {
  const { images, unsupported } = selectPhotos(photos, off);
  for (const p of images) ids.set(p.path, p.id);
  return {
    images: images.map((p) => ({
      path: p.path,
      size: p.size,
      lastModified: p.lastModified,
      rank: 0,
      read: async () => {
        const res = await fetch(photoUrl(p.id));
        if (!res.ok) throw new Error(`lecture impossible (${res.status})`);
        return res.arrayBuffer();
      },
      open: () => ({ url: photoUrl(p.id), release: () => undefined }),
    })),
    unsupported,
    videos: 0,
  };
}

/**
 * Corbeille du téléphone : Android demande confirmation pour chaque lot. Refus : `cancelled`, rien n'est touché.
 * `movedTo` garde le numéro de la photo, pour l'en sortir (« Annuler »).
 */
export async function trashPhotos(api: Pick<AndroidApi, 'trash'>, idOf: (path: string) => number | undefined, paths: string[]): Promise<RemoveOutcome[]> {
  const known = paths.flatMap((p) => idOf(p) ?? []);
  try {
    const r = await api.trash(known, true);
    const missing = new Set(r.missing);
    return paths.map((path): RemoveOutcome => {
      const id = idOf(path);
      if (id === undefined || missing.has(id)) return { path, ok: false, error: 'missing' };
      return r.cancelled ? { path, ok: false, error: 'cancelled' } : { path, ok: true, movedTo: String(id) };
    });
  } catch (err) {
    return paths.map((path): RemoveOutcome => ({ path, ok: false, error: 'other', message: String(err) }));
  }
}

/** Sort des photos de la corbeille du téléphone, par lots (Android redemande confirmation). */
export async function untrashPhotos(api: Pick<AndroidApi, 'trash'>, moves: Move[], batch: number): Promise<RemoveOutcome[]> {
  const out: RemoveOutcome[] = [];
  for (let i = 0; i < moves.length; i += batch) {
    const part = moves.slice(i, i + batch);
    let error: RemoveOutcome['error'];
    try {
      if ((await api.trash(part.map((m) => Number(m.from)), false)).cancelled) error = 'cancelled';
    } catch {
      error = 'other';
    }
    out.push(...part.map((m): RemoveOutcome => (error ? { path: m.to, ok: false, error } : { path: m.to, ok: true })));
    if (error) break;
  }
  return out;
}

export const trashGallery = (api: AndroidApi, req: RemoveRequest) => trashPhotos(api, (p) => ids.get(p), req.paths);
