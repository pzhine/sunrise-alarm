<template>
  <div
    class="flex w-full h-full items-center justify-center"
    tabindex="0"
    ref="clockContainer"
  >
    <div style="font-size: 120px">{{ formattedTime }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useAppStore } from '../stores/appState';

const appStore = useAppStore();
const time = ref(new Date());
const formattedTime = ref('');
const clockContainer = ref<HTMLDivElement | null>(null);

// Format time based on timeFormat preference
const updateFormattedTime = () => {
  const hours = time.value.getHours();
  const minutes = time.value.getMinutes().toString().padStart(2, '0');
  // const seconds = time.value.getSeconds().toString().padStart(2, '0');

  if (appStore.timeFormat === '12h') {
    const isPM = hours >= 12;
    const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    formattedTime.value = `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
  } else {
    // 24h format
    formattedTime.value = `${hours.toString().padStart(2, '0')}:${minutes}`;
  }
};

// Update time every half second
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
