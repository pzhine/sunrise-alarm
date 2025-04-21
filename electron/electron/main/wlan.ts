import { exec } from 'child_process';
import { ipcMain } from 'electron';
import wifi from 'node-wifi';

// Initialize node-wifi
wifi.init({ iface: null }); // null means it will use the current active WiFi interface

/**
 * Lists available WiFi networks using the `nmcli` command.
 * @returns {Promise<string[]>} A promise that resolves to an array of WiFi network names.
 */
export function listAvailableWifiNetworks(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    exec('nmcli -t -f SSID dev wifi', (error, stdout, stderr) => {
      if (error) {
        reject(`Error listing WiFi networks: ${stderr || error.message}`);
        return;
      }

      const networks = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(ssid => ssid.length > 0);

      resolve(networks);
    });
  });
}

ipcMain.handle('connect-to-network', async (_, { networkName, password }) => {
  try {
    const result = await wifi.connect({ ssid: networkName, password });
    return `Successfully connected to ${networkName}`;
  } catch (error) {
    console.error('Error in connect-to-network IPC handler:', error);
    throw new Error(`Failed to connect to ${networkName}: ${error.message}`);
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  listAvailableWifiNetworks()
    .then(networks => {
      console.log('Available WiFi Networks:');
      networks.forEach((network, index) => {
        console.log(`${index + 1}. ${network}`);
      });
    })
    .catch(error => {
      console.error('Error:', error);
    });
}