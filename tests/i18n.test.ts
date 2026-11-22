import { describe, expect, it } from 'vitest';
import { DICTS, LANGS, bytes, deviceLang, duration } from '../src/i18n';
import { REMOVE_DIR_PREFIX, isSkippedDir } from '../src/lib/filetypes';

type Tree = { [k: string]: unknown };

/** Toutes les clés d'un dictionnaire, et chaque texte (les fonctions appelées avec des valeurs d'essai). */
function walk(tree: Tree, prefix = ''): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix + k;
    if (typeof v === 'string') out.set(key, [v]);
    else if (typeof v === 'function') {
      const one = Array.from({ length: v.length }, () => 1);
      const three = Array.from({ length: v.length }, () => 3);
      out.set(key, [String(v(...one)), String(v(...three))]);
    } else for (const [k2, v2] of walk(v as Tree, key + '.')) out.set(k2, v2);
  }
  return out;
}

describe('traduction', () => {
  const fr = walk(DICTS.fr);

  it.each(LANGS)('%s : mêmes clés que le français, aucun texte vide', (lang) => {
    const dict = walk(DICTS[lang]);
    expect([...dict.keys()].sort()).toEqual([...fr.keys()].sort());
    for (const [key, texts] of dict) for (const t of texts) expect(t.trim(), key).not.toBe('');
  });

  it.each(LANGS.filter((l) => l !== 'fr'))('%s : aucun texte resté en français', (lang) => {
    const dict = walk(DICTS[lang]);
    // Mots qui s'écrivent vraiment pareil : « Suggestion », « 1 photo » et « Duels » en anglais, « l’originale » en italien.
    const sameForReal = new Set(['en:group.suggestion', 'en:group.photos', 'en:sort.duels', 'it:group.reasons.original']);
    const same = [...dict].filter(([key, texts]) => texts[0] === fr.get(key)![0] && /[a-zà-ÿ]{4,}/i.test(texts[0]) && !sameForReal.has(`${lang}:${key}`));
    expect(same.map(([k]) => k)).toEqual([]);
  });

  it('pas d’espace avant « : ! ? ; » hors du français', () => {
    for (const lang of LANGS.filter((l) => l !== 'fr')) {
      for (const [key, texts] of walk(DICTS[lang])) for (const t of texts) expect(/\s[:!?;]/.test(t), `${lang} ${key} : ${t}`).toBe(false);
    }
  });

  it('les phrases « non analysés » n’ont que les parties utiles', () => {
    expect(DICTS.fr.results.skipped(0, 2, 0)).toBe('Non analysés : 2 photos HEIC (iPhone), pas encore prises en charge.');
    expect(DICTS.en.results.skipped(1, 0, 3)).toBe('Not analyzed: 1 unreadable photo, 3 videos.');
  });

  it.each(LANGS)('%s : le dossier « À supprimer » n’est jamais analysé', (lang) => {
    expect(DICTS[lang].remove.folderName.startsWith(REMOVE_DIR_PREFIX)).toBe(true);
    expect(isSkippedDir(DICTS[lang].remove.folderName)).toBe(true);
  });

  it('langue de l’appareil, sinon l’anglais', () => {
    expect(deviceLang(['de-AT', 'fr'])).toBe('de');
    expect(deviceLang(['pt-BR'])).toBe('pt');
    expect(deviceLang(['ja-JP', 'es-MX'])).toBe('es');
    expect(deviceLang(['ja-JP'])).toBe('en');
    expect(deviceLang([])).toBe('en');
  });

  it('tailles et durées lisibles', () => {
    expect(bytes(12_400_000, 'fr')).toMatch(/^12\sMo$/);
    expect(bytes(1_234_000_000, 'en')).toBe('1.2 GB');
    expect(duration(45, 'en')).toMatch(/^45 sec/);
    expect(duration(200, 'en')).toMatch(/^3 min 20 sec/);
  });
});
