import { describe, expect, it } from 'vitest';
import { Limiter, WorkerPool, type WorkerLike } from '../src/lib/pool';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Limiter', () => {
  it('jamais plus de tâches en même temps que permis (lectures du disque)', async () => {
    const limiter = new Limiter(2);
    let running = 0;
    let max = 0;
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        limiter.run(async () => {
          running++;
          max = Math.max(max, running);
          await tick(5);
          order.push(i);
          running--;
        }),
      ),
    );
    expect(max).toBe(2);
    expect(order).toHaveLength(8);
    expect(limiter.active).toBe(0);
  });

  it('une tâche qui échoue libère sa place', async () => {
    const limiter = new Limiter(1);
    await expect(limiter.run(() => Promise.reject(new Error('cassé')))).rejects.toThrow('cassé');
    await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('acquire / release : la file d’attente du modèle bloque l’analyse quand elle est pleine', async () => {
    const queue = new Limiter(2);
    await queue.acquire();
    await queue.acquire();
    let third = false;
    const waiting = queue.acquire().then(() => (third = true));
    await tick();
    expect(third).toBe(false);
    queue.release();
    await waiting;
    expect(third).toBe(true);
  });
});

/** Faux worker : répond `x × 2` après un délai, note combien de demandes il traite à la fois. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  busy = 0;
  maxBusy = 0;
  handled = 0;
  terminated = false;
  constructor(private readonly delay = 3) {}
  postMessage(message: unknown): void {
    this.busy++;
    this.maxBusy = Math.max(this.maxBusy, this.busy);
    setTimeout(() => {
      this.busy--;
      this.handled++;
      const x = message as number;
      if (x < 0) this.onerror?.({ message: 'négatif' } as ErrorEvent);
      else this.onmessage?.({ data: x * 2 } as MessageEvent);
    }, this.delay);
  }
  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerPool', () => {
  it('une demande à la fois par worker, toutes traitées, chacune avec sa réponse', async () => {
    const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
    const pool = new WorkerPool<number, number>(workers);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => pool.call(i)));
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
    for (const w of workers) expect(w.maxBusy).toBe(1);
    expect(workers.reduce((s, w) => s + w.handled, 0)).toBe(20);
  });

  it('une erreur du worker fait échouer sa demande seulement', async () => {
    const pool = new WorkerPool<number, number>([new FakeWorker()]);
    const bad = pool.call(-1);
    const good = pool.call(4);
    await expect(bad).rejects.toThrow('négatif');
    await expect(good).resolves.toBe(8);
  });

  it('« Arrêter » : workers arrêtés, demandes en cours et en attente annulées', async () => {
    const workers = [new FakeWorker(50)];
    const pool = new WorkerPool<number, number>(workers);
    const calls = [pool.call(1), pool.call(2), pool.call(3)];
    const reason = new DOMException('Analyse arrêtée', 'AbortError');
    pool.terminate(reason);
    for (const c of calls) await expect(c).rejects.toBe(reason);
    expect(workers[0].terminated).toBe(true);
    await expect(pool.call(4)).rejects.toBe(reason);
  });
});
