import { memo } from 'react';
import { T, bytes, dateTime } from '../i18n';
import { likeness, type Group, type PhotoInfo } from '../lib/groups';
import { folderOf } from '../lib/files';
import type { Verdict } from '../lib/db';
import { useThumbs } from './useThumbs';

interface Props {
  group: Group;
  photos: PhotoInfo[];
  verdict?: Verdict;
  onVerdict: (v: Verdict | null) => void;
  onOpen: (index: number) => void;
}

/** Ressemblance affichée sous une photo : avec la suggestion du groupe. */
function likenessText(photos: PhotoInfo[], group: Group, i: number): string | null {
  if (i === group.best) return null;
  const a = photos[group.best];
  const b = photos[i];
  if (a.sha && a.sha === b.sha) return T.group.identical;
  const { dist, sim } = likeness(photos, group.best, i);
  if (group.kind === 'similar' && sim !== undefined) return T.group.sim(Math.round(sim * 100));
  return dist !== undefined ? T.group.dist(dist) : null;
}

export const GroupCard = memo(function GroupCard({ group, photos, verdict, onVerdict, onOpen }: Props) {
  const thumbs = useThumbs(group.members.map((i) => photos[i].key));
  const first = photos[group.members[0]];

  return (
    <article className={`group kind-${group.kind}`} data-testid="group" data-kind={group.kind}>
      <header>
        <span className={`chip ${group.kind}`}>{T.results.kinds[group.kind]}</span>
        <span>{T.group.photos(group.members.length)}</span>
        <span className="muted">{first.time ? dateTime(first.time) : T.group.noDate}</span>
        <span className="muted">{T.group.wasted(bytes(group.wasted))}</span>
      </header>
      <ul className="photos">
        {group.members.map((i, n) => {
          const p = photos[i];
          const like = likenessText(photos, group, i);
          return (
            <li key={p.key} className={i === group.best ? 'best' : undefined}>
              <button className="thumb" onClick={() => onOpen(n)} aria-label={p.name}>
                {thumbs.get(p.key) ? <img src={thumbs.get(p.key)} alt="" loading="lazy" /> : <span className="placeholder" />}
                {i === group.best && (
                  <span className="badge">
                    {T.group.suggestion} · {T.group.reasons[group.reason]}
                  </span>
                )}
              </button>
              <div className="meta">
                <span className="name" title={p.path}>
                  {p.name}
                </span>
                <span className="folder muted" title={folderOf(p.path)}>
                  {folderOf(p.path)}
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
