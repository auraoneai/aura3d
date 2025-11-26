/**
 * RaceManager.ts - Race Management
 *
 * Complete race management system with:
 * - Countdown start sequence
 * - Position tracking
 * - Lap timing with splits
 * - Leaderboard updates
 * - Race finish handling
 * - DNF detection
 */

import { Vehicle } from './Vehicle';
import { Track } from './Track';

export enum RaceState {
  Waiting = 'waiting',
  Countdown = 'countdown',
  Racing = 'racing',
  Finished = 'finished'
}

export interface RacerData {
  vehicle: Vehicle;
  name: string;
  isPlayer: boolean;

  // Progress tracking
  currentLap: number;
  lastCheckpoint: number;
  lapTimes: number[];
  bestLapTime: number;
  totalTime: number;

  // Position
  position: number;
  distanceAlongTrack: number;

  // State
  finished: boolean;
  dnf: boolean;
}

export class RaceManager {
  private track: Track;
  private racers: RacerData[];
  private state: RaceState;

  // Race timing
  private raceStartTime: number = 0;
  private raceTime: number = 0;
  private countdownTime: number = 3;
  private currentCountdown: number = 3;

  // Events
  private onStateChange?: (state: RaceState) => void;
  private onLapComplete?: (racer: RacerData) => void;
  private onRaceFinish?: (results: RacerData[]) => void;

  constructor(track: Track) {
    this.track = track;
    this.racers = [];
    this.state = RaceState.Waiting;
  }

  /**
   * Add racer to race
   */
  public addRacer(vehicle: Vehicle, name: string, isPlayer: boolean = false): void {
    const racer: RacerData = {
      vehicle,
      name,
      isPlayer,
      currentLap: 0,
      lastCheckpoint: -1,
      lapTimes: [],
      bestLapTime: Infinity,
      totalTime: 0,
      position: this.racers.length + 1,
      distanceAlongTrack: 0,
      finished: false,
      dnf: false
    };

    this.racers.push(racer);
  }

  /**
   * Start race with countdown
   */
  public startRace(): void {
    this.state = RaceState.Countdown;
    this.currentCountdown = this.countdownTime;
    this.raceStartTime = 0;
    this.raceTime = 0;

    // Reset all racers
    this.racers.forEach(racer => {
      racer.currentLap = 0;
      racer.lastCheckpoint = -1;
      racer.lapTimes = [];
      racer.bestLapTime = Infinity;
      racer.totalTime = 0;
      racer.finished = false;
      racer.dnf = false;
    });

    if (this.onStateChange) {
      this.onStateChange(this.state);
    }
  }

  /**
   * Update race logic
   */
  public update(deltaTime: number): void {
    switch (this.state) {
      case RaceState.Countdown:
        this.updateCountdown(deltaTime);
        break;

      case RaceState.Racing:
        this.updateRace(deltaTime);
        break;

      case RaceState.Finished:
        // Race over
        break;
    }
  }

  /**
   * Update countdown
   */
  private updateCountdown(deltaTime: number): void {
    this.currentCountdown -= deltaTime;

    if (this.currentCountdown <= 0) {
      this.state = RaceState.Racing;
      this.raceStartTime = Date.now();

      if (this.onStateChange) {
        this.onStateChange(this.state);
      }
    }
  }

  /**
   * Update race progress
   */
  private updateRace(deltaTime: number): void {
    this.raceTime = (Date.now() - this.raceStartTime) / 1000;

    // Update each racer
    this.racers.forEach(racer => {
      if (racer.finished || racer.dnf) return;

      racer.totalTime = this.raceTime;

      // Check checkpoint progress
      this.checkCheckpoints(racer);

      // Update distance along track
      this.updateRacerDistance(racer);
    });

    // Update positions
    this.updatePositions();

    // Check if race is finished
    this.checkRaceFinish();
  }

  /**
   * Check if racer passed through checkpoint
   */
  private checkCheckpoints(racer: RacerData): void {
    const position = racer.vehicle.getStats().position;
    const checkpointPassed = this.track.checkCheckpoint(position, racer.lastCheckpoint);

    if (checkpointPassed !== null) {
      racer.lastCheckpoint = checkpointPassed;

      // Check if completed lap (passed checkpoint 0)
      if (checkpointPassed === 0 && racer.currentLap > 0) {
        this.completeLap(racer);
      }

      // First checkpoint marks start of first lap
      if (racer.currentLap === 0 && checkpointPassed === 0) {
        racer.currentLap = 1;
      }
    }
  }

  /**
   * Complete a lap
   */
  private completeLap(racer: RacerData): void {
    racer.currentLap++;

    const lapTime = racer.totalTime - racer.lapTimes.reduce((a, b) => a + b, 0);
    racer.lapTimes.push(lapTime);

    if (lapTime < racer.bestLapTime) {
      racer.bestLapTime = lapTime;
    }

    // Check if finished all laps
    if (racer.currentLap > this.track.lapCount) {
      racer.finished = true;
    }

    if (this.onLapComplete) {
      this.onLapComplete(racer);
    }
  }

  /**
   * Calculate racer's distance along track
   */
  private updateRacerDistance(racer: RacerData): void {
    const trackInfo = this.track.getInfo();
    const trackLength = trackInfo.trackLength;
    const checkpointCount = trackInfo.checkpointCount;

    // Estimate based on checkpoints
    const checkpointProgress = racer.lastCheckpoint / checkpointCount;
    const lapDistance = checkpointProgress * trackLength;

    racer.distanceAlongTrack = (racer.currentLap - 1) * trackLength + lapDistance;
  }

  /**
   * Update racer positions
   */
  private updatePositions(): void {
    // Sort by distance (descending)
    const sorted = [...this.racers].sort((a, b) => {
      // Finished racers first
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;

      // DNF racers last
      if (a.dnf && !b.dnf) return 1;
      if (!a.dnf && b.dnf) return -1;

      // Sort by distance
      return b.distanceAlongTrack - a.distanceAlongTrack;
    });

    // Assign positions
    sorted.forEach((racer, index) => {
      racer.position = index + 1;
    });
  }

  /**
   * Check if race is finished
   */
  private checkRaceFinish(): void {
    const allFinished = this.racers.every(r => r.finished || r.dnf);

    if (allFinished) {
      this.state = RaceState.Finished;

      if (this.onStateChange) {
        this.onStateChange(this.state);
      }

      if (this.onRaceFinish) {
        const results = [...this.racers].sort((a, b) => a.position - b.position);
        this.onRaceFinish(results);
      }
    }
  }

  /**
   * Set event handlers
   */
  public on(event: 'stateChange', handler: (state: RaceState) => void): void;
  public on(event: 'lapComplete', handler: (racer: RacerData) => void): void;
  public on(event: 'raceFinish', handler: (results: RacerData[]) => void): void;
  public on(event: string, handler: any): void {
    switch (event) {
      case 'stateChange':
        this.onStateChange = handler;
        break;
      case 'lapComplete':
        this.onLapComplete = handler;
        break;
      case 'raceFinish':
        this.onRaceFinish = handler;
        break;
    }
  }

  /**
   * Get current race state
   */
  public getState(): RaceState {
    return this.state;
  }

  /**
   * Get countdown value
   */
  public getCountdown(): number {
    return Math.ceil(this.currentCountdown);
  }

  /**
   * Get race time
   */
  public getRaceTime(): number {
    return this.raceTime;
  }

  /**
   * Get all racers
   */
  public getRacers(): RacerData[] {
    return this.racers;
  }

  /**
   * Get player racer
   */
  public getPlayerRacer(): RacerData | undefined {
    return this.racers.find(r => r.isPlayer);
  }

  /**
   * Get racer by name
   */
  public getRacer(name: string): RacerData | undefined {
    return this.racers.find(r => r.name === name);
  }

  /**
   * Get leaderboard (sorted by position)
   */
  public getLeaderboard(): RacerData[] {
    return [...this.racers].sort((a, b) => a.position - b.position);
  }

  /**
   * Format time for display
   */
  public static formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Reset race
   */
  public reset(): void {
    this.state = RaceState.Waiting;
    this.raceStartTime = 0;
    this.raceTime = 0;
    this.currentCountdown = this.countdownTime;

    this.racers.forEach(racer => {
      racer.currentLap = 0;
      racer.lastCheckpoint = -1;
      racer.lapTimes = [];
      racer.bestLapTime = Infinity;
      racer.totalTime = 0;
      racer.position = 0;
      racer.distanceAlongTrack = 0;
      racer.finished = false;
      racer.dnf = false;
    });
  }
}
