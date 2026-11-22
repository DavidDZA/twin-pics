import { memo } from 'react';
import { T, bytes, dateTime } from '../i18n';
import type { Group, PhotoInfo } from '../lib/groups';
import { folderOf } from '../lib/filetypes';
import { shortPath } from '../lib/display';
import type { Verdict } from '../lib/db';
import type { Mark } from '../lib/choices';
import { likenessText } from './photoText';
import { useThumbs } from './useThumbs';

interface Props {
  group: Group;
  photos: PhotoInfo[];
  verdict?: Verdict;
  /** Le tri de chaque photo du groupe (clé → garder / supprimer), s'il est fait. */
  marks?: (Mark | undefined)[];
  onVerdict: (v: Verdict | null) => void;
  onOpen: (index: number) => void;
  onSort: () => void;
}

export const GroupCard = memo(function GroupCard({ group, photos, verdict, marks, onVerdict, onOpen, onSort }: Props) {
  const thumbs = useThumbs(group.members.map((i) => photos[i].key));
  const first = photos[group.members[0]];
  const sorted = !!marks && marks.every(Boolean);

  return (
    <article className={`group kind-${group.kind}${sorted ? ' sorted' : ''}`} data-testid="group" data-kind={group.kind}>
      <header>
        <span className={`chip ${group.kind}`}>{T.results.kinds[group.kind]}</span>
        <span>{T.group.photos(group.members.length)}</span>
        <span className="muted">{first.time ? dateTime(first.time) : T.group.noDate}</span>
        <span className="muted">{T.group.wasted(bytes(group.wasted))}</span>
        {sorted && <span className="chip sorted">{T.sort.sorted}</span>}
      </header>
      <ul className="photos">
        {group.members.map((i, n) => {
          const p = photos[i];
          const like = likenessText(photos, group, i);
          const mark = sorted ? marks![n] : undefined;
          return (
            <li key={p.key} className={[i === group.best ? 'best' : '', mark ?? ''].join(' ').trim() || undefined}>
              <button className="thumb" onClick={() => onOpen(n)} aria-label={p.name}>
                {thumbs.get(p.key) ? <img src={thumbs.get(p.key)} alt="" loading="lazy" /> : <span className="placeholder" />}
                {i === group.best && (
                  <span className="badge">
                    {T.group.suggestion} · {T.group.reasons[group.reason]}
                  </span>
                )}
              </button>
              <div className="meta">
                {mark && <span className={`mark ${mark}`}>{mark === 'keep' ? `✓ ${T.sort.kept}` : `✕ ${T.sort.removed}`}</span>}
                <span className="name" title={p.path}>
                  {p.name}
                </span>
                <span className="folder muted" title={folderOf(p.path)}>
                  {folderOf(shortPath(p.path))}
                </span>
                <span className="muted">
                  {p.width && p.height ? `${p.width} × ${p.height} · ` : ''}
                  {bytes(p.size)}
                </span>
                {like && <span className="like">{like}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <footer>
        <button className={sorted ? 'secondary' : 'primary'} onClick={onSort}>
          {sorted ? T.sort.edit : T.sort.sortThis}
        </button>
        <span className="spacer" />
        <span className="muted">{T.group.verdict}</span>
        <button className={verdict === 'good' ? 'toggle on good' : 'toggle'} aria-pressed={verdict === 'good'} onClick={() => onVerdict(verdict === 'good' ? null : 'good')}>
          {T.group.good}
        </button>
        <button className={verdict === 'wrong' ? 'toggle on wrong' : 'toggle'} aria-pressed={verdict === 'wrong'} onClick={() => onVerdict(verdict === 'wrong' ? null : 'wrong')}>
          {T.group.wrong}
        </button>
      </footer>
    </article>
  );
});
