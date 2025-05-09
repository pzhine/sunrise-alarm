<template>
  <div
    v-if="showTitle || showBackButton"
    class="fixed top-0 left-0 border-b z-10 flex flex-row w-full h-[var(--header-height)] bg-[var(--color-li-background)] shrink-0"
  >
    <button
      v-if="showBackButton"
      @click="handleBackButton"
      :class="{
        'border-r px-4': true,
        'bg-[var(--color-li-highlight)]': isBackButtonHighlighted,
      }"
    >
      {{ backButtonLabel ?? '← Back' }}
    </button>
    <div class="px-4 text-xl font-bold flex-1 min-w-0 flex items-center">
      <span class="truncate w-full">{{ title }}</span>
    </div>
  </div>

  <ul
    :class="{
      'w-full divide-y overflow-y-auto h-full': true,
    }"
    :style="
      showBackButton || showTitle
        ? {
            maxHeight: 'calc(100vh - var(--header-height))',
            marginTop: 'var(--header-height)',
          }
        : {}
    "
    @keydown.up.prevent="navigateList('up')"
    @keydown.down.prevent="navigateList('down')"
    @keydown.enter.prevent="handleEnterKey"
    tabindex="0"
    ref="listContainer"
  >
    <li
      v-for="(item, index) in items"
      :key="index"
      :class="{
        'py-4 px-6 flex justify-between items-center': true,
        'bg-[var(--color-li-highlight)]':
          index === highlightedIndex && !isBackButtonHighlighted,
        ...(isObject(item) && item.customClass
          ? { [item.customClass]: true }
          : {}),
      }"
      @click="handleItemClick(item, index)"
      @keydown.enter.prevent="selectItem(item)"
    >
      <span class="truncate overflow-hidden max-w-[85%] shrink-0 min-w-[40%]">{{
        isObject(item) ? item.label : item
      }}</span>
      <div class="flex items-center overflow-hidden">
        <span
          v-if="isObject(item) && 'value' in item"
          class="ml-4 font-medium flex-shrink-1 whitespace-nowrap truncate"
          :class="{
            'bg-[var(--color-li-highlight)] px-2 py-1':
              isEditing && editingIndex === index,
          }"
        >
          {{ item.value }}
        </span>
      </div>
    </li>
  </ul>
</template>

<script setup lang="ts">
import {
  ref,
  onMounted,
  onUnmounted,
  nextTick,
  watch,
  defineProps,
  defineEmits,
  computed,
} from 'vue';
import { useAppStore } from '../stores/appState';
import { useRoute } from 'vue-router';
import { max } from 'lodash-es';

// Define item type
export type ListItem =
  | string
  | {
      label: string;
      value?: any;
      onSelect?: () => void;
      onEdit?: (increment: number) => void;
      canEdit?: boolean;
      customClass?: string;
    };

const props = defineProps<{
  items: ListItem[];
  initialHighlightIndex?: number;
  title?: string;
  showTitle?: boolean;
  showBackButton?: boolean;
  backButtonLabel?: string;
  routeKey?: string; // Optional custom route key to use instead of the current route path
}>();

const emit = defineEmits<{
  (e: 'select', item: ListItem): void;
  (e: 'back'): void;
  (e: 'edit', item: ListItem, increment: number): void;
}>();

const appStore = useAppStore();
const route = useRoute();

// Get the route identifier to use for position storage
const routeIdentifier = computed(() => {
  return props.routeKey || route.path;
});

// Get saved position from store or use initialHighlightIndex
const initialPosition = computed(() => {
  // Check if we have a saved position for this route
  const savedPosition = appStore.getListPosition(routeIdentifier.value);

  // Use saved position if available, otherwise fall back to initialHighlightIndex or 0
  return savedPosition !== undefined
    ? savedPosition
    : props.initialHighlightIndex || 0;
});

const highlightedIndex = ref(initialPosition.value);
const startedKeyboardNavigation = ref(false);
const listContainer = ref<HTMLUListElement | null>(null);
const isBackButtonHighlighted = ref(false);
const isEditing = ref(false);
const editingIndex = ref(-1);

// Total number of navigable items (list items + back button if shown)
const totalNavigableItems = computed(() => {
  return props.items.length + (props.showBackButton ? 1 : 0);
});

// Helper to check if item is an object
const isObject = (item: ListItem): item is { label: string; value?: any } => {
  return typeof item === 'object' && item !== null;
};

const navigateList = (direction: 'up' | 'down'): void => {
  // If in edit mode, adjust value instead of navigating
  if (isEditing.value && editingIndex.value >= 0) {
    const item = props.items[editingIndex.value];
    if (isObject(item) && item.onEdit) {
      item.onEdit(direction === 'up' ? 1 : -1);
    }
    return;
  }

  startedKeyboardNavigation.value = true;

  // Handle navigation with back button
  if (props.showBackButton) {
    if (direction === 'up') {
      if (isBackButtonHighlighted.value) {
        // From back button, go to last list item
        // isBackButtonHighlighted.value = false;
        // highlightedIndex.value = props.items.length - 1;
      } else if (highlightedIndex.value === 0) {
        // From first list item, go to back button
        isBackButtonHighlighted.value = true;
        highlightedIndex.value = -1; // Use -1 to indicate no list item is selected
      } else {
        // Navigate up through list items
        highlightedIndex.value =
          (highlightedIndex.value - 1) % props.items.length;
      }
    } else if (direction === 'down') {
      if (isBackButtonHighlighted.value) {
        // From back button, go to first list item
        isBackButtonHighlighted.value = false;
        highlightedIndex.value = 0;
      } else if (highlightedIndex.value === props.items.length - 1) {
        // From last list item, go to back button
        // isBackButtonHighlighted.value = true;
        // highlightedIndex.value = -1; // Use -1 to indicate no list item is selected
      } else {
        // Navigate down through list items
        highlightedIndex.value =
          (highlightedIndex.value + 1) % props.items.length;
      }
    }
  } else {
    // Original navigation logic (without back button)
    if (direction === 'up') {
      // highlightedIndex.value =
      //   (highlightedIndex.value - 1 + props.items.length) % props.items.length;
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
    } else if (direction === 'down') {
      // highlightedIndex.value =
      //   (highlightedIndex.value + 1) % props.items.length;
      highlightedIndex.value = Math.min(
        highlightedIndex.value + 1,
        props.items.length - 1
      );
    }
  }

  // Save position to store
  if (!isBackButtonHighlighted.value) {
    appStore.saveListPosition(routeIdentifier.value, highlightedIndex.value);
  }

  // Scroll will happen after the next DOM update
  nextTick(scrollToHighlighted);
};

const handleEnterKey = () => {
  if (isBackButtonHighlighted.value) {
    handleBackButton();
    return;
  }

  const currentItem = props.items[highlightedIndex.value];
  if (isObject(currentItem) && currentItem.canEdit) {
    if (isEditing.value && editingIndex.value === highlightedIndex.value) {
      // Exit edit mode
      isEditing.value = false;
      editingIndex.value = -1;
    } else {
      // Enter edit mode
      isEditing.value = true;
      editingIndex.value = highlightedIndex.value;
    }
    return;
  }

  selectItem(currentItem);
};

const handleBackButton = () => {
  // If in editing mode, exit it when back button is pressed
  if (isEditing.value) {
    isEditing.value = false;
    editingIndex.value = -1;
    return;
  }

  emit('back');
};

// Rest of the component code
const scrollToHighlighted = (smooth: boolean = true): void => {
  if (!listContainer.value) return;

  const container = listContainer.value;
  const listItems = container.querySelectorAll('li');

  // If back button is highlighted, no need to scroll list items
  if (isBackButtonHighlighted.value) return;

  const highlightedElement = listItems[highlightedIndex.value];

  if (!highlightedElement) return;

  // Check if the element is not fully visible
  const containerRect = container.getBoundingClientRect();
  const elementRect = highlightedElement.getBoundingClientRect();

  const behavior = smooth ? 'smooth' : 'instant';

  // If element is above the visible area
  if (elementRect.top < containerRect.top) {
    highlightedElement.scrollIntoView({ block: 'start', behavior });
  }
  // If element is below the visible area
  else if (elementRect.bottom > containerRect.bottom) {
    highlightedElement.scrollIntoView({ block: 'end', behavior });
  }
};

const selectItem = (item: ListItem): void => {
  // If item is editable and we're not in edit mode, toggle edit mode
  if (isObject(item) && item.canEdit && !isEditing.value) {
    isEditing.value = true;
    editingIndex.value = highlightedIndex.value;
    return;
  }

  // If we're in edit mode for this item, exit edit mode
  if (isEditing.value && props.items[editingIndex.value] === item) {
    isEditing.value = false;
    editingIndex.value = -1;
    return;
  }

  // If item is an object with onSelect handler, call it
  if (isObject(item) && typeof item.onSelect === 'function') {
    item.onSelect();
  }
  emit('select', item);
};

// Watch for changes to the highlighted index and ensure it's scrolled into view
watch(highlightedIndex, (newValue) => {
  // Save the position to the store when it changes
  if (!isBackButtonHighlighted.value) {
    appStore.saveListPosition(routeIdentifier.value, newValue);
  }
  nextTick(scrollToHighlighted);
});

// Watch for changes to the items prop to ensure we scroll after items are populated
watch(
  () => props.items,
  () => {
    if (props.items.length > 0) {
      // Wait for the DOM to update with the new items
      nextTick(() => {
        scrollToHighlighted(false);
      });
    }
  },
  {
    immediate: true,
  }
);

// Handle item click
const handleItemClick = (item: ListItem, index: number) => {
  // Reset back button highlight when clicking list items
  isBackButtonHighlighted.value = false;
  highlightedIndex.value = index;
  selectItem(item);
};

// Handle mouse right click
const handleMouseDown = (event: MouseEvent) => {
  if (event.button === 2) {
    event.preventDefault();
    event.stopPropagation();

    nextTick(() => {
      if (isBackButtonHighlighted.value) {
        handleBackButton();
      } else {
        selectItem(props.items[highlightedIndex.value]);
      }
    });
  }
};

onMounted(() => {
  nextTick(() => {
    listContainer.value?.focus();

    // Add wheel event listener to window
    window.addEventListener('wheel', handleWheel, { passive: false });

    // Add mousedown event listener to window
    window.addEventListener('mousedown', handleMouseDown, { passive: false });
  });
});

onUnmounted(() => {
  // Remove wheel event listener when component is unmounted
  window.removeEventListener('wheel', handleWheel);

  // remove mousedown click event listener
  window.removeEventListener('mousedown', handleMouseDown);
});

const handleWheel = (event: WheelEvent): void => {
  // If in edit mode, use the wheel for adjusting the value
  if (isEditing.value && editingIndex.value >= 0) {
    event.preventDefault();
    const item = props.items[editingIndex.value];
    if (isObject(item) && item.onEdit) {
      // Detect direction (negative deltaY means scrolling up)
      const direction = event.deltaY < 0 ? 1 : -1;
      item.onEdit(direction);
    }
    return;
  }

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

button {
  transition: background-color 0.2s;
  font-size: 0.9rem;
}

/* Add styles for color preview */
.color-preview {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #ccc;
}
</style>
