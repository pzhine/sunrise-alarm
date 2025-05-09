<template>
  <div
    class="flex flex-col items-center justify-center h-full w-full text-center"
  >
    <div class="text-2xl mb-8 max-w-lg text-center">{{ soundName }}</div>

    <div class="w-full max-w-md bg-gray-200 rounded-full h-4 mb-8">
      <div
        class="bg-blue-400 h-4 rounded-full transition-all duration-300"
        :style="{ width: `${playbackProgress}%` }"
      ></div>
    </div>

    <div class="text-lg mb-4">Volume: {{ volume }}%</div>
  </div>
  <!-- <TimeoutRedirect :ms="30000" :redirectRoute="'/'" /> -->
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';
import { playGlobalSound, getCurrentSoundInfo } from '../services/audioService';
import TimeoutRedirect from '../components/TimeoutRedirect.vue';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

// Check if we have a currently playing sound
const currentPlayingSound = ref(getCurrentSoundInfo());

// Use route params if available, otherwise fall back to currently playing sound
const soundId = computed(() => {
  if (route.params.id) {
    return Number(route.params.id);
  }
  return currentPlayingSound.value?.id || 0;
});

const soundName = computed(() => {
  if (route.params.name) {
    return route.params.name as string;
  }
  return currentPlayingSound.value?.name || 'Unknown';
});

const previewUrl = computed(() => {
  if (route.params.previewUrl) {
    return route.params.previewUrl as string;
  }
  return currentPlayingSound.value?.previewUrl || '';
});

const duration = computed(() => {
  if (route.params.duration) {
    return Number(route.params.duration) || 0;
  }
  return currentPlayingSound.value?.duration || 0;
});

const category = computed(() => {
  if (route.params.category) {
    return route.params.category as string;
  }
  return currentPlayingSound.value?.category || '';
});

const country = computed(() => {
  if (route.params.country) {
    return route.params.country as string;
  }
  return currentPlayingSound.value?.country || '';
});

const playbackProgress = ref(0);
const volume = computed(() => appStore.volume);
const progressUpdateInterval = ref<number | null>(null);

// Start or resume global sound playback
const startPlayback = () => {
  // Check if this is the same sound that's already playing
  const currentSound = getCurrentSoundInfo();

  if (currentSound && currentSound.id === soundId.value) {
    // Already playing this sound, do nothing
    return;
  }

  // Play the sound globally
  playGlobalSound({
    id: soundId.value,
    name: soundName.value,
    previewUrl: previewUrl.value,
    duration: duration.value,
    currentTime: 0, // Access .value of the computed ref
    category: category.value,
    country: country.value,
  });
};

// Update the playback progress
const updateProgress = () => {
  const currentSound = getCurrentSoundInfo();
  if (currentSound) {
    const percent = (currentSound.currentTime! / duration.value) * 100;
    playbackProgress.value = Math.round(percent);
  }
};

// Handle volume change with mouse wheel
const handleWheel = (event: WheelEvent) => {
  // Check if the wheel event was triggered by a touch
  const isTouchGenerated = (event as any).wheelDeltaY === undefined;

  // Only prevent default for mouse-generated wheel events
  if (!isTouchGenerated) {
    event.preventDefault();
  }

  // Detect scroll direction
  if (event.deltaY < 0) {
    // Scrolling up - increase volume
    appStore.setVolume(Math.min(appStore.volume + 5, 100));
  } else if (event.deltaY > 0) {
    // Scrolling down - decrease volume
    appStore.setVolume(Math.max(appStore.volume - 5, 0));
  }
};

// Handle mouse clicks to go to menu
const handleClick = () => {
  goToSoundPlayerMenu();
};

// Go to the sound player menu
const goToSoundPlayerMenu = () => {
  // First, remove all event listeners to prevent them from sticking around
  removeEventListeners();

  const currentSound = getCurrentSoundInfo();
  if (currentSound) {
    router.push({
      name: 'SoundPlayerMenu',
      params: {
        id: currentSound.id.toString(),
        name: currentSound.name,
        previewUrl: currentSound.previewUrl,
        duration: String(currentSound.duration),
        currentTime: String(currentSound.currentTime || 0),
        category: currentSound.category,
        country: currentSound.country,
      },
    });
  }
};

// Helper function to add all event listeners
const addEventListeners = () => {
  window.addEventListener('wheel', handleWheel, { passive: false });
  window.addEventListener('click', handleClick);
  window.addEventListener('contextmenu', handleContextMenu);
};

// Separate handler for contextmenu to make it easier to remove
const handleContextMenu = (e: Event) => {
  e.preventDefault();
  handleClick();
};

// Helper function to remove all event listeners
const removeEventListeners = () => {
  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('click', handleClick);
  window.removeEventListener('contextmenu', handleContextMenu);
};

// Set up progress tracking and event listeners
onMounted(() => {
  // Start playback
  startPlayback();

  // Set up interval to update progress regularly
  progressUpdateInterval.value = window.setInterval(updateProgress, 200);

  // Add event listeners with a delay to prevent catching clicks from the previous screen
  setTimeout(() => {
    addEventListeners();
  }, 500); // 500ms delay
});

// Clean up on component unmount
onBeforeUnmount(() => {
  // Clear interval
  if (progressUpdateInterval.value !== null) {
    clearInterval(progressUpdateInterval.value);
    progressUpdateInterval.value = null;
  }

  // Remove event listeners
  removeEventListeners();
});
</script>
