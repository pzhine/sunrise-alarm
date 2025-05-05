<template>
  <div class="p-8 w-full">
    <div class="text-2xl mb-8 text-center">{{ soundName }}</div>
    <InteractiveList
      :items="menuOptions"
      :showBackButton="true"
      @select="handleMenuSelection"
      @back="backToSoundsList"
    />
    <TimeoutRedirect
      :ms="10000"
      :redirectRoute="{ name: 'SoundPlayer' }"
      :resetOnActivity="'wheel'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';
import { stopGlobalSound } from '../services/audioService';
import TimeoutRedirect from '../components/TimeoutRedirect.vue';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const soundId = computed(() => Number(route.params.id));
const soundName = computed(() => route.params.name as string);
const previewUrl = computed(() => route.params.previewUrl as string);
const duration = computed(() => Number(route.params.duration) || 0);

// Menu options for the interactive list
const menuOptions = [
  {
    label: 'Set Alarm Sound',
    onSelect: () => setAsAlarmSound(),
  },
  {
    label: 'Stop Sound',
    onSelect: () => stopSound(),
  },
  {
    label: 'Back to Sound',
    onSelect: () => router.push({ name: 'SoundPlayer' }),
  },
  {
    label: 'Back to Clock',
    onSelect: () => backToClock(),
  },
];

// Handle menu option selection
const handleMenuSelection = (item: any) => {
  if (item.onSelect) {
    item.onSelect();
  }
};

// Set the selected sound as the alarm sound
const setAsAlarmSound = () => {
  appStore.setAlarmSound({
    id: soundId.value,
    name: soundName.value,
    previewUrl: previewUrl.value,
    duration: duration.value,
  });

  // Navigate back to clock after setting the alarm sound
  router.push('/menu');
};

// Stop sound playback
const stopSound = () => {
  stopGlobalSound();
  router.push('/menu');
};

// Go back to the sounds list screen
const backToSoundsList = () => {
  // If we have stored the last sound list route, navigate to it
  if (
    appStore.lastSoundListRoute?.name === 'SoundsList' &&
    appStore.lastSoundListRoute?.params
  ) {
    router.push({
      name: 'SoundsList',
      params: appStore.lastSoundListRoute.params,
    });
  } else {
    // Fallback to default sound list if route isn't stored
    router.push('/sounds');
  }
};

// Go back directly to the clock screen
const backToClock = () => {
  router.push('/');
};
</script>
