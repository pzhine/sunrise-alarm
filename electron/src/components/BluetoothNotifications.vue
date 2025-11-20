<!-- 
  BluetoothNotifications Component
  This component runs in the background and handles Bluetooth connection notification sounds
  It should be added to the root App component
-->
<template>
  <!-- This component has no visual elements, it only handles events -->
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';

// Audio elements for notification sounds
let connectSound: HTMLAudioElement | null = null;
let pairSound: HTMLAudioElement | null = null;

// Initialize notification sounds
const initializeSounds = () => {
  // Create simple notification sounds using Web Audio API
  const createBeepSound = (frequency: number, duration: number): string => {
    // Create a simple base64 encoded WAV file for a beep
    // This is a minimal implementation - in production you might want actual sound files
    const sampleRate = 44100;
    const samples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + samples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples * 2, true);
    
    // Generate sine wave
    for (let i = 0; i < samples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(44 + i * 2, intSample, true);
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };
  
  // Create notification sounds
  const connectSoundUrl = createBeepSound(800, 0.2); // High pitched beep
  const pairSoundUrl = createBeepSound(600, 0.3);    // Lower pitched longer beep
  
  connectSound = new Audio(connectSoundUrl);
  pairSound = new Audio(pairSoundUrl);
  
  // Set volume
  if (connectSound) connectSound.volume = 0.5;
  if (pairSound) pairSound.volume = 0.5;
};

// Play notification sound
const playNotificationSound = async (type: 'connect' | 'pair') => {
  try {
    const sound = type === 'connect' ? connectSound : pairSound;
    if (sound) {
      // Reset audio to beginning in case it was played recently
      sound.currentTime = 0;
      await sound.play();
      console.log(`Played ${type} notification sound`);
    }
  } catch (error) {
    console.warn(`Failed to play ${type} notification sound:`, error);
    // Fallback to system beep
    playSystemBeep(type);
  }
};

// Fallback system beep using different patterns
const playSystemBeep = (type: 'connect' | 'pair') => {
  const beep = () => {
    // Create a brief audio context beep as fallback
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      const frequency = type === 'connect' ? 800 : 600;
      const duration = type === 'connect' ? 100 : 150;
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
      
      console.log(`Played system beep for ${type}`);
    } catch (error) {
      console.warn('System beep fallback failed:', error);
    }
  };
  
  if (type === 'connect') {
    beep(); // Single beep for connect
  } else {
    // Double beep for pair
    beep();
    setTimeout(beep, 200);
  }
};

// Handle device connection events
const handleDeviceConnected = (device: any) => {
  console.log('🔵 Bluetooth device connected:', device.name);
  playNotificationSound('connect');
};

// Handle device pairing events  
const handleDevicePaired = (device: any) => {
  console.log('🔗 Bluetooth device paired:', device.name);
  playNotificationSound('pair');
};

// Component lifecycle
onMounted(() => {
  console.log('📱 Bluetooth notifications initialized');
  
  // Initialize sounds
  initializeSounds();
  
  // Listen for Bluetooth events
  if ((window as any).electronAPI?.bluetoothPairing) {
    const api = (window as any).electronAPI.bluetoothPairing;
    
    api.onDeviceConnected?.(handleDeviceConnected);
    api.onDevicePaired?.(handleDevicePaired);
  }
});

onBeforeUnmount(() => {
  console.log('📱 Bluetooth notifications cleanup');
  
  // Clean up audio objects
  if (connectSound) {
    connectSound.pause();
    connectSound.src = '';
    connectSound = null;
  }
  
  if (pairSound) {
    pairSound.pause();
    pairSound.src = '';
    pairSound = null;
  }
});
</script>