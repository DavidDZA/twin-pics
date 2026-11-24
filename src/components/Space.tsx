/**
 * Une des deux fonctions : les **doublons** ou les **photos inutiles**. Chacune a sa page, ses réglages, son tri, sa
 * suppression et ses choix (`Results` les garde, avec la barre du haut qui passe de l'une à l'autre).
 */
import { useState, type ReactNode } from 'react';
import { T, bytes, num } from '../i18n';
import type { DupKind, Group, PhotoInfo } from '../lib/groups';
import type { FoundFile } from '../lib/files';
import { exactCleanup, isSorted, type Choice, type Mark, type Pending } from '../lib/choices';
import { GroupCard } from './GroupCard';
import { Sorter } from './Sorter';
import { Viewer } from './Viewer';

export type Fn = 'dup' | 'junk';

const PAGE = 30;
const KINDS: DupKind[] = ['exact', 'near', 'similar'];

interface Props {
  fn: Fn;
  /** Groupes proposés, et ceux mis de côté. */
  groups: Group[];
  ignored: Group[];
  photos: PhotoInfo[];
  files: Map<string, FoundFile>;
  marks: ReadonlyMap<string, Mark>;
  pending: Pending;
  settings: ReactNode;
  report: ReactNode;
  onSave: (group: Group, choice: Choice) => void;
  onIgnore: (group: Group) => void;
  onRestore: (group: Group) => void;
  /** « Effacer mes choix des doublons… » : absent s'il n'y en a pas. */
  onReset?: () => void;
  /** Ouvre « Avant de supprimer » ; `exact` : toutes les copies exactes, sans les trier. */
  onRemove: (exact?: Pending) => void;
}

export function Space({ fn, groups, ignored, photos, files, marks, pending, settings, report, onSave, onIgnore, onRestore, onReset, onRemove }: Props) {
  const [tab, setTab] = useState<DupKind | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const [viewing, setViewing] = useState<{ group: Group; index: number } | null>(null);
  const [sorting, setSorting] = useState<{ groups: Group[]; start: number; review: boolean } | null>(null);

  const isJunk = fn === 'junk';
  const visible = tab === 'all' ? groups : groups.filter((g) => g.kind === tab);
  const p = progress(fn, visible, photos, marks);
  const { extra, wasted } = totals(fn, visible);
  const exact = isJunk ? null : exactCleanup(groups, photos, marks);
  const marksOf = (g: Group) => g.members.map((i) => marks.get(photos[i].key));

  const startSorting = (start?: number) => {
    const first = start ?? visible.findIndex((g) => !isSorted(g, photos, marks));
    setSorting({ groups: visible, start: Math.max(0, first), review: first < 0 });
  };
  const allSorted = p.done === p.total;

  return (
    <div className="space" data-testid={`space-${fn}`}>
      <div className="tiles three">
        <div className="tile">
          <strong>{num(visible.length)}</strong>
          <span>{T.results.groups}</span>
        </div>
        <div className="tile">
          <strong>{num(extra)}</strong>
          <span>{isJunk ? T.results.junkExtra : T.results.extra}</span>
        </div>
        <div className="tile">
          <strong>{bytes(wasted)}</strong>
          <span>{T.results.space}</span>
        </div>
      </div>

      {report}

      {(visible.length > 0 || pending.remove.length > 0) && (
        <div className="sort-bar">
          <span className="sort-status">
            <span data-testid="sort-progress">{p.text}</span>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${p.total ? (100 * p.done) / p.total : 100}%` }} />
            </span>
          </span>
          {visible.length > 0 && (
            <button className={allSorted ? 'secondary' : 'primary'} onClick={() => startSorting()}>
              {allSorted ? T.sort.review : p.done ? T.sort.resume : isJunk ? T.sort.startJunk : T.sort.start}
            </button>
          )}
          {pending.remove.length > 0 && (
            <button className="primary danger" onClick={() => onRemove()}>
              {T.sort.removeN(pending.remove.length, bytes(pending.bytes))}
            </button>
          )}
        </div>
      )}

      {(onReset || (exact && exact.remove.length > 0)) && (
        <div className="actions-row">
          {exact && exact.remove.length > 0 && (
            <button className="secondary" onClick={() => onRemove(exact)}>
              {T.exact.button(exact.remove.length, bytes(exact.bytes))}
            </button>
          )}
          {onReset && (
            <button className="secondary" onClick={onReset}>
              {isJunk ? T.reset.buttonJunk : T.reset.buttonDup}
            </button>
          )}
        </div>
      )}

      {settings}

      {!isJunk && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'all'} onClick={() => (setTab('all'), setShown(PAGE))}>
            {T.results.all} <span className="n">{num(groups.length)}</span>
          </button>
          {KINDS.map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => (setTab(k), setShown(PAGE))}>
              {T.results.kinds[k]} <span className="n">{num(groups.filter((g) => g.kind === k).length)}</span>
            </button>
          ))}
        </div>
      )}
      {(isJunk || tab !== 'all') && <p className="muted small">{T.results.kindHelp[isJunk ? 'junk' : (tab as DupKind)]}</p>}

      {visible.length === 0 ? (
        <p className="empty">{ignored.length > 0 ? T.results.noneLeft : isJunk ? T.results.noneJunk : T.results.none}</p>
      ) : (
        <div className="groups">
          {visible.slice(0, shown).map((g, i) => (
            <GroupCard
              key={g.id}
              group={g}
              photos={photos}
              marks={marksOf(g)}
              onOpen={(index) => setViewing({ group: g, index })}
              onSort={() => startSorting(i)}
              onIgnore={() => onIgnore(g)}
            />
          ))}
          {visible.length > shown && (
            <button className="secondary more" onClick={() => setShown(shown + PAGE)}>
              {T.results.more}
            </button>
          )}
        </div>
      )}

      {ignored.length > 0 && (
        <details className="settings ignored" data-testid="ignored">
          <summary>{T.ignored.title(ignored.length)}</summary>
          <p className="muted small">{isJunk ? T.ignored.helpJunk : T.ignored.help}</p>
          <div className="groups">
            {ignored.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                photos={photos}
                onOpen={(index) => setViewing({ group: g, index })}
                onSort={() => undefined}
                onIgnore={() => undefined}
                onRestore={() => onRestore(g)}
              />
            ))}
          </div>
        </details>
      )}

      {viewing && <Viewer group={viewing.group} start={viewing.index} photos={photos} files={files} onClose={() => setViewing(null)} />}
      {sorting && (
        <Sorter
          groups={sorting.groups}
          start={sorting.start}
          review={sorting.review}
          photos={photos}
          files={files}
          marks={marks}
          pending={pending}
          onSave={onSave}
          onIgnore={onIgnore}
          onRemove={() => (setSorting(null), onRemove())}
          onClose={() => setSorting(null)}
        />
      )}
    </div>
  );
}

/** Où en est le tri : doublons, en groupes ; photos inutiles, en photos. */
function progress(fn: Fn, groups: Group[], photos: PhotoInfo[], marks: ReadonlyMap<string, Mark>): { done: number; total: number; text: string } {
  if (fn === 'dup') {
    const done = groups.filter((g) => isSorted(g, photos, marks)).length;
    return { done, total: groups.length, text: T.sort.progress(done, groups.length) };
  }
  const all = groups.flatMap((g) => g.members);
  const done = all.filter((i) => marks.has(photos[i].key)).length;
  return { done, total: all.length, text: T.sort.progressPhotos(done, all.length) };
}

/** Photos en trop (doublons : toutes sauf une par groupe) et place récupérable. */
export function totals(fn: Fn, groups: Group[]): { extra: number; wasted: number } {
  return {
    extra: groups.reduce((s, g) => s + g.members.length - (fn === 'junk' ? 0 : 1), 0),
    wasted: groups.reduce((s, g) => s + g.wasted, 0),
  };
}
