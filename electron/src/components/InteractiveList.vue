<template>
  <ul
    class="w-full divide-y overflow-y-auto"
    @keydown.up.prevent="navigateList('up')"
    @keydown.down.prevent="navigateList('down')"
    @keydown.enter.prevent="selectItem(items[highlightedIndex])"
    @wheel="handleWheel"
    tabindex="0"
    ref="listContainer"
  >
    <li
      v-for="(item, index) in items"
      :key="index"
      :class="{
        'hover:bg-[var(--color-li-hover)]': !startedKeyboardNavigation,
        'p-4': true,
        'bg-[var(--color-li-highlight)]': index === highlightedIndex,
      }"
      @click="selectItem(item)"
      @keydown.enter.prevent="selectItem(item)"
    >
      {{ item }}
    </li>
  </ul>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, defineProps, defineEmits } from 'vue';

const props = defineProps<{
  items: string[];
  initialHighlightIndex?: number;
}>();

const emit = defineEmits<{
  (e: 'select', item: string): void;
}>();

const highlightedIndex = ref(props.initialHighlightIndex || 0);
const startedKeyboardNavigation = ref(false);
const listContainer = ref<HTMLUListElement | null>(null);

const navigateList = (direction: 'up' | 'down'): void => {
  startedKeyboardNavigation.value = true;
  if (direction === 'up') {
    highlightedIndex.value =
      (highlightedIndex.value - 1 + props.items.length) % props.items.length;
  } else if (direction === 'down') {
    highlightedIndex.value = (highlightedIndex.value + 1) % props.items.length;
  }

  // Scroll will happen after the next DOM update
  nextTick(scrollToHighlighted);
};

const scrollToHighlighted = (): void => {
  if (!listContainer.value) return;

  const container = listContainer.value;
  const listItems = container.querySelectorAll('li');
  const highlightedElement = listItems[highlightedIndex.value];

  if (!highlightedElement) return;

  // Check if the element is not fully visible
  const containerRect = container.getBoundingClientRect();
  const elementRect = highlightedElement.getBoundingClientRect();

  // If element is above the visible area
  if (elementRect.top < containerRect.top) {
    highlightedElement.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // If element is below the visible area
  else if (elementRect.bottom > containerRect.bottom) {
    highlightedElement.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
};

const selectItem = (item: string): void => {
  emit('select', item);
};

// Watch for changes to the highlighted index and ensure it's scrolled into view
watch(highlightedIndex, () => {
  nextTick(scrollToHighlighted);
});

onMounted(() => {
  nextTick(() => {
    listContainer.value?.focus();
  });
});

const handleWheel = (event: WheelEvent): void => {
  // Check if the wheel event was triggered by a touch
  // Chrome/Safari touch events don't have wheelDelta
  const isTouchGenerated = (event as any).wheelDeltaY === undefined;

  // Only prevent default for mouse-generated wheel events, not touch-generated ones
  if (!isTouchGenerated) {
    event.preventDefault();
  }

  // Detect scroll direction (positive deltaY means scrolling down)
  if (event.deltaY > 0) {
    navigateList('down');
  } else if (event.deltaY < 0) {
    navigateList('up');
  }
};
</script>

<style scoped>
/* Add styling for the scrollbar */
ul::-webkit-scrollbar {
  width: 8px;
}

ul::-webkit-scrollbar-track {
  background: transparent;
}

ul::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

ul::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
