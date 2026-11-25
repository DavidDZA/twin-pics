import { useRef } from 'react';
import { T } from '../i18n';
import { EMBED_SIZE_MB } from '../lib/model';
import { CLIP_CPU_MB } from '../lib/junk';
import type { Folder } from '../lib/folders';
import { RELEASES_URL, android, desktop } from '../platform';
import { GalleryPicker } from './GalleryPicker';
import type { GalleryState } from './useGallery';
import { FolderList } from './FolderList';
import { TwinCards } from './TwinCards';

interface Props {
  canPick: boolean;
  /** Appli Android : la galerie du téléphone, à la place des dossiers. */
  gallery?: GalleryState;
  /** Les dossiers à analyser, dans l'ordre (retenus d'une fois à l'autre). */
  folders: Folder[];
  onFolders: (list: Folder[]) => void;
  similar: boolean;
  onSimilar: (v: boolean) => void;
  junkModel: boolean;
  onJunkModel: (v: boolean) => void;
  onPick: () => void;
  onFiles: (files: File[]) => void;
  onAnalyze: () => void;
  error?: string;
}

export function StartScreen({ canPick, gallery, folders, onFolders, similar, onSimilar, junkModel, onJunkModel, onPick, onFiles, onAnalyze, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pick = canPick ? onPick : () => input.current?.click();

  return (
    <section className="start">
      <TwinCards />
      <p className="lead">{T.app.tagline}</p>
      <p className="muted">{android ? T.android.privacy : T.app.privacy}</p>

      {gallery && <GalleryPicker gallery={gallery} onAnalyze={onAnalyze} />}
      {folders.length > 0 && <FolderList folders={folders} onFolders={onFolders} />}

      {!gallery && (
        <div className="start-actions">
          {folders.length > 0 && (
            <button className="primary" onClick={onAnalyze}>
              {T.start.analyze}
            </button>
          )}
          <button className={folders.length ? 'secondary' : 'primary'} onClick={pick}>
            {folders.length ? T.start.add : T.start.pick}
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
              e.target.value = '';
              if (files.length) onFiles(files);
            }}
          />
          <p className="muted small">{T.start.subfolders}</p>
        </div>
      )}

      <label className="option">
        <input type="checkbox" checked={similar} onChange={(e) => onSimilar(e.target.checked)} />
        <span>
          <strong>{T.start.similar}</strong>
          <span className="muted small">{T.start.similarHelp(EMBED_SIZE_MB)}</span>
        </span>
      </label>
      <label className="option">
        <input type="checkbox" checked={junkModel} onChange={(e) => onJunkModel(e.target.checked)} />
        <span>
          <strong>{T.start.junkModel}</strong>
          <span className="muted small">{T.start.junkModelHelp(CLIP_CPU_MB)}</span>
        </span>
      </label>
      {gallery && <p className="muted small">{T.android.slow}</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!desktop && !android && (
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
