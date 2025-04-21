<template>
    <div id="wifi" class="flex flex-col items-center p-8 w-full">
        <h1 class="text-xl font-bold mb-4">Available WiFi Networks</h1>
        <ul class="w-full divide-y" @keydown.up.prevent="navigateList('up')"
            @keydown.down.prevent="navigateList('down')"
            @keydown.enter.prevent="selectNetwork(wifiNetworks[highlightedIndex])" tabindex="0">
            <li v-for="(network, index) in wifiNetworks" :key="index" :class="{
                'hover:bg-[var(--color-li-hover)]': !startedKeyboardNavigation,
                'p-4': true,
                'bg-[var(--color-li-highlight)]': index === highlightedIndex,
            }" @click="selectNetwork(network)" @keydown.enter.prevent="selectNetwork(network)">
                {{ network }}
            </li>
        </ul>
    </div>
</template>

<script>
export default {
    name: 'Wifi',
    data() {
        return {
            wifiNetworks: [],
            highlightedIndex: 0,
            startedKeyboardNavigation: false,
        };
    },
    methods: {
        async fetchWifiNetworks() {
            try {
                const networks = await window.ipcRenderer.invoke('list-available-wifi-networks');
                this.wifiNetworks = networks;
            } catch (error) {
                console.error('Error fetching WiFi networks:', error);
            }
        },
        navigateList(direction) {
            this.startedKeyboardNavigation = true;
            if (direction === 'up') {
                this.highlightedIndex = (this.highlightedIndex - 1 + this.wifiNetworks.length) % this.wifiNetworks.length;
            } else if (direction === 'down') {
                this.highlightedIndex = (this.highlightedIndex + 1) % this.wifiNetworks.length;
            }
        },
        selectNetwork(network) {
            this.$router.push({ name: 'WifiPassword', params: { networkName: network } });
        },
    },
    mounted() {
        this.fetchWifiNetworks();
        this.$nextTick(() => {
            this.$el.querySelector('ul').focus();
        });
    },
};
</script>
