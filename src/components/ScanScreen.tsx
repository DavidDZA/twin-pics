import { useRef } from 'react';
import { T, bytes, duration, num } from '../i18n';
import type { Progress } from '../lib/scan';

type Shown = Progress | { phase: 'listing'; done: number; total: 0 };

const LABELS: Record<Shown['phase'], string> = {
  listing: T.scan.listing,
  analyze: T.scan.analyze,
  model: T.scan.model,
  similar: T.scan.similar,
  pairs: T.scan.pairs,
};

/** Progression de l'analyse, avec une estimation du temps restant pour les étapes longues. */
export function ScanScreen({ progress, onStop }: { progress: Shown; onStop: () => void }) {
  const started = useRef<{ phase: string; at: number; done: number }>({ phase: '', at: 0, done: 0 });
  if (started.current.phase !== progress.phase) started.current = { phase: progress.phase, at: performance.now(), done: progress.done };

  const { done, total, phase } = progress;
  const ratio = total ? Math.min(1, done / total) : 0;
  let remaining: string | null = null;
  if ((phase === 'analyze' || phase === 'similar') && done - started.current.done >= 5) {
    const elapsed = (performance.now() - started.current.at) / 1000;
    const rate = (done - started.current.done) / elapsed;
    if (rate > 0 && elapsed > 2) remaining = T.scan.remaining(duration((total - done) / rate));
  }
  const count =
    phase === 'model' ? (total ? `${bytes(done)} / ${bytes(total)}` : '') : phase === 'listing' ? num(done) : phase === 'pairs' ? '' : `${num(done)} / ${num(total)}`;

  return (
    <section className="scan" aria-live="polite">
      <h2>{LABELS[phase]}…</h2>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
        <div className={total ? 'fill' : 'fill busy'} style={total ? { width: `${ratio * 100}%` } : undefined} />
      </div>
      <p className="count">
        {count}
        {remaining && <span className="muted"> · {remaining}</span>}
      </p>
      <button className="secondary" onClick={onStop}>
        {T.scan.stop}
      </button>
    </section>
  );
}
