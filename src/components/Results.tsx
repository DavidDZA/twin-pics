import { useEffect, useMemo, useState } from 'react';
import { T, bytes, duration, num } from '../i18n';
import { buildGroups, DEFAULTS, type Group, type Kind, type Params } from '../lib/groups';
import { db, type LabelRow, type Verdict } from '../lib/db';
import type { ScanResult } from '../lib/scan';
import { GroupCard } from './GroupCard';
import { SettingsPanel } from './SettingsPanel';
import { Viewer } from './Viewer';

const PARAMS_KEY = 'detect-params';
const PAGE = 30;
const KINDS: Kind[] = ['exact', 'near', 'similar'];

function readParams(): Params {
  try {
    const raw = JSON.parse(localStorage.getItem(PARAMS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const p = { ...DEFAULTS };
      for (const k of Object.keys(DEFAULTS) as (keyof Params)[]) if (typeof raw[k] === 'number') p[k] = raw[k];
      return p;
    }
  } catch {
    // Réglages abîmés : ceux par défaut.
  }
  return { ...DEFAULTS };
}

interface Props {
  result: ScanResult;
  onRescan?: () => void;
  canRescan: boolean;
  onAnother: () => void;
}

export function Results({ result, onRescan, canRescan, onAnother }: Props) {
  const [params, setParamsState] = useState<Params>(readParams);
  const [tab, setTab] = useState<Kind | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const [labels, setLabels] = useState<Map<string, LabelRow>>(new Map());
  const [viewing, setViewing] = useState<{ group: Group; index: number } | null>(null);

  const setParams = (p: Params) => {
    setParamsState(p);
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(p));
    } catch {
      // Réglages non retenus.
    }
  };

  useEffect(() => {
    db.labels.toArray().then((rows) => setLabels(new Map(rows.map((r) => [r.groupId, r]))));
  }, []);

  const groups = useMemo(() => buildGroups(result.photos, result.pairs, params), [result, params]);
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { exact: 0, near: 0, similar: 0 };
    for (const g of groups) c[g.kind]++;
    return c;
  }, [groups]);
  const visible = tab === 'all' ? groups : groups.filter((g) => g.kind === tab);
  const extra = visible.reduce((s, g) => s + g.members.length - 1, 0);
  const wasted = visible.reduce((s, g) => s + g.wasted, 0);

  const verdicts = [...labels.values()];
  const good = verdicts.filter((l) => l.verdict === 'good').length;
  const wrong = verdicts.length - good;

  const label = async (group: Group, verdict: Verdict | null) => {
    const next = new Map(labels);
    if (verdict === null) {
      next.delete(group.id);
      await db.labels.delete(group.id);
    } else {
      const row: LabelRow = { groupId: group.id, verdict, kind: group.kind, keys: group.members.map((i) => result.photos[i].key), params, at: Date.now() };
      next.set(group.id, row);
      await db.labels.put(row);
    }
    setLabels(next);
  };

  const skipped = result.unreadable + result.unsupported + result.videos;

  return (
    <section className="results">
      <div className="tiles">
        <div className="tile">
          <strong>{num(result.photos.length)}</strong>
          <span>{T.results.analyzed}</span>
        </div>
        <div className="tile">
          <strong>{num(visible.length)}</strong>
          <span>{T.results.groups}</span>
        </div>
        <div className="tile">
          <strong>{num(extra)}</strong>
          <span>{T.results.extra}</span>
        </div>
        <div className="tile">
          <strong>{bytes(wasted)}</strong>
          <span>{T.results.space}</span>
        </div>
      </div>

      <p className="muted small">
        {T.results.elapsed(duration(result.seconds), result.analyzed)}
        {skipped > 0 && <> {T.results.skipped(result.unreadable, result.unsupported, result.videos)}</>}
      </p>
      {result.modelError && (
        <p className="error" role="alert">
          {T.results.modelError}
        </p>
      )}

      <div className="actions-row">
        {canRescan && onRescan && (
          <button className="secondary" onClick={onRescan}>
            {T.results.rescan}
          </button>
        )}
        <button className="secondary" onClick={onAnother}>
          {T.results.another}
        </button>
      </div>

      <SettingsPanel params={params} onChange={setParams} onReset={() => setParams({ ...DEFAULTS })} />
      {verdicts.length > 0 && <p className="muted small">{T.results.verified(good, wrong)}</p>}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'all'} onClick={() => (setTab('all'), setShown(PAGE))}>
          {T.results.all} <span className="n">{num(groups.length)}</span>
        </button>
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => (setTab(k), setShown(PAGE))}>
            {T.results.kinds[k]} <span className="n">{num(counts[k])}</span>
          </button>
        ))}
      </div>
      {tab !== 'all' && <p className="muted small">{T.results.kindHelp[tab]}</p>}

      {visible.length === 0 ? (
        <p className="empty">{T.results.none}</p>
      ) : (
        <div className="groups">
          {visible.slice(0, shown).map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              photos={result.photos}
              verdict={labels.get(g.id)?.verdict}
              onVerdict={(v) => label(g, v)}
              onOpen={(index) => setViewing({ group: g, index })}
            />
          ))}
          {visible.length > shown && (
            <button className="secondary more" onClick={() => setShown(shown + PAGE)}>
              {T.results.more}
            </button>
          )}
        </div>
      )}

      {viewing && <Viewer group={viewing.group} start={viewing.index} photos={result.photos} files={result.files} onClose={() => setViewing(null)} />}
    </section>
  );
}
