# Bluetooth Media Integration Example Usage

This document shows how to integrate the Bluetooth media functionality into your existing Sunrise Alarm application.

## 1. Update Main Process (electron/main/index.ts)

```typescript
import { setupBluetoothMediaHandlers } from './bluetoothMediaHandlers';

// In your main window creation function:
export async function createWindow() {
  // ... existing window creation code ...

  // Set up Bluetooth media handlers
  setupBluetoothMediaHandlers(mainWindow);
  
  // ... rest of your code ...
}
```

## 2. Update Preload Script (electron/preload/index.ts)

```typescript
// Add the Bluetooth media API to your existing preload
import './bluetoothMediaAPI';

// Or if you prefer to keep it all in one file, copy the content from 
// bluetoothMediaAPI.ts into your main preload/index.ts file
```

## 3. Add to a Page Component

You can add the Bluetooth media player to any of your existing pages. For example, in `MainMenu.vue`:

```vue
<template>
  <div class="main-menu">
    <!-- Existing menu content -->
    
    <!-- Add Bluetooth Media Player -->
    <BluetoothMediaPlayer />
    
    <!-- Rest of your menu -->
  </div>
</template>

<script lang="ts">
import BluetoothMediaPlayer from '../components/BluetoothMediaPlayer.vue';

export default defineComponent({
  name: 'MainMenu',
  components: {
    BluetoothMediaPlayer,
    // ... other components
  },
  // ... rest of component
});
</script>
```

## 4. Or Create a Dedicated Music Page

Create a new page specifically for music control:

```vue
<template>
  <div class="music-page">
    <div class="header">
      <button @click="$router.back()" class="back-btn">← Back</button>
      <h1>Music Player</h1>
    </div>
    
    <BluetoothMediaPlayer />
    
    <div class="additional-controls">
      <!-- Add any additional sunrise alarm specific controls -->
      <button @click="setMusicAsAlarm">Use Current Song for Alarm</button>
      <button @click="fadeVolume">Start Fade Wake-up</button>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import BluetoothMediaPlayer from '../components/BluetoothMediaPlayer.vue';

export default defineComponent({
  name: 'MusicPage',
  components: {
    BluetoothMediaPlayer
  },
  methods: {
    setMusicAsAlarm() {
      // Integration with your alarm system
      console.log('Setting current music as alarm...');
    },
    
    fadeVolume() {
      // Integration with your sunrise wake-up sequence
      console.log('Starting fade wake-up...');
    }
  }
});
</script>

<style scoped>
.music-page {
  padding: 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px;
  color: white;
}

.back-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.additional-controls {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.additional-controls button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s ease;
}

.additional-controls button:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
```

## 5. Integration with Sunrise Controller

You can also integrate the Bluetooth media with your existing sunrise controller. Add this to `electron/main/sunriseController.ts`:

```typescript
import { bluetoothMediaService } from './bluetoothMediaService';

export class SunriseController {
  // ... existing code ...

  async startWakeUpSequence() {
    // ... existing wake up code ...
    
    // Optionally start playing music during sunrise
    const metadata = await bluetoothMediaService.getMetadata();
    if (metadata && metadata.status === 'paused') {
      console.log('Starting music playback for wake-up sequence');
      await bluetoothMediaService.play();
    }
    
    // ... rest of wake up sequence ...
  }

  async startSleepSequence() {
    // ... existing sleep sequence ...
    
    // Gradually fade music volume or pause
    const metadata = await bluetoothMediaService.getMetadata();
    if (metadata && metadata.status === 'playing') {
      console.log('Pausing music for sleep sequence');
      await bluetoothMediaService.pause();
    }
  }
}
```

## 6. Add Route (if creating dedicated page)

Add to your router configuration:

```typescript
const routes = [
  // ... existing routes ...
  {
    path: '/music',
    name: 'Music',
    component: () => import('../pages/MusicPage.vue')
  }
];
```

## 7. Testing the Integration

After setting up both scripts on your Raspberry Pi:

1. Run the basic Bluetooth speaker setup:
   ```bash
   sudo ./setup_bluetooth_speaker.sh
   ```

2. Run the advanced media controller setup:
   ```bash
   sudo ./setup_bluetooth_media_controller.sh
   ```

3. Reboot the Pi:
   ```bash
   sudo reboot
   ```

4. Connect your phone to "SunriseAlarm-Speaker"

5. Start playing music on your phone

6. Your Electron app should now show the current track information and allow you to control playback

## Available Events and Methods

The Bluetooth media service provides these events you can listen to:

- `trackChanged`: New song started playing
- `statusChanged`: Playback status changed (playing/paused/stopped)
- `positionChanged`: Track position updated
- `metadataUpdated`: Any metadata changed
- `connectionChanged`: Bluetooth service connection status
- `error`: Error occurred

And these control methods:

- `play()`: Start playback
- `pause()`: Pause playback
- `stop()`: Stop playback
- `next()`: Skip to next track
- `previous()`: Go to previous track
- `togglePlayPause()`: Toggle between play and pause
- `getMetadata()`: Get current track information
- `getConnectionState()`: Get connection status

This integration allows your sunrise alarm to become a full-featured Bluetooth speaker with visual feedback and media controls!