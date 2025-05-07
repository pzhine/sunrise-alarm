<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="menuItems"
      :showBackButton="true"
      :showTitle="true"
      title="Sunrise Sounds"
      @back="router.push('/sunriseSettings')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList, { ListItem } from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();

// Define menu items with their current values
const menuItems = computed(() => {
  const items = [
    appStore.alarmSound
      ? {
          label: appStore.alarmSound.name,
          value: 'Preview',
          onSelect: () => previewCurrentSound(),
          customClass: 'text-blue-500',
        }
      : null,
    {
      label: 'No Sound',
      value: appStore.alarmSound === null ? '✓' : '',
      onSelect: () => {
        appStore.setAlarmSound(null);
        router.push('/sunriseSettings');
      },
    },
    {
      label: 'Browse Sounds',
      onSelect: () => router.push('/sounds'),
    },
  ].filter(Boolean) as ListItem[]; // Remove null items

  return items;
});

// Preview the currently selected alarm sound
const previewCurrentSound = () => {
  if (appStore.alarmSound) {
    router.push({
      name: 'SoundPlayer',
      params: {
        id: appStore.alarmSound.id.toString(),
        name: appStore.alarmSound.name,
        previewUrl: appStore.alarmSound.previewUrl,
        duration: appStore.alarmSound.duration?.toString() || '0',
      },
    });
  }
};
</script>
