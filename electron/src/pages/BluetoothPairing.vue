<template>
  <div class="w-full h-screen flex justify-center items-center">
    <div class="text-center">
      
      <!-- Ready to Pair -->
      <div v-if="pairingState.active" class="text-2xl font-light text-amber-400">
        ready to pair...
      </div>

      <!-- Success State -->
      <div v-else-if="success" class="text-2xl font-light text-green-400">
        pairing successful
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-2xl font-light text-red-400">
        pairing failed
      </div>

      <!-- Loading State -->
      <div v-else class="text-2xl font-light text-amber-400">
        starting...
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';

// Router
const router = useRouter();

// Reactive state
const pairingState = ref({
  active: false,
  timeRemaining: 0,
  deviceName: 'DawnDeck'
});

const error = ref<string | null>(null);
const success = ref<any>(null);

// Auto-start pairing when component loads
const startPairing = async () => {
  error.value = null;
  success.value = null;
  
  try {
    const result = await (window as any).electronAPI?.bluetoothPairing?.start();
    pairingState.value = result;
    console.log('Pairing started:', result);
  } catch (err: any) {
    error.value = err.message || 'Failed to start pairing mode';
    console.error('Pairing error:', err);
  }
};

// Lifecycle
onMounted(() => {
  // Listen for pairing events
  if ((window as any).electronAPI?.bluetoothPairing) {
    const api = (window as any).electronAPI.bluetoothPairing;
    
    api.onPairingStarted?.((state: any) => {
      pairingState.value = state;
      error.value = null;
    });
    
    api.onPairingUpdate?.((state: any) => {
      pairingState.value = state;
    });
    
    api.onPairingStopped?.((state: any) => {
      pairingState.value = state;
    });
    
    api.onPairingSuccess?.((state: any) => {
      success.value = state;
      pairingState.value = { ...state, active: false };
    });
    
    api.onPairingError?.((state: any) => {
      error.value = state.error;
      pairingState.value = { ...state, active: false };
    });
  }

  // Auto-start pairing immediately
  startPairing();
});

onBeforeUnmount(() => {
  // Clean up any active pairing when leaving the page
  if (pairingState.value.active) {
    (window as any).electronAPI?.bluetoothPairing?.stop?.().catch(console.error);
  }
});
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Responsive adjustments for round screen */
@media (max-width: 800px) {
  .text-2xl {
    font-size: 1.25rem;
  }
}
</style>