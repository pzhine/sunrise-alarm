<template>
  <div class="text-8xl">{{ formattedTime }}</div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const time = ref(new Date());
const formattedTime = ref('');

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
});

// Clear interval when component is unmounted
onUnmounted(() => {
  clearInterval(intervalId);
});
</script>
