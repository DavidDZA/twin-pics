import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LANG, T } from './i18n';
import './styles.css';
import './sort.css';
import './theme.css';

document.documentElement.lang = LANG;
document.title = `Twin Pics · ${T.app.tagline}`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
