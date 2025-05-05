<template>
  <div class="w-full h-full flex flex-col relative">
    <!-- WebGL canvas -->
    <canvas ref="glCanvas" class="w-full h-full absolute top-0 left-0"></canvas>

    <!-- Controls overlay -->
    <div
      class="absolute bottom-4 left-4 right-4 p-4 bg-black bg-opacity-50 rounded-lg flex justify-between items-center"
    >
      <div>
        <label class="mr-2">Speed</label>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          v-model="animationSpeed"
          class="w-32"
          @input="updateAnimationSpeed"
        />
      </div>
      <div>
        <label class="mr-2">Color</label>
        <select
          v-model="selectedColorScheme"
          @change="updateColorScheme"
          class="bg-black text-amber-400 border border-amber-400 rounded"
        >
          <option
            v-for="(scheme, index) in colorSchemes"
            :key="index"
            :value="index"
          >
            {{ scheme.name }}
          </option>
        </select>
      </div>
      <button
        @click="goToMenu"
        class="px-4 py-2 bg-amber-600 text-black rounded"
      >
        Menu
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';

// Router for navigation
const router = useRouter();

// Canvas reference
const glCanvas = ref<HTMLCanvasElement | null>(null);

// WebGL context and animation
let gl: WebGLRenderingContext | null = null;
let animationFrameId: number | null = null;
let startTime = Date.now();
let program: WebGLProgram | null = null;

// Animation settings
const animationSpeed = ref(1.0);
const selectedColorScheme = ref(0);

// Color schemes
const colorSchemes = [
  {
    name: 'Classic Synthwave',
    sun: [1.0, 0.2, 0.6], // Pink/Purple
    grid: [0.0, 0.8, 1.0], // Cyan
    horizon: [0.8, 0.0, 0.8], // Purple
  },
  {
    name: 'Outrun',
    sun: [1.0, 0.1, 0.1], // Red
    grid: [0.0, 0.5, 1.0], // Blue
    horizon: [1.0, 0.5, 0.0], // Orange
  },
  {
    name: 'Vaporwave',
    sun: [1.0, 0.5, 0.8], // Pink
    grid: [0.0, 1.0, 0.8], // Teal
    horizon: [0.5, 0.0, 0.5], // Deep purple
  },
  {
    name: 'Cyberpunk',
    sun: [1.0, 0.8, 0.0], // Yellow
    grid: [0.0, 1.0, 0.5], // Green
    horizon: [0.0, 0.5, 1.0], // Blue
  },
];

// Vertex shader source
const vsSource = `
attribute vec4 aVertexPosition;
attribute vec2 aTextureCoord;

varying highp vec2 vTextureCoord;

void main(void) {
  gl_Position = aVertexPosition;
  vTextureCoord = aTextureCoord;
}
`;

// Fragment shader source for synthwave effect
const fsSource = `
precision highp float;
varying highp vec2 vTextureCoord;

uniform float uTime;
uniform float uSpeed;
uniform vec3 uSunColor;
uniform vec3 uGridColor;
uniform vec3 uHorizonColor;

// Function to create a grid pattern
float grid(vec2 uv, float size) {
  vec2 grid = fract(uv * size);
  return (step(0.98, grid.x) + step(0.98, grid.y)) * 0.5;
}

void main(void) {
  // Normalized coordinates with origin at center
  vec2 uv = vTextureCoord;
  uv = uv * 2.0 - 1.0;
  uv.y -= 0.2; // Lower the horizon
  
  // Animated time
  float time = uTime * uSpeed;
  
  // Create the grid effect with perspective
  float gridSize = 20.0;
  vec2 gridUv = vec2(uv.x / (uv.y + 1.0), 1.0 / (uv.y + 1.0));
  gridUv.y -= time * 0.2; // Move the grid
  float gridPattern = grid(gridUv, gridSize);
  
  // Create the sun
  float sunRadius = 0.4;
  float sunDist = length(vec2(uv.x, uv.y + 0.2));
  float sun = smoothstep(sunRadius + 0.1, sunRadius - 0.1, sunDist);
  
  // Make the sun pulse slightly
  sun *= 0.9 + 0.1 * sin(time);
  
  // Create the horizon line with gradient
  float horizon = smoothstep(0.0, 0.5, 1.0 - uv.y);
  
  // Combine the elements
  vec3 color = vec3(0.0);
  
  // Sun
  color += sun * uSunColor;
  
  // Grid lines on the "floor"
  if (uv.y < 0.0) {
    color += gridPattern * uGridColor * (1.0 - horizon);
  }
  
  // Horizon line and background gradient
  color += horizon * uHorizonColor * 0.6;
  
  // Add a bit of mist/fog
  color += vec3(0.0, 0.1, 0.2) * smoothstep(0.0, 2.0, -uv.y) * 0.3;
  
  // Output
  gl_FragColor = vec4(color, 1.0);
}
`;

// Initialize WebGL
const initGL = () => {
  if (!glCanvas.value) return;

  // Get WebGL context
  gl = glCanvas.value.getContext('webgl');
  if (!gl) {
    console.error('WebGL not supported');
    return;
  }

  // Set canvas size to match display size
  resizeCanvas();

  // Compile shaders and link program
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  program = createProgram(gl, vertexShader, fragmentShader);

  // Create buffers for a full-screen quad
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // Full screen quad coordinates
  const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // Texture coordinates
  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0];
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(textureCoordinates),
    gl.STATIC_DRAW
  );

  // Get attribute locations
  const positionLocation = gl.getAttribLocation(program, 'aVertexPosition');
  const texcoordLocation = gl.getAttribLocation(program, 'aTextureCoord');

  // Enable attribute arrays
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.enableVertexAttribArray(texcoordLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

  // Start animation
  startTime = Date.now();
  animate();
};

// Create a shader
const createShader = (
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Could not create shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Could not compile shader: ' + info);
  }

  return shader;
};

// Create a program with shaders
const createProgram = (
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram => {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Could not create program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Could not link program: ' + info);
  }

  return program;
};

// Resize canvas to match display size
const resizeCanvas = () => {
  if (!glCanvas.value || !gl) return;

  const displayWidth = glCanvas.value.clientWidth;
  const displayHeight = glCanvas.value.clientHeight;

  if (
    glCanvas.value.width !== displayWidth ||
    glCanvas.value.height !== displayHeight
  ) {
    glCanvas.value.width = displayWidth;
    glCanvas.value.height = displayHeight;
    gl.viewport(0, 0, displayWidth, displayHeight);
  }
};

// Animation loop
const animate = () => {
  if (!gl || !program) return;

  // Clear canvas
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Use program
  gl.useProgram(program);

  // Set uniforms
  const timeUniformLocation = gl.getUniformLocation(program, 'uTime');
  const speedUniformLocation = gl.getUniformLocation(program, 'uSpeed');
  const sunColorLocation = gl.getUniformLocation(program, 'uSunColor');
  const gridColorLocation = gl.getUniformLocation(program, 'uGridColor');
  const horizonColorLocation = gl.getUniformLocation(program, 'uHorizonColor');

  const elapsedTime = (Date.now() - startTime) / 1000; // Time in seconds
  gl.uniform1f(timeUniformLocation, elapsedTime);
  gl.uniform1f(
    speedUniformLocation,
    parseFloat(animationSpeed.value.toString())
  );

  // Get the selected color scheme
  const colors = colorSchemes[selectedColorScheme.value];
  gl.uniform3fv(sunColorLocation, new Float32Array(colors.sun));
  gl.uniform3fv(gridColorLocation, new Float32Array(colors.grid));
  gl.uniform3fv(horizonColorLocation, new Float32Array(colors.horizon));

  // Draw the scene
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Request next frame
  animationFrameId = requestAnimationFrame(animate);
};

// Update animation speed
const updateAnimationSpeed = () => {
  // No need to do anything here as the value is bound to the model
  // and picked up directly in the animation loop
};

// Update color scheme
const updateColorScheme = () => {
  // Color scheme index is bound and picked up in the animation loop
};

// Navigation
const goToMenu = () => {
  router.push('/menu');
};

// Set up WebGL when component is mounted
onMounted(() => {
  window.addEventListener('resize', resizeCanvas);
  initGL();
});

// Clean up when component is unmounted
onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas);
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<style scoped>
/* Custom styling for controls */
input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 191, 0, 0.3);
  height: 8px;
  border-radius: 4px;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffbf00;
  cursor: pointer;
}

select {
  background-color: rgba(0, 0, 0, 0.7);
  color: #ffbf00;
  border: 1px solid #ffbf00;
  padding: 4px 8px;
  border-radius: 4px;
}

button {
  transition: all 0.2s ease;
}

button:hover {
  background-color: #ffda7a;
}
</style>
