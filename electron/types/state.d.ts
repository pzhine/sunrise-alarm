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
  lastBuildResult?: {
    success: boolean;
    message: string;
    releasePath?: string;
  };
}
