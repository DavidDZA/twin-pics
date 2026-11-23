import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('base de la version 0.4 reprise : le tri des photos inutiles passe dans sa table, le reste est intact', async () => {
  const old = new Dexie('twin-pics');
  old.version(1).stores({ photos: '&key', thumbs: '&key', labels: '&groupId, verdict', meta: '&key' });
  old.version(2).stores({ marks: '&key, groupId' });
  await old.table('photos').put({ key: 'a', path: 'a', size: 1, lastModified: 1 });
  await old.table('marks').bulkPut([
    { key: 'a', mark: 'remove', groupId: '1abc', at: 1 },
    { key: 'b', mark: 'keep', groupId: 'j1abc', at: 2 },
  ]);
  await old.table('labels').put({ groupId: '1abc', verdict: 'wrong', kind: 'near', keys: ['a', 'c'], at: 1 });
  old.close();

  const { db } = await import('../src/lib/db');
  expect((await db.junkMarks.toArray()).map((r) => [r.key, r.mark])).toEqual([['b', 'keep']]);
  expect((await db.marks.get('a'))?.mark).toBe('remove');
  expect(await db.photos.count()).toBe(1);
  expect((await db.labels.get('1abc'))?.verdict).toBe('wrong');
});
