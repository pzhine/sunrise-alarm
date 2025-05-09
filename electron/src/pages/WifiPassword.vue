<template>
  <div class="w-full">
    <div
      class="fixed top-0 left-0 border-b z-10 flex flex-row w-full h-[var(--header-height)] bg-[var(--color-li-background)]"
    >
      <button
        @click="router.back()"
        :class="{
          'border-r px-4': true,
        }"
      >
        ← Back
      </button>
      <div
        class="grow px-4 text-xl overflow-hidden overflow-ellipsis whitespace-nowrap flex items-center"
      >
        Password for {{ networkName }}
      </div>
      <button
        @click="connectToNetwork"
        :class="{
          'border-l px-4': true,
        }"
      >
        Connect
      </button>
    </div>

    <div class="flex flex-row items-stretch mt-[var(--header-height)]">
      <input
        type="text"
        class="flex p-2 border rounded mb-6"
        v-model="password"
        ref="passwordInput"
      />
      <button
        class="ml-4 p-3 flex rounded border mb-6"
        @click="removeLastCharacter"
      >
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
          'px-2 py-0.5 m-1 min-w-10 rounded border': true,
          'bg-[var(--color-li-highlight)]': key === 'SHIFT' && isShiftActive,
          'border-blue-400 text-blue-400': !key.match(/[a-zA-Z]/),
        }"
        @click="onKeyboard(key)"
      >
        {{ key }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const password = ref('');
const isShiftActive = ref(false);
const passwordInput = ref<HTMLInputElement | null>(null);
const originalFontSize = ref('');

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

const networkName = computed(() => route.params?.networkName as string);

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

// onMounted(() => {
//   // Focus the password input when component is mounted
//   passwordInput.value?.focus();

//   // Store the original font size and set it to 16px
//   originalFontSize.value = document.documentElement.style.fontSize;
//   document.documentElement.style.fontSize = '18px';
// });

// onUnmounted(() => {
//   // Restore the original font size when component is unmounted
//   document.documentElement.style.fontSize = originalFontSize.value;
// });
</script>
