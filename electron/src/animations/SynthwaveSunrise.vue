<template>
  <div ref="container" class="synthwave-container bg-purple-600"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, defineProps } from 'vue';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

// Define props
const props = defineProps({
  skipAnimation: {
    type: Boolean,
    default: false,
  },
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
let lineMesh: THREE.LineSegments; // Added LineSegments mesh
let sunMesh: THREE.Mesh;

// Animation variables
let clock: THREE.Clock;
const animationDuration = 40; // seconds
const sunStartY = -24;
const sunEndY = 7;
const gridStartColor = new THREE.Color(0x000000); // Black
const gridEndColor = new THREE.Color(0x009999); // Cyan
let planePositionAttribute: THREE.BufferAttribute | null = null; // From invisible plane
let linePositionAttribute: THREE.BufferAttribute | null = null; // For visible lines
let originalPlaneYPositions: Float32Array | null = null;
let lineMaterial: THREE.LineBasicMaterial; // Changed material reference

// Background Color Animation
const bgColorStart = new THREE.Color(0x000000); // Black
const bgColorMid1 = new THREE.Color(0x490066); // Deep Purple
const bgColorMid2 = new THREE.Color(0x703800); // Orange
const bgColorEnd = new THREE.Color(0x00567a); // Sky Blue

// Bloom Animation
let initialBloomStrength: number;
let initialBloomRadius: number;

// Wave parameters
const waveFrequency = 0.1;
const waveAmplitude = 0.5;
const waveSpeed = 0.5;
const scrollSpeed = 0.5; // Speed the grid appears to move towards camera

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

// Helper function for Cubic Ease-Out
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

// Function to update animation state based on progress (Handles Sun, Colors, Bloom)
function updateAnimationState(progress: number) {
  const easedProgress = easeOutQuart(progress);

  // Animate Sun Position
  sunMesh.position.y = THREE.MathUtils.lerp(sunStartY, sunEndY, easedProgress);

  // Animate Grid Color
  let gridProgress = 0;
  if (progress >= 0.25) {
    gridProgress = (progress - 0.25) / (1.0 - 0.25);
  }
  lineMaterial.color.lerpColors(gridStartColor, gridEndColor, gridProgress);

  // Animate Background Color
  const bgCurrentColor = new THREE.Color();
  if (progress < 0.22) {
    const phaseProgress = progress / 0.22;
    bgCurrentColor.lerpColors(bgColorStart, bgColorMid1, phaseProgress);
  } else if (progress < 0.35) {
    const phaseProgress = (progress - 0.22) / 0.22;
    bgCurrentColor.lerpColors(bgColorMid1, bgColorMid2, phaseProgress);
  } else {
    const phaseProgress = (progress - 0.44) / 0.64;
    bgCurrentColor.lerpColors(bgColorMid2, bgColorEnd, phaseProgress);
  }
  if (scene.background instanceof THREE.Color) {
    scene.background.copy(bgCurrentColor);
  }

  // Animate Bloom
  if (progress >= 0.75) {
    const bloomProgress = (progress - 0.75) / (1.0 - 0.75);
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

  // --- Wave/Scroll logic removed from this function ---
}

// Function to ONLY update grid waves and scroll based on elapsed time
function updateGridWaves(elapsedTime: number) {
  if (planePositionAttribute && originalPlaneYPositions) {
    const planePosArray = planePositionAttribute.array as Float32Array;
    const scrollOffset = elapsedTime * scrollSpeed;

    for (let i = 0; i < planePositionAttribute.count; i++) {
      const x = planePosArray[i * 3 + 0]; // World X
      const z = planePosArray[i * 3 + 2]; // World Z (since rotated)
      const originalY = originalPlaneYPositions[i];

      // Calculate wave input Z, offset by scroll amount
      const waveInputZ = z + scrollOffset;

      // Calculate wave offset based on X, scrolled Z, and time
      const waveOffset =
        Math.sin(x * waveFrequency + elapsedTime * waveSpeed) *
        Math.cos(
          waveInputZ * waveFrequency * 0.5 + elapsedTime * waveSpeed * 0.3
        ) *
        waveAmplitude;

      // Update the Y position in the plane's buffer
      planePosArray[i * 3 + 1] = originalY + waveOffset;
    }
    planePositionAttribute.needsUpdate = true;
    if (linePositionAttribute) {
      (linePositionAttribute.array as Float32Array).set(planePosArray);
      linePositionAttribute.needsUpdate = true;
    }
  }
}

onMounted(() => {
  if (!container.value) return;

  clock = new THREE.Clock();

  const width = container.value.clientWidth;
  const height = container.value.clientHeight;

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
  });
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ReinhardToneMapping;
  container.value.appendChild(renderer.domElement);

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

  // 2. Grid Lines (using LineSegments based on PlaneGeometry)
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

  // Create the LineSegments mesh
  lineMesh = new THREE.LineSegments(lineGeom, lineMaterial);
  lineMesh.position.y = 0; // Position at Y=0
  scene.add(lineMesh);

  // --- Post-processing Setup (Single Bloom) ---
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // SMAA Pass (before Bloom)
  const pixelRatio = renderer.getPixelRatio();
  smaaPass = new SMAAPass(width * pixelRatio, height * pixelRatio);
  composer.addPass(smaaPass);

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

  if (props.skipAnimation) {
    // --- Skip Animation (but keep waves/scroll) ---
    updateAnimationState(1.0); // Set sun, colors, bloom to final state

    // Start a simplified animation loop JUST for waves/scroll AND mesh movement
    const animateWavesOnly = () => {
      animationFrameId = requestAnimationFrame(animateWavesOnly);
      const elapsedTime = clock.getElapsedTime(); // Get real time

      // Update waves based on vertex positions relative to mesh origin
      updateGridWaves(elapsedTime);

      // Move the entire mesh along Z-axis
      // Negative Z moves away from camera, simulating camera moving forward
      lineMesh.position.z = elapsedTime * scrollSpeed; // CORRECTED SIGN

      composer.render(); // Render the scene
    };
    animateWavesOnly(); // Start the wave-only loop
  } else {
    // --- Start Full Animation Loop ---
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const progress = Math.min(elapsedTime / animationDuration, 1.0);

      updateAnimationState(progress); // RESTORED CALL
      updateGridWaves(elapsedTime); // Update waves and scroll based on real time

      // Move the entire mesh along Z-axis
      lineMesh.position.z = elapsedTime * scrollSpeed;

      composer.render();
    };
    animate(); // Start the full loop
  }

  // Handle resize
  const handleResize = () => {
    if (!container.value) return;
    const newWidth = container.value.clientWidth;
    const newHeight = container.value.clientHeight;

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

<style scoped>
.synthwave-container {
  width: 100%;
  height: 100vh; /* Make it full viewport height */
  overflow: hidden; /* Prevent scrollbars */
}
</style>
