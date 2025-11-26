/**
 * @fileoverview Sound occlusion and obstruction for realistic audio propagation.
 * @module audio/AudioOcclusion
 */

import { AudioContext } from './AudioContext';
import { Logger } from '../core/Logger';
import { Vector3 } from '../math/Vector3';

const logger = Logger.getInstance();

export enum OcclusionLevel {
  NONE = 'none',
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
  COMPLETE = 'complete'
}

export interface OcclusionConfig {
  enabled?: boolean;
  filterFrequency?: number;
  volumeReduction?: number;
}

export class AudioOcclusion {
  private filter: BiquadFilterNode;
  private gainNode: GainNode;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private enabled: boolean = true;
  private currentLevel: OcclusionLevel = OcclusionLevel.NONE;

  constructor() {
    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();

    this.inputNode = context.createGain();
    this.outputNode = context.createGain();
    this.filter = context.createBiquadFilter();
    this.gainNode = context.createGain();

    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.gainNode.gain.value = 1.0;

    this.inputNode.connect(this.filter);
    this.filter.connect(this.gainNode);
    this.gainNode.connect(this.outputNode);
  }

  public setOcclusionLevel(level: OcclusionLevel, transitionTime: number = 0.1): void {
    this.currentLevel = level;

    const configs: Record<OcclusionLevel, { frequency: number; volume: number }> = {
      [OcclusionLevel.NONE]: { frequency: 20000, volume: 1.0 },
      [OcclusionLevel.LIGHT]: { frequency: 8000, volume: 0.9 },
      [OcclusionLevel.MEDIUM]: { frequency: 3000, volume: 0.7 },
      [OcclusionLevel.HEAVY]: { frequency: 800, volume: 0.4 },
      [OcclusionLevel.COMPLETE]: { frequency: 200, volume: 0.1 }
    };

    const config = configs[level];
    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();

    if (transitionTime <= 0) {
      this.filter.frequency.setValueAtTime(config.frequency, now);
      this.gainNode.gain.setValueAtTime(config.volume, now);
    } else {
      this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
      this.filter.frequency.linearRampToValueAtTime(config.frequency, now + transitionTime);
      
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(config.volume, now + transitionTime);
    }
  }

  public setCustomOcclusion(filterFrequency: number, volumeReduction: number, transitionTime: number = 0.1): void {
    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();

    if (transitionTime <= 0) {
      this.filter.frequency.setValueAtTime(filterFrequency, now);
      this.gainNode.gain.setValueAtTime(volumeReduction, now);
    } else {
      this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
      this.filter.frequency.linearRampToValueAtTime(filterFrequency, now + transitionTime);
      
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(volumeReduction, now + transitionTime);
    }
  }

  public calculateOcclusion(sourcePos: Vector3, listenerPos: Vector3, obstacles: any[]): OcclusionLevel {
    const direction = listenerPos.clone().sub(sourcePos);
    const distance = direction.length();
    
    let occlusionCount = 0;
    
    for (const obstacle of obstacles) {
      if (this.rayIntersectsObstacle(sourcePos, listenerPos, obstacle)) {
        occlusionCount++;
      }
    }

    if (occlusionCount === 0) return OcclusionLevel.NONE;
    if (occlusionCount === 1) return OcclusionLevel.LIGHT;
    if (occlusionCount === 2) return OcclusionLevel.MEDIUM;
    if (occlusionCount >= 3) return OcclusionLevel.HEAVY;
    
    return OcclusionLevel.MEDIUM;
  }

  public getInput(): AudioNode {
    return this.inputNode;
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    
    if (!enabled) {
      this.setOcclusionLevel(OcclusionLevel.NONE, 0);
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.filter.disconnect();
    this.gainNode.disconnect();
  }

  private rayIntersectsObstacle(start: Vector3, end: Vector3, obstacle: any): boolean {
    return false;
  }
}
