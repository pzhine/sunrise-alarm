// Notification Sound Service for Electron Main Process
// Plays notification sounds for Bluetooth events

export class NotificationSoundService {

  constructor() {
    // No file paths needed - using system beeps only
  }

  /**
   * Play a notification sound
   */
  public async playSound(soundName: 'connect' | 'pair' | 'disconnect' | 'error'): Promise<void> {
    try {
      console.log(`Playing ${soundName} notification`);
      this.playSystemBeep(soundName);
    } catch (error) {
      console.error(`Failed to play ${soundName} sound:`, error);
    }
  }

  /**
   * Play system beep as fallback
   */
  private playSystemBeep(soundType: string): void {
    // Different beep patterns for different events
    const patterns = {
      connect: () => this.beep(2), // Two beeps
      pair: () => this.beep(3),    // Three beeps  
      disconnect: () => this.beep(1), // One beep
      error: () => {
        // Error pattern: beep-pause-beep-pause-beep
        this.beep(1);
        setTimeout(() => this.beep(1), 300);
        setTimeout(() => this.beep(1), 600);
      }
    };

    const pattern = patterns[soundType as keyof typeof patterns];
    if (pattern) {
      pattern();
    }
  }

  /**
   * Generate system beep
   */
  private beep(count: number = 1): void {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        // Use console.log('\x07') for system beep on Unix systems
        process.stdout.write('\x07');
      }, i * 150);
    }
  }

  /**
   * Initialize the sound service
   */
  public async createDefaultSounds(): Promise<void> {
    console.log('Sound service initialized - using system beeps for notifications');
  }
}

export const notificationSoundService = new NotificationSoundService();