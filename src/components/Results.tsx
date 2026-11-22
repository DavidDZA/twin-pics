/**
 * Les résultats : chiffres, tri (`Sorter`), suppression (`RemoveDialog`), réglages de la détection, groupes.
 *
 * Les photos supprimées pendant la session disparaissent des groupes (`gone`) ; le tri (« garder » / « supprimer »)
 * est retenu en base photo par photo (`marks`), jusqu'à la suppression.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { T, bytes, duration, num } from '../i18n';
import { buildGroups, DEFAULTS, type Group, type Kind, type Params } from '../lib/groups';
import { db, type LabelRow, type MarkRow, type Verdict } from '../lib/db';
import { isSorted, pendingRemoval, type Choice, type Mark } from '../lib/choices';
import type { ScanResult } from '../lib/scan';
import { desktop, readRemoveSettings, removeFolder, saveRemoveSettings, type Move, type RemoveMode, type RemoveSettings } from '../platform';
import { setDisplayRoot } from '../lib/display';
import { GroupCard } from './GroupCard';
import { RemoveDialog } from './RemoveDialog';
import { SettingsPanel } from './SettingsPanel';
import { Sorter } from './Sorter';
import { Viewer } from './Viewer';

const PARAMS_KEY = 'detect-params';
const PAGE = 30;
const KINDS: Kind[] = ['exact', 'near', 'similar'];
/** Photos envoyées à l'appli PC à la fois (pour suivre la progression). */
const REMOVE_BATCH = 20;

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

/** Ce qu'a donné la dernière suppression. */
interface Report {
  mode: RemoveMode;
  folder: string;
  done: number;
  bytes: number;
  /** Mode dossier : de quoi annuler (clé de la photo, où elle est, sa place d'origine). */
  moves: (Move & { key: string })[];
  failedTrash: number;
  failedMissing: number;
  failedOther: number;
  undone?: number;
}

interface Props {
  result: ScanResult;
  onRescan?: () => void;
  canRescan: boolean;
  onAnother: () => void;
  /** Dossier analysé, dans l'appli PC (pour supprimer) ; `null` sur le site. */
  root: string | null;
}

export function Results({ result, onRescan, canRescan, onAnother, root }: Props) {
  const [params, setParamsState] = useState<Params>(readParams);
  const [tab, setTab] = useState<Kind | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const [labels, setLabels] = useState<Map<string, LabelRow>>(new Map());
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<{ group: Group; index: number } | null>(null);
  const [sorting, setSorting] = useState<{ groups: Group[]; start: number } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [working, setWorking] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [removeSettings, setRemoveSettingsState] = useState<RemoveSettings>(readRemoveSettings);
  const { photos } = result;
  setDisplayRoot(root);

  const setParams = (p: Params) => {
    setParamsState(p);
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify(p));
    } catch {
      // Réglages non retenus.
    }
  };
  const setRemoveSettings = (s: RemoveSettings) => {
    setRemoveSettingsState(s);
    saveRemoveSettings(s);
  };

  useEffect(() => {
    db.labels.toArray().then((rows) => setLabels(new Map(rows.map((r) => [r.groupId, r]))));
    db.marks.toArray().then((rows) => setMarks(new Map(rows.map((r) => [r.key, r.mark]))));
  }, []);

  const pairs = useMemo(() => (gone.size ? result.pairs.filter((p) => !gone.has(photos[p.a].key) && !gone.has(photos[p.b].key)) : result.pairs), [result, photos, gone]);
  const groups = useMemo(() => buildGroups(photos, pairs, params), [photos, pairs, params]);
  const counts = useMemo(() => {
    const c: Record<Kind, number> = { exact: 0, near: 0, similar: 0 };
    for (const g of groups) c[g.kind]++;
    return c;
  }, [groups]);
  const visible = tab === 'all' ? groups : groups.filter((g) => g.kind === tab);
  const extra = visible.reduce((s, g) => s + g.members.length - 1, 0);
  const wasted = visible.reduce((s, g) => s + g.wasted, 0);
  const pending = useMemo(() => pendingRemoval(groups, photos, marks), [groups, photos, marks]);
  const sortedCount = pending.sorted;

  const verdicts = [...labels.values()];
  const good = verdicts.filter((l) => l.verdict === 'good').length;
  const wrong = verdicts.length - good;

  const label = async (group: Group, verdict: Verdict | null) => {
    const next = new Map(labels);
    if (verdict === null) {
      next.delete(group.id);
      await db.labels.delete(group.id);
    } else {
      const row: LabelRow = { groupId: group.id, verdict, kind: group.kind, keys: group.members.map((i) => photos[i].key), params, at: Date.now() };
      next.set(group.id, row);
      await db.labels.put(row);
    }
    setLabels(next);
  };

  const saveChoice = useCallback((group: Group, choice: Choice) => {
    const at = Date.now();
    const rows: MarkRow[] = Object.entries(choice).map(([key, mark]) => ({ key, mark, groupId: group.id, at }));
    setMarks((m) => {
      const n = new Map(m);
      for (const r of rows) n.set(r.key, r.mark);
      return n;
    });
    void db.marks.bulkPut(rows);
  }, []);

  const startSorting = (queue: Group[], start?: number) => {
    const first = start ?? queue.findIndex((g) => !isSorted(g, photos, marks));
    setSorting({ groups: queue, start: first < 0 ? queue.length : first });
  };

  const remove = async () => {
    if (!desktop || !root) return;
    const targets = pending.remove.map((i) => photos[i]);
    const byPath = new Map(targets.map((p) => [p.path, p]));
    const folder = removeFolder(removeSettings, root, T.remove.folderName);
    const r: Report = { mode: removeSettings.mode, folder, done: 0, bytes: 0, moves: [], failedTrash: 0, failedMissing: 0, failedOther: 0 };
    const removed: string[] = [];
    setWorking({ done: 0, total: targets.length });
    try {
      for (let i = 0; i < targets.length; i += REMOVE_BATCH) {
        const batch = targets.slice(i, i + REMOVE_BATCH);
        const outcomes = await desktop.remove({ root, paths: batch.map((p) => p.path), mode: removeSettings.mode, folder });
        for (const o of outcomes) {
          const p = byPath.get(o.path)!;
          if (o.ok) {
            r.done++;
            r.bytes += p.size;
            removed.push(p.key);
            if (o.movedTo) r.moves.push({ key: p.key, from: o.movedTo, to: o.path });
          } else if (o.error === 'trash') r.failedTrash++;
          else if (o.error === 'missing') {
            r.failedMissing++;
            removed.push(p.key); // Plus là : il ne doit plus apparaître.
          } else r.failedOther++;
        }
        setWorking({ done: Math.min(i + REMOVE_BATCH, targets.length), total: targets.length });
      }
    } finally {
      setGone((g) => new Set([...g, ...removed]));
      setMarks((m) => {
        const n = new Map(m);
        for (const k of removed) n.delete(k);
        return n;
      });
      void db.marks.bulkDelete(removed);
      setWorking(null);
      setRemoving(false);
      setReport(r);
    }
  };

  const undo = async () => {
    if (!desktop || !report) return;
    const outcomes = await desktop.restore(report.moves.map(({ from, to }) => ({ from, to })));
    const back = new Set(report.moves.filter((m) => outcomes.some((o) => o.ok && o.path === m.to)).map((m) => m.key));
    setGone((g) => new Set([...g].filter((k) => !back.has(k))));
    setReport({ ...report, moves: [], undone: back.size });
  };

  const skipped = result.unreadable + result.unsupported + result.videos;
  const marksOf = (g: Group) => g.members.map((i) => marks.get(photos[i].key));

  return (
    <section className="results">
      <div className="tiles">
        <div className="tile">
          <strong>{num(photos.length - gone.size)}</strong>
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

      {report && <RemoveReport report={report} onUndo={undo} onClose={() => setReport(null)} />}

      {groups.length > 0 && (
        <div className="sort-bar">
          <span data-testid="sort-progress">{T.sort.progress(sortedCount, groups.length)}</span>
          <button className="primary" onClick={() => startSorting(visible)}>
            {sortedCount ? T.sort.resume : T.sort.start}
          </button>
          {pending.remove.length > 0 && (
            <button className="primary danger" onClick={() => setRemoving(true)}>
              {T.sort.removeN(pending.remove.length, bytes(pending.bytes))}
            </button>
          )}
        </div>
      )}

      <p className="muted small">
        {T.results.elapsed(duration(result.seconds), result.analyzed)}
        {skipped > 0 && <> {T.results.skipped(result.unreadable, result.unsupported, result.videos)}</>}
        {result.device && <> {T.results.device(result.device === 'webgpu')}</>}
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
          {visible.slice(0, shown).map((g, i) => (
            <GroupCard
              key={g.id}
              group={g}
              photos={photos}
              verdict={labels.get(g.id)?.verdict}
              marks={marksOf(g)}
              onVerdict={(v) => label(g, v)}
              onOpen={(index) => setViewing({ group: g, index })}
              onSort={() => startSorting(visible, i)}
            />
          ))}
          {visible.length > shown && (
            <button className="secondary more" onClick={() => setShown(shown + PAGE)}>
              {T.results.more}
            </button>
          )}
        </div>
      )}

      {viewing && <Viewer group={viewing.group} start={viewing.index} photos={photos} files={result.files} onClose={() => setViewing(null)} />}
      {sorting && (
        <Sorter
          groups={sorting.groups}
          start={sorting.start}
          photos={photos}
          files={result.files}
          marks={marks}
          pending={pending}
          onSave={saveChoice}
          onRemove={() => (setSorting(null), setRemoving(true))}
          onClose={() => setSorting(null)}
        />
      )}
      {removing && (
        <RemoveDialog
          pending={pending}
          photos={photos}
          root={root}
          settings={removeSettings}
          onSettings={setRemoveSettings}
          working={working}
          onCancel={() => setRemoving(false)}
          onConfirm={remove}
        />
      )}
    </section>
  );
}

function RemoveReport({ report, onUndo, onClose }: { report: Report; onUndo: () => void; onClose: () => void }) {
  return (
    <div className="report" role="status" data-testid="remove-report">
      {report.done > 0 && (
        <p>
          <strong>{T.remove.done(report.done, bytes(report.bytes))}</strong> {report.mode === 'trash' ? T.remove.doneTrash : T.remove.doneFolder(report.folder)}
        </p>
      )}
      {report.failedTrash > 0 && <p className="warning">{T.remove.failedTrash(report.failedTrash)}</p>}
      {report.failedMissing > 0 && <p className="muted">{T.remove.failedMissing(report.failedMissing)}</p>}
      {report.failedOther > 0 && <p className="warning">{T.remove.failedOther(report.failedOther)}</p>}
      {report.undone !== undefined && <p>{T.remove.undone(report.undone)}</p>}
      <div className="actions-row">
        {report.mode === 'folder' && report.done > 0 && (
          <button className="secondary" onClick={() => desktop?.showInFolder(report.folder)}>
            {T.remove.openFolder}
          </button>
        )}
        {report.moves.length > 0 && (
          <button className="secondary" onClick={onUndo}>
            {T.remove.undo}
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          {T.remove.close}
        </button>
      </div>
    </div>
  );
}
