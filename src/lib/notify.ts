/** Petits messages en haut de l'écran (badge gagné, groupe mis de côté) : affichés par `Toasts`. */
export interface Notice {
  text: string;
  /** Bouton (« Annuler »). */
  action?: { label: string; run: () => void };
}

type Listener = (n: Notice) => void;
const listeners = new Set<Listener>();

export function notify(n: Notice): void {
  for (const l of listeners) l(n);
}

export function onNotice(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
