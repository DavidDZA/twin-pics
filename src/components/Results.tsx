/**
 * Les résultats, une seule page. En haut : **Doublons | Photos inutiles** (deux fonctions séparées, un clic pour passer
 * de l'une à l'autre ; la dernière ouverte est retenue), « Relancer », « Autre dossier », « Effacer tous mes choix… ».
 * En dessous, la fonction choisie (`Space`), avec ses réglages, son tri, sa suppression (`RemoveDialog`) et ses propres
 * choix (`marks`, `junkMarks`).
 *
 * Les photos supprimées pendant la session disparaissent des groupes (`gone`) ; le tri est retenu en base photo par
 * photo, jusqu'à la suppression ; « Pas des doublons » / « Pas inutiles » mettent un groupe de côté (`ignored.ts`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { T, bytes, duration, num } from '../i18n';
import { buildGroups, DEFAULTS, type Group, type Params } from '../lib/groups';
import { db, type LabelRow, type MarkRow } from '../lib/db';
import { isSorted, pendingRemoval, type Choice, type Mark, type Pending } from '../lib/choices';
import { coveringLabels, ignoredKeys, splitIgnored, wrongLabels } from '../lib/ignored';
import { notify } from '../lib/notify';
import { sortedStats } from '../lib/stats';
import { addStats } from '../lib/statsStore';
import type { ScanResult } from '../lib/scan';
import { desktop, readRemoveSettings, removeFolder, saveRemoveSettings, type Move, type RemoveMode, type RemoveSettings } from '../platform';
import { setDisplayRoot } from '../lib/display';
import { buildJunkGroups, clipScores, junkReasons, JUNK_DEFAULTS, JUNK_REASONS, type JunkParams, type JunkPrompts } from '../lib/junk';
import junkPrompts from '../lib/junkPrompts.json';
import { JunkSettings } from './JunkSettings';
import { RemoveDialog } from './RemoveDialog';
import { ResetDialog } from './ResetDialog';
import { SettingsPanel } from './SettingsPanel';
import { Space, totals, type Fn } from './Space';

const PARAMS_KEY = 'detect-params';
const JUNK_KEY = 'junk-params';
/** La dernière fonction ouverte (« dup » ou « junk »). */
const SPACE_KEY = 'last-function';
const PROMPTS = junkPrompts as JunkPrompts;
/** Photos envoyées à l'appli PC à la fois (pour suivre la progression). */
const REMOVE_BATCH = 20;

const table = (fn: Fn) => (fn === 'dup' ? db.marks : db.junkMarks);
const FNS: Fn[] = ['dup', 'junk'];
type Marks = Record<Fn, Map<string, Mark>>;

function readSpace(): Fn {
  try {
    return localStorage.getItem(SPACE_KEY) === 'junk' ? 'junk' : 'dup';
  } catch {
    return 'dup';
  }
}

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

function readJunkParams(): JunkParams {
  try {
    const raw = JSON.parse(localStorage.getItem(JUNK_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const p: JunkParams = { ...JUNK_DEFAULTS, off: [] };
      for (const k of ['blurMax', 'clipMin', 'groupMin'] as const) if (typeof raw[k] === 'number') p[k] = raw[k];
      if (Array.isArray(raw.off)) p.off = raw.off.filter((r: unknown) => JUNK_REASONS.includes(r as never));
      return p;
    }
  } catch {
    // Réglages abîmés : ceux par défaut.
  }
  return { ...JUNK_DEFAULTS, off: [] };
}

/** Ce qu'a donné la dernière suppression. */
interface Report {
  fn: Fn;
  mode: RemoveMode;
  folder: string;
  done: number;
  bytes: number;
  /** Dont copies exactes (stats). */
  exact: number;
  /** Mode dossier : de quoi annuler (clé de la photo, sa taille, où elle est, sa place d'origine). */
  moves: (Move & { key: string; size: number; exact: boolean })[];
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
  const [junkParams, setJunkParamsState] = useState<JunkParams>(readJunkParams);
  const [space, setSpace] = useState<Fn>(readSpace);
  const [labels, setLabels] = useState<Map<string, LabelRow>>(new Map());
  const [marks, setMarks] = useState<Marks>({ dup: new Map(), junk: new Map() });
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<{ fn: Fn; exact: Pending | null } | null>(null);
  const [resetting, setResetting] = useState(false);
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
  const setJunkParams = (p: JunkParams) => {
    setJunkParamsState(p);
    try {
      localStorage.setItem(JUNK_KEY, JSON.stringify(p));
    } catch {
      // Réglages non retenus.
    }
  };
  const setRemoveSettings = (s: RemoveSettings) => {
    setRemoveSettingsState(s);
    saveRemoveSettings(s);
  };
  const openSpace = (fn: Fn) => {
    setSpace(fn);
    try {
      localStorage.setItem(SPACE_KEY, fn);
    } catch {
      // Dernière fonction non retenue.
    }
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const load = (rows: MarkRow[]) => new Map(rows.map((r) => [r.key, r.mark]));
    db.labels.toArray().then((rows) => setLabels(new Map(rows.map((r) => [r.groupId, r]))));
    Promise.all([db.marks.toArray(), db.junkMarks.toArray()]).then(([dup, junk]) => setMarks({ dup: load(dup), junk: load(junk) }));
  }, []);

  // Doublons.
  const pairs = useMemo(() => (gone.size ? result.pairs.filter((p) => !gone.has(photos[p.a].key) && !gone.has(photos[p.b].key)) : result.pairs), [result, photos, gone]);
  const built = useMemo(() => buildGroups(photos, pairs, params), [photos, pairs, params]);
  const dup = useMemo(() => splitIgnored(built, photos, wrongLabels(labels.values(), false)), [built, photos, labels]);

  // Photos inutiles : probabilités du modèle (une fois), raisons et groupes (à chaque réglage).
  const scores = useMemo(() => photos.map((p) => (p.clip ? clipScores(p.clip, PROMPTS) : undefined)), [photos]);
  const reasons = useMemo(() => photos.map((p, i) => junkReasons({ ...p, scores: scores[i] }, junkParams)), [photos, scores, junkParams]);
  const junk = useMemo(() => {
    const aside = ignoredKeys(wrongLabels(labels.values(), true));
    const hidden = new Set<number>();
    const kept = new Set<number>();
    photos.forEach((p, i) => {
      if (gone.has(p.key) || aside.has(p.key)) hidden.add(i);
      if (gone.has(p.key) || !aside.has(p.key)) kept.add(i);
    });
    return {
      shown: buildJunkGroups(photos, reasons, junkParams, hidden),
      ignored: aside.size ? buildJunkGroups(photos, reasons, junkParams, kept) : [],
    };
  }, [photos, reasons, junkParams, labels, gone]);
  const hasModel = useMemo(() => photos.some((p) => p.clip), [photos]);

  const groups: Record<Fn, { shown: Group[]; ignored: Group[] }> = { dup, junk };
  const pending = useMemo<Record<Fn, Pending>>(
    () => ({ dup: pendingRemoval(dup.shown, photos, marks.dup), junk: pendingRemoval(junk.shown, photos, marks.junk) }),
    [dup, junk, photos, marks],
  );

  /** Les choix à effacer d'une fonction : photos triées et groupes mis de côté de ce dossier. */
  const choicesOf = (fn: Fn) => {
    const keys = photos.filter((p) => marks[fn].has(p.key)).map((p) => p.key);
    const here = new Set(photos.map((p) => p.key));
    const rows = wrongLabels(labels.values(), fn === 'junk').filter((l) => l.keys.some((k) => here.has(k)));
    return { keys, rows };
  };
  const hasChoices = (fn: Fn) => {
    const c = choicesOf(fn);
    return c.keys.length + c.rows.length > 0;
  };
  const reset = () => {
    for (const fn of FNS) {
      const { keys, rows } = choicesOf(fn);
      dropMarks(fn, keys);
      void db.labels.bulkDelete(rows.map((r) => r.groupId));
      setLabels((m) => {
        const n = new Map(m);
        for (const r of rows) n.delete(r.groupId);
        return n;
      });
    }
    setResetting(false);
  };

  const dropMarks = (fn: Fn, keys: string[]) => {
    setMarks((m) => {
      const n = new Map(m[fn]);
      for (const k of keys) n.delete(k);
      return { ...m, [fn]: n };
    });
    void table(fn).bulkDelete(keys);
  };

  const restore = async (rows: LabelRow[]) => {
    setLabels((m) => {
      const n = new Map(m);
      for (const r of rows) n.delete(r.groupId);
      return n;
    });
    await db.labels.bulkDelete(rows.map((r) => r.groupId));
  };
  const ignore = (group: Group) => {
    const row: LabelRow = { groupId: group.id, verdict: 'wrong', kind: group.kind, keys: group.members.map((i) => photos[i].key), at: Date.now() };
    setLabels((m) => new Map(m).set(group.id, row));
    void db.labels.put(row);
    addStats({ ignored: 1 });
    notify({ text: T.ignored.done, action: { label: T.remove.undo, run: () => void restore([row]) } });
  };
  const restoreGroup = (fn: Fn, group: Group) => {
    const all = wrongLabels(labels.values(), fn === 'junk');
    const keys = new Set(group.members.map((i) => photos[i].key));
    void restore(fn === 'junk' ? all.filter((l) => l.keys.some((k) => keys.has(k))) : coveringLabels(group, photos, all));
  };

  const shown = useMemo<Record<Fn, Group[]>>(() => ({ dup: dup.shown, junk: junk.shown }), [dup, junk]);
  const saveChoice = useCallback(
    (fn: Fn, group: Group, choice: Choice) => {
      const at = Date.now();
      const rows: MarkRow[] = Object.entries(choice).map(([key, mark]) => ({ key, mark, groupId: group.id, at }));
      const before = marks[fn];
      const fresh = rows.filter((r) => !before.has(r.key));
      if (fresh.length) {
        const times = new Map(group.members.map((i) => [photos[i].key, photos[i].time]));
        const { plus, record } = sortedStats(fresh.map((r) => ({ mark: r.mark, time: times.get(r.key) })));
        if (fn === 'dup' && !isSorted(group, photos, before)) {
          const kept = rows.filter((r) => r.mark === 'keep').length;
          Object.assign(plus, { groups: 1, keptAll: kept === rows.length ? 1 : 0, noneKept: kept ? 0 : 1 });
          record.biggestGroup = rows.length;
        }
        // Dernière photo de la liste : tout est trié.
        const after = new Map([...before, ...rows.map((r) => [r.key, r.mark] as const)]);
        if (shown[fn].every((g) => isSorted(g, photos, after)) && !shown[fn].every((g) => isSorted(g, photos, before))) plus.perfect = 1;
        addStats(plus, record);
      }
      setMarks((m) => {
        const n = new Map(m[fn]);
        for (const r of rows) n.set(r.key, r.mark);
        return { ...m, [fn]: n };
      });
      void table(fn).bulkPut(rows);
    },
    [marks, photos, shown],
  );

  /** Compte (ou décompte, après « Annuler ») des photos supprimées dans les stats. */
  const countRemoved = (fn: Fn, n: number, size: number, exact: number, sign: 1 | -1) =>
    addStats(
      { [fn === 'dup' ? 'removedDup' : 'removedJunk']: sign * n, removedExact: sign * exact, freed: sign * size, ...(sign === 1 ? { removals: 1 } : { undone: n }) },
      sign === 1 ? { biggestClean: n } : {},
    );

  const remove = async () => {
    if (!desktop || !root || !removing) return;
    const { fn } = removing;
    const plan = removing.exact ?? pending[fn];
    const targets = plan.remove.map((i) => photos[i]);
    const exactKeys = new Set(plan.plans.filter((p) => p.group.kind === 'exact').flatMap((p) => p.remove.map((i) => photos[i].key)));
    const byPath = new Map(targets.map((p) => [p.path, p]));
    const folder = removeFolder(removeSettings, root, T.remove.folderName);
    const r: Report = { fn, mode: removeSettings.mode, folder, done: 0, bytes: 0, exact: 0, moves: [], failedTrash: 0, failedMissing: 0, failedOther: 0 };
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
            if (exactKeys.has(p.key)) r.exact++;
            removed.push(p.key);
            if (o.movedTo) r.moves.push({ key: p.key, size: p.size, exact: exactKeys.has(p.key), from: o.movedTo, to: o.path });
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
      dropMarks('dup', removed);
      dropMarks('junk', removed);
      if (r.done) countRemoved(fn, r.done, r.bytes, r.exact, 1);
      setWorking(null);
      setRemoving(null);
      setReport(r);
      window.scrollTo(0, 0);
    }
  };

  const undo = async () => {
    if (!desktop || !report) return;
    const outcomes = await desktop.restore(report.moves.map(({ from, to }) => ({ from, to })));
    const back = report.moves.filter((m) => outcomes.some((o) => o.ok && o.path === m.to));
    const keys = new Set(back.map((m) => m.key));
    setGone((g) => new Set([...g].filter((k) => !keys.has(k))));
    if (back.length) {
      const size = back.reduce((s, m) => s + m.size, 0);
      countRemoved(report.fn, back.length, size, back.filter((m) => m.exact).length, -1);
    }
    setReport({ ...report, moves: [], undone: back.length });
  };

  const skipped = result.unreadable + result.unsupported + result.videos;

  const reportBox = report && <RemoveReport report={report} onUndo={undo} onClose={() => setReport(null)} />;
  const toReset = resetting ? FNS.map(choicesOf) : [];

  return (
    <section className="results">
      <div className="space-head">
        <h2 className="fn-switch">
          {FNS.map((f) => (
            <button key={f} className={f === space ? `toggle on fn-${f}` : 'toggle'} aria-current={f === space ? 'page' : undefined} onClick={() => openSpace(f)}>
              {f === 'dup' ? T.home.dup : T.home.junk} <span className="n">{num(totals(f, groups[f].shown).extra)}</span>
            </button>
          ))}
        </h2>
        <span className="spacer" />
        {canRescan && onRescan && (
          <button className="secondary" onClick={onRescan}>
            {T.results.rescan}
          </button>
        )}
        <button className="secondary" onClick={onAnother}>
          {T.results.another}
        </button>
        {(hasChoices('dup') || hasChoices('junk')) && (
          <button className="secondary" onClick={() => setResetting(true)}>
            {T.reset.button}
          </button>
        )}
      </div>
      <p className="muted small scan-info">
        <strong data-testid="analyzed">{T.home.analyzed(num(photos.length - gone.size))}</strong> {T.results.elapsed(duration(result.seconds), result.analyzed)}
        {skipped > 0 && <> {T.results.skipped(result.unreadable, result.unsupported, result.videos)}</>}
        {result.device && <> {T.results.device(result.device === 'webgpu')}</>}
        {result.clipDevice && <> {T.results.clipDevice(result.clipDevice === 'webgpu')}</>}
      </p>
      {result.modelError && (
        <p className="error" role="alert">
          {T.results.modelError}
        </p>
      )}
      {result.clipError && (
        <p className="error" role="alert">
          {T.results.clipError}
        </p>
      )}
      <Space
        key={space}
        fn={space}
        groups={groups[space].shown}
        ignored={groups[space].ignored}
        photos={photos}
        files={result.files}
        marks={marks[space]}
        pending={pending[space]}
        settings={
          space === 'junk' ? (
            <JunkSettings params={junkParams} onChange={setJunkParams} hasModel={hasModel} />
          ) : (
            <SettingsPanel params={params} onChange={setParams} onReset={() => setParams({ ...DEFAULTS })} />
          )
        }
        report={report?.fn === space ? reportBox : null}
        onSave={(group, choice) => saveChoice(space, group, choice)}
        onIgnore={ignore}
        onRestore={(group) => restoreGroup(space, group)}
        onRemove={(exact) => setRemoving({ fn: space, exact: exact ?? null })}
      />

      {removing && (
        <RemoveDialog
          pending={removing.exact ?? pending[removing.fn]}
          exact={!!removing.exact}
          photos={photos}
          root={root}
          settings={removeSettings}
          onSettings={setRemoveSettings}
          working={working}
          onCancel={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
      {resetting && (
        <ResetDialog
          sorted={toReset.reduce((s, c) => s + c.keys.length, 0)}
          ignored={toReset.reduce((s, c) => s + c.rows.length, 0)}
          onCancel={() => setResetting(false)}
          onConfirm={reset}
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
