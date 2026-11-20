import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, bytes, dateTime } from '../i18n';
import type { Group, PhotoInfo } from '../lib/groups';
import { folderOf } from '../lib/files';

interface Props {
  group: Group;
  start: number;
  photos: PhotoInfo[];
  files: Map<string, File>;
  onClose: () => void;
}

/** Une photo du groupe en grand (le fichier d'origine), avec les flèches pour passer aux autres. */
export function Viewer({ group, start, photos, files, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [url, setUrl] = useState<string | null>(null);
  const photo = photos[group.members[index]];
  const count = group.members.length;

  useEffect(() => {
    const file = files.get(photo.key);
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo.key, files]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex((i) => (i + count - 1) % count);
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClose]);

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={photo.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer-bar">
        <span className="name">
          {index + 1} / {count} · {photo.name}
          {group.members[index] === group.best && <span className="badge inline">{T.group.suggestion}</span>}
        </span>
        <button className="secondary" onClick={onClose}>
          {T.viewer.close}
        </button>
      </div>
      <div className="viewer-body" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {url && <img src={url} alt={photo.name} />}
      </div>
      <div className="viewer-bar">
        <button className="secondary" onClick={() => setIndex((index + count - 1) % count)} disabled={count < 2}>
          ‹ {T.viewer.prev}
        </button>
        <span className="muted small info">
          {folderOf(photo.path)} · {photo.width && photo.height ? `${photo.width} × ${photo.height} · ` : ''}
          {bytes(photo.size)}
          {photo.time ? ` · ${dateTime(photo.time)}` : ''}
        </span>
        <button className="secondary" onClick={() => setIndex((index + 1) % count)} disabled={count < 2}>
          {T.viewer.next} ›
        </button>
      </div>
    </div>,
    document.body,
  );
}
