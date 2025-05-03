<template>
  <div class="p-8 w-full">
    <div v-if="isLoading" class="flex justify-center items-center h-64">
      <div class="text-xl">Loading sounds...</div>
    </div>
    <div v-else-if="error" class="text-red-500">
      {{ error }}
    </div>
    <div
      v-else-if="!sounds.length"
      class="flex justify-center items-center h-64"
    >
      <div class="text-xl">No sounds found for this country.</div>
    </div>
    <InteractiveList
      :items="soundsList"
      :showBackButton="true"
      @select="selectSound"
      @back="goBack"
    />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { playPreview, stopPreview } from '../services/audioService';
import { useAppStore } from '../stores/appState';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const sounds = ref<any[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const isPlaying = ref(false);
let audioElement: HTMLAudioElement | null = null;

// Function to remove common audio file extensions from sound names
const removeAudioExtensions = (name: string): string => {
  // Common audio file extensions to remove
  const extensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma', '.aiff', '.alac'];
  
  // Create a regex pattern that matches any of the extensions at the end of the string (case insensitive)
  const pattern = new RegExp(`(${extensions.map(ext => ext.replace('.', '\\.')).join('|')})$`, 'i');
  
  // Remove the extension if found
  return name.replace(pattern, '');
};

// Get the country name from the route params
const countryName = computed(() => {
  return decodeURIComponent(route.params.country as string);
});

// Get the search phrase from the route params
const searchPhrase = computed(() => {
  return decodeURIComponent(route.params.searchPhrase as string);
});

// Create a formatted list of sounds for the InteractiveList component
const soundsList = computed(() => {
  return sounds.value.map((sound) => {
    // Format duration in minutes:seconds
    const minutes = Math.floor(sound.duration / 60);
    const seconds = Math.floor(sound.duration % 60);
    const formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    return {
      label: removeAudioExtensions(sound.name),
      data: sound,
      // Add duration and a checkmark if this is the selected sound
      value: `${formattedDuration} ${appStore.alarmSound?.id === sound.id ? '✓' : ''}`,
    };
  });
});

onMounted(async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Get the sounds for this country via IPC
    const countrySounds = await window.ipcRenderer.invoke(
      'get-country-sounds',
      {
        query: searchPhrase.value,
        country: countryName.value,
      }
    );

    sounds.value = countrySounds;
  } catch (err) {
    error.value = 'Failed to load sounds. Please try again.';
    console.error('Error loading sounds:', err);
  } finally {
    isLoading.value = false;
  }
});

// Clean up any playing audio when unmounting
onBeforeUnmount(() => {
  if (audioElement) {
    stopPreview(audioElement);
    audioElement = null;
  }
});

// Save the current route information for later navigation
onMounted(() => {
  // Store the current sound list route
  appStore.setLastSoundListRoute('SoundsList', {
    searchPhrase: route.params.searchPhrase as string,
    country: route.params.country as string
  });
});

const selectSound = (sound: any) => {
  // Get the selected sound data
  const selectedSound = sound.data;
  if (selectedSound) {
    // Navigate to the sound player page
    router.push({
      name: 'SoundPlayer',
      params: {
        id: selectedSound.id.toString(),
        name: removeAudioExtensions(selectedSound.name),
        previewUrl: selectedSound.previews['preview-hq-mp3'],
        duration: selectedSound.duration.toString()
      }
    });
  }
};

const goBack = () => {
  // Stop any currently playing audio before navigating
  if (audioElement) {
    stopPreview(audioElement);
    audioElement = null;
  }

  // Navigate to the stored country list route if available
  if (appStore.lastCountryListRoute?.name === 'SoundCountries' && 
      appStore.lastCountryListRoute?.params) {
    router.push({
      name: 'SoundCountries',
      params: appStore.lastCountryListRoute.params
    });
  } else {
    // Fallback to sound categories if country route isn't stored
    router.push('/sounds');
  }
};
</script>
