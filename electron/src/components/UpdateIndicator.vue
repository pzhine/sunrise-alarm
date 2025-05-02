<template>
  <div v-if="visible" class="update-indicator" :class="indicatorClass"></div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { UpdateStatus } from '../../types/state';

const visible = ref(false);
const status = ref<UpdateStatus>('not-available');

// Computed property to determine the class based on status
const indicatorClass = computed(() => {
  if (status.value === 'error') return 'error';
  if (
    status.value === 'checking' ||
    status.value === 'downloading' ||
    status.value === 'installing'
  )
    return 'updating';
  return '';
});

onMounted(() => {
  // Define the update status listener
  const updateStatusListener = (_: unknown, newStatus: UpdateStatus) => {
    status.value = newStatus;

    if (
      newStatus === 'checking' ||
      newStatus === 'downloading' ||
      newStatus === 'installing'
    ) {
      visible.value = true;
    } else if (newStatus === 'error') {
      visible.value = true;
      // Hide error indicator after 30 seconds
      setTimeout(() => {
        if (status.value === 'error') {
          visible.value = false;
        }
      }, 30000);
    } else {
      // For 'not-available', hide after a short delay
      setTimeout(() => {
        visible.value = false;
      }, 3000);
    }
  };

  // Listen for update status messages from the main process
  window.ipcRenderer.on('update-status', updateStatusListener);

  // Store the listener for cleanup
  onUnmounted(() => {
    // Clean up the event listener
    window.ipcRenderer.off('update-status', updateStatusListener);
  });
});
</script>

<style scoped>
.update-indicator {
  position: fixed;
  top: 10px;
  right: 10px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  z-index: 1000;
}

.updating {
  background-color: #3498db; /* Blue color for update in progress */
  animation: pulse 2s infinite;
}

.error {
  background-color: #e74c3c; /* Red color for error */
}

@keyframes pulse {
  0% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.4;
  }
}
</style>
