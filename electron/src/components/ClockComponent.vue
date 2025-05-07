<template>
  <div
    :class="[
      'flex w-full h-full items-center justify-center flex-col',
      {
        'clock-transparent-0': transparent,
        'clock-transparent-1': transparentStage1 || transparentStage2,
        'clock-transparent-2': transparentStage2,
        'clock-transparent-3': transparentStage3 || transparentStage4,
        'clock-transparent-4': transparentStage4,
      },
    ]"
    tabindex="0"
    ref="clockContainer"
  >
    <div
      :style="{
        'font-size': '120px',
        'font-weight': 'normal',
        'font-family': '\'FrozenCrystalExpanded\', sans-serif',
      }"
    >
      {{ hoursPart
      }}<span :style="{ visibility: showColon ? 'visible' : 'hidden' }">:</span
      >{{ minutesPart }}{{ amPmPart }}
    </div>
    <div
      v-if="showDate"
      :style="{
        'font-size': '40px',
        'margin-top': '-20px',
        'font-family': '\'Old-School-Adventures\', sans-serif',
      }"
    >
      {{ formattedDate }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useAppStore } from '../stores/appState';

const transparentStage1 = ref(false);
const transparentStage2 = ref(false);
const transparentStage3 = ref(false);
const transparentStage4 = ref(false);

const props = defineProps({
  showDate: {
    type: Boolean,
    default: false,
  },
  transparent: {
    type: Boolean,
    default: false,
  },
  transparentReverse: {
    type: Boolean,
    default: false,
  },
});

// Watch for transparentReverse changes
watch(
  () => props.transparentReverse,
  (newValue, oldValue) => {
    if (newValue === true && oldValue === false) {
      transparentStage3.value = true;
      setTimeout(() => {
        transparentStage4.value = true;
      }, 100);
    }
  },
  { immediate: true }
);

const appStore = useAppStore();
const time = ref(new Date());
const formattedTime = ref('');
const formattedDate = ref('');
const clockContainer = ref<HTMLDivElement | null>(null);
const showColon = ref(true);
const hoursPart = ref('');
const minutesPart = ref('');
const amPmPart = ref('');

// Format time based on timeFormat preference
const updateFormattedTime = () => {
  const hours = time.value.getHours();
  const minutes = time.value.getMinutes().toString().padStart(2, '0');
  // const seconds = time.value.getSeconds().toString().padStart(2, '0');

  if (appStore.timeFormat === '12h') {
    const isPM = hours >= 12;
    const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
    formattedTime.value = `${hours12}:${minutes} ${isPM ? 'PM' : 'AM'}`;
    hoursPart.value = hours12.toString();
    minutesPart.value = minutes;
    amPmPart.value = ` ${isPM ? 'PM' : 'AM'}`;
  } else {
    // 24h format
    formattedTime.value = `${hours.toString().padStart(2, '0')}:${minutes}`;
    hoursPart.value = hours.toString().padStart(2, '0');
    minutesPart.value = minutes;
    amPmPart.value = '';
  }

  // Update date if showing date
  if (props.showDate) {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    formattedDate.value = time.value.toLocaleDateString(undefined, options);
  }
};

// Update time every half second
let intervalId: number;
let colonBlinkIntervalId: number;
onMounted(() => {
  updateFormattedTime();
  intervalId = window.setInterval(() => {
    time.value = new Date();
    updateFormattedTime();
  }, 500);

  // Blink colon every second
  colonBlinkIntervalId = window.setInterval(() => {
    showColon.value = !showColon.value;
  }, 1000);

  // Set focus to make the enter key work
  clockContainer.value?.focus();

  // start transition sequence for transparency
  if (props.transparent) {
    setTimeout(() => {
      transparentStage1.value = true;
    }, 3000);
    setTimeout(() => {
      transparentStage2.value = true;
    }, 15000);
  }
});

// Clear interval when component is unmounted
onUnmounted(() => {
  clearInterval(intervalId);
  clearInterval(colonBlinkIntervalId);
});
</script>

<style scoped>
/* Initial state - applied before the transition */
.clock-transparent-0 {
  transition: all 10s ease-in-out;
  color: inherit;
  z-index: 50;
  opacity: 1;
}
.clock-transparent-1 {
  margin-top: 200px;
  color: white;
  opacity: 0.5;
}
.clock-transparent-2 {
  mix-blend-mode: soft-light;
  transition: none;
  opacity: 1;
}
.clock-transparent-3 {
  mix-blend-mode: none;
  transition: none;
  opacity: 0.7;
  color: white;
}
.clock-transparent-4 {
  transition: all 5s ease-in-out;
  color: unset;
  opacity: 1;
  margin-top: 0;
}
</style>
