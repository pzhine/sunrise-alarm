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
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();
const inactivityTimer = ref<number | null>(null);
const INACTIVITY_TIMEOUT = 10000; // 10 seconds in milliseconds

// Define menu items with their current values from the app store
const menuItems = computed(() => [
  {
    label: 'Set Alarm',
    value: appStore.formattedAlarmTime,
    onSelect: () => router.push('/alarm'),
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
]);

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

// Initialize timer and event listeners when component mounts
onMounted(() => {
  // Set initial timer
  resetInactivityTimer();

  // Add global event listeners to detect user activity
  window.addEventListener('mousemove', handleActivityEvent);
  window.addEventListener('keydown', handleActivityEvent);
  window.addEventListener('wheel', handleActivityEvent);
});

// Clean up timer and event listeners when component unmounts
onBeforeUnmount(() => {
  if (inactivityTimer.value !== null) {
    window.clearTimeout(inactivityTimer.value);
  }

  window.removeEventListener('mousemove', handleActivityEvent);
  window.removeEventListener('keydown', handleActivityEvent);
  window.removeEventListener('wheel', handleActivityEvent);
});
</script>
