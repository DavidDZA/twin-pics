import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { onNotice, type Notice } from '../lib/notify';

const SHOWN_MS = 5000;

/** Petits messages en haut de l'écran (badge gagné, groupe mis de côté), par-dessus le tri. */
export function Toasts() {
  const [list, setList] = useState<(Notice & { id: number })[]>([]);

  useEffect(() => {
    let id = 0;
    return onNotice((n) => {
      const mine = ++id;
      setList((l) => [...l.slice(-2), { ...n, id: mine }]);
      window.setTimeout(() => setList((l) => l.filter((x) => x.id !== mine)), SHOWN_MS);
    });
  }, []);

  if (!list.length) return null;
  return createPortal(
    <div className="toasts" role="status">
      {list.map((n) => (
        <div key={n.id} className="toast">
          <span>{n.text}</span>
          {n.action && (
            <button
              className="link"
              onClick={() => {
                n.action!.run();
                setList((l) => l.filter((x) => x.id !== n.id));
              }}
            >
              {n.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
