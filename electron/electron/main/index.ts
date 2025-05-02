import { app, BrowserWindow, shell, ipcMain, dialog, Menu } from 'electron';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { startSerialComms } from './serial';
import { initStateManagement } from './stateManager';
import { initVolumeControl } from './volumeControl';
import {
  searchSoundsWithCache,
  groupSoundsByCountryWithCache,
} from './freesound';
import { initAutoUpdater, forceUpdate } from './autoUpdater';
import { initConfigManager } from './configManager';
import './serial';
import './wlan';
import './stateManager';

// Display a helpful dialog if config.json is missing
function showConfigMissingDialog() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (app.isReady()) {
    dialog.showErrorBox(
      'Configuration Missing',
      `The application configuration file is missing.\n\nPlease create a config.json file in:\n${configPath}\n\nThe application will now exit.`
    );
  }
}

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
const preload = path.join(__dirname, '../preload/index.mjs');
const indexHtml = path.join(RENDERER_DIST, 'index.html');

async function createWindow() {
  win = new BrowserWindow({
    // fullscreen: true,
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // nodeIntegration: true,
      // contextIsolation: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL);
    // Open devTool if the app is not packaged
    // win.webContents.openDevTools();
  } else {
    win.loadFile(indexHtml);
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  // win.webContents.on('will-navigate', (event, url) => { }) #344
}

app.whenReady().then(() => {
  // Initialize the configuration manager before everything else
  if (!initConfigManager()) {
    showConfigMissingDialog();
    app.exit(1);
  }
  createWindow();
  initStateManagement();
  initVolumeControl();
  initAutoUpdater();
  createApplicationMenu();
});

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  console.log('open-win');
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`);
  } else {
    childWindow.loadFile(indexHtml, { hash: arg });
  }
});

startSerialComms();

// Register IPC handlers for Freesound API
ipcMain.handle('search-sounds', async (_, query) => {
  try {
    return await searchSoundsWithCache(query);
  } catch (error) {
    console.error('Error in search-sounds IPC handler:', error);
    throw error;
  }
});

ipcMain.handle('get-sounds-by-country', async (_, query) => {
  try {
    return await groupSoundsByCountryWithCache(query);
  } catch (error) {
    console.error('Error in get-sounds-by-country IPC handler:', error);
    throw error;
  }
});

ipcMain.handle('get-country-sounds', async (_, { query, country }) => {
  try {
    const countrySounds = await groupSoundsByCountryWithCache(query);
    return countrySounds[country] || [];
  } catch (error) {
    console.error('Error in get-country-sounds IPC handler:', error);
    throw error;
  }
});

// Create the application menu with update options
function createApplicationMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'View',
      submenu: [
        { role: 'forceReload' },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Advanced',
      submenu: [
        {
          label: 'Force Update',
          accelerator: 'CmdOrCtrl+Shift+U',
          click: async () => {
            try {
              console.log('Force update requested from menu');
              const result = await forceUpdate();

              if (result.success) {
                dialog.showMessageBox({
                  type: 'info',
                  title: 'Force Update',
                  message: 'Update process started',
                  detail:
                    'The application will restart to complete the update.',
                });
              } else {
                dialog.showErrorBox(
                  'Force Update Failed',
                  `Could not force update: ${result.message}`
                );
              }
            } catch (error) {
              console.error('Error during force update:', error);
              dialog.showErrorBox(
                'Force Update Failed',
                `An error occurred: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(
    template as Electron.MenuItemConstructorOptions[]
  );
  Menu.setApplicationMenu(menu);
}
