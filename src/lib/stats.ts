/**
 * Stats et badges : des compteurs gardés sur l'appareil, et **cinquante badges** (un compteur, un seuil). Code pur,
 * testé sous Node ; l'enregistrement est dans `statsStore.ts`. Un badge gagné l'est pour de bon, même si son compteur
 * redescend (annulation d'une suppression).
 */
export interface Stats {
  /** Photos différentes déjà analysées ; analyses ; dossiers différents ; plus grosse analyse (photos). */
  analyzed: number;
  scans: number;
  folders: number;
  biggestScan: number;
  /** Photos triées (« garder » ou « supprimer »), dont gardées, dont de nuit (0 h à 5 h). */
  sorted: number;
  kept: number;
  night: number;
  /** Groupes de doublons triés, dont entièrement gardés, dont entièrement supprimés ; le plus gros (photos). */
  groups: number;
  keptAll: number;
  noneKept: number;
  biggestGroup: number;
  /** Âge (années) de la plus ancienne photo triée. */
  oldest: number;
  duels: number;
  swipes: number;
  /** Le plus de photos swipées en une minute. */
  swipeMinute: number;
  /** Photos supprimées, par fonction ; dont copies exactes ; le plus d'un coup ; nombre de suppressions. */
  removedDup: number;
  removedJunk: number;
  removedExact: number;
  biggestClean: number;
  removals: number;
  /** Photos remises à leur place (« Annuler »). */
  undone: number;
  /** Place libérée (octets). */
  freed: number;
  /** Jours d'utilisation. */
  days: number;
  /** Listes triées en entier. */
  perfect: number;
  /** Groupes mis de côté. */
  ignored: number;
  /** Photos regardées en zoom. */
  zooms: number;
}

export const NO_STATS: Stats = {
  analyzed: 0,
  scans: 0,
  folders: 0,
  biggestScan: 0,
  sorted: 0,
  kept: 0,
  night: 0,
  groups: 0,
  keptAll: 0,
  noneKept: 0,
  biggestGroup: 0,
  oldest: 0,
  duels: 0,
  swipes: 0,
  swipeMinute: 0,
  removedDup: 0,
  removedJunk: 0,
  removedExact: 0,
  biggestClean: 0,
  removals: 0,
  undone: 0,
  freed: 0,
  days: 0,
  perfect: 0,
  ignored: 0,
  zooms: 0,
};

/** Ce que compte un badge : un compteur, ou les photos supprimées en tout. */
export type Measure = Exclude<keyof Stats, 'removedDup'> | 'removed';

export function measure(s: Stats, m: Measure): number {
  return m === 'removed' ? s.removedDup + s.removedJunk : s[m];
}

export type Family = 'scan' | 'sort' | 'duel' | 'swipe' | 'clean' | 'space' | 'more';

export interface Badge {
  id: string;
  emoji: string;
  of: Measure;
  goal: number;
  family: Family;
}

const MB = 1_000_000;

const list = <const T extends readonly (readonly [id: string, emoji: string, of: Measure, goal: number])[]>(family: Family, rows: T) =>
  rows.map(([id, emoji, of, goal]) => ({ id: id as T[number][0], emoji, of, goal, family }));

/** Les cinquante badges, par famille (ordre d'affichage). Noms : `T.stats.names`. */
export const BADGES = [
  ...list('scan', [
    ['firstLook', '👀', 'analyzed', 100],
    ['explorer', '🔎', 'analyzed', 1_000],
    ['bigExplorer', '🔭', 'analyzed', 10_000],
    ['archivist', '🏛️', 'analyzed', 50_000],
    ['regular', '🔁', 'scans', 10],
    ['globetrotter', '🌍', 'folders', 5],
    ['marathon', '🏃', 'biggestScan', 5_000],
  ]),
  ...list('sort', [
    ['firstChoices', '✌️', 'sorted', 10],
    ['sorter', '🗂️', 'sorted', 100],
    ['bigSorter', '🗃️', 'sorted', 1_000],
    ['master', '👑', 'sorted', 10_000],
    ['collector', '🖼️', 'kept', 100],
    ['curator', '🏺', 'kept', 1_000],
    ['referee', '⚖️', 'groups', 10],
    ['judge', '📜', 'groups', 100],
    ['bigHeart', '❤️', 'keptAll', 5],
    ['merciless', '🔥', 'noneKept', 5],
    ['burst', '📸', 'biggestGroup', 10],
    ['bigBurst', '🎞️', 'biggestGroup', 25],
    ['perfectionist', '💯', 'perfect', 1],
    ['diamond', '💎', 'perfect', 10],
  ]),
  ...list('duel', [
    ['firstDuel', '🤺', 'duels', 1],
    ['duelist', '⚔️', 'duels', 50],
    ['gladiator', '🛡️', 'duels', 500],
    ['champion', '🏆', 'duels', 2_000],
  ]),
  ...list('swipe', [
    ['firstSwipe', '👆', 'swipes', 10],
    ['nimbleThumb', '👍', 'swipes', 100],
    ['steelThumb', '🦾', 'swipes', 1_000],
    ['legendThumb', '⚡', 'swipes', 5_000],
    ['lightning', '🌩️', 'swipeMinute', 30],
  ]),
  ...list('clean', [
    ['firstGoodbye', '👋', 'removed', 1],
    ['smallClean', '🧽', 'removed', 50],
    ['bigClean', '🧹', 'removed', 500],
    ['tornado', '🌪️', 'removed', 5_000],
    ['copyHunt', '👯', 'removedExact', 10],
    ['cloneHunter', '🧬', 'removedExact', 500],
    ['noRegrets', '🗑️', 'removedJunk', 25],
    ['recycler', '♻️', 'removedJunk', 500],
    ['sweep', '💥', 'biggestClean', 100],
    ['fairy', '🪄', 'removals', 10],
  ]),
  ...list('space', [
    ['air', '🎈', 'freed', 100 * MB],
    ['clear', '💾', 'freed', 1_000 * MB],
    ['sailing', '⛵', 'freed', 10_000 * MB],
    ['infinity', '🌌', 'freed', 50_000 * MB],
  ]),
  ...list('more', [
    ['faithful', '📅', 'days', 3],
    ['pillar', '🗿', 'days', 30],
    ['sharpEye', '🧐', 'ignored', 5],
    ['detective', '🕵️', 'zooms', 50],
    ['timeMachine', '⏳', 'oldest', 10],
    ['nightOwl', '🦉', 'night', 20],
  ]),
];

export type BadgeId = (typeof BADGES)[number]['id'];

export const FAMILIES: Family[] = ['scan', 'sort', 'duel', 'swipe', 'clean', 'space', 'more'];

/** Badges gagnés (identifiant → date). */
export type Earned = Record<string, number>;

/** Badges nouvellement gagnés (pas déjà dans `earned`). */
export function newlyEarned(s: Stats, earned: Earned) {
  return BADGES.filter((b) => !earned[b.id] && measure(s, b.of) >= b.goal);
}

/** Ajoute (ou retire, après une annulation) ; jamais en dessous de zéro. */
export function add(s: Stats, patch: Partial<Stats>): Stats {
  const out = { ...s };
  for (const k of Object.keys(patch) as (keyof Stats)[]) out[k] = Math.max(0, out[k] + (patch[k] ?? 0));
  return out;
}

/** Records : garde le plus grand. */
export function atLeast(s: Stats, patch: Partial<Stats>): Stats {
  const out = { ...s };
  for (const k of Object.keys(patch) as (keyof Stats)[]) out[k] = Math.max(out[k], patch[k] ?? 0);
  return out;
}

const YEAR = 365.25 * 24 * 3600_000;

/** Ce qu'apporte le tri de photos (`fresh` : pas encore triées) : photos, gardées, de nuit, âge de la plus ancienne. */
export function sortedStats(fresh: { mark: 'keep' | 'remove'; time?: number }[], now = new Date()): { plus: Partial<Stats>; record: Partial<Stats> } {
  const n = fresh.length;
  const kept = fresh.filter((f) => f.mark === 'keep').length;
  // Une date d'avant 1990 ou dans le futur est un appareil mal réglé.
  const times = fresh.map((f) => f.time).filter((t): t is number => t !== undefined && t > Date.UTC(1990, 0) && t <= now.getTime());
  const oldest = times.length ? Math.floor((now.getTime() - Math.min(...times)) / YEAR) : 0;
  return { plus: { sorted: n, kept, night: now.getHours() < 5 ? n : 0 }, record: { oldest } };
}

/** Le plus de moments dans une même minute, le dernier compris (`times` croissants). */
export function inLastMinute(times: number[], now: number): number[] {
  return times.filter((t) => now - t < 60_000);
}
