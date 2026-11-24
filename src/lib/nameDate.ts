/**
 * Date de prise de vue lue dans le nom du fichier, pour les photos qui ont perdu leur date EXIF (logiciel, envoi) :
 * « IMG_20210505_172047.jpg », « 20240428_130249.jpg », « PXL_20230714_101112123.jpg », « 2021-05-05 17.20.47.jpg ».
 *
 * Vérifié le 24/11/2026 sur les photos de l'utilisateur : 1 464 sur 1 468 tombent à 4 s au plus de leur date EXIF, mais le
 * plus souvent à 1 à 3 s, jamais exactement : une date lue dans un nom ne se compare pas à la seconde à une date EXIF
 * (`burstShots`, groups.ts).
 */
import { nameOf } from './filetypes';

/** Noms donnés par un appareil photo. Pas les captures d'écran (PNG, « Screenshot_… »). */
const CAMERA_NAME = /^(IMG|MVIMG|PXL|BURST|PANO|PORTRAIT|DSC|P)?[_-]?((?:19|20)\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})(?:\d{3})?(?!\d).*\.jpe?g$/i;
/** « 2021-05-05 17.20.47.jpg » (envoi automatique de Dropbox). */
const SPACED_NAME = /^()((?:19|20)\d{2})-(\d{2})-(\d{2})[ _](\d{2})[.-](\d{2})[.-](\d{2})(?!\d).*\.jpe?g$/i;

/** Messageries : leurs noms portent la date de l'envoi ou de l'enregistrement, pas celle de la prise de vue. */
const MESSAGING = /whatsapp|telegram|messenger|signal|snapchat/i;

/** La date (en millisecondes), ou `undefined` si le nom n'en dit pas une, à la seconde. */
export function nameTime(path: string): number | undefined {
  if (MESSAGING.test(path)) return undefined;
  const name = nameOf(path);
  const m = CAMERA_NAME.exec(name) ?? SPACED_NAME.exec(name);
  if (!m) return undefined;
  const [year, month, day, hour, minute, second] = m.slice(2, 8).map(Number);
  if (year < 1990 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return undefined;
  if (day > new Date(year, month, 0).getDate()) return undefined;
  // Les Pixel (« PXL_ ») écrivent l'heure universelle, les autres l'heure locale (comme l'EXIF).
  const utc = m[1]?.toUpperCase() === 'PXL';
  const time = utc ? Date.UTC(year, month - 1, day, hour, minute, second) : new Date(year, month - 1, day, hour, minute, second).getTime();
  // Une date à venir (un jour de marge) est un simple numéro.
  return time <= Date.now() + 86_400_000 ? time : undefined;
}
