<template>
  <div
    class="p-8"
    @mousedown="goToMenu"
    @keydown.enter="goToMenu"
    tabindex="0"
    ref="clockContainer"
  >
    <div class="text-8xl mb-10">{{ formattedTime }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const time = ref(new Date());
const formattedTime = ref('');
const clockContainer = ref<HTMLDivElement | null>(null);

// Navigation function
const goToMenu = (event: MouseEvent | KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
  router.push('/menu');
};

// Format time as HH:MM:SS
const updateFormattedTime = () => {
  const hours = time.value.getHours().toString().padStart(2, '0');
  const minutes = time.value.getMinutes().toString().padStart(2, '0');
  const seconds = time.value.getSeconds().toString().padStart(2, '0');
  formattedTime.value = `${hours}:${minutes}:${seconds}`;
};

// Update time every second
let intervalId: number;
onMounted(() => {
  updateFormattedTime();
  intervalId = window.setInterval(() => {
    time.value = new Date();
    updateFormattedTime();
  }, 500);

  // Set focus to make the enter key work
  clockContainer.value?.focus();
});

// Clear interval when component is unmounted
onUnmounted(() => {
  clearInterval(intervalId);
});
</script>
