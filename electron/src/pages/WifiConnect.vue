<template>
  <div class="flex flex-col items-center p-8">
    <h1 class="text-xl font-bold mb-4">Connecting to {{ networkName }}</h1>
    <div v-if="isConnecting">
      <p class="mt-4">Please wait...</p>
    </div>
    <div v-else-if="isSuccess">
      <p>Connected successfully!</p>
    </div>
    <div v-else>
      <p>Error: {{ lastMessage }}</p>
      <button class="px-4 py-2 rounded border" @click="$router.back()">
        Back
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WifiConnect',
  data() {
    return {
      isConnecting: true,
      isSuccess: false,
      lastMessage: ''
    };
  },
  computed: {
    networkName() {
      return this.$route.params.networkName;
    },
    password() {
      return this.$route.params.password;
    },
  },
  mounted() {
    // Call IPC function to attempt connection
    window.ipcRenderer.invoke('connect-to-network', {
      networkName: this.networkName,
      password: this.password,
    }).then(response => {
      this.isConnecting = false;
      this.isSuccess = true;
      console.log('Connection response:', response);
    }).catch(error => {
      this.isConnecting = false;
      this.isSuccess = false;
      this.lastMessage = error;
      console.error(JSON.stringify(error));

    });
  },
};
</script>

<style scoped>
/* Add any necessary styles here */
</style>