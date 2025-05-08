<template>
  <div>
    <div class="flex items-center justify-center text-8xl mb-8">
      <span :class="{ 'text-blue-500': editMode === 'hours' }">{{
        formattedHours
      }}</span>
      <span class="mx-2">:</span>
      <span :class="{ 'text-blue-500': editMode === 'minutes' }">{{
        formattedMinutes
      }}</span>
      <span v-if="appStore.timeFormat === '12h'" class="ml-4">{{
        isPM ? 'PM' : 'AM'
      }}</span>
    </div>
  </div>
  <div class="flex flex-row fixed py-4 px-6 justify-between w-full items-start">
    <h1 class="text-2xl font-bold mb-6">Set Alarm</h1>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';
import { debounce } from 'lodash-es';

const router = useRouter();
const appStore = useAppStore();

// Local state for alarm time
const hours = ref(appStore.alarmTime[0]);
const minutes = ref(appStore.alarmTime[1]);
const editMode = ref('hours'); // 'hours' or 'minutes'

// Computed display values
const isPM = computed(() => hours.value >= 12);

// Formatted display values based on time format preference
const formattedHours = computed(() => {
  if (appStore.timeFormat === '12h') {
    const hours12 = hours.value % 12 || 12; // Convert 0 to 12 for 12 AM
    return hours12.toString().padStart(2, '0');
  } else {
    return hours.value.toString().padStart(2, '0');
  }
});

const formattedMinutes = computed(() => {
  return minutes.value.toString().padStart(2, '0');
});

// Create debounced save function
const debouncedSave = debounce(() => {
  appStore.setAlarmTime(hours.value, minutes.value);
}, 300);

// Handle wheel event to change time based on current edit mode
const handleWheel = (event: WheelEvent) => {
  // Check if the wheel event was triggered by a touch
  const isTouchGenerated = (event as any).wheelDeltaY === undefined;

  // Only prevent default for mouse-generated wheel events, not touch-generated ones
  if (!isTouchGenerated) {
    event.preventDefault();
  }

  if (editMode.value === 'hours') {
    // Scrolling up decreases, scrolling down increases (consistent with natural scrolling)
    if (event.deltaY < 0) {
      hours.value = (hours.value + 1) % 24;
    } else if (event.deltaY > 0) {
      hours.value = (hours.value - 1 + 24) % 24;
    }
  } else if (editMode.value === 'minutes') {
    if (event.deltaY < 0) {
      minutes.value = (Math.round(minutes.value / 1) * 1 + 1) % 60;
    } else if (event.deltaY > 0) {
      minutes.value = (Math.round(minutes.value / 1) * 1 - 1 + 60) % 60;
    }
  }

  // Save changes as they're made
  debouncedSave();
};

// Handle right click to advance mode or return to menu
const handleRightClick = (event: MouseEvent) => {
  if (event.button === 2) {
    event.preventDefault();
    event.stopPropagation();

    if (editMode.value === 'hours') {
      // Switch to minutes mode
      editMode.value = 'minutes';
    } else {
      // Make sure any pending changes are saved before navigating
      debouncedSave.flush();
      // Return to menu
      router.push('/sunriseSettings');
    }
  }
};

// Initialize from global state and set up wheel event
onMounted(() => {
  hours.value = appStore.alarmTime[0];
  minutes.value = appStore.alarmTime[1];

  // Add global wheel event listener to window
  window.addEventListener('wheel', handleWheel, { passive: false });

  // Add global mousedown event listener for right-click detection
  window.addEventListener('mousedown', handleRightClick);

  // Prevent context menu from appearing on right-click
  window.addEventListener('contextmenu', (e) => e.preventDefault());
});

// Clean up event listeners when component unmounts
onBeforeUnmount(() => {
  // Ensure any pending changes are saved before unmounting
  debouncedSave.flush();

  window.removeEventListener('wheel', handleWheel);
  window.removeEventListener('mousedown', handleRightClick);
  window.removeEventListener('contextmenu', (e) => e.preventDefault());
});
</script>
