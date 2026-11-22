import { T } from '../i18n';
import { CLIP_REASONS, JUNK_DEFAULTS, JUNK_LIMITS, JUNK_REASONS, type JunkParams, type JunkReason } from '../lib/junk';

interface Props {
  params: JunkParams;
  onChange: (p: JunkParams) => void;
  /** Le modèle a tourné (sinon, ses raisons sont grisées). */
  hasModel: boolean;
}

/** Réglages des photos inutiles : les raisons à montrer, et trois curseurs (les groupes se refont en direct). */
export function JunkSettings({ params, onChange, hasModel }: Props) {
  const toggle = (r: JunkReason, on: boolean) => onChange({ ...params, off: on ? params.off.filter((x) => x !== r) : [...params.off, r] });
  const pct = (v: number) => Math.round(v * 100);
  return (
    <details className="settings">
      <summary>{T.junk.settings}</summary>
      <p className="muted small">{T.junk.settingsHelp}</p>
      <div className="reasons">
        {JUNK_REASONS.map((r) => (
          <label key={r} className={!hasModel && CLIP_REASONS.includes(r) ? 'reason off' : 'reason'}>
            <input type="checkbox" checked={!params.off.includes(r)} onChange={(e) => toggle(r, e.target.checked)} />
            {T.junk.reasons[r]}
          </label>
        ))}
      </div>
      {!hasModel && <p className="muted small">{T.junk.modelOff}</p>}
      <label className="slider">
        <span>{T.junk.blurMax}</span>
        <input type="range" min={JUNK_LIMITS.blurMax[0]} max={JUNK_LIMITS.blurMax[1]} step={5} value={params.blurMax} onChange={(e) => onChange({ ...params, blurMax: Number(e.target.value) })} />
        <output>{params.blurMax}</output>
      </label>
      <label className="slider">
        <span>{T.junk.clipMin}</span>
        <input
          type="range"
          min={pct(JUNK_LIMITS.clipMin[0])}
          max={pct(JUNK_LIMITS.clipMin[1])}
          step={1}
          value={pct(params.clipMin)}
          disabled={!hasModel}
          onChange={(e) => onChange({ ...params, clipMin: Number(e.target.value) / 100 })}
        />
        <output>{T.junk.percent(pct(params.clipMin))}</output>
      </label>
      <label className="slider">
        <span>{T.junk.groupMin}</span>
        <input
          type="range"
          min={pct(JUNK_LIMITS.groupMin[0])}
          max={pct(JUNK_LIMITS.groupMin[1])}
          step={1}
          value={pct(params.groupMin)}
          onChange={(e) => onChange({ ...params, groupMin: Number(e.target.value) / 100 })}
        />
        <output>{T.junk.percent(pct(params.groupMin))}</output>
      </label>
      <button className="link" onClick={() => onChange({ ...JUNK_DEFAULTS })}>
        {T.settings.reset}
      </button>
    </details>
  );
}
