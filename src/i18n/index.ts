/**
 * Langue de l'interface : celle de l'appareil si elle est traduite (sinon l'anglais), modifiable en bas de page.
 * Lue une fois au démarrage : changer de langue recharge l'appli.
 *
 * Un dictionnaire par langue (fr.ts en référence, typé : la compilation échoue s'il manque un texte ailleurs).
 */
import { fr, type Dict } from './fr';
import { en } from './en';
import { es } from './es';
import { de } from './de';
import { it } from './it';
import { pt } from './pt';

export type { Dict };

export const LANGS = ['fr', 'en', 'es', 'de', 'it', 'pt'] as const;
export type Lang = (typeof LANGS)[number];

export const DICTS: Record<Lang, Dict> = { fr, en, es, de, it, pt };

export const LANG_NAMES: Record<Lang, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português (Brasil)',
};

const LANG_KEY = 'app-lang';

function stored(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

const isLang = (l: string | null | undefined): l is Lang => !!l && (LANGS as readonly string[]).includes(l);

/** Langue de l'appareil : la première des langues préférées qui est traduite, sinon l'anglais. */
export function deviceLang(prefs: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]): Lang {
  for (const p of prefs) {
    const l = p?.slice(0, 2).toLowerCase();
    if (isLang(l)) return l;
  }
  return 'en';
}

const choice = stored();
export const LANG: Lang = isLang(choice) ? choice : deviceLang();
export const T: Dict = DICTS[LANG];

/** Locale des nombres et des dates (portugais du Brésil). */
export const LOCALE = LANG === 'pt' ? 'pt-BR' : LANG;

export function setLanguage(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Stockage indisponible : le choix ne sera pas retenu.
  }
  location.reload();
}

const numberFormat = new Intl.NumberFormat(LOCALE);
export const num = (n: number) => numberFormat.format(n);

/** Taille de fichier lisible (« 12,4 Mo », « 1,2 GB »). */
export function bytes(n: number, locale = LOCALE): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
  let i = 0;
  let v = n;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return new Intl.NumberFormat(locale, { style: 'unit', unit: units[i], unitDisplay: 'short', maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v);
}

/** Durée lisible (« 3 min 20 s », « 45 s »). */
export function duration(seconds: number, locale = LOCALE): string {
  const s = Math.max(1, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const part = (v: number, unit: 'hour' | 'minute' | 'second') => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(v);
  if (h) return `${part(h, 'hour')} ${part(m, 'minute')}`;
  if (m) return sec ? `${part(m, 'minute')} ${part(sec, 'second')}` : part(m, 'minute');
  return part(sec, 'second');
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
export const dateTime = (ms: number) => dateFormat.format(ms);
