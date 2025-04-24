import { ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

// Define the file path for storing application state
const STATE_FILE_PATH = path.join(app.getPath('userData'), 'app-state.json');

// Handler for saving app state to file
ipcMain.handle('save-app-state', async (_, state) => {
  try {
    // Convert the state object to JSON
    const stateJson = JSON.stringify(state, null, 2);

    // Write to file
    fs.writeFileSync(STATE_FILE_PATH, stateJson);
    console.log('App state saved to:', STATE_FILE_PATH);
    return true;
  } catch (error) {
    console.error('Error saving app state:', error);
    return false;
  }
});

// Handler for loading app state from file
ipcMain.handle('load-app-state', async () => {
  try {
    // Check if the state file exists
    if (fs.existsSync(STATE_FILE_PATH)) {
      // Read file content
      const stateJson = fs.readFileSync(STATE_FILE_PATH, 'utf8');

      // Parse JSON to object
      const state = JSON.parse(stateJson);
      console.log('App state loaded from:', STATE_FILE_PATH);
      return state;
    } else {
      console.log('No saved state found, using defaults');
      return null;
    }
  } catch (error) {
    console.error('Error loading app state:', error);
    return null;
  }
});

export function initStateManagement() {
  console.log('State management initialized');
  console.log('State file will be saved at:', STATE_FILE_PATH);
}
