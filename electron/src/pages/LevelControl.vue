<template>
  <div class="flex flex-col items-center justify-center min-h-screen p-8">
    <div class="flex w-full justify-start mb-6">
      <button class="px-4 py-2 rounded border" @click="router.push('/menu')">
        Back
      </button>
    </div>

    <h1 class="text-2xl font-bold mb-6">{{ title }}</h1>

    <div class="flex flex-col items-center w-full max-w-md">
      <div class="text-4xl mb-8">{{ level }}%</div>

      <div class="w-full flex items-center justify-center mb-8">
        <button
          class="w-16 h-16 rounded-full border text-2xl"
          @click="decreaseLevel"
        >
          -
        </button>

        <div class="w-full mx-6 h-4 bg-gray-200 rounded-full overflow-hidden">
          <div class="h-full bg-gray-500" :style="{ width: `${level}%` }"></div>
        </div>

        <button
          class="w-16 h-16 rounded-full border text-2xl"
          @click="increaseLevel"
        >
          +
        </button>
      </div>

      <button class="px-6 py-3 rounded border text-lg" @click="saveLevel">
        Save
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';

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

// Computed title based on type
const title = computed(() => titleMap[props.type] || 'Level Control');

// Increase level (0-100)
const increaseLevel = () => {
  level.value = Math.min(level.value + 5, 100);
};

// Decrease level (0-100)
const decreaseLevel = () => {
  level.value = Math.max(level.value - 5, 0);
};

// Save level to global state
const saveLevel = () => {
  setters[props.type](level.value);
  router.push('/menu');
};

// Initialize from global state
onMounted(() => {
  level.value = getters[props.type]();
});
</script>
