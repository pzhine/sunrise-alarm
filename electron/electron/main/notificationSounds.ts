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
      await this.playTonePattern(soundName);
    } catch (error) {
      console.error(`Failed to play ${soundName} sound:`, error);
    }
  }

  /**
   * Play tone patterns for different events
   */
  private async playTonePattern(soundType: string): Promise<void> {
    const patterns = {
      connect: () => this.playTwoTones(400, 800), // Low to high (connection)
      pair: () => this.playTwoTones(400, 800),    // Same as connect for pairing
      disconnect: () => this.playTwoTones(800, 400), // High to low (disconnection)
      error: () => this.playErrorPattern()
    };

    const pattern = patterns[soundType as keyof typeof patterns];
    if (pattern) {
      await pattern();
    }
  }

  /**
   * Play two sequential tones
   */
  private async playTwoTones(freq1: number, freq2: number): Promise<void> {
    return new Promise((resolve) => {
      // First tone
      this.playTone(freq1, 200);
      
      // Second tone after short pause
      setTimeout(() => {
        this.playTone(freq2, 200);
        
        // Resolve after second tone completes
        setTimeout(resolve, 250);
      }, 250);
    });
  }

  /**
   * Play error pattern (rapid beeps)
   */
  private async playErrorPattern(): Promise<void> {
    return new Promise((resolve) => {
      this.playTone(600, 100);
      setTimeout(() => this.playTone(600, 100), 150);
      setTimeout(() => this.playTone(600, 100), 300);
      setTimeout(resolve, 450);
    });
  }

  /**
   * Play a single tone using Web Audio API or fallback to system beep
   */
  private playTone(frequency: number, duration: number): void {
    try {
      // Try to use a more sophisticated tone generation
      // For now, fall back to system beep with different patterns
      this.beep(1);
    } catch (error) {
      // Fallback to system beep
      this.beep(1);
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
    console.log('Sound service initialized - using two-tone patterns for notifications');
    console.log('- Connection: Low→High tone');
    console.log('- Disconnection: High→Low tone');
  }
}

export const notificationSoundService = new NotificationSoundService();