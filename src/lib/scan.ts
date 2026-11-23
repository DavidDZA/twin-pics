/**
 * L'analyse d'un dossier, de bout en bout. **Chaque photo n'est lue qu'une fois** sur le disque (un disque dur lit
 * environ 60 à 150 Mo/s : relire le dossier pour un modèle doublait le temps) :
 *
 *   lecture (2 fichiers à la fois) → analyse (un worker par cœur) → modèles (carte graphique, ou processeur)
 *
 * 1. liste des photos (fait avant, `files.ts`) ;
 * 2. reprise de ce qui est déjà en base (photos inchangées : rien à refaire ; mesurées avec une ancienne version des
 *    mesures de qualité : réanalysées) ;
 * 3. les modèles se chargent (seulement si une photo en a besoin) pendant que l'analyse commence : DINOv2 (photos similaires, `embed.worker.ts`) et
 *    MobileCLIP (photos inutiles, `clip.worker.ts`), chacun s'il est demandé ;
 * 4. chaque nouvelle photo est lue, analysée (`analyze.worker.ts`) et passe aussitôt dans les modèles : DINOv2 si
 *    elle est datée, MobileCLIP toujours ; la petite version préparée par l'analyse suffit, pas de second décodage ;
 * 5. les photos déjà analysées mais sans vecteur d'un modèle (option cochée après coup, autre version du modèle) sont
 *    relues une fois pour tous les modèles qui leur manquent (DINOv2 : seulement celles qui ont une voisine dans le
 *    temps) ;
 * 6. paires candidates (`findPairs`, dans un worker : la comparaison de toutes les photos deux à deux).
 */
import { db, getMeta, photoKey, setMeta, type PhotoRow } from './db';
import { LIMITS, type Pair, type PhotoInfo } from './groups';
import type { AnalyzeRequest, AnalyzeResult, EmbedMessage, EmbedRequest, ModelDevice, Pixels } from './messages';
import type { FoundFile, Listing } from './files';
import { nameOf } from './filetypes';
import { DEVICE_KEY, embedId } from './model';
import { clipId } from './junk';
import { QUALITY_VERSION } from './quality';
import { Limiter, WorkerPool } from './pool';

/**
 * `model` : téléchargement des modèles ; `loading` : leur préparation (déjà sur l'appareil) ; `similar` : passage des
 * photos dans les modèles.
 */
export type Phase = 'analyze' | 'model' | 'loading' | 'similar' | 'pairs';

export interface Progress {
  phase: Phase;
  done: number;
  total: number;
}

export interface ScanOptions {
  /** Photos similaires (DINOv2). */
  similar: boolean;
  /** Photos inutiles reconnues par le modèle (MobileCLIP) ; les règles simples marchent sans. */
  junkModel: boolean;
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
  /** Où a tourné MobileCLIP ; s'il n'a pas pu être chargé. */
  clipDevice?: ModelDevice;
  clipError?: string;
  seconds: number;
}

const SAVE_EVERY = 100;
/** Fichiers lus en même temps : un disque dur ralentit beaucoup s'il doit sauter d'un fichier à l'autre. */
const READS_AT_ONCE = 2;
/** Petites versions en attente des modèles (≈ 350 Ko chacune) : au-delà, l'analyse attend les modèles. */
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

function toInfo(row: PhotoRow, modelId: string | undefined, clipModelId: string | undefined): PhotoInfo {
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
    camera: row.camera,
    quality: row.quality,
    clip: clipModelId && row.clipModel === clipModelId ? row.clip : undefined,
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

/** Version de chaque modèle à la dernière analyse (meta `models`) : inutile de le charger si toutes l'ont déjà vue. */
interface KnownModel {
  id: string;
  device: ModelDevice;
}
const MODELS_KEY = 'models';

interface Model {
  pool: WorkerPool<EmbedRequest, EmbedMessage>;
  id: string;
  device: ModelDevice;
}

/**
 * Charge un modèle dans un worker (et un second sur le processeur, deux fois plus rapide à deux). `make` crée le
 * worker (écrit en toutes lettres pour que Vite l'empaquette) ; `idOf` nomme la version du modèle.
 */
async function loadModel(make: () => Worker, idOf: (dtype: string) => string, onBytes: (loaded: number, total: number, cached: boolean) => void): Promise<Model> {
  const start = (device: 'auto' | 'wasm') =>
    new Promise<{ worker: Worker; device: ModelDevice; dtype: string }>((resolve, reject) => {
      const worker = make();
      worker.onmessage = (e: MessageEvent<EmbedMessage>) => {
        const m = e.data;
        if (m.type === 'progress') onBytes(m.loaded, m.total, m.cached);
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
  return { pool: new WorkerPool(workers), id: idOf(first.dtype), device: first.device };
}

/** Un modèle demandé : son chargement, et ce qu'on en sait une fois chargé. */
interface Slot {
  promise: Promise<Model | null>;
  model: Model | null;
  error?: string;
  bytes: { loaded: number; total: number; cached: boolean };
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
  // À analyser : les nouvelles photos, celles mesurées avec une ancienne version des mesures de qualité.
  const todo = [...rows.values()].filter((r) => (!r.dhash && !r.error) || needSha(r) || (!r.error && r.qv !== QUALITY_VERSION));

  // Les modèles se chargent pendant que l'analyse commence.
  /** Analyse finie, modèles pas encore prêts : la progression montre leur téléchargement. */
  let waitingForModel = false;
  const slots: Slot[] = [];
  const showBytes = () => {
    if (!waitingForModel) return;
    const loaded = slots.reduce((s, x) => s + x.bytes.loaded, 0);
    const total = slots.reduce((s, x) => s + x.bytes.total, 0);
    // Rien à télécharger : on ne montre pas d'octets, le modèle est seulement relu et préparé.
    const downloading = slots.some((x) => !x.bytes.cached && x.bytes.total > 0 && !x.model);
    onProgress(downloading ? { phase: 'model', done: loaded, total } : { phase: 'loading', done: 0, total: 0 });
  };
  const slot = (load: (onBytes: (l: number, t: number, cached: boolean) => void) => Promise<Model>): Slot => {
    const s: Slot = { promise: Promise.resolve(null), model: null, bytes: { loaded: 0, total: 0, cached: false } };
    s.promise = load((loaded, total, cached) => {
      s.bytes = { loaded, total, cached };
      showBytes();
    }).then(
      (m) => (s.model = m),
      (err) => {
        s.error = String(err?.message ?? err);
        return null;
      },
    );
    slots.push(s);
    return s;
  };
  // Un modèle n'est chargé que s'il a des photos à voir : nouvelles, ou sans vecteur de sa version.
  const known = (await getMeta<{ dino?: KnownModel; clip?: KnownModel }>(MODELS_KEY).catch(() => undefined)) ?? {};
  const all = [...rows.values()];
  const upToDate = (k: KnownModel | undefined, wanting: PhotoRow[], idOf: (r: PhotoRow) => string | undefined) =>
    !todo.length && !!k && (forcedDevice() === 'auto' || k.device === 'wasm') && wanting.every((r) => idOf(r) === k.id);
  const dinoReady = upToDate(known.dino, needsVector(all), (r) => r.embModel);
  const clipReady = upToDate(
    known.clip,
    all.filter((r) => !r.error),
    (r) => r.clipModel,
  );
  const dino = opts.similar && !dinoReady ? slot((b) => loadModel(() => new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' }), embedId, b)) : null;
  const clip = opts.junkModel && !clipReady ? slot((b) => loadModel(() => new Worker(new URL('./clip.worker.ts', import.meta.url), { type: 'module' }), clipId, b)) : null;
  const wantPixels: AnalyzeRequest['wantPixels'] = clip ? 'all' : dino ? 'dated' : 'none';

  const analyzers = new WorkerPool<AnalyzeRequest, AnalyzeResult>(
    Array.from({ length: Math.max(1, Math.min(poolSize(), todo.length || 1)) }, () => new Worker(new URL('./analyze.worker.ts', import.meta.url), { type: 'module' })),
  );
  const reads = new Limiter(READS_AT_ONCE);
  const inFlight = new Limiter(poolSize() + READS_AT_ONCE + 2);
  const modelQueue = new Limiter(MODEL_QUEUE);
  const onAbort = () => {
    analyzers.terminate(abortError());
    for (const s of slots) void s.promise.then((m) => m?.pool.terminate(abortError()));
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

  // Un modèle, pour une photo : attend son tour (au plus MODEL_QUEUE en attente), puis le vecteur.
  let vectorsAsked = 0;
  let vectorsDone = 0;
  let analysisDone = false;
  const modelJobs: Promise<void>[] = [];
  const toModel = async (row: PhotoRow, pixels: Pixels, s: Slot, save: (row: PhotoRow, vector: Float32Array, id: string) => void) => {
    await modelQueue.acquire();
    vectorsAsked++;
    const job = (async () => {
      try {
        const m = await s.promise;
        if (!m || signal.aborted) return;
        const msg = await m.pool.call({ type: 'embed', id: 0, pixels }, [pixels.data.buffer]);
        if (msg.type === 'vector') {
          save(row, msg.vector, m.id);
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
  const saveDino = (row: PhotoRow, v: Float32Array, id: string) => ((row.emb = v), (row.embModel = id));
  const saveClip = (row: PhotoRow, v: Float32Array, id: string) => ((row.clip = v), (row.clipModel = id));
  /** Envoie la petite version aux modèles qui en ont besoin (une copie pour le second : elle est transférée). */
  const toModels = async (row: PhotoRow, pixels: Pixels, needDino: boolean, needClip: boolean) => {
    if (needDino && dino && needClip && clip) {
      const copy: Pixels = { ...pixels, data: new Uint8ClampedArray(pixels.data) };
      await toModel(row, copy, dino, saveDino);
      await toModel(row, pixels, clip, saveClip);
    } else if (needDino && dino) await toModel(row, pixels, dino, saveDino);
    else if (needClip && clip) await toModel(row, pixels, clip, saveClip);
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
          const res = await analyzers.call({ id: 0, buffer, mode: 'full', needSha: needSha(row), wantPixels }, [buffer]);
          const { thumb, pixels, id: _id, ok, ...fields } = res;
          Object.assign(row, fields, { error: ok ? undefined : res.error, qv: QUALITY_VERSION });
          pendingRows.push(row);
          if (thumb) pendingThumbs.push({ key: row.key, blob: thumb });
          analyzed++;
          if (analyzed % SAVE_EVERY === 0) writes.push(flush());
          onProgress({ phase: 'analyze', done: analyzed, total: todo.length });
          if (pixels) await toModels(row, pixels, row.time !== undefined, true);
        }),
      ),
    );
    analysisDone = true;

    if (slots.length) {
      // Les modèles ne sont pas encore prêts (premier téléchargement) : on le montre.
      if (slots.some((s) => !s.model && !s.error)) {
        waitingForModel = true;
        showBytes();
        await Promise.all(slots.map((s) => s.promise));
        waitingForModel = false;
      }
      if (signal.aborted) throw abortError();
      // Photos déjà analysées sans vecteur d'un modèle : relues une fois pour tous les modèles qui leur manquent.
      const asked = new Set(todo.filter((r) => !r.error).map((r) => r.key));
      const dinoMissing = new Set(dino?.model ? needsVector([...rows.values()]).filter((r) => r.embModel !== dino.model!.id && !asked.has(r.key)).map((r) => r.key) : []);
      const clipMissing = new Set(clip?.model ? [...rows.values()].filter((r) => !r.error && r.clipModel !== clip.model!.id && !asked.has(r.key)).map((r) => r.key) : []);
      const missing = [...rows.values()].filter((r) => dinoMissing.has(r.key) || clipMissing.has(r.key));
      onProgress({ phase: 'similar', done: vectorsDone, total: vectorsAsked + dinoMissing.size + clipMissing.size });
      await Promise.all(
        missing.map((row) =>
          inFlight.run(async () => {
            if (signal.aborted) throw abortError();
            const buffer = await read(row);
            const res = await analyzers.call({ id: 0, buffer, mode: 'pixels', needSha: false, wantPixels: 'all' }, [buffer]);
            if (res.pixels) await toModels(row, res.pixels, dinoMissing.has(row.key), clipMissing.has(row.key));
          }),
        ),
      );
      await Promise.all(modelJobs);
    }
    if (signal.aborted) throw abortError();
  } finally {
    signal.removeEventListener('abort', onAbort);
    analyzers.terminate();
    for (const s of slots) void s.promise.then((m) => m?.pool.terminate());
    writes.push(flush());
    await Promise.all(writes);
  }

  if (dino?.model) known.dino = { id: dino.model.id, device: dino.model.device };
  if (clip?.model) known.clip = { id: clip.model.id, device: clip.model.device };
  await setMeta(MODELS_KEY, known);

  // Paires candidates.
  const dinoId = dino ? dino.model?.id : opts.similar ? known.dino?.id : undefined;
  const clipModelId = clip ? clip.model?.id : opts.junkModel ? known.clip?.id : undefined;
  const photos = [...rows.values()].filter((r) => !r.error || r.sha).map((r) => toInfo(r, dinoId, clipModelId));
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
    device: dino?.model?.device,
    modelError: dino?.error,
    clipDevice: clip?.model?.device,
    clipError: clip?.error,
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
