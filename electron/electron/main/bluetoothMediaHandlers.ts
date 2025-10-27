// Main process IPC handlers for Bluetooth media
// Add this to your main process index.ts

import { ipcMain, BrowserWindow } from 'electron';
import { bluetoothMediaService } from './bluetoothMediaService';

export function setupBluetoothMediaHandlers(mainWindow: BrowserWindow) {
  // Set up IPC handlers for media control
  ipcMain.handle('bluetooth-media:play', async () => {
    return await bluetoothMediaService.play();
  });

  ipcMain.handle('bluetooth-media:pause', async () => {
    return await bluetoothMediaService.pause();
  });

  ipcMain.handle('bluetooth-media:stop', async () => {
    return await bluetoothMediaService.stop();
  });

  ipcMain.handle('bluetooth-media:next', async () => {
    return await bluetoothMediaService.next();
  });

  ipcMain.handle('bluetooth-media:previous', async () => {
    return await bluetoothMediaService.previous();
  });

  ipcMain.handle('bluetooth-media:togglePlayPause', async () => {
    return await bluetoothMediaService.togglePlayPause();
  });

  ipcMain.handle('bluetooth-media:getMetadata', async () => {
    return await bluetoothMediaService.getMetadata();
  });

  ipcMain.handle('bluetooth-media:getConnectionState', () => {
    return bluetoothMediaService.getConnectionState();
  });

  // Set up event forwarding to renderer
  bluetoothMediaService.on('trackChanged', (metadata) => {
    mainWindow.webContents.send('bluetooth-media:trackChanged', metadata);
  });

  bluetoothMediaService.on('statusChanged', (status) => {
    mainWindow.webContents.send('bluetooth-media:statusChanged', status);
  });

  bluetoothMediaService.on('positionChanged', (position, duration) => {
    mainWindow.webContents.send('bluetooth-media:positionChanged', position, duration);
  });

  bluetoothMediaService.on('metadataUpdated', (metadata) => {
    mainWindow.webContents.send('bluetooth-media:metadataUpdated', metadata);
  });

  bluetoothMediaService.on('connected', () => {
    mainWindow.webContents.send('bluetooth-media:connectionChanged', 'connected');
  });

  bluetoothMediaService.on('disconnected', () => {
    mainWindow.webContents.send('bluetooth-media:connectionChanged', 'disconnected');
  });

  bluetoothMediaService.on('error', (error) => {
    mainWindow.webContents.send('bluetooth-media:error', error.message);
  });

  return bluetoothMediaService;
}