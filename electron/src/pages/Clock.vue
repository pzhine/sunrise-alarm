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
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();

// Explicitly create a local Date object from system time
const time = ref(new Date(Date.now()));
const formattedTime = ref('');
const clockContainer = ref<HTMLDivElement | null>(null);

// Navigation function
const goToMenu = (event: MouseEvent | KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
  router.push('/menu');
};

// Format time based on timeFormat preference
const updateFormattedTime = () => {
  // Get local time components directly
  const hours = time.value.getHours();
  const minutes = time.value.getMinutes().toString().padStart(2, '0');
  const seconds = time.value.getSeconds().toString().padStart(2, '0');

  if (appStore.timeFormat === '12h') {
    const isPM = hours >= 12;
    const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    formattedTime.value = `${hours12}:${minutes}:${seconds} ${isPM ? 'PM' : 'AM'}`;
  } else {
    // 24h format
    formattedTime.value = `${hours.toString().padStart(2, '0')}:${minutes}:${seconds}`;
  }
};

// Update time every second
let intervalId: number;
onMounted(() => {
  updateFormattedTime();
  intervalId = window.setInterval(() => {
    // Create a fresh Date object from the current system timestamp
    time.value = new Date(Date.now());
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
