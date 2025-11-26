/**
 * @fileoverview Music playlist management with shuffle and repeat modes.
 * @module audio/music/MusicPlaylist
 */

import { MusicTrack } from './MusicTrack';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

export enum RepeatMode {
  OFF = 'off',
  ONE = 'one',
  ALL = 'all'
}

export interface PlaylistConfig {
  shuffle?: boolean;
  repeatMode?: RepeatMode;
  autoAdvance?: boolean;
}

export class MusicPlaylist {
  private name: string;
  private tracks: MusicTrack[] = [];
  private shuffledIndices: number[] = [];
  private currentIndex: number = -1;
  private shuffle: boolean = false;
  private repeatMode: RepeatMode = RepeatMode.OFF;
  private autoAdvance: boolean = true;

  constructor(name: string, config: PlaylistConfig = {}) {
    this.name = name;
    this.shuffle = config.shuffle ?? false;
    this.repeatMode = config.repeatMode ?? RepeatMode.OFF;
    this.autoAdvance = config.autoAdvance ?? true;
  }

  public getName(): string {
    return this.name;
  }

  public addTrack(track: MusicTrack): void {
    this.tracks.push(track);
    if (this.shuffle) {
      this.regenerateShuffleIndices();
    }
  }

  public removeTrack(index: number): boolean {
    if (index < 0 || index >= this.tracks.length) return false;
    this.tracks.splice(index, 1);
    if (this.shuffle) {
      this.regenerateShuffleIndices();
    }
    return true;
  }

  public getTracks(): MusicTrack[] {
    return [...this.tracks];
  }

  public getTrackCount(): number {
    return this.tracks.length;
  }

  public getCurrentTrack(): MusicTrack | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.tracks.length) {
      return null;
    }
    const actualIndex = this.shuffle ? this.shuffledIndices[this.currentIndex] : this.currentIndex;
    return this.tracks[actualIndex];
  }

  public next(): MusicTrack | null {
    if (this.tracks.length === 0) return null;

    if (this.repeatMode === RepeatMode.ONE) {
      return this.getCurrentTrack();
    }

    this.currentIndex++;

    if (this.currentIndex >= this.tracks.length) {
      if (this.repeatMode === RepeatMode.ALL) {
        this.currentIndex = 0;
        if (this.shuffle) {
          this.regenerateShuffleIndices();
        }
      } else {
        this.currentIndex = -1;
        return null;
      }
    }

    return this.getCurrentTrack();
  }

  public previous(): MusicTrack | null {
    if (this.tracks.length === 0) return null;

    if (this.repeatMode === RepeatMode.ONE) {
      return this.getCurrentTrack();
    }

    this.currentIndex--;

    if (this.currentIndex < 0) {
      if (this.repeatMode === RepeatMode.ALL) {
        this.currentIndex = this.tracks.length - 1;
      } else {
        this.currentIndex = 0;
      }
    }

    return this.getCurrentTrack();
  }

  public setCurrentIndex(index: number): void {
    if (index >= 0 && index < this.tracks.length) {
      this.currentIndex = index;
    }
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public setShuffle(enabled: boolean): void {
    this.shuffle = enabled;
    if (enabled) {
      this.regenerateShuffleIndices();
    }
  }

  public isShuffle(): boolean {
    return this.shuffle;
  }

  public setRepeatMode(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  public getRepeatMode(): RepeatMode {
    return this.repeatMode;
  }

  public setAutoAdvance(enabled: boolean): void {
    this.autoAdvance = enabled;
  }

  public isAutoAdvance(): boolean {
    return this.autoAdvance;
  }

  public clear(): void {
    this.tracks = [];
    this.shuffledIndices = [];
    this.currentIndex = -1;
  }

  private regenerateShuffleIndices(): void {
    this.shuffledIndices = Array.from({ length: this.tracks.length }, (_, i) => i);
    
    for (let i = this.shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledIndices[i], this.shuffledIndices[j]] = [this.shuffledIndices[j], this.shuffledIndices[i]];
    }
  }
}
