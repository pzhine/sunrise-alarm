<template>
  <div class="timeout-redirect" />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';

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
   * "all" - timeout is reset on wheel, mouse and keyboard events
   */
  resetOnActivity?: 'none' | 'wheel' | 'all';

  /**
   * Array of route names or paths that should be excluded from the timeout redirect
   * When the current route matches any in this array, the timeout will be paused
   */
  excludeRoutes?: Array<string>;
}>();

const router = useRouter();
const route = useRoute();
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
  if (props.resetOnActivity === 'wheel' || props.resetOnActivity === 'all') {
    window.addEventListener('wheel', handleWheel, { passive: true });
  }
  // Reset timeout on other activities if specified
  if (props.resetOnActivity === 'all') {
    window.addEventListener('mouseup', resetTimeout);
    window.addEventListener('keydown', resetTimeout);
  }
});

// Watch for route changes to pause/resume timeout
watch(
  () => route.name,
  (newRoute) => {
    if (props.excludeRoutes?.includes(newRoute as string)) {
      if (timeoutId.value !== null) {
        window.clearTimeout(timeoutId.value);
        timeoutId.value = null;
      }
    } else {
      resetTimeout();
    }
  }
);

// Clean up timeout and event listeners
onBeforeUnmount(() => {
  if (timeoutId.value !== null) {
    window.clearTimeout(timeoutId.value);
    timeoutId.value = null;
  }

  // Remove wheel event listener if it was added
  if (props.resetOnActivity === 'wheel' || props.resetOnActivity === 'all') {
    window.removeEventListener('wheel', handleWheel);
  }
  // Remove other event listeners if they were added
  if (props.resetOnActivity === 'all') {
    window.removeEventListener('mouseup', resetTimeout);
    window.removeEventListener('keydown', resetTimeout);
  }
});
</script>
