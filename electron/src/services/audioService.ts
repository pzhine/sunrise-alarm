import { AlarmSound } from '../../types/sound';

export interface SoundInfo extends AlarmSound {
  currentTime?: number;
}

// Global audio element for persistent playback
let globalAudioElement: HTMLAudioElement | null = null;
let currentSoundInfo: SoundInfo | null = null;

// Play a preview of a sound
export function playPreview(previewUrl: string): HTMLAudioElement {
  const audio = new Audio(previewUrl);
  audio.play();
  return audio;
}

// Play a sound globally so it persists across component navigation
export function playGlobalSound(soundInfo: SoundInfo): void {
  // Stop any currently playing sound
  if (globalAudioElement) {
    stopGlobalSound();
  }

  // Create and play new audio
  globalAudioElement = new Audio(soundInfo.previewUrl);
  globalAudioElement.volume = 1; // Set default volume to 100%

  // Set the current time if provided and valid
  if (soundInfo.currentTime !== undefined) {
    try {
      // Validate that currentTime is a proper number and within bounds
      const time = Number(soundInfo.currentTime);
      if (!isNaN(time) && isFinite(time) && time >= 0) {
        globalAudioElement.currentTime = time;
      } else {
        console.warn(
          'Invalid currentTime provided to playGlobalSound:',
          soundInfo.currentTime
        );
      }
    } catch (error) {
      console.error('Error setting currentTime:', error);
    }
  }

  // Store sound info
  currentSoundInfo = soundInfo;

  // Start playback
  globalAudioElement.play().catch((err) => {
    console.error('Error playing audio:', err);
  });

  // Loop the sound to keep it playing continuously
  globalAudioElement.loop = true;
}

// Stop playing the global sound
export function stopGlobalSound(): void {
  if (globalAudioElement) {
    globalAudioElement.pause();
    globalAudioElement.currentTime = 0;
    globalAudioElement = null;
    currentSoundInfo = null;
  }
}

// Check if a sound is currently playing
export function isGlobalSoundPlaying(): boolean {
  return globalAudioElement !== null;
}

// Get current playing sound info
export function getCurrentSoundInfo(): SoundInfo | null {
  if (!globalAudioElement || !currentSoundInfo) {
    return null;
  }

  // Update the current time
  return {
    ...currentSoundInfo,
    currentTime: globalAudioElement.currentTime,
  };
}

// Set the volume of the global audio
export function setGlobalVolume(volume: number): void {
  const clampedVolume = Math.max(0, Math.min(volume, 1)); // Clamp between 0-1
  if (globalAudioElement && process.env.NODE_ENV === 'development') {
    console.log('Setting client volume to:', volume);
    globalAudioElement.volume = clampedVolume;
    return;
  }
  // Update the system volume using general invoke method
  window.ipcRenderer
    .invoke('set-system-volume', clampedVolume * 100)
    .catch((error) => {
      console.error('Failed to set system volume:', error);
    });
}

// Stop playing a preview
export function stopPreview(audio: HTMLAudioElement): void {
  audio.pause();
  audio.currentTime = 0;
}
