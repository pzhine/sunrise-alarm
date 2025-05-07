<template>
  <div ref="container" class="synthwave-container bg-purple-600">
    <div v-if="props.debug" class="debug-overlay">
      <p>Vendor: {{ debugInfo.vendor }}</p>
      <p>Renderer: {{ debugInfo.renderer }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineProps, reactive } from 'vue';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { cubicBezierEasing } from './animationUtils';

// Define props
const props = defineProps({
  duration: {
    type: Number,
    default: 60,
  },
  lowResolution: {
    type: Boolean,
    default: true,
  },
  debug: {
    // Added new debug prop
    type: Boolean,
    default: false,
  },
});

console.log('[SynthwaveSunrise] duration:', props.duration);

// Reactive state for debug info
const debugInfo = reactive({
  vendor: 'N/A',
  renderer: 'N/A',
});

const container = ref<HTMLDivElement | null>(null);
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let smaaPass: SMAAPass;
let animationFrameId: number;
let planeGeometry: THREE.PlaneGeometry; // Keep geometry for calculations
let lineMesh1: THREE.LineSegments; // First grid mesh
let lineMesh2: THREE.LineSegments; // Second grid mesh
let sunMesh: THREE.Mesh;

// Animation variables
let clock: THREE.Clock;
const animationDuration = props.duration; // seconds
const sunStartY = -10;
const sunEndY = 7;
const gridStartColor = new THREE.Color(0x000000); // Black
const gridEndColor = new THREE.Color(0x009999); // Cyan
let planePositionAttribute: THREE.BufferAttribute | null = null; // From invisible plane
let linePositionAttribute: THREE.BufferAttribute | null = null; // For visible lines
let originalPlaneYPositions: Float32Array | null = null;
let lineMaterial: THREE.LineBasicMaterial; // Changed material reference

// Background Color Animation
const bgColorStart = new THREE.Color(0x000000); // Black
const bgColorMid1 = new THREE.Color(0x66008f); // Deep Purple
const bgColorMid2 = new THREE.Color(0x8a4500); // Orange
const bgColorEnd = new THREE.Color(0x00567a); // Sky Blue

// Bloom Animation
let initialBloomStrength: number;
let initialBloomRadius: number;

// Wave parameters
const waveFrequency = (3 * Math.PI) / 100; // Adjusted for periodicity over planeSize
const waveAmplitude = 1;
const waveSpeed = 0.5;
const scrollSpeed = 2.0; // Or your preferred speed

// --- Shaders for the Sun ---
const sunVertexShader = `
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const sunFragmentShader = `
varying vec2 vUv;
varying vec3 vWorldPosition; // Receive world position

uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float numStripes;
uniform float maxStripeThickness;
uniform float minStripeThickness;
uniform float stripeCutoff;
uniform float horizonYLevel; // Add uniform for horizon Y level

void main() {
  // Discard fragments below the horizon line
  if (vWorldPosition.y < horizonYLevel) {
    discard;
  }

  // Calculate distance from center (0.5, 0.5) in UV space
  float dist = distance(vUv, vec2(0.5));

  // Discard fragments outside the circle radius (0.5)
  if (dist > 0.5) {
    discard;
  }

  // Calculate gradient color based on vertical position (vUv.y)
  float gradientY = clamp(vUv.y, 0.0, 1.0);
  vec3 gradientColor = mix(bottomColor, topColor, gradientY);

  // Calculate stripes only below the cutoff
  float stripeAlpha = 1.0; // Default to solid color (no stripe)
  if (vUv.y < stripeCutoff) {
    // Calculate varying stripe thickness based on vertical position
    float currentStripeThickness = mix(maxStripeThickness, minStripeThickness, vUv.y / stripeCutoff);
    float stripePattern = fract(vUv.y * numStripes);
    stripeAlpha = step(currentStripeThickness, stripePattern);
  }

  // Apply stripe transparency
  vec3 finalColor = gradientColor;
  float finalAlpha = 1.0;

  if (stripeAlpha < 1.0) { // If it's a stripe area
      finalColor = vec3(0.0); // Make stripe black/transparent
      finalAlpha = 0.0;
  }

  // Discard fully transparent fragments
  if (finalAlpha < 0.01) {
      discard;
  }

  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;

// Function to update animation state based on progress (Handles Sun, Colors, Bloom)
function updateAnimationState(progress: number) {
  // clamp progress to [0, 0.99] to avoid overshooting
  progress = Math.min(Math.max(progress, 0), 0.99); // Clamp to avoid overshooting

  // https://cubic-bezier.com/
  const easedProgress = cubicBezierEasing(progress, 0.86, 0.11, 0.19, 0.81);

  // Animate Sun Position
  sunMesh.position.y = THREE.MathUtils.lerp(sunStartY, sunEndY, easedProgress);

  // Animate Grid Color

  lineMaterial.color.lerpColors(
    gridStartColor,
    gridEndColor,
    Math.min(1, progress + 0.05)
  );

  // Animate Background Color
  const bgCurrentColor = new THREE.Color();
  if (progress < 0.22) {
    const phaseProgress = progress / 0.22;
    bgCurrentColor.lerpColors(bgColorStart, bgColorMid1, phaseProgress);
  } else if (progress < 0.33) {
    const phaseProgress = (progress - 0.22) / 0.11;
    bgCurrentColor.lerpColors(bgColorMid1, bgColorMid2, phaseProgress);
  } else {
    const phaseProgress = (progress - 0.33) / 0.66;
    bgCurrentColor.lerpColors(bgColorMid2, bgColorEnd, phaseProgress);
  }
  if (scene.background instanceof THREE.Color) {
    scene.background.copy(bgCurrentColor);
  }

  // Animate Bloom
  if (progress >= 0.6) {
    const bloomProgress = (progress - 0.6) / (1.0 - 0.6);
    bloomPass.strength = THREE.MathUtils.lerp(
      initialBloomStrength,
      initialBloomStrength * 0.5,
      bloomProgress
    );
    bloomPass.radius = THREE.MathUtils.lerp(
      initialBloomRadius,
      initialBloomRadius * 0.5,
      bloomProgress
    );
  } else {
    bloomPass.strength = initialBloomStrength;
    bloomPass.radius = initialBloomRadius;
  }
}

// Function to ONLY update grid waves based on vertex Z and TOTAL scroll offset
function updateGridWaves(totalScrollOffset: number) {
  if (planePositionAttribute && originalPlaneYPositions) {
    const planePosArray = planePositionAttribute.array as Float32Array;

    for (let i = 0; i < planePositionAttribute.count; i++) {
      const x = planePosArray[i * 3 + 0];
      const z = planePosArray[i * 3 + 2];
      const originalY = originalPlaneYPositions[i];
      const waveInputZ = z + totalScrollOffset;
      const elapsedTimeEquivalent = totalScrollOffset / scrollSpeed;

      // --- Modified Complex Wave Calculation ---
      // Removed '* 0.5' from the cos term's frequency component
      const waveOffset =
        Math.sin(x * waveFrequency + elapsedTimeEquivalent * waveSpeed) *
        Math.cos(
          waveInputZ * waveFrequency + elapsedTimeEquivalent * waveSpeed * 0.3 // Use waveFrequency directly
        ) *
        waveAmplitude;
      // --- End Wave Calculation ---

      planePosArray[i * 3 + 1] = originalY + waveOffset;
    }
    planePositionAttribute.needsUpdate = true; // Mark calculation buffer
    if (linePositionAttribute) {
      // Copy updated positions to the single line geometry buffer
      (linePositionAttribute.array as Float32Array).set(planePosArray);
      linePositionAttribute.needsUpdate = true;
    }
  }
}

onMounted(() => {
  if (!container.value) return;

  clock = new THREE.Clock();

  let width = container.value.clientWidth;
  let height = container.value.clientHeight;

  if (props.lowResolution) {
    width /= 4;
    height /= 4;
  }

  // Scene setup
  scene = new THREE.Scene();
  scene.background = bgColorStart.clone(); // Start with black background

  // Camera setup
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(0, 3, 10);
  camera.lookAt(0, 3, -1); // Horizon low

  // Renderer setup
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance', // Added to suggest using high performance GPU
  });
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ReinhardToneMapping;
  container.value.appendChild(renderer.domElement);

  // Get GPU info if debug is enabled
  if (props.debug) {
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        debugInfo.vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'N/A';
        debugInfo.renderer =
          gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'N/A';
      }
    } catch (e) {
      console.error('Error getting WebGL debug info:', e);
      debugInfo.vendor = 'Error';
      debugInfo.renderer = 'Error getting info';
    }
  }

  // --- Create Objects ---
  // 1. Sun
  const sunGeometry = new THREE.CircleGeometry(12, 64);
  const sunMaterial = new THREE.ShaderMaterial({
    vertexShader: sunVertexShader,
    fragmentShader: sunFragmentShader,
    uniforms: {
      topColor: { value: new THREE.Color(0xff61a6) },
      bottomColor: { value: new THREE.Color(0xffa74f) },
      numStripes: { value: 10.0 },
      maxStripeThickness: { value: 0.8 },
      minStripeThickness: { value: 0.2 },
      stripeCutoff: { value: 0.75 },
      horizonYLevel: { value: 3 },
    },
    transparent: true,
    depthWrite: false, // Keep for stripe transparency layering
  });
  sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.position.set(0, sunStartY, -15); // Start below horizon
  scene.add(sunMesh);

  // 2. Grid Lines (using TWO LineSegments based on ONE PlaneGeometry)
  const planeSize = 200;
  const planeSegmentsW = 80; // Width segments
  const planeSegmentsH = 80; // Height segments
  // Create PlaneGeometry only for vertex calculations
  planeGeometry = new THREE.PlaneGeometry(
    planeSize,
    planeSize,
    planeSegmentsW,
    planeSegmentsH
  );
  planeGeometry.rotateX(-Math.PI / 2); // Rotate to lie flat initially

  // Get position data from the calculation geometry
  planePositionAttribute = planeGeometry.getAttribute(
    'position'
  ) as THREE.BufferAttribute;
  originalPlaneYPositions = new Float32Array(planePositionAttribute.count);
  for (let i = 0; i < planePositionAttribute.count; i++) {
    originalPlaneYPositions[i] = planePositionAttribute.getY(i); // Store original world Y (which is 0)
  }

  // Create geometry for the visible lines
  const lineGeom = new THREE.BufferGeometry();
  // Create and copy initial positions for the line geometry
  const linePositions = new Float32Array(planePositionAttribute.array.length);
  linePositions.set(planePositionAttribute.array);
  linePositionAttribute = new THREE.BufferAttribute(linePositions, 3);
  lineGeom.setAttribute('position', linePositionAttribute);

  // Generate indices for horizontal and vertical lines ONLY
  const indices = [];
  const w = planeSegmentsW;
  const h = planeSegmentsH;
  for (let j = 0; j <= h; j++) {
    // Rows
    for (let i = 0; i < w; i++) {
      // Columns
      const idx1 = j * (w + 1) + i;
      const idx2 = idx1 + 1;
      indices.push(idx1, idx2); // Horizontal segment
    }
  }
  for (let i = 0; i <= w; i++) {
    // Columns
    for (let j = 0; j < h; j++) {
      // Rows
      const idx1 = j * (w + 1) + i;
      const idx2 = idx1 + (w + 1);
      indices.push(idx1, idx2); // Vertical segment
    }
  }
  lineGeom.setIndex(indices);

  // Create material for the lines
  lineMaterial = new THREE.LineBasicMaterial({
    color: gridStartColor, // Start black
  });

  // Create TWO LineSegments meshes using the same geometry and material
  lineMesh1 = new THREE.LineSegments(lineGeom, lineMaterial);
  lineMesh1.position.y = 0;
  lineMesh1.position.z = 0; // Start at origin
  scene.add(lineMesh1);

  lineMesh2 = new THREE.LineSegments(lineGeom, lineMaterial);
  lineMesh2.position.y = 0;
  lineMesh2.position.z = -planeSize; // Start one planeSize behind
  scene.add(lineMesh2);

  // --- Post-processing Setup (Single Bloom) ---
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  if (!props.lowResolution) {
    smaaPass = new SMAAPass(); // SMAAPass might need dimensions at initialization or update
    composer.addPass(smaaPass);
  }

  // Bloom Pass (after SMAA)
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.0, // strength
    0.5, // radius
    0.1 // threshold - Lower threshold to catch dimmer grid lines earlier
  );
  initialBloomStrength = bloomPass.strength; // Store initial value
  initialBloomRadius = bloomPass.radius; // Store initial value
  composer.addPass(bloomPass);

  // Copy Pass (final output)
  const copyPass = new ShaderPass(CopyShader);
  copyPass.renderToScreen = true;
  composer.addPass(copyPass);

  if (props.duration === 0) {
    // --- Skip Animation (but keep waves/scroll) ---
    updateAnimationState(0.99); // Set sun, colors, bloom to final state

    // Start a simplified animation loop JUST for waves/scroll AND mesh leapfrogging
    const animateWavesOnly = () => {
      animationFrameId = requestAnimationFrame(animateWavesOnly);
      const elapsedTime = clock.getElapsedTime(); // Get real time
      const totalScrollOffset = elapsedTime * scrollSpeed; // Calculate total scroll

      // Update waves based on vertex positions and TOTAL scroll offset
      // This updates the buffer shared by both meshes
      updateGridWaves(totalScrollOffset);

      // Move the meshes along Z-axis using MODULO for wrapping the PAIR
      const currentZ = totalScrollOffset % planeSize;
      lineMesh1.position.z = currentZ;
      lineMesh2.position.z = currentZ - planeSize; // Keep mesh2 exactly one planeSize behind

      composer.render(); // Render the scene
    };
    animateWavesOnly(); // Start the wave-only loop
  } else {
    // --- Start Full Animation Loop ---
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const progress = Math.min(elapsedTime / animationDuration, 1.0);
      const totalScrollOffset = elapsedTime * scrollSpeed; // Calculate total scroll

      updateAnimationState(progress); // Update sun, colors, bloom based on progress
      // Update waves based on vertex positions and TOTAL scroll offset
      updateGridWaves(totalScrollOffset);

      // Move the meshes along Z-axis using MODULO for wrapping the PAIR
      const currentZ = totalScrollOffset % planeSize;
      lineMesh1.position.z = currentZ;
      lineMesh2.position.z = currentZ - planeSize; // Keep mesh2 exactly one planeSize behind

      composer.render();
    };
    animate(); // Start the full loop
  }

  // Handle resize
  const handleResize = () => {
    if (!container.value) return;
    let newWidth = container.value.clientWidth;
    let newHeight = container.value.clientHeight;

    if (props.lowResolution) {
      newWidth /= 2;
      newHeight /= 2;
    }

    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth, newHeight);
    composer.setSize(newWidth, newHeight);

    const newPixelRatio = renderer.getPixelRatio();
    smaaPass.setSize(newWidth * newPixelRatio, newHeight * newPixelRatio);
  };
  window.addEventListener('resize', handleResize);

  // Cleanup on unmount
  onUnmounted(() => {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', handleResize);
    if (container.value && renderer) {
      container.value.removeChild(renderer.domElement);
    }
    // Dispose THREE objects
    renderer?.dispose();
    composer?.dispose();
    sunGeometry?.dispose();
    sunMaterial?.dispose();
    planeGeometry?.dispose(); // Dispose calculation geometry
    lineGeom?.dispose(); // Dispose line geometry
    lineMaterial?.dispose(); // Dispose line material
  });
});
</script>

<style>
.synthwave-container {
  width: 100%;
  height: 100vh; /* Make it full viewport height */
  overflow: hidden; /* Prevent scrollbars */
  position: relative; /* Added for debug overlay positioning */
}

.synthwave-container canvas {
  /* Added to scale canvas if rendered at lower res */
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.debug-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
  z-index: 1000;
}
</style>
