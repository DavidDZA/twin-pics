import { describe, expect, it } from 'vitest';
import { buildGroups, DEFAULTS, findPairs, type Group, type PhotoInfo } from '../src/lib/groups';
import {
  allAs,
  challenger,
  duelDone,
  initialChoice,
  isSorted,
  onlyKeep,
  pendingRemoval,
  pickWinner,
  startDuel,
  suggestionOnly,
  toggle,
  type Mark,
} from '../src/lib/choices';

/** Trois copies exactes (l'originale, la copie WhatsApp, « Copie ») et deux autres copies exactes. */
function setup() {
  const p = (path: string, sha: string, size: number, lastModified: number): PhotoInfo => ({ key: path, path, name: path.split('/').pop()!, size, lastModified, sha });
  const photos = [
    p('Photos/WhatsApp Images/IMG-1.jpg', 'aaa', 2_000_000, 20),
    p('Photos/plage.jpg', 'aaa', 2_000_000, 10),
    p('Photos/plage - Copie.jpg', 'aaa', 2_000_000, 30),
    p('Photos/chat.jpg', 'bbb', 1_000_000, 40),
    p('Photos/chat (1).jpg', 'bbb', 1_000_000, 50),
  ];
  const groups = buildGroups(photos, findPairs(photos), DEFAULTS);
  const plage = groups.find((g) => g.members.length === 3)!;
  const chat = groups.find((g) => g.members.length === 2)!;
  return { photos, groups, plage, chat };
}

const marksOf = (...choices: Record<string, Mark>[]) => new Map(choices.flatMap((c) => Object.entries(c)));
const names = (photos: PhotoInfo[], idx: number[]) => idx.map((i) => photos[i].name).sort();

describe('tri d’un groupe', () => {
  it('par défaut, on ne garde que la suggestion', () => {
    const { photos, plage } = setup();
    const c = suggestionOnly(plage, photos);
    expect(c).toEqual({ 'Photos/plage.jpg': 'keep', 'Photos/WhatsApp Images/IMG-1.jpg': 'remove', 'Photos/plage - Copie.jpg': 'remove' });
  });

  it('on peut en garder plusieurs, ou aucune', () => {
    const { photos, plage } = setup();
    const two = toggle(suggestionOnly(plage, photos), 'Photos/plage - Copie.jpg');
    expect(Object.values(two).filter((m) => m === 'keep')).toHaveLength(2);
    expect(Object.values(allAs(plage, photos, 'remove')).every((m) => m === 'remove')).toBe(true);
    expect(Object.values(allAs(plage, photos, 'keep')).every((m) => m === 'keep')).toBe(true);
    expect(toggle(toggle(two, 'Photos/plage.jpg'), 'Photos/plage.jpg')).toEqual(two);
  });

  it('un groupe est trié quand toutes ses photos le sont ; sinon ses choix sont repris', () => {
    const { photos, plage } = setup();
    expect(isSorted(plage, photos, new Map())).toBe(false);
    expect(isSorted(plage, photos, marksOf(suggestionOnly(plage, photos)))).toBe(true);
    // Une seule photo déjà triée (groupe agrandi par les réglages) : son choix est gardé, le reste par défaut.
    const partial = new Map<string, Mark>([['Photos/plage - Copie.jpg', 'keep']]);
    expect(isSorted(plage, photos, partial)).toBe(false);
    expect(initialChoice(plage, photos, partial)).toEqual({ 'Photos/plage.jpg': 'keep', 'Photos/WhatsApp Images/IMG-1.jpg': 'remove', 'Photos/plage - Copie.jpg': 'keep' });
  });
});

describe('photos à supprimer', () => {
  it('seulement celles des groupes triés, avec la place libérée', () => {
    const { photos, groups, plage, chat } = setup();
    const p = pendingRemoval(groups, photos, marksOf(suggestionOnly(plage, photos)));
    expect(p.sorted).toBe(1);
    expect(names(photos, p.remove)).toEqual(['IMG-1.jpg', 'plage - Copie.jpg']);
    expect(p.keep).toBe(1);
    expect(p.bytes).toBe(4_000_000);
    expect(p.noneKept).toBe(0);
    expect(p.plans.map((x) => x.group.id)).toEqual([plage.id]);
    expect(isSorted(chat, photos, marksOf(suggestionOnly(plage, photos)))).toBe(false);
  });

  it('« tout supprimer » est signalé ; « tout garder » ne supprime rien', () => {
    const { photos, groups, plage, chat } = setup();
    const p = pendingRemoval(groups, photos, marksOf(allAs(plage, photos, 'keep'), allAs(chat, photos, 'remove')));
    expect(p.sorted).toBe(2);
    expect(p.noneKept).toBe(1);
    expect(names(photos, p.remove)).toEqual(['chat (1).jpg', 'chat.jpg']);
    expect(p.plans).toHaveLength(1);
  });

  it('une photo marquée qui n’est plus dans un groupe n’est jamais supprimée', () => {
    const { photos } = setup();
    const marks = new Map<string, Mark>([['Photos/plage - Copie.jpg', 'remove']]);
    const noGroups: Group[] = [];
    expect(pendingRemoval(noGroups, photos, marks).remove).toEqual([]);
  });
});

describe('duels', () => {
  it('la suggestion affronte la suivante, la gagnante affronte la suivante, puis on ne garde qu’elle', () => {
    const { photos, plage } = setup();
    let d = startDuel(plage);
    expect(d.champion).toBe(plage.best);
    expect(duelDone(d)).toBe(false);
    // Premier duel : la copie gagne contre la suggestion.
    const first = challenger(d);
    d = pickWinner(d, first);
    expect(d.champion).toBe(first);
    expect(duelDone(d)).toBe(false);
    // Second duel : elle gagne encore.
    d = pickWinner(d, d.champion);
    expect(duelDone(d)).toBe(true);
    const c = onlyKeep(plage, photos, d.champion);
    expect(Object.entries(c).filter(([, m]) => m === 'keep').map(([k]) => k)).toEqual([photos[first].key]);
  });

  it('un groupe de deux photos : un seul duel', () => {
    const { chat } = setup();
    const d = pickWinner(startDuel(chat), chat.members[1]);
    expect(duelDone(d)).toBe(true);
    expect(d.champion).toBe(chat.members[1]);
  });
});
