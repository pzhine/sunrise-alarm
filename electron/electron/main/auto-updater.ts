import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

// Promisify exec for easier use with async/await
const execAsync = promisify(exec);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Get configuration from environment variables
const UPDATE_URL = process.env.UPDATE_URL || '';
const UPDATE_CHECK_INTERVAL = parseInt(
  process.env.UPDATE_CHECK_INTERVAL || '60',
  10
); // minutes
const GITHUB_REPO = process.env.GITHUB_REPO || ''; // Format: "owner/repo"
const BUILD_SCRIPT = process.env.BUILD_SCRIPT || 'npm run build'; // Command to build the app

// Configure the auto updater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Set up logging
autoUpdater.logger = console;

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
      return {
        hasUpdate: true,
        version: remoteVersion,
        releaseNotes: updateData.notes,
        releaseDate: updateData.releaseDate,
        repoUrl:
          updateData.repoUrl ||
          `https://github.com/${GITHUB_REPO}/archive/refs/tags/v${remoteVersion}.zip`,
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

    // Install dependencies and build
    console.log('Installing dependencies...');
    await execAsync(`cd "${electronDir}" && npm install`);

    console.log('Building app...');
    await execAsync(`cd "${electronDir}" && ${BUILD_SCRIPT}`);

    // On success, the app should be built to the dist directory
    const appImageDir = path.join(electronDir, 'dist');

    if (!fs.existsSync(appImageDir)) {
      throw new Error(`Build failed: ${appImageDir} not found`);
    }

    // Find the AppImage file
    const files = fs.readdirSync(appImageDir);
    const appImageFile = files.find((file) => file.endsWith('.AppImage'));

    if (!appImageFile) {
      throw new Error('Build succeeded but no AppImage file found');
    }

    const appImagePath = path.join(appImageDir, appImageFile);
    console.log(`Build successful: ${appImagePath}`);

    return appImagePath;
  } catch (error) {
    console.error('Error building source:', error);
    throw error;
  }
}

/**
 * Install the update and restart the app
 */
export function installUpdateAndRestart(appImagePath: string) {
  try {
    console.log(`Installing update from: ${appImagePath}`);

    // Make AppImage executable
    fs.chmodSync(appImagePath, '0755');
    console.log('Made AppImage executable');

    // Create a shell script that will wait for this process to exit and then run the new version
    const scriptPath = path.join(app.getPath('temp'), 'update-and-restart.sh');
    const scriptContent = `#!/bin/bash
# Wait for the app to exit
sleep 2
# Run the new version
"${appImagePath}" &
# Exit the script
exit 0
`;

    fs.writeFileSync(scriptPath, scriptContent);
    fs.chmodSync(scriptPath, '0755');

    // Execute the script and then quit the app
    exec(`bash "${scriptPath}"`, (error) => {
      if (error) {
        console.error(`Error executing update script: ${error}`);
      }
    });

    // Wait a moment and then quit the app
    setTimeout(() => {
      app.quit();
    }, 1000);

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
 */
async function checkForUpdatesAndInstall() {
  if (!UPDATE_URL) {
    console.log(
      'No UPDATE_URL provided in environment variables. Skipping update check.'
    );
    return;
  }

  if (!GITHUB_REPO) {
    console.log(
      'No GITHUB_REPO provided in environment variables. Skipping update check.'
    );
    return;
  }

  try {
    const updateInfo = await checkForUpdatesFromUrl(UPDATE_URL);

    if (updateInfo.hasUpdate && updateInfo.version && updateInfo.repoUrl) {
      console.log(`Update found: ${updateInfo.version}. Downloading source...`);

      // Download the source
      const sourceDir = await downloadSource(
        updateInfo.repoUrl,
        updateInfo.version
      );

      // Build the source
      console.log('Building source...');
      const appImagePath = await buildSource(sourceDir);

      // Install and restart
      console.log('Update built. Installing and restarting...');
      const result = installUpdateAndRestart(appImagePath);

      if (result.success) {
        console.log(result.message);
      } else {
        console.error('Failed to install update:', result.message);
      }
    }
  } catch (error) {
    console.error('Error in auto-update process:', error);
  }
}

/**
 * Initialize auto-updater with unattended updates
 */
export function initAutoUpdater() {
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
