import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('desktopWindowControls', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('desktop-window:minimize'),
  toggleMaximize: () => ipcRenderer.send('desktop-window:toggle-maximize'),
  close: () => ipcRenderer.send('desktop-window:close'),
  isMaximized: () => ipcRenderer.invoke('desktop-window:is-maximized') as Promise<boolean>,
  onMaximizedChange: (listener: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
    ipcRenderer.on('desktop-window:maximized-change', handler);
    return () => ipcRenderer.removeListener('desktop-window:maximized-change', handler);
  },
});
