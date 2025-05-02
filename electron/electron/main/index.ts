import { app, BrowserWindow, shell, ipcMain, dialog, Menu } from 'electron';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { startSerialComms, closeSerialPorts } from './serial';
import { getState, initStateManagement, updateState } from './stateManager';
import { initVolumeControl } from './volumeControl';
import {
  searchSoundsWithCache,
  groupSoundsByCountryWithCache,
} from './freesound';
import {
  initAutoUpdater,
  forceUpdate,
  installUpdateAndRestart,
} from './autoUpdater';
import { initConfigManager } from './configManager';
import './serial';
import './wlan';
import './stateManager';

// Lock file to check if another instance is shutting down
const lockFilePath = path.join(app.getPath('userData'), 'app.lock');

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

// Check if another instance is in the process of shutting down
function checkForLockedResources(): boolean {
  try {
    if (fs.existsSync(lockFilePath)) {
      const lockData = fs.readFileSync(lockFilePath, 'utf8');
      const lockInfo = JSON.parse(lockData);

      // Check if the lock is stale (older than 30 seconds)
      if (Date.now() - lockInfo.timestamp < 30000) {
        console.log(
          `Another instance is shutting down (PID: ${lockInfo.pid}). Waiting...`
        );
        return true;
      } else {
        console.log('Found stale lock file, removing it');
        fs.unlinkSync(lockFilePath);
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking lock file:', error);
    // Try to remove potentially corrupted lock file
    try {
      if (fs.existsSync(lockFilePath)) {
        fs.unlinkSync(lockFilePath);
      }
    } catch (e) {
      console.error('Failed to remove lock file:', e);
    }
    return false;
  }
}

// Create lock file when app is shutting down
function createLockFile() {
  try {
    const lockData = JSON.stringify({
      pid: process.pid,
      timestamp: Date.now(),
    });
    fs.writeFileSync(lockFilePath, lockData);
    console.log('Created lock file for graceful shutdown');
  } catch (error) {
    console.error('Error creating lock file:', error);
  }
}

// Clean up resources before exiting
async function cleanupResources() {
  console.log('Cleaning up resources before exit...');

  // Create lock file to signal to new instances that we're shutting down
  createLockFile();

  // Close all serial ports
  await closeSerialPorts();

  // Allow some time for resources to be released
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Remove lock file
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
    }
  } catch (error) {
    console.error('Error removing lock file:', error);
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
    // Different window settings for dev and production
    ...(VITE_DEV_SERVER_URL
      ? {
          // Development settings - windowed with specific size
          width: 950,
          height: 544,
          useContentSize: true, // This ensures dimensions apply to content area only
          title: 'Sunrise Alarm (Dev)',
        }
      : {
          // Production settings - fullscreen
          fullscreen: true,
          title: 'Sunrise Alarm',
          autoHideMenuBar: true,
        }),
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
      // nodeIntegration: true,
      // contextIsolation: false,
    },
  });

  // Hide cursor in production mode
  if (!VITE_DEV_SERVER_URL) {
    win.webContents.on('dom-ready', () => {
      win?.webContents.insertCSS('* { cursor: none !important; }');
    });
  }

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

// Wait for any previous instances to cleanup resources before continuing
async function waitForResources(
  maxRetries = 10,
  retryDelay = 1000
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (checkForLockedResources()) {
      console.log(
        `Waiting for resources to free up... (attempt ${i + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    } else {
      return true;
    }
  }
  console.log(
    'Timed out waiting for resources to free up. Continuing anyway...'
  );
  return false;
}

// Initialize app after waiting for resources
async function initializeApp() {
  // Wait for any previous instances to properly shut down
  await waitForResources();

  // Initialize the configuration manager before everything else
  if (!initConfigManager()) {
    showConfigMissingDialog();
    app.exit(1);
    return;
  }

  createWindow();
  initStateManagement();
  initVolumeControl();
  initAutoUpdater();
  createApplicationMenu();
}

app.whenReady().then(initializeApp);

// Clean up resources before exiting
app.on('will-quit', async (event) => {
  event.preventDefault(); // Temporarily prevent quitting
  await cleanupResources();
  app.exit(); // Now explicitly exit
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
            console.log('Force update requested from menu');
            const lastBuildResult = await forceUpdate();
            updateState('lastBuildResult', lastBuildResult);
          },
        },
        {
          label: 'Install Update and Restart',
          accelerator: 'CmdOrCtrl+Shift+/',
          enabled: !!getState().lastBuildResult?.success,
          click: async () => {
            console.log('Install update requested from menu');
            installUpdateAndRestart(getState().lastBuildResult.releasePath!);
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
