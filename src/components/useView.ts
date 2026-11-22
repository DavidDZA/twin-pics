import { useState } from 'react';

/**
 * Façon de trier : **grille** (tout le groupe à l'écran, sur PC) ou **duels** (deux photos à la fois, sur téléphone).
 * Par défaut selon l'écran ; le choix de l'utilisateur est retenu.
 */
export type SortView = 'grid' | 'duel';

const VIEW_KEY = 'sort-view';

export function defaultView(): SortView {
  try {
    const small = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    return small ? 'duel' : 'grid';
  } catch {
    return 'grid';
  }
}

function readView(): SortView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'grid' || v === 'duel') return v;
  } catch {
    // Pas de stockage : la façon par défaut.
  }
  return defaultView();
}

export function useView(): [SortView, (v: SortView) => void] {
  const [view, setState] = useState<SortView>(readView);
  const set = (v: SortView) => {
    setState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Choix non retenu.
    }
  };
  return [view, set];
}
