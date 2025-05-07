<template>
  <div tabindex="0" ref="clockContainer">
    <ClockComponent />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { isGlobalSoundPlaying } from '../services/audioService';
import ClockComponent from '../components/ClockComponent.vue';
import { onMounted, onUnmounted } from 'vue';

const router = useRouter();

// Navigation function
const goToMenu = (event: MouseEvent) => {
  if (event.button !== 2) return; // Only handle right-click
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

onMounted(() => {
  window.addEventListener('mousedown', goToMenu);
  window.addEventListener('wheel', handleWheelEvent, { passive: false });
});

onUnmounted(() => {
  window.removeEventListener('mousedown', goToMenu);
  window.removeEventListener('wheel', handleWheelEvent);
});
</script>
