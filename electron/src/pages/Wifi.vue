<template>
  <div id="wifi" class="p-8 w-full">
    <h1 class="text-xl font-bold mb-4">Available WiFi Networks</h1>
    <InteractiveList :items="wifiNetworks" @select="selectNetwork" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import InteractiveList, { ListItem } from '../components/InteractiveList.vue';

const router = useRouter();
const wifiNetworks = ref<string[]>([]);

const fetchWifiNetworks = async (): Promise<void> => {
  try {
    const networks = await window.ipcRenderer.invoke(
      'list-available-wifi-networks'
    );
    wifiNetworks.value = networks;
  } catch (error) {
    console.error('Error fetching WiFi networks:', error);
  }
};

const selectNetwork = (item: ListItem): void => {
  const network = typeof item === 'string' ? item : item.label;
  console.log(`Selected network: ${network}`);
  router.push({
    name: 'WifiPassword',
    params: { networkName: network },
  });
};

let intervalId: NodeJS.Timeout | undefined;

onMounted(() => {
  // Initial fetch
  fetchWifiNetworks();

  // Set up interval to refresh every 15 seconds
  intervalId = setInterval(fetchWifiNetworks, 15000);
});

// Clean up interval when component is unmounted
onUnmounted(() => {
  clearInterval(intervalId);
});
</script>
