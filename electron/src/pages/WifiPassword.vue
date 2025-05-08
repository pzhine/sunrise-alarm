<template>
  <div class="p-8" style="{{ fontSize: '12px' }}">
    <button
      class="self-start mb-4 px-4 py-2 rounded border"
      @click="router.back()"
    >
      Back
    </button>
    <h1 class="text-xl font-bold mb-4">Enter Password for {{ networkName }}</h1>
    <div class="flex flex-row items-stretch mb-4">
      <input
        type="text"
        class="flex p-2 border rounded"
        v-model="password"
        ref="passwordInput"
      />
      <button class="ml-4 p-3 flex rounded border" @click="removeLastCharacter">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H15a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </div>
    <div
      v-for="(row, rowIndex) in isShiftActive ? capKeys : keyboardKeys"
      :key="rowIndex"
    >
      <button
        v-for="key in row"
        :key="key"
        :class="{
          'px-4 py-2 m-2 min-w-13 rounded border': true,
          'bg-[var(--color-li-highlight)]': key === 'SHIFT' && isShiftActive,
        }"
        @click="onKeyboard(key)"
      >
        {{ key }}
      </button>
    </div>

    <button class="mt-4 px-4 py-2 rounded border" @click="connectToNetwork">
      Connect
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const password = ref('');
const isShiftActive = ref(false);
const passwordInput = ref<HTMLInputElement | null>(null);

const keyboardKeys = [
  [...'!@#$%&*_-.'.split('')],
  [...'1234567890'.split('')],
  [...'qwertyuiop'.split('')],
  [...'asdfghjkl'.split('')],
  ['SHIFT', ...'zxcvbnm'.split('')],
];

const capKeys = [
  [...'!@#$%&*_-.'.split('')],
  [...'1234567890'.split('')],
  [...'QWERTYUIOP'.split('')],
  [...'ASDFGHJKL'.split('')],
  ['SHIFT', ...'ZXCVBNM'.split('')],
];

const networkName = computed(() => route.params.networkName as string);

const onKeyboard = (key: string): void => {
  if (key === 'SHIFT') {
    toggleShift();
    return;
  }
  password.value += key;
};

const removeLastCharacter = (): void => {
  password.value = password.value.slice(0, -1);
};

const connectToNetwork = (): void => {
  router.push({
    name: 'WifiConnect',
    params: { networkName: networkName.value, password: password.value },
  });
};

const toggleShift = (): void => {
  isShiftActive.value = !isShiftActive.value;
};

onMounted(() => {
  // Focus the password input when component is mounted
  passwordInput.value?.focus();
});
</script>

<style>
html {
  font-size: 16px;
}
</style>