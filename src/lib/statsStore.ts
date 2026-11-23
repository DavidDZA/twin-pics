/**
 * Les stats, gardées en base (meta `stats`, `badges` : dates des badges gagnés, `statsSeen` : dossiers et dernier jour
 * déjà comptés) ; un badge gagné est annoncé (`notify`).
 */
import { T } from '../i18n';
import { db, getMeta, setMeta } from './db';
import { notify } from './notify';
import { add, atLeast, inLastMinute, newlyEarned, NO_STATS, type Earned, type Stats } from './stats';

const KEY = 'stats';
const BADGES_KEY = 'badges';
const SEEN_KEY = 'statsSeen';
/** Au-delà, les badges gagnés d'un coup sont annoncés ensemble. */
const ONE_BY_ONE = 2;

interface Seen {
  folders: string[];
  day: string;
}

async function read(): Promise<Stats> {
  return { ...NO_STATS, ...(await getMeta<Partial<Stats>>(KEY)) };
}

const readEarned = async (): Promise<Earned> => (await getMeta<Earned>(BADGES_KEY)) ?? {};

let queue: Promise<unknown> = Promise.resolve();

/** Une modification après l'autre (deux ajouts en même temps ne s'écrasent pas) ; une erreur de base est sans suite. */
function update(change: (s: Stats) => Stats | Promise<Stats>): void {
  queue = queue
    .then(async () => {
      const after = await change(await read());
      await setMeta(KEY, after);
      const earned = await readEarned();
      const fresh = newlyEarned(after, earned);
      if (!fresh.length) return;
      const now = Date.now();
      await setMeta(BADGES_KEY, { ...earned, ...Object.fromEntries(fresh.map((b) => [b.id, now])) });
      if (fresh.length > ONE_BY_ONE) notify({ text: `🏅 ${T.stats.earnedMany(fresh.length)}` });
      else for (const b of fresh) notify({ text: `${b.emoji} ${T.stats.earned(T.stats.names[b.id])}` });
    })
    .catch(() => undefined);
}

export function addStats(plus: Partial<Stats>, record: Partial<Stats> = {}): void {
  update((s) => atLeast(add(s, plus), record));
}

/** Jour d'utilisation : compté une fois par jour. */
async function withDay(s: Stats, seen: Seen): Promise<Stats> {
  const day = new Date().toLocaleDateString('sv');
  if (seen.day === day) return s;
  await setMeta(SEEN_KEY, { ...seen, day });
  return add(s, { days: 1 });
}

const readSeen = async (): Promise<Seen> => ({ folders: [], day: '', ...(await getMeta<Partial<Seen>>(SEEN_KEY)) });

/** Une analyse finie : `photos` vues, du dossier `folder`. */
export function countScan(photos: number, folder: string): void {
  update(async (s) => {
    const seen = await readSeen();
    if (!seen.folders.includes(folder)) seen.folders.push(folder);
    await setMeta(SEEN_KEY, seen);
    const out = atLeast(add(s, { scans: 1 }), { biggestScan: photos, folders: seen.folders.length });
    return withDay({ ...out, analyzed: await db.photos.count() }, seen);
  });
}

let swipeTimes: number[] = [];

/** Une photo swipée. */
export function countSwipe(): void {
  const now = Date.now();
  swipeTimes = inLastMinute([...swipeTimes, now], now);
  addStats({ swipes: 1 }, { swipeMinute: swipeTimes.length });
}

export async function readStats(): Promise<{ stats: Stats; earned: Earned }> {
  update(async (s) => withDay({ ...s, analyzed: await db.photos.count() }, await readSeen()));
  await queue;
  return { stats: await read(), earned: await readEarned() };
}
