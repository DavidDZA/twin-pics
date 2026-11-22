/**
 * Le tri, groupe par groupe, en plein écran. Deux façons (bouton « Affichage ») :
 * - **Grille** (PC) : tout le groupe à l'écran, la suggestion déjà gardée ; un clic sur une photo la garde ou la
 *   supprime ; touches 1 à 9 et Entrée ;
 * - **Duels** (téléphone) : deux photos à la fois, on touche celle qu'on préfère ; la gagnante affronte la suivante.
 *   À la fin, le résumé du groupe (la grille) permet d'en garder plusieurs, ou aucune, avant de valider. Un groupe de
 *   deux photos va directement au résumé (un duel n'apporterait rien de plus).
 * Chaque photo a un bouton « Plein écran » (la visionneuse, flèches pour passer aux autres photos du groupe).
 * Rien n'est supprimé ici : les choix sont retenus, la suppression se fait à la fin (`RemoveDialog`).
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, bytes, dateTime } from '../i18n';
import type { Group, PhotoInfo } from '../lib/groups';
import type { FoundFile } from '../lib/files';
import { folderOf } from '../lib/filetypes';
import { shortPath } from '../lib/display';
import {
  allAs,
  challenger,
  duelDone,
  initialChoice,
  isSorted,
  onlyKeep,
  pickWinner,
  startDuel,
  suggestionOnly,
  toggle,
  type Choice,
  type Duel,
  type Mark,
  type Pending,
} from '../lib/choices';
import { PhotoImage } from './PhotoImage';
import { likenessText, photoDetails } from './photoText';
import { useThumbs } from './useThumbs';
import { useView, type SortView } from './useView';
import { Viewer } from './Viewer';

/** Au-delà, la grille montre les miniatures (une photo de 12 Mpx décodée occupe ≈ 48 Mo). */
const FULL_IMAGES_MAX = 12;

interface Props {
  groups: Group[];
  start: number;
  photos: PhotoInfo[];
  files: Map<string, FoundFile>;
  marks: ReadonlyMap<string, Mark>;
  pending: Pending;
  onSave: (group: Group, choice: Choice) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function Sorter({ groups, start, photos, files, marks, pending, onSave, onRemove, onClose }: Props) {
  const [index, setIndex] = useState(start);
  const [view, setView] = useView();
  /** Groupes passés pendant ce tri : proposés à la fin. */
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const nextUnsorted = (from: number, sortedNow?: string) => {
    for (let i = from; i < groups.length; i++) {
      const g = groups[i];
      if (g.id !== sortedNow && !isSorted(g, photos, marks) && !skipped.has(g.id)) return i;
    }
    return groups.length;
  };

  const validate = (group: Group, choice: Choice) => {
    onSave(group, choice);
    setSkipped((s) => {
      const n = new Set(s);
      n.delete(group.id);
      return n;
    });
    setIndex(nextUnsorted(index + 1, group.id));
  };
  const skip = (group: Group) => {
    setSkipped((s) => new Set(s).add(group.id));
    setIndex(index + 1);
  };

  const group = groups[index] as Group | undefined;
  const unsortedLeft = groups.filter((g) => !isSorted(g, photos, marks)).length;

  return createPortal(
    <div className="sorter" role="dialog" aria-modal="true" aria-label={T.sort.start}>
      <div className="sorter-bar">
        <strong className="where">{group ? T.sort.groupOf(index + 1, groups.length) : T.sort.start}</strong>
        <div className="view-switch" role="group" aria-label={T.sort.view}>
          <span className="muted small">{T.sort.view}</span>
          {(['grid', 'duel'] as SortView[]).map((v) => (
            <button key={v} className={view === v ? 'toggle on' : 'toggle'} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'grid' ? T.sort.grid : T.sort.duels}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={onClose}>
          {T.sort.close}
        </button>
      </div>

      {group ? (
        <GroupSorter
          key={`${group.id}:${view}`}
          group={group}
          photos={photos}
          files={files}
          marks={marks}
          view={view}
          hasPrev={index > 0}
          onPrev={() => setIndex(index - 1)}
          onSkip={() => skip(group)}
          onValidate={(choice) => validate(group, choice)}
        />
      ) : (
        <div className="sorter-end">
          <div className="celebrate" aria-hidden="true">
            {unsortedLeft ? '👀' : '🎉'}
          </div>
          <p className="lead">{unsortedLeft ? T.sort.endSkipped(unsortedLeft) : T.sort.done}</p>
          <p className="muted">{pending.remove.length ? T.remove.summary(pending.remove.length, bytes(pending.bytes), pending.keep, pending.plans.length) : T.sort.doneNothing}</p>
          <div className="actions-row">
            {unsortedLeft > 0 && (
              <button
                className="secondary"
                onClick={() => {
                  setSkipped(new Set());
                  const first = groups.findIndex((g) => !isSorted(g, photos, marks));
                  setIndex(first < 0 ? groups.length : first);
                }}
              >
                {T.sort.again}
              </button>
            )}
            {pending.remove.length > 0 && (
              <button className="primary danger" onClick={onRemove}>
                {T.sort.removeN(pending.remove.length, bytes(pending.bytes))}
              </button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

interface GroupProps {
  group: Group;
  photos: PhotoInfo[];
  files: Map<string, FoundFile>;
  marks: ReadonlyMap<string, Mark>;
  view: SortView;
  hasPrev: boolean;
  onPrev: () => void;
  onSkip: () => void;
  onValidate: (choice: Choice) => void;
}

function GroupSorter({ group, photos, files, marks, view, hasPrev, onPrev, onSkip, onValidate }: GroupProps) {
  const [choice, setChoice] = useState<Choice>(() => initialChoice(group, photos, marks));
  const canDuel = group.members.length > 2;
  const [duel, setDuel] = useState<Duel | null>(() => (view === 'duel' && canDuel && !isSorted(group, photos, marks) ? startDuel(group) : null));
  const [viewing, setViewing] = useState<number | null>(null);
  const keys = useMemo(() => group.members.map((i) => photos[i].key), [group, photos]);
  const thumbs = useThumbs(keys);
  const inDuel = duel !== null && !duelDone(duel);

  const keep = group.members.filter((i) => choice[photos[i].key] === 'keep').length;
  const remove = group.members.length - keep;

  useEffect(() => {
    if (inDuel || viewing !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= Math.min(9, group.members.length)) {
        e.preventDefault();
        setChoice((c) => toggle(c, photos[group.members[n - 1]].key));
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onValidate(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inDuel, viewing, group, photos, choice, onValidate]);

  const pick = (winner: number) => {
    const next = pickWinner(duel!, winner);
    setDuel(next);
    if (duelDone(next)) setChoice(onlyKeep(group, photos, next.champion));
  };

  const head = (
    <div className="sorter-head">
      <span className={`chip ${group.kind}`}>{T.results.kinds[group.kind]}</span>
      <span>{T.group.photos(group.members.length)}</span>
      <span className="muted">{photos[group.members[0]].time ? dateTime(photos[group.members[0]].time!) : T.group.noDate}</span>
      {inDuel ? (
        <span className="muted">{T.sort.duelOf(duel!.next, group.members.length - 1)}</span>
      ) : (
        <span className="muted" data-testid="counts">
          {T.sort.counts(keep, remove)}
        </span>
      )}
    </div>
  );

  const viewer =
    viewing !== null ? (
      <Viewer
        group={group}
        start={viewing}
        photos={photos}
        files={files}
        onClose={() => setViewing(null)}
        choice={inDuel ? undefined : choice}
        onToggle={inDuel ? undefined : (key) => setChoice((c) => toggle(c, key))}
      />
    ) : null;

  if (inDuel) {
    const pair = [duel!.champion, challenger(duel!)];
    return (
      <div className="sorter-body duel">
        {head}
        <p className="muted small hint">{T.sort.duelHelp}</p>
        <ul className="duel-photos">
          <li className="vs" aria-hidden="true">
            VS
          </li>
          {pair.map((i) => {
            const p = photos[i];
            const n = group.members.indexOf(i);
            return (
              <li key={p.key}>
                <div className="photo-wrap">
                  <button className="duel-photo" onClick={() => pick(i)} aria-label={p.name}>
                    <PhotoImage file={files.get(p.key)} thumb={thumbs.get(p.key)} full />
                    {i === group.best && (
                      <span className="badge">
                        {T.group.suggestion} · {T.group.reasons[group.reason]}
                      </span>
                    )}
                  </button>
                  <FullButton onClick={() => setViewing(n)} />
                </div>
                <div className="duel-meta">
                  <span className="name" title={p.path}>
                    {p.name}
                  </span>
                  <span className="muted small">{photoDetails(p, false)}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="sorter-actions">
          <button className="secondary" onClick={onPrev} disabled={!hasPrev}>
            ‹ {T.sort.prev}
          </button>
          <button className="secondary" onClick={onSkip}>
            {T.sort.skip} ›
          </button>
        </div>
        {viewer}
      </div>
    );
  }

  const n = group.members.length;
  const cols = n <= 2 ? 2 : n <= 4 ? (n === 3 ? 3 : 2) : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);

  return (
    <div className="sorter-body grid">
      {head}
      <p className="muted small hint">
        {T.sort.gridHelp} <span className="keys">{T.sort.keysHelp}</span>
      </p>
      <ul className="grid-photos" style={{ ['--cols' as string]: cols, ['--rows' as string]: rows }}>
        {group.members.map((i, k) => {
          const p = photos[i];
          const mark = choice[p.key];
          const like = likenessText(photos, group, i);
          return (
            <li key={p.key} className={mark} data-testid="sort-photo">
              <div className="photo-wrap">
                <button className="pick" aria-pressed={mark === 'keep'} onClick={() => setChoice((c) => toggle(c, p.key))} aria-label={`${p.name} · ${mark === 'keep' ? T.sort.kept : T.sort.removed}`}>
                  <PhotoImage file={files.get(p.key)} thumb={thumbs.get(p.key)} full={n <= FULL_IMAGES_MAX} />
                  <span className="state">{mark === 'keep' ? `✓ ${T.sort.kept}` : `✕ ${T.sort.removed}`}</span>
                  {i === group.best && (
                    <span className="badge">
                      {T.group.suggestion} · {T.group.reasons[group.reason]}
                    </span>
                  )}
                  {k < 9 && <span className="key">{k + 1}</span>}
                </button>
                <FullButton onClick={() => setViewing(k)} />
              </div>
              <div className="grid-meta">
                <span className="name" title={p.path}>
                  {p.name}
                </span>
                <span className="folder muted" title={folderOf(p.path)}>
                  {folderOf(shortPath(p.path))}
                </span>
                <span className="muted">{photoDetails(p)}</span>
                {like && <span className="like">{like}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {keep === 0 && (
        <p className="warning" role="alert">
          {T.sort.noneKept}
        </p>
      )}
      <div className="sorter-actions">
        <div className="quick">
          <button className="secondary" onClick={() => setChoice(suggestionOnly(group, photos))}>
            {T.sort.suggestionOnly}
          </button>
          <button className="secondary" onClick={() => setChoice(allAs(group, photos, 'keep'))}>
            {T.sort.keepAll}
          </button>
          <button className="secondary" onClick={() => setChoice(allAs(group, photos, 'remove'))}>
            {T.sort.removeAll}
          </button>
          {view === 'duel' && canDuel && (
            <button className="secondary" onClick={() => setDuel(startDuel(group))}>
              {T.sort.redoDuels}
            </button>
          )}
        </div>
        <div className="nav">
          <button className="secondary" onClick={onPrev} disabled={!hasPrev}>
            ‹ {T.sort.prev}
          </button>
          <button className="secondary" onClick={onSkip}>
            {T.sort.skip}
          </button>
          <button className="primary" onClick={() => onValidate(choice)}>
            {T.sort.validate} ›
          </button>
        </div>
      </div>
      {viewer}
    </div>
  );
}

/** Bouton « Plein écran » posé sur la photo (la visionneuse). */
function FullButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="full-btn" onClick={onClick}>
      <span aria-hidden="true">⤢</span> {T.sort.zoom}
    </button>
  );
}
