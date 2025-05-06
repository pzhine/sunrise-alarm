<template>
  <div ref="container" class="synthwave-container bg-purple-600"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

const container = ref<HTMLDivElement | null>(null);
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let composer: EffectComposer; // Single composer for combined bloom
let bloomPass: UnrealBloomPass;
let smaaPass: SMAAPass;
let animationFrameId: number;
let gridHelper: THREE.GridHelper;
let sunMesh: THREE.Mesh;
const gridCellSize = 2.5;

// Animation variables
let clock: THREE.Clock;
const animationDuration = 60; // seconds
const sunStartY = -10;
const sunEndY = 7;
const gridStartColor = new THREE.Color(0x000000); // Black
const gridEndColor = new THREE.Color(0x00ffff); // Cyan
let gridColorAttribute: THREE.BufferAttribute | null = null; // To store color buffer

// Background Color Animation
const bgColorStart = new THREE.Color(0x000000); // Black
const bgColorMid1 = new THREE.Color(0x490066); // Deep Purple
const bgColorMid2 = new THREE.Color(0x703800); // Orange
const bgColorEnd = new THREE.Color(0x00567a); // Sky Blue

// Bloom Animation
let initialBloomStrength: number;
let initialBloomRadius: number;

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
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

onMounted(() => {
  if (!container.value) return;

  clock = new THREE.Clock(); // Initialize clock

  const width = container.value.clientWidth;
  const height = container.value.clientHeight;

  // Scene setup
  scene = new THREE.Scene();
  scene.background = bgColorStart.clone(); // Start with black background
  // scene.fog = new THREE.FogExp2(0x2c003e, 0.05); // Fog might interfere, removed for now

  // Camera setup
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(0, 3, 10);
  camera.lookAt(0, 3, -1); // Horizon low

  // Renderer setup
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    // alpha: false, // Disable transparency if background color is used
  });
  // renderer.setClearColor(0x000000, 0); // Remove transparent clear color
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

  // 2. Grid
  gridHelper = new THREE.GridHelper(200, 80, gridStartColor, gridStartColor); // Start black
  gridHelper.position.y = 0;
  // Get the color attribute buffer
  gridColorAttribute = gridHelper.geometry.getAttribute(
    'color'
  ) as THREE.BufferAttribute;
  scene.add(gridHelper);

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

  // --- Animation Loop ---
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    const elapsedTime = clock.getElapsedTime();
    const progress = Math.min(elapsedTime / animationDuration, 1.0);
    const easedProgress = easeOutQuint(progress); // Apply easing function

    // Animate Sun Position using eased progress
    sunMesh.position.y = THREE.MathUtils.lerp(
      sunStartY,
      sunEndY,
      easedProgress
    );

    // Animate Grid Color (starting at 25% progress)
    if (gridColorAttribute) {
      let gridProgress = 0; // Default to start color
      if (progress >= 0.25) {
        // Map the range [0.25, 1.0] to [0.0, 1.0]
        gridProgress = (progress - 0.25) / (1.0 - 0.25);
      }
      const currentColor = new THREE.Color().lerpColors(
        gridStartColor,
        gridEndColor,
        gridProgress // Use the adjusted progress
      );
      const colorArray = gridColorAttribute.array;
      for (let i = 0; i < colorArray.length; i += 3) {
        colorArray[i] = currentColor.r;
        colorArray[i + 1] = currentColor.g;
        colorArray[i + 2] = currentColor.b;
      }
      gridColorAttribute.needsUpdate = true; // IMPORTANT: Tell Three.js to update the buffer
    }

    // Animate Background Color
    const bgCurrentColor = new THREE.Color();
    if (progress < 0.33) {
      const phaseProgress = progress / 0.33;
      bgCurrentColor.lerpColors(bgColorStart, bgColorMid1, phaseProgress);
    } else if (progress < 0.55) {
      const phaseProgress = (progress - 0.22) / 0.22;
      bgCurrentColor.lerpColors(bgColorMid1, bgColorMid2, phaseProgress);
    } else {
      const phaseProgress = (progress - 0.66) / 0.44; // Adjust denominator slightly
      bgCurrentColor.lerpColors(bgColorMid2, bgColorEnd, phaseProgress);
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(bgCurrentColor);
    }

    // Animate Bloom (last 25%)
    if (progress >= 0.75) {
      // Map the range [0.75, 1.0] to [0.0, 1.0]
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
      // Ensure bloom is at initial values before 75%
      bloomPass.strength = initialBloomStrength;
      bloomPass.radius = initialBloomRadius;
    }

    // Animate grid scrolling
    gridHelper.position.z = (gridHelper.position.z + 0.01) % gridCellSize;

    // Render scene with post-processing
    composer.render();
  };

  animate();

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
    gridHelper?.geometry?.dispose();
    (gridHelper?.material as THREE.Material)?.dispose();
    // Dispose passes if necessary (usually handled by composer)
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
