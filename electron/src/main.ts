import { createRouter, createWebHashHistory } from 'vue-router';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import Wifi from './pages/Wifi.vue';
import WifiPassword from './pages/WifiPassword.vue';
import WifiConnect from './pages/WifiConnect.vue';
import ClockPage from './pages/ClockPage.vue';
import MainMenu from './pages/MainMenu.vue';
import SoundCategories from './pages/SoundCategories.vue';
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
  { path: '/', name: 'Clock', component: ClockPage },
  { path: '/menu', name: 'MainMenu', component: MainMenu },
  { path: '/sounds', name: 'SoundCategories', component: SoundCategories },
  {
    path: '/sounds/countries/:searchPhrase/:categoryName',
    name: 'SoundCountries',
    component: () => import('./pages/SoundCountries.vue'),
  },
  {
    path: '/sounds/list/:searchPhrase/:country/:categoryName',
    name: 'SoundsList',
    component: () => import('./pages/SoundsList.vue'),
  },
  {
    path: '/sounds/player/:id?/:name?/:previewUrl?/:duration?/:currentTime?/:category?/:country?',
    name: 'SoundPlayer',
    component: () => import('./pages/SoundPlayer.vue'),
  },
  {
    path: '/sounds/player-menu/:id?/:name?/:previewUrl?/:duration?/:currentTime?/:totalTime?/:category?/:country?',
    name: 'SoundPlayerMenu',
    component: () => import('./pages/SoundPlayerMenu.vue'),
  },
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
  {
    path: '/projector',
    name: 'ProjectorPreview',
    component: () => import('./pages/ProjectorPreview.vue'),
  },
  {
    path: '/projector/:ledIndex',
    name: 'ProjectorLEDControl',
    component: () => import('./pages/ProjectorLEDControl.vue'),
  },
  {
    path: '/sunriseSettings',
    name: 'SunriseSettings',
    component: () => import('./pages/SunriseSettings.vue'),
  },
  {
    path: '/sunrise-sounds',
    name: 'SunriseSounds',
    component: () => import('./pages/SunriseSounds.vue'),
  },
  {
    path: '/sunrise-animation',
    name: 'SunriseAnimation',
    component: () => import('./animations/SynthwaveSunrise.vue'),
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
  appStore.$subscribe((_) => {
    appStore.saveState();
  });
};

// Check internet connectivity and route accordingly with retries
const checkInternetAndRoute = async (initialStartup = false) => {
  const appStore = useAppStore();

  // Only use retry logic during initial startup
  if (initialStartup) {
    const startTime = Date.now();
    const maxWaitTime = 30000; // 30 seconds timeout
    let retryCount = 0;
    const maxRetries = 10;

    // First check if we already have an internet connection
    try {
      const isConnected = await window.ipcRenderer.invoke(
        'check-internet-connectivity'
      );

      if (isConnected) {
        console.log('Internet connectivity already exists');

        // We're already connected, get the current WiFi network name
        try {
          const currentWifiName = await window.ipcRenderer.invoke(
            'get-current-wifi-network'
          );

          if (currentWifiName) {
            console.log(`Currently connected to: ${currentWifiName}`);
            // Save the current WiFi network name in app state
            appStore.setLastConnectedWifi(currentWifiName);
          }
        } catch (error) {
          console.error('Error getting current WiFi network:', error);
        }

        return; // Already connected, no need for further checks
      }
    } catch (error) {
      console.error('Error checking initial connectivity:', error);
    }

    // Check if we have a previously connected WiFi network
    const lastConnectedWifi = appStore.lastConnectedWifi;

    // If we have a previously connected network, check if it's available
    if (lastConnectedWifi) {
      try {
        // Get list of available networks
        const availableNetworks = await window.ipcRenderer.invoke(
          'list-available-wifi-networks'
        );

        // Check if our last connected network is in the list
        const isLastNetworkAvailable =
          availableNetworks.includes(lastConnectedWifi);

        if (!isLastNetworkAvailable) {
          console.log(
            'Last connected WiFi network not available, skipping retry logic'
          );
          router.push({ name: 'Wifi' });
          return;
        }

        console.log(
          'Last connected WiFi network available, attempting to connect'
        );
      } catch (error) {
        console.error('Error checking available WiFi networks:', error);
        router.push({ name: 'Wifi' });
        return;
      }
    } else {
      // No previously connected network, skip retry logic
      console.log('No previously connected WiFi network, skipping retry logic');
      router.push({ name: 'Wifi' });
      return;
    }

    // Try until we succeed, hit max retries, or timeout
    while (retryCount < maxRetries) {
      try {
        const isConnected = await window.ipcRenderer.invoke(
          'check-internet-connectivity'
        );
        if (isConnected) {
          console.log('Internet connectivity confirmed');
          return; // We're connected, exit the function
        }

        // If we've waited more than maxWaitTime, give up
        if (Date.now() - startTime > maxWaitTime) {
          console.log('Timeout waiting for internet connection');
          break;
        }

        // Exponential backoff delay
        const delay = Math.min(2000 * Math.pow(2, retryCount), 8000);
        console.log(
          `No internet connection detected, retry ${retryCount + 1}/${maxRetries} in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
      } catch (error) {
        console.error('Error checking internet connectivity:', error);

        // If we've waited more than maxWaitTime, give up
        if (Date.now() - startTime > maxWaitTime) {
          console.log('Timeout waiting for internet connection');
          break;
        }

        // Shorter delay on error
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retryCount++;
      }
    }

    // If we get here, we couldn't connect after several attempts
    console.log('Failed to establish internet connection after retries');
    router.push({ name: 'Wifi' });
  } else {
    // Check for periodic checks (non-initial startup)
    try {
      const isConnected = await window.ipcRenderer.invoke(
        'check-internet-connectivity'
      );

      if (isConnected) {
        // We're connected, check if we need to update the saved WiFi name
        try {
          const currentWifiName = await window.ipcRenderer.invoke(
            'get-current-wifi-network'
          );

          if (
            currentWifiName &&
            currentWifiName !== appStore.lastConnectedWifi
          ) {
            console.log(`Connected to a different network: ${currentWifiName}`);
            // Update the stored WiFi network name
            appStore.setLastConnectedWifi(currentWifiName);
          }
        } catch (error) {
          console.error('Error getting current WiFi network:', error);
        }
      } else {
        router.push({ name: 'Wifi' });
      }
    } catch (error) {
      console.error('Error checking internet connectivity:', error);
      // Default to Wifi page if there's an error
      router.push({ name: 'Wifi' });
    }
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
  await checkInternetAndRoute(true);
});
