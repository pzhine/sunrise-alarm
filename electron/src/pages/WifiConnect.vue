<template>
  <div class="flex flex-col items-center p-8">
    <h1 class="text-xl font-bold mb-4">Connecting to {{ networkName }}</h1>
    <template v-if="isConnecting">
      <p class="mt-4">Please wait...</p>
    </template>
    <template v-else-if="isSuccess">
      <p>Connected successfully!</p>
    </template>
    <template v-else>
      <p>Could not connect to network. Check the password and try again.</p>
      <button class="mt-4 px-4 py-2 rounded border" @click="$router.back()">
        Back
      </button>
    </template>
  </div>
</template>

<script>
export default {
  name: 'WifiConnect',
  data() {
    return {
      isConnecting: true,
      isSuccess: false,
      lastMessage: '',
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
    window.ipcRenderer
      .invoke('connect-to-network', {
        networkName: this.networkName,
        password: this.password,
      })
      .then((response) => {
        this.isConnecting = false;
        this.isSuccess = true;
        console.log('Connection response:', response);
      })
      .catch((error) => {
        this.isConnecting = false;
        this.isSuccess = false;
        this.lastMessage = error;
        console.error(error);
      });
  },
};
</script>

<style scoped>
/* Add any necessary styles here */
</style>
