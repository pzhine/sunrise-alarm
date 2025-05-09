<template>
  <div tabindex="0" ref="clockContainer">
    <div :class="['clock-wrapper', { dimmed: isDimmed }]">
      <ClockComponent ref="clockComponent" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { isGlobalSoundPlaying } from '../services/audioService';
import ClockComponent from '../components/ClockComponent.vue';
import { onMounted, onUnmounted, ref } from 'vue';

const router = useRouter();
const clockContainer = ref<HTMLDivElement | null>(null);
const inactivityTimer = ref<number | null>(null);
const isDimmed = ref(false);

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

// Handle any tap/click on the screen to restore brightness
const handleTap = (event: MouseEvent) => {
  // If it's a right-click, let goToMenu handle it
  if (event.button === 2) return;

  // Otherwise, restore brightness if dimmed
  if (isDimmed.value) {
    restoreBrightness();
  }

  // Reset inactivity timer
  resetInactivityTimer();
};

// Start the inactivity timer
const startInactivityTimer = () => {
  // Clear any existing timer first
  if (inactivityTimer.value !== null) {
    window.clearTimeout(inactivityTimer.value);
  }

  // Set new timer - after 30 seconds, dim the clock
  inactivityTimer.value = window.setTimeout(() => {
    dimBrightness();
  }, 30000);
};

// Reset the inactivity timer
const resetInactivityTimer = () => {
  startInactivityTimer();
};

// Dim the clock brightness to 15%
const dimBrightness = () => {
  isDimmed.value = true;
};

// Restore the clock brightness to 100%
const restoreBrightness = () => {
  isDimmed.value = false;
};

onMounted(() => {
  window.addEventListener('mousedown', goToMenu);
  window.addEventListener('mousedown', handleTap);
  window.addEventListener('wheel', handleWheelEvent, { passive: false });

  // Start the inactivity timer
  startInactivityTimer();
});

onUnmounted(() => {
  window.removeEventListener('mousedown', goToMenu);
  window.removeEventListener('mousedown', handleTap);
  window.removeEventListener('wheel', handleWheelEvent);

  // Clean up the timer if it exists
  if (inactivityTimer.value !== null) {
    window.clearTimeout(inactivityTimer.value);
    inactivityTimer.value = null;
  }
});
</script>

<style scoped>
.clock-wrapper {
  /* Default state - full brightness and color */
  filter: brightness(1) saturate(1);
  transition: filter 0.5s ease-in-out;
}

.clock-wrapper.dimmed {
  /* Dimmed state - 15% brightness and greyscale */
  filter: brightness(0.23) saturate(0);
  transition: filter 10s ease-out;
}
</style>
