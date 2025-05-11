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
let parametricEQ: BiquadFilterNode | null = null; // Parametric EQ filter for reducing frequencies around 1.5kHz
let analyserNode: AnalyserNode | null = null; // Analyser for real-time level monitoring
let antiClipNode: GainNode | null = null; // Dynamic gain node to prevent clipping

// Cache for normalized gain values to prevent repeated analysis
const normalizedGainCache: Record<string, number> = {};

// Target level for normalization 
const TARGET_LEVEL = 1.0;
// Maximum gain to apply during normalization to prevent excessive amplification of very quiet sounds
const MAX_GAIN = 3.0;
// Default gain when analysis data is not available
const DEFAULT_GAIN = 1.0;
// Target integrated loudness in LUFS for consistent loudness across tracks
const TARGET_LUFS = -14; // Increased from -16 for louder output
// Target true peak in dBFS
const TARGET_TRUE_PEAK = -2;
// Anti-clipping threshold (values above this will trigger gain reduction)
const CLIP_THRESHOLD = 0.02; // 2% of max amplitude for very aggressive anti-clipping
// Default initial gain for anti-clipping
const DEFAULT_CLIP_GAIN = 0.5; // Conservative gain to prevent initial audio bursts by attenuating the signal
// Initial analysis period uses a stricter threshold to catch bursts early
const INITIAL_CLIP_THRESHOLD = 0.02; // Even lower threshold during initial analysis period (1% of max)
// Size of analyzer buffer for monitoring audio levels
const ANALYZER_FFT_SIZE = 2048; // Increased buffer size for better accuracy
// How quickly we apply gain reduction (in seconds)
const ATTACK_TIME = 0.005; // Ultra fast attack to catch peaks more aggressively 
// Duration of initial analysis period (in milliseconds)
const INITIAL_ANALYSIS_PERIOD = 1000;

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

// Real-time audio analysis to prevent clipping
function setupAntiClipAnalyzer(): void {
  if (!audioContext || !analyserNode || !antiClipNode) return;
  
  // Create buffer for analyzer data
  const bufferLength = analyserNode.frequencyBinCount;
  
  // Use requestAnimationFrame to continuously monitor audio levels
  // Keep track of the lowest gain we've applied - initialize with the current gain value
  let lowestGainApplied = antiClipNode.gain.value;
  
  // Track if we're in the initial analysis period
  let isInitialAnalysisPeriod = true;
  let initialAnalysisEndTime = Date.now() + INITIAL_ANALYSIS_PERIOD;
  
  console.log(`Initial anti-clip gain set to ${lowestGainApplied.toFixed(3)}. Analyzing audio stream for optimal levels...`);
  
  // Constants for transient detection
  const TRANSIENT_IGNORE_FRAMES = 3;  // Number of consecutive frames above threshold to consider it's not a transient
  const TRANSIENT_LOOKBACK_WINDOW = 10; // Keep track of recent amplitudes to distinguish patterns
  
  // Circular buffer to store recent peak amplitudes
  const recentPeaks = new Array(TRANSIENT_LOOKBACK_WINDOW).fill(0);
  let peakIndex = 0;
  let consecutiveFramesAboveThreshold = 0;
  
  const analyzeAudio = () => {
    if (!audioContext || !analyserNode || !antiClipNode || !globalAudioElement) {
      // Clean up if audio context or nodes don't exist anymore
      return;
    }
    
    // Use float data for more precision
    const floatData = new Float32Array(bufferLength);
    analyserNode.getFloatTimeDomainData(floatData);
    
    // Find maximum amplitude in current buffer
    let maxAmplitude = 0;
    for (let i = 0; i < bufferLength; i++) {
      // Float data is already in -1 to 1 range
      const amplitude = Math.abs(floatData[i]);
      if (amplitude > maxAmplitude) {
        maxAmplitude = amplitude;
      }
    }
    
    // Add the current peak to our circular buffer
    recentPeaks[peakIndex] = maxAmplitude;
    peakIndex = (peakIndex + 1) % TRANSIENT_LOOKBACK_WINDOW;
    
    // Calculate the average amplitude over the lookback window
    // This helps distinguish transient pops from sustained high levels
    const avgAmplitude = recentPeaks.reduce((sum, val) => sum + val, 0) / TRANSIENT_LOOKBACK_WINDOW;
    
    // Track how many consecutive frames are above threshold
    if (maxAmplitude > CLIP_THRESHOLD) {
      consecutiveFramesAboveThreshold++;
    } else {
      consecutiveFramesAboveThreshold = 0;
    }
    
    // Only log periodically or during initial analysis to avoid console spam
    // if (isInitialAnalysisPeriod || Math.random() < 0.05) { // Log all during initial analysis, then ~5% of frames
    //   console.log(
    //     `${isInitialAnalysisPeriod ? '[INITIAL] ' : ''}Peak: ${maxAmplitude.toFixed(3)}, Avg: ${avgAmplitude.toFixed(3)}, ` +
    //     `Threshold: ${isInitialAnalysisPeriod ? INITIAL_CLIP_THRESHOLD.toFixed(3) : CLIP_THRESHOLD.toFixed(3)}, ` +
    //     `Current gain: ${antiClipNode.gain.value.toFixed(3)}`
    //   );
    // }
    
    // If we're in the initial analysis period, be more aggressive with gain reduction
    const activeThreshold = isInitialAnalysisPeriod ? INITIAL_CLIP_THRESHOLD : CLIP_THRESHOLD;
    const thresholdMultiplier = isInitialAnalysisPeriod ? 0.5 : 0.7; // More sensitive during initial analysis
    const framesToConsider = isInitialAnalysisPeriod ? 1 : TRANSIENT_IGNORE_FRAMES; // React faster initially
    const safetyMargin = isInitialAnalysisPeriod ? 0.8 : 0.9; // More aggressive reduction initially
    
    // Check if we're still in the initial analysis period
    if (isInitialAnalysisPeriod && Date.now() >= initialAnalysisEndTime) {
      isInitialAnalysisPeriod = false;
      console.log(`Initial analysis complete - gain set to ${antiClipNode.gain.value.toFixed(3)}. Continuing with dynamic monitoring.`);
    }
    
    // If amplitude exceeds threshold for enough consecutive frames AND
    // the average level is relatively high (not just a brief pop)
    if (consecutiveFramesAboveThreshold >= framesToConsider && 
        avgAmplitude > (activeThreshold * thresholdMultiplier)) {
      
      // Calculate how much to reduce by - the closer to 1.0, the more we reduce
      const reductionFactor = (activeThreshold / maxAmplitude) * safetyMargin;
      
      // Only apply new gain if it's lower than the current lowest gain
      // This ensures we always keep the most aggressive reduction without ever releasing
      if (reductionFactor < lowestGainApplied) {
        lowestGainApplied = reductionFactor;
        
        // Apply gain reduction immediately with a very short ramp time
        const currentTime = audioContext.currentTime;
        antiClipNode.gain.cancelScheduledValues(currentTime);
        antiClipNode.gain.setValueAtTime(antiClipNode.gain.value, currentTime);
        antiClipNode.gain.linearRampToValueAtTime(reductionFactor, currentTime + ATTACK_TIME);
        
        // console.log(
        //   `Anti-clip ACTIVE: Reducing gain to ${reductionFactor.toFixed(3)} ` +
        //   `(peak: ${maxAmplitude.toFixed(3)}, avg: ${avgAmplitude.toFixed(3)}, ` +
        //   `${isInitialAnalysisPeriod ? 'initial analysis' : 'not a transient'})`
        // );
      }
    }
    // We never release the gain - it stays at the lowest level needed to prevent clipping
    
    // Continue analyzing while audio is playing
    requestAnimationFrame(analyzeAudio);
  };
  
  // Start the analysis loop
  analyzeAudio();
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

      if (
        analysis.loudness?.integrated !== undefined &&
        analysis.loudness?.integrated !== null
      ) {
        // Integrated loudness is in LUFS (typically negative values)
        const currentLUFS = analysis.loudness.integrated;

        // Calculate gain in dB then convert to amplitude ratio
        const gainDB = TARGET_LUFS - currentLUFS;
        gain = Math.pow(10, gainDB / 20);

        console.log(
          `Sound #${soundId}: Current LUFS: ${currentLUFS}, Target: ${TARGET_LUFS}, Gain: ${gain}`
        );
      } else if (
        analysis.loudness?.true_peak !== undefined &&
        analysis.loudness?.true_peak !== null
      ) {
        // True peak is in dBFS (0 dBFS is max, negative values are below)
        const truePeak = analysis.loudness.true_peak;

        // Calculate gain needed to bring peak to target level
        const gainDB = TARGET_TRUE_PEAK - truePeak;
        gain = Math.pow(10, gainDB / 20);

        console.log(
          `Sound #${soundId}: Current True Peak: ${truePeak}, Target: ${TARGET_TRUE_PEAK}, Gain: ${gain}`
        );
      } else if (analysis.lowlevel?.average_loudness) {
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

// No longer needed - we're using a delay and real-time analysis approach instead

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

  // Start audio streaming but delay audible playback to allow the analyzer to calibrate
  // Instead of using mute, set volume to 0 and gradually fade in for smoother transition
  const originalVolume = globalAudioElement.volume;
  globalAudioElement.volume = 0;
  
  globalAudioElement.play().then(() => {
    console.log(`Audio stream started (silent) - analyzing levels for ${INITIAL_ANALYSIS_PERIOD/1000} second(s)...`);
    
    // After the initial analysis period, fade in the audio
    setTimeout(() => {
      if (globalAudioElement && audioContext) {
        // Gradually increase volume over 200ms for smooth fade-in
        const fadeInDuration = 200; // milliseconds
        const fadeSteps = 10;
        const fadeInterval = fadeInDuration / fadeSteps;
        let currentStep = 0;
        
        const fadeIn = () => {
          if (!globalAudioElement) return;
          currentStep++;
          const progress = currentStep / fadeSteps;
          globalAudioElement.volume = progress * originalVolume;
          
          if (currentStep < fadeSteps) {
            setTimeout(fadeIn, fadeInterval);
          } else {
            console.log('Initial analysis complete - audio now playing at adjusted levels');
          }
        };
        
        // Start the fade-in
        fadeIn();
      }
    }, INITIAL_ANALYSIS_PERIOD);
  }).catch((err) => {
    console.error('Error starting audio stream:', err);
  });
}

// Reset the anti-clip gain node when stopping playback or changing audio
// We're not actually resetting to the default value, just cleaning up scheduled values
function resetAntiClipGain(): void {
  if (antiClipNode && audioContext) {
    const currentGain = antiClipNode.gain.value;
    antiClipNode.gain.cancelScheduledValues(audioContext.currentTime);
    antiClipNode.gain.setValueAtTime(currentGain, audioContext.currentTime);
    console.log(`Anti-clip scheduled values cleared (maintaining current gain: ${currentGain.toFixed(3)})`);
  }
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
      
      // Start with a conservative gain setting until the analyzer has had time to assess the levels
      // We'll use DEFAULT_CLIP_GAIN as our initial value
      const initialAntiClipGain = DEFAULT_CLIP_GAIN;

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
      if (parametricEQ) {
        parametricEQ.disconnect();
        parametricEQ = null;
      }
      if (analyserNode) {
        analyserNode.disconnect();
        analyserNode = null;
      }
      if (antiClipNode) {
        antiClipNode.disconnect();
        antiClipNode = null;
      }

      // Create and connect Web Audio API nodes
      globalAudioElement.src = soundInfo.previewUrl;
      mediaElementSource =
        audioContext.createMediaElementSource(globalAudioElement);

      // Always create gain node for normalization
      gainNode = audioContext.createGain();
      gainNode.gain.value = normalizationGain;

      // Create parametric EQ filter to reduce frequencies around 1.5kHz
      parametricEQ = audioContext.createBiquadFilter();
      parametricEQ.type = 'peaking';
      parametricEQ.frequency.value = 1500; // Center frequency for reduction (1.5kHz)
      parametricEQ.Q.value = 1; // Quality factor for the filter

      // Use highFreqReduction directly if provided, or use eqSettings.highShelfGain, or default to -6dB
      const highShelfGain =
        soundInfo.highFreqReduction !== undefined
          ? Number(soundInfo.highFreqReduction)
          : (soundInfo.eqSettings?.highShelfGain ?? -6);

      parametricEQ.gain.value = highShelfGain; // Apply gain reduction

      // Create anti-clip node first in the chain with the pre-analyzed gain value
      antiClipNode = audioContext.createGain();
      antiClipNode.gain.value = initialAntiClipGain; // Start with pre-analyzed gain value
      
      // Create analyzer node for real-time level monitoring
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = ANALYZER_FFT_SIZE;
      analyserNode.smoothingTimeConstant = 0.1; // Faster response to changes
      
      console.log(
        `Sound #${soundInfo.soundId}: Frequency reduction: ${highShelfGain}dB at ${parametricEQ.frequency.value}Hz, Anti-clipping enabled (threshold: ${CLIP_THRESHOLD})`
      );

      // Connect nodes in the audio processing chain:
      // Source -> Analyzer (to monitor input) -> Gain (normalization) -> Anti-clip -> Parametric EQ -> Output
      mediaElementSource.connect(analyserNode);
      analyserNode.connect(gainNode);
      gainNode.connect(antiClipNode);
      antiClipNode.connect(parametricEQ);
      parametricEQ.connect(audioContext.destination);

      // Set up the anti-clipping analyzer to continuously monitor audio levels
      setupAntiClipAnalyzer();

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
    try {
      // Even for non-normalized playback, apply anti-clipping with a delay
      if (!audioContext) {
        audioContext = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      
      // Use a conservative initial gain value
      const initialAntiClipGain = DEFAULT_CLIP_GAIN;
      
      // Create basic audio graph for anti-clipping only
      globalAudioElement.src = soundInfo.previewUrl;
      mediaElementSource = audioContext.createMediaElementSource(globalAudioElement);
      
      // Create anti-clip node
      antiClipNode = audioContext.createGain();
      antiClipNode.gain.value = initialAntiClipGain;
      
      // Connect the nodes
      mediaElementSource.connect(antiClipNode);
      antiClipNode.connect(audioContext.destination);
      
      // Set up monitoring
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = ANALYZER_FFT_SIZE;
      mediaElementSource.connect(analyserNode);
      
      // Set up the anti-clipping analyzer
      setupAntiClipAnalyzer();
      
      // Play the audio
      playNonNormalized(soundInfo);
    } catch (error) {
      console.error('Error setting up basic anti-clipping:', error);
      
      // Fall back to direct playback if analysis fails
      globalAudioElement.src = soundInfo.previewUrl;
      playNonNormalized(soundInfo);
    }
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
  
  // Reset anti-clip gain before disconnecting
  resetAntiClipGain();

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
  if (parametricEQ) {
    parametricEQ.disconnect();
    parametricEQ = null;
  }
  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }
  if (antiClipNode) {
    antiClipNode.disconnect();
    antiClipNode = null;
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

// Update the center frequency of the parametric EQ
export function updateParametricEQFrequency(frequency: number): void {
  if (parametricEQ && audioContext) {
    parametricEQ.frequency.value = frequency;
    console.log(`Updated parametric EQ center frequency to: ${frequency} Hz`);
  }
}

// Stop playing a preview
export function stopPreview(audio: HTMLAudioElement): void {
  audio.pause();
  audio.currentTime = 0;
}
