<template>
  <div
    @mousedown.right="goToMenu"
    @keydown.enter="goToMenu"
    @wheel="handleWheelEvent"
    tabindex="0"
    ref="clockContainer"
  >
    <ClockComponent />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';
import { isGlobalSoundPlaying } from '../services/audioService';
import ClockComponent from '../components/ClockComponent.vue';

const router = useRouter();
const appStore = useAppStore();

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
</script>
