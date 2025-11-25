<template>
  <div class="w-full h-screen flex justify-center items-center relative">
    <!-- Connected State -->
    <div v-if="metadata && connectionStatus === 'connected'" class="w-full h-full">
      <!-- Title - Upper 25% (bottom justified) -->
      <div class="text-center z-10 pointer-events-none absolute top-0 left-0 w-full h-1/4 flex items-end justify-center">
        <div class="text-2xl font-bold tracking-widest">{{ metadata.title || 'Unknown' }}</div>
      </div>

      <!-- Artist - Lower 25% (top justified) -->
      <div class="text-center z-10 pointer-events-none absolute bottom-0 left-0 w-full h-1/4 flex items-start justify-center">
        <div class="text-base opacity-80">{{ metadata.artist || 'Unknown Artist' }}</div>
      </div>

      <!-- Media Controls Circle - Always Centered -->
      <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 relative w-80 h-80">
        <!-- Previous -->
        <button
          @click="sendCommand('previous')"
          :disabled="isLoading"
          class="absolute top-1/2 left-0 transform -translate-y-1/2 w-20 h-20 rounded-full bg-transparent border border-current text-current cursor-pointer transition-all duration-200 flex flex-col items-center justify-center font-inherit tracking-wide disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
          </svg>
        </button>

        <!-- Play/Pause (Center) -->
        <button
          @click="togglePlayPause"
          :disabled="isLoading"
          class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-25 h-25 rounded-full bg-transparent border border-current text-current cursor-pointer transition-all duration-200 flex flex-col items-center justify-center font-inherit tracking-wide disabled:opacity-30 disabled:cursor-not-allowed text-3xl"
        >
          <svg v-if="metadata.status === 'playing'" width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
          <svg v-else width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
            <path d="m7 4 10 8L7 20V4z"/>
          </svg>
        </button>

        <!-- Next -->
        <button
          @click="sendCommand('next')"
          :disabled="isLoading"
          class="absolute top-1/2 right-0 transform -translate-y-1/2 w-20 h-20 rounded-full bg-transparent border border-current text-current cursor-pointer transition-all duration-200 flex flex-col items-center justify-center font-inherit tracking-wide disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Disconnected State -->
    <div v-else class="flex flex-col items-center text-center p-8">
      <div class="opacity-30 mb-8">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/>
        </svg>
      </div>
      
      <div class="mb-12">
        <div class="text-xl font-bold tracking-widest mb-2">{{ connectionStatus.toUpperCase() }}</div>
        <div class="text-sm opacity-70">
          {{ connectionStatus === 'connecting' ? 'Searching for device...' : 'No device connected' }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

// Reactive state
const metadata = ref<any>(null);
const connectionStatus = ref<'connected' | 'connecting' | 'disconnected'>('disconnected');
const isLoading = ref(false);
const updateInterval = ref<ReturnType<typeof setInterval> | null>(null);





const sendCommand = async (command: string) => {
  if (isLoading.value) return;
  
  isLoading.value = true;
  try {
    // Send command to Electron main process
    const result = await (window as any).electronAPI?.bluetoothMedia?.sendCommand(command);
    console.log(`Command ${command} result:`, result);
    
    // Refresh metadata after a brief delay
    setTimeout(refreshMetadata, 500);
  } catch (error) {
    console.error(`Failed to send command ${command}:`, error);
  } finally {
    isLoading.value = false;
  }
};

const togglePlayPause = () => {
  const command = metadata.value?.status === 'playing' ? 'pause' : 'play';
  sendCommand(command);
};

const refreshMetadata = async () => {
  try {
    const result = await (window as any).electronAPI?.bluetoothMedia?.getMetadata();
    if (result && result.metadata) {
      metadata.value = result.metadata;
      connectionStatus.value = 'connected';
    } else {
      connectionStatus.value = 'disconnected';
      metadata.value = null;
    }
  } catch (error) {
    console.error('Failed to get metadata:', error);
    connectionStatus.value = 'disconnected';
    metadata.value = null;
  }
};



// Lifecycle
onMounted(() => {
  // Initial load
  refreshMetadata();
  
  // Set up periodic updates
  updateInterval.value = setInterval(refreshMetadata, 2000);
  
  // Listen for metadata updates from main process
  if ((window as any).electronAPI?.bluetoothMedia?.onMetadataUpdate) {
    (window as any).electronAPI.bluetoothMedia.onMetadataUpdate((newMetadata: any) => {
      if (newMetadata) {
        metadata.value = newMetadata;
        connectionStatus.value = 'connected';
      } else {
        metadata.value = null;
        connectionStatus.value = 'disconnected';
      }
    });
  }
  
  // Listen for connection changes from main process
  if ((window as any).electronAPI?.bluetoothMedia?.onConnectionChange) {
    (window as any).electronAPI.bluetoothMedia.onConnectionChange((status: 'connected' | 'disconnected') => {
      connectionStatus.value = status;
      if (status === 'disconnected') {
        metadata.value = null;
      }
    });
  }
  

});

onBeforeUnmount(() => {
  if (updateInterval.value) {
    clearInterval(updateInterval.value);
  }
  
  // Clean up event listeners
  if ((window as any).electronAPI?.bluetoothMedia?.removeMetadataListener) {
    (window as any).electronAPI.bluetoothMedia.removeMetadataListener();
  }
  if ((window as any).electronAPI?.bluetoothMedia?.removeConnectionListener) {
    (window as any).electronAPI.bluetoothMedia.removeConnectionListener();
  }
});
</script>

<style scoped>
/* Add responsive adjustments for round screen */
@media (max-width: 800px) {
  .w-80 {
    width: 15rem;
  }
  
  .h-80 {
    height: 15rem;
  }
  
  .w-25 {
    width: 5rem;
  }
  
  .h-25 {
    height: 5rem;
  }
  
  .w-20 {
    width: 3.75rem;
  }
  
  .h-20 {
    height: 3.75rem;
  }
  
  .text-2xl {
    font-size: 1.2rem;
  }
  
  .text-base {
    font-size: 0.9rem;
  }
}

/* Custom size for play button since Tailwind doesn't have w-25/h-25 */
.w-25 {
  width: 6.25rem;
}

.h-25 {
  height: 6.25rem;
}
</style>