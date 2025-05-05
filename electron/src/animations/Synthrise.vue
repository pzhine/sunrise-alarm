<template>
  <div class="synthrise-container">
    <canvas ref="canvas" class="canvas"></canvas>
    
    <!-- Controls overlay -->
    <div class="controls">
      <div>
        <label class="mr-2">Speed</label>
        <input 
          type="range" 
          min="0.1" 
          max="3" 
          step="0.1" 
          v-model="animationSpeed"
          class="speed-slider"
        />
      </div>
      <button @click="goToMenu" class="menu-button">Menu</button>
    </div>
    
    <!-- Add timeout redirect -->
    <TimeoutRedirect
      :ms="30000"
      :redirectRoute="'/'"
      :resetOnActivity="'wheel'"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import TimeoutRedirect from '../components/TimeoutRedirect.vue';

const router = useRouter();
const canvas = ref<HTMLCanvasElement | null>(null);
const animationSpeed = ref(1.0);
let animationFrameId: number | null = null;

// Constants for the sun and grid
const SUN_GRADIENT_COLORS = [
  '#FF1B8D', // Pink at top
  '#FF1B8D', 
  '#FF5E3A', // Middle pink-orange
  '#FF9946', // Orange
  '#FFCF54'  // Yellow at bottom
];

const BACKGROUND_COLOR = '#4B0082'; // Deep purple
const GRID_COLOR = '#00FFFF'; // Cyan

const GRID_SIZE = 15; // Number of grid cells horizontally
const SUN_RADIUS_RATIO = 0.3; // Sun radius as proportion of canvas width
const HORIZON_Y_RATIO = 0.45; // Position of horizon line from top (0-1)
const GRID_LINE_WIDTH = 2; 

// Animation
let startTime = Date.now();

// Draw the scene
const drawScene = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
  // Clear the canvas
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, width, height);
  
  // Calculate dimensions
  const horizonY = height * HORIZON_Y_RATIO;
  const sunRadius = width * SUN_RADIUS_RATIO;
  const sunCenterX = width / 2;
  const sunCenterY = horizonY;
  
  // Draw the sun with gradient
  const sunGradient = ctx.createLinearGradient(0, horizonY - sunRadius, 0, horizonY + sunRadius);
  SUN_GRADIENT_COLORS.forEach((color, index) => {
    sunGradient.addColorStop(index / (SUN_GRADIENT_COLORS.length - 1), color);
  });
  
  ctx.beginPath();
  ctx.arc(sunCenterX, sunCenterY, sunRadius, 0, Math.PI, true);
  ctx.fillStyle = sunGradient;
  ctx.fill();
  
  // Draw sun stripes (horizontal lines across the sun)
  ctx.lineWidth = 2;
  ctx.strokeStyle = BACKGROUND_COLOR;
  
  const stripeCount = 15;
  const stripeSpacing = sunRadius * 2 / stripeCount;
  
  for (let i = 1; i < stripeCount; i++) {
    const y = horizonY - sunRadius + i * stripeSpacing;
    
    // Only draw stripes that intersect the sun
    if (y > horizonY) continue;
    
    ctx.beginPath();
    // Calculate where the line would intersect the circle
    const distFromCenter = y - horizonY;
    const halfWidth = Math.sqrt(sunRadius * sunRadius - distFromCenter * distFromCenter);
    
    ctx.moveTo(sunCenterX - halfWidth, y);
    ctx.lineTo(sunCenterX + halfWidth, y);
    ctx.stroke();
  }
  
  // Draw the grid with perspective
  drawGrid(ctx, width, height, horizonY, time);
};

// Draw the perspective grid
const drawGrid = (
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  horizonY: number,
  time: number
) => {
  const speed = parseFloat(animationSpeed.value.toString());
  const gridMovement = (time * 0.3 * speed) % 1; // Controls grid animation speed
  
  ctx.lineWidth = GRID_LINE_WIDTH;
  ctx.strokeStyle = GRID_COLOR;
  
  // Vertical lines with perspective
  const cellWidth = width / GRID_SIZE;
  for (let i = 0; i <= GRID_SIZE; i++) {
    const x = i * cellWidth;
    
    ctx.beginPath();
    ctx.moveTo(x, horizonY);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  // Horizontal lines with perspective
  const horizontalLineCount = 20;
  for (let i = 0; i <= horizontalLineCount; i++) {
    // Calculate position with perspective and animation
    const progress = (i + gridMovement) / horizontalLineCount;
    const y = horizonY + (height - horizonY) * progress * progress; // Non-linear for better perspective
    
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
};

// Animation loop
const animate = () => {
  if (!canvas.value) return;
  
  const ctx = canvas.value.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.value.width;
  const height = canvas.value.height;
  
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  drawScene(ctx, width, height, elapsedSeconds);
  
  animationFrameId = requestAnimationFrame(animate);
};

// Handle window resize
const resizeCanvas = () => {
  if (!canvas.value) return;
  
  canvas.value.width = canvas.value.clientWidth;
  canvas.value.height = canvas.value.clientHeight;
  
  // Redraw immediately after resize
  const ctx = canvas.value.getContext('2d');
  if (ctx) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    drawScene(ctx, canvas.value.width, canvas.value.height, elapsedSeconds);
  }
};

// Navigation
const goToMenu = () => {
  router.push('/menu');
};

onMounted(() => {
  if (!canvas.value) return;
  
  // Set canvas size
  canvas.value.width = canvas.value.clientWidth;
  canvas.value.height = canvas.value.clientHeight;
  
  // Start animation
  startTime = Date.now();
  animate();
  
  // Add resize listener
  window.addEventListener('resize', resizeCanvas);
});

onUnmounted(() => {
  // Cleanup
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
  window.removeEventListener('resize', resizeCanvas);
});
</script>

<style scoped>
.synthrise-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.controls {
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  right: 1rem;
  padding: 1rem;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 0.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #ffbf00;
}

.speed-slider {
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 191, 0, 0.3);
  height: 8px;
  width: 120px;
  border-radius: 4px;
}

.speed-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffbf00;
  cursor: pointer;
}

.menu-button {
  padding: 0.5rem 1rem;
  background-color: #ffbf00;
  color: #000;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-button:hover {
  background-color: #ffda7a;
}
</style>