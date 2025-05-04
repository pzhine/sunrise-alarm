<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="ledOptions"
      :showBackButton="true"
      title="Projector LED Control"
      :showTitle="true"
      @select="handleLEDSelection"
      @back="router.push('/menu')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList, { ListItem } from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();

// Create options for LEDs
const ledOptions = [
  {
    label: 'LED 0',
    value: 0,
  },
  {
    label: 'LED 1',
    value: 1,
  },
];

// Handle selection of an LED
const handleLEDSelection = (selected: ListItem) => {
  // Type guard to ensure selected is a valid object
  if (!selected || typeof selected !== 'object') {
    console.error('Invalid selection received');
    return;
  }
console.log('selected:', selected);
  router.push({
    name: 'ProjectorLEDControl',
    params: { ledIndex: selected.value },
  });
};

// When component mounts, restore LED settings from appState and send to Arduino
onMounted(() => {
  // Check if we have stored LED settings and send them to the Arduino
  if (appStore.projectorPreview) {
    // Iterate through all LEDs in the projectorPreview array
    appStore.projectorPreview.forEach((led, index) => {
      if (led) {
        window.ipcRenderer.invoke(
          'update-projector-led',
          index,
          led.red,
          led.green,
          led.blue,
          led.white
        );
      }
    });
    
    console.log('[ProjectorPreview] Sent saved LED settings to Arduino');
  }
});
</script>
