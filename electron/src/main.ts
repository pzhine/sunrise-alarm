import { createRouter, createWebHashHistory } from 'vue-router';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import Wifi from './pages/Wifi.vue';
import WifiPassword from './pages/WifiPassword.vue';
import WifiConnect from './pages/WifiConnect.vue';
import Clock from './pages/Clock.vue';
import MainMenu from './pages/MainMenu.vue';
import { nextTick } from 'vue';
import { useAppStore } from './stores/appState';

import './style.css';

// Create the Pinia store instance
const pinia = createPinia();

const routes = [
  { path: '/wifi', component: Wifi, name: 'Wifi' },
  {
    path: '/wifi-password/:networkName',
    name: 'WifiPassword',
    component: WifiPassword,
  },
  {
    path: '/wifi-connect/:networkName/:password',
    name: 'WifiConnect',
    component: WifiConnect,
  },
  { path: '/', name: 'Clock', component: Clock },
  { path: '/menu', name: 'MainMenu', component: MainMenu },
  {
    path: '/alarm',
    name: 'SetAlarm',
    component: () => import('./pages/SetAlarm.vue'),
  },
  {
    path: '/level/volume',
    name: 'Volume',
    component: () => import('./pages/LevelControl.vue'),
    props: { type: 'volume' },
  },
  {
    path: '/level/screenBrightness',
    name: 'ScreenBrightness',
    component: () => import('./pages/LevelControl.vue'),
    props: { type: 'screenBrightness' },
  },
  {
    path: '/level/lampBrightness',
    name: 'LampBrightness',
    component: () => import('./pages/LevelControl.vue'),
    props: { type: 'lampBrightness' },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

const app = createApp(App);
app.use(router);
app.use(pinia); // Add Pinia to the Vue application

// Mount the app
app.mount('#app');

// Initialize the app state from saved data
const initializeAppState = async () => {
  const appStore = useAppStore();

  // Load saved state first
  await appStore.loadState();

  // Subscribe to state changes and save when they occur
  appStore.$subscribe((_, state) => {
    appStore.saveState();
  });
};

// Check internet connectivity and route accordingly
const checkInternetAndRoute = async () => {
  try {
    const isConnected = await window.ipcRenderer.invoke(
      'check-internet-connectivity'
    );
    if (!isConnected) {
      router.push({ name: 'Wifi' });
    }
  } catch (error) {
    console.error('Error checking internet connectivity:', error);
    // Default to Wifi page if there's an error
    router.push({ name: 'Wifi' });
  }
};

// Set up hourly checks (60 * 60 * 1000 = 3600000 milliseconds = 1 hour)
setInterval(checkInternetAndRoute, 3600000);

// Perform initialization and checks after the app is mounted
nextTick(async () => {
  postMessage({ payload: 'removeLoading' }, '*');

  // Load saved app state
  await initializeAppState();

  // Check internet connectivity
  await checkInternetAndRoute();
});
