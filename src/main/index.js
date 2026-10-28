import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0b090a',
    title: 'Label Studio',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Remove native menu bar since we use our custom themed HTML menu bar
  mainWindow.setMenuBarVisibility(false);

  const distPath = path.join(__dirname, '../../dist/renderer/index.html');
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (process.env.NODE_ENV === 'production' || process.env.SERVE_DIST) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadURL(devServerUrl).catch(() => {
      // Fallback to built files if Vite server is not active
      mainWindow.loadFile(distPath);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('ping', async () => {
  return 'pong';
});

ipcMain.handle('app:info', async () => {
  return {
    name: 'Label Studio',
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
