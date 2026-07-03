import { app, BrowserWindow, Menu, screen, shell } from 'electron';
import { join } from 'node:path';
import { initDatabase, closeDatabase, purgeNoisePrompts, purgePromptResponses } from '@mirscope/database';
import { ConnectorManager } from './connector-manager.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { getDataPath } from './paths.js';
import { registerWindowHandlers } from './window-handlers.js';

let mainWindow: BrowserWindow | null = null;
let connectorManager: ConnectorManager | null = null;

function getDefaultWindowSize(): { width: number; height: number } {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1100, Math.round(screenW * 0.72));
  const height = Math.min(720, Math.round(screenH * 0.78));
  return {
    width: Math.max(880, width),
    height: Math.max(560, height),
  };
}

async function createWindow(): Promise<void> {
  const { width, height } = getDefaultWindowSize();

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 880,
    minHeight: 560,
    center: true,
    title: 'Mirscope - 全身镜',
    show: false,
    frame: false,
    backgroundColor: '#0b1326',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 14 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.setMenuBarVisibility(false);
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  registerWindowHandlers();
  initDatabase(getDataPath());
  const purged = await purgeNoisePrompts();
  if (purged > 0) console.info(`[Mirscope] Purged ${purged} noise prompts on startup`);
  const clearedResponses = await purgePromptResponses();
  if (clearedResponses > 0) console.info(`[Mirscope] Removed ${clearedResponses} non-prompt records on startup`);
  connectorManager = new ConnectorManager();
  registerIpcHandlers(connectorManager);

  await createWindow();
  void connectorManager.initialize().catch((err) => {
    console.error('[ConnectorManager] initialize failed:', err);
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await connectorManager?.shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await connectorManager?.shutdown();
  closeDatabase();
});

export { mainWindow };
