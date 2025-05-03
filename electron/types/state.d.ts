import { AlarmSound } from './sound';

// Define the type for our alarm time tuple [hours, minutes]
export type AlarmTime = [number, number];

// Define the interface for list positions by route
export interface ListPositions {
  [routePath: string]: number;
}

// Define the interface for our app state
export interface AppState {
  volume: number;
  alarmTime: AlarmTime;
  screenBrightness: number;
  projectorBrightness: number;
  lampBrightness: number;
  timeFormat: '12h' | '24h'; // Add time format preference
  listPositions: ListPositions; // Store InteractiveList positions by route
  alarmSound: AlarmSound | null;
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
}

export type UpdateStatus =
  | 'checking'
  | 'downloading'
  | 'installing'
  | 'error'
  | 'not-available';
