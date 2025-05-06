<template>
  <SynthwaveSunrise :skip-animation="true" />
  <div
    class="p-8"
    @mousedown.right="goToMenu"
    @keydown.enter="goToMenu"
    @wheel="handleWheelEvent"
    tabindex="0"
    ref="clockContainer"
  >
    <div class="mb-10" style="font-size: 180px">{{ formattedTime }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';
import { isGlobalSoundPlaying } from '../services/audioService';
import SynthwaveSunrise from '../animations/SynthwaveSunrise.vue';

const router = useRouter();
const appStore = useAppStore();
const time = ref(new Date());
const formattedTime = ref('');
const clockContainer = ref<HTMLDivElement | null>(null);

// Navigation function
const goToMenu = (event: MouseEvent | KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
  router.push('/menu');
};

// Handle wheel event for volume or brightness control
const handleWheelEvent = (event: WheelEvent) => {
  event.preventDefault();

  // Determine mode based on whether sound is playing
  const mode = isGlobalSoundPlaying() ? 'volume' : 'lampBrightness';

  // Navigate to LevelControl page with appropriate mode
  router.push(`/level/${mode}`);
};

// Format time based on timeFormat preference
const updateFormattedTime = () => {
  const hours = time.value.getHours();
  const minutes = time.value.getMinutes().toString().padStart(2, '0');
  const seconds = time.value.getSeconds().toString().padStart(2, '0');

  if (appStore.timeFormat === '12h') {
    const isPM = hours >= 12;
    const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    formattedTime.value = `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
  } else {
    // 24h format
    formattedTime.value = `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
};

// Update time every second
let intervalId: number;
onMounted(() => {
  updateFormattedTime();
  intervalId = window.setInterval(() => {
    time.value = new Date();
    updateFormattedTime();
  }, 500);

  // Set focus to make the enter key work
  clockContainer.value?.focus();
});

// Clear interval when component is unmounted
onUnmounted(() => {
  clearInterval(intervalId);
});
</script>
