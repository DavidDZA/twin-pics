import { describe, expect, it } from 'vitest';
import type { LabelRow, MarkRow } from '../src/lib/db';
import { buildGroups, DEFAULTS, findPairs, groupId, type PhotoInfo } from '../src/lib/groups';
import { coveringLabels, ignoredKeys, keptKeys, keptTogether, splitIgnored, wrongLabels } from '../src/lib/ignored';

const p = (path: string, sha: string): PhotoInfo => ({ key: path, path, name: path, size: 100, lastModified: 1, sha });
const groupsOf = (photos: PhotoInfo[]) => buildGroups(photos, findPairs(photos), DEFAULTS);
const label = (keys: string[], o: Partial<LabelRow> = {}): LabelRow => ({ groupId: keys.join(), verdict: 'wrong', kind: 'exact', keys, at: 0, ...o });

const marksOf = (o: Record<string, MarkRow['mark']>, groupId = 'g') => new Map<string, MarkRow>(Object.entries(o).map(([key, mark]) => [key, { key, mark, groupId, at: 0 }]));

describe('mis de côté par le tri', () => {
  const photos = [p('a1', 'a'), p('a2', 'a'), p('a3', 'a'), p('b1', 'b'), p('b2', 'b')];
  const shown = (marks: Map<string, MarkRow>, list = photos) => splitIgnored(groupsOf(list), list, [], marks).shown.map((g) => photos[g.best].sha);

  it('tout gardé : le groupe est mis de côté tout de suite', () => {
    const marks = marksOf({ a1: 'keep', a2: 'keep', a3: 'keep' });
    expect(shown(marks)).toEqual(['b']);
    expect(splitIgnored(groupsOf(photos), photos, [], marks).ignored).toHaveLength(1);
  });

  it('deux gardées, une à supprimer : il attend la suppression, puis est mis de côté', () => {
    const marks = marksOf({ a1: 'keep', a2: 'keep', a3: 'remove' });
    expect(shown(marks).sort()).toEqual(['a', 'b']);
    const left = photos.filter((x) => x.key !== 'a3');
    expect(splitIgnored(groupsOf(left), left, [], marks).ignored).toHaveLength(1);
  });

  it('une seule gardée ou groupe pas fini : il reste dans la liste', () => {
    expect(shown(marksOf({ b1: 'keep', b2: 'remove' })).sort()).toEqual(['a', 'b']);
    expect(shown(marksOf({ b1: 'keep' })).sort()).toEqual(['a', 'b']);
  });

  it('une nouvelle photo le fait revenir ; des photos gardées dans deux tris différents ne comptent pas', () => {
    expect(shown(marksOf({ a1: 'keep', a2: 'keep' }))).toContain('a');
    const two = new Map([...marksOf({ b1: 'keep' }, 'g1'), ...marksOf({ b2: 'keep' }, 'g2')]);
    expect(shown(two)).toContain('b');
    expect(keptTogether(groupsOf(photos)[0], photos, new Map())).toBe(false);
  });

  it('photos inutiles : chaque photo gardée', () => {
    expect(keptKeys(marksOf({ a1: 'keep', a2: 'remove', b1: 'keep' }))).toEqual(['a1', 'b1']);
  });
});

describe('groupes mis de côté', () => {
  it('un groupe « Pas des doublons » n’est plus proposé, les autres restent', () => {
    const photos = [p('a1', 'a'), p('a2', 'a'), p('b1', 'b'), p('b2', 'b')];
    const groups = groupsOf(photos);
    expect(splitIgnored(groups, photos, [])).toEqual({ shown: groups, ignored: [] });
    const labels = [label(['a1', 'a2'])];
    const { shown, ignored } = splitIgnored(groups, photos, labels);
    expect(shown.map((g) => photos[g.best].sha)).toEqual(['b']);
    expect(ignored.map((g) => photos[g.best].sha)).toEqual(['a']);
    expect(coveringLabels(ignored[0], photos, labels)).toEqual(labels);
    expect(coveringLabels(shown[0], photos, labels)).toEqual([]);
  });

  it('il reste caché s’il rétrécit, il revient s’il gagne une photo', () => {
    const three = [p('a1', 'a'), p('a2', 'a'), p('a3', 'a')];
    const labels = [label(['a1', 'a2', 'a3'])];
    const two = three.slice(0, 2);
    expect(splitIgnored(groupsOf(two), two, labels).shown).toHaveLength(0);
    const four = [...three, p('a4', 'a')];
    expect(splitIgnored(groupsOf(four), four, labels).shown).toHaveLength(1);
    // Deux signalements différents ne s'additionnent pas.
    const halves = [label(['a1', 'a2']), label(['a3'])];
    expect(splitIgnored(groupsOf(three), three, halves).shown).toHaveLength(1);
  });

  it('doublons et photos inutiles à part ; les anciennes réponses « Bien trouvé » ne comptent pas', () => {
    const rows = [label(['a']), label(['b'], { kind: 'junk' }), label(['c'], { verdict: 'good' })];
    expect(wrongLabels(rows, false).map((l) => l.keys[0])).toEqual(['a']);
    expect(wrongLabels(rows, true).map((l) => l.keys[0])).toEqual(['b']);
    expect([...ignoredKeys(wrongLabels(rows, true))]).toEqual(['b']);
  });

  it('l’identifiant du groupe n’intervient pas (autres réglages, autre identifiant)', () => {
    const photos = [p('a1', 'a'), p('a2', 'a')];
    expect(splitIgnored(groupsOf(photos), photos, [label(['a1', 'a2'], { groupId: `x${groupId(photos, [0, 1])}` })]).shown).toEqual([]);
  });
});
