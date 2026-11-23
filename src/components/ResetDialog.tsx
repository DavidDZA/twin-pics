import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../i18n';

interface Props {
  /** Photos triées et groupes mis de côté qui redeviendront à trier. */
  sorted: number;
  ignored: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/** « Effacer mes choix » : confirmation (aucun fichier n'est touché). */
export function ResetDialog({ sorted, ignored, onCancel, onConfirm }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 id="reset-title">{T.reset.title}</h2>
        <p>
          {sorted > 0 && <>{T.reset.sorted(sorted)} </>}
          {ignored > 0 && <>{T.reset.ignored(ignored)} </>}
          {T.reset.safe}
        </p>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel}>
            {T.remove.cancel}
          </button>
          <button className="primary danger" onClick={onConfirm}>
            {T.reset.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
