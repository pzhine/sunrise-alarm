<template>
  <div class="w-full">
    <InteractiveList
      :items="colorItems"
      :showBackButton="true"
      :title="`LED ${ledIndex} Control`"
      :showTitle="true"
      @select="handleSelection"
      @back="router.push('/projector')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';
import { ListItem } from '../components/InteractiveList.vue';
import { debounce, throttle } from 'lodash-es';

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();

// Get LED index from route params
const ledIndex = parseInt(route.params.ledIndex as string, 10);
console.log('[ProjectorLEDControl] LED Index:', ledIndex);

// Local state for color values with reactive updates
const red = ref(0);
const green = ref(0);
const blue = ref(0);
const white = ref(0);

// Preview color that properly represents white as added brightness
const previewColor = computed(() => {
  // Calculate how white affects the RGB values by adding brightness
  // White value (0-255) is added proportionally to each RGB component
  const whiteFactor = white.value / 255;

  // Add white contribution to each channel (white adds equal brightness to all channels)
  const r = Math.min(255, red.value + white.value);
  const g = Math.min(255, green.value + white.value);
  const b = Math.min(255, blue.value + white.value);

  return {
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
  };
});

// Function to adjust a color value
const adjustColorValue = (colorRef: Ref<number>, increment: number) => {
  colorRef.value = Math.max(0, Math.min(255, colorRef.value + increment * 5));
  throttledUpdateLED();
};

// Interactive menu items for color adjustments
const colorItems = computed(() => [
  {
    label: 'Red',
    value: `${red.value}`,
    canEdit: true,
    onEdit: (increment: number) => adjustColorValue(red, increment),
  },
  {
    label: 'Green',
    value: `${green.value}`,
    canEdit: true,
    onEdit: (increment: number) => adjustColorValue(green, increment),
  },
  {
    label: 'Blue',
    value: `${blue.value}`,
    canEdit: true,
    onEdit: (increment: number) => adjustColorValue(blue, increment),
  },
  {
    label: 'White',
    value: `${white.value}`,
    canEdit: true,
    onEdit: (increment: number) => adjustColorValue(white, increment),
  },
  //   {
  //     label: 'Preview',
  //     value: 'RGBW',
  //   }
]);

// Handle selection of a menu item
const handleSelection = (item: ListItem) => {
  // Most interactions are handled by onEdit or onSelect callbacks
};

// Send updates to the LED via IPC
const updateLED = () => {
  // Save values to appStore
  appStore.projectorPreview[ledIndex] = {
    red: red.value,
    green: green.value,
    blue: blue.value,
    white: white.value,
  };

  // Send command to Arduino via IPC
  window.ipcRenderer.invoke(
    'update-projector-led',
    ledIndex,
    red.value,
    green.value,
    blue.value,
    white.value
  );
};

const throttledUpdateLED = throttle(updateLED, 200, { trailing: true });

// Load initial values from appStore
onMounted(() => {
  const ledData = appStore.projectorPreview[ledIndex];
  if (ledData) {
    red.value = ledData.red;
    green.value = ledData.green;
    blue.value = ledData.blue;
    white.value = ledData.white;
  }
});
</script>

<style scoped>
/* Add custom styling for color previewing */
.color-preview {
  width: 100%;
  height: 50px;
  border-radius: 8px;
  margin-top: 10px;
}
</style>
