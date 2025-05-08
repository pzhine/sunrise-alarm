<template>
  <div class="w-full">
    <InteractiveList
      :show-title="true"
      :title="soundName"
      :items="menuOptions"
      :showBackButton="true"
      @back="backToSoundsList"
    />
    <TimeoutRedirect
      :ms="15000"
      :redirectRoute="{ name: 'SoundPlayer' }"
      :resetOnActivity="'wheel'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';
import { getCurrentSoundInfo, stopGlobalSound } from '../services/audioService';
import TimeoutRedirect from '../components/TimeoutRedirect.vue';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

// Check if we have a currently playing sound
const currentPlayingSound = ref(getCurrentSoundInfo());

// Use route params if available, otherwise fall back to currently playing sound
const soundId = computed(() => {
  if (route.params.id) {
    return Number(route.params.id);
  }
  return currentPlayingSound.value?.id || 0;
});

const soundName = computed(() => {
  if (route.params.name) {
    return route.params.name as string;
  }
  return currentPlayingSound.value?.name || 'Unknown';
});

const previewUrl = computed(() => {
  if (route.params.previewUrl) {
    return route.params.previewUrl as string;
  }
  return currentPlayingSound.value?.previewUrl || '';
});

const duration = computed(() => {
  if (route.params.duration) {
    return Number(route.params.duration) || 0;
  }
  return currentPlayingSound.value?.duration || 0;
});

const category = computed(() => {
  if (route.params.category) {
    return route.params.category as string;
  }
  return currentPlayingSound.value?.category || '';
});

const country = computed(() => {
  if (route.params.country) {
    return route.params.country as string;
  }
  return currentPlayingSound.value?.country || '';
});

// Check if current sound is in favorites
const isInFavorites = computed(() =>
  appStore.isSoundInFavorites(soundId.value)
);

// Menu options for the interactive list
const menuOptions = computed(() => [
  {
    label: 'Set Alarm Sound',
    onSelect: () => setAsAlarmSound(),
  },
  {
    label: isInFavorites.value ? 'Remove from Favorites' : 'Add to Favorites',
    onSelect: () => toggleFavorite(),
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
]);

// Toggle favorite status for the current sound
const toggleFavorite = () => {
  if (isInFavorites.value) {
    // Remove from favorites
    appStore.removeSoundFromFavorites(soundId.value);
  } else {
    // Add to favorites
    appStore.addSoundToFavorites({
      id: soundId.value,
      name: soundName.value,
      previewUrl: previewUrl.value,
      duration: duration.value,
      category: category.value,
      country: country.value,
    });
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

  // Navigate back to menu after setting the alarm sound
  router.push('/sunriseSettings');
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
  router.push({ name: 'Clock' });
};
</script>
