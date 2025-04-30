<template>
  <div class="p-8 w-full">
    <InteractiveList
      :items="soundCategories"
      :showBackButton="true"
      @select="selectCategory"
      @back="router.push('/menu')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList from '../components/InteractiveList.vue';
import soundCategoriesData from '../../assets/soundCategories.json';

const router = useRouter();
const soundCategories = ref<
  { label: string; value: string; onSelect: () => void }[]
>([]);

onMounted(() => {
  // Transform the data to the format expected by InteractiveList
  soundCategories.value = soundCategoriesData.map((category) => ({
    label: category.name,
    value: category.searchPhrase,
    onSelect: () => selectCategory(category),
  }));
});

const selectCategory = (category: any) => {
  router.push({
    name: 'SoundCountries',
    params: {
      searchPhrase: encodeURIComponent(category.searchPhrase || category.value),
    },
  });
};
</script>
