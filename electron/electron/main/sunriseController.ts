import { ipcMain, dialog } from 'electron';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { SunriseStep } from '../../types/state';
import { sendLEDToSerial, getState } from './stateManager';

const DEFAULT_TIMELINE_PATH = path.join(
  app.getPath('userData'), 'sunrise-data', 'default.json'
);

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
      console.warn(`Unknown strip name: ${stripName}, defaulting to SUN_CENTER (0)`);
      return 0;
  }
}

/**
 * Load a timeline from a JSON file
 * @param filePath Path to the JSON file
 * @returns Array of SunriseStep objects
 */
function loadTimelineFromFile(filePath: string): SunriseStep[] {
  try {
    const fileData = fs.readFileSync(filePath, 'utf8');
    const timeline = JSON.parse(fileData);
    
    if (!Array.isArray(timeline)) {
      throw new Error('Timeline data is not an array');
    }
    
    return timeline;
  } catch (error) {
    console.error('Error loading timeline:', error);
    return [];
  }
}

/**
 * Scale the timeline to fit the desired duration
 * @param timeline The original timeline
 * @param targetDuration The desired duration in seconds
 * @returns Scaled timeline
 */
function scaleTimeline(timeline: SunriseStep[], targetDuration: number): SunriseStep[] {
  if (!timeline || timeline.length === 0) return [];
  
  // Find the maximum startAt + duration value as the original total duration
  const originalEndTime = Math.max(...timeline.map(step => step.startAt + step.duration));
  
  if (originalEndTime <= 0) return timeline; // Prevent division by zero
  
  // Calculate scale factor
  const scaleFactor = (targetDuration * 1000) / originalEndTime;
  
  // Scale all time values
  return timeline.map(step => ({
    ...step,
    startAt: Math.round(step.startAt * scaleFactor),
    duration: Math.round(step.duration * scaleFactor)
  }));
}

/**
 * Play a specific step in the timeline
 * @param step The step to play
 */
function playStep(step: SunriseStep) {
  console.log(`[sunriseController] Playing step: strip=${step.strip}, pixel=${step.pixel}, R=${step.red}, G=${step.green}, B=${step.blue}, W=${step.white}, duration=${step.duration}ms`);
  
  // Handle -1 values for color channels that should stay unchanged
  // We need to send the message with the current values instead of -1
  if (step.red === -1 || step.green === -1 || step.blue === -1 || step.white === -1) {
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
    console.error('[sunriseController] Cannot start sunrise: No timeline provided');
    return;
  }
  
  console.log(`[sunriseController] Starting sunrise, ${timeline.length} steps over ${duration} seconds`);
  
  currentTimeline = scaleTimeline(timeline, duration);
  currentDuration = duration;
  isPlaying = true;
  startTime = Date.now();
  
  // Schedule each step according to its startAt time
  currentTimeline.forEach(step => {
    setTimeout(() => {
      if (isPlaying) {
        playStep(step);
      }
    }, step.startAt);
  });
  
  // Set a timer to stop the sunrise after the duration has elapsed
  playbackTimer = setTimeout(() => {
    stopSunrise();
  }, duration * 1000 + 1000); // Add a 1-second buffer
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
  sendLEDToSerial(0, 0, 0, 0, 0, 0, 0); // SUN_CENTER LED 0
  sendLEDToSerial(0, 1, 0, 0, 0, 0, 0); // SUN_CENTER LED 1
  sendLEDToSerial(1, 0, 0, 0, 0, 0, 0); // SUN_RING
  sendLEDToSerial(2, 0, 0, 0, 0, 0, 0); // LAMP
}

/**
 * Initialize the sunrise controller
 */
export function initSunriseController() {
  if (!fs.existsSync(DEFAULT_TIMELINE_PATH)) {
    // Create the default timeline directory if it doesn't exist
    fs.mkdirSync(path.dirname(DEFAULT_TIMELINE_PATH), { recursive: true });
    // copy example json if it exists
    const examplePath = path.join(app.getAppPath(), 'sunrise.example.json');
    if (fs.existsSync(examplePath)) { 
      fs.copyFileSync(examplePath, DEFAULT_TIMELINE_PATH);
    } else {
      throw new Error('Default timeline file not found and example file not available');
    }
  }
  // Register IPC handlers
  ipcMain.handle('load-default-sunrise-timeline', async () => {
    return loadTimelineFromFile(DEFAULT_TIMELINE_PATH);
  });
  
  ipcMain.handle('load-sunrise-timeline', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Sunrise Timeline',
        properties: ['openFile'],
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (canceled || filePaths.length === 0) {
        return { success: false, message: 'File selection cancelled' };
      }
      
      const timeline = loadTimelineFromFile(filePaths[0]);
      if (timeline && timeline.length > 0) {
        return { success: true, timeline };
      } else {
        return { success: false, message: 'Invalid timeline data' };
      }
    } catch (error) {
      console.error('Error loading timeline:', error);
      return { success: false, message: 'Error loading timeline file' };
    }
  });
  
  ipcMain.handle('start-sunrise', async (_, timeline: string, duration: number) => {
    const state = getState();
    if (state) {
      state.sunriseActive = true;
    }
    if (timeline != 'default') {
      console.warn('[sunriseController] not implemented yet, using default timeline');
    }

    const timelineData: SunriseStep[] = loadTimelineFromFile(DEFAULT_TIMELINE_PATH);
    
    startSunrise(timelineData, duration);
    return true;
  });
  
  ipcMain.handle('stop-sunrise', async () => {
    const state = getState();
    if (state) {
      state.sunriseActive = false;
    }
    
    stopSunrise();
    return true;
  });
  
  ipcMain.handle('get-sunrise-status', async () => {
    return { 
      isPlaying, 
      elapsed: isPlaying ? (Date.now() - startTime) / 1000 : 0,
      totalDuration: currentDuration 
    };
  });
  
  console.log('[sunriseController] Initialized');
}