import { LANG, LANG_NAMES, LANGS, T, setLanguage, type Lang } from '../i18n';
import { RELEASES_URL, desktop } from '../platform';

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
      <span className="links">
        {!desktop && (
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            {T.app.getPc}
          </a>
        )}
        <a href="https://github.com/DavidDZA/twin-pics" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </span>
    </footer>
  );
}
