import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';
import { AlarmSound } from '../../types/sound';
import { AppState } from '../../types/state';

// Create a Pinia store for our application state
export const useAppStore = defineStore('appState', {
  state: (): AppState => ({
    volume: 50, // Default volume (0-100)
    alarmTime: [7, 0], // Default alarm time [hours, minutes] (7:00 AM)
    screenBrightness: 80, // Default screen brightness (0-100)
    projectorBrightness: 70, // Default projector brightness (0-100)
    lampBrightness: 50, // Default lamp brightness (0-100)
    timeFormat: '24h', // Default time format
    listPositions: {}, // Empty object to store list positions by route
    alarmSound: null, // Default to no alarm sound selected
    lastConnectedWifi: undefined, // Last successfully connected WiFi network
    lastSoundListRoute: undefined, // Last sound list route visited
    lastCountryListRoute: undefined, // Last country list route visited
    projectorPreview: [
      { red: 0, green: 0, blue: 0, white: 0 }, // LED 0
      { red: 0, green: 0, blue: 0, white: 0 }  // LED 1
    ], // Default LED color settings for projector preview
  }),

  getters: {
    // Format alarm time as a string (HH:MM) based on timeFormat preference
    formattedAlarmTime: (state): string => {
      const [hours, minutes] = state.alarmTime;

      if (state.timeFormat === '12h') {
        const isPM = hours >= 12;
        const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
        return `${hours12}:${minutes.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
      } else {
        // 24h format
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    },

    // Get list position for a specific route
    getListPosition:
      (state) =>
      (routePath: string): number => {
        return state.listPositions[routePath] ?? 0; // Default to 0 if not found
      },
  },

  actions: {
    // Save state to Electron via IPC
    saveState: debounce(function (this: any) {
      // Send the entire state to the main process
      window.ipcRenderer.invoke(
        'save-app-state',
        JSON.parse(JSON.stringify(this.$state))
      );
    }, 100),

    // Load state from Electron main process
    async loadState() {
      try {
        const savedState = await window.ipcRenderer.invoke('load-app-state');
        if (savedState) {
          // Replace the entire state with the saved one
          this.$patch(savedState);
        }

        // Sync with system volume after loading state
        await this.syncWithSystemVolume();
      } catch (error) {
        console.error('Failed to load saved state:', error);
      }
    },

    // Sync app volume with system volume
    async syncWithSystemVolume() {
      try {
        // Get the current system volume using general invoke method
        const systemVolume =
          await window.ipcRenderer.invoke('get-system-volume');

        // Update the app state without triggering the setSystemVolume call
        this.volume = systemVolume;

        console.log(`App volume synced with system volume: ${systemVolume}%`);
      } catch (error) {
        console.error('Failed to sync with system volume:', error);
      }
    },

    // Set the alarm time
    setAlarmTime(hours: number, minutes: number): void {
      this.alarmTime = [hours, minutes];
    },

    // Save list position for a specific route
    saveListPosition(routePath: string, position: number): void {
      this.listPositions[routePath] = position;
    },

    // Clear saved position for a route
    clearListPosition(routePath: string): void {
      delete this.listPositions[routePath];
    },

    // Clear all saved list positions
    clearAllListPositions(): void {
      this.listPositions = {};
    },

    // Set the volume level
    setVolume(level: number): void {
      // Clamp between 0-100
      const newLevel = Math.max(0, Math.min(100, level));
      this.volume = newLevel;

      // Update the system volume using general invoke method
      window.ipcRenderer
        .invoke('set-system-volume', newLevel)
        .catch((error) => {
          console.error('Failed to set system volume:', error);
        });

      // Save state after change
      this.saveState();
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

    // Set the time format
    setTimeFormat(format: '12h' | '24h'): void {
      this.timeFormat = format;
    },

    // Set the alarm sound
    setAlarmSound(sound: AlarmSound | null): void {
      this.alarmSound = sound;
    },

    // Set the last connected WiFi network
    setLastConnectedWifi(networkName: string): void {
      this.lastConnectedWifi = networkName;
      this.saveState();
    },

    // Clear the last connected WiFi network
    clearLastConnectedWifi(): void {
      this.lastConnectedWifi = undefined;
      this.saveState();
    },

    // Set the last sound list route
    setLastSoundListRoute(routeName: string, routeParams: Record<string, string>): void {
      this.lastSoundListRoute = {
        name: routeName,
        params: routeParams
      };
      this.saveState();
    },

    // Clear the last sound list route
    clearLastSoundListRoute(): void {
      this.lastSoundListRoute = undefined;
      this.saveState();
    },

    // Set the last country list route
    setLastCountryListRoute(routeName: string, routeParams: Record<string, string>): void {
      this.lastCountryListRoute = {
        name: routeName,
        params: routeParams
      };
      this.saveState();
    },

    // Clear the last country list route
    clearLastCountryListRoute(): void {
      this.lastCountryListRoute = undefined;
      this.saveState();
    },

    // Reset projector preview to default values
    resetProjectorPreview(): void {
      this.projectorPreview = [
        { red: 0, green: 0, blue: 0, white: 0 }, // LED 0
        { red: 0, green: 0, blue: 0, white: 0 }  // LED 1
      ];
    },

    // Reset all settings to default values
    resetToDefaults(): void {
      this.volume = 50;
      this.alarmTime = [7, 0];
      this.screenBrightness = 80;
      this.projectorBrightness = 70;
      this.lampBrightness = 50;
      this.timeFormat = '24h';
      this.clearAllListPositions();
      this.alarmSound = null;
      this.lastConnectedWifi = undefined;
      this.lastSoundListRoute = undefined;
      this.lastCountryListRoute = undefined;
      this.resetProjectorPreview();
    },
  },
});
