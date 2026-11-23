import { describe, expect, it } from 'vitest';
import type { LabelRow } from '../src/lib/db';
import { buildGroups, DEFAULTS, findPairs, groupId, type PhotoInfo } from '../src/lib/groups';
import { coveringLabels, ignoredKeys, splitIgnored, wrongLabels } from '../src/lib/ignored';

const p = (path: string, sha: string): PhotoInfo => ({ key: path, path, name: path, size: 100, lastModified: 1, sha });
const groupsOf = (photos: PhotoInfo[]) => buildGroups(photos, findPairs(photos), DEFAULTS);
const label = (keys: string[], o: Partial<LabelRow> = {}): LabelRow => ({ groupId: keys.join(), verdict: 'wrong', kind: 'exact', keys, at: 0, ...o });

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
