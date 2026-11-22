/**
 * Mode **swipe** des photos inutiles : une carte à la fois (une photo, ou un groupe de photos semblables en mosaïque),
 * glissée à gauche (« Je jette ») ou à droite (« Je garde ») — à la souris, au doigt, aux flèches du clavier ou par
 * les deux boutons. Un groupe entier se décide d'un geste ; le détail photo par photo reste possible en grille.
 */
import { useEffect, useRef, useState } from 'react';
import { T, bytes, dateTime } from '../i18n';
import type { Group, PhotoInfo } from '../lib/groups';
import type { FoundFile } from '../lib/files';
import type { Mark } from '../lib/choices';
import { PhotoImage } from './PhotoImage';
import { reasonsText } from './photoText';

/** Distance (px) au-delà de laquelle le geste décide. */
const THRESHOLD = 110;
/** Photos montrées dans la mosaïque d'un groupe. */
const MOSAIC = 4;

interface Props {
  group: Group;
  photos: PhotoInfo[];
  files: Map<string, FoundFile>;
  thumbs: Map<string, string>;
  /** La visionneuse est ouverte : le clavier lui appartient. */
  paused: boolean;
  onDecide: (mark: Mark) => void;
  onZoom: () => void;
}

export function SwipeCard({ group, photos, files, thumbs, paused, onDecide, onZoom }: Props) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<Mark | null>(null);
  const start = useRef<{ x: number; id: number } | null>(null);
  const n = group.members.length;
  const shown = group.members.slice(0, MOSAIC);
  const allReasons = [...new Set(group.members.flatMap((i) => group.junk?.reasons[i] ?? []))];
  const size = group.members.reduce((s, i) => s + photos[i].size, 0);
  const first = photos[group.members[0]];

  const decide = (mark: Mark) => {
    if (leaving) return;
    setLeaving(mark);
    window.setTimeout(() => onDecide(mark), 180);
  };

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        decide('remove');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        decide('keep');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const offset = leaving ? (leaving === 'keep' ? 1 : -1) * window.innerWidth : dx;
  const strength = Math.min(1, Math.abs(dx) / THRESHOLD);

  return (
    <div className="swipe">
      <div className="swipe-stage">
        <div
          className={`swipe-card${start.current ? ' dragging' : ''}${leaving ? ' leaving' : ''}`}
          data-testid="swipe-card"
          style={{ transform: `translateX(${offset}px) rotate(${offset / 25}deg)` }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            start.current = { x: e.clientX, id: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current?.id === e.pointerId && setDx(e.clientX - start.current.x)}
          onPointerUp={(e) => {
            if (start.current?.id !== e.pointerId) return;
            start.current = null;
            if (Math.abs(dx) > THRESHOLD) decide(dx > 0 ? 'keep' : 'remove');
            else setDx(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDx(0);
          }}
        >
          <div className={n > 1 ? `mosaic m${Math.min(n, MOSAIC)}` : 'mosaic m1'}>
            {shown.map((i) => (
              <div key={photos[i].key} className="tile-img">
                <PhotoImage file={files.get(photos[i].key)} thumb={thumbs.get(photos[i].key)} full={n <= MOSAIC} />
              </div>
            ))}
            {n > MOSAIC && <span className="more-count">+{n - MOSAIC}</span>}
          </div>
          <span className="stamp keep" style={{ opacity: dx > 0 ? strength : 0 }}>
            {T.sort.keepIt}
          </span>
          <span className="stamp remove" style={{ opacity: dx < 0 ? strength : 0 }}>
            {T.sort.trash}
          </span>
          <button className="full-btn" onClick={onZoom}>
            <span aria-hidden="true">⤢</span> {T.sort.zoom}
          </button>
        </div>
      </div>
      <div className="swipe-info">
        <strong>{n > 1 ? T.junk.similarN(n) : first.name}</strong>
        <span className="reasons-line">{reasonsText(allReasons)}</span>
        <span className="muted small">
          {bytes(size)}
          {first.time ? ` · ${dateTime(first.time)}` : ''}
        </span>
      </div>
      <p className="muted small hint">{T.sort.swipeHelp}</p>
      <div className="swipe-buttons">
        <button className="swipe-btn remove" onClick={() => decide('remove')}>
          ✕ {T.sort.trash}
        </button>
        <button className="swipe-btn keep" onClick={() => decide('keep')}>
          ✓ {T.sort.keepIt}
        </button>
      </div>
    </div>
  );
}
