/**
 * La liste des dossiers à analyser. Elle se range à la main, comme les classements de Rank It All : poignée ⠿ à glisser
 * (souris ou doigt), ou flèches haut et bas du clavier sur la poignée. Le dossier le plus haut est prioritaire : c'est
 * sa copie qui est proposée.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { T } from '../i18n';
import { dropIndex, folderName, moveTo, type Folder, type Row } from '../lib/folders';

interface Props {
  folders: Folder[];
  onFolders: (list: Folder[]) => void;
}

/** Un déplacement en cours : la ligne attrapée, de combien elle a bougé, où elle tomberait. */
interface Drag {
  from: number;
  to: number;
  startY: number;
  dy: number;
  rows: Row[];
}

const GAP = 8;

export function FolderList({ folders, onFolders }: Props) {
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const several = folders.length > 1;

  const start = (e: PointerEvent<HTMLButtonElement>, from: number) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rows = [...list.current!.children].map((li) => {
      const r = li.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    setDrag({ from, to: from, startY: e.clientY, dy: 0, rows });
  };
  const track = (e: PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    setDrag({ ...drag, dy, to: dropIndex(drag.rows, drag.from, dy) });
  };
  const drop = () => {
    if (drag && drag.to !== drag.from) onFolders(moveTo(folders, drag.from, drag.to));
    setDrag(null);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : i;
    if (to === i) return;
    e.preventDefault();
    if (to < 0 || to >= folders.length) return;
    onFolders(moveTo(folders, i, to));
    // La poignée suit le dossier déplacé.
    requestAnimationFrame(() => list.current?.querySelectorAll<HTMLButtonElement>('.drag-handle')[to]?.focus());
  };

  /** Décalage d'une ligne pendant le déplacement : celle attrapée suit, les autres lui font de la place. */
  const shift = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    const size = drag.rows[drag.from].height + GAP;
    if (i > drag.from && i <= drag.to) return -size;
    if (i < drag.from && i >= drag.to) return size;
    return 0;
  };

  return (
    <div className="folders">
      <h2>{T.start.folders}</h2>
      {several && <p className="muted small">{T.start.moveHint}</p>}
      <ul ref={list} data-testid="folders" className={drag ? 'sorting' : undefined}>
        {folders.map((f, i) => {
          const missing = f.kind === 'desktop' && f.missing;
          const y = shift(i);
          return (
            <li
              key={i}
              className={[missing && 'missing', drag?.from === i && 'dragging'].filter(Boolean).join(' ') || undefined}
              style={y ? { transform: `translateY(${y}px)` } : undefined}
            >
              {several && (
                <>
                  <button
                    className="drag-handle"
                    aria-label={T.start.move(folderName(f))}
                    title={T.start.dragTip}
                    onPointerDown={(e) => start(e, i)}
                    onPointerMove={track}
                    onPointerUp={drop}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={(e) => onKey(e, i)}
                  >
                    ⠿
                  </button>
                  <span className="folder-rank">{i + 1}</span>
                </>
              )}
              <span className="folder-text">
                <strong>{folderName(f)}</strong>
                {f.kind === 'desktop' && (
                  <span className="muted small path" title={f.path}>
                    {f.path}
                  </span>
                )}
                {missing && <span className="warning small">{T.start.missing}</span>}
              </span>
              <button className="secondary" aria-label={`${T.start.drop} (${folderName(f)})`} onClick={() => onFolders(folders.filter((x) => x !== f))}>
                {T.start.drop}
              </button>
            </li>
          );
        })}
      </ul>
      {several && <p className="muted small">{T.start.severalHelp}</p>}
    </div>
  );
}
