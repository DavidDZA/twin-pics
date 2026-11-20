import { useEffect, useRef, useState } from 'react';
import { T } from '../i18n';
import { getMeta } from '../lib/db';
import { EMBED_SIZE_MB } from '../lib/model';

interface Props {
  canPick: boolean;
  similar: boolean;
  onSimilar: (v: boolean) => void;
  onPick: () => void;
  onFiles: (files: File[]) => void;
  onResume: (handle: FileSystemDirectoryHandle) => void;
  error?: string;
}

export function StartScreen({ canPick, similar, onSimilar, onPick, onFiles, onResume, error }: Props) {
  const [last, setLast] = useState<FileSystemDirectoryHandle | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!canPick) return;
    getMeta<FileSystemDirectoryHandle>('folder')
      .then((h) => setLast(h ?? null))
      .catch(() => setLast(null));
  }, [canPick]);

  return (
    <section className="start">
      <p className="lead">{T.app.tagline}</p>
      <p className="muted">{T.app.privacy}</p>

      <div className="start-actions">
        <button className="primary" onClick={canPick ? onPick : () => input.current?.click()}>
          {T.start.pick}
        </button>
        {/* Champ d'envoi de dossier : pour les navigateurs sans File System Access API (et les tests). */}
        <input
          ref={input}
          type="file"
          data-testid="folder-input"
          hidden
          multiple
          {...{ webkitdirectory: '' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onFiles(files);
          }}
        />
        {last && (
          <button className="secondary" onClick={() => onResume(last)}>
            {T.start.resume(last.name)}
          </button>
        )}
        <p className="muted small">{T.start.subfolders}</p>
      </div>

      <label className="option">
        <input type="checkbox" checked={similar} onChange={(e) => onSimilar(e.target.checked)} />
        <span>
          <strong>{T.start.similar}</strong>
          <span className="muted small">{T.start.similarHelp(EMBED_SIZE_MB)}</span>
        </span>
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted small note">{T.app.prototype}</p>
    </section>
  );
}
