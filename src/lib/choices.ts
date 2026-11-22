/**
 * Le tri des groupes : pour chaque photo, « garder » ou « supprimer ». Code pur, testé sous Node.
 *
 * - Par défaut, on ne garde que la **suggestion** (`suggestionOnly`) ; on peut aussi en garder plusieurs, ou aucune.
 * - Le tri est retenu photo par photo (table `marks`) : un groupe est **trié** quand toutes ses photos le sont. Si
 *   les réglages changent et qu'un groupe gagne une photo, il redevient « à trier » (ses choix restent proposés).
 * - Seules les photos « à supprimer » d'un groupe trié sont supprimées (`pendingRemoval`) : une photo marquée qui
 *   n'est plus dans aucun groupe (réglages changés) n'est jamais touchée.
 * - **Duels** (téléphone) : la suggestion affronte la photo suivante, la gagnante affronte la suivante, etc. ; à la
 *   fin, on ne garde que la gagnante, modifiable dans le résumé du groupe.
 */
import type { Group, PhotoInfo } from './groups';

export type Mark = 'keep' | 'remove';

/** Le tri d'un groupe : clé de chaque photo → garder / supprimer. */
export type Choice = Record<string, Mark>;

export function suggestionOnly(group: Group, photos: PhotoInfo[]): Choice {
  const c: Choice = {};
  for (const i of group.members) c[photos[i].key] = i === group.best ? 'keep' : 'remove';
  return c;
}

export function allAs(group: Group, photos: PhotoInfo[], mark: Mark): Choice {
  const c: Choice = {};
  for (const i of group.members) c[photos[i].key] = mark;
  return c;
}

/** Garder seulement cette photo (fin des duels). */
export function onlyKeep(group: Group, photos: PhotoInfo[], keep: number): Choice {
  const c: Choice = {};
  for (const i of group.members) c[photos[i].key] = i === keep ? 'keep' : 'remove';
  return c;
}

export function toggle(choice: Choice, key: string): Choice {
  return { ...choice, [key]: choice[key] === 'keep' ? 'remove' : 'keep' };
}

export function isSorted(group: Group, photos: PhotoInfo[], marks: ReadonlyMap<string, Mark>): boolean {
  return group.members.every((i) => marks.has(photos[i].key));
}

/** Le tri proposé à l'ouverture d'un groupe : ce qui est déjà retenu, sinon la suggestion seule. */
export function initialChoice(group: Group, photos: PhotoInfo[], marks: ReadonlyMap<string, Mark>): Choice {
  const c = suggestionOnly(group, photos);
  for (const i of group.members) {
    const m = marks.get(photos[i].key);
    if (m) c[photos[i].key] = m;
  }
  return c;
}

export interface GroupPlan {
  group: Group;
  keep: number[];
  remove: number[];
}

export interface Pending {
  /** Groupes triés où au moins une photo est à supprimer. */
  plans: GroupPlan[];
  /** Photos à supprimer (indices). */
  remove: number[];
  keep: number;
  bytes: number;
  /** Groupes où aucune photo n'est gardée (« tout supprimer ») : signalés avant de supprimer. */
  noneKept: number;
  /** Groupes triés (avec ou sans photo à supprimer). */
  sorted: number;
}

export function pendingRemoval(groups: Group[], photos: PhotoInfo[], marks: ReadonlyMap<string, Mark>): Pending {
  const out: Pending = { plans: [], remove: [], keep: 0, bytes: 0, noneKept: 0, sorted: 0 };
  for (const group of groups) {
    if (!isSorted(group, photos, marks)) continue;
    out.sorted++;
    const keep = group.members.filter((i) => marks.get(photos[i].key) === 'keep');
    const remove = group.members.filter((i) => marks.get(photos[i].key) === 'remove');
    if (!remove.length) continue;
    out.plans.push({ group, keep, remove });
    out.remove.push(...remove);
    out.keep += keep.length;
    for (const i of remove) out.bytes += photos[i].size;
    if (!keep.length) out.noneKept++;
  }
  return out;
}

/** Une série de duels dans un groupe : `order` (les photos), `champion` (la gagnante jusqu'ici), `next`. */
export interface Duel {
  order: number[];
  champion: number;
  next: number;
}

export function startDuel(group: Group): Duel {
  return { order: group.members, champion: group.members[0], next: 1 };
}

export const challenger = (d: Duel): number => d.order[d.next];

export const duelDone = (d: Duel): boolean => d.next >= d.order.length;

export function pickWinner(d: Duel, winner: number): Duel {
  return { ...d, champion: winner, next: d.next + 1 };
}
