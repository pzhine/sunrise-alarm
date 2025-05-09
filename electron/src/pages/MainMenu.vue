<template>
  <div class="w-full">
    <InteractiveList
      :title="'Main Menu'"
      :show-title="true"
      :items="menuItems"
      :showBackButton="true"
      @select="handleMenuSelection"
      @back="router.push('/')"
    />
  </div>
  <TimeoutRedirect
    :ms="INACTIVITY_TIMEOUT"
    :redirectRoute="'/'"
    :resetOnActivity="'wheel'"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList, { ListItem } from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';
import {
  isGlobalSoundPlaying,
  getCurrentSoundInfo,
} from '../services/audioService';
import TimeoutRedirect from '../components/TimeoutRedirect.vue';

const router = useRouter();
const appStore = useAppStore();
const inactivityTimer = ref<number | null>(null);
const INACTIVITY_TIMEOUT = 10000; // 10 seconds in milliseconds
const isPlaying = ref(isGlobalSoundPlaying());

// Update the isPlaying value periodically to detect changes
const playbackCheckInterval = ref<number | null>(null);

// Define menu items with their current values from the app store
const menuItems = computed(() => {
  const items: ListItem[] = [];

  // Add "Now Playing" option only if a sound is currently playing
  if (isPlaying.value) {
    const currentSound = getCurrentSoundInfo();
    if (currentSound) {
      items.push({
        label: 'Now Playing',
        value: currentSound.name,
        onSelect: () => goToNowPlaying(),
        customClass: 'text-blue-400',
      });
    }
  }

  // Standard menu items
  items.push(
    {
      label: 'Sounds',
      onSelect: () => router.push('/sounds'),
    },
    {
      label: 'Sunrise',
      onSelect: () => router.push('/sunriseSettings'),
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
    // {
    //   label: 'Projector Preview',
    //   value: 'LED Control',
    //   onSelect: () => router.push('/projector'),
    // },
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
  router.push({ name: 'SoundPlayerMenu' });
};

// Handle menu item selection (for any additional processing if needed)
const handleMenuSelection = (item: any) => {
  // The onSelect handler will be called automatically by the InteractiveList component
};

// Check if a sound is playing and update the reactive ref
const checkIsPlaying = () => {
  isPlaying.value = isGlobalSoundPlaying();
};

// Initialize timer and event listeners when component mounts
onMounted(() => {
  // Reset all projector LEDs when returning to main menu
  window.ipcRenderer.invoke('reset-all-projector-leds');

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
});
</script>
