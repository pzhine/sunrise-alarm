<template>
  <div class="sunrise-player">
    <!-- SynthwaveSunrise animation in the background -->
    <SynthwaveSunrise
      class="background-animation"
      :duration="sunriseDuration / 1000"
      :style="{ opacity: sunriseOpacity }"
    />

    <!-- Transparent clock overlay in the foreground -->
    <ClockComponent
      :transparent="true"
      :transparentReverse="showTransparentReverse"
    />

    <!-- Touch/click overlay to capture click events -->
    <div class="touch-overlay" @click="stopSunrise"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import SynthwaveSunrise from '../animations/SynthwaveSunrise.vue';
import ClockComponent from '../components/ClockComponent.vue';
import { useAppStore } from '../stores/appState';
import {
  playGlobalSound,
  stopGlobalSound,
  setGlobalVolume,
  getCurrentSoundInfo,
} from '../services/audioService';

const router = useRouter();
const appStore = useAppStore();
const animationStartTime = ref(Date.now());
const volumeUpdateInterval = ref<number | null>(null);
const showTransparentReverse = ref(false);
const transparentReverseTimer = ref<number | null>(null);
const sunriseOpacity = ref(1);

// Computed property to get the total sunrise duration in milliseconds
const sunriseDuration = computed(() => appStore.sunriseDuration * 1000);

// Stop the sunrise and navigate back
const stopSunrise = async () => {
  // Stop the audio
  stopGlobalSound();

  // Clear the volume update interval
  if (volumeUpdateInterval.value) {
    clearInterval(volumeUpdateInterval.value);
    volumeUpdateInterval.value = null;
  }

  // Clear the transparent reverse timer if it exists
  if (transparentReverseTimer.value) {
    clearTimeout(transparentReverseTimer.value);
    transparentReverseTimer.value = null;
  }

  // Stop the sunrise in the backend
  await appStore.stopSunrise();

  // Navigate back
  router.back();
};

// Function to update audio volume based on elapsed time
const updateVolume = () => {
  if (!getCurrentSoundInfo()) return;

  const elapsedTime = Date.now() - animationStartTime.value;
  const progress = Math.min(elapsedTime / sunriseDuration.value, 1);

  // Gradually increase volume from 0 to the user's preferred volume
  const targetVolume = appStore.volume / 100;
  const currentVolume = progress * targetVolume;

  // Set the global audio volume
  setGlobalVolume(currentVolume);

  // If we've reached the end of the animation duration, clear the interval
  if (progress >= 1) {
    if (volumeUpdateInterval.value) {
      clearInterval(volumeUpdateInterval.value);
      volumeUpdateInterval.value = null;
    }
  }
};

// Start playing the alarm sound and adjust volume
const startAudio = () => {
  if (!appStore.alarmSound) return;

  // Play the sound globally with the audioService
  playGlobalSound({
    id: appStore.alarmSound.id,
    name: appStore.alarmSound.name,
    previewUrl: appStore.alarmSound.previewUrl,
    duration: appStore.alarmSound.duration,
    category: appStore.alarmSound.category,
    country: appStore.alarmSound.country,
    currentTime: 0,
  });

  // Initialize volume to 0
  setGlobalVolume(0);

  // Start the volume update interval
  volumeUpdateInterval.value = window.setInterval(updateVolume, 100);
};

// Start the sunrise animation and audio
const startSunrise = async () => {
  animationStartTime.value = Date.now();

  // If we have an alarm sound, play it
  if (appStore.alarmSound) {
    startAudio();
  }

  // Start the actual sunrise animation on the Arduino
  await appStore.startSunrise();

  // Set a timer to trigger transparentReverse 5 seconds before the end of sunrise duration
  transparentReverseTimer.value = window.setTimeout(() => {
    showTransparentReverse.value = true;

    // Start fading out the SynthwaveSunrise component
    const fadeOutDuration = 5000; // 5 seconds to match the remaining time
    const fadeStep = 1 / (fadeOutDuration / 50); // Update every 50ms
    const fadeInterval = window.setInterval(() => {
      sunriseOpacity.value -= fadeStep;

      if (sunriseOpacity.value <= 0) {
        sunriseOpacity.value = 0;
        clearInterval(fadeInterval);
      }
    }, 50);
  }, sunriseDuration.value - 5000);
};

onMounted(() => {
  // Start the sunrise animation and audio
  startSunrise();

  // Add event listener for keyboard interactions
  window.addEventListener('mousedown', stopSunrise);
});

onUnmounted(() => {
  // Stop any playing audio
  stopGlobalSound();

  // Clear the interval if it exists
  if (volumeUpdateInterval.value) {
    clearInterval(volumeUpdateInterval.value);
    volumeUpdateInterval.value = null;
  }

  // Clear the transparent reverse timer if it exists
  if (transparentReverseTimer.value) {
    clearTimeout(transparentReverseTimer.value);
    transparentReverseTimer.value = null;
  }

  // Remove event listener
  window.removeEventListener('mousedown', stopSunrise);
});
</script>

<style scoped>
.sunrise-player {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.background-animation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.clock-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2;
  background-color: rgba(
    0,
    0,
    0,
    0.3
  ); /* Slight dark overlay to improve contrast */
  backdrop-filter: blur(2px); /* Slight blur for better readability */
}

.touch-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  cursor: pointer;
}
</style>
