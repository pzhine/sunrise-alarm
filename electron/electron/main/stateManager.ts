import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { AppState } from '../../types/state';

// Define the file path for storing application state
const STATE_FILE_PATH = path.join(app.getPath('userData'), 'app-state.json');

// State cache to avoid unnecessary file reads
let stateCache: AppState | null = null;

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
      const stateJson = JSON.stringify(state, null, 2);
      fs.writeFileSync(STATE_FILE_PATH, stateJson);
      stateCache = state;
      console.log('App state saved to:', STATE_FILE_PATH);
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

// Handler for updating a specific state property
ipcMain.handle(
  'update-app-state',
  async (_, key: keyof AppState, value: any) => {
    return updateState(key, value);
  }
);

export function initStateManagement() {
  console.log('State management initialized');
  console.log('State file will be saved at:', STATE_FILE_PATH);
}
