import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface AppConfig {
  freesound: {
    clientId: string;
    apiKey: string;
  };
  openWeather: {
    apiKey: string;
  };
  autoUpdate: {
    updateUrl: string;
    checkInterval: number;
    githubRepo: string;
    buildScript: string;
    installDir?: string; // Directory where app files will be installed
    relativeReleaseDir?: string; // Path to unpacked release files relative to electron dir
  };
}

// Configuration object that will be loaded from config.json
let config: AppConfig;

/**
 * Initialize the configuration system
 * Loads the config.json file from app data directory
 * Exits the application if the file doesn't exist
 */
export function initConfigManager(): AppConfig {
  // Get the path to config.json in the app's user data directory
  const configPath = path.join(app.getPath('userData'), 'config.json');
  console.log(`Looking for config at: ${configPath}`);

  // Check if config file exists
  if (!fs.existsSync(configPath)) {
    console.error('Error: config.json not found at', configPath);
    console.error(
      'Please create a config.json file in the application data directory.'
    );
    return null;
  }

  // Load the config file
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    console.log('Configuration loaded successfully');
    return config;
  } catch (err) {
    console.error('Failed to load config:', err);
    return null;
  }
}

/**
 * Get the current configuration
 */
export function getConfig(): AppConfig {
  if (!config) {
    throw new Error(
      'Configuration not initialized. Call initConfigManager() first.'
    );
  }
  return config;
}
