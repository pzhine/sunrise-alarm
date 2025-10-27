// Bluetooth Media Service for Electron Main Process
// This service interfaces with the Raspberry Pi's Bluetooth media controller

import { EventEmitter } from 'events';
import * as net from 'net';
import * as fs from 'fs';

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

  constructor() {
    super();
    this.connect();
  }

  private connect(): void {
    if (this.connectionState === 'connecting') return;
    
    this.connectionState = 'connecting';
    
    // Check if socket file exists
    if (!fs.existsSync(this.socketPath)) {
      console.warn('Bluetooth media socket not available, retrying...');
      this.scheduleReconnect();
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
    
    if (response.success !== undefined) {
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
      
      // Set up one-time response handler
      const responseHandler = (response: MediaControlResponse) => {
        if (response.action === command.action || response.metadata) {
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
   * Clean up resources
   */
  public destroy(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    
    this.removeAllListeners();
  }
}

// Export a singleton instance
export const bluetoothMediaService = new BluetoothMediaService();