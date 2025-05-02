import { exec } from 'child_process';
import { ipcMain } from 'electron';

// Function to execute shell commands
function executeCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Set system volume in Ubuntu (0-100 percentage)
export async function setSystemVolume(volumeLevel: number): Promise<void> {
  try {
    // Ensure volume is in valid range
    const volume = Math.max(0, Math.min(100, volumeLevel));

    // Use amixer to set the volume
    await executeCommand(`amixer -D pulse sset Master ${volume}%`);
    console.log(`System volume set to ${volume}%`);
  } catch (error) {
    console.error('Failed to set system volume:', error);
  }
}

// Get current system volume level
export async function getSystemVolume(): Promise<number> {
  try {
    // Get current volume using amixer
    const output = await executeCommand('amixer -D pulse get Master');

    // Parse the output to extract volume percentage
    const match = output.match(/\[(\d+)%\]/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    return 50; // Default if parsing fails
  } catch (error) {
    console.error('Failed to get system volume:', error);
    return 50; // Default if command fails
  }
}

// Initialize IPC handlers for volume control
export function initVolumeControl(): void {
  // Handler to set system volume
  ipcMain.handle('set-system-volume', async (_, level) => {
    await setSystemVolume(level);
    return true;
  });

  // Handler to get current system volume
  ipcMain.handle('get-system-volume', async () => {
    return await getSystemVolume();
  });

  console.log('System volume control initialized');
}
