import { T, bytes, dateTime } from '../i18n';
import { likeness, type Group, type PhotoInfo } from '../lib/groups';

/** Ressemblance affichée sous une photo : avec la suggestion du groupe. */
export function likenessText(photos: PhotoInfo[], group: Group, i: number): string | null {
  if (i === group.best) return null;
  const a = photos[group.best];
  const b = photos[i];
  if (a.sha && a.sha === b.sha) return T.group.identical;
  const { dist, sim } = likeness(photos, group.best, i);
  if (group.kind === 'similar' && sim !== undefined) return T.group.sim(Math.round(sim * 100));
  return dist !== undefined ? T.group.dist(dist) : null;
}

/** « 4000 × 3000 · 3,2 Mo · 14 juil. 2024, 15:30 » */
export function photoDetails(p: PhotoInfo, withDate = true): string {
  return [p.width && p.height ? `${p.width} × ${p.height}` : '', bytes(p.size), withDate && p.time ? dateTime(p.time) : ''].filter(Boolean).join(' · ');
}
