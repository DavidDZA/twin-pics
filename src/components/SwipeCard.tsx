/**
 * Mode **swipe** des photos inutiles : une carte, une photo, glissée à gauche (« Je jette ») ou à droite (« Je garde »)
 * — à la souris, au doigt, aux flèches du clavier ou par les deux boutons. `SwipeSorter` enchaîne les photos.
 */
import { useEffect, useRef, useState } from 'react';
import { T, bytes, dateTime } from '../i18n';
import type { PhotoInfo } from '../lib/groups';
import type { FoundFile } from '../lib/files';
import type { JunkReason } from '../lib/junk';
import type { Mark } from '../lib/choices';
import { PhotoImage } from './PhotoImage';
import { reasonsText } from './photoText';

/** Distance (px) au-delà de laquelle le geste décide. */
const THRESHOLD = 110;

interface Props {
  photo: PhotoInfo;
  reasons: JunkReason[];
  /** Choix déjà fait (en revenant en arrière). */
  mark?: Mark;
  file?: FoundFile;
  thumb?: string;
  /** La photo suivante, affichée sous la carte (déjà chargée quand son tour vient). */
  nextFile?: FoundFile;
  nextThumb?: string;
  /** La visionneuse est ouverte : le clavier lui appartient. */
  paused: boolean;
  onDecide: (mark: Mark) => void;
  onZoom: () => void;
}

export function SwipeCard({ photo, reasons, mark, file, thumb, nextFile, nextThumb, paused, onDecide, onZoom }: Props) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<Mark | null>(null);
  const start = useRef<{ x: number; id: number } | null>(null);

  const decide = (m: Mark) => {
    if (leaving) return;
    setLeaving(m);
    window.setTimeout(() => onDecide(m), 180);
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
        {(nextFile || nextThumb) && (
          <div className="swipe-card under" aria-hidden="true">
            <div className="swipe-photo">
              <PhotoImage file={nextFile} thumb={nextThumb} full />
            </div>
          </div>
        )}
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
          <div className="swipe-photo">
            <PhotoImage file={file} thumb={thumb} full />
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
        <strong>{photo.name}</strong>
        <span className="reasons-line">{reasonsText(reasons)}</span>
        <span className="muted small">
          {bytes(photo.size)}
          {photo.time ? ` · ${dateTime(photo.time)}` : ''}
        </span>
        {mark && <span className={`mark ${mark}`}>{mark === 'keep' ? `✓ ${T.sort.kept}` : `✕ ${T.sort.removed}`}</span>}
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
