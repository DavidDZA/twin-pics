/**
 * Trois écrans : départ (choisir un dossier), analyse (progression), résultats (doublons et photos inutiles, deux
 * fonctions séparées). Stats et badges : bouton en haut. Même interface sur le site et dans l'appli PC (`platform/`), qui seule supprime des photos.
 */
import { useCallback, useRef, useState } from 'react';
import { T } from './i18n';
import { canPickDirectory, listDirectory, listFileList, type Listing } from './lib/files';
import { scan, type Progress, type ScanResult } from './lib/scan';
import { setMeta } from './lib/db';
import { desktop, listDesktop, readRemoveSettings } from './platform';
import { StartScreen } from './components/StartScreen';
import { ScanScreen } from './components/ScanScreen';
import { Results } from './components/Results';
import { Footer } from './components/Footer';
import { StatsDialog } from './components/StatsDialog';
import { Toasts } from './components/Toasts';
import { countScan } from './lib/statsStore';

type Screen = { name: 'start'; error?: string } | { name: 'scan'; progress: Progress | { phase: 'listing'; done: number; total: 0 } } | { name: 'results'; result: ScanResult };

/**
 * D'où viennent les photos : un dossier ouvert avec la File System Access API (relançable), un champ d'envoi (site),
 * ou un dossier de l'appli PC.
 */
export type Source = { kind: 'handle'; handle: FileSystemDirectoryHandle } | { kind: 'files'; files: File[] } | { kind: 'desktop'; root: string };

const SIMILAR_KEY = 'opt-similar';
const JUNK_KEY = 'opt-junk-model';

/** Une option de la page de départ (cochée par défaut), retenue. */
function readOption(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'false';
  } catch {
    return true;
  }
}

function saveOption(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    // Préférence non retenue.
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [similar, setSimilarState] = useState(() => readOption(SIMILAR_KEY));
  const [junkModel, setJunkModelState] = useState(() => readOption(JUNK_KEY));
  const [stats, setStats] = useState(false);
  const source = useRef<Source | null>(null);
  const abort = useRef<AbortController | null>(null);

  const setSimilar = (v: boolean) => (setSimilarState(v), saveOption(SIMILAR_KEY, v));
  const setJunkModel = (v: boolean) => (setJunkModelState(v), saveOption(JUNK_KEY, v));

  const run = useCallback(
    async (src: Source) => {
      source.current = src;
      const controller = new AbortController();
      abort.current = controller;
      const listed = (done: number) => setScreen({ name: 'scan', progress: { phase: 'listing', done, total: 0 } });
      listed(0);
      try {
        let listing: Listing;
        if (src.kind === 'handle') listing = await listDirectory(src.handle, listed, controller.signal);
        else if (src.kind === 'desktop') {
          // Le dossier « À supprimer » choisi par l'utilisateur n'est pas analysé.
          const folder = readRemoveSettings().folder;
          listing = await listDesktop(desktop!, src.root, folder ? [folder] : [], listed);
        } else listing = listFileList(src.files);
        if (controller.signal.aborted) throw new DOMException('', 'AbortError');
        const result = await scan(listing, { similar, junkModel, signal: controller.signal, onProgress: (progress) => setScreen({ name: 'scan', progress }) });
        countScan(result.photos.length, src.kind === 'desktop' ? src.root : src.kind === 'handle' ? src.handle.name : (src.files[0]?.webkitRelativePath.split('/')[0] ?? ''));
        setScreen({ name: 'results', result });
      } catch (err) {
        if ((err as Error).name === 'AbortError') setScreen({ name: 'start' });
        else setScreen({ name: 'start', error: T.scan.failed(String((err as Error).message ?? err)) });
      }
    },
    [similar, junkModel],
  );

  const pickFolder = async () => {
    if (desktop) {
      const root = await desktop.pickFolder();
      if (root) await run({ kind: 'desktop', root });
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'photos', mode: 'read' });
      await setMeta('folder', handle);
      await run({ kind: 'handle', handle });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setScreen({ name: 'start', error: T.start.noAccess });
    }
  };

  const resume = async (last: FileSystemDirectoryHandle | string) => {
    if (typeof last === 'string') {
      if (await desktop?.openFolder(last)) await run({ kind: 'desktop', root: last });
      else setScreen({ name: 'start', error: T.start.noAccess });
      return;
    }
    const state = await last.requestPermission({ mode: 'read' });
    if (state === 'granted') await run({ kind: 'handle', handle: last });
    else setScreen({ name: 'start', error: T.start.noAccess });
  };

  const src = source.current;
  return (
    <div className="app">
      <header className="top">
        <h1>
          <img className="logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          Twin Pics
        </h1>
        {screen.name !== 'scan' && (
          <button className="secondary" onClick={() => setStats(true)}>
            {T.stats.title}
          </button>
        )}
      </header>
      <main>
        {screen.name === 'start' && (
          <StartScreen
            canPick={!!desktop || canPickDirectory()}
            similar={similar}
            onSimilar={setSimilar}
            junkModel={junkModel}
            onJunkModel={setJunkModel}
            onPick={pickFolder}
            onFiles={(files) => run({ kind: 'files', files })}
            onResume={resume}
            error={screen.error}
          />
        )}
        {screen.name === 'scan' && <ScanScreen progress={screen.progress} onStop={() => abort.current?.abort()} />}
        {screen.name === 'results' && (
          <Results
            result={screen.result}
            onRescan={src ? () => run(src) : undefined}
            canRescan={src?.kind === 'handle' || src?.kind === 'desktop'}
            onAnother={() => setScreen({ name: 'start' })}
            root={src?.kind === 'desktop' ? src.root : null}
          />
        )}
      </main>
      <Footer />
      {stats && <StatsDialog onClose={() => setStats(false)} />}
      <Toasts />
    </div>
  );
}
