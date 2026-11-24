/**
 * Groupes **mis de côté** : par un bouton (« Pas des doublons », « Pas inutiles »), ou tout seuls après le tri, quand il n'y
 * reste que des photos gardées. Ils ne sont plus proposés (ni triés, ni supprimés) tant qu'on ne les remet pas. Code
 * pur, testé sous Node.
 *
 * - Doublons : un groupe est caché si **toutes** ses photos étaient dans un même groupe mis de côté (il reste caché
 *   s'il rétrécit). S'il gagne une nouvelle photo, il est proposé de nouveau.
 * - Photos inutiles : chaque photo d'un groupe mis de côté n'est plus proposée, quels que soient les réglages.
 * - Après le tri : doublons, les photos gardées ensemble (décidées dans le même groupe) ; s'il reste des photos à
 *   supprimer, le groupe attend leur suppression. Photos inutiles : chaque photo gardée, tout de suite.
 */
import type { LabelRow, MarkRow } from './db';
import type { Group, PhotoInfo } from './groups';

/** Ce qui est mis de côté, pour une des deux fonctions. */
export function wrongLabels(labels: Iterable<LabelRow>, junk: boolean): LabelRow[] {
  return [...labels].filter((l) => l.verdict === 'wrong' && (l.kind === 'junk') === junk);
}

/** Pour chaque photo, les groupes mis de côté où elle est. */
function labelsByKey(labels: LabelRow[]): Map<string, Set<LabelRow>> {
  const out = new Map<string, Set<LabelRow>>();
  for (const l of labels)
    for (const k of l.keys) {
      const set = out.get(k);
      if (set) set.add(l);
      else out.set(k, new Set([l]));
    }
  return out;
}

/** Les groupes mis de côté qui couvrent ce groupe (vide : il est proposé). */
export function coveringLabels(group: Group, photos: PhotoInfo[], labels: LabelRow[]): LabelRow[] {
  return labels.filter((l) => {
    const keys = new Set(l.keys);
    return group.members.every((i) => keys.has(photos[i].key));
  });
}

type Marks = ReadonlyMap<string, MarkRow>;

/** Toutes les photos du groupe ont été gardées, et dans le même tri : il n'y a plus rien à décider. */
export function keptTogether(group: Group, photos: PhotoInfo[], marks: Marks): boolean {
  const first = marks.get(photos[group.members[0]].key);
  return !!first && group.members.every((i) => {
    const m = marks.get(photos[i].key);
    return m?.mark === 'keep' && m.groupId === first.groupId;
  });
}

/** Les photos gardées au tri (leurs clés). */
export function keptKeys(marks: Marks): string[] {
  return [...marks.values()].filter((m) => m.mark === 'keep').map((m) => m.key);
}

/** Sépare les groupes de doublons proposés et ceux mis de côté (bouton, ou tri). */
export function splitIgnored(groups: Group[], photos: PhotoInfo[], labels: LabelRow[], marks: Marks = new Map()): { shown: Group[]; ignored: Group[] } {
  if (!labels.length && !marks.size) return { shown: groups, ignored: [] };
  const byKey = labelsByKey(labels);
  const shown: Group[] = [];
  const ignored: Group[] = [];
  for (const g of groups) {
    let common: LabelRow[] | null = null;
    for (const i of g.members) {
      const here = byKey.get(photos[i].key);
      common = here ? (common ? common.filter((l) => here.has(l)) : [...here]) : [];
      if (!common.length) break;
    }
    (common?.length || keptTogether(g, photos, marks) ? ignored : shown).push(g);
  }
  return { shown, ignored };
}

/** Photos inutiles mises de côté (leurs clés). */
export function ignoredKeys(labels: LabelRow[]): Set<string> {
  return new Set(labels.flatMap((l) => l.keys));
}
