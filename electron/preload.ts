import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi } from '../src/platform/bridge';

/** Pont entre l'interface et le processus principal : `window.twinPics` (types dans `src/platform/bridge.ts`). */
const api: DesktopApi = {
  pickFolders: () => ipcRenderer.invoke('folder:pick'),
  lastFolders: () => ipcRenderer.invoke('folder:last'),
  saveFolders: (paths) => ipcRenderer.invoke('folder:save', paths),
  openFolders: (paths) => ipcRenderer.invoke('folder:open', paths),
  list: (roots, exclude) => ipcRenderer.invoke('folder:list', roots, exclude),
  onListProgress: (listener) => {
    const handler = (_e: IpcRendererEvent, found: number) => listener(found);
    ipcRenderer.on('list:progress', handler);
    return () => ipcRenderer.removeListener('list:progress', handler);
  },
  pickRemoveFolder: (defaultPath) => ipcRenderer.invoke('remove-folder:pick', defaultPath),
  remove: (request) => ipcRenderer.invoke('photos:remove', request),
  restore: (moves) => ipcRenderer.invoke('photos:restore', moves),
  showInFolder: (path) => ipcRenderer.invoke('shell:show', path),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
};

contextBridge.exposeInMainWorld('twinPics', api);
