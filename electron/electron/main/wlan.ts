import { ipcMain, net } from 'electron';
import wifi from 'node-wifi';

// Initialize node-wifi
wifi.init({ iface: null }); // null means it will use the current active WiFi interface

/**
 * Lists available WiFi networks using the `node-wifi` library.
 * @returns {Promise<string[]>} A promise that resolves to an array of WiFi network names.
 */
ipcMain.handle('list-available-wifi-networks', async () => {
  return new Promise((resolve, reject) => {
    wifi.scan((error, networks) => {
      if (error) {
        reject(`Error listing WiFi networks: ${error.message}`);
        return;
      }

      const networkNames = networks
        .map((network) => network.ssid)
        .filter((ssid) => ssid && ssid.length > 0);

      resolve(networkNames);
    });
  });
});

ipcMain.handle('connect-to-network', async (_, { networkName, password }) => {
  try {
    const result = await wifi.connect({ ssid: networkName, password });
    return `Successfully connected to ${networkName}`;
  } catch (error) {
    console.error('Error in connect-to-network IPC handler:', error);
    // Attempt to delete the connection if it exists
    try {
      await wifi.deleteConnection({ ssid: networkName });
    } catch (deleteError) {
      console.error('Error deleting connection:', deleteError);
    }
    throw new Error(error.message);
  }
});

/**
 * Checks if there is an active internet connection
 * @returns {Promise<boolean>} A promise that resolves to true if internet is available, false otherwise
 */
ipcMain.handle('check-internet-connectivity', async () => {
  return new Promise((resolve) => {
    // Use Electron's net module to check connectivity
    const request = net.request({
      method: 'HEAD',
      url: 'https://www.google.com',
    });

    // Set a timeout to resolve as false if no response
    const timeoutId = setTimeout(() => {
      resolve(false);
    }, 5000);

    request.on('response', () => {
      clearTimeout(timeoutId);
      resolve(true);
    });

    request.on('error', () => {
      clearTimeout(timeoutId);
      resolve(false);
    });

    request.end();
  });
});

/**
 * Gets the name of the currently connected WiFi network
 * @returns {Promise<string|null>} A promise that resolves to the name of the connected network, or null if not connected
 */
ipcMain.handle('get-current-wifi-network', async () => {
  return new Promise((resolve, reject) => {
    wifi.getCurrentConnections((error, currentConnections) => {
      if (error) {
        console.error('Error getting current WiFi connection:', error);
        resolve(null);
        return;
      }

      if (currentConnections && currentConnections.length > 0) {
        resolve(currentConnections[0].ssid);
      } else {
        resolve(null);
      }
    });
  });
});
