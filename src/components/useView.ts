import { useState } from 'react';

/**
 * Façon de trier : **grille** (tout le groupe à l'écran, sur PC), **duels** (doublons, deux photos à la fois, sur
 * téléphone) ou **swipe** (photos inutiles, une carte à la fois : je garde / je jette). Par défaut selon l'écran ; le
 * choix de l'utilisateur est retenu, pour les doublons et pour les photos inutiles séparément.
 */
export type SortView = 'grid' | 'duel' | 'swipe';

/** Doublons : grille ou duels ; photos inutiles : grille ou swipe (je garde / je jette). */
export type SortFamily = 'dup' | 'junk';

export const VIEWS: Record<SortFamily, SortView[]> = { dup: ['grid', 'duel'], junk: ['grid', 'swipe'] };

const VIEW_KEY: Record<SortFamily, string> = { dup: 'sort-view', junk: 'junk-view' };

export function defaultView(family: SortFamily = 'dup'): SortView {
  try {
    const small = window.matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 600;
    return small ? VIEWS[family][1] : 'grid';
  } catch {
    return 'grid';
  }
}

function readView(family: SortFamily): SortView {
  try {
    const v = localStorage.getItem(VIEW_KEY[family]) as SortView | null;
    if (v && VIEWS[family].includes(v)) return v;
  } catch {
    // Pas de stockage : la façon par défaut.
  }
  return defaultView(family);
}

export function useView(family: SortFamily): [SortView, (v: SortView) => void] {
  const [view, setState] = useState<SortView>(() => readView(family));
  const set = (v: SortView) => {
    setState(v);
    try {
      localStorage.setItem(VIEW_KEY[family], v);
    } catch {
      // Choix non retenu.
    }
  };
  return [view, set];
}
