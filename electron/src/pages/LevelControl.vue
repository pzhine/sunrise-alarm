<template>
  <div class="w-full p-16">
    <div class="w-full h-12 bg-gray-200 rounded-full overflow-hidden">
      <div
        class="h-full transition-all duration-200"
        :class="recentChange ? 'bg-blue-500' : 'bg-gray-500'"
        :style="{ width: `${level}%` }"
      ></div>
    </div>
  </div>
  <div class="flex flex-row fixed p-8 justify-between w-full items-start">
    <h1 class="text-2xl font-bold">{{ title }}</h1>
    <div class="text-3xl">{{ level }}%</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';
import { debounce } from 'lodash-es';

const props = defineProps<{
  type:
    | 'volume'
    | 'screenBrightness'
    | 'lampBrightness'
    | 'projectorBrightness';
}>();

const router = useRouter();
const appStore = useAppStore();

// Title mapping based on type
const titleMap = {
  volume: 'Volume',
  screenBrightness: 'Screen Brightness',
  lampBrightness: 'Lamp Brightness',
  projectorBrightness: 'Projector Brightness',
};

// Getter and setter functions based on type
const getters = {
  volume: () => appStore.volume,
  screenBrightness: () => appStore.screenBrightness,
  lampBrightness: () => appStore.lampBrightness,
  projectorBrightness: () => appStore.projectorBrightness,
};

const setters = {
  volume: (val: number) => appStore.setVolume(val),
  screenBrightness: (val: number) => appStore.setScreenBrightness(val),
  lampBrightness: (val: number) => appStore.setLampBrightness(val),
  projectorBrightness: (val: number) => appStore.setProjectorBrightness(val),
};

// Local state for level
const level = ref(0);
const recentChange = ref(false);
const scaling = ref(1);

// Computed title based on type
const title = computed(() => titleMap[props.type] || 'Level Control');

// Create debounced save function using lodash
const debouncedSave = debounce((value: number) => {
  setters[props.type](value);
}, 500);

// Handle wheel event to change level
const handleWheel = (event: WheelEvent) => {
  // Check if the wheel event was triggered by a touch
  // Chrome/Safari touch events don't have wheelDelta
  const isTouchGenerated = (event as any).wheelDeltaY === undefined;

  // Only prevent default for mouse-generated wheel events, not touch-generated ones
  if (!isTouchGenerated) {
    event.preventDefault();
  }

  // Detect scroll direction (positive deltaY means scrolling down)
  if (event.deltaY < 0) {
    // Scrolling up - increase level
    level.value = Math.min(level.value + 5, 100);
  } else if (event.deltaY > 0) {
    // Scrolling down - decrease level
    level.value = Math.max(level.value - 5, 0);
  }

  // Add visual feedback with color change
  recentChange.value = true;
  // Scale up slightly
  scaling.value = 1.1;

  // Reset visual feedback after a short delay
  setTimeout(() => {
    recentChange.value = false;
    scaling.value = 1;
  }, 300);

  // Save the level with debounce
  debouncedSave(level.value);
};

// Handle right click to return to menu
const handleRightClick = (event: MouseEvent) => {
  if (event.button === 2) {
    event.preventDefault();
    event.stopPropagation();

    // Make sure any pending changes are saved before navigating
    debouncedSave.flush();

    router.push('/menu');
  }
};

// Watch for level changes to ensure save happens even with non-wheel changes
watch(level, (newValue) => {
  debouncedSave(newValue);
});

// Initialize from global state and set up wheel event
onMounted(() => {
  level.value = getters[props.type]();

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

<style scoped>
.animate-fade-out {
  animation: fadeOut 1.5s forwards;
}

@keyframes fadeOut {
  0% {
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
