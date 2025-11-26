/**
 * @fileoverview Crossfade manager for smooth track transitions.
 * @module audio/music/CrossfadeManager
 */

import { AudioContext } from '../AudioContext';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

export enum CrossfadeCurve {
  LINEAR = 'linear',
  EQUAL_POWER = 'equal_power',
  EXPONENTIAL = 'exponential',
  S_CURVE = 's_curve'
}

export interface CrossfadeConfig {
  duration: number;
  curve?: CrossfadeCurve;
}

export class CrossfadeManager {
  private context: globalThis.AudioContext;

  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();
  }

  public async crossfade(
    outNode: GainNode,
    inNode: GainNode,
    config: CrossfadeConfig
  ): Promise<void> {
    const duration = config.duration;
    const curve = config.curve ?? CrossfadeCurve.EQUAL_POWER;
    const now = this.context.currentTime;

    const outGain = outNode.gain.value;
    const inGain = inNode.gain.value || 1.0;

    outNode.gain.cancelScheduledValues(now);
    inNode.gain.cancelScheduledValues(now);

    switch (curve) {
      case CrossfadeCurve.LINEAR:
        outNode.gain.setValueAtTime(outGain, now);
        outNode.gain.linearRampToValueAtTime(0, now + duration);
        inNode.gain.setValueAtTime(0, now);
        inNode.gain.linearRampToValueAtTime(inGain, now + duration);
        break;

      case CrossfadeCurve.EQUAL_POWER:
        this.applyEqualPowerCrossfade(outNode, inNode, outGain, inGain, now, duration);
        break;

      case CrossfadeCurve.EXPONENTIAL:
        outNode.gain.setValueAtTime(outGain, now);
        outNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
        inNode.gain.setValueAtTime(0.001, now);
        inNode.gain.exponentialRampToValueAtTime(inGain, now + duration);
        break;

      case CrossfadeCurve.S_CURVE:
        this.applySCurveCrossfade(outNode, inNode, outGain, inGain, now, duration);
        break;
    }

    await new Promise(resolve => setTimeout(resolve, duration * 1000));
  }

  private applyEqualPowerCrossfade(
    outNode: GainNode,
    inNode: GainNode,
    outGain: number,
    inGain: number,
    startTime: number,
    duration: number
  ): void {
    const steps = 20;
    const stepDuration = duration / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const time = startTime + t * duration;
      const angle = t * Math.PI * 0.5;
      
      const outValue = Math.cos(angle) * outGain;
      const inValue = Math.sin(angle) * inGain;

      outNode.gain.linearRampToValueAtTime(outValue, time);
      inNode.gain.linearRampToValueAtTime(inValue, time);
    }
  }

  private applySCurveCrossfade(
    outNode: GainNode,
    inNode: GainNode,
    outGain: number,
    inGain: number,
    startTime: number,
    duration: number
  ): void {
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const time = startTime + t * duration;
      
      const sCurve = (Math.sin((t - 0.5) * Math.PI) + 1) / 2;
      
      const outValue = (1 - sCurve) * outGain;
      const inValue = sCurve * inGain;

      outNode.gain.linearRampToValueAtTime(outValue, time);
      inNode.gain.linearRampToValueAtTime(inValue, time);
    }
  }
}
