/**
 * @fileoverview Environmental reverb zones with spatial blending.
 * @module audio/ReverbZone
 */

import { AudioContext } from './AudioContext';
import { Logger } from '../core/Logger';
import { Vector3 } from '../math/Vector3';

const logger = Logger.getInstance();

export interface ReverbZoneConfig {
  position: Vector3;
  radius: number;
  reverbTime?: number;
  wetLevel?: number;
  dryLevel?: number;
  roomSize?: number;
}

export class ReverbZone {
  private id: string;
  private position: Vector3;
  private radius: number;
  private reverbTime: number;
  private wetLevel: number;
  private dryLevel: number;
  private roomSize: number;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private enabled: boolean = true;

  constructor(id: string, config: ReverbZoneConfig) {
    this.id = id;
    this.position = config.position.clone();
    this.radius = config.radius;
    this.reverbTime = config.reverbTime ?? 2.0;
    this.wetLevel = config.wetLevel ?? 0.5;
    this.dryLevel = config.dryLevel ?? 0.5;
    this.roomSize = config.roomSize ?? 0.5;

    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();

    this.inputNode = context.createGain();
    this.outputNode = context.createGain();
    this.convolver = context.createConvolver();
    this.wetGain = context.createGain();
    this.dryGain = context.createGain();

    this.setupAudioGraph();
    this.generateImpulseResponse();
  }

  public getId(): string {
    return this.id;
  }

  public getPosition(): Vector3 {
    return this.position.clone();
  }

  public setPosition(position: Vector3): void {
    this.position = position.clone();
  }

  public getRadius(): number {
    return this.radius;
  }

  public setRadius(radius: number): void {
    this.radius = Math.max(0, radius);
  }

  public calculateBlend(listenerPosition: Vector3): number {
    const distance = this.position.distanceTo(listenerPosition);
    
    if (distance >= this.radius) {
      return 0;
    }
    
    return 1 - (distance / this.radius);
  }

  public applyBlend(blend: number): void {
    blend = Math.max(0, Math.min(1, blend));
    this.wetGain.gain.value = this.wetLevel * blend;
    this.dryGain.gain.value = this.dryLevel * (1 - blend * 0.5);
  }

  public getInput(): AudioNode {
    return this.inputNode;
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.outputNode.gain.value = enabled ? 1.0 : 0.0;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
    this.convolver.disconnect();
    this.wetGain.disconnect();
    this.dryGain.disconnect();
  }

  private setupAudioGraph(): void {
    this.inputNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.wetGain.gain.value = this.wetLevel;
    this.dryGain.gain.value = this.dryLevel;
  }

  private generateImpulseResponse(): void {
    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();
    
    const sampleRate = context.sampleRate;
    const length = Math.floor(sampleRate * this.reverbTime);
    const impulse = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const decay = Math.exp(-t / this.reverbTime);
        data[i] = (Math.random() * 2 - 1) * decay * this.roomSize;
      }
    }

    this.convolver.buffer = impulse;
  }
}
