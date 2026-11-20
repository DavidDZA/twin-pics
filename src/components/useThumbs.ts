import { useEffect, useState } from 'react';
import { db } from '../lib/db';

/** Adresses des miniatures (gardées en base) de quelques photos ; libérées quand le composant disparaît. */
export function useThumbs(keys: string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const id = keys.join('\n');

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    db.thumbs.bulkGet(keys).then((rows) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      rows.forEach((row, i) => {
        if (!row) return;
        const url = URL.createObjectURL(row.blob);
        made.push(url);
        map.set(keys[i], url);
      });
      setUrls(map);
    });
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return urls;
}
