import { createApp } from 'vue'
import App from './App.vue'

import './style.css'

import './demos/ipc'
// import './demos/node'

createApp(App)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })
