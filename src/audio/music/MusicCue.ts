/**
 * @fileoverview Music cue points for synchronization and event triggering.
 * @module audio/music/MusicCue
 */

import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

export interface MusicCuePoint {
  time: number;
  label: string;
  data?: any;
}

export type MusicCueCallback = (cue: MusicCuePoint) => void;

export class MusicCue {
  private cuePoints: MusicCuePoint[] = [];
  private listeners: MusicCueCallback[] = [];
  private lastTriggeredIndex: number = -1;

  public addCuePoint(cue: MusicCuePoint): void {
    this.cuePoints.push(cue);
    this.cuePoints.sort((a, b) => a.time - b.time);
  }

  public removeCuePoint(time: number): boolean {
    const index = this.cuePoints.findIndex(cue => cue.time === time);
    if (index === -1) return false;
    this.cuePoints.splice(index, 1);
    return true;
  }

  public getCuePoints(): MusicCuePoint[] {
    return [...this.cuePoints];
  }

  public addListener(callback: MusicCueCallback): void {
    this.listeners.push(callback);
  }

  public removeListener(callback: MusicCueCallback): void {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  public update(currentTime: number): void {
    for (let i = this.lastTriggeredIndex + 1; i < this.cuePoints.length; i++) {
      const cue = this.cuePoints[i];
      
      if (currentTime >= cue.time) {
        this.triggerCue(cue);
        this.lastTriggeredIndex = i;
      } else {
        break;
      }
    }
  }

  public reset(): void {
    this.lastTriggeredIndex = -1;
  }

  public clear(): void {
    this.cuePoints = [];
    this.listeners = [];
    this.lastTriggeredIndex = -1;
  }

  private triggerCue(cue: MusicCuePoint): void {
    logger.debug('MusicCue', `Triggered cue: ${cue.label} at ${cue.time}s`);

    for (const listener of this.listeners) {
      listener(cue);
    }
  }
}