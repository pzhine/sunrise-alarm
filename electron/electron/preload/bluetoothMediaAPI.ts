// Preload script for exposing Bluetooth media API to renderer
// Add this to your existing preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';

// Existing contextBridge.exposeInMainWorld should be extended with:

const bluetoothMediaAPI = {
  // Media control methods
  play: () => ipcRenderer.invoke('bluetooth-media:play'),
  pause: () => ipcRenderer.invoke('bluetooth-media:pause'),
  stop: () => ipcRenderer.invoke('bluetooth-media:stop'),
  next: () => ipcRenderer.invoke('bluetooth-media:next'),
  previous: () => ipcRenderer.invoke('bluetooth-media:previous'),
  togglePlayPause: () => ipcRenderer.invoke('bluetooth-media:togglePlayPause'),
  
  // Metadata methods
  getMetadata: () => ipcRenderer.invoke('bluetooth-media:getMetadata'),
  getConnectionState: () => ipcRenderer.invoke('bluetooth-media:getConnectionState'),
  
  // Event listeners
  onTrackChanged: (callback: (metadata: any) => void) => {
    ipcRenderer.on('bluetooth-media:trackChanged', (_, metadata) => callback(metadata));
    return () => ipcRenderer.removeAllListeners('bluetooth-media:trackChanged');
  },
  
  onStatusChanged: (callback: (status: string) => void) => {
    ipcRenderer.on('bluetooth-media:statusChanged', (_, status) => callback(status));
    return () => ipcRenderer.removeAllListeners('bluetooth-media:statusChanged');
  },
  
  onPositionChanged: (callback: (position: number, duration: number) => void) => {
    ipcRenderer.on('bluetooth-media:positionChanged', (_, position, duration) => callback(position, duration));
    return () => ipcRenderer.removeAllListeners('bluetooth-media:positionChanged');
  },
  
  onMetadataUpdated: (callback: (metadata: any) => void) => {
    ipcRenderer.on('bluetooth-media:metadataUpdated', (_, metadata) => callback(metadata));
    return () => ipcRenderer.removeAllListeners('bluetooth-media:metadataUpdated');
  },
  
  onConnectionChanged: (callback: (state: string) => void) => {
    ipcRenderer.on('bluetooth-media:connectionChanged', (_, state) => callback(state));
    return () => ipcRenderer.removeAllListeners('bluetooth-media:connectionChanged');
  },
  
  onError: (callback: (error: string) => void) => {
    ipcRenderer.on('bluetooth-media:error', (_, error) => callback(error));
    return () => ipcRenderer.removeAllListeners('bluetooth-media:error');
  }
};

// Add to your existing contextBridge.exposeInMainWorld call:
contextBridge.exposeInMainWorld('bluetoothMedia', bluetoothMediaAPI);