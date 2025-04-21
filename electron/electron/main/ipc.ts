import { sendMessage } from "./serial"
import { listAvailableWifiNetworks } from "./wlan"
import { ipcMain } from 'electron';

ipcMain.handle('serial-test', (_, arg) => {
  sendMessage('TEST')
})

ipcMain.handle('list-available-wifi-networks', async () => {
  try {
    return await listAvailableWifiNetworks();
  } catch (error) {
    console.error('Error in IPC handler for WiFi networks:', error);
    throw error;
  }
});