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
  private recentlyDiscoveredDevices: Map<string, { name: string, timestamp: number }> = new Map();

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
      
      // Clean up any stale pairings and reset baseline
      await this.cleanupStalePairings();
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
        
        // Every 2 seconds, check for newly paired devices
        if (this.currentState.timeRemaining % 2 === 0) {
          console.log('[BLUETOOTH] Running periodic pairing check...');
          await this.checkForNewlyPairedDevices();
        }
        
        if (this.currentState.timeRemaining <= 0) {
          this.stopPairing();
        } else {
          this.emit('pairingUpdate', this.currentState);
        }
      }, 1000);

      // Additional fallback: check all connected devices for pairing status every few seconds
      const fallbackChecker = setInterval(async () => {
        if (!this.currentState.active) {
          clearInterval(fallbackChecker);
          return;
        }
        
        try {
          console.log('[BLUETOOTH] Fallback: Checking all connected devices for pairing status...');
          const { stdout } = await execAsync('bluetoothctl devices Connected');
          const connectedDevices = stdout.split('\n')
            .filter(line => line.includes('Device'))
            .map(line => line.match(/Device ([A-F0-9:]+)/)?.[1])
            .filter(Boolean);
            
          for (const deviceAddress of connectedDevices) {
            if (deviceAddress) {
              // Only check devices that weren't in the initial paired list
              const wasInitiallyPaired = this.initialPairedDevices?.some(device => 
                device.address === deviceAddress
              );
              
              if (wasInitiallyPaired) {
                console.log('[BLUETOOTH] Skipping already paired device:', deviceAddress);
                continue;
              }
              
              console.log('[BLUETOOTH] Checking pairing status for newly connected device:', deviceAddress);
              await this.checkDevicePaired(deviceAddress);
            }
          }
        } catch (error) {
          console.log('[BLUETOOTH] Fallback check failed:', error);
        }
      }, 3000);

      console.log(`[BLUETOOTH] Bluetooth pairing mode active for ${this.pairingDuration} seconds`);
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
      const trimmedOutput = output.trim();
      
      // Skip empty lines and common status messages
      if (!trimmedOutput || trimmedOutput.includes('Agent registered') || trimmedOutput.includes('[bluetooth]#')) {
        return;
      }
      
      console.log('[BLUETOOTH] Monitor output:', trimmedOutput);
      
      // Look for actual pairing request/process events (this indicates NEW pairing attempts)
      const pairingProcessPatterns = [
        'Pairing successful',
        'Successfully paired',
        'Authentication successful', 
        'Request confirmation',
        'Request PIN code',
        'Request passkey',
        'Confirm passkey',
        'Device has been paired',
        'Paired: yes'
      ];
      
      const hasPairingProcess = pairingProcessPatterns.some(pattern => 
        output.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (hasPairingProcess) {
        const deviceMatch = output.match(/Device ([A-F0-9:]{17})/) || 
                           output.match(/([A-F0-9:]{17})/) ||
                           output.match(/Device\s+([A-F0-9:]+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          console.log('[BLUETOOTH] PAIRING PROCESS DETECTED for device:', deviceAddress);
          console.log('[BLUETOOTH] Trigger pattern:', pairingProcessPatterns.find(p => 
            output.toLowerCase().includes(p.toLowerCase())));
          
          // Immediate pairing success
          setTimeout(() => this.handleDevicePaired(deviceAddress), 500);
        } else {
          console.log('[BLUETOOTH] Pairing process detected but no device address found in:', trimmedOutput);
        }
      }
      
      // Look for NEW device discoveries (indicates someone is trying to pair)
      if (output.includes('[NEW] Device')) {
        const deviceMatch = output.match(/\\[NEW\\] Device ([A-F0-9:]+)\\s+(.+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          const deviceName = deviceMatch[2];
          console.log('[BLUETOOTH] NEW device discovered:', deviceName, '(' + deviceAddress + ')');
          
          // Store this as a recently discovered device
          this.recentlyDiscoveredDevices.set(deviceAddress, {
            name: deviceName,
            timestamp: Date.now()
          });
          
          // If we're in pairing mode, automatically attempt to pair with this device
          if (this.currentState.active) {
            console.log('[BLUETOOTH] Auto-pairing with newly discovered device:', deviceAddress);
            this.attemptAutoPairing(deviceAddress);
          }
        }
      }
      
      // Look for connection events from newly paired devices
      if (output.includes('Connected: yes')) {
        const deviceMatch = output.match(/Device ([A-F0-9:]+)/);
        if (deviceMatch) {
          const deviceAddress = deviceMatch[1];
          console.log('[BLUETOOTH] Device connected:', deviceAddress);
          this.handleDeviceConnected(deviceAddress);
          
          // Only check pairing for devices that weren't initially paired
          const wasInitiallyPaired = this.initialPairedDevices?.some(device => 
            device.address === deviceAddress
          );
          
          if (!wasInitiallyPaired) {
            console.log('[BLUETOOTH] Checking if newly connected device is paired:', deviceAddress);
            setTimeout(() => this.checkDevicePaired(deviceAddress), 1000);
          } else {
            console.log('[BLUETOOTH] Connected device was already paired, skipping pairing check:', deviceAddress);
          }
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
      
      console.log(`[BLUETOOTH] Bluetooth device connected: ${deviceName} (${deviceAddress})`);
      
      // Check if this was an already paired device
      const wasInitiallyPaired = this.initialPairedDevices?.some(device => 
        device.address === deviceAddress
      );
      
      if (wasInitiallyPaired) {
        console.log(`[BLUETOOTH] Connected device was already paired, not triggering pairing event: ${deviceAddress}`);
      }
      
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
        console.log('[BLUETOOTH] Device is paired:', deviceAddress);
        
        // Only trigger pairing event if this device was NOT in the initial paired list
        const wasInitiallyPaired = this.initialPairedDevices?.some(device => 
          device.address === deviceAddress
        );
        
        if (wasInitiallyPaired) {
          console.log('[BLUETOOTH] Device was already paired before pairing mode started, ignoring:', deviceAddress);
          return;
        }
        
        console.log('[BLUETOOTH] Device is newly paired:', deviceAddress);
        this.handleDevicePaired(deviceAddress);
      } else {
        console.log('[BLUETOOTH] Device not yet paired:', deviceAddress);
      }
    } catch (error) {
      console.log('[BLUETOOTH] Could not check device pairing status:', error);
    }
  }

  /**
   * Check for newly paired devices (backup detection method)
   */
  private async checkForNewlyPairedDevices(): Promise<void> {
    try {
      console.log('[BLUETOOTH] Checking for newly paired devices...');
      // Get paired devices using bluetoothctl
      const { stdout } = await execAsync('bluetoothctl devices Paired');
      console.log('[BLUETOOTH] Paired devices output:', stdout);
      
      const currentPairedDevices = stdout.split('\n')
        .filter(line => line.includes('Device'))
        .map(line => {
          const match = line.match(/Device ([A-F0-9:]+) (.+)/);
          return match ? { address: match[1], name: match[2] } : null;
        })
        .filter(Boolean);
        
      console.log('[BLUETOOTH] Current paired devices:', currentPairedDevices);
        
      // Store initial paired devices on first run
      if (!this.initialPairedDevices) {
        this.initialPairedDevices = currentPairedDevices as Array<{address: string, name: string}>;
        console.log('[BLUETOOTH] Stored initial paired devices:', this.initialPairedDevices);
        return;
      }
      
      // Check for new devices (devices that weren't in the initial list)
      const newDevices = currentPairedDevices.filter(current => 
        current && !this.initialPairedDevices?.some(initial => 
          initial.address === current.address
        )
      );
      
      console.log('[BLUETOOTH] New devices found:', newDevices);
      
      if (newDevices.length > 0) {
        console.log('[BLUETOOTH] Newly paired devices detected:', newDevices);
        for (const device of newDevices) {
          if (device) {
            console.log('[BLUETOOTH] Processing newly paired device:', device.address);
            this.handleDevicePaired(device.address);
          }
        }
      } else {
        console.log('[BLUETOOTH] No new paired devices found');
      }
    } catch (error) {
      console.error('[BLUETOOTH] Could not check for newly paired devices:', error);
    }
  }

  /**
   * Handle device pairing success
   */
  private async handleDevicePaired(deviceAddress: string): Promise<void> {
    try {
      console.log(`[BLUETOOTH] handleDevicePaired called for: ${deviceAddress}`);
      
      // Get device info
      const { stdout } = await execAsync(`bluetoothctl info ${deviceAddress}`);
      console.log(`[BLUETOOTH] Device info for ${deviceAddress}:`, stdout);
      
      const nameMatch = stdout.match(/Name: (.+)/);
      const deviceName = nameMatch ? nameMatch[1].trim() : deviceAddress;
      
      console.log(`[BLUETOOTH] Bluetooth device paired: ${deviceName} (${deviceAddress})`);
      console.log(`[BLUETOOTH] Current pairing state active: ${this.currentState.active}`);
      
      // Always emit device paired event for notifications
      console.log(`[BLUETOOTH] Emitting devicePaired event`);
      this.emit('devicePaired', {
        address: deviceAddress,
        name: deviceName,
        timestamp: new Date().toISOString()
      });

      // If we're in pairing mode, mark as successful
      if (this.currentState.active) {
        console.log('[BLUETOOTH] Pairing mode: Device paired successfully!');
        
        const successState = {
          ...this.currentState,
          active: false,
          deviceName: deviceName
        };
        
        this.currentState = successState;
        
        console.log('[BLUETOOTH] Emitting pairingSuccess event with state:', successState);
        this.emit('pairingSuccess', successState);
        
        // Stop pairing mode after successful pairing
        setTimeout(() => {
          console.log('[BLUETOOTH] Stopping pairing mode after successful pairing');
          this.stopPairing();
        }, 3000);
      } else {
        console.log('[BLUETOOTH] Not in pairing mode, only emitting device paired event');
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
      const { stdout } = await execAsync('bluetoothctl devices Paired');
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
  /**
   * Attempt to automatically pair with a discovered device
   */
  private async attemptAutoPairing(deviceAddress: string): Promise<void> {
    try {
      console.log(`[BLUETOOTH] Attempting to pair with device: ${deviceAddress}`);
      
      // First, try to pair the device
      await execAsync(`bluetoothctl pair ${deviceAddress}`);
      console.log(`[BLUETOOTH] Pairing command sent to: ${deviceAddress}`);
      
      // Then try to trust it (this often completes the pairing)
      setTimeout(async () => {
        try {
          await execAsync(`bluetoothctl trust ${deviceAddress}`);
          console.log(`[BLUETOOTH] Trust command sent to: ${deviceAddress}`);
          
          // Check if pairing was successful
          setTimeout(() => {
            this.checkDevicePaired(deviceAddress);
          }, 1000);
        } catch (error) {
          console.log(`[BLUETOOTH] Could not trust device ${deviceAddress}:`, error);
        }
      }, 2000);
      
    } catch (error) {
      console.log(`[BLUETOOTH] Could not pair with device ${deviceAddress}:`, error);
      // Even if pairing command fails, the device might still get paired through user interaction
      // So still check for pairing success after a delay
      setTimeout(() => {
        this.checkDevicePaired(deviceAddress);
      }, 3000);
    }
  }

  /**
   * Clean up stale pairings - remove devices that are paired on Pi but not reachable
   */
  private async cleanupStalePairings(): Promise<void> {
    try {
      console.log('[BLUETOOTH] Cleaning up stale pairings...');
      const { stdout } = await execAsync('bluetoothctl devices Paired');
      const pairedDevices = stdout.split('\n')
        .filter(line => line.includes('Device'))
        .map(line => line.match(/Device ([A-F0-9:]+)/)?.[1])
        .filter(Boolean);

      for (const address of pairedDevices) {
        if (address) {
          try {
            // Check if device is actually reachable/responsive
            const { stdout: infoOutput } = await execAsync(`bluetoothctl info ${address}`);
            const isConnected = infoOutput.includes('Connected: yes');
            const isTrusted = infoOutput.includes('Trusted: yes');
            
            // If device is paired but not connected and not trusted, it might be stale
            if (!isConnected && !isTrusted) {
              console.log(`[BLUETOOTH] Found potentially stale pairing: ${address}`);
              // We could remove it here, but let's be conservative and just log it
              // await execAsync(`bluetoothctl remove ${address}`);
            }
          } catch (error) {
            console.log(`[BLUETOOTH] Could not check device ${address}, might be stale:`, error);
          }
        }
      }
    } catch (error) {
      console.log('[BLUETOOTH] Error during stale pairing cleanup:', error);
    }
  }

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