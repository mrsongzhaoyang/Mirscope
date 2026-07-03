import { ipcMain, BrowserWindow } from 'electron';

function getWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerWindowHandlers(): void {
  ipcMain.handle('window:minimize', (event) => {
    getWindow(event)?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = getWindow(event);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  ipcMain.handle('window:close', (event) => {
    getWindow(event)?.close();
  });

  ipcMain.handle('window:isMaximized', (event) => {
    return getWindow(event)?.isMaximized() ?? false;
  });
}
