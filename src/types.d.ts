// File System Access API (Chrome, Edge) : pas encore dans les types DOM de TypeScript.
interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>;
}
