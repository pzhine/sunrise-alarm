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

// Two-tone notification sounds using Web Audio API
const playTwoToneNotification = async (type: 'connection' | 'disconnection' | 'pairing'): Promise<void> => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    if (type === 'connection') {
      // Connection: low tone followed by high tone
      await playTone(audioContext, 400, 0.15); // Low tone - 400Hz for 150ms
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms gap
      await playTone(audioContext, 800, 0.15); // High tone - 800Hz for 150ms
    } else if (type === 'disconnection') {
      // Disconnection: high tone followed by low tone  
      await playTone(audioContext, 800, 0.15); // High tone - 800Hz for 150ms
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms gap
      await playTone(audioContext, 400, 0.15); // Low tone - 400Hz for 150ms
    } else if (type === 'pairing') {
      // Pairing: three ascending tones
      await playTone(audioContext, 400, 0.12); // Low
      await new Promise(resolve => setTimeout(resolve, 40));
      await playTone(audioContext, 600, 0.12); // Medium
      await new Promise(resolve => setTimeout(resolve, 40));
      await playTone(audioContext, 800, 0.12); // High
    }
    
    console.log(`🔊 Played ${type} two-tone notification`);
  } catch (error) {
    console.warn(`Failed to play ${type} notification:`, error);
    // Fallback to system beep
    playSystemBeep(type);
  }
};

// Helper function to play a single tone
const playTone = (audioContext: AudioContext, frequency: number, duration: number): Promise<void> => {
  return new Promise((resolve) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';
    
    // Smooth envelope to avoid clicks
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + duration - 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
    
    oscillator.onended = () => {
      resolve();
    };
  });
};

// Fallback system beep using different patterns
const playSystemBeep = (type: 'connection' | 'disconnection' | 'pairing') => {
  const beep = (frequency: number, duration: number) => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration / 1000);
      
      console.log(`Played system beep for ${type}`);
    } catch (error) {
      console.warn('System beep fallback failed:', error);
    }
  };
  
  if (type === 'connection') {
    beep(400, 150);
    setTimeout(() => beep(800, 150), 200);
  } else if (type === 'disconnection') {
    beep(800, 150);
    setTimeout(() => beep(400, 150), 200);
  } else if (type === 'pairing') {
    beep(600, 200);
  }
};

// Handle device connection events
const handleDeviceConnected = (device: any) => {
  console.log('🔵 Bluetooth device connected:', device.name);
  playTwoToneNotification('connection');
};

// Handle device disconnection events
const handleDeviceDisconnected = (device: any) => {
  console.log('🔴 Bluetooth device disconnected:', device.name);
  playTwoToneNotification('disconnection');
};

// Handle device pairing events  
const handleDevicePaired = (device: any) => {
  console.log('🔗 Bluetooth device paired:', device.name);
  playTwoToneNotification('pairing');
};

// Component lifecycle
onMounted(() => {
  console.log('📱 Bluetooth notifications initialized with two-tone patterns');
  
  // Listen for Bluetooth events
  if ((window as any).electronAPI?.bluetoothPairing) {
    const api = (window as any).electronAPI.bluetoothPairing;
    
    api.onDeviceConnected?.(handleDeviceConnected);
    api.onDeviceDisconnected?.(handleDeviceDisconnected);
    api.onDevicePaired?.(handleDevicePaired);
  }
});

onBeforeUnmount(() => {
  console.log('📱 Bluetooth notifications cleanup');
  // No audio cleanup needed since we use Web Audio API directly
});
</script>