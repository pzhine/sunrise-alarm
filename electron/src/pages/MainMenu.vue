<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="menuItems"
      @select="handleMenuSelection"
      class="w-full"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();

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

// Handle menu item selection
const handleMenuSelection = (item: any) => {
  // The onSelect handler will be called automatically by the InteractiveList component
  // This handler is kept for backward compatibility and potential future use
};
</script>
