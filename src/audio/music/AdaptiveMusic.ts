/**
 * @fileoverview Adaptive music system with layers, stems, and dynamic transitions.
 * @module audio/music/AdaptiveMusic
 */

import { AudioContext } from '../AudioContext';
import { MusicTrack } from './MusicTrack';
import { Logger } from '../../core/Logger';

const logger = Logger.getInstance();

export interface AdaptiveMusicLayer {
  id: string;
  track: MusicTrack;
  intensity: number;
  volume: number;
  enabled: boolean;
}

export enum AdaptiveMusicState {
  CALM = 'calm',
  TENSION = 'tension',
  ACTION = 'action',
  VICTORY = 'victory',
  DEFEAT = 'defeat'
}

export class AdaptiveMusic {
  private context: globalThis.AudioContext;
  private outputNode: GainNode;
  private layers: Map<string, AdaptiveMusicLayer> = new Map();
  private layerSources: Map<string, AudioBufferSourceNode> = new Map();
  private layerGains: Map<string, GainNode> = new Map();
  private currentState: AdaptiveMusicState = AdaptiveMusicState.CALM;
  private intensity: number = 0;
  private playing: boolean = false;

  constructor() {
    const audioContext = AudioContext.getInstance();
    this.context = audioContext.getContext();
    this.outputNode = this.context.createGain();
  }

  public initialize(outputDestination?: AudioNode): void {
    const audioContext = AudioContext.getInstance();
    const destination = outputDestination ?? audioContext.getMasterOutput();
    this.outputNode.connect(destination);
  }

  public addLayer(layer: AdaptiveMusicLayer): void {
    this.layers.set(layer.id, layer);
    
    const gainNode = this.context.createGain();
    gainNode.gain.value = layer.enabled ? layer.volume : 0;
    gainNode.connect(this.outputNode);
    this.layerGains.set(layer.id, gainNode);
  }

  public removeLayer(layerId: string): void {
    this.stopLayer(layerId);
    const gainNode = this.layerGains.get(layerId);
    if (gainNode) {
      gainNode.disconnect();
      this.layerGains.delete(layerId);
    }
    this.layers.delete(layerId);
  }

  public async start(): Promise<void> {
    for (const [id, layer] of this.layers) {
      if (!layer.track.isLoaded()) {
        await layer.track.load(this.context);
      }
      
      const source = this.context.createBufferSource();
      source.buffer = layer.track.getAudioBuffer();
      source.loop = true;
      
      const loopPoints = layer.track.getLoopPoints();
      source.loopStart = loopPoints.start ?? 0;
      source.loopEnd = loopPoints.end ?? layer.track.getDuration();
      
      const gainNode = this.layerGains.get(id);
      if (gainNode) {
        source.connect(gainNode);
        source.start(this.context.currentTime);
        this.layerSources.set(id, source);
      }
    }
    
    this.playing = true;
    this.updateLayerMix();
    logger.info('AdaptiveMusic', 'Started adaptive music');
  }

  public stop(): void {
    for (const [id, source] of this.layerSources) {
      source.stop();
    }
    this.layerSources.clear();
    this.playing = false;
  }

  public setIntensity(intensity: number, transitionTime: number = 1.0): void {
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.updateLayerMix(transitionTime);
  }

  public getIntensity(): number {
    return this.intensity;
  }

  public setState(state: AdaptiveMusicState, transitionTime: number = 2.0): void {
    this.currentState = state;
    
    const stateIntensity: Record<AdaptiveMusicState, number> = {
      [AdaptiveMusicState.CALM]: 0.0,
      [AdaptiveMusicState.TENSION]: 0.4,
      [AdaptiveMusicState.ACTION]: 0.8,
      [AdaptiveMusicState.VICTORY]: 0.5,
      [AdaptiveMusicState.DEFEAT]: 0.2
    };
    
    this.setIntensity(stateIntensity[state], transitionTime);
  }

  public getState(): AdaptiveMusicState {
    return this.currentState;
  }

  public setLayerEnabled(layerId: string, enabled: boolean, fadeTime: number = 1.0): void {
    const layer = this.layers.get(layerId);
    if (!layer) return;
    
    layer.enabled = enabled;
    const gainNode = this.layerGains.get(layerId);
    if (!gainNode) return;
    
    const targetVolume = enabled ? layer.volume : 0;
    const now = this.context.currentTime;
    
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(targetVolume, now + fadeTime);
  }

  public getOutput(): AudioNode {
    return this.outputNode;
  }

  public dispose(): void {
    this.stop();
    this.outputNode.disconnect();
    for (const gainNode of this.layerGains.values()) {
      gainNode.disconnect();
    }
    this.layerGains.clear();
    this.layers.clear();
  }

  private updateLayerMix(transitionTime: number = 1.0): void {
    const now = this.context.currentTime;
    
    for (const [id, layer] of this.layers) {
      if (!layer.enabled) continue;
      
      const gainNode = this.layerGains.get(id);
      if (!gainNode) continue;
      
      let targetVolume = 0;
      
      if (this.intensity >= layer.intensity) {
        const intensityRange = 1.0 - layer.intensity;
        const intensityAbove = this.intensity - layer.intensity;
        targetVolume = layer.volume * Math.min(1.0, intensityAbove / Math.max(0.1, intensityRange));
      }
      
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(targetVolume, now + transitionTime);
    }
  }

  private stopLayer(layerId: string): void {
    const source = this.layerSources.get(layerId);
    if (source) {
      source.stop();
      this.layerSources.delete(layerId);
    }
  }
}
