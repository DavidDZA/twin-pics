/**
 * L'analyse d'un dossier, de bout en bout. **Chaque photo n'est lue qu'une fois** sur le disque (un disque dur lit
 * environ 60 à 150 Mo/s : relire le dossier pour le modèle doublait le temps) :
 *
 *   lecture (2 fichiers à la fois) → analyse (un worker par cœur) → modèle (carte graphique, ou processeur)
 *
 * 1. liste des photos (fait avant, `files.ts`) ;
 * 2. reprise de ce qui est déjà en base (photos inchangées : rien à refaire) ;
 * 3. le modèle des photos similaires se charge pendant que l'analyse commence ;
 * 4. chaque nouvelle photo est lue, analysée (`analyze.worker.ts`) et, si elle est datée, passe aussitôt dans le
 *    modèle (`embed.worker.ts`) : la petite version préparée par l'analyse suffit, pas de second décodage ;
 * 5. les photos déjà analysées mais sans vecteur (première analyse sans les photos similaires, autre version du
 *    modèle) sont relues, seulement celles qui ont une voisine dans le temps ;
 * 6. paires candidates (`findPairs`, dans un worker : la comparaison de toutes les photos deux à deux).
 */
import { db, photoKey, type PhotoRow } from './db';
import { LIMITS, type Pair, type PhotoInfo } from './groups';
import type { AnalyzeRequest, AnalyzeResult, EmbedMessage, EmbedRequest, ModelDevice, Pixels } from './messages';
import type { FoundFile, Listing } from './files';
import { nameOf } from './filetypes';
import { DEVICE_KEY, embedId } from './model';
import { Limiter, WorkerPool } from './pool';

export type Phase = 'analyze' | 'model' | 'similar' | 'pairs';

export interface Progress {
  phase: Phase;
  done: number;
  total: number;
}

export interface ScanOptions {
  similar: boolean;
  signal: AbortSignal;
  onProgress: (p: Progress) => void;
}

export interface ScanResult {
  photos: PhotoInfo[];
  /** Fichier de chaque photo (clé), pour l'afficher en grand et la supprimer. */
  files: Map<string, FoundFile>;
  pairs: Pair[];
  /** Photos que le navigateur n'a pas su lire. */
  unreadable: number;
  unsupported: number;
  videos: number;
  /** Photos analysées pendant cette analyse (les autres venaient de la base). */
  analyzed: number;
  /** Où a tourné le modèle des photos similaires. */
  device?: ModelDevice;
  /** Le modèle n'a pas pu être chargé (hors ligne…) : pas de photos similaires. */
  modelError?: string;
  seconds: number;
}

const SAVE_EVERY = 100;
/** Fichiers lus en même temps : un disque dur ralentit beaucoup s'il doit sauter d'un fichier à l'autre. */
const READS_AT_ONCE = 2;
/** Petites versions en attente du modèle (≈ 350 Ko chacune) : au-delà, l'analyse attend le modèle. */
const MODEL_QUEUE = 64;

function abortError(): DOMException {
  return new DOMException('Analyse arrêtée', 'AbortError');
}

/** Nombre de workers d'analyse : les cœurs du processeur, moins un pour l'interface (6 au plus). */
function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(6, cores - 1));
}

function forcedDevice(): 'auto' | 'wasm' {
  try {
    return localStorage.getItem(DEVICE_KEY) === 'wasm' ? 'wasm' : 'auto';
  } catch {
    return 'auto';
  }
}

function toInfo(row: PhotoRow, modelId: string | undefined): PhotoInfo {
  return {
    key: row.key,
    path: row.path,
    name: nameOf(row.path),
    size: row.size,
    lastModified: row.lastModified,
    sha: row.sha,
    dhash: row.dhash,
    time: row.time,
    emb: modelId && row.embModel === modelId ? row.emb : undefined,
    sharpness: row.sharpness,
    width: row.width,
    height: row.height,
  };
}

/** Photos datées qui ont au moins une autre photo à moins de `LIMITS.windowMin` : celles qui ont besoin du modèle. */
export function needsVector(rows: PhotoRow[]): PhotoRow[] {
  const timed = rows.filter((r) => r.time !== undefined && !r.error).sort((a, b) => a.time! - b.time!);
  const window = LIMITS.windowMin * 60_000;
  return timed.filter((r, i) => {
    const prev = timed[i - 1];
    const next = timed[i + 1];
    return (prev && r.time! - prev.time! <= window) || (next && next.time! - r.time! <= window);
  });
}

interface Model {
  pool: WorkerPool<EmbedRequest, EmbedMessage>;
  id: string;
  device: ModelDevice;
}

/** Charge le modèle dans un worker (et un second sur le processeur, deux fois plus rapide à deux). */
async function loadModel(onBytes: (loaded: number, total: number) => void): Promise<Model> {
  const start = (device: 'auto' | 'wasm') =>
    new Promise<{ worker: Worker; device: ModelDevice; dtype: string }>((resolve, reject) => {
      const worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<EmbedMessage>) => {
        const m = e.data;
        if (m.type === 'progress') onBytes(m.loaded, m.total);
        else if (m.type === 'ready') resolve({ worker, device: m.device, dtype: m.dtype });
        else if (m.type === 'error') {
          worker.terminate();
          reject(new Error(m.error));
        }
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(new Error(e.message || 'worker'));
      };
      worker.postMessage({ type: 'load', device } satisfies EmbedRequest);
    });
  const first = await start(forcedDevice());
  const workers = [first.worker];
  if (first.device === 'wasm') {
    try {
      workers.push((await start('wasm')).worker);
    } catch {
      // Un seul worker : plus lent, mais ça marche.
    }
  }
  return { pool: new WorkerPool(workers), id: embedId(first.dtype), device: first.device };
}

export async function scan(listing: Listing, opts: ScanOptions): Promise<ScanResult> {
  const start = performance.now();
  const { signal, onProgress } = opts;
  if (signal.aborted) throw abortError();

  // Une entrée par fichier (une photo vue deux fois par le navigateur n'est comptée qu'une fois).
  const entries = new Map<string, FoundFile>();
  for (const f of listing.images) entries.set(photoKey(f.path, f.size, f.lastModified), f);
  const keys = [...entries.keys()];
  const cached = await db.photos.bulkGet(keys);
  const rows = new Map<string, PhotoRow>();
  keys.forEach((k, i) => {
    const e = entries.get(k)!;
    rows.set(k, cached[i] ?? { key: k, path: e.path, size: e.size, lastModified: e.lastModified });
  });

  // SHA-256 seulement pour les tailles partagées : deux copies exactes ont la même taille.
  const sizeCount = new Map<number, number>();
  for (const r of rows.values()) sizeCount.set(r.size, (sizeCount.get(r.size) ?? 0) + 1);
  const needSha = (r: PhotoRow) => sizeCount.get(r.size)! > 1 && !r.sha;
  const todo = [...rows.values()].filter((r) => (!r.dhash && !r.error) || needSha(r));

  // Le modèle se charge pendant que l'analyse commence.
  let modelBytes = { loaded: 0, total: 0 };
  let modelPromise: Promise<Model | null> = Promise.resolve(null);
  let modelError: string | undefined;
  let model: Model | null = null;
  /** Analyse finie, modèle pas encore prêt : la progression montre son téléchargement. */
  let waitingForModel = false;
  if (opts.similar) {
    modelPromise = loadModel((loaded, total) => {
      modelBytes = { loaded, total };
      if (waitingForModel) onProgress({ phase: 'model', done: loaded, total });
    }).then(
      (m) => (model = m),
      (err) => {
        modelError = String(err?.message ?? err);
        return null;
      },
    );
  }

  const analyzers = new WorkerPool<AnalyzeRequest, AnalyzeResult>(
    Array.from({ length: Math.max(1, Math.min(poolSize(), todo.length || 1)) }, () => new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' })),
  );
  const reads = new Limiter(READS_AT_ONCE);
  const inFlight = new Limiter(poolSize() + READS_AT_ONCE + 2);
  const modelQueue = new Limiter(MODEL_QUEUE);
  const onAbort = () => {
    analyzers.terminate(abortError());
    void modelPromise.then((m) => m?.pool.terminate(abortError()));
  };
  signal.addEventListener('abort', onAbort, { once: true });

  const pendingRows: PhotoRow[] = [];
  const pendingThumbs: { key: string; blob: Blob }[] = [];
  const writes: Promise<void>[] = [];
  const flush = async () => {
    const r = pendingRows.splice(0);
    const t = pendingThumbs.splice(0);
    if (r.length) await db.photos.bulkPut(r);
    if (t.length) await db.thumbs.bulkPut(t);
  };

  // Le modèle, pour une photo : attend son tour (au plus MODEL_QUEUE en attente), puis le vecteur.
  let vectorsAsked = 0;
  let vectorsDone = 0;
  let analysisDone = false;
  const modelJobs: Promise<void>[] = [];
  const toModel = async (row: PhotoRow, pixels: Pixels) => {
    await modelQueue.acquire();
    vectorsAsked++;
    const job = (async () => {
      try {
        const m = await modelPromise;
        if (!m || signal.aborted) return;
        const msg = await m.pool.call({ type: 'embed', id: 0, pixels }, [pixels.data.buffer]);
        if (msg.type === 'vector') {
          row.emb = msg.vector;
          row.embModel = m.id;
          pendingRows.push(row);
        }
      } finally {
        vectorsDone++;
        modelQueue.release();
        if (analysisDone && !signal.aborted && !waitingForModel) onProgress({ phase: 'similar', done: vectorsDone, total: vectorsAsked });
      }
    })();
    modelJobs.push(job.catch(() => undefined));
  };

  /** Lit le fichier d'une photo (2 à la fois) et le confie à un worker d'analyse. */
  const read = (row: PhotoRow) => reads.run(() => entries.get(row.key)!.read());

  let analyzed = 0;
  try {
    // Analyse des nouvelles photos.
    if (todo.length) onProgress({ phase: 'analyze', done: 0, total: todo.length });
    await Promise.all(
      todo.map((row) =>
        inFlight.run(async () => {
          if (signal.aborted) throw abortError();
          const buffer = await read(row);
          const res = await analyzers.call({ id: 0, buffer, mode: 'full', needSha: needSha(row), wantPixels: opts.similar }, [buffer]);
          const { thumb, pixels, id: _id, ok, ...fields } = res;
          Object.assign(row, fields, { error: ok ? undefined : res.error });
          pendingRows.push(row);
          if (thumb) pendingThumbs.push({ key: row.key, blob: thumb });
          analyzed++;
          if (analyzed % SAVE_EVERY === 0) writes.push(flush());
          onProgress({ phase: 'analyze', done: analyzed, total: todo.length });
          if (pixels) await toModel(row, pixels);
        }),
      ),
    );
    analysisDone = true;

    if (opts.similar) {
      // Le modèle n'est pas encore prêt (premier téléchargement) : on le montre.
      if (!model && !modelError) {
        waitingForModel = true;
        onProgress({ phase: 'model', done: modelBytes.loaded, total: modelBytes.total });
        await modelPromise;
        waitingForModel = false;
      }
      if (signal.aborted) throw abortError();
      const m = model as Model | null;
      if (m) {
        // Photos déjà analysées sans vecteur de ce modèle : relues, seulement celles qui ont une voisine.
        const asked = new Set(todo.filter((r) => r.time !== undefined && !r.error).map((r) => r.key));
        const missing = needsVector([...rows.values()]).filter((r) => r.embModel !== m.id && !asked.has(r.key));
        onProgress({ phase: 'similar', done: vectorsDone, total: vectorsAsked + missing.length });
        await Promise.all(
          missing.map((row) =>
            inFlight.run(async () => {
              if (signal.aborted) throw abortError();
              const buffer = await read(row);
              const res = await analyzers.call({ id: 0, buffer, mode: 'pixels', needSha: false, wantPixels: true }, [buffer]);
              if (res.pixels) await toModel(row, res.pixels);
            }),
          ),
        );
        await Promise.all(modelJobs);
      }
    }
    if (signal.aborted) throw abortError();
  } finally {
    signal.removeEventListener('abort', onAbort);
    analyzers.terminate();
    void modelPromise.then((m) => m?.pool.terminate());
    writes.push(flush());
    await Promise.all(writes);
  }

  // Paires candidates.
  const modelId = opts.similar ? (model as Model | null)?.id : undefined;
  const photos = [...rows.values()].filter((r) => !r.error || r.sha).map((r) => toInfo(r, modelId));
  onProgress({ phase: 'pairs', done: 0, total: photos.length });
  const pairs = await computePairs(photos, signal);

  return {
    photos,
    files: entries,
    pairs,
    unreadable: [...rows.values()].filter((r) => r.error).length,
    unsupported: listing.unsupported,
    videos: listing.videos,
    analyzed,
    device: (model as Model | null)?.device,
    modelError: opts.similar ? modelError : undefined,
    seconds: (performance.now() - start) / 1000,
  };
}

function computePairs(photos: PhotoInfo[], signal: AbortSignal): Promise<Pair[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pairs.worker.ts', import.meta.url), { type: 'module' });
    const onAbort = () => {
      worker.terminate();
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (e: MessageEvent<Pair[]>) => {
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(photos);
  });
}
