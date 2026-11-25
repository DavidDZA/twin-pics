/** La galerie du téléphone (appli Android) : accès, photos, dossiers décochés. Sans effet ailleurs. */
import { useCallback, useEffect, useState } from 'react';
import { readAlbumsOff, saveAlbumsOff } from '../lib/albums';
import { android } from '../platform';
import type { GalleryAccess, GalleryPhoto } from '../platform/bridge';

export interface GalleryState {
  /** Inconnu tant qu'Android n'a pas répondu. */
  access?: GalleryAccess;
  photos: GalleryPhoto[];
  /** La liste a été lue au moins une fois. */
  ready: boolean;
  /** Autorisation demandée et refusée : Android ne la redemandera peut-être plus. */
  refused: boolean;
  off: ReadonlySet<string>;
  setOff(off: ReadonlySet<string>): void;
  ask(): Promise<void>;
  refresh(): Promise<GalleryPhoto[]>;
}

export function useGallery(): GalleryState {
  const [access, setAccess] = useState<GalleryAccess>();
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [ready, setReady] = useState(false);
  const [refused, setRefused] = useState(false);
  const [off, setOffState] = useState<ReadonlySet<string>>(readAlbumsOff);

  const refresh = useCallback(async () => {
    const list = await android!.list();
    setPhotos(list);
    setReady(true);
    return list;
  }, []);

  useEffect(() => {
    if (!android) return;
    const check = async () => {
      const a = await android!.access();
      setAccess(a);
      if (a !== 'none') {
        setRefused(false);
        await refresh();
      }
    };
    const run = () => void check().catch(() => undefined);
    run();
    // Au retour dans l'appli : autorisation donnée dans les réglages d'Android, nouvelles photos.
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const ask = async () => {
    const a = await android!.requestAccess();
    setAccess(a);
    setRefused(a === 'none');
    if (a !== 'none') await refresh();
  };
  const setOff = (o: ReadonlySet<string>) => (setOffState(o), saveAlbumsOff(o));

  return { access, photos, ready, refused, off, setOff, ask, refresh };
}
