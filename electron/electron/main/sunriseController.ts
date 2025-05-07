import { ipcMain, dialog } from 'electron';
import { SunriseStep } from '../../types/state';
import { sendLEDToSerial, getState } from './stateManager';
import sunriseTimelines from '../../assets/sunriseTimelines.json';

// Store for the sunrise playback state
let isPlaying = false;
let playbackTimer: NodeJS.Timeout | null = null;
let currentTimeline: SunriseStep[] = [];
let currentDuration = 600; // Default 10 minutes in seconds
let startTime = 0;

/**
 * Map strip name to numeric ID for Arduino
 * @param stripName The name of the strip (e.g., "SUN_CENTER")
 * @returns The numeric ID for the strip
 */
function mapStripNameToId(stripName: string): number {
  switch (stripName.toUpperCase()) {
    case 'SUN_CENTER':
      return 0;
    case 'SUN_RING':
      return 1;
    case 'LAMP':
      return 2;
    default:
      console.warn(
        `Unknown strip name: ${stripName}, defaulting to SUN_CENTER (0)`
      );
      return 0;
  }
}

/**
 * Scale the timeline to fit the desired duration
 * @param timeline The original timeline
 * @param targetDuration The desired duration in seconds
 * @returns Scaled timeline
 */
function scaleTimeline(
  timeline: SunriseStep[],
  targetDuration: number
): SunriseStep[] {
  if (!timeline || timeline.length === 0) return [];

  // Find the maximum startAt + duration value as the original total duration
  const originalEndTime = Math.max(
    ...timeline.map((step) => step.startAt + step.duration)
  );

  if (originalEndTime <= 0) return timeline; // Prevent division by zero

  // Calculate scale factor
  const scaleFactor = (targetDuration * 1000) / originalEndTime;

  // Scale all time values
  return timeline.map((step) => ({
    ...step,
    startAt: Math.round(step.startAt * scaleFactor),
    duration: Math.round(step.duration * scaleFactor),
  }));
}

/**
 * Play a specific step in the timeline
 * @param step The step to play
 */
function playStep(step: SunriseStep) {
  console.log(
    `[sunriseController] Playing step: strip=${step.strip}, pixel=${step.pixel}, R=${step.red}, G=${step.green}, B=${step.blue}, W=${step.white}, duration=${step.duration}ms`
  );

  // Handle -1 values for color channels that should stay unchanged
  // We need to send the message with the current values instead of -1
  if (
    step.red === -1 ||
    step.green === -1 ||
    step.blue === -1 ||
    step.white === -1
  ) {
    // Just pass through the -1 values, the Arduino code will handle them
    sendLEDToSerial(
      mapStripNameToId(step.strip),
      step.pixel,
      step.red,
      step.green,
      step.blue,
      step.white,
      step.duration
    );
  } else {
    // All values are provided, send them directly
    sendLEDToSerial(
      mapStripNameToId(step.strip),
      step.pixel,
      step.red,
      step.green,
      step.blue,
      step.white,
      step.duration
    );
  }
}

/**
 * Start playing back the sunrise timeline
 * @param timeline The timeline to play
 * @param duration The total duration in seconds
 */
export function startSunrise(timeline: SunriseStep[], duration: number) {
  if (isPlaying) {
    stopSunrise();
  }

  if (!timeline || timeline.length === 0) {
    console.error(
      '[sunriseController] Cannot start sunrise: No timeline provided'
    );
    return;
  }

  console.log(
    `[sunriseController] Starting sunrise, ${timeline.length} steps over ${duration} seconds`
  );

  currentTimeline = scaleTimeline(timeline, duration);
  currentDuration = duration;
  isPlaying = true;
  startTime = Date.now();

  // Schedule each step according to its startAt time
  currentTimeline.forEach((step) => {
    setTimeout(() => {
      if (isPlaying) {
        playStep(step);
      }
    }, step.startAt);
  });

  // // Set a timer to stop the sunrise after the duration has elapsed
  // playbackTimer = setTimeout(
  //   () => {
  //     stopSunrise();
  //   },
  //   duration * 1000 + 1000
  // ); // Add a 1-second buffer
}

/**
 * Stop the sunrise playback
 */
export function stopSunrise() {
  if (!isPlaying) return;

  console.log('[sunriseController] Stopping sunrise');

  isPlaying = false;

  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }

  // Reset all LEDs
  sendLEDToSerial(0, 0, 0, 0, 0, 0, 2000); // SUN_CENTER LED 0
  sendLEDToSerial(0, 1, 0, 0, 0, 0, 2000); // SUN_CENTER LED 1
  sendLEDToSerial(1, 0, 0, 0, 0, 0, 2000); // SUN_RING
  sendLEDToSerial(2, 0, 0, 0, 0, 0, 2000); // LAMP
}

/**
 * Initialize the sunrise controller
 */
export function initSunriseController() {
  ipcMain.handle(
    'start-sunrise',
    async (_, duration: number, timeline: string = 'default') => {
      const timelineInfo = sunriseTimelines.find((t) => t.name === timeline);
      if (!timelineInfo) {
        console.warn('[sunriseController] timeline not found', timeline);
        return false;
      }
      const timelineData = timelineInfo.timeline as SunriseStep[];
      startSunrise(timelineData, duration);
      return true;
    }
  );

  ipcMain.handle('stop-sunrise', async () => {
    stopSunrise();
    return true;
  });

  console.log('[sunriseController] Initialized');
}
