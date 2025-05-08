<template>
  <div class="w-full">
    <InteractiveList
      :title="'Sounds'"
      :show-title="true"
      :items="soundCategories"
      :showBackButton="true"
      @back="router.push('/menu')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import soundCategoriesData from '../../assets/soundCategories.json';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();
const soundCategories = ref<{ label: string; onSelect: () => void }[]>([]);

// Check if we have any favorite sounds
const hasFavorites = computed(() => appStore.favoriteSounds.length > 0);

onMounted(() => {
  // Create "Favorites" item that will be pinned at the top
  const favorites = {
    label: 'Favorites',
    value: hasFavorites.value
      ? `${appStore.favoriteSounds.length} sounds`
      : 'No favorites yet',
    onSelect: () => navigateToFavorites(),
  };

  // Transform the data to the format expected by InteractiveList
  const categoriesItems = soundCategoriesData.map((category) => ({
    label: category.name,
    onSelect: () => selectCategory(category),
  }));

  // Combine favorites with regular categories
  soundCategories.value = [favorites, ...categoriesItems];
});

const selectCategory = (category: any) => {
  console.log('Selected category:', category.searchPhrase);
  router.push({
    name: 'SoundCountries',
    params: {
      categoryName: category.name,
      searchPhrase: encodeURIComponent(category.searchPhrase),
    },
  });
};

const navigateToFavorites = () => {
  // If we have favorites, navigate to a special route to show them
  if (hasFavorites.value) {
    router.push({
      name: 'SoundsList',
      params: {
        searchPhrase: 'favorites',
        categoryName: 'Favorites',
        country: 'favorites',
      },
    });
  }
};
</script>
