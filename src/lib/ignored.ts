/**
 * Groupes **mis de côté** par l'utilisateur : « Pas des doublons », « Pas inutiles ». Ils ne sont plus proposés (ni
 * triés, ni supprimés) tant qu'on ne les remet pas. Code pur, testé sous Node.
 *
 * - Doublons : un groupe est caché si **toutes** ses photos étaient dans un même groupe mis de côté (il reste caché
 *   s'il rétrécit). S'il gagne une nouvelle photo, il est proposé de nouveau.
 * - Photos inutiles : chaque photo d'un groupe mis de côté n'est plus proposée, quels que soient les réglages.
 */
import type { LabelRow } from './db';
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

/** Sépare les groupes de doublons proposés et ceux mis de côté. */
export function splitIgnored(groups: Group[], photos: PhotoInfo[], labels: LabelRow[]): { shown: Group[]; ignored: Group[] } {
  if (!labels.length) return { shown: groups, ignored: [] };
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
    (common?.length ? ignored : shown).push(g);
  }
  return { shown, ignored };
}

/** Photos inutiles mises de côté (leurs clés). */
export function ignoredKeys(labels: LabelRow[]): Set<string> {
  return new Set(labels.flatMap((l) => l.keys));
}
