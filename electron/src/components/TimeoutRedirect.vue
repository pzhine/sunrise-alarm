<template>
  <div class="timeout-redirect">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  /**
   * Optional route to redirect to. If not provided, will redirect to the previous route.
   * Format can be a string path or a route object
   */
  redirectRoute?: string | { name: string; params?: Record<string, string> };

  /**
   * Time in milliseconds before redirecting
   */
  ms: number;

  /**
   * Determines if user activity should reset the timeout
   * "none" - timeout is not reset on activity
   * "wheel" - timeout is reset on wheel events
   */
  resetOnActivity?: 'none' | 'wheel';
}>();

const router = useRouter();
const timeoutId = ref<number | null>(null);

// Handle the redirection
const redirect = () => {
  if (props.redirectRoute) {
    // Use the provided route
    router.push(props.redirectRoute);
  } else {
    // Default to going back to the previous route
    router.back();
  }
};

// Reset the timeout when user activity is detected
const resetTimeout = () => {
  if (timeoutId.value !== null) {
    window.clearTimeout(timeoutId.value);
  }

  timeoutId.value = window.setTimeout(() => {
    redirect();
  }, props.ms);
};

// Handle wheel events to reset timeout if resetOnActivity is "wheel"
const handleWheel = (event: WheelEvent) => {
  if (props.resetOnActivity === 'wheel') {
    resetTimeout();
  }
};

// Set up the timeout and event listeners
onMounted(() => {
  // Initial timeout
  timeoutId.value = window.setTimeout(() => {
    redirect();
  }, props.ms);

  // Add wheel event listener if needed
  if (props.resetOnActivity === 'wheel') {
    window.addEventListener('wheel', handleWheel, { passive: true });
  }
});

// Clean up timeout and event listeners
onBeforeUnmount(() => {
  if (timeoutId.value !== null) {
    window.clearTimeout(timeoutId.value);
    timeoutId.value = null;
  }

  // Remove wheel event listener if it was added
  if (props.resetOnActivity === 'wheel') {
    window.removeEventListener('wheel', handleWheel);
  }
});
</script>
