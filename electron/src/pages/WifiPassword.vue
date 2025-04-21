<template>
  <div class="flex flex-col items-center p-8">
    <button class="self-start mb-4 px-4 py-2 rounded border" @click="$router.back()">
      Back
    </button>
    <h1 class="text-xl font-bold mb-4">Enter Password for {{ networkName }}</h1>
    <div class="flex flex-row items-stretch mb-4">
      <input type="text" class="flex p-2 border rounded" v-model="password" />
      <button class="ml-4 p-3 flex rounded border" @click="removeLastCharacter">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd"
            d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H15a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z"
            clip-rule="evenodd" />
        </svg>
      </button>
    </div>
    <div v-for="(row, rowIndex) in isShiftActive ? capKeys : keyboardKeys" :key="rowIndex">
      <button v-for="key in row" :key="key" :class="{
        'px-4 py-2 m-2 min-w-13 rounded border': true,
        'bg-[var(--color-li-highlight)]': key === 'SHIFT' && isShiftActive,
      }" @click="onKeyboard(key)">
        {{ key }}
      </button>
    </div>

    <button class="mt-4 px-4 py-2 rounded border" @click="connectToNetwork">
      Connect
    </button>
  </div>
</template>

<script>
export default {
  name: 'WifiPassword',
  data() {
    return {
      password: '',
      keyboardKeys: [
        [...'!@#$%&*_-.'.split('')],
        [...'1234567890'.split('')],
        [...'qwertyuiop'.split('')],
        [...'asdfghjkl'.split('')],
        ['SHIFT', ...'zxcvbnm'.split('')],
      ],
      capKeys: [
        [...'!@#$%&*_-.'.split('')],
        [...'1234567890'.split('')],
        [...'QWERTYUIOP'.split('')],
        [...'ASDFGHJKL'.split('')],
        ['SHIFT', ...'ZXCVBNM'.split('')],
      ],
      isShiftActive: false,
    };
  },
  computed: {
    networkName() {
      return this.$route.params.networkName;
    },
  },
  methods: {
    onKeyboard(key) {
      if (key === 'SHIFT') {
        this.toggleShift();
        return;
      }
      this.password += key;
    },
    removeLastCharacter() {
      this.password = this.password.slice(0, -1);
    },
    connectToNetwork() {
      this.$router.push({
        name: 'WifiConnect',
        params: { networkName: this.networkName, password: this.password },
      });
    },
    toggleShift() {
      this.isShiftActive = !this.isShiftActive;
    },
  },
};
</script>

<style scoped>
.grid {
  display: grid;
  gap: 0.5rem;
}
</style>