<template>
  <div
    class="flex w-full h-full items-center justify-center flex-col z-50"
    :style="clockStyles"
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
import { onMounted, onUnmounted, ref, computed, watch, reactive } from 'vue';
import { useAppStore } from '../stores/appState';
import { animateStyle, easeInOutBezier } from '../animations/animationUtils'; // Import helpers

// New reactive style properties
const clockStyles = reactive({
  opacity: 1,
  marginTop: '0',
  color: 'inherit', // This will be resolved to a specific color on mount
  mixBlendMode: 'normal' as 'normal' | 'soft-light',
});

const animationIntervals = ref<NodeJS.Timeout[]>([]);
const initialColor = ref('rgb(0,0,0)'); // Default or placeholder
const forwardPhaseStartTime = ref<number | null>(null); // To track forward animation progress
const lastOpacityValue = ref(1); // To store the last opacity value

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
      // Clear any ongoing forward animations
      animationIntervals.value.forEach(clearInterval);
      animationIntervals.value = [];

      let elapsedForwardTime = 0;
      const forwardAnimationFullDuration = 10000; // Duration of the main forward anim phase

      if (forwardPhaseStartTime.value) {
        elapsedForwardTime = Date.now() - forwardPhaseStartTime.value;
      }

      // Ensure progress is between 0 and 1. If no forward animation started, progress is 0.
      const progress = forwardPhaseStartTime.value
        ? Math.min(
            1,
            Math.max(0, elapsedForwardTime / forwardAnimationFullDuration)
          )
        : 0;

      const baseReverseDuration = 5000; // Original reverse duration
      // If progress is 0, reverse should be very quick. Let's set a minimal duration or handle it as immediate.
      // For simplicity, we'll let it be progress * baseReverseDuration, which could be 0.
      // Consider a minimum duration if 0 is not desired, e.g., Math.max(100, progress * baseReverseDuration)
      const adjustedReverseDuration = progress * baseReverseDuration;

      // Stage 3: Abruptly change to the current state if reversing mid-forward-animation,
      // or to a defined starting point for reverse if forward was complete or not started.
      // The current clockStyles should reflect the interrupted state, so we mostly animate from there.
      // However, for opacity and color, the reverse sequence has specific start points.
      clockStyles.mixBlendMode = 'normal';
      clockStyles.opacity = lastOpacityValue.value; // This should be the last opacity value from the forward animation
      // marginTop will be animated from its current value (which is correct if interrupted).

      setTimeout(() => {
        // Stage 4: Animate over adjustedReverseDuration
        animateStyle(
          1, // Target opacity
          () => clockStyles.opacity, // Get current opacity (should be 0.7 now)
          (val) => (clockStyles.opacity = val),
          adjustedReverseDuration,
          animationIntervals,
          'number'
        );
        animateStyle(
          0, // Target margin
          () => parseInt(clockStyles.marginTop.replace('px', '') || '0'), // Get current margin
          (val) => (clockStyles.marginTop = `${val}px`),
          adjustedReverseDuration,
          animationIntervals,
          'number'
        );
        animateStyle(
          initialColor.value, // Target the stored initial color
          () => {
            console.log('Current color:', clockStyles.color);
            return clockStyles.color;
          }, // Get current color (should be 'white' now)
          (val) => (clockStyles.color = val),
          adjustedReverseDuration,
          animationIntervals,
          'color'
        );

        setTimeout(() => {
          clockStyles.mixBlendMode = 'normal';
          clockStyles.opacity = 1;
          clockStyles.marginTop = '0';
          clockStyles.color = initialColor.value;
          forwardPhaseStartTime.value = null; // Reset tracker
        }, adjustedReverseDuration);
      }, 100); // Small delay before starting reverse animation
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

  // Get and store the initial computed color
  if (clockContainer.value) {
    const rawComputedColor = window.getComputedStyle(
      clockContainer.value
    ).color;
    initialColor.value = rawComputedColor; // Store the raw color string
    console.log('Initial color:', initialColor.value);
    clockStyles.color = initialColor.value; // Set the reactive style
  } else {
    // Fallback if clockContainer is not yet available
    initialColor.value = 'rgb(0,0,0)'; // Fallback to a known parsable format
    clockStyles.color = initialColor.value;
  }

  // Initialize styles
  clockStyles.opacity = 1;
  clockStyles.marginTop = '0';
  // clockStyles.color is already set above
  clockStyles.mixBlendMode = 'normal';

  // start transition sequence for transparency
  if (props.transparent) {
    // Initial color is already set to initialColor.value

    setTimeout(() => {
      forwardPhaseStartTime.value = Date.now(); // Record start time of this animation phase
      // Start of transition to stage 1 (lasts 10s)
      // Target: marginTop: 200px, color: white, opacity: 0.5
      animateStyle(
        0.5,
        () => clockStyles.opacity,
        (val) => {
          lastOpacityValue.value = val; // Store the last opacity value
          clockStyles.opacity = val;
        },
        4000,
        animationIntervals, // Pass ref
        'number'
      );
      animateStyle(
        200,
        () => parseInt(clockStyles.marginTop.replace('px', '')),
        (val) => (clockStyles.marginTop = `${val}px`),
        5000,
        animationIntervals, // Pass ref
        'number',
        undefined,
        easeInOutBezier
      );
      // Animate color from initial to 'white'
      animateStyle(
        'white',
        () => clockStyles.color,
        (val) => (clockStyles.color = val),
        3000,
        animationIntervals, // Pass ref
        'color'
      );
    }, 3000); // Delay before starting first animation stage

    setTimeout(() => {
      // Stage 2: Abrupt changes (after 15s total)
      // Target: mix-blend-mode: soft-light, opacity: 1
      // marginTop should be 200px and color 'white' from previous animation
      animationIntervals.value.forEach(clearInterval); // Clear previous opacity/margin animations if any are still running (shouldn't be if timed right)
      animationIntervals.value = [];

      clockStyles.mixBlendMode = 'soft-light';
      clockStyles.opacity = 1; // Abrupt change
      clockStyles.color = 'white'; // Ensure color is white for stage 2
      // clockStyles.marginTop should be 200px from previous animation
    }, 15000); // Stage 2 starts after 15s total (3s delay + 10s animation + 2s pause)
  }
});

// Clear interval when component is unmounted
onUnmounted(() => {
  clearInterval(intervalId);
  clearInterval(colonBlinkIntervalId);
  animationIntervals.value.forEach(clearInterval); // Clear any active animation intervals
});
</script>

<style scoped>
/* Styles for clock-transparent-* are removed as animations are now JS-based */
</style>
