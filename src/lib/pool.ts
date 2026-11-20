/** Outils de l'analyse en parallèle : limiter le nombre de tâches simultanées, faire travailler des workers. */

/** Au plus `max` tâches en même temps ; les autres attendent leur tour, dans l'ordre. */
export class Limiter {
  private running = 0;
  private waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Tâches en cours (pour les tests). */
  get active(): number {
    return this.running;
  }
}

/** Le minimum d'un worker : de quoi lui envoyer un message et recevoir sa réponse. */
export interface WorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminate(): void;
}

interface Job<Req, Res> {
  req: Req;
  transfer: Transferable[];
  resolve: (r: Res) => void;
  reject: (e: unknown) => void;
}

/**
 * Des workers qui traitent une demande à la fois chacun : `call` attend qu'un worker soit libre, lui envoie la
 * demande et rend sa réponse (le message suivant de ce worker).
 */
export class WorkerPool<Req, Res> {
  private idle: WorkerLike[];
  private current = new Map<WorkerLike, Job<Req, Res>>();
  private queue: Job<Req, Res>[] = [];
  private closed: unknown = null;

  constructor(private readonly workers: WorkerLike[]) {
    this.idle = [...workers];
    for (const w of workers) {
      w.onmessage = (e) => {
        const job = this.current.get(w);
        this.current.delete(w);
        this.idle.push(w);
        job?.resolve(e.data as Res);
        this.next();
      };
      w.onerror = (e) => {
        const job = this.current.get(w);
        this.current.delete(w);
        this.idle.push(w);
        job?.reject(new Error(e.message || 'worker'));
        this.next();
      };
    }
  }

  call(req: Req, transfer: Transferable[] = []): Promise<Res> {
    if (this.closed) return Promise.reject(this.closed);
    return new Promise<Res>((resolve, reject) => {
      this.queue.push({ req, transfer, resolve, reject });
      this.next();
    });
  }

  private next(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const job = this.queue.shift()!;
      this.current.set(w, job);
      w.postMessage(job.req, job.transfer);
    }
  }

  /** Arrête les workers ; les demandes en cours ou en attente échouent avec `reason`. */
  terminate(reason: unknown = new Error('terminé')): void {
    if (this.closed) return;
    this.closed = reason;
    for (const w of this.workers) w.terminate();
    for (const job of [...this.current.values(), ...this.queue]) job.reject(reason);
    this.current.clear();
    this.queue = [];
  }
}
