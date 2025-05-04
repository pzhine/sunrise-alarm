<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="menuItems"
      :showBackButton="true"
      :showTitle="true"
      title="Sunrise Settings"
      @select="handleMenuSelection"
      @back="router.push('/main')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();

// Format the duration in minutes and seconds
const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

// Define menu items with their current values
const menuItems = computed(() => {
  const items = [
    // {
    //   label: 'Load Timeline',
    //   value: appStore.sunriseTimeline.length 
    //     ? `${appStore.sunriseTimeline.length} steps loaded` 
    //     : 'Default',
    //   onSelect: () => loadSunriseTimeline(),
    // },
    {
      label: 'Duration',
      value: formatDuration(appStore.sunriseDuration),
      canEdit: true,
      onEdit: (increment: number) => adjustDuration(increment),
    },
    {
      label: 'Brightness',
      value: `${appStore.sunriseBrightness}%`,
      canEdit: true,
      onEdit: (increment: number) => adjustBrightness(increment),
    },
    {
      label: appStore.sunriseActive ? 'Stop Sunrise' : 'Start Sunrise',
      onSelect: () => toggleSunrise(),
      customStyle: appStore.sunriseActive ? 'color: #ff6b6b;' : 'color: #51cf66;'
    }
  ];
  
  return items;
});

// Toggle sunrise on/off
const toggleSunrise = async () => {
  if (appStore.sunriseTimeline.length === 0) {
    // If no timeline is loaded, load the default one
    await loadDefaultTimeline();
  }
  appStore.toggleSunriseActive();
};

// Adjust sunrise duration with the edit controls
const adjustDuration = (increment: number) => {
  let newDuration = appStore.sunriseDuration + (increment * 30); // Adjust in 30-second increments
  
  // Ensure duration is between 30 seconds and 30 minutes
  newDuration = Math.max(30, Math.min(1800, newDuration));
  
  appStore.sunriseDuration = newDuration;
};

// Adjust sunrise brightness with the edit controls
const adjustBrightness = (increment: number) => {
  let newBrightness = appStore.sunriseBrightness + increment; // Adjust in 1% increments
  
  // Ensure brightness is between 0% and 100%
  newBrightness = Math.max(0, Math.min(100, newBrightness));
  
  appStore.setSunriseBrightness(newBrightness);
};

// Load the default timeline example
const loadDefaultTimeline = async () => {
  try {
    const timeline = await window.ipcRenderer.invoke('load-default-sunrise-timeline');
    if (timeline && timeline.length > 0) {
      appStore.sunriseTimeline = timeline;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to load default sunrise timeline:', error);
    return false;
  }
};

// Handle menu item selection
const handleMenuSelection = (item: any) => {
  // The onSelect handler will be called automatically by the InteractiveList component
};

onMounted(async () => {
  // If no timeline is loaded yet, try to load the default one
  if (appStore.sunriseTimeline.length === 0) {
    await loadDefaultTimeline();
  }
});
</script>