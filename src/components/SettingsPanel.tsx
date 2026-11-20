import { T } from '../i18n';
import { LIMITS, type Params } from '../lib/groups';

interface Props {
  params: Params;
  onChange: (p: Params) => void;
  onReset: () => void;
}

/** Curseurs des seuils : les groupes se refont en direct (les paires candidates sont déjà calculées). */
export function SettingsPanel({ params, onChange, onReset }: Props) {
  return (
    <details className="settings">
      <summary>{T.settings.title}</summary>
      <p className="muted small">{T.settings.help}</p>
      <label className="slider">
        <span>{T.settings.nearMax}</span>
        <input type="range" min={0} max={LIMITS.nearMax} step={1} value={params.nearMax} onChange={(e) => onChange({ ...params, nearMax: Number(e.target.value) })} />
        <output>{T.settings.nearValue(params.nearMax)}</output>
      </label>
      <label className="slider">
        <span>{T.settings.simMin}</span>
        <input
          type="range"
          min={Math.round(LIMITS.simMin * 100)}
          max={99}
          step={1}
          value={Math.round(params.simMin * 100)}
          onChange={(e) => onChange({ ...params, simMin: Number(e.target.value) / 100 })}
        />
        <output>{T.settings.simValue(Math.round(params.simMin * 100))}</output>
      </label>
      <label className="slider">
        <span>{T.settings.windowMin}</span>
        <input type="range" min={1} max={LIMITS.windowMin} step={1} value={params.windowMin} onChange={(e) => onChange({ ...params, windowMin: Number(e.target.value) })} />
        <output>{T.settings.windowValue(params.windowMin)}</output>
      </label>
      <button className="link" onClick={onReset}>
        {T.settings.reset}
      </button>
    </details>
  );
}
