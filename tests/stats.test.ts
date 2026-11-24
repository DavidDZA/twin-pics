import { describe, expect, it } from 'vitest';
import { DICTS, LANGS } from '../src/i18n';
import { add, atLeast, BADGES, FAMILIES, inLastMinute, measure, newlyEarned, NO_STATS, sortedStats } from '../src/lib/stats';
import { onNotice } from '../src/lib/notify';
import { addStats, countScan, countSwipe, readStats } from '../src/lib/statsStore';

describe('badges', () => {
  it('cinquante, tous différents, gagnables, nommés dans chaque langue', () => {
    expect(BADGES).toHaveLength(50);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(50);
    expect(new Set(BADGES.map((b) => b.emoji)).size).toBe(50);
    expect(new Set(BADGES.map((b) => `${b.of} ${b.goal}`)).size).toBe(50);
    for (const b of BADGES) {
      expect(FAMILIES).toContain(b.family);
      expect(b.goal).toBeGreaterThan(0);
      expect(measure(NO_STATS, b.of)).toBe(0);
    }
    for (const l of LANGS) {
      const names = BADGES.map((b) => DICTS[l].stats.names[b.id]);
      expect(names.every(Boolean)).toBe(true);
      expect(new Set(names).size, l).toBe(50);
      for (const b of BADGES) expect(DICTS[l].stats.what[b.of], `${l} ${b.of}`).toBeTruthy();
    }
  });

  it('gagnés en passant le seuil, une seule fois, gardés même si le compteur redescend', () => {
    const s = { ...NO_STATS, removedDup: 30, removedJunk: 20 };
    expect(measure(s, 'removed')).toBe(50);
    expect(newlyEarned({ ...s, removedJunk: 19 }, {}).map((b) => b.id)).toEqual(['firstGoodbye']);
    expect(newlyEarned(s, {}).map((b) => b.id)).toEqual(['firstGoodbye', 'smallClean']);
    expect(newlyEarned(s, { firstGoodbye: 1, smallClean: 1 })).toEqual([]);
    expect(newlyEarned(NO_STATS, {})).toEqual([]);
    // Tout est atteignable.
    const all = Object.fromEntries(Object.keys(NO_STATS).map((k) => [k, 1e12])) as unknown as typeof NO_STATS;
    expect(newlyEarned(all, {})).toHaveLength(50);
  });
});

describe('stats', () => {
  it('les compteurs s’ajoutent, une annulation les retire, jamais sous zéro ; les records ne baissent pas', () => {
    const s = add(add(NO_STATS, { removedDup: 3, freed: 900 }), { removedDup: -1, freed: -300 });
    expect(s.removedDup).toBe(2);
    expect(s.freed).toBe(600);
    expect(add(s, { removedDup: -10 }).removedDup).toBe(0);
    expect(atLeast({ ...s, biggestClean: 8 }, { biggestClean: 5 }).biggestClean).toBe(8);
    expect(atLeast(s, { biggestClean: 5 }).biggestClean).toBe(5);
  });

  it('photos triées : gardées, la nuit, âge de la plus ancienne (dates impossibles ignorées)', () => {
    const now = new Date(2026, 10, 23, 2, 0);
    const out = sortedStats(
      [
        { mark: 'keep', time: new Date(2014, 5, 1).getTime() },
        { mark: 'remove', time: 0 },
        { mark: 'remove', time: new Date(2090, 0, 1).getTime() },
        { mark: 'remove' },
      ],
      now,
    );
    expect(out).toEqual({ plus: { sorted: 4, kept: 1, night: 4 }, record: { oldest: 12 } });
    expect(sortedStats([{ mark: 'keep' }], new Date(2026, 10, 23, 14, 0))).toEqual({ plus: { sorted: 1, kept: 1, night: 0 }, record: { oldest: 0 } });
  });

  it('photos swipées dans la dernière minute', () => {
    expect(inLastMinute([0, 10_000, 59_000, 61_000], 61_000)).toEqual([10_000, 59_000, 61_000]);
  });

  it('gardées en base ; ajouts simultanés sans perte ; badges annoncés une fois, ensemble s’il y en a beaucoup', async () => {
    const seen: string[] = [];
    const off = onNotice((n) => seen.push(n.text));
    for (let i = 0; i < 12; i++) addStats({ duels: 1 });
    for (let i = 0; i < 3; i++) countSwipe();
    countScan(40, ['F:/Photos']);
    countScan(90, ['F:/Photos']);
    countScan(20, ['F:/Autres']);
    const { stats, earned } = await readStats();
    expect(stats).toMatchObject({ duels: 12, swipes: 3, swipeMinute: 3, scans: 3, folders: 2, biggestScan: 90, days: 1 });
    expect(Object.keys(earned)).toEqual(['firstDuel']);
    expect(seen).toHaveLength(1);

    addStats({ removedDup: 5_000, freed: 2e9 });
    await readStats();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatch(/6/);
    // Une annulation ne reprend pas les badges, et ne les annonce pas deux fois.
    addStats({ removedDup: -5_000 });
    addStats({ removedDup: 5_000 });
    expect(Object.keys((await readStats()).earned)).toHaveLength(7);
    expect(seen).toHaveLength(2);
    off();
  });
});
