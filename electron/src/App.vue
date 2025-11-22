<template>
  <div class="app-container">
    <div class="round-display">
      <router-view />
      <TimeoutRedirect
        :ms="45000"
        redirectRoute="/"
        resetOnActivity="wheel"
        :excludeRoutes="[
          'SunrisePlayer', 'sunrise-player',   
          'Wifi', 'wifi', 
          'WifiPassword', 'wifi-password', 
          'WifiConnect', 'wifi-connect'
        ]"
      />
      <UpdateIndicator />
      <BluetoothNotifications />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from './stores/appState';
import { computed, watch, onMounted, onUnmounted } from 'vue';
import UpdateIndicator from './components/UpdateIndicator.vue';
import TimeoutRedirect from './components/TimeoutRedirect.vue';
import BluetoothNotifications from './components/BluetoothNotifications.vue';

const appStore = useAppStore();

// Computed property to get text brightness as a CSS filter value
const brightnessFilter = computed(() => {
  // Convert brightness percentage to a curve that starts fast and decelerates
  // Map input range [0-100] to output range [0.3-1.0] with square root scaling
  const normalizedInput = appStore.screenBrightness / 100; // Convert to 0-1 range
  const sqrtValue = Math.sqrt(normalizedInput); // Apply square root formula (√x)
  const brightnessValue = 0.7 + sqrtValue * 0.3; // Map to 0.7-1.0 range
  console.log(`Brightness Filter Value: ${brightnessValue}`);
  return `brightness(${brightnessValue})`;
});

// Update CSS variable when text brightness changes
watch(
  () => brightnessFilter.value,
  (newValue) => {
    document.documentElement.style.setProperty('--brightness-filter', newValue);
  },
  { immediate: true }
);

// Set initial value on mount
onMounted(() => {
  document.documentElement.style.setProperty(
    '--brightness-filter',
    brightnessFilter.value
  );
});

const handleTouchStart = () => {
  document.body.classList.add('cursor-hidden');
};

const handleMouseMove = () => {
  document.body.classList.remove('cursor-hidden');
};

onMounted(() => {
  window.addEventListener('touchstart', handleTouchStart);
  window.addEventListener('mousemove', handleMouseMove);
});

onUnmounted(() => {
  window.removeEventListener('touchstart', handleTouchStart);
  window.removeEventListener('mousemove', handleMouseMove);
});
</script>

<style>
/* Global text and border brightness styles */
:root {
  --brightness-filter: brightness(0.8); /* Default brightness */
}

/* Apply brightness filter to all text */
body {
  color-scheme: dark;
}

/* Apply brightness filter to text and borders */
* {
  filter: var(--brightness-filter);
}

/* Hide cursor when touching the screen */
.cursor-hidden {
  cursor: none !important;
}
</style>
