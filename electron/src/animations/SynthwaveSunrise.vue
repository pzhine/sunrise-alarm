<template>
  <div ref="container" class="synthwave-container bg-purple-600"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'; // Import SMAAPass

const container = ref<HTMLDivElement | null>(null);
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let composer: EffectComposer;
let bloomPass: UnrealBloomPass;
let smaaPass: SMAAPass; // Add variable for SMAAPass
let animationFrameId: number;
let gridHelper: THREE.GridHelper;
const gridCellSize = 2.5; // Calculate cell size: 200 / 80

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

onMounted(() => {
  if (!container.value) return;

  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6d005f); // Dark purple background
  scene.fog = new THREE.FogExp2(0x2c003e, 0.05); // Add exponential fog matching background

  // Camera setup
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  // Move camera up and slightly back, looking down towards the horizon
  camera.position.set(0, 3, 10);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ReinhardToneMapping; // Add tone mapping for bloom
  container.value.appendChild(renderer.domElement);

  // Post-processing Composer
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // SMAA Pass (Anti-aliasing)
  // Get pixel ratio for high-DPI displays
  const pixelRatio = renderer.getPixelRatio();
  smaaPass = new SMAAPass(width * pixelRatio, height * pixelRatio);

  // Bloom Pass (Glow Effect)
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1, // strength
    0.2, // radius
    0.05 // threshold - adjust this to control what glows
  );
  composer.addPass(bloomPass);
  composer.addPass(smaaPass); // Add SMAA after bloom

  // --- Add Synthwave Elements ---

  // 1. Sun
  const sunGeometry = new THREE.CircleGeometry(10, 64);
  const sunMaterial = new THREE.ShaderMaterial({
    vertexShader: sunVertexShader,
    fragmentShader: sunFragmentShader,
    uniforms: {
      topColor: { value: new THREE.Color(0xff61a6) }, // Pink
      bottomColor: { value: new THREE.Color(0xffa74f) }, // Orange
      numStripes: { value: 10.0 }, // Number of stripes
      maxStripeThickness: { value: 0.8 }, // Thickest stripe at bottom (0.0-1.0)
      minStripeThickness: { value: 0.2 }, // Thinnest stripe at top (0.0-1.0)
      stripeCutoff: { value: 0.75 }, // Stop stripes at 75% height (0.0-1.0)
      horizonYLevel: { value: 0.0 }, // Set horizon level to grid's Y position
    },
    transparent: true, // Enable transparency for the stripes/edges
    depthWrite: false, // Disable depth writing for correct layering
  });
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.position.set(0, 2, -15);
  // sunMesh.renderOrder = 1; // No longer strictly needed with shader masking
  scene.add(sunMesh);

  // 2. Grid
  gridHelper = new THREE.GridHelper(
    200, // size
    80, // divisions
    0x00ffff, // cyan lines
    0x00ffff // cyan lines
  );
  gridHelper.position.y = 0; // Position grid at the origin y=0
  // Remove rotation - keep it flat on XZ plane
  scene.add(gridHelper);

  // Adjust camera lookAt
  camera.lookAt(0, 1.5, -1);

  // Animation loop
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    // Animate grid position
    gridHelper.position.z = (gridHelper.position.z + 0.05) % gridCellSize;

    // Use composer to render with post-processing
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
    composer.setSize(newWidth, newHeight); // Resize composer too
    // Update SMAA pass resolution on resize
    const newPixelRatio = renderer.getPixelRatio();
    smaaPass.setSize(newWidth * newPixelRatio, newHeight * newPixelRatio);
  };
  window.addEventListener('resize', handleResize);

  // Cleanup on unmount
  onUnmounted(() => {
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', handleResize);
    if (container.value) {
      container.value.removeChild(renderer.domElement);
    }
    // Dispose Three.js objects
    renderer.dispose();
    composer.dispose(); // Dispose composer
    // Dispose passes if needed (usually handled by composer)
    sunGeometry.dispose();
    sunMaterial.dispose();
    gridHelper.geometry.dispose();
    (gridHelper.material as THREE.Material).dispose();
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
