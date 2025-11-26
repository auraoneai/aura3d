/**
 * @fileoverview Audio bus routing for master, SFX, music, voice, and ambient channels.
 * @module audio/AudioBus
 */

import { AudioContext } from './AudioContext';
import { Logger } from '../core/Logger';

const logger = Logger.getInstance();

export enum AudioBusType {
  MASTER = 'master',
  MUSIC = 'music',
  SFX = 'sfx',
  VOICE = 'voice',
  AMBIENT = 'ambient',
  UI = 'ui',
  CUSTOM = 'custom'
}

export interface AudioBusConfig {
  name: string;
  type: AudioBusType;
  volume?: number;
  parent?: string;
}

export class AudioBus {
  private name: string;
  private type: AudioBusType;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private volumeNode: GainNode;
  private parent: AudioBus | null = null;
  private children: AudioBus[] = [];
  private effects: AudioNode[] = [];
  private muted: boolean = false;
  private solo: boolean = false;

  constructor(config: AudioBusConfig) {
    this.name = config.name;
    this.type = config.type;

    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();

    this.inputNode = context.createGain();
    this.volumeNode = context.createGain();
    this.outputNode = context.createGain();

    this.volumeNode.gain.value = config.volume ?? 1.0;

    this.inputNode.connect(this.volumeNode);
    this.volumeNode.connect(this.outputNode);
  }

  public getName(): string {
    return this.name;
  }

  public getType(): AudioBusType {
    return this.type;
  }

  public getInput(): GainNode {
    return this.inputNode;
  }

  public getOutput(): GainNode {
    return this.outputNode;
  }

  public setVolume(volume: number, rampTime: number = 0): void {
    volume = Math.max(0, Math.min(1, volume));
    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();

    if (rampTime <= 0) {
      this.volumeNode.gain.setValueAtTime(volume, now);
    } else {
      this.volumeNode.gain.setValueAtTime(this.volumeNode.gain.value, now);
      this.volumeNode.gain.linearRampToValueAtTime(volume, now + rampTime);
    }
  }

  public getVolume(): number {
    return this.volumeNode.gain.value;
  }

  public setMute(muted: boolean): void {
    this.muted = muted;
    this.updateOutputState();
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setSolo(solo: boolean): void {
    this.solo = solo;
    this.updateOutputState();
  }

  public isSolo(): boolean {
    return this.solo;
  }

  public setParent(parent: AudioBus | null): void {
    if (this.parent) {
      this.outputNode.disconnect();
      const index = this.parent.children.indexOf(this);
      if (index !== -1) {
        this.parent.children.splice(index, 1);
      }
    }

    this.parent = parent;

    if (parent) {
      parent.children.push(this);
      this.outputNode.connect(parent.getInput());
    }
  }

  public getParent(): AudioBus | null {
    return this.parent;
  }

  public getChildren(): AudioBus[] {
    return [...this.children];
  }

  public addEffect(effect: AudioNode): void {
    this.effects.push(effect);
    this.rebuildEffectChain();
  }

  public removeEffect(effect: AudioNode): boolean {
    const index = this.effects.indexOf(effect);
    if (index === -1) return false;

    this.effects.splice(index, 1);
    this.rebuildEffectChain();
    return true;
  }

  public clearEffects(): void {
    this.effects = [];
    this.rebuildEffectChain();
  }

  public dispose(): void {
    this.setParent(null);
    this.clearEffects();
    this.inputNode.disconnect();
    this.volumeNode.disconnect();
    this.outputNode.disconnect();
  }

  private updateOutputState(): void {
    const shouldMute = this.muted;
    this.outputNode.gain.value = shouldMute ? 0 : 1;
  }

  private rebuildEffectChain(): void {
    this.volumeNode.disconnect();
    
    if (this.effects.length === 0) {
      this.volumeNode.connect(this.outputNode);
    } else {
      this.volumeNode.connect(this.effects[0]);
      
      for (let i = 0; i < this.effects.length - 1; i++) {
        this.effects[i].disconnect();
        this.effects[i].connect(this.effects[i + 1]);
      }
      
      this.effects[this.effects.length - 1].disconnect();
      this.effects[this.effects.length - 1].connect(this.outputNode);
    }
  }
}
