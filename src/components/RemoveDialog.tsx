/**
 * La fenêtre « Avant de supprimer » : ce qui sera gardé et supprimé, groupe par groupe, et où vont les photos
 * (Corbeille de Windows ou dossier « À supprimer », au choix, retenu). Sur le site, la suppression n'existe pas :
 * la fenêtre le dit et propose l'appli PC.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { T, bytes } from '../i18n';
import type { PhotoInfo } from '../lib/groups';
import type { GroupPlan, Pending } from '../lib/choices';
import { RELEASES_URL, desktop, removeFolder, type RemoveSettings } from '../platform';
import { useThumbs } from './useThumbs';
import { shortPath } from '../lib/display';

/** Groupes montrés dans la liste (les suivants sont comptés). */
const SHOWN = 60;

interface Props {
  pending: Pending;
  /** Toutes les copies exactes d'un coup (sans tri) : la fenêtre le rappelle. */
  exact: boolean;
  photos: PhotoInfo[];
  /** Dossier analysé (appli PC) ; `null` sur le site. */
  root: string | null;
  settings: RemoveSettings;
  onSettings: (s: RemoveSettings) => void;
  /** Pendant la suppression : photos faites / total. */
  working: { done: number; total: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RemoveDialog({ pending, exact, photos, root, settings, onSettings, working, onCancel, onConfirm }: Props) {
  const canRemove = !!desktop && !!root;
  const folder = root ? removeFolder(settings, root, T.remove.folderName) : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !working && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, working]);

  const chooseFolder = async () => {
    const picked = await desktop?.pickRemoveFolder(folder);
    if (picked) onSettings({ ...settings, folder: picked });
  };

  return createPortal(
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && !working && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="remove-title">
        <h2 id="remove-title">{T.remove.title}</h2>
        <p data-testid="remove-summary">
          <strong>{T.remove.summary(pending.remove.length, bytes(pending.bytes), pending.keep, pending.plans.length)}</strong>
        </p>
        {exact && <p>{T.exact.note}</p>}
        {pending.noneKept > 0 && (
          <p className="warning" role="alert">
            {T.remove.noneKept(pending.noneKept)}
          </p>
        )}

        <ul className="plans">
          {pending.plans.slice(0, SHOWN).map((plan) => (
            <PlanRow key={plan.group.id} plan={plan} photos={photos} />
          ))}
        </ul>
        {pending.plans.length > SHOWN && <p className="muted small">{T.remove.more(pending.plans.length - SHOWN)}</p>}

        {canRemove ? (
          <div className="where">
            <label className="field">
              <span>{T.remove.where}</span>
              <select value={settings.mode} onChange={(e) => onSettings({ ...settings, mode: e.target.value as RemoveSettings['mode'] })} disabled={!!working}>
                <option value="trash">{T.remove.trash}</option>
                <option value="folder">{T.remove.folder}</option>
              </select>
            </label>
            {settings.mode === 'trash' ? (
              <p className="muted small">{T.remove.trashHelp}</p>
            ) : (
              <div className="folder-choice">
                <code title={folder}>{folder}</code>
                <button className="secondary" onClick={chooseFolder} disabled={!!working}>
                  {T.remove.change}
                </button>
                <p className="muted small">{T.remove.folderHelp}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="note-box">
            {T.remove.webOnly}{' '}
            <a href={RELEASES_URL} target="_blank" rel="noreferrer">
              {T.app.getPc}
            </a>
          </p>
        )}

        <div className="modal-actions">
          {working ? (
            <span className="muted" role="status">
              {T.remove.working(working.done, working.total)}
            </span>
          ) : (
            <>
              <button className="secondary" onClick={onCancel}>
                {canRemove ? T.remove.cancel : T.remove.close}
              </button>
              {canRemove && (
                <button className="primary danger" onClick={onConfirm}>
                  {T.remove.confirm(pending.remove.length)}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PlanRow({ plan, photos }: { plan: GroupPlan; photos: PhotoInfo[] }) {
  const thumbs = useThumbs([...plan.keep, ...plan.remove].map((i) => photos[i].key));
  const [open, setOpen] = useState(false);
  const cell = (i: number, mark: 'keep' | 'remove') => {
    const p = photos[i];
    return (
      <li key={p.key} className={mark} title={p.path}>
        {thumbs.get(p.key) ? <img src={thumbs.get(p.key)} alt="" /> : <span className="placeholder" />}
        <span className="state">{mark === 'keep' ? T.sort.kept : T.sort.removed}</span>
      </li>
    );
  };
  return (
    <li className="plan" data-testid="plan">
      <ul className="plan-photos">
        {plan.keep.map((i) => cell(i, 'keep'))}
        {plan.remove.map((i) => cell(i, 'remove'))}
      </ul>
      <button className="link small" onClick={() => setOpen(!open)} aria-expanded={open}>
        {T.sort.counts(plan.keep.length, plan.remove.length)}
      </button>
      {open && (
        <ul className="plan-names muted small">
          {[...plan.keep, ...plan.remove].map((i) => (
            <li key={photos[i].key}>
              {plan.keep.includes(i) ? `✓ ${T.sort.kept}` : `✕ ${T.sort.removed}`} · {shortPath(photos[i].path)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
