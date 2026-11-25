/**
 * Bouton Retour d'Android : il ferme ce qui est ouvert, la dernière chose ouverte d'abord (visionneuse, tri, fenêtre,
 * résultats). Chaque écran dépose sa façon de se fermer ; sans rien à fermer, l'appli passe en arrière-plan
 * (`MainActivity.java`, qui appelle `window.twinPicsBack`).
 */
import { useEffect, useRef } from 'react';

type Handler = () => void;

/** Ce qui est ouvert : une étape par écran, dans l'ordre d'ouverture. */
const open: { run: Handler }[] = [];

/** Dépose une façon de se fermer ; la fonction rendue la retire. */
export function pushBack(entry: { run: Handler }): () => void {
  open.push(entry);
  return () => {
    const i = open.indexOf(entry);
    if (i >= 0) open.splice(i, 1);
  };
}

/** Ferme la dernière chose ouverte ; `false` s'il n'y en a pas. */
export function goBack(): boolean {
  const last = open[open.length - 1];
  if (!last) return false;
  last.run();
  return true;
}

/** Le bouton Retour ferme ce composant tant qu'il est affiché (et `active`). */
export function useBack(onBack: Handler, active = true): void {
  const entry = useRef({ run: onBack });
  useEffect(() => {
    entry.current.run = onBack;
  });
  useEffect(() => (active ? pushBack(entry.current) : undefined), [active]);
}

declare global {
  interface Window {
    twinPicsBack?: () => boolean;
  }
}

if (typeof window !== 'undefined') window.twinPicsBack = goBack;
