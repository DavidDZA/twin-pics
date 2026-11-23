/**
 * Le swipe des photos inutiles, **une photo à la fois** (demandé le 23/11/2026 : plus de carte pour tout un groupe, pas
 * de résumé à la fin). Les photos suivent l'ordre des groupes (celles qui se ressemblent à la suite) ; après la
 * dernière, on revient à la liste.
 */
import { useState } from 'react';
import { T } from '../i18n';
import type { Group, PhotoInfo } from '../lib/groups';
import type { FoundFile } from '../lib/files';
import type { Mark } from '../lib/choices';
import { SwipeCard } from './SwipeCard';
import { useThumbs } from './useThumbs';
import { Viewer } from './Viewer';

/** Une photo de la file : son groupe (et son rang), son indice. */
export interface SwipeItem {
  group: Group;
  rank: number;
  photo: number;
}

export function swipeQueue(groups: Group[]): SwipeItem[] {
  return groups.flatMap((group, rank) => group.members.map((photo) => ({ group, rank, photo })));
}

interface Props {
  queue: SwipeItem[];
  pos: number;
  onPos: (pos: number) => void;
  photos: PhotoInfo[];
  files: Map<string, FoundFile>;
  marks: ReadonlyMap<string, Mark>;
  /** La photo suivante à montrer (déjà triées sautées) ; `null` : fini. */
  nextOf: (pos: number) => number | null;
  onSave: (item: SwipeItem, mark: Mark) => void;
  onEnd: () => void;
}

export function SwipeSorter({ queue, pos, onPos, photos, files, marks, nextOf, onSave, onEnd }: Props) {
  const [viewing, setViewing] = useState(false);
  const item = queue[pos];
  const photo = photos[item.photo];
  const after = nextOf(pos);
  const following = after === null ? undefined : photos[queue[after].photo];
  const thumbs = useThumbs([photo.key, ...(following ? [following.key] : [])]);
  const go = () => (after === null ? onEnd() : onPos(after));

  return (
    <div className="sorter-body swipe-body">
      <SwipeCard
        key={photo.key}
        photo={photo}
        reasons={item.group.junk?.reasons[item.photo] ?? []}
        mark={marks.get(photo.key)}
        file={files.get(photo.key)}
        thumb={thumbs.get(photo.key)}
        nextFile={following && files.get(following.key)}
        nextThumb={following && thumbs.get(following.key)}
        paused={viewing}
        onDecide={(mark) => {
          onSave(item, mark);
          go();
        }}
        onZoom={() => setViewing(true)}
      />
      <div className="sorter-actions">
        <button className="secondary" onClick={() => onPos(pos - 1)} disabled={pos === 0}>
          ‹ {T.sort.prev}
        </button>
        <button className="secondary" onClick={go}>
          {T.sort.skip} ›
        </button>
      </div>
      {viewing && <Viewer group={item.group} start={item.group.members.indexOf(item.photo)} photos={photos} files={files} onClose={() => setViewing(false)} />}
    </div>
  );
}
