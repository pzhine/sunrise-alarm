import { AlarmSound } from './sound';

// Define the type for our alarm time tuple [hours, minutes]
export type AlarmTime = [number, number];

// Define the interface for list positions by route
export interface ListPositions {
  [routePath: string]: number;
}

// Define a type for LED RGBW values
export interface RGBW {
  red: number;
  green: number;
  blue: number;
  white: number;
}

// Define the interface for sunrise step
export interface SunriseStep {
  strip: string;
  pixel: number;
  red: number;
  green: number;
  blue: number;
  white: number;
  startAt: number;
  duration: number;
}

// Define the interface for our app state
export interface AppState {
  volume: number;
  alarmActive: boolean;
  alarmTime: AlarmTime;
  screenBrightness: number;
  projectorBrightness: number;
  lampBrightness: number;
  timeFormat: '12h' | '24h'; // Add time format preference
  listPositions: ListPositions; // Store InteractiveList positions by route
  alarmSound: AlarmSound | null;
  favoriteSounds: AlarmSound[]; // Array to store favorite sounds
  lastConnectedWifi?: string; // Store the last successfully connected WiFi network name
  lastBuildResult?: {
    success: boolean;
    message: string;
    releasePath?: string;
  };
  lastSoundListRoute?: {
    name: string;
    params: Record<string, string>;
  }; // Store the last sound list route and params
  lastCountryListRoute?: {
    name: string;
    params: Record<string, string>;
  }; // Store the last country list route and params
  projectorPreview: RGBW[]; // Store LED color settings as an array of RGBW values
  sunriseDuration: number;
  sunriseActive: boolean;
  sunriseBrightness: number; // Global brightness for sunrise (0-100)
}

export type UpdateStatus =
  | 'checking'
  | 'downloading'
  | 'installing'
  | 'error'
  | 'not-available';
