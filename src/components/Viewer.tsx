import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../i18n';
import type { Group, PhotoInfo } from '../lib/groups';
import type { FoundFile } from '../lib/files';
import { folderOf } from '../lib/filetypes';
import { shortPath } from '../lib/display';
import type { Choice } from '../lib/choices';
import { clampZoom, FIT, pinch, wheelFactor, ZOOM_CLOSE, ZOOM_STEP, zoomAt, type Zoom } from '../lib/zoom';
import { addStats } from '../lib/statsStore';
import { useBack } from '../lib/back';
import { photoDetails } from './photoText';

interface Props {
  group: Group;
  start: number;
  photos: PhotoInfo[];
  files: Map<string, FoundFile>;
  onClose: () => void;
  /** Pendant le tri : le choix de chaque photo, modifiable ici. */
  choice?: Choice;
  onToggle?: (key: string) => void;
}

/**
 * Une photo du groupe en plein écran (le fichier d'origine). Pour passer aux autres photos du groupe : les flèches à
 * gauche et à droite de la photo, les flèches du clavier, ou glisser le doigt (téléphone).
 *
 * Zoom (`zoom.ts`) : molette (autour de la souris), touches + − 0, double clic, boutons, deux doigts ; on déplace la
 * photo agrandie à la souris ou au doigt. Le zoom reste le même en passant à la photo suivante : pratique pour comparer
 * le même détail sur deux photos presque pareilles.
 */
export function Viewer({ group, start, photos, files, onClose, choice, onToggle }: Props) {
  const [index, setIndex] = useState(start);
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>(FIT);
  const photo = photos[group.members[index]];
  const count = group.members.length;
  const mark = choice?.[photo.key];
  const body = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  /** Doigts (ou souris) posés : leur place, et leur point de départ. */
  const pointers = useRef(new Map<number, { x: number; y: number; x0: number; y0: number }>());
  const moved = useRef(false);
  const prev = () => setIndex((i) => (i + count - 1) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  useBack(onClose);

  // Badge « Détective » : photos regardées en zoom.
  const zoomed = zoom.scale > 1;
  useEffect(() => {
    if (zoomed) addStats({ zooms: 1 });
  }, [zoomed, photo.key]);

  /** Change le zoom sans laisser la photo sortir de l'écran. */
  const change = useCallback((f: (z: Zoom) => Zoom) => {
    setZoom((z) => {
      const out = f(z);
      const b = body.current;
      const i = image.current;
      if (!b || !i) return out;
      return clampZoom(out, { width: b.clientWidth, height: b.clientHeight }, { width: i.clientWidth, height: i.clientHeight });
    });
  }, []);

  /** Un point de l'écran, compté à partir du centre de la photo. */
  const fromCenter = (x: number, y: number) => {
    const r = body.current!.getBoundingClientRect();
    return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 };
  };

  useEffect(() => {
    const file = files.get(photo.key);
    if (!file) return;
    const opened = file.open();
    setUrl(opened.url);
    return () => opened.release();
  }, [photo.key, files]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowLeft') setIndex((i) => (i + count - 1) % count);
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % count);
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        change((z) => zoomAt(z, ZOOM_STEP));
      } else if (e.key === '-') {
        e.preventDefault();
        change((z) => zoomAt(z, 1 / ZOOM_STEP));
      } else if (e.key === '0' || e.code === 'Digit0') {
        e.preventDefault();
        setZoom(FIT);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, onClose, change]);

  // Molette : écouteur non passif (React en pose un passif, qui ne peut pas empêcher le défilement).
  useLayoutEffect(() => {
    const b = body.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = fromCenter(e.clientX, e.clientY);
      change((z) => zoomAt(z, wheelFactor(e.deltaY), p.x, p.y));
    };
    b.addEventListener('wheel', onWheel, { passive: false });
    return () => b.removeEventListener('wheel', onWheel);
  }, [change]);

  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    if (pointers.current.size === 0) moved.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relevé.
    }
  };

  const onMove = (e: ReactPointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 4) moved.current = true;
    const before = { ...p };
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.current.size === 2) {
      const other = [...pointers.current].find(([id]) => id !== e.pointerId)![1];
      const o = fromCenter(other.x, other.y);
      change((z) => pinch(z, [fromCenter(before.x, before.y), o], [fromCenter(p.x, p.y), o]));
    } else if (pointers.current.size === 1) change((z) => (z.scale > 1 ? { ...z, x: z.x + p.x - before.x, y: z.y + p.y - before.y } : z));
  };

  const onUp = (e: ReactPointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const alone = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    // Photo entière : glisser le doigt passe à la photo suivante.
    if (!alone || e.type !== 'pointerup' || e.pointerType !== 'touch' || zoom.scale > 1 || count < 2) return;
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) (dx < 0 ? next : prev)();
  };

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={photo.name} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viewer-bar">
        <span className="name">
          {index + 1} / {count} · {photo.name}
          {group.members[index] === group.best && <span className="badge inline">{T.group.suggestion}</span>}
        </span>
        {mark && onToggle && (
          <button className={mark === 'keep' ? 'toggle on good' : 'toggle on wrong'} aria-pressed={mark === 'keep'} onClick={() => onToggle(photo.key)}>
            {mark === 'keep' ? `✓ ${T.sort.kept}` : `✕ ${T.sort.removed}`}
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          {T.viewer.close}
        </button>
      </div>
      <div
        ref={body}
        className={zoom.scale > 1 ? 'viewer-body zoomed' : 'viewer-body'}
        onClick={(e) => e.target === e.currentTarget && !moved.current && onClose()}
        onDoubleClick={(e) => {
          if ((e.target as Element).closest('button')) return;
          const p = fromCenter(e.clientX, e.clientY);
          change((z) => (z.scale > 1 ? FIT : zoomAt(z, ZOOM_CLOSE, p.x, p.y)));
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {url && (
          <img
            key={photo.key}
            ref={image}
            src={url}
            alt={photo.name}
            draggable={false}
            style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }}
            onLoad={() => change((z) => z)}
          />
        )}
        {count > 1 && (
          <>
            <button className="viewer-arrow left" onClick={prev} aria-label={T.viewer.prev} title={T.viewer.prev}>
              ‹
            </button>
            <button className="viewer-arrow right" onClick={next} aria-label={T.viewer.next} title={T.viewer.next}>
              ›
            </button>
          </>
        )}
      </div>
      <div className="viewer-bar info-bar">
        <span className="muted small info">
          {folderOf(shortPath(photo.path))} · {photoDetails(photo)}
        </span>
        <span className="zoom-bar" role="group" aria-label={T.viewer.zoom} title={T.viewer.zoomHelp}>
          <span data-testid="zoom">{T.viewer.zoomValue(Math.round(zoom.scale * 100))}</span>
          <button className="secondary" onClick={() => change((z) => zoomAt(z, 1 / ZOOM_STEP))} disabled={zoom.scale <= 1} aria-label={T.viewer.zoomOut} title={T.viewer.zoomOut}>
            −
          </button>
          <button className="secondary" onClick={() => change((z) => zoomAt(z, ZOOM_STEP))} aria-label={T.viewer.zoomIn} title={T.viewer.zoomIn}>
            +
          </button>
          <button className="secondary" onClick={() => setZoom(FIT)} disabled={zoom.scale <= 1}>
            {T.viewer.whole}
          </button>
        </span>
      </div>
    </div>,
    document.body,
  );
}
