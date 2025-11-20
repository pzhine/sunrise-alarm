// Bluetooth Pairing Service for Electron Main Process
// Handles entering pairing mode and monitoring connection events

import { EventEmitter } from 'events';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PairingState {
  active: boolean;
  timeRemaining: number;
  deviceName?: string;
  error?: string;
}

export class BluetoothPairingService extends EventEmitter {
  private pairingTimer: NodeJS.Timeout | null = null;
  private pairingDuration = 180; // 3 minutes in seconds
  private currentState: PairingState = { active: false, timeRemaining: 0 };
  private bluetoothMonitor: ChildProcess | null = null;
  private deviceName = 'DawnDeck';
  private initialPairedDevices: Array<{address: string, name: string}> | null = null;

  constructor() {
    super();
    this.startConnectionMonitoring();
  }

  /**
   * Start pairing mode - makes device discoverable for 3 minutes
   */
  public async startPairing(): Promise<PairingState> {
    if (this.currentState.active) {
      throw new Error('Pairing already in progress');
    }

    try {
      console.log('Starting Bluetooth pairing mode...');
      
      // Basic Bluetooth setup
      await execAsync('bluetoothctl power on');
      await execAsync('bluetoothctl discoverable on');
      await execAsync('bluetoothctl pairable on');
      
      // Set device name
      try {
        await execAsync(`bluetoothctl system-alias "${this.deviceName}"`);
      } catch (error) {
        console.warn('Could not set system alias:', error);
      }
      
      // Set up auto-accept for pairing (this suppresses system dialogs)
      // Use a more reliable approach with error handling
      try {
        await execAsync('bluetoothctl agent off');
      } catch (error) {
        // Ignore error if no agent was running
      }
      
      try {
        await execAsync('bluetoothctl agent NoInputNoOutput');
      } catch (error) {
        console.warn('Could not set NoInputNoOutput agent, pairing dialogs may appear');
      }
      
      // Reset paired devices list to detect new pairings
      this.initialPairedDevices = null;
      
      this.currentState = {
        active: true,
        timeRemaining: this.pairingDuration,
        deviceName: this.deviceName
      };

      this.emit('pairingStarted', this.currentState);
      
      // Start countdown timer and periodic pairing check
      this.pairingTimer = setInterval(async () => {
        this.currentState.timeRemaining--;
        
        // Every 5 seconds, check for newly paired devices
        if (this.currentState.timeRemaining % 3 === 0) {
          await this.checkForNewlyPairedDevices();
        }
        
        if (this.currentState.timeRemaining <= 0) {
          this.stopPairing();
        } else {
          this.emit('pairingUpdate', this.currentState);
        }
      }, 1000);

      console.log(`Bluetooth pairing mode active for ${this.pairingDuration} seconds`);
      return this.currentState;
      
    } catch (error) {
      const errorMessage = `Failed to start pairing: ${error}`;
      console.error(errorMessage);
      
      this.currentState = {
        active: false,
        timeRemaining: 0,
        error: errorMessage
      };
      
      this.emit('pairingError', this.currentState);
      throw new Error(errorMessage);
    }
  }

  /**
   * Stop pairing mode early
   */
  public async stopPairing(): Promise<void> {
    if (this.pairingTimer) {
      clearInterval(this.pairingTimer);
      this.pairingTimer = null;
    }

    try {
      // Make device non-discoverable but keep it pairable
      await execAsync('bluetoothctl discoverable off');
      
      console.log('Bluetooth pairing mode stopped');
      
    } catch (error) {
      console.warn('Error stopping pairing mode:', error);
    }

    this.currentState = {
      active: false,
      timeRemaining: 0
    };

    this.emit('pairingStopped', this.currentState);
  }

  /**
   * Get current pairing state
   */
  public getPairingState(): PairingState {
    return { ...this.currentState };
  }

  /**
   * Start monitoring Bluetooth connection events
   */
  private startConnectionMonitoring(): void {
    // Monitor bluetoothctl for connection events
    this.bluetoothMonitor = spawn('bluetoothctl');
    
    if (!this.bluetoothMonitor.stdout) return;

    this.bluetoothMonitor.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      console.log('Bluetooth monitor output:', output.trim());
      
      // Look for device connection events
      if (output.includes('Device') && output.includes('Connected: yes')) {
        const deviceMatch = output.match(/Device ([A-F0-9:]+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          this.handleDeviceConnected(deviceAddress);
        }
      }
      
      // Look for pairing success - multiple patterns
      if (output.includes('Pairing successful') || 
          output.includes('Successfully paired') ||
          output.includes('Paired: yes')) {
        const deviceMatch = output.match(/Device ([A-F0-9:]+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          console.log('Pairing detected for device:', deviceAddress);
          this.handleDevicePaired(deviceAddress);
        }
      }
      
      // Look for device trust events (also indicates successful pairing)
      if (output.includes('Trusted: yes')) {
        const deviceMatch = output.match(/Device ([A-F0-9:]+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          console.log('Device trusted (pairing complete):', deviceAddress);
          // Small delay to ensure pairing is complete
          setTimeout(() => this.handleDevicePaired(deviceAddress), 500);
        }
      }
      
      // Alternative approach: Check for new device additions
      if (output.includes('[NEW] Device')) {
        const deviceMatch = output.match(/\[NEW\] Device ([A-F0-9:]+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          console.log('New device detected:', deviceAddress);
          // Check if it's paired after a short delay
          setTimeout(() => this.checkDevicePaired(deviceAddress), 2000);
        }
      }
    });

    this.bluetoothMonitor.stderr?.on('data', (data: Buffer) => {
      console.warn('Bluetooth monitor error:', data.toString());
    });

    this.bluetoothMonitor.on('exit', (code) => {
      console.log(`Bluetooth monitor exited with code ${code}`);
      // Restart monitoring after a delay if it wasn't intentionally stopped
      if (code !== 0) {
        setTimeout(() => this.startConnectionMonitoring(), 5000);
      }
    });
  }

  /**
   * Handle device connection event
   */
  private async handleDeviceConnected(deviceAddress: string): Promise<void> {
    try {
      // Get device info
      const { stdout } = await execAsync(`bluetoothctl info ${deviceAddress}`);
      const nameMatch = stdout.match(/Name: (.+)/);
      const deviceName = nameMatch ? nameMatch[1].trim() : deviceAddress;
      
      console.log(`Bluetooth device connected: ${deviceName} (${deviceAddress})`);
      
      this.emit('deviceConnected', {
        address: deviceAddress,
        name: deviceName,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error getting device info:', error);
      
      this.emit('deviceConnected', {
        address: deviceAddress,
        name: deviceAddress,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check if a specific device is paired
   */
  private async checkDevicePaired(deviceAddress: string): Promise<void> {
    try {
      const { stdout } = await execAsync(`bluetoothctl info ${deviceAddress}`);
      if (stdout.includes('Paired: yes')) {
        console.log('Device is paired:', deviceAddress);
        this.handleDevicePaired(deviceAddress);
      } else {
        console.log('Device not yet paired:', deviceAddress);
      }
    } catch (error) {
      console.log('Could not check device pairing status:', error);
    }
  }

  /**
   * Check for newly paired devices (backup detection method)
   */
  private async checkForNewlyPairedDevices(): Promise<void> {
    try {
      const { stdout } = await execAsync('bluetoothctl paired-devices');
      const currentPairedDevices = stdout.split('\n')
        .filter(line => line.includes('Device'))
        .map(line => {
          const match = line.match(/Device ([A-F0-9:]+) (.+)/);
          return match ? { address: match[1], name: match[2] } : null;
        })
        .filter(Boolean);
        
      // Store initial paired devices on first run
      if (!this.initialPairedDevices) {
        this.initialPairedDevices = currentPairedDevices as Array<{address: string, name: string}>;
        return;
      }
      
      // Check for new devices
      const newDevices = currentPairedDevices.filter(current => 
        current && !this.initialPairedDevices?.some(initial => 
          initial.address === current.address
        )
      );
      
      if (newDevices.length > 0) {
        console.log('Newly paired devices detected:', newDevices);
        for (const device of newDevices) {
          if (device) {
            this.handleDevicePaired(device.address);
          }
        }
      }
    } catch (error) {
      console.log('Could not check for newly paired devices:', error);
    }
  }

  /**
   * Handle device pairing success
   */
  private async handleDevicePaired(deviceAddress: string): Promise<void> {
    try {
      // Get device info
      const { stdout } = await execAsync(`bluetoothctl info ${deviceAddress}`);
      const nameMatch = stdout.match(/Name: (.+)/);
      const deviceName = nameMatch ? nameMatch[1].trim() : deviceAddress;
      
      console.log(`Bluetooth device paired: ${deviceName} (${deviceAddress})`);
      
      // Always emit device paired event for notifications
      this.emit('devicePaired', {
        address: deviceAddress,
        name: deviceName,
        timestamp: new Date().toISOString()
      });

      // If we're in pairing mode, mark as successful
      if (this.currentState.active) {
        console.log('Pairing mode: Device paired successfully!');
        
        const successState = {
          ...this.currentState,
          active: false,
          deviceName: deviceName
        };
        
        this.currentState = successState;
        
        this.emit('pairingSuccess', successState);
        
        // Stop pairing mode after successful pairing
        setTimeout(() => this.stopPairing(), 3000);
      }
      
    } catch (error) {
      console.error('Error handling device pairing:', error);
    }
  }

  /**
   * Get list of paired devices
   */
  public async getPairedDevices(): Promise<Array<{address: string, name: string, connected: boolean}>> {
    try {
      const { stdout } = await execAsync('bluetoothctl paired-devices');
      const devices = [];
      
      for (const line of stdout.split('\n')) {
        const match = line.match(/Device ([A-F0-9:]+) (.+)/);
        if (match) {
          const address = match[1];
          const name = match[2];
          
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
      console.error('Error getting paired devices:', error);
      return [];
    }
  }

  /**
   * Remove (unpair) a device
   */
  public async unpairDevice(address: string): Promise<void> {
    try {
      await execAsync(`bluetoothctl remove ${address}`);
      console.log(`Device ${address} unpaired successfully`);
    } catch (error) {
      throw new Error(`Failed to unpair device: ${error}`);
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.pairingTimer) {
      clearInterval(this.pairingTimer);
      this.pairingTimer = null;
    }
    
    if (this.bluetoothMonitor) {
      this.bluetoothMonitor.kill();
      this.bluetoothMonitor = null;
    }
  }
}

export const bluetoothPairingService = new BluetoothPairingService();