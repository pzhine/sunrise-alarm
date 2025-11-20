// Bluetooth Media Service for Electron Main Process
// This service interfaces with the Raspberry Pi's Bluetooth media controller

import { EventEmitter } from 'events';
import * as net from 'net';
import * as fs from 'fs';
import { MockBluetoothMedia } from './_mocks/mockBluetoothMedia';

export interface MediaMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  track_number?: number;
  genre?: string;
  status: 'playing' | 'paused' | 'stopped';
  timestamp: number;
}

export interface MediaControlResponse {
  success?: boolean;
  error?: string;
  action?: string;
  metadata?: MediaMetadata;
}

export class BluetoothMediaService extends EventEmitter {
  private socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private socketPath = '/tmp/bluetooth_media.sock';
  private reconnectInterval = 5000; // 5 seconds
  private currentMetadata: MediaMetadata | null = null;
  private connectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected';
  
  // Simulation mode properties
  private simulationMode = false;
  private mockService: MockBluetoothMedia | null = null;

  constructor() {
    super();
    this.connect();
  }

  private connect(): void {
    if (this.connectionState === 'connecting') return;
    
    this.connectionState = 'connecting';
    
    // Check if socket file exists
    if (!fs.existsSync(this.socketPath)) {
      console.warn('Bluetooth media socket not available, enabling simulation mode...');
      this.enableSimulationMode();
      return;
    }

    this.socket = new net.Socket();
    
    this.socket.on('connect', () => {
      console.log('Connected to Bluetooth media service');
      this.connectionState = 'connected';
      this.emit('connected');
      
      // Request initial metadata
      this.getMetadata();
      
      // Clear any reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    });

    this.socket.on('data', (data: Buffer) => {
      const messages = data.toString().trim().split('\n');
      
      for (const message of messages) {
        if (message) {
          try {
            const response: MediaControlResponse = JSON.parse(message);
            this.handleResponse(response);
          } catch (error) {
            console.error('Failed to parse response:', error);
          }
        }
      }
    });

    this.socket.on('error', (error) => {
      console.error('Bluetooth media service error:', error);
      this.handleDisconnect();
    });

    this.socket.on('close', () => {
      console.log('Bluetooth media service disconnected');
      this.handleDisconnect();
    });

    try {
      this.socket.connect(this.socketPath);
    } catch (error) {
      console.error('Failed to connect to Bluetooth media service:', error);
      this.handleDisconnect();
    }
  }

  private handleDisconnect(): void {
    this.connectionState = 'disconnected';
    this.emit('disconnected');
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  private enableSimulationMode(): void {
    console.log('🎵 Enabling Bluetooth Media Simulation Mode');
    this.simulationMode = true;
    this.connectionState = 'connected';
    
    // Initialize mock service
    this.mockService = new MockBluetoothMedia();
    this.mockService.on('metadataUpdated', (metadata: MediaMetadata) => {
      this.currentMetadata = metadata;
      this.emit('metadataUpdated', metadata);
    });
    
    // Start simulation and get initial metadata
    this.mockService.startSimulation();
    this.currentMetadata = this.mockService.getCurrentMetadata();
    
    this.emit('connected');
    console.log('🎶 Simulation mode ready');
  }



  private handleResponse(response: MediaControlResponse): void {
    if (response.metadata) {
      const oldMetadata = this.currentMetadata;
      this.currentMetadata = response.metadata;
      
      // Emit events for metadata changes
      if (!oldMetadata || oldMetadata.title !== response.metadata.title) {
        this.emit('trackChanged', response.metadata);
      }
      
      if (!oldMetadata || oldMetadata.status !== response.metadata.status) {
        this.emit('statusChanged', response.metadata.status);
      }
      
      if (!oldMetadata || Math.abs(oldMetadata.position - response.metadata.position) > 5000) {
        this.emit('positionChanged', response.metadata.position, response.metadata.duration);
      }
      
      this.emit('metadataUpdated', response.metadata);
    }
    
    // Always emit commandResponse for any valid response (metadata, success, or error)
    // This ensures get_metadata responses are properly handled
    if (response.metadata || response.success !== undefined || response.error) {
      this.emit('commandResponse', response);
    }
    
    if (response.error) {
      this.emit('error', new Error(response.error));
    }
  }

  private sendCommand(command: any): Promise<MediaControlResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.connectionState !== 'connected') {
        reject(new Error('Not connected to Bluetooth media service'));
        return;
      }

      const commandString = JSON.stringify(command);
      console.log(`Sending command: ${commandString}`);
      
      // Set up one-time response handler
      const responseHandler = (response: MediaControlResponse) => {
        console.log(`Received response for command ${command.type}:`, response);
        
        // For get_metadata commands, accept any response with metadata
        if (command.type === 'get_metadata' && response.metadata) {
          this.removeListener('commandResponse', responseHandler);
          this.removeListener('error', errorHandler);
          resolve(response);
        }
        // For media_control commands, match the action
        else if (command.type === 'media_control' && response.action === command.action) {
          this.removeListener('commandResponse', responseHandler);
          this.removeListener('error', errorHandler);
          resolve(response);
        }
        // For any response with success/error, also accept it
        else if (response.success !== undefined || response.error) {
          this.removeListener('commandResponse', responseHandler);
          this.removeListener('error', errorHandler);
          resolve(response);
        }
      };
      
      const errorHandler = (error: Error) => {
        this.removeListener('commandResponse', responseHandler);
        this.removeListener('error', errorHandler);
        reject(error);
      };

      this.once('commandResponse', responseHandler);
      this.once('error', errorHandler);
      
      // Send command
      this.socket.write(commandString);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        this.removeListener('commandResponse', responseHandler);
        this.removeListener('error', errorHandler);
        reject(new Error('Command timeout'));
      }, 5000);
    });
  }

  // Public API methods
  
  /**
   * Get current media metadata and status
   */
  public async getMetadata(): Promise<MediaMetadata | null> {
    if (this.simulationMode) {
      return this.currentMetadata;
    }
    
    try {
      const response = await this.sendCommand({ type: 'get_metadata' });
      return response.metadata || null;
    } catch (error) {
      console.error('Failed to get metadata:', error);
      return null;
    }
  }

  /**
   * Play the current track
   */
  public async play(): Promise<boolean> {
    if (this.simulationMode && this.mockService) {
      return this.mockService.play();
    }
    
    try {
      const response = await this.sendCommand({ type: 'media_control', action: 'play' });
      return response.success === true;
    } catch (error) {
      console.error('Failed to play:', error);
      return false;
    }
  }

  /**
   * Pause the current track
   */
  public async pause(): Promise<boolean> {
    if (this.simulationMode && this.mockService) {
      return this.mockService.pause();
    }
    
    try {
      const response = await this.sendCommand({ type: 'media_control', action: 'pause' });
      return response.success === true;
    } catch (error) {
      console.error('Failed to pause:', error);
      return false;
    }
  }

  /**
   * Stop playback
   */
  public async stop(): Promise<boolean> {
    if (this.simulationMode && this.mockService) {
      return this.mockService.stop();
    }
    
    try {
      const response = await this.sendCommand({ type: 'media_control', action: 'stop' });
      return response.success === true;
    } catch (error) {
      console.error('Failed to stop:', error);
      return false;
    }
  }

  /**
   * Skip to next track
   */
  public async next(): Promise<boolean> {
    if (this.simulationMode && this.mockService) {
      return this.mockService.next();
    }
    
    try {
      const response = await this.sendCommand({ type: 'media_control', action: 'next' });
      return response.success === true;
    } catch (error) {
      console.error('Failed to skip to next:', error);
      return false;
    }
  }

  /**
   * Go to previous track
   */
  public async previous(): Promise<boolean> {
    if (this.simulationMode && this.mockService) {
      return this.mockService.previous();
    }
    
    try {
      const response = await this.sendCommand({ type: 'media_control', action: 'previous' });
      return response.success === true;
    } catch (error) {
      console.error('Failed to go to previous:', error);
      return false;
    }
  }

  /**
   * Toggle play/pause
   */
  public async togglePlayPause(): Promise<boolean> {
    const metadata = await this.getMetadata();
    if (metadata?.status === 'playing') {
      return this.pause();
    } else {
      return this.play();
    }
  }

  /**
   * Send a generic media control command
   */
  public async sendMediaCommand(command: string): Promise<MediaControlResponse> {
    switch (command.toLowerCase()) {
      case 'play':
        return { success: await this.play(), action: 'play' };
      case 'pause':
        return { success: await this.pause(), action: 'pause' };
      case 'stop':
        return { success: await this.stop(), action: 'stop' };
      case 'next':
        return { success: await this.next(), action: 'next' };
      case 'previous':
        return { success: await this.previous(), action: 'previous' };
      case 'status':
        const metadata = await this.getMetadata();
        return { success: true, metadata, action: 'status' };
      case 'seek-forward':
        if (this.simulationMode && this.mockService) {
          const currentTrack = this.mockService.getCurrentTrack();
          const newPosition = currentTrack.track.position + 15; // 15 seconds forward
          const success = this.mockService.seek(newPosition);
          return { success, action: 'seek-forward' };
        }
        // For real mode, try to send to underlying service
        try {
          const response = await this.sendCommand({ 
            type: 'media_control', 
            action: command 
          });
          return response;
        } catch (error) {
          return { 
            success: false, 
            error: `Seek forward failed: ${error}`,
            action: command 
          };
        }
      case 'seek-backward':
        if (this.simulationMode && this.mockService) {
          const currentTrack = this.mockService.getCurrentTrack();
          const newPosition = Math.max(0, currentTrack.track.position - 15); // 15 seconds backward
          const success = this.mockService.seek(newPosition);
          return { success, action: 'seek-backward' };
        }
        // For real mode, try to send to underlying service
        try {
          const response = await this.sendCommand({ 
            type: 'media_control', 
            action: command 
          });
          return response;
        } catch (error) {
          return { 
            success: false, 
            error: `Seek backward failed: ${error}`,
            action: command 
          };
        }
      default:
        return { 
          success: false, 
          error: `Unknown command: ${command}`,
          action: command 
        };
    }
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionState;
  }

  /**
   * Get current metadata (cached)
   */
  public getCurrentMetadata(): MediaMetadata | null {
    return this.currentMetadata;
  }

  /**
   * Check if running in simulation mode
   */
  public isSimulationMode(): boolean {
    return this.simulationMode;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.mockService) {
      this.mockService.destroy();
      this.mockService = null;
    }
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.removeAllListeners();
    
    console.log(this.simulationMode ? '🎵 Simulation mode destroyed' : 'Bluetooth media service destroyed');
  }
}

// Export a singleton instance
export const bluetoothMediaService = new BluetoothMediaService();