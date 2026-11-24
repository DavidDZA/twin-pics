/**
 * Trois écrans : départ (liste des dossiers), analyse (progression), résultats (doublons et photos inutiles, deux
 * fonctions séparées). Stats et badges : bouton en haut. Même interface sur le site et dans l'appli PC (`platform/`), qui seule supprime des photos.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from './i18n';
import { canPickDirectory, listDirectory, listFileList, mergeListings, type Listing } from './lib/files';
import { addFolder, folderLabels, folderName, uniqueNames, type Folder } from './lib/folders';
import { scan, type Progress, type ScanResult } from './lib/scan';
import { getMeta, setMeta } from './lib/db';
import { notify } from './lib/notify';
import { desktop, listDesktop, readRemoveSettings } from './platform';
import { StartScreen } from './components/StartScreen';
import { ScanScreen } from './components/ScanScreen';
import { Results } from './components/Results';
import { Footer } from './components/Footer';
import { StatsDialog } from './components/StatsDialog';
import { Toasts } from './components/Toasts';
import { countScan } from './lib/statsStore';

/** Dossiers vraiment analysés : leurs noms et, dans l'appli PC, leurs chemins (pour supprimer). */
interface Scanned {
  names: string[];
  roots: string[];
}

type Screen =
  | { name: 'start'; error?: string }
  | { name: 'scan'; progress: Progress | { phase: 'listing'; done: number; total: 0 } }
  | { name: 'results'; result: ScanResult; scanned: Scanned };

const SIMILAR_KEY = 'opt-similar';
const JUNK_KEY = 'opt-junk-model';
/** Site : accès aux dossiers de la dernière fois (meta) ; `folder` : le seul, jusqu'à la 0.7. */
const FOLDERS_META = 'folders';

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

/** Les dossiers de la dernière fois. */
async function readFolders(): Promise<Folder[]> {
  if (desktop) return (await desktop.lastFolders()).map((f) => ({ kind: 'desktop', ...f }));
  if (!canPickDirectory()) return [];
  const one = await getMeta<FileSystemDirectoryHandle>('folder');
  const handles = (await getMeta<FileSystemDirectoryHandle[]>(FOLDERS_META)) ?? (one ? [one] : []);
  return handles.map((handle) => ({ kind: 'handle', handle }));
}

function saveFolders(list: Folder[]): void {
  if (desktop) void desktop.saveFolders(list.flatMap((f) => (f.kind === 'desktop' ? [f.path] : [])));
  else void setMeta(FOLDERS_META, list.flatMap((f) => (f.kind === 'handle' ? [f.handle] : []))).catch(() => undefined);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [folders, setFoldersState] = useState<Folder[]>([]);
  const [similar, setSimilarState] = useState(() => readOption(SIMILAR_KEY));
  const [junkModel, setJunkModelState] = useState(() => readOption(JUNK_KEY));
  const [stats, setStats] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const setSimilar = (v: boolean) => (setSimilarState(v), saveOption(SIMILAR_KEY, v));
  const setJunkModel = (v: boolean) => (setJunkModelState(v), saveOption(JUNK_KEY, v));
  const setFolders = (list: Folder[]) => (setFoldersState(list), saveFolders(list));

  useEffect(() => {
    // Un dossier choisi avant la fin de la lecture l'emporte.
    readFolders().then(
      (saved) => setFoldersState((now) => (now.length ? now : saved)),
      () => undefined,
    );
  }, []);

  const add = async (added: Folder[]) => {
    let list = folders;
    for (const f of added) {
      const r = await addFolder(list, f);
      list = r.list;
      if (r.covered !== undefined) notify({ text: T.start.covered(folderName(f), r.covered) });
      else if (r.replaced.length) notify({ text: T.start.replaced(folderName(f), r.replaced.join(', ')) });
    }
    setFolders(list);
    setScreen({ name: 'start' });
  };

  const pickFolder = async () => {
    if (desktop) {
      const paths = await desktop.pickFolders();
      if (paths.length) await add(paths.map((path) => ({ kind: 'desktop', path })));
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'photos', mode: 'read' });
      await add([{ kind: 'handle', handle }]);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setScreen({ name: 'start', error: T.start.noAccess });
    }
  };

  /** Les dossiers qui s'ouvrent : ceux débranchés, supprimés ou refusés sont laissés de côté, et signalés. */
  const openFolders = async (): Promise<Folder[]> => {
    const found = desktop && (await desktop.openFolders(folders.flatMap((f) => (f.kind === 'desktop' ? [f.path] : []))));
    const ok: Folder[] = [];
    for (const f of folders) {
      let open = true;
      if (f.kind === 'desktop') open = !!found?.includes(f.path);
      else if (f.kind === 'handle') open = (await f.handle.requestPermission({ mode: 'read' }).catch(() => 'denied')) === 'granted';
      if (open) ok.push(f);
      else notify({ text: T.start.skipped(folderName(f)) });
    }
    if (found) setFoldersState(folders.map((f) => (f.kind === 'desktop' ? { ...f, missing: !found.includes(f.path) } : f)));
    return ok;
  };

  const run = useCallback(
    async (list: Folder[]) => {
      const controller = new AbortController();
      abort.current = controller;
      const listed = (done: number) => setScreen({ name: 'scan', progress: { phase: 'listing', done, total: 0 } });
      listed(0);
      const roots = list.flatMap((f) => (f.kind === 'desktop' ? [f.path] : []));
      const names = desktop ? folderLabels(roots) : uniqueNames(list.map(folderName));
      try {
        let listing: Listing;
        if (desktop) {
          // Le dossier « À supprimer » choisi par l'utilisateur n'est pas analysé.
          const folder = readRemoveSettings().folder;
          listing = await listDesktop(desktop, roots, folder ? [folder] : [], listed);
        } else {
          const lists: Listing[] = [];
          for (const [i, f] of list.entries()) {
            const before = lists.reduce((s, l) => s + l.images.length, 0);
            if (f.kind === 'handle') lists.push(await listDirectory(f.handle, names[i], i, (n) => listed(before + n), controller.signal));
            else if (f.kind === 'files') lists.push(listFileList(f.files, names[i], i));
          }
          listing = mergeListings(lists);
        }
        if (controller.signal.aborted) throw new DOMException('', 'AbortError');
        const result = await scan(listing, { similar, junkModel, signal: controller.signal, onProgress: (progress) => setScreen({ name: 'scan', progress }) });
        countScan(result.photos.length, desktop ? roots : names);
        setScreen({ name: 'results', result, scanned: { names, roots } });
      } catch (err) {
        if ((err as Error).name === 'AbortError') setScreen({ name: 'start' });
        else setScreen({ name: 'start', error: T.scan.failed(String((err as Error).message ?? err)) });
      }
    },
    [similar, junkModel],
  );

  const analyze = async () => {
    const list = await openFolders();
    if (list.length) await run(list);
    else setScreen({ name: 'start', error: T.start.noAccess });
  };

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
            folders={folders}
            onFolders={setFolders}
            similar={similar}
            onSimilar={setSimilar}
            junkModel={junkModel}
            onJunkModel={setJunkModel}
            onPick={pickFolder}
            onFiles={(files) => void add([{ kind: 'files', name: files[0].webkitRelativePath.split('/')[0] || files[0].name, files }])}
            onAnalyze={analyze}
            error={screen.error}
          />
        )}
        {screen.name === 'scan' && <ScanScreen progress={screen.progress} onStop={() => abort.current?.abort()} />}
        {screen.name === 'results' && (
          <Results
            result={screen.result}
            onRescan={folders.some((f) => f.kind === 'files') ? undefined : analyze}
            onFolders={() => setScreen({ name: 'start' })}
            names={screen.scanned.names}
            roots={screen.scanned.roots}
          />
        )}
      </main>
      <Footer />
      {stats && <StatsDialog onClose={() => setStats(false)} />}
      <Toasts />
    </div>
  );
}
