// Bluetooth Pairing IPC Handlers for Electron Main Process

import { ipcMain, BrowserWindow } from 'electron';
import { bluetoothPairingService } from './bluetoothPairing';

export function setupBluetoothPairingHandlers(mainWindow: BrowserWindow) {
  // Start pairing mode
  ipcMain.handle('bluetooth-pairing:start', async () => {
    try {
      return await bluetoothPairingService.startPairing();
    } catch (error: any) {
      throw new Error(error.message);
    }
  });

  // Stop pairing mode
  ipcMain.handle('bluetooth-pairing:stop', async () => {
    try {
      await bluetoothPairingService.stopPairing();
      return { success: true };
    } catch (error: any) {
      throw new Error(error.message);
    }
  });

  // Get current pairing state
  ipcMain.handle('bluetooth-pairing:getState', () => {
    return bluetoothPairingService.getPairingState();
  });

  // Get paired devices
  ipcMain.handle('bluetooth-pairing:getPairedDevices', async () => {
    try {
      return await bluetoothPairingService.getPairedDevices();
    } catch (error: any) {
      throw new Error(error.message);
    }
  });

  // Unpair device
  ipcMain.handle('bluetooth-pairing:unpairDevice', async (event, address: string) => {
    try {
      await bluetoothPairingService.unpairDevice(address);
      return { success: true };
    } catch (error: any) {
      throw new Error(error.message);
    }
  });

  // Listen for pairing events and forward to renderer
  bluetoothPairingService.on('pairingStarted', (state) => {
    mainWindow.webContents.send('bluetooth-pairing:started', state);
  });

  bluetoothPairingService.on('pairingUpdate', (state) => {
    mainWindow.webContents.send('bluetooth-pairing:update', state);
  });

  bluetoothPairingService.on('pairingStopped', (state) => {
    mainWindow.webContents.send('bluetooth-pairing:stopped', state);
  });

  bluetoothPairingService.on('pairingSuccess', (state) => {
    mainWindow.webContents.send('bluetooth-pairing:success', state);
  });

  bluetoothPairingService.on('pairingError', (state) => {
    mainWindow.webContents.send('bluetooth-pairing:error', state);
  });

  bluetoothPairingService.on('deviceConnected', (device) => {
    mainWindow.webContents.send('bluetooth-device:connected', device);
  });

  bluetoothPairingService.on('deviceDisconnected', (device) => {
    mainWindow.webContents.send('bluetooth-device:disconnected', device);
  });

  bluetoothPairingService.on('devicePaired', (device) => {
    mainWindow.webContents.send('bluetooth-device:paired', device);
  });

  return bluetoothPairingService;
}