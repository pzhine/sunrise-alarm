<template>
  <div class="flex flex-col items-center justify-center min-h-screen p-8">
    <div class="flex w-full justify-start mb-6">
      <button class="px-4 py-2 rounded border" @click="router.push('/menu')">
        Back
      </button>
    </div>

    <h1 class="text-2xl font-bold mb-6">Set Alarm</h1>

    <div class="flex flex-col items-center w-full max-w-md">
      <div class="flex items-center justify-center text-4xl mb-8">
        <span>{{ formattedHours }}</span>
        <span class="mx-2">:</span>
        <span>{{ formattedMinutes }}</span>
      </div>

      <div class="grid grid-cols-2 gap-8 w-full mb-8">
        <div class="flex flex-col items-center">
          <button
            class="w-16 h-16 rounded-full border text-2xl mb-4"
            @click="changeHours(1)"
          >
            +
          </button>
          <span class="text-lg">Hours</span>
          <button
            class="w-16 h-16 rounded-full border text-2xl mt-4"
            @click="changeHours(-1)"
          >
            -
          </button>
        </div>

        <div class="flex flex-col items-center">
          <button
            class="w-16 h-16 rounded-full border text-2xl mb-4"
            @click="changeMinutes(5)"
          >
            +
          </button>
          <span class="text-lg">Minutes</span>
          <button
            class="w-16 h-16 rounded-full border text-2xl mt-4"
            @click="changeMinutes(-5)"
          >
            -
          </button>
        </div>
      </div>

      <button class="px-6 py-3 rounded border text-lg" @click="saveAlarm">
        Save Alarm
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appState';

const router = useRouter();
const appStore = useAppStore();

// Local state for alarm time
const hours = ref(appStore.alarmTime[0]);
const minutes = ref(appStore.alarmTime[1]);

// Formatted display values
const formattedHours = computed(() => {
  return hours.value.toString().padStart(2, '0');
});

const formattedMinutes = computed(() => {
  return minutes.value.toString().padStart(2, '0');
});

// Change hours with wrapping (0-23)
const changeHours = (delta: number) => {
  hours.value = (hours.value + delta + 24) % 24;
};

// Change minutes with wrapping (0-55) in 5-minute increments
const changeMinutes = (delta: number) => {
  minutes.value = (Math.floor((minutes.value + delta) / 5) * 5 + 60) % 60;
};

// Save alarm time to global state
const saveAlarm = () => {
  appStore.setAlarmTime(hours.value, minutes.value);
  router.push('/menu');
};

// Initialize from global state
onMounted(() => {
  hours.value = appStore.alarmTime[0];
  minutes.value = appStore.alarmTime[1];
});
</script>
