<template>
  <div class="p-8">
    <h1 class="text-xl font-bold mb-4">Connecting to {{ networkName }}</h1>
    <template v-if="isConnecting">
      <p class="mt-4">Please wait...</p>
    </template>
    <template v-else-if="isSuccess">
      <p>Connected successfully!</p>
    </template>
    <template v-else>
      <p>Could not connect to network. Check the password and try again.</p>
      <button class="mt-4 px-4 py-2 rounded border" @click="router.back()">
        Back
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const isConnecting = ref(true);
const isSuccess = ref(false);
const lastMessage = ref('');
const redirectCountdown = ref(3);
let countdownInterval: number | null = null;

const networkName = computed(() => route.params.networkName as string);
const password = computed(() => route.params.password as string);

// Start countdown and redirect after completion
const startRedirectCountdown = () => {
  redirectCountdown.value = 3;
  countdownInterval = window.setInterval(() => {
    redirectCountdown.value--;

    if (redirectCountdown.value <= 0) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      // Redirect to root route
      router.push('/');
    }
  }, 1000);
};

// Call IPC function to attempt connection
const connectToNetwork = () => {
  isConnecting.value = true;
  return window.ipcRenderer
    .invoke('connect-to-network', {
      networkName: networkName.value,
      password: password.value,
    })
    .then((response) => {
      isConnecting.value = false;
      isSuccess.value = true;
      console.log('Connection response:', response);
      // Start the countdown after successful connection
      startRedirectCountdown();
    })
    .catch((error) => {
      isConnecting.value = false;
      isSuccess.value = false;
      lastMessage.value = error;
      console.error(error);
    });
};

onMounted(() => {
  connectToNetwork();
});

// Clean up the interval when component is unmounted
onUnmounted(() => {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
});
</script>
