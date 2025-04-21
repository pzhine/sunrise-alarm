import { createRouter, createWebHashHistory } from 'vue-router';
import { createApp } from 'vue';
import App from './App.vue';
import Wifi from './pages/Wifi.vue';
import WifiPassword from './pages/WifiPassword.vue';
import WifiConnect from './pages/WifiConnect.vue';
import Clock from './pages/Clock.vue';
import { nextTick } from 'vue';

import './style.css';

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
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

const app = createApp(App);
app.use(router);
app.mount('#app');

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

// Perform the check after the app is mounted
nextTick(() => {
  postMessage({ payload: 'removeLoading' }, '*');
  checkInternetAndRoute();
});
