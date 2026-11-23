/**
 * Appli PC (Electron) : la même interface que le site, dans une fenêtre, avec un vrai accès au disque (lister un
 * dossier, lire les photos, les mettre dans la Corbeille ou les déplacer).
 *
 * L'interface est servie par le protocole `app://twin-pics/` (fichiers de `dist/`) : une origine stable et sûre, où
 * marchent les workers, IndexedDB, le cache du modèle et la carte graphique (WebGPU), comme sur le site. Les photos
 * sont lues par `app://twin-pics/_photo/<chemin>`, seulement dans les dossiers choisis par l'utilisateur.
 *
 * Variables d'environnement (tests) : TP_USER_DATA (dossier de l'appli), TP_PICK_FOLDER et TP_PICK_REMOVE_FOLDER
 * (réponses des fenêtres de choix de dossier, qui ne s'automatisent pas), TP_FAKE_TRASH (dossier qui remplace la
 * Corbeille), VITE_DEV_URL (interface servie par Vite en développement).
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Move, RemoveRequest } from '../src/platform/bridge';
import { listFolder } from './list';
import { insideAny, toNative, toSlash } from './paths';
import { moveFile, freePath, removePhotos, restorePhotos } from './remove';

if (process.env.TP_USER_DATA) app.setPath('userData', process.env.TP_USER_DATA);
app.setName('Twin Pics');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const DIST = join(app.getAppPath(), 'dist');
const settingsFile = () => join(app.getPath('userData'), 'reglages.json');

interface Settings {
  lastFolder?: string;
}

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsFile(), 'utf8')) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(patch: Settings): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }, null, 2));
  } catch {
    // Réglage non retenu.
  }
}

/** Dossiers choisis par l'utilisateur pendant cette session : les seuls dont les photos peuvent être lues ou touchées. */
const roots = new Set<string>();
/** Dossiers « À supprimer » choisis : on peut y reprendre des photos (annuler). */
const removeFolders = new Set<string>();

const allow = (path: string) => roots.add(toNative(path));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

async function serveFile(path: string, extra: Record<string, string> = {}): Promise<Response> {
  const res = await net.fetch(pathToFileURL(path).toString());
  const headers = new Headers(res.headers);
  const type = TYPES[extname(path).toLowerCase()];
  if (type) headers.set('Content-Type', type);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function handleProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'twin-pics') return new Response('Introuvable', { status: 404 });
    if (url.pathname.startsWith('/_photo/')) {
      const path = toNative(decodeURIComponent(url.pathname.slice('/_photo/'.length)));
      if (!insideAny(roots, path) || !existsSync(path)) return new Response('Introuvable', { status: 404 });
      // L'interface de développement (Vite, autre origine) lit aussi les photos.
      return serveFile(path, { 'Access-Control-Allow-Origin': '*' });
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = normalize(join(DIST, rel));
    if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) return serveFile(join(DIST, 'index.html'));
    return serveFile(file);
  });
}

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 360,
    minHeight: 500,
    title: 'Twin Pics',
    // Même fond que la barre d'ouverture (index.html) : pas d'éclair blanc.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12131a' : '#f6f7fb',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.loadURL(process.env.VITE_DEV_URL ?? 'app://twin-pics/');
  // Liens externes (GitHub) : dans le navigateur, pas dans l'appli.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => (win = null));
}

async function pickDirectory(title: string, defaultPath?: string, env?: string): Promise<string | null> {
  if (env && process.env[env]) return process.env[env]!;
  const r = await dialog.showOpenDialog(win!, { title, defaultPath, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
}

/** Corbeille de Windows, ou dossier d'essai (TP_FAKE_TRASH) pour les tests. */
async function trash(path: string): Promise<void> {
  const fake = process.env.TP_FAKE_TRASH;
  if (!fake) return shell.trashItem(path);
  if (process.env.TP_FAKE_TRASH_FAIL) throw new Error('pas de Corbeille sur ce disque');
  await moveFile(path, await freePath(join(fake, basename(path))));
}

function registerIpc(): void {
  ipcMain.handle('folder:pick', async () => {
    const path = await pickDirectory('Dossier de photos', readSettings().lastFolder, 'TP_PICK_FOLDER');
    if (!path) return null;
    allow(path);
    writeSettings({ lastFolder: path });
    return toSlash(toNative(path));
  });
  ipcMain.handle('folder:last', () => {
    const last = readSettings().lastFolder;
    return last && existsSync(last) ? toSlash(toNative(last)) : null;
  });
  ipcMain.handle('folder:open', (_e, path: string) => {
    if (!existsSync(toNative(path))) return false;
    allow(path);
    writeSettings({ lastFolder: toNative(path) });
    return true;
  });
  ipcMain.handle('folder:list', (e, root: string, exclude: string[] = []) => {
    if (!insideAny(roots, root)) throw new Error('dossier non choisi');
    return listFolder(toNative(root), (found) => e.sender.send('list:progress', found), exclude.map(toNative));
  });
  ipcMain.handle('remove-folder:pick', async (_e, defaultPath?: string) => {
    const path = await pickDirectory('Dossier « À supprimer »', defaultPath && existsSync(toNative(defaultPath)) ? toNative(defaultPath) : undefined, 'TP_PICK_REMOVE_FOLDER');
    return path ? toSlash(toNative(path)) : null;
  });
  ipcMain.handle('photos:remove', (_e, req: RemoveRequest) => {
    if (!insideAny(roots, req.root)) throw new Error('dossier non choisi');
    if (req.folder) removeFolders.add(toNative(req.folder));
    return removePhotos(req, { trash });
  });
  ipcMain.handle('photos:restore', (_e, moves: Move[]) => {
    const ok = moves.filter((m) => insideAny(removeFolders, m.from) && insideAny(roots, m.to));
    return restorePhotos(ok);
  });
  ipcMain.handle('shell:show', (_e, path: string) => {
    const p = toNative(path);
    if (existsSync(p) && statSync(p).isDirectory()) void shell.openPath(p);
    else shell.showItemInFolder(p);
  });
  ipcMain.handle('shell:external', (_e, url: string) => {
    if (/^https:\/\//.test(url)) return shell.openExternal(url);
  });
}

// Une seule fenêtre à la fois : deux appli ouvertes se disputeraient la base locale.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win?.isMinimized()) win.restore();
    win?.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    handleProtocol();
    registerIpc();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
