<template>
  <div 
    class="w-full h-full overflow-hidden relative touch-none" 
    ref="containerRef"
    @wheel="handleWheel"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
  >
    <div class="w-full will-change-transform" ref="contentRef">
      <div class="scroll-spacer" :style="{ height: spacerHeight + 'px' }"></div>
      
      <!-- Title Item -->
      <div 
        v-if="showTitle && title"
        class="round-item-wrapper flex justify-center items-center py-3 w-full origin-center border-b border-white/20"
      >
        <div class="round-item-content flex justify-center items-center w-[90%] text-[1.2rem] text-center text-white font-bold tracking-wider">
          {{ title }}
        </div>
      </div>

      <!-- Mode 1: Render items prop -->
      <template v-if="items && items.length > 0">
        <div
          v-for="(item, index) in items"
          :key="index"
          class="round-item-wrapper flex justify-center items-center py-3 w-full origin-center border-b border-white/20"
          @click="handleItemClick(item)"
        >
          <div 
            class="round-item-content flex justify-between items-center w-[90%] text-[1.2rem] text-center"
            :class="isObject(item) && item.customClass ? item.customClass : ''"
          >
            <span class="truncate">{{ isObject(item) ? item.label : item }}</span>
            <span v-if="isObject(item) && 'value' in item" class="value-text ml-2.5 opacity-80">
              {{ item.value }}
            </span>
          </div>
        </div>
      </template>

      <!-- Mode 2: Render slot content -->
      <div v-else ref="slotContainerRef" class="slot-container">
        <slot></slot>
      </div>

      <div class="scroll-spacer" :style="{ height: spacerHeight + 'px' }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import type { ListItem } from './InteractiveList.vue';

const props = defineProps<{
  items?: ListItem[];
  title?: string;
  showTitle?: boolean;
  showBackButton?: boolean;
  backButtonLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'select', item: ListItem): void;
  (e: 'back'): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const slotContainerRef = ref<HTMLElement | null>(null);
const spacerHeight = ref(300);

// Scroll state
const scrollTop = ref(0);
const maxScroll = ref(0);
const velocity = ref(0);
const isDragging = ref(false);
const lastTouchY = ref(0);
const startTouchY = ref(0); // To detect clicks vs drags
const startTouchX = ref(0); // To detect horizontal swipes
const isClickSuppressed = ref(false);
const clickTimeoutId = ref<number | null>(null);
const lockedAxis = ref<'vertical' | 'horizontal' | null>(null);
const lastDragEndTime = ref(0);
const lastDragEndPos = ref({ x: 0, y: 0 });
let animationFrameId: number | null = null;

// Helper to check if item is object
const isObject = (item: any): item is Extract<ListItem, object> => {
  return typeof item === 'object' && item !== null;
};

const handleItemClick = (item: ListItem) => {
  // Prevent click if we were dragging or catching a scroll
  if (isClickSuppressed.value) {
    return;
  }
  
  // Clear any existing timeout
  if (clickTimeoutId.value) {
    clearTimeout(clickTimeoutId.value);
  }

  // Delay the click to allow for cancellation if it's just noise (continuation)
  clickTimeoutId.value = window.setTimeout(() => {
    if (isObject(item) && item.onSelect) {
      item.onSelect();
    }
    emit('select', item);
    clickTimeoutId.value = null;
  }, 100);
};

const updateLayout = () => {
  if (!containerRef.value || !contentRef.value) return;
  
  const containerHeight = containerRef.value.clientHeight;
  
  // Set spacer to 35% of container height (top of the stable zone)
  // The stable zone is the middle 50%, so it starts at 35% and ends at 75%
  spacerHeight.value = containerHeight * 0.35; 
  
  // Recalculate max scroll
  // We need to wait for spacer update to affect scrollHeight
  nextTick(() => {
    if (!containerRef.value || !contentRef.value) return;
    // Total scrollable distance is content height minus container height
    // But since we use spacers, the content is taller.
    // We want to scroll from top (0) to bottom.
    maxScroll.value = Math.max(0, contentRef.value.scrollHeight - containerHeight);

    // Force update transforms after layout change
    // Use setTimeout to ensure DOM has fully updated and painted
    setTimeout(() => {
      applyTransforms();
    }, 50);
  });
};

// --- Physics & Scroll Logic ---

const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  velocity.value += e.deltaY * 0.5; // Accumulate velocity
  // Wake up loop if needed
  if (!animationFrameId) {
    animationLoop();
  }
};

const handleTouchStart = (e: TouchEvent) => {
  const now = Date.now();
  const touchX = e.touches[0].clientX;
  const touchY = e.touches[0].clientY;

  // Check if this is a continuation of a recent drag (within 150ms and 50px)
  // This helps with EMI interference causing touch interruptions
  const isContinuation = 
    (now - lastDragEndTime.value < 150) &&
    (Math.abs(touchX - lastDragEndPos.value.x) < 50) &&
    (Math.abs(touchY - lastDragEndPos.value.y) < 50);

  if (isContinuation) {
    // Cancel pending click from previous touch end (it was likely noise)
    if (clickTimeoutId.value) {
      clearTimeout(clickTimeoutId.value);
      clickTimeoutId.value = null;
    }

    // Resume previous state
    isDragging.value = true;
    // Don't reset lockedAxis or startTouchX/Y to preserve gesture context
    // Just update lastTouchY to current position to avoid jumps
    lastTouchY.value = touchY;
    
    // Always suppress clicks for continuations (treat as noise/drag resume)
    isClickSuppressed.value = true;
  } else {
    // New gesture
    // If moving significantly, suppress click (catch)
    if (Math.abs(velocity.value) > 0.1) {
      isClickSuppressed.value = true;
    } else {
      isClickSuppressed.value = false;
    }

    isDragging.value = true;
    lockedAxis.value = null; // Reset axis lock
    velocity.value = 0;
    lastTouchY.value = touchY;
    startTouchY.value = touchY;
    startTouchX.value = touchX;
  }

  if (!animationFrameId) {
    animationLoop();
  }
};

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value) return;
  e.preventDefault();
  
  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  
  // Filter out erratic jumps (EMI noise)
  // If the touch jumps more than 80px in a single frame, ignore it
  const jumpDelta = Math.abs(currentY - lastTouchY.value);
  if (jumpDelta > 80) {
    // Update lastTouchY to current to prevent "stuck" offset if it wasn't noise,
    // but don't apply the delta to scrollTop this frame.
    // Actually, if it IS noise, we should probably ignore the update entirely?
    // But if the user really moved that fast, we might lose tracking.
    // Let's assume noise is transient. If we ignore this frame, the next frame 
    // will have a smaller delta relative to this one if it was real movement?
    // No, if we ignore this frame, lastTouchY remains old. Next frame currentY is new.
    // Delta will be even bigger.
    // So we should only ignore if it snaps BACK quickly?
    // Simple approach: Cap the delta.
    // Better approach for "teleporting" noise: just skip this event update entirely.
    return;
  }

  // Axis locking logic
  if (!lockedAxis.value) {
    const absDiffX = Math.abs(currentX - startTouchX.value);
    const absDiffY = Math.abs(currentY - startTouchY.value);
    const totalMove = Math.sqrt(absDiffX * absDiffX + absDiffY * absDiffY);
    
    // Lock axis after 10px of movement
    if (totalMove > 10) {
      if (absDiffX > absDiffY) {
        lockedAxis.value = 'horizontal';
      } else {
        lockedAxis.value = 'vertical';
      }
    }
  }

  // If locked horizontally, do not scroll
  if (lockedAxis.value === 'horizontal') {
    // Update lastTouchY so that if we switch back (unlikely with locking) or release, state is consistent
    lastTouchY.value = currentY;
    return;
  }

  const delta = lastTouchY.value - currentY;
  lastTouchY.value = currentY;
  
  // Check if we moved enough to suppress click
  if (!isClickSuppressed.value && Math.abs(currentY - startTouchY.value) > 10) {
    isClickSuppressed.value = true;
  }
  
  scrollTop.value += delta;
  
  // Rubber banding during drag
  if (scrollTop.value < 0) {
    // Apply resistance when pulling past top
    scrollTop.value -= delta;
    // Add dampened delta
    scrollTop.value += delta * 0.4;
  } else if (scrollTop.value > maxScroll.value) {
    scrollTop.value -= delta;
    scrollTop.value += delta * 0.4;
  }
};

const handleTouchEnd = (e: TouchEvent) => {
  isDragging.value = false;
  
  // Store end state for continuation logic
  lastDragEndTime.value = Date.now();
  lastDragEndPos.value = {
    x: e.changedTouches[0].clientX,
    y: e.changedTouches[0].clientY
  };
  
  // If we were locked to vertical scrolling, do not trigger back gesture
  if (lockedAxis.value === 'vertical') {
    return;
  }

  // Check for horizontal swipe (Back gesture)
  // Swipe right: endX > startX
  const endX = e.changedTouches[0].clientX;
  const diffX = endX - startTouchX.value;
  const diffY = Math.abs(e.changedTouches[0].clientY - startTouchY.value);
  
  // Thresholds: moved right by > 100px, and horizontal movement was significantly dominant
  if (diffX > 100 && diffX > diffY * 2.5) {
    emit('back');
  }
};

const handleMouseDown = (e: MouseEvent) => {
  if (Math.abs(velocity.value) > 0.1) {
    isClickSuppressed.value = true;
  } else {
    isClickSuppressed.value = false;
  }

  isDragging.value = true;
  lockedAxis.value = null;
  velocity.value = 0;
  lastTouchY.value = e.clientY;
  startTouchY.value = e.clientY;
  startTouchX.value = e.clientX;
  if (!animationFrameId) {
    animationLoop();
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  e.preventDefault();
  
  const currentY = e.clientY;
  const currentX = e.clientX;

  // Axis locking logic
  if (!lockedAxis.value) {
    const absDiffX = Math.abs(currentX - startTouchX.value);
    const absDiffY = Math.abs(currentY - startTouchY.value);
    const totalMove = Math.sqrt(absDiffX * absDiffX + absDiffY * absDiffY);
    
    if (totalMove > 10) {
      if (absDiffX > absDiffY) {
        lockedAxis.value = 'horizontal';
      } else {
        lockedAxis.value = 'vertical';
      }
    }
  }

  if (lockedAxis.value === 'horizontal') {
    lastTouchY.value = currentY;
    return;
  }

  const delta = lastTouchY.value - currentY;
  lastTouchY.value = currentY;
  
  // Check if we moved enough to suppress click
  if (!isClickSuppressed.value && Math.abs(currentY - startTouchY.value) > 10) {
    isClickSuppressed.value = true;
  }

  scrollTop.value += delta;
  
  // Rubber banding during drag
  if (scrollTop.value < 0) {
    scrollTop.value -= delta;
    scrollTop.value += delta * 0.4;
  } else if (scrollTop.value > maxScroll.value) {
    scrollTop.value -= delta;
    scrollTop.value += delta * 0.4;
  }
};

const handleMouseUp = (e: MouseEvent) => {
  if (!isDragging.value) return;
  isDragging.value = false;

  if (lockedAxis.value === 'vertical') {
    return;
  }

  // Check for horizontal swipe (Back gesture)
  const endX = e.clientX;
  const diffX = endX - startTouchX.value;
  const diffY = Math.abs(e.clientY - startTouchY.value);
  
  if (diffX > 100 && diffX > diffY * 2.5) {
    emit('back');
  }
};

const animationLoop = () => {
  // Apply friction
  if (!isDragging.value) {
    velocity.value *= 0.92; // Friction
    if (Math.abs(velocity.value) < 0.1) {
      velocity.value = 0;
    }
    scrollTop.value += velocity.value;
    
    // Bounce/Clamp
    if (scrollTop.value < 0) {
      // Spring back to 0
      // Use a simple proportional control (P-controller) for spring physics
      // Move 20% of the distance to target per frame
      scrollTop.value = scrollTop.value * 0.8; 
      
      // Snap when close enough
      if (Math.abs(scrollTop.value) < 0.5) {
        scrollTop.value = 0;
        // Stop velocity if we snapped
        velocity.value = 0;
      }
    } else if (scrollTop.value > maxScroll.value) {
      // Spring back to maxScroll
      const overscroll = scrollTop.value - maxScroll.value;
      scrollTop.value = maxScroll.value + overscroll * 0.8;
      
      // Snap when close enough
      if (Math.abs(overscroll) < 0.5) {
        scrollTop.value = maxScroll.value;
        // Stop velocity if we snapped
        velocity.value = 0;
      }
    }
    
    // No hard clamp here, let the spring physics handle it
  }

  // Apply transform to content wrapper
  if (contentRef.value) {
    contentRef.value.style.transform = `translateY(${-scrollTop.value}px)`;
  }

  // Apply item transforms
  applyTransforms();

  if (Math.abs(velocity.value) > 0.1 || isDragging.value || scrollTop.value < 0 || scrollTop.value > maxScroll.value) {
    animationFrameId = requestAnimationFrame(animationLoop);
  } else {
    animationFrameId = null;
  }
};

const applyTransforms = () => {
  if (!containerRef.value || !contentRef.value) return;

  const container = containerRef.value;
  const containerRect = container.getBoundingClientRect();
  const containerCenter = containerRect.top + containerRect.height / 2;
  const radius = containerRect.height / 2;

  // Get all item elements directly from DOM
  let elements: HTMLElement[] = [];
  // Try to find items by class first (Mode 1)
  const wrappers = contentRef.value.querySelectorAll('.round-item-wrapper');
  if (wrappers.length > 0) {
    elements = Array.from(wrappers) as HTMLElement[];
  } else if (slotContainerRef.value) {
    // Fallback for slot mode (Mode 2)
    elements = Array.from(slotContainerRef.value.children) as HTMLElement[];
  }

  elements.forEach((el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const itemCenter = rect.top + rect.height / 2;
    const distanceFromCenter = Math.abs(containerCenter - itemCenter);
    
    // Calculate scale and opacity based on distance from center
    // Stable zone: middle 50% of screen height (distance < 0.5 * radius)
    const stableThreshold = radius * 0.5;
    let transformFactor = 0;
    
    if (distanceFromCenter > stableThreshold) {
      // Map the remaining distance (from 0.5R to R) to 0..1
      const distOverThreshold = distanceFromCenter - stableThreshold;
      const transformZoneSize = radius - stableThreshold;
      transformFactor = Math.min(distOverThreshold / transformZoneSize, 1);
    }
    
    // Opacity: 1.0 in stable zone, fading out in transform zone
    const opacity = 1 - Math.pow(transformFactor, 3);

    // Apply opacity
    el.style.opacity = `${Math.max(0, opacity)}`;

    // Scale: 1.0 in stable zone, tapering to ~0.85 at edges
    const scale = 1 - (transformFactor * 0.15);
    el.style.transform = `scale(${scale})`;

    // Ensure content width is fixed
    const content = el.querySelector('.round-item-content') as HTMLElement;
    if (content) {
      content.style.width = '90%';
    }
  });
};

// Resize observer to handle container size changes
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  updateLayout();
  
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateLayout();
    });
    resizeObserver.observe(containerRef.value);
  }
  
  // If using slots, we might need to watch for DOM changes
  if (!props.items && slotContainerRef.value) {
    const mutationObserver = new MutationObserver(() => {
      updateLayout();
    });
    mutationObserver.observe(slotContainerRef.value, { childList: true, subtree: true });
  }
  
  // Start loop once to set initial state
  animationLoop();
});

onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});

watch(() => props.items, () => {
  nextTick(() => {
    updateLayout();
    animationLoop();
  });
}, { deep: true });

</script>

<style scoped>
/* Remove border from the last item */
.round-item-wrapper:last-child .round-item-content {
  border-bottom: none;
}

.slot-container > * {
  transform-origin: center center;
}
</style>