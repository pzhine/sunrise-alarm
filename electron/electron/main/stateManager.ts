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
const LAMP_BRIGHTNESS_DEBOUNCE_DELAY = 200; // ms
const LAMP_BRIGHTNESS_TRANSITION_TIME = 300; // ms
// Strip identifiers matching Arduino constants
const STRIP_BOTTOM = 1;

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
  const command = `LERP_LED ${STRIP_BOTTOM} 0 0 0 0 ${whiteValue} ${LAMP_BRIGHTNESS_TRANSITION_TIME}`;
  
  console.log(`[stateManager] Sending lamp brightness command: ${command}`);
  sendMessage(command);
}
