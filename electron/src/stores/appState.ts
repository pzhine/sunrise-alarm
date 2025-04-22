import { defineStore } from 'pinia';

// Define the type for our alarm time tuple [hours, minutes]
type AlarmTime = [number, number];

// Define the interface for our app state
interface AppState {
  volume: number;
  alarmTime: AlarmTime;
  screenBrightness: number;
  projectorBrightness: number;
  lampBrightness: number;
}

// Create a Pinia store for our application state
export const useAppStore = defineStore('appState', {
  state: (): AppState => ({
    volume: 50, // Default volume (0-100)
    alarmTime: [7, 0], // Default alarm time [hours, minutes] (7:00 AM)
    screenBrightness: 80, // Default screen brightness (0-100)
    projectorBrightness: 70, // Default projector brightness (0-100)
    lampBrightness: 50, // Default lamp brightness (0-100)
  }),

  getters: {
    // Format alarm time as a string (HH:MM)
    formattedAlarmTime: (state): string => {
      const [hours, minutes] = state.alarmTime;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    },
  },

  actions: {
    // Set the alarm time
    setAlarmTime(hours: number, minutes: number): void {
      this.alarmTime = [hours, minutes];
    },

    // Set the volume level
    setVolume(level: number): void {
      this.volume = Math.max(0, Math.min(100, level)); // Clamp between 0-100
    },

    // Set the screen brightness
    setScreenBrightness(level: number): void {
      this.screenBrightness = Math.max(0, Math.min(100, level)); // Clamp between 0-100
    },

    // Set the projector brightness
    setProjectorBrightness(level: number): void {
      this.projectorBrightness = Math.max(0, Math.min(100, level)); // Clamp between 0-100
    },

    // Set the lamp brightness
    setLampBrightness(level: number): void {
      this.lampBrightness = Math.max(0, Math.min(100, level)); // Clamp between 0-100
    },

    // Reset all settings to default values
    resetToDefaults(): void {
      this.volume = 50;
      this.alarmTime = [7, 0];
      this.screenBrightness = 80;
      this.projectorBrightness = 70;
      this.lampBrightness = 50;
    },
  },
});
