<template>
  <div class="p-8 w-full">
    <div v-if="isLoading" class="flex justify-center items-center h-64">
      <div class="text-xl">Loading sounds...</div>
    </div>
    <div v-else-if="error" class="text-red-500">
      {{ error }}
    </div>
    <InteractiveList
      v-else
      :items="countryList"
      :title="searchPhrase"
      :showTitle="true"
      :showBackButton="true"
      @select="selectCountry"
      @back="router.push('/sounds')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import { useAppStore } from '../stores/appState';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const isLoading = ref(true);
const error = ref<string | null>(null);
const soundsByCountry = ref<Record<string, any[]>>({});

// Extract the search phrase from the route params
const searchPhrase = computed(() => {
  return decodeURIComponent(route.params.searchPhrase as string);
});

// Create an array of countries for the InteractiveList component
const countryList = computed(() => {
  return Object.keys(soundsByCountry.value).map((country) => ({
    label: country,
    value: `${soundsByCountry.value[country].length} sounds`,
    data: soundsByCountry.value[country],
  }));
});

onMounted(async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Store the current route information for later navigation
    appStore.setLastCountryListRoute('SoundCountries', {
      searchPhrase: searchPhrase.value
    });

    // Call the Freesound API through Electron IPC
    const countryGroups = await window.ipcRenderer.invoke(
      'get-sounds-by-country',
      searchPhrase.value
    );

    soundsByCountry.value = countryGroups;
  } catch (err) {
    error.value = 'Failed to load sounds. Please try again.';
    console.error('Error loading sounds:', err);
  } finally {
    isLoading.value = false;
  }
});

const selectCountry = (country: any) => {
  // Navigate to the sounds list for the selected country
  router.push({
    name: 'SoundsList',
    params: {
      searchPhrase: route.params.searchPhrase,
      country: encodeURIComponent(country.label),
    },
    // No longer passing the sounds data via router state
  });
};
</script>
