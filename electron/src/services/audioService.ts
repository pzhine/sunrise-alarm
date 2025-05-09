import { AlarmSound } from '../../types/sound';
import { useAppStore } from '../stores/appState';

export interface SoundInfo extends AlarmSound {
  currentTime?: number;
  normalize?: boolean; // Added normalize option
  soundId?: number; // The Freesound ID to fetch analysis data
}

// Global audio element for persistent playback
let globalAudioElement: HTMLAudioElement | null = null;
let currentSoundInfo: SoundInfo | null = null;
let mockVolume = 1; // Default mock volume

// Web Audio API elements for normalization
let audioContext: AudioContext | null = null;
let mediaElementSource: MediaElementAudioSourceNode | null = null;
let compressorNode: DynamicsCompressorNode | null = null;
let gainNode: GainNode | null = null; // Added GainNode for makeup gain

// Cache for normalized gain values to prevent repeated analysis
const normalizedGainCache: Record<string, number> = {};

// Target level for normalization (0.8 = -1.93dBFS)
const TARGET_LEVEL = 0.5;
// Maximum gain to apply during normalization to prevent excessive amplification of very quiet sounds
const MAX_GAIN = 5.0;
// Default gain when analysis data is not available
const DEFAULT_GAIN = 1.0;

// Play a preview of a sound
export function playPreview(previewUrl: string): HTMLAudioElement {
  const audio = new Audio(previewUrl);
  audio.play();
  return audio;
}

// Calculate peak amplitude from audio buffer
function getPeakAmplitude(buffer: AudioBuffer): number {
  // Check all channels for the maximum absolute sample value
  let maxPeak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < channelData.length; i++) {
      const absValue = Math.abs(channelData[i]);
      if (absValue > maxPeak) {
        maxPeak = absValue;
      }
    }
  }
  return maxPeak;
}

// Fetch and analyze audio to determine appropriate gain for normalization
async function calculateNormalizedGain(url: string): Promise<number> {
  try {
    // Check cache first
    if (normalizedGainCache[url] !== undefined) {
      return normalizedGainCache[url];
    }

    // Create AudioContext if it doesn't exist
    if (!audioContext) {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    // Fetch the audio file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    // Get the audio data as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Calculate peak amplitude
    const peakAmplitude = getPeakAmplitude(audioBuffer);

    // Calculate gain needed to bring peak to target level
    // If peak is already above target, reduce it
    let gain = TARGET_LEVEL / peakAmplitude;

    // Cap the maximum gain to prevent excessive amplification of quiet sounds
    gain = Math.min(gain, MAX_GAIN);

    // Store in cache
    normalizedGainCache[url] = gain;

    console.log(
      `Normalized gain for ${url}: ${gain} (peak amplitude: ${peakAmplitude})`
    );
    return gain;
  } catch (error) {
    console.error('Error calculating normalized gain:', error);
    // Return default gain in case of error
    return 1.0;
  }
}

// Calculate appropriate gain based on Freesound Analysis Descriptors
// This uses the sound's analysis data from the Freesound API instead of downloading
// and processing the audio file directly.
async function calculateNormalizedGainFromAPI(
  soundId: number
): Promise<number> {
  try {
    // Check cache first to avoid unnecessary API calls
    if (normalizedGainCache[soundId] !== undefined) {
      return normalizedGainCache[soundId];
    }

    // Fetch analysis data for the sound from Freesound API
    const soundDetails = await window.ipcRenderer.invoke(
      'get-sound-details',
      soundId
    );

    // Extract relevant data for normalization
    const analysis = soundDetails.analysis;
    let gain = DEFAULT_GAIN;

    if (analysis) {
      // Determine the appropriate gain based on available analysis metrics
      // in order of preference: loudness.integrated, loudness.true_peak, average_loudness

      if (analysis.loudness?.integrated !== undefined) {
        // Integrated loudness is in LUFS (typically negative values)
        // Target is around -14 LUFS for web audio (typical streaming target)
        const targetLUFS = -14;
        const currentLUFS = analysis.loudness.integrated;

        // Calculate gain in dB then convert to amplitude ratio
        const gainDB = targetLUFS - currentLUFS;
        gain = Math.pow(10, gainDB / 20);
      } else if (analysis.loudness?.true_peak !== undefined) {
        // True peak is in dBFS (0 dBFS is max, negative values are below)
        const truePeak = analysis.loudness.true_peak;

        // Calculate gain needed to bring peak to target level (-2 dBFS)
        const targetPeak = -2;
        const gainDB = targetPeak - truePeak;
        gain = Math.pow(10, gainDB / 20);
      } else if (analysis.lowlevel?.average_loudness !== undefined) {
        // average_loudness is RMS-like, higher values mean louder sounds
        // Convert to a gain factor by normalizing to target level
        gain = TARGET_LEVEL / analysis.lowlevel.average_loudness;
      }

      // Limit the gain to a reasonable range
      gain = Math.min(Math.max(gain, 0.1), MAX_GAIN);

      // Store in cache
      normalizedGainCache[soundId] = gain;

      console.log(
        `Normalized gain for sound #${soundId}: ${gain} (based on analysis data)`
      );
    } else {
      console.warn(
        `No analysis data available for sound #${soundId}, using default gain`
      );
    }

    return gain;
  } catch (error) {
    console.error(
      `Error calculating normalized gain for sound #${soundId}:`,
      error
    );
    return DEFAULT_GAIN; // Default gain in case of error
  }
}

// Play audio without normalization
function playNonNormalized(soundInfo: SoundInfo): void {
  if (!globalAudioElement) return;

  // Configure volume
  if (
    process.env.NODE_ENV === 'development' &&
    useAppStore().config?.dev.mockSystemAudio
  ) {
    globalAudioElement.volume = mockVolume;
  } else {
    globalAudioElement.volume = 1;
  }

  // Set the current time if provided and valid
  if (soundInfo.currentTime !== undefined) {
    try {
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

  // Loop the sound to keep it playing continuously
  globalAudioElement.loop = true;

  // Start playback
  globalAudioElement.play().catch((err) => {
    console.error('Error playing audio:', err);
  });
}

// Play a sound globally so it persists across component navigation
export async function playGlobalSound(
  soundInfo: SoundInfo,
  normalize: boolean = true
): Promise<void> {
  // Stop any currently playing sound
  if (globalAudioElement) {
    stopGlobalSound();
  }

  // Store sound info
  currentSoundInfo = soundInfo;

  // Create audio element
  globalAudioElement = new Audio();
  globalAudioElement.crossOrigin = 'anonymous'; // Allow cross-origin requests

  // Set up normalization
  if (normalize && soundInfo.soundId) {
    try {
      // Initialize audioContext if needed
      if (!audioContext) {
        audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }

      // Calculate appropriate gain based on sound analysis from Freesound API
      const normalizationGain = await calculateNormalizedGainFromAPI(
        soundInfo.soundId
      );

      // Clean up any existing audio nodes
      if (mediaElementSource) {
        mediaElementSource.disconnect();
        mediaElementSource = null;
      }
      if (compressorNode) {
        compressorNode.disconnect();
        compressorNode = null;
      }
      if (gainNode) {
        gainNode.disconnect();
        gainNode = null;
      }

      // Create and connect Web Audio API nodes
      globalAudioElement.src = soundInfo.previewUrl;
      mediaElementSource =
        audioContext.createMediaElementSource(globalAudioElement);
      compressorNode = audioContext.createDynamicsCompressor();
      gainNode = audioContext.createGain();

      // Configure compressor for dynamic range reduction
      compressorNode.threshold.value = -24; // Start compressing at -24dB
      compressorNode.knee.value = 30; // Smooth knee for natural compression
      compressorNode.ratio.value = 4; // 4:1 compression ratio
      compressorNode.attack.value = 0.003; // Fast but not instantaneous attack
      compressorNode.release.value = 0.25; // Moderate release time

      // Apply calculated gain
      gainNode.gain.value = normalizationGain;

      // Connect audio graph
      mediaElementSource.connect(compressorNode);
      compressorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Play the normalized sound
      playNonNormalized(soundInfo);
    } catch (error) {
      console.error('Error setting up audio normalization:', error);

      // Fall back to non-normalized playback
      if (globalAudioElement) {
        globalAudioElement.src = soundInfo.previewUrl;
        playNonNormalized(soundInfo);
      }
    }
  } else {
    // Play without normalization
    globalAudioElement.src = soundInfo.previewUrl;
    playNonNormalized(soundInfo);
  }
}

// Stop playing the global sound
export function stopGlobalSound(): void {
  if (globalAudioElement) {
    globalAudioElement.pause();
    globalAudioElement.currentTime = 0;

    // Clean up audio element
    globalAudioElement.src = '';
    try {
      globalAudioElement.load(); // This helps release resources
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  // Disconnect Web Audio API nodes if they exist
  if (mediaElementSource) {
    mediaElementSource.disconnect();
    mediaElementSource = null;
  }
  if (compressorNode) {
    compressorNode.disconnect();
    compressorNode = null;
  }
  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }

  globalAudioElement = null;
  currentSoundInfo = null;
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

// Set the volume of the global audio. Normally, this shouldn't be called directly from a page
// or component, but rather through the appState.setVolume method.
export function setGlobalVolume(volume: number): void {
  // console.log('Setting global volume to:', volume);
  const clampedVolume = Math.max(0, Math.min(volume, 1)); // Clamp between 0-1
  if (
    process.env.NODE_ENV === 'development' &&
    useAppStore().config.dev.mockSystemAudio
  ) {
    // console.log('Setting client volume to:', volume);
    mockVolume = clampedVolume;
    if (globalAudioElement) {
      globalAudioElement.volume = clampedVolume;
    }
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
