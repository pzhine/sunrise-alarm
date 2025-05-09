import { AlarmSound } from '../../types/sound';
import { useAppStore } from '../stores/appState';

export interface SoundInfo extends AlarmSound {
  currentTime?: number;
  normalize?: boolean; // Added normalize option
  soundId?: number; // The Freesound ID to fetch analysis data
  useCompressor?: boolean; // Whether to apply Web Audio API compression
  highFreqReduction?: number; // Direct control of high frequency reduction in dB
  eqSettings?: {
    highShelfFrequency?: number; // Frequency above which to reduce gain (default 3000Hz)
    highShelfGain?: number; // Gain reduction in dB for high frequencies (default -6dB)
  }; // EQ settings for frequency response adjustment
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
let highShelfFilter: BiquadFilterNode | null = null; // High shelf filter for reducing high frequencies
let limiterNode: DynamicsCompressorNode | null = null; // Limiter to control peak loudness

// Cache for normalized gain values to prevent repeated analysis
const normalizedGainCache: Record<string, number> = {};

// Target level for normalization (0.8 = -1.93dBFS)
const TARGET_LEVEL = 0.5;
// Maximum gain to apply during normalization to prevent excessive amplification of very quiet sounds
const MAX_GAIN = 5.0;
// Default gain when analysis data is not available
const DEFAULT_GAIN = 1.0;
// Target integrated loudness in LUFS for consistent loudness across tracks
const TARGET_LUFS = -14; // Increased from -16 for louder output
// Target true peak in dBFS
const TARGET_TRUE_PEAK = -2;

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
        const currentLUFS = analysis.loudness.integrated;

        // Calculate gain in dB then convert to amplitude ratio
        const gainDB = TARGET_LUFS - currentLUFS;
        gain = Math.pow(10, gainDB / 20);

        console.log(
          `Sound #${soundId}: Current LUFS: ${currentLUFS}, Target: ${TARGET_LUFS}, Gain: ${gain}`
        );
      } else if (analysis.loudness?.true_peak !== undefined) {
        // True peak is in dBFS (0 dBFS is max, negative values are below)
        const truePeak = analysis.loudness.true_peak;

        // Calculate gain needed to bring peak to target level
        const gainDB = TARGET_TRUE_PEAK - truePeak;
        gain = Math.pow(10, gainDB / 20);

        console.log(
          `Sound #${soundId}: Current True Peak: ${truePeak}, Target: ${TARGET_TRUE_PEAK}, Gain: ${gain}`
        );
      } else if (analysis.lowlevel?.average_loudness !== undefined) {
        // average_loudness is RMS-like, higher values mean louder sounds
        const avgLoudness = analysis.lowlevel.average_loudness;

        // Convert to a gain factor by normalizing to target level
        gain = TARGET_LEVEL / avgLoudness;

        console.log(
          `Sound #${soundId}: Average Loudness: ${avgLoudness}, Target Level: ${TARGET_LEVEL}, Gain: ${gain}`
        );
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
      if (highShelfFilter) {
        highShelfFilter.disconnect();
        highShelfFilter = null;
      }
      if (limiterNode) {
        limiterNode.disconnect();
        limiterNode = null;
      }

      // Create and connect Web Audio API nodes
      globalAudioElement.src = soundInfo.previewUrl;
      mediaElementSource =
        audioContext.createMediaElementSource(globalAudioElement);

      // Check if compression should be applied (default to false)
      const useCompressor = soundInfo.useCompressor ?? false;
      console.log(
        `Sound #${soundInfo.soundId}: Compression ${useCompressor ? 'enabled' : 'disabled'}`
      );

      // Always create gain node for normalization
      gainNode = audioContext.createGain();
      gainNode.gain.value = normalizationGain;

      // Create high shelf filter to reduce high frequencies
      highShelfFilter = audioContext.createBiquadFilter();
      highShelfFilter.type = 'highshelf';
      highShelfFilter.frequency.value = 3200; // Frequency above which to reduce gain (3kHz)

      // Use highFreqReduction directly if provided, or use eqSettings.highShelfGain, or default to -6dB
      const highShelfGain =
        soundInfo.highFreqReduction !== undefined
          ? Number(soundInfo.highFreqReduction)
          : (soundInfo.eqSettings?.highShelfGain ?? -6);

      highShelfFilter.gain.value = highShelfGain; // Apply gain reduction

      console.log(
        `Sound #${soundInfo.soundId}: High frequency reduction: ${highShelfGain}dB at ${highShelfFilter.frequency.value}Hz`
      );

      if (useCompressor) {
        // Create and configure compressor if enabled
        compressorNode = audioContext.createDynamicsCompressor();
        compressorNode.threshold.value = -24; // Start compressing at -24dB
        compressorNode.knee.value = 30; // Smooth knee for natural compression
        compressorNode.ratio.value = 4; // 4:1 compression ratio
        compressorNode.attack.value = 0.003; // Fast but not instantaneous attack
        compressorNode.release.value = 0.25; // Moderate release time

        // Connect with compressor in the chain
        mediaElementSource.connect(compressorNode);
        compressorNode.connect(gainNode);
      } else {
        // Connect without compressor - direct to gain node
        mediaElementSource.connect(gainNode);
      }

      // Connect gain node to high shelf filter
      gainNode.connect(highShelfFilter);

      // Create and configure limiter
      limiterNode = audioContext.createDynamicsCompressor();
      limiterNode.threshold.value = -1.5; // Limit peaks above -1.5dB
      limiterNode.knee.value = 0; // Hard knee for strict limiting
      limiterNode.ratio.value = 20; // High ratio for true limiting behavior
      limiterNode.attack.value = 0.001; // Very fast attack to catch transients
      limiterNode.release.value = 0.1; // Quick release for transparent limiting

      console.log(
        `Sound #${soundInfo.soundId}: Peak limiter enabled at ${limiterNode.threshold.value}dB threshold`
      );

      // Connect high shelf filter to limiter
      highShelfFilter.connect(limiterNode);

      // Final connection to output
      limiterNode.connect(audioContext.destination);

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
  if (highShelfFilter) {
    highShelfFilter.disconnect();
    highShelfFilter = null;
  }
  if (limiterNode) {
    limiterNode.disconnect();
    limiterNode = null;
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
