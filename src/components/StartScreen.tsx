import { useEffect, useRef, useState } from 'react';
import { T } from '../i18n';
import { getMeta } from '../lib/db';
import { EMBED_SIZE_MB } from '../lib/model';
import { nameOf } from '../lib/filetypes';
import { RELEASES_URL, desktop } from '../platform';
import { TwinCards } from './TwinCards';

interface Props {
  canPick: boolean;
  similar: boolean;
  onSimilar: (v: boolean) => void;
  onPick: () => void;
  onFiles: (files: File[]) => void;
  /** Le dernier dossier : son accès (site, File System Access API) ou son chemin (appli PC). */
  onResume: (last: FileSystemDirectoryHandle | string) => void;
  error?: string;
}

export function StartScreen({ canPick, similar, onSimilar, onPick, onFiles, onResume, error }: Props) {
  const [last, setLast] = useState<FileSystemDirectoryHandle | string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (desktop) {
      desktop.lastFolder().then(setLast, () => setLast(null));
      return;
    }
    if (!canPick) return;
    getMeta<FileSystemDirectoryHandle>('folder')
      .then((h) => setLast(h ?? null))
      .catch(() => setLast(null));
  }, [canPick]);

  const lastName = typeof last === 'string' ? nameOf(last.replace(/\/$/, '')) || last : last?.name;

  return (
    <section className="start">
      <TwinCards />
      <p className="lead">{T.app.tagline}</p>
      <p className="muted">{T.app.privacy}</p>

      <div className="start-actions">
        <button className="primary" onClick={canPick ? onPick : () => input.current?.click()}>
          {T.start.pick}
        </button>
        {/* Champ d'envoi de dossier : pour les navigateurs sans File System Access API (et les tests du site). */}
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
          <button className="secondary" onClick={() => onResume(last)} title={typeof last === 'string' ? last : undefined}>
            {T.start.resume(lastName ?? '')}
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
      {!desktop && (
        <p className="muted small note">
          {T.app.webNote}{' '}
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            {T.app.getPc}
          </a>
        </p>
      )}
    </section>
  );
}
