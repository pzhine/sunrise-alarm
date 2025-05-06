<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="menuItems"
      :showBackButton="true"
      :showTitle="true"
      title="Sunrise Settings"
      @back="router.push('/menu')"
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

// Format the duration in minutes and seconds
const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

// Define menu items with their current values
const menuItems = computed(() => {
  const items = [
    {
      label: 'Alarm Active',
      value: appStore.alarmActive ? 'Yes' : 'No',
      onSelect: () => {
        appStore.toggleAlarmActive();
      },
    },
    appStore.alarmActive
      ? {
          label: 'Alarm',
          value: `${appStore.formattedAlarmTime}`,
          onSelect: () => router.push('/alarm'),
        }
      : null,
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
      label: 'Start Sunrise',
      onSelect: () => startSunrise(),
    },
  ].filter((i) => !!i); // Filter out null values

  return items;
});

const startSunrise = async () => {
  appStore.startSunrise();
};

// Adjust sunrise duration with the edit controls
const adjustDuration = (increment: number) => {
  let newDuration = appStore.sunriseDuration + increment * 30; // Adjust in 30-second increments

  // Ensure duration is between 30 seconds and 30 minutes
  newDuration = Math.max(30, Math.min(1800, newDuration));

  appStore.sunriseDuration = newDuration;
};

// Adjust sunrise brightness with the edit controls
const adjustBrightness = (increment: number) => {
  let newBrightness = appStore.sunriseBrightness + increment * 10; // Adjust in 10% increments

  // Ensure brightness is between 0% and 100%
  newBrightness = Math.max(0, Math.min(100, newBrightness));

  appStore.setSunriseBrightness(newBrightness);
};
</script>
