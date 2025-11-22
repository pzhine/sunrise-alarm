<!-- Vue component for displaying and controlling Bluetooth media -->
<template>
  <div class="bluetooth-media-player">
    <div class="connection-status" :class="connectionState">
      <div class="status-indicator"></div>
      <span>{{ connectionStatusText }}</span>
    </div>

    <div v-if="metadata && connectionState === 'connected'" class="media-info">
      <div class="album-art">
        <div class="default-art">♪</div>
      </div>
      
      <div class="track-info">
        <h3 class="track-title">{{ metadata.title || 'Unknown Title' }}</h3>
        <p class="track-artist">{{ metadata.artist || 'Unknown Artist' }}</p>
        <p class="track-album">{{ metadata.album || 'Unknown Album' }}</p>
      </div>
      
      <div class="playback-progress">
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: progressPercentage + '%' }"
          ></div>
        </div>
        <div class="time-info">
          <span class="current-time">{{ formatTime(metadata.position) }}</span>
          <span class="total-time">{{ formatTime(metadata.duration) }}</span>
        </div>
      </div>
      
      <div class="media-controls">
        <button 
          class="control-btn previous" 
          @click="previous"
          :disabled="!isConnected"
        >
          ⏮
        </button>
        
        <button 
          class="control-btn play-pause" 
          @click="togglePlayPause"
          :disabled="!isConnected"
        >
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        
        <button 
          class="control-btn next" 
          @click="next"
          :disabled="!isConnected"
        >
          ⏭
        </button>
      </div>
      
      <div class="playback-status">
        Status: {{ metadata.status }}
      </div>
    </div>
    
    <div v-else-if="connectionState === 'connected'" class="no-media">
      <p>No media playing</p>
      <p class="help-text">Connect a Bluetooth device and start playing music</p>
    </div>
    
    <div v-else class="disconnected-state">
      <p>Bluetooth media service not available</p>
      <p class="help-text">Make sure the Raspberry Pi Bluetooth service is running</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted } from 'vue';

interface MediaMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  status: 'playing' | 'paused' | 'stopped';
  timestamp: number;
}

declare global {
  interface Window {
    bluetoothMedia: {
      play: () => Promise<boolean>;
      pause: () => Promise<boolean>;
      stop: () => Promise<boolean>;
      next: () => Promise<boolean>;
      previous: () => Promise<boolean>;
      togglePlayPause: () => Promise<boolean>;
      getMetadata: () => Promise<MediaMetadata | null>;
      getConnectionState: () => Promise<string>;
      onTrackChanged: (callback: (metadata: MediaMetadata) => void) => () => void;
      onStatusChanged: (callback: (status: string) => void) => () => void;
      onPositionChanged: (callback: (position: number, duration: number) => void) => () => void;
      onMetadataUpdated: (callback: (metadata: MediaMetadata) => void) => () => void;
      onConnectionChanged: (callback: (state: string) => void) => () => void;
      onError: (callback: (error: string) => void) => () => void;
    };
  }
}

export default defineComponent({
  name: 'BluetoothMediaPlayer',
  
  setup() {
    const metadata = ref<MediaMetadata | null>(null);
    const connectionState = ref<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const error = ref<string | null>(null);
    
    // Cleanup functions for event listeners
    const cleanupFunctions: (() => void)[] = [];
    
    const isConnected = computed(() => connectionState.value === 'connected');
    const isPlaying = computed(() => metadata.value?.status === 'playing');
    
    const connectionStatusText = computed(() => {
      switch (connectionState.value) {
        case 'connected': return 'Connected';
        case 'connecting': return 'Connecting...';
        case 'disconnected': return 'Disconnected';
        default: return 'Unknown';
      }
    });
    
    const progressPercentage = computed(() => {
      if (!metadata.value || !metadata.value.duration) return 0;
      return Math.min(100, (metadata.value.position / metadata.value.duration) * 100);
    });
    
    // Media control methods
    const play = async () => {
      try {
        await window.bluetoothMedia.play();
      } catch (err) {
        console.error('Failed to play:', err);
      }
    };
    
    const pause = async () => {
      try {
        await window.bluetoothMedia.pause();
      } catch (err) {
        console.error('Failed to pause:', err);
      }
    };
    
    const stop = async () => {
      try {
        await window.bluetoothMedia.stop();
      } catch (err) {
        console.error('Failed to stop:', err);
      }
    };
    
    const next = async () => {
      try {
        await window.bluetoothMedia.next();
      } catch (err) {
        console.error('Failed to skip to next:', err);
      }
    };
    
    const previous = async () => {
      try {
        await window.bluetoothMedia.previous();
      } catch (err) {
        console.error('Failed to go to previous:', err);
      }
    };
    
    const togglePlayPause = async () => {
      try {
        await window.bluetoothMedia.togglePlayPause();
      } catch (err) {
        console.error('Failed to toggle play/pause:', err);
      }
    };
    
    // Utility functions
    const formatTime = (milliseconds: number): string => {
      if (!milliseconds) return '0:00';
      
      const totalSeconds = Math.floor(milliseconds / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };
    
    // Initialize component
    const initialize = async () => {
      try {
        // Get initial state
        const initialMetadata = await window.bluetoothMedia.getMetadata();
        if (initialMetadata) {
          metadata.value = initialMetadata;
        }
        
        const initialConnectionState = await window.bluetoothMedia.getConnectionState();
        connectionState.value = initialConnectionState as any;
        
        // Set up event listeners
        cleanupFunctions.push(
          window.bluetoothMedia.onTrackChanged((newMetadata) => {
            metadata.value = newMetadata;
          })
        );
        
        cleanupFunctions.push(
          window.bluetoothMedia.onStatusChanged((status) => {
            if (metadata.value) {
              metadata.value.status = status as any;
            }
          })
        );
        
        cleanupFunctions.push(
          window.bluetoothMedia.onPositionChanged((position, duration) => {
            if (metadata.value) {
              metadata.value.position = position;
              metadata.value.duration = duration;
            }
          })
        );
        
        cleanupFunctions.push(
          window.bluetoothMedia.onMetadataUpdated((newMetadata) => {
            metadata.value = newMetadata;
          })
        );
        
        cleanupFunctions.push(
          window.bluetoothMedia.onConnectionChanged((state) => {
            connectionState.value = state as any;
          })
        );
        
        cleanupFunctions.push(
          window.bluetoothMedia.onError((errorMessage) => {
            error.value = errorMessage;
            console.error('Bluetooth media error:', errorMessage);
          })
        );
        
      } catch (err) {
        console.error('Failed to initialize Bluetooth media player:', err);
        error.value = 'Failed to initialize';
      }
    };
    
    onMounted(() => {
      if (window.bluetoothMedia) {
        initialize();
      } else {
        console.warn('Bluetooth media API not available');
      }
    });
    
    onUnmounted(() => {
      // Clean up event listeners
      cleanupFunctions.forEach(cleanup => cleanup());
    });
    
    return {
      metadata,
      connectionState,
      error,
      isConnected,
      isPlaying,
      connectionStatusText,
      progressPercentage,
      play,
      pause,
      stop,
      next,
      previous,
      togglePlayPause,
      formatTime
    };
  }
});
</script>

<style scoped>
.bluetooth-media-player {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 24px;
  color: white;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 500;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.connection-status.connected .status-indicator {
  background-color: #4ade80;
}

.connection-status.disconnected .status-indicator {
  background-color: #ef4444;
}

.connection-status.connecting .status-indicator {
  background-color: #fbbf24;
}

.media-info {
  text-align: center;
}

.album-art {
  width: 120px;
  height: 120px;
  margin: 0 auto 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  backdrop-filter: blur(10px);
}

.track-info {
  margin-bottom: 24px;
}

.track-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.track-artist {
  font-size: 18px;
  margin: 0 0 4px;
  opacity: 0.9;
}

.track-album {
  font-size: 16px;
  margin: 0;
  opacity: 0.7;
}

.playback-progress {
  margin-bottom: 24px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4ade80, #22d3ee);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.time-info {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  opacity: 0.8;
}

.media-controls {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
}

.control-btn {
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.05);
}

.control-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.control-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.play-pause {
  width: 56px;
  height: 56px;
  font-size: 24px;
  background: linear-gradient(135deg, #4ade80, #22d3ee);
}

.playback-status {
  font-size: 14px;
  opacity: 0.7;
  text-align: center;
}

.no-media, .disconnected-state {
  text-align: center;
  padding: 40px 20px;
}

.no-media p, .disconnected-state p {
  margin: 0 0 8px;
}

.help-text {
  font-size: 14px;
  opacity: 0.7;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>