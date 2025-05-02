import { app } from 'electron';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { getConfig } from './configManager';

// Promisify exec for easier use with async/await
const execAsync = promisify(exec);

let updateCheckInterval: NodeJS.Timeout | null = null;

/**
 * Check for updates from a URL that provides version metadata
 */
export async function checkForUpdatesFromUrl(url: string): Promise<{
  hasUpdate: boolean;
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  repoUrl?: string;
}> {
  try {
    console.log(`Checking for updates at: ${url}`);
    // Fetch the update metadata from the URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const updateData = await response.json();

    // Compare versions (assuming the remote JSON has a version field)
    const currentVersion = app.getVersion();
    const remoteVersion = updateData.version;

    console.log(
      `Current version: ${currentVersion}, Remote version: ${remoteVersion}`
    );

    // Simple semantic version comparison
    const hasUpdate = compareVersions(remoteVersion, currentVersion) > 0;

    if (hasUpdate) {
      console.log(`Update available: ${remoteVersion}`);
      const GITHUB_REPO = getConfig().autoUpdate.githubRepo;
      return {
        hasUpdate: true,
        version: remoteVersion,
        releaseNotes: updateData.notes,
        releaseDate: updateData.releaseDate,
        repoUrl:
          updateData.repoUrl ||
          `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`,
      };
    }

    console.log('No updates available');
    return { hasUpdate: false };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { hasUpdate: false };
  }
}

/**
 * Version comparison helper
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = i < parts1.length ? parts1[i] : 0;
    const part2 = i < parts2.length ? parts2[i] : 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * Download the source code from GitHub based on version tag
 */
export async function downloadSource(
  repoUrl: string,
  version: string
): Promise<string> {
  try {
    console.log(`Downloading source from: ${repoUrl}`);

    // Create a temporary directory for the download if it doesn't exist
    const downloadPath = path.join(
      app.getPath('temp'),
      'sunrise-alarm-updates'
    );
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    // Download zip file path
    const zipFilePath = path.join(downloadPath, `v${version}.zip`);
    const extractPath = path.join(downloadPath, `v${version}`);

    // Clean up existing files if they exist
    if (fs.existsSync(zipFilePath)) {
      fs.unlinkSync(zipFilePath);
    }

    if (fs.existsSync(extractPath)) {
      await execAsync(`rm -rf "${extractPath}"`);
    }

    // Download the zip file
    const response = await fetch(repoUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Save the zip file
    const fileStream = fs.createWriteStream(zipFilePath);
    await new Promise<void>((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', () => resolve());
    });

    console.log(`Source downloaded to: ${zipFilePath}`);

    // Extract the zip file
    fs.mkdirSync(extractPath, { recursive: true });
    await execAsync(`unzip -q "${zipFilePath}" -d "${extractPath}"`);

    console.log(`Source extracted to: ${extractPath}`);

    // Get the name of the extracted directory (might be like "sunrise-alarm-1.2.0")
    const dirs = fs.readdirSync(extractPath);
    const sourceDirName = dirs[0]; // Assuming the zip extracts to a single directory
    const sourceDir = path.join(extractPath, sourceDirName);

    console.log(`Source directory: ${sourceDir}`);
    return sourceDir;
  } catch (error) {
    console.error('Error downloading source:', error);
    throw error;
  }
}

/**
 * Build the source code
 */
export async function buildSource(sourceDir: string): Promise<string> {
  try {
    console.log(`Building source in: ${sourceDir}`);
    const electronDir = path.join(sourceDir, 'electron');

    // Check if the electron directory exists
    if (!fs.existsSync(electronDir)) {
      throw new Error(`Electron directory not found at: ${electronDir}`);
    }

    // Get the build script from config
    const BUILD_SCRIPT = getConfig().autoUpdate.buildScript;

    // Install dependencies and build
    console.log('Installing dependencies...');
    await execAsync(`cd "${electronDir}" && npm install`);

    console.log('Building app...');
    await execAsync(`cd "${electronDir}" && ${BUILD_SCRIPT}`);

    // On success, the app should be built to the dist directory
    const releaseDir = path.join(electronDir, 'release');

    if (!fs.existsSync(releaseDir)) {
      throw new Error(`Build failed: ${releaseDir} not found`);
    }

    console.log(`Build successful: ${releaseDir}`);

    return releaseDir;
  } catch (error) {
    console.error('Error building source:', error);
    throw error;
  }
}

/**
 * Install the update by copying files from linux-unpacked to the installation directory
 */
export function installUpdateAndRestart(releasePath: string) {
  try {
    console.log(`Installing update from build at: ${releasePath}`);

    // Get the installation directory from config
    const installDir = getConfig().autoUpdate.installDir;

    if (!installDir) {
      return {
        success: false,
        message: 'Installation directory not specified in config.json',
      };
    }

    // Get the release files dir
    const unpackedDir = getConfig().autoUpdate.relativeReleaseDir;
    if (!unpackedDir) {
      return {
        success: false,
        message: 'Relative release path not specified in config.json',
      };
    }

    // Find the linux-unpacked directory
    const linuxUnpackedDir = path.join(releasePath, unpackedDir);

    if (!fs.existsSync(linuxUnpackedDir)) {
      return {
        success: false,
        message: `Release files directory not found at: ${linuxUnpackedDir}`,
      };
    }

    console.log(`Copying files from ${linuxUnpackedDir} to ${installDir}`);

    // Create installation directory if it doesn't exist
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }

    // Create a shell script that will be fully independent of the parent process
    const scriptPath = path.join(app.getPath('temp'), 'update-and-restart.sh');
    const scriptContent = `#!/bin/bash

# Log file for debugging
LOG_FILE="${app.getPath('temp')}/update-restart.log"
echo "Starting update process at $(date)" > "$LOG_FILE"

# Wait for the app to completely exit
echo "Waiting for original process to exit..." >> "$LOG_FILE"
sleep 3

# Check if the app is still running and wait longer if needed
APP_NAME="sunrise-alarm"
for i in {1..10}; do
  if pgrep -f "$APP_NAME" > /dev/null; then
    echo "App still running, waiting... (attempt $i)" >> "$LOG_FILE"
    sleep 1
  else
    echo "App process no longer detected" >> "$LOG_FILE"
    break
  fi
done

# Copy all files from linux-unpacked to installation directory
echo "Copying files from ${linuxUnpackedDir} to ${installDir}" >> "$LOG_FILE"
cp -rf "${linuxUnpackedDir}"/* "${installDir}/" 2>> "$LOG_FILE"

# Make the executable file executable
echo "Setting executable permissions" >> "$LOG_FILE"
chmod +x "${installDir}/sunrise-alarm" 2>> "$LOG_FILE"

# Wait additional time for resources to be freed up
echo "Waiting for resources to be freed..." >> "$LOG_FILE"
sleep 1

# Start the updated application
echo "Starting application at $(date)" >> "$LOG_FILE"
cd "${installDir}" && ./sunrise-alarm > /dev/null 2>&1 &

# Exit the script
echo "Update process complete at $(date)" >> "$LOG_FILE"
exit 0
`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, '0755');

    // Use detached process to run the script so it can continue after app exits
    const child = spawn('bash', [scriptPath], {
      detached: true,
      stdio: 'ignore', // Completely detach from parent process I/O
    });

    // Unreference the child to allow the parent process to exit independently
    child.unref();

    console.log('Update script launched as detached process');

    // Wait a moment and then quit the app
    setTimeout(() => {
      app.quit();
    }, 500);

    return {
      success: true,
      message: `Update will be installed after app restarts.`,
    };
  } catch (error) {
    console.error('Error installing update:', error);
    return {
      success: false,
      message: `Error installing update: ${error}`,
    };
  }
}

/**
 * Automatically check for updates, download source, build, and install if available
 * @param force If true, bypass version check and force an update
 * @returns Result of the update process, if force is true
 */
export async function checkForUpdatesAndInstall(
  force = false
): Promise<{ success: boolean; message: string; releasePath?: string }> {
  const UPDATE_URL = getConfig().autoUpdate.updateUrl;
  const GITHUB_REPO = getConfig().autoUpdate.githubRepo;

  if (!UPDATE_URL) {
    const message =
      'No UPDATE_URL provided in configuration. Skipping update check.';
    console.log(message);
    return force ? { success: false, message } : undefined;
  }

  if (!GITHUB_REPO) {
    const message =
      'No GITHUB_REPO provided in configuration. Skipping update check.';
    console.log(message);
    return force
      ? { success: false, message: 'GitHub repo not configured.' }
      : undefined;
  }

  try {
    // Fetch update information from the server
    const response = await fetch(UPDATE_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const updateData = await response.json();
    const remoteVersion = updateData.version;
    const currentVersion = app.getVersion();

    console.log(
      `Current version: ${currentVersion}, Remote version: ${remoteVersion}`
    );

    // Determine if an update is available
    const hasUpdate = compareVersions(remoteVersion, currentVersion) > 0;

    // Proceed if there's an update available or if force is true
    if ((hasUpdate || force) && remoteVersion) {
      if (force) {
        console.log(`Force update requested. Using version: ${remoteVersion}`);
      } else {
        console.log(`Update found: ${remoteVersion}. Downloading source...`);
      }

      const repoUrl =
        updateData.repoUrl ||
        `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;

      // Download the source
      const sourceDir = await downloadSource(repoUrl, remoteVersion);

      // Build the source
      console.log('Building source...');
      const releasePath = await buildSource(sourceDir);

      // Install and restart
      console.log('Update built. Installing and restarting...');
      const result = installUpdateAndRestart(releasePath);

      if (result.success) {
        console.log(result.message);
      } else {
        console.error('Failed to install update:', result.message);
      }

      return { ...result, releasePath };
    } else {
      console.log('No updates available');
      return { success: false, message: 'No updates available.' };
    }
  } catch (error) {
    console.error('Error in update process:', error);
    return {
      success: false,
      message: `Error during update: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Force an update download, build, and install regardless of version check
 */
export async function forceUpdate() {
  console.log('Force update requested, bypassing version check...');
  return checkForUpdatesAndInstall(true);
}

/**
 * Initialize auto-updater with unattended updates
 */
export function initAutoUpdater() {
  const UPDATE_URL = getConfig().autoUpdate.updateUrl;
  const GITHUB_REPO = getConfig().autoUpdate.githubRepo;
  const UPDATE_CHECK_INTERVAL = getConfig().autoUpdate.checkInterval;
  const BUILD_SCRIPT = getConfig().autoUpdate.buildScript;

  console.log(`Initializing auto-updater with URL: ${UPDATE_URL || 'not set'}`);
  console.log(`GitHub repo: ${GITHUB_REPO || 'not set'}`);
  console.log(`Update check interval: ${UPDATE_CHECK_INTERVAL} minutes`);
  console.log(`Build script: ${BUILD_SCRIPT}`);

  // Do an initial check
  if (UPDATE_URL && GITHUB_REPO) {
    console.log('Performing initial update check...');
    checkForUpdatesAndInstall();

    // Set up interval for periodic checks
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
    }

    updateCheckInterval = setInterval(
      () => {
        console.log('Performing scheduled update check...');
        checkForUpdatesAndInstall();
      },
      UPDATE_CHECK_INTERVAL * 60 * 1000
    );
  }
}
