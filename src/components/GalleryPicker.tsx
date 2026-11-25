/**
 * Page de départ de l'appli Android : autoriser l'accès aux photos, choisir les dossiers de la galerie (tous au
 * départ), analyser.
 */
import { useState } from 'react';
import { T, num } from '../i18n';
import { albumsOf } from '../lib/albums';
import { baseName } from '../lib/folders';
import { android } from '../platform';
import type { GalleryState } from './useGallery';

export function GalleryPicker({ gallery, onAnalyze }: { gallery: GalleryState; onAnalyze: () => void }) {
  const [open, setOpen] = useState(false);
  const { access, off, setOff } = gallery;

  if (access === undefined) return null;

  if (access === 'none') {
    return (
      <div className="start-actions">
        <button className="primary" onClick={() => void gallery.ask()}>
          {T.android.allow}
        </button>
        {gallery.refused && (
          <>
            <p className="warning" role="alert">
              {T.android.refused}
            </p>
            <button className="secondary" onClick={() => android?.openSettings()}>
              {T.android.settings}
            </button>
          </>
        )}
      </div>
    );
  }

  const albums = albumsOf(gallery.photos);
  const on = albums.filter((a) => !off.has(a.path));
  const count = on.reduce((s, a) => s + a.count, 0);
  const toggle = (path: string) => {
    const next = new Set(off);
    if (!next.delete(path)) next.add(path);
    setOff(next);
  };

  return (
    <>
      {access === 'some' && (
        <div className="note-box gallery-note">
          <p>{T.android.some}</p>
          <button className="secondary" onClick={() => void gallery.ask()}>
            {T.android.changeAccess}
          </button>
        </div>
      )}
      {albums.length > 0 && (
        <div className="albums">
          <button className="albums-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>{T.android.albums(on.length, albums.length)}</span>
            <span aria-hidden="true">{open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <>
              <div className="actions-row">
                <button className="secondary" onClick={() => setOff(new Set())}>
                  {T.android.checkAll}
                </button>
                <button className="secondary" onClick={() => setOff(new Set(albums.map((a) => a.path)))}>
                  {T.android.uncheckAll}
                </button>
              </div>
              <ul data-testid="albums">
                {albums.map((a) => (
                  <li key={a.path}>
                    <label>
                      <input type="checkbox" checked={!off.has(a.path)} onChange={() => toggle(a.path)} />
                      <span className="folder-text">
                        <strong>{baseName(a.path) || T.android.phone}</strong>
                        <span className="muted small path">{a.path}</span>
                      </span>
                      <span className="muted small">{num(a.count)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {gallery.ready && !albums.length && <p className="muted">{T.android.empty}</p>}
      {albums.length > 0 && (
        <div className="start-actions">
          <button className="primary" onClick={onAnalyze} disabled={!count}>
            {T.android.analyze(num(count), count)}
          </button>
        </div>
      )}
    </>
  );
}
