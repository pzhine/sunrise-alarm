import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { AppState } from '../../types/state';
import { sendMessage } from './serial';
import { debounce } from 'lodash-es';

// Define the file path for storing application state
const STATE_FILE_PATH = path.join(app.getPath('userData'), 'app-state.json');

// State cache to avoid unnecessary file reads
let stateCache: AppState | null = null;

// Constants for lamp brightness control
const LAMP_BRIGHTNESS_DEBOUNCE_DELAY = 100; // ms
const LAMP_BRIGHTNESS_TRANSITION_TIME = 300; // ms
// Strip identifiers matching Arduino constants
const STRIP_LAMP = 2;
const STRIP_SUN_CENTER = 0;
const STRIP_SUN_RING = 1;
const PROJECTOR_TRANSITION_TIME = 100; // ms

/**
 * Get current application state
 * @returns The current application state
 */
export function getState(): AppState | null {
  if (stateCache) {
    return stateCache;
  }
  
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const stateJson = fs.readFileSync(STATE_FILE_PATH, 'utf8');
      stateCache = JSON.parse(stateJson);
      return stateCache;
    }
  } catch (error) {
    console.error('Error reading state file:', error);
  }

  return null;
}

/**
 * Save application state to disk
 * @param state The state to save
 * @returns Promise resolving to true if successful, false otherwise
 */
export function saveState(state: AppState): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // Check for lamp brightness changes
      const currentState = stateCache;
      if (state.lampBrightness !== undefined && 
          (!currentState || state.lampBrightness !== currentState.lampBrightness)) {
        // Send the updated lamp brightness to Arduino
        debouncedSendLampBrightness(state.lampBrightness);
      }
      
      const stateJson = JSON.stringify(state, null, 2);
      fs.writeFileSync(STATE_FILE_PATH, stateJson);
      stateCache = state;
      resolve(true);
    } catch (error) {
      console.error('Error saving app state:', error);
      resolve(false);
    }
  });
}

/**
 * Update a specific property in the state
 * @param key The key to update
 * @param value The new value
 * @returns Promise resolving to true if successful, false otherwise
 */
export function updateState<K extends keyof AppState>(
  key: K,
  value: AppState[K]
): Promise<boolean> {
  const currentState = getState() || ({} as AppState);
  currentState[key] = value;
  return saveState(currentState);
}

// Handler for saving app state to file
ipcMain.handle('save-app-state', async (_, state: AppState) => {
  return saveState(state);
});

// Handler for loading app state from file
ipcMain.handle('load-app-state', async () => {
  return getState();
});

// Create a debounced version of the sendLampBrightnessToSerial function
const debouncedSendLampBrightness = debounce(sendLampBrightnessToSerial, LAMP_BRIGHTNESS_DEBOUNCE_DELAY);

// Handler for updating a specific state property
ipcMain.handle(
  'update-app-state',
  async (_, key: keyof AppState, value: any) => {
    console.log(`[stateManager] Updating state: ${key} = ${value}`);
    return updateState(key, value);
  }
);

export function initStateManagement() {
  console.log('State management initialized');
  console.log('State file will be saved at:', STATE_FILE_PATH);
  
  // Check for initial lamp brightness setting
  const initialState = getState();
  if (initialState && typeof initialState.lampBrightness !== 'undefined') {
    // Send initial brightness on startup
    sendLampBrightnessToSerial(initialState.lampBrightness);
  }
}

/**
 * Sends a LERP_LED command to update the lamp brightness
 * @param brightness Value between 0-100 representing lamp brightness percentage
 */
function sendLampBrightnessToSerial(brightness: number) {
  // Convert brightness percentage (0-100) to LED white value (0-255)
  const whiteValue = Math.floor((brightness / 100) * 255);
  
  // Format for LERP_LED: stripId, pixel, r, g, b, w, duration
  // Using STRIP_BOTTOM (1), pixel 0, color values 0,0,0 (no RGB) and duration from constant
  const command = `LERP_LED ${STRIP_LAMP} 0 0 0 0 ${whiteValue} ${LAMP_BRIGHTNESS_TRANSITION_TIME}`;
  
  console.log(`[stateManager] Sending lamp brightness command: ${command}`);
  sendMessage(command);
}

/**
 * Sends a LERP_LED command to control an LED with support for -1 values
 * @param stripId The strip ID
 * @param pixel The pixel index
 * @param red Red value (0-255, or -1 for no change)
 * @param green Green value (0-255, or -1 for no change)
 * @param blue Blue value (0-255, or -1 for no change)
 * @param white White value (0-255, or -1 for no change)
 * @param duration Transition duration in milliseconds
 */
export function sendLEDToSerial(stripId: number, pixel: number, red: number, green: number, blue: number, white: number, duration: number) {
  // Format for LERP_LED: stripId, pixel, r, g, b, w, duration
  const command = `LERP_LED ${stripId} ${pixel} ${red} ${green} ${blue} ${white} ${duration}`;
  
  console.log(`[stateManager] Sending LED command: ${command}`);
  sendMessage(command);
}

/**
 * Sends a LERP_LED command to update a projector LED color
 * @param ledIndex The LED index (0 or 1)
 * @param red Red value (0-255)
 * @param green Green value (0-255)
 * @param blue Blue value (0-255)
 * @param white White value (0-255)
 */
export function sendProjectorLEDToSerial(ledIndex: number, red: number, green: number, blue: number, white: number) {
 sendLEDToSerial(STRIP_SUN_CENTER, ledIndex, red, green, blue, white, PROJECTOR_TRANSITION_TIME);
}

// Handler for updating projector LED colors
ipcMain.handle(
  'update-projector-led',
  async (_, ledIndex: number, red: number, green: number, blue: number, white: number) => {
    // Ensure values are within valid range (0-255)
    const r = Math.max(0, Math.min(255, red));
    const g = Math.max(0, Math.min(255, green));
    const b = Math.max(0, Math.min(255, blue));
    const w = Math.max(0, Math.min(255, white));
    
    // Send the command to the Arduino
    sendProjectorLEDToSerial(ledIndex, r, g, b, w);
    return true;
  }
);

/**
 * Resets all LEDs on all strips back to 0 (off)
 * This will send commands to turn off LEDs on each strip
 */
export function resetAllProjectorLEDs() {
  console.log('[stateManager] Resetting all projector LEDs to 0');
  
  // For strip ID 1 (projector strip), reset both LED 0 and LED 1
  // LERP_LED: stripId, pixel, r, g, b, w, duration
  sendMessage(`LERP_LED ${STRIP_SUN_CENTER} 0 0 0 0 0 ${PROJECTOR_TRANSITION_TIME}`);
  sendMessage(`LERP_LED ${STRIP_SUN_CENTER} 1 0 0 0 0 0 ${PROJECTOR_TRANSITION_TIME}`);
  
  // If there are other strips that need to be reset, add them here
  // For example, for strip ID 0 (if it exists)
  // sendMessage(`LERP_LED 0 0 0 0 0 0 ${PROJECTOR_TRANSITION_TIME}`);
}

// Handler for resetting all projector LEDs
ipcMain.handle('reset-all-projector-leds', async () => {
  resetAllProjectorLEDs();
  return true;
});
