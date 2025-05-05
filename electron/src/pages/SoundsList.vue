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
      <div class="text-xl">
        {{
          isFavorites
            ? 'No favorite sounds yet.'
            : 'No sounds found for this country.'
        }}
      </div>
    </div>
    <InteractiveList
      :items="soundsList"
      :showBackButton="true"
      :title="listTitle"
      :showTitle="true"
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

// Check if we're showing favorites
const isFavorites = computed(
  () => countryName.value === 'favorites' && searchPhrase.value === 'favorites'
);

// Function to remove common audio file extensions from sound names
const removeAudioExtensions = (name: string): string => {
  // Common audio file extensions to remove
  const extensions = [
    '.mp3',
    '.wav',
    '.ogg',
    '.flac',
    '.aac',
    '.m4a',
    '.wma',
    '.aiff',
    '.alac',
  ];

  // Create a regex pattern that matches any of the extensions at the end of the string (case insensitive)
  const pattern = new RegExp(
    `(${extensions.map((ext) => ext.replace('.', '\\.')).join('|')})$`,
    'i'
  );

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
const categoryName = computed(() => {
  return decodeURIComponent(route.params.categoryName as string);
});

// Title for the list
const listTitle = computed(() => {
  if (isFavorites.value) {
    return 'Favorite Sounds';
  }
  return `"${categoryName.value}" from ${countryName.value}`;
});

// Create a formatted list of sounds for the InteractiveList component
const soundsList = computed(() => {
  return sounds.value
    .sort((a, b) => {
      // Sort by duration in descending order
      return b.duration - a.duration;
    })
    .map((sound) => {
      // Format duration in minutes:seconds
      const minutes = Math.floor(sound.duration / 60);
      const seconds = Math.floor(sound.duration % 60);
      const formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

      // For favorites, prepare label with category and country info
      let label = removeAudioExtensions(sound.name);
      if (isFavorites.value) {
        if (sound.country) {
          label = `[${sound.country}] ${label}`;
        }
        if (sound.category) {
          label = `[${sound.category}] ${label}`;
        }
      }

      return {
        label: label,
        data: sound,
        // Add duration and a checkmark if this is the selected sound
        value: `${formattedDuration} ${appStore.alarmSound?.id === sound.id ? '✓' : ''}`,
      };
    })
    .sort((a, b) => {
      if (isFavorites.value) {
        // For favorites, sort by name
        return a.label.localeCompare(b.label);
      }
      return 0; // use default order for non-favorites
    });
});

onMounted(async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Check if we're showing favorites
    if (isFavorites.value) {
      // Use favorite sounds from the app state
      sounds.value = appStore.favoriteSounds;
      isLoading.value = false;
    } else {
      // Get the sounds for this country via IPC
      const countrySounds = await window.ipcRenderer.invoke(
        'get-country-sounds',
        {
          query: searchPhrase.value,
          country: countryName.value,
        }
      );

      sounds.value = countrySounds;
    }
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
    categoryName: route.params.categoryName as string,
    searchPhrase: route.params.searchPhrase as string,
    country: route.params.country as string,
  });
});

const selectSound = (sound: any) => {
  // Get the selected sound data
  const selectedSound = sound.data;
  if (selectedSound) {
    // Navigate to the sound player page
    const p = {
      name: 'SoundPlayer',
      params: isFavorites.value
        ? selectedSound
        : {
            id: selectedSound.id.toString(),
            name: removeAudioExtensions(selectedSound.name),
            previewUrl: selectedSound.previews['preview-hq-mp3'],
            duration: selectedSound.duration.toString(),
            category: categoryName.value,
            country: countryName.value,
          },
    };
    console.log('Navigating to SoundPlayer with params:', p);
    router.push(p);
  }
};

const goBack = () => {
  // Stop any currently playing audio before navigating
  if (audioElement) {
    stopPreview(audioElement);
    audioElement = null;
  }

  // If we're in favorites, go back to sound categories
  if (isFavorites.value) {
    router.push('/sounds');
    return;
  }

  // Otherwise, navigate to the stored country list route if available
  if (
    appStore.lastCountryListRoute?.name === 'SoundCountries' &&
    appStore.lastCountryListRoute?.params
  ) {
    router.push({
      name: 'SoundCountries',
      params: appStore.lastCountryListRoute.params,
    });
  } else {
    // Fallback to sound categories if country route isn't stored
    router.push('/sounds');
  }
};
</script>
