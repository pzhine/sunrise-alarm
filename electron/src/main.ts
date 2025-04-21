import { createRouter, createWebHashHistory } from 'vue-router';
import { createApp } from 'vue';
import App from './App.vue';
import Wifi from './pages/Wifi.vue';
import WifiPassword from './pages/WifiPassword.vue';
import WifiConnect from './pages/WifiConnect.vue';
import { nextTick } from 'vue';

import './style.css'

import './demos/ipc'
// import './demos/node'

const routes = [
  { path: '/', component: Wifi },
  { path: '/wifi-password/:networkName', name: 'WifiPassword', component: WifiPassword },
  { path: '/wifi-connect/:networkName/:password', name: 'WifiConnect', component: WifiConnect },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

const app = createApp(App);
app.use(router);
app.mount('#app');


nextTick(() => {
  postMessage({ payload: 'removeLoading' }, '*')
});
