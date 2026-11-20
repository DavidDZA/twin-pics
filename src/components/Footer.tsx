import { LANG, LANG_NAMES, LANGS, T, setLanguage, type Lang } from '../i18n';

export function Footer() {
  return (
    <footer className="bottom">
      <label className="lang">
        <span>{T.language}</span>
        <select value={LANG} onChange={(e) => setLanguage(e.target.value as Lang)}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <a href="https://github.com/DavidDZA/twin-pics" target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  );
}
