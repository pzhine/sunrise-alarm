<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="menuItems"
      :showBackButton="true"
      @select="handleMenuSelection"
      @back="router.push('/')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';
import { isGlobalSoundPlaying, getCurrentSoundInfo } from '../services/audioService';

const router = useRouter();
const appStore = useAppStore();
const inactivityTimer = ref<number | null>(null);
const INACTIVITY_TIMEOUT = 10000; // 10 seconds in milliseconds
const isPlaying = ref(isGlobalSoundPlaying());

// Update the isPlaying value periodically to detect changes
const playbackCheckInterval = ref<number | null>(null);

// Define menu items with their current values from the app store
const menuItems = computed(() => {
  const items = [];
  
  // Add "Now Playing" option only if a sound is currently playing
  if (isPlaying.value) {
    const currentSound = getCurrentSoundInfo();
    if (currentSound) {
      items.push({
        label: 'Now Playing',
        value: currentSound.name,
        onSelect: () => goToNowPlaying(),
      });
    }
  }
  
  // Standard menu items
  items.push(
    {
      label: 'Set Alarm',
      value: `${appStore.formattedAlarmTime} [${appStore.alarmSound?.name}]`,
      onSelect: () => router.push('/alarm'),
    },
    {
      label: 'Browse Sounds',
      onSelect: () => router.push('/sounds'),
    },
    {
      label: 'Volume',
      value: `${appStore.volume}%`,
      onSelect: () => router.push('/level/volume'),
    },
    {
      label: 'Screen Brightness',
      value: `${appStore.screenBrightness}%`,
      onSelect: () => router.push('/level/screenBrightness'),
    },
    {
      label: 'Lamp Brightness',
      value: `${appStore.lampBrightness}%`,
      onSelect: () => router.push('/level/lampBrightness'),
    },
    {
      label: 'Sunrise',
      value: appStore.sunriseActive ? 'Active' : 'Setup',
      onSelect: () => router.push('/sunrise'),
    },
    {
      label: 'Projector Preview',
      value: 'LED Control',
      onSelect: () => router.push('/projector'),
    },
    {
      label: 'Time Format',
      value: appStore.timeFormat,
      onSelect: () => {
        // Toggle between 12h and 24h format
        appStore.setTimeFormat(appStore.timeFormat === '12h' ? '24h' : '12h');
      },
    }
  );
  
  return items;
});

// Navigate to the currently playing sound
const goToNowPlaying = () => {
  // Now we can simply navigate to the route without parameters
  // The SoundPlayer component will use the currently playing sound info
  router.push({ name: 'SoundPlayer' });
};

// Handle menu item selection (for any additional processing if needed)
const handleMenuSelection = (item: any) => {
  // The onSelect handler will be called automatically by the InteractiveList component
};

// Create a single event handler for all activity types
const resetInactivityTimer = () => {
  // Clear existing timer if it exists
  if (inactivityTimer.value !== null) {
    window.clearTimeout(inactivityTimer.value);
  }

  // Set a new timeout
  inactivityTimer.value = window.setTimeout(() => {
    // Navigate back to home page after timeout
    router.push('/');
  }, INACTIVITY_TIMEOUT);
};

// Handle window-level activity events
const handleActivityEvent = (_event?: Event) => {
  resetInactivityTimer();
};

// Check if a sound is playing and update the reactive ref
const checkIsPlaying = () => {
  isPlaying.value = isGlobalSoundPlaying();
};

// Initialize timer and event listeners when component mounts
onMounted(() => {
  // Reset all projector LEDs when returning to main menu
  window.ipcRenderer.invoke('reset-all-projector-leds');
  
  // Set initial timer
  resetInactivityTimer();

  // Add global event listeners to detect user activity
  window.addEventListener('mousemove', handleActivityEvent);
  window.addEventListener('keydown', handleActivityEvent);
  window.addEventListener('wheel', handleActivityEvent);
  
  // Start interval to check if sound is playing
  playbackCheckInterval.value = window.setInterval(checkIsPlaying, 1000);
});

// Clean up timer and event listeners when component unmounts
onBeforeUnmount(() => {
  if (inactivityTimer.value !== null) {
    window.clearTimeout(inactivityTimer.value);
  }
  
  if (playbackCheckInterval.value !== null) {
    clearInterval(playbackCheckInterval.value);
  }

  window.removeEventListener('mousemove', handleActivityEvent);
  window.removeEventListener('keydown', handleActivityEvent);
  window.removeEventListener('wheel', handleActivityEvent);
});
</script>
