/**
 * L'analyse d'un dossier, de bout en bout :
 * 1. liste des photos (fait avant, `files.ts`) ;
 * 2. reprise de ce qui est déjà en base (photos inchangées : rien à refaire) ;
 * 3. analyse des nouvelles photos dans plusieurs workers en parallèle (`analyze.worker.ts`) ;
 * 4. si demandé, vecteurs du modèle pour les photos qui ont une voisine dans le temps (`embed.worker.ts`) ;
 * 5. paires candidates (`findPairs`, dans un worker : c'est la comparaison de toutes les photos deux à deux).
 */
import { db, photoKey, type PhotoRow } from './db';
import { LIMITS, type Pair, type PhotoInfo } from './groups';
import type { AnalyzeRequest, AnalyzeResult, EmbedMessage, EmbedRequest } from './messages';
import type { Listing } from './files';
import { nameOf } from './files';
import { EMBED_ID } from './model';

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
  /** Fichier de chaque photo (clé), pour l'afficher en grand. */
  files: Map<string, File>;
  pairs: Pair[];
  /** Photos que le navigateur n'a pas su lire. */
  unreadable: number;
  unsupported: number;
  videos: number;
  /** Photos analysées pendant cette analyse (les autres venaient de la base). */
  analyzed: number;
  /** Le modèle n'a pas pu être chargé (hors ligne…) : pas de photos similaires. */
  modelError?: string;
  seconds: number;
}

const SAVE_EVERY = 100;

function abortError(): DOMException {
  return new DOMException('Analyse arrêtée', 'AbortError');
}

/** Nombre de workers d'analyse : les cœurs du processeur, moins un pour l'interface (6 au plus). */
function poolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(6, cores - 1));
}

/**
 * Fait passer des tâches dans un groupe de workers, une à la fois par worker. `handle` reçoit chaque réponse et dit
 * si elle termine la tâche (le worker du modèle envoie aussi des messages de progression).
 */
async function runPool<T, R>(
  workers: Worker[],
  tasks: T[],
  send: (w: Worker, task: T, index: number) => void,
  onResult: (r: R) => void,
  signal: AbortSignal,
): Promise<void> {
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let running = 0;
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    const feed = (w: Worker) => {
      if (signal.aborted) return;
      if (next >= tasks.length) {
        if (running === 0) {
          signal.removeEventListener('abort', onAbort);
          resolve();
        }
        return;
      }
      running++;
      const i = next++;
      send(w, tasks[i], i);
    };
    for (const w of workers) {
      w.onmessage = (e: MessageEvent<R>) => {
        running--;
        try {
          onResult(e.data);
        } catch (err) {
          reject(err);
          return;
        }
        feed(w);
      };
      w.onerror = (e) => reject(new Error(e.message));
    }
    if (tasks.length === 0) {
      resolve();
      return;
    }
    workers.forEach(feed);
  });
}

function toInfo(row: PhotoRow): PhotoInfo {
  return {
    key: row.key,
    path: row.path,
    name: nameOf(row.path),
    size: row.size,
    lastModified: row.lastModified,
    sha: row.sha,
    dhash: row.dhash,
    time: row.time,
    emb: row.embModel === EMBED_ID ? row.emb : undefined,
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

export async function scan(listing: Listing, opts: ScanOptions): Promise<ScanResult> {
  const start = performance.now();
  const { signal, onProgress } = opts;

  // Une entrée par fichier (une photo vue deux fois par le navigateur n'est comptée qu'une fois).
  const entries = new Map<string, { path: string; file: File }>();
  for (const f of listing.images) entries.set(photoKey(f.path, f.file.size, f.file.lastModified), f);
  const keys = [...entries.keys()];
  const cached = await db.photos.bulkGet(keys);
  const rows = new Map<string, PhotoRow>();
  keys.forEach((k, i) => {
    const e = entries.get(k)!;
    rows.set(k, cached[i] ?? { key: k, path: e.path, size: e.file.size, lastModified: e.file.lastModified });
  });

  // SHA-256 seulement pour les tailles partagées : deux copies exactes ont la même taille.
  const sizeCount = new Map<number, number>();
  for (const r of rows.values()) sizeCount.set(r.size, (sizeCount.get(r.size) ?? 0) + 1);
  const needSha = (r: PhotoRow) => sizeCount.get(r.size)! > 1 && !r.sha;
  const todo = [...rows.values()].filter((r) => (!r.dhash && !r.error) || needSha(r));

  // Analyse.
  let analyzed = 0;
  const pendingRows: PhotoRow[] = [];
  const pendingThumbs: { key: string; blob: Blob }[] = [];
  const flush = async () => {
    if (pendingRows.length) await db.photos.bulkPut(pendingRows.splice(0));
    if (pendingThumbs.length) await db.thumbs.bulkPut(pendingThumbs.splice(0));
  };
  if (todo.length) {
    onProgress({ phase: 'analyze', done: 0, total: todo.length });
    const workers = Array.from({ length: Math.min(poolSize(), todo.length) }, () => new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' }));
    const writes: Promise<void>[] = [];
    try {
      await runPool<PhotoRow, AnalyzeResult>(
        workers,
        todo,
        (w, row, i) => w.postMessage({ id: i, file: entries.get(row.key)!.file, needSha: needSha(row) } satisfies AnalyzeRequest),
        (res) => {
          const row = todo[res.id];
          const { thumb, id: _id, ok, ...fields } = res;
          Object.assign(row, fields, { error: ok ? undefined : res.error });
          pendingRows.push(row);
          if (thumb) pendingThumbs.push({ key: row.key, blob: thumb });
          analyzed++;
          if (analyzed % SAVE_EVERY === 0) writes.push(flush());
          onProgress({ phase: 'analyze', done: analyzed, total: todo.length });
        },
        signal,
      );
    } finally {
      workers.forEach((w) => w.terminate());
      writes.push(flush());
      await Promise.all(writes);
    }
  }

  // Photos similaires : le modèle, pour les photos qui ont une voisine dans le temps.
  let modelError: string | undefined;
  if (opts.similar) {
    const all = [...rows.values()];
    const vectorBySha = new Map<string, Float32Array>();
    for (const r of all) if (r.sha && r.emb && r.embModel === EMBED_ID) vectorBySha.set(r.sha, r.emb);
    const missing = needsVector(all).filter((r) => r.embModel !== EMBED_ID);
    // Copies exactes : un seul calcul, le vecteur est recopié.
    const seenSha = new Set<string>();
    const toEmbed = missing.filter((r) => {
      if (!r.sha) return true;
      if (vectorBySha.has(r.sha) || seenSha.has(r.sha)) return false;
      seenSha.add(r.sha);
      return true;
    });
    if (toEmbed.length) {
      const worker = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
      try {
        modelError = await loadModel(worker, onProgress, signal);
        if (!modelError) {
          let done = 0;
          onProgress({ phase: 'similar', done, total: toEmbed.length });
          await runPool<PhotoRow, EmbedMessage>(
            [worker],
            toEmbed,
            (w, row, i) => w.postMessage({ type: 'embed', id: i, file: entries.get(row.key)!.file } satisfies EmbedRequest),
            (msg) => {
              if (msg.type !== 'vector' && msg.type !== 'failed') return;
              const row = toEmbed[msg.id];
              if (msg.type === 'vector') {
                row.emb = msg.vector;
                row.embModel = EMBED_ID;
                if (row.sha) vectorBySha.set(row.sha, msg.vector);
                pendingRows.push(row);
              }
              done++;
              if (done % SAVE_EVERY === 0) void flush();
              onProgress({ phase: 'similar', done, total: toEmbed.length });
            },
            signal,
          );
        }
      } finally {
        worker.terminate();
      }
    }
    for (const r of missing) {
      if (r.embModel !== EMBED_ID && r.sha && vectorBySha.has(r.sha)) {
        r.emb = vectorBySha.get(r.sha);
        r.embModel = EMBED_ID;
        pendingRows.push(r);
      }
    }
    await flush();
  }

  // Paires candidates.
  const readable = [...rows.values()].filter((r) => !r.error || r.sha);
  const photos = readable.map(toInfo);
  if (!opts.similar) photos.forEach((p) => (p.emb = undefined));
  onProgress({ phase: 'pairs', done: 0, total: photos.length });
  const pairs = await computePairs(photos, signal);

  const files = new Map<string, File>();
  for (const [k, e] of entries) files.set(k, e.file);
  return {
    photos,
    files,
    pairs,
    unreadable: [...rows.values()].filter((r) => r.error).length,
    unsupported: listing.unsupported,
    videos: listing.videos,
    analyzed,
    modelError,
    seconds: (performance.now() - start) / 1000,
  };
}

/** Charge le modèle dans son worker ; renvoie l'erreur s'il n'a pas pu l'être. */
function loadModel(worker: Worker, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (e: MessageEvent<EmbedMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress({ phase: 'model', done: m.loaded, total: m.total });
      else if (m.type === 'ready' || m.type === 'error') {
        signal.removeEventListener('abort', onAbort);
        resolve(m.type === 'error' ? m.error : undefined);
      }
    };
    worker.onerror = (e) => resolve(e.message || 'worker');
    onProgress({ phase: 'model', done: 0, total: 0 });
    worker.postMessage({ type: 'load' } satisfies EmbedRequest);
  });
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
