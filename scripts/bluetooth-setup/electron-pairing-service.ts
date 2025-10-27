// Bluetooth Pairing Control Service for Electron App
// This service allows the DawnDeck app to programmatically enable pairing mode

import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export interface PairingStatus {
  active: boolean;
  timeRemaining: number;
  deviceName: string;
  connectedDevices: string[];
}

export class BluetoothPairingService extends EventEmitter {
  private pairingTimeout: NodeJS.Timeout | null = null;
  private pairingStartTime: number = 0;
  private readonly PAIRING_DURATION = 180; // 3 minutes
  private readonly DEVICE_NAME = "DawnDeck";

  constructor() {
    super();
  }

  /**
   * Start pairing mode for the specified duration
   */
  async startPairingMode(durationSeconds: number = this.PAIRING_DURATION): Promise<boolean> {
    try {
      // Check if Bluetooth is available
      await this.checkBluetoothService();

      // Enable discoverable mode
      await execAsync('bluetoothctl discoverable on');
      await execAsync('bluetoothctl pairable on');
      await execAsync('bluetoothctl agent on');

      this.pairingStartTime = Date.now();
      
      // Set timeout to automatically disable pairing
      this.pairingTimeout = setTimeout(async () => {
        await this.stopPairingMode();
        this.emit('pairingTimeout');
      }, durationSeconds * 1000);

      this.emit('pairingStarted', { duration: durationSeconds });
      
      return true;
    } catch (error) {
      this.emit('pairingError', error);
      return false;
    }
  }

  /**
   * Stop pairing mode immediately
   */
  async stopPairingMode(): Promise<boolean> {
    try {
      // Clear timeout if active
      if (this.pairingTimeout) {
        clearTimeout(this.pairingTimeout);
        this.pairingTimeout = null;
      }

      // Disable discoverable mode
      await execAsync('bluetoothctl discoverable off');

      this.emit('pairingStopped');
      
      return true;
    } catch (error) {
      this.emit('pairingError', error);
      return false;
    }
  }

  /**
   * Get current pairing status
   */
  async getPairingStatus(): Promise<PairingStatus> {
    try {
      const { stdout: showOutput } = await execAsync('bluetoothctl show');
      
      const discoverable = showOutput.includes('Discoverable: yes');
      const timeElapsed = this.pairingStartTime ? (Date.now() - this.pairingStartTime) / 1000 : 0;
      const timeRemaining = discoverable ? Math.max(0, this.PAIRING_DURATION - timeElapsed) : 0;

      // Get connected devices
      const { stdout: devicesOutput } = await execAsync('bluetoothctl devices Connected');
      const connectedDevices = devicesOutput
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.split(' ').slice(2).join(' '));

      return {
        active: discoverable,
        timeRemaining: Math.round(timeRemaining),
        deviceName: this.DEVICE_NAME,
        connectedDevices
      };
    } catch (error) {
      throw new Error(`Failed to get pairing status: ${error}`);
    }
  }

  /**
   * Get list of paired devices
   */
  async getPairedDevices(): Promise<Array<{ address: string; name: string; connected: boolean }>> {
    try {
      const { stdout } = await execAsync('bluetoothctl devices Paired');
      const devices = [];
      
      for (const line of stdout.split('\n')) {
        if (line.trim()) {
          const parts = line.split(' ');
          const address = parts[1];
          const name = parts.slice(2).join(' ');
          
          // Check if connected
          try {
            const { stdout: infoOutput } = await execAsync(`bluetoothctl info ${address}`);
            const connected = infoOutput.includes('Connected: yes');
            
            devices.push({ address, name, connected });
          } catch {
            devices.push({ address, name, connected: false });
          }
        }
      }
      
      return devices;
    } catch (error) {
      throw new Error(`Failed to get paired devices: ${error}`);
    }
  }

  /**
   * Remove (unpair) a device
   */
  async unpairDevice(address: string): Promise<boolean> {
    try {
      await execAsync(`bluetoothctl remove ${address}`);
      this.emit('deviceUnpaired', { address });
      return true;
    } catch (error) {
      this.emit('pairingError', error);
      return false;
    }
  }

  /**
   * Check if Bluetooth service is running
   */
  private async checkBluetoothService(): Promise<void> {
    try {
      const { stdout } = await execAsync('systemctl is-active bluetooth');
      if (!stdout.includes('active')) {
        throw new Error('Bluetooth service is not running');
      }
    } catch (error) {
      throw new Error('Bluetooth service check failed');
    }
  }
}

// Example usage in Electron main process:

/*
import { BluetoothPairingService } from './bluetoothPairingService';

const pairingService = new BluetoothPairingService();

// Listen for events
pairingService.on('pairingStarted', (data) => {
  console.log(`Pairing mode started for ${data.duration} seconds`);
  // Update UI to show pairing mode active
});

pairingService.on('pairingStopped', () => {
  console.log('Pairing mode stopped');
  // Update UI to show pairing mode inactive
});

pairingService.on('pairingTimeout', () => {
  console.log('Pairing mode timed out');
  // Show notification that pairing window closed
});

pairingService.on('deviceUnpaired', (data) => {
  console.log(`Device unpaired: ${data.address}`);
  // Refresh device list in UI
});

// IPC handlers for renderer process
ipcMain.handle('bluetooth:startPairing', async (event, duration) => {
  return await pairingService.startPairingMode(duration);
});

ipcMain.handle('bluetooth:stopPairing', async () => {
  return await pairingService.stopPairingMode();
});

ipcMain.handle('bluetooth:getStatus', async () => {
  return await pairingService.getPairingStatus();
});

ipcMain.handle('bluetooth:getPairedDevices', async () => {
  return await pairingService.getPairedDevices();
});

ipcMain.handle('bluetooth:unpairDevice', async (event, address) => {
  return await pairingService.unpairDevice(address);
});
*/

// Example Vue component for the UI:

/*
<template>
  <div class="bluetooth-pairing">
    <div class="header">
      <h2>{{ deviceName }} Bluetooth</h2>
      <div class="status" :class="{ active: pairingActive }">
        {{ pairingActive ? 'Pairing Mode Active' : 'Ready' }}
      </div>
    </div>

    <div v-if="pairingActive" class="pairing-countdown">
      <div class="countdown-circle">
        <div class="time">{{ formatTime(timeRemaining) }}</div>
      </div>
      <p>Device is discoverable for pairing</p>
      <button @click="stopPairing" class="btn-stop">Stop Early</button>
    </div>

    <div v-else class="pairing-controls">
      <button @click="startPairing" class="btn-pair">
        Enable Pairing Mode
      </button>
      <p>Make this speaker discoverable for 3 minutes</p>
    </div>

    <div class="paired-devices">
      <h3>Paired Devices ({{ pairedDevices.length }})</h3>
      <div v-if="pairedDevices.length === 0" class="no-devices">
        No devices paired yet
      </div>
      <div v-for="device in pairedDevices" :key="device.address" class="device-item">
        <div class="device-info">
          <span class="device-name">{{ device.name }}</span>
          <span class="device-status" :class="{ connected: device.connected }">
            {{ device.connected ? 'Connected' : 'Paired' }}
          </span>
        </div>
        <button @click="unpairDevice(device.address)" class="btn-unpair">
          Remove
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const deviceName = ref('DawnDeck');
const pairingActive = ref(false);
const timeRemaining = ref(0);
const pairedDevices = ref([]);

let statusInterval: NodeJS.Timeout | null = null;

const startPairing = async () => {
  const success = await window.electron.bluetooth.startPairing();
  if (success) {
    updateStatus();
  }
};

const stopPairing = async () => {
  await window.electron.bluetooth.stopPairing();
  updateStatus();
};

const unpairDevice = async (address: string) => {
  const success = await window.electron.bluetooth.unpairDevice(address);
  if (success) {
    loadPairedDevices();
  }
};

const updateStatus = async () => {
  const status = await window.electron.bluetooth.getStatus();
  pairingActive.value = status.active;
  timeRemaining.value = status.timeRemaining;
  deviceName.value = status.deviceName;
};

const loadPairedDevices = async () => {
  pairedDevices.value = await window.electron.bluetooth.getPairedDevices();
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

onMounted(() => {
  updateStatus();
  loadPairedDevices();
  
  // Update status every second when pairing is active
  statusInterval = setInterval(() => {
    if (pairingActive.value) {
      updateStatus();
    }
  }, 1000);
});

onUnmounted(() => {
  if (statusInterval) {
    clearInterval(statusInterval);
  }
});
</script>
*/