import { EventEmitter } from 'events';

interface MediaMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  position: number;
  track_number?: number;
  genre?: string;
  status: 'playing' | 'paused' | 'stopped';
  timestamp: number;
}

/**
 * Mock Bluetooth media service for local development and testing
 * Provides realistic simulation of Bluetooth media playback without hardware
 */
export class MockBluetoothMedia extends EventEmitter {
  private mockPlaylist: MediaMetadata[] = [
    {
      title: "Bohemian Rhapsody",
      artist: "Queen",
      album: "A Night at the Opera",
      duration: 355, // 5:55
      position: 0,
      status: 'stopped',
      timestamp: Date.now()
    },
    {
      title: "Imagine",
      artist: "John Lennon",
      album: "Imagine",
      duration: 183, // 3:03
      position: 0,
      status: 'stopped',
      timestamp: Date.now()
    },
    {
      title: "Hotel California",
      artist: "Eagles",
      album: "Hotel California",
      duration: 391, // 6:31
      position: 0,
      status: 'stopped',
      timestamp: Date.now()
    },
    {
      title: "Chapter 1: The Desert Planet",
      artist: "Frank Herbert",
      album: "Dune (Audiobook)",
      duration: 2847, // 47:27
      position: 0,
      status: 'stopped',
      timestamp: Date.now()
    },
    {
      title: "Sunrise Meditation",
      artist: "Nature Sounds Collective",
      album: "Dawn Ambience",
      duration: 1200, // 20:00
      position: 0,
      status: 'stopped',
      timestamp: Date.now()
    }
  ];

  private currentTrackIndex = 0;
  private simulationStatus: 'playing' | 'paused' | 'stopped' = 'stopped';
  private simulationPosition = 0;
  private simulationTimer: NodeJS.Timeout | null = null;
  private lastPositionUpdate = Date.now();
  private currentMetadata: MediaMetadata;

  constructor() {
    super();
    this.currentMetadata = { ...this.mockPlaylist[0] };
    console.log('🎵 Mock Bluetooth media service initialized with', this.mockPlaylist.length, 'tracks');
  }

  /**
   * Start the simulation timer for position tracking
   */
  public startSimulation(): void {
    if (this.simulationTimer) return;

    console.log('🎵 Starting simulation mode');
    this.simulationTimer = setInterval(() => {
      if (this.simulationStatus === 'playing') {
        const now = Date.now();
        const elapsed = (now - this.lastPositionUpdate) / 1000; // Convert to seconds
        
        this.simulationPosition = Math.min(
          this.simulationPosition + elapsed,
          this.mockPlaylist[this.currentTrackIndex].duration
        );
        this.lastPositionUpdate = now;
        
        // Auto-advance to next track when current ends
        if (this.simulationPosition >= this.mockPlaylist[this.currentTrackIndex].duration) {
          this.simulateNext();
        }
        
        this.updateSimulationMetadata();
      }
    }, 1000); // Update every second
  }

  /**
   * Stop the simulation timer
   */
  public stopSimulation(): void {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
      console.log('🎵 Simulation mode stopped');
    }
  }

  /**
   * Update metadata and emit to listeners
   */
  private updateSimulationMetadata(): void {
    const currentTrack = this.mockPlaylist[this.currentTrackIndex];
    this.currentMetadata = {
      ...currentTrack,
      position: this.simulationPosition,
      status: this.simulationStatus,
      timestamp: Date.now()
    };
    
    this.emit('metadataUpdated', this.currentMetadata);
  }

  /**
   * Simulate play action
   */
  public play(): boolean {
    if (this.simulationStatus !== 'playing') {
      this.simulationStatus = 'playing';
      this.lastPositionUpdate = Date.now();
      this.updateSimulationMetadata();
      console.log('🎵 Simulation: Play');
      return true;
    }
    return false;
  }

  /**
   * Simulate pause action
   */
  public pause(): boolean {
    if (this.simulationStatus === 'playing') {
      this.simulationStatus = 'paused';
      this.updateSimulationMetadata();
      console.log('🎵 Simulation: Pause');
      return true;
    }
    return false;
  }

  /**
   * Simulate stop action
   */
  public stop(): boolean {
    this.simulationStatus = 'stopped';
    this.simulationPosition = 0;
    this.updateSimulationMetadata();
    console.log('🎵 Simulation: Stop');
    return true;
  }

  /**
   * Simulate next track
   */
  public next(): boolean {
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.mockPlaylist.length;
    this.simulationPosition = 0;
    this.lastPositionUpdate = Date.now();
    this.updateSimulationMetadata();
    console.log('🎵 Simulation: Next track -', this.mockPlaylist[this.currentTrackIndex].title);
    return true;
  }

  /**
   * Simulate previous track
   */
  public previous(): boolean {
    this.currentTrackIndex = this.currentTrackIndex === 0 
      ? this.mockPlaylist.length - 1 
      : this.currentTrackIndex - 1;
    this.simulationPosition = 0;
    this.lastPositionUpdate = Date.now();
    this.updateSimulationMetadata();
    console.log('🎵 Simulation: Previous track -', this.mockPlaylist[this.currentTrackIndex].title);
    return true;
  }

  /**
   * Simulate seek to position
   */
  public seek(position: number): boolean {
    const maxPosition = this.mockPlaylist[this.currentTrackIndex].duration;
    this.simulationPosition = Math.max(0, Math.min(position, maxPosition));
    this.lastPositionUpdate = Date.now();
    this.updateSimulationMetadata();
    console.log('🎵 Simulation: Seek to', this.simulationPosition + 's');
    return true;
  }

  /**
   * Get current metadata
   */
  public getCurrentMetadata(): MediaMetadata {
    return this.currentMetadata;
  }

  /**
   * Get current track information
   */
  public getCurrentTrack(): { index: number; total: number; track: MediaMetadata } {
    return {
      index: this.currentTrackIndex,
      total: this.mockPlaylist.length,
      track: this.currentMetadata
    };
  }

  /**
   * Simulate next track (internal method for auto-advance)
   */
  private simulateNext(): void {
    this.next();
    // Continue playing if we were playing
    if (this.simulationStatus === 'playing') {
      this.lastPositionUpdate = Date.now();
    }
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopSimulation();
    this.removeAllListeners();
    console.log('🎵 Mock Bluetooth media service destroyed');
  }
}