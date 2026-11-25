import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, bytes, day, num } from '../i18n';
import { BADGES, FAMILIES, measure, type Earned, type Stats } from '../lib/stats';
import { readStats } from '../lib/statsStore';
import { useBack } from '../lib/back';

/** Stats (depuis la version 0.5) et les cinquante badges, ouverts depuis le haut de l'appli. */
export function StatsDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ stats: Stats; earned: Earned } | null>(null);

  useBack(onClose);
  useEffect(() => {
    void readStats().then(setData);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal stats" role="dialog" aria-modal="true" aria-labelledby="stats-title">
        <h2 id="stats-title">{T.stats.title}</h2>
        {data && <StatsBody stats={data.stats} earned={data.earned} />}
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            {T.viewer.close}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatsBody({ stats, earned }: { stats: Stats; earned: Earned }) {
  const won = BADGES.filter((b) => earned[b.id]).length;
  return (
    <div className="stats-scroll">
      <dl className="stat-list">
        <Line label={T.stats.what.analyzed} value={num(stats.analyzed)} />
        <Line label={T.stats.what.sorted} value={num(stats.sorted)} />
        <Line label={T.stats.what.removed} value={num(stats.removedDup + stats.removedJunk)} />
        <Line label={T.stats.what.freed} value={bytes(stats.freed)} />
      </dl>
      <p className="muted small">{T.stats.split(num(stats.removedDup), num(stats.removedJunk))}</p>
      <p className="badge-count" data-testid="badge-count">
        {T.stats.count(won, BADGES.length)}
      </p>
      {FAMILIES.map((f) => (
        <section key={f}>
          <h3>{T.stats.families[f]}</h3>
          <ul className="badges">
            {BADGES.filter((b) => b.family === f).map((b) => (
              <BadgeRow key={b.id} badge={b} stats={stats} at={earned[b.id]} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BadgeRow({ badge, stats, at }: { badge: (typeof BADGES)[number]; stats: Stats; at?: number }) {
  const value = Math.min(badge.goal, measure(stats, badge.of));
  const show = badge.of === 'freed' ? (n: number) => bytes(n) : num;
  return (
    <li className={at ? 'badge-row won' : 'badge-row'} data-testid={`badge-${badge.id}`}>
      <span className="medal" aria-hidden="true">
        {badge.emoji}
      </span>
      <div>
        <strong>{T.stats.names[badge.id]}</strong>
        {at ? (
          <span className="muted small">
            {show(badge.goal)} {T.stats.what[badge.of]}
          </span>
        ) : (
          <>
            <span className="meter" aria-hidden="true">
              <span style={{ width: `${(100 * value) / badge.goal}%` }} />
            </span>
            <span className="muted small">
              {show(value)} / {show(badge.goal)} {T.stats.what[badge.of]}
            </span>
          </>
        )}
        {at && <span className="won-on small">{T.stats.wonOn(day(at))}</span>}
      </div>
    </li>
  );
}
