/**
 * @fileoverview Audio mixer with bus/group system for the G3D engine.
 * Provides hierarchical audio mixing with per-group volume and effects.
 * @module audio/AudioMixer
 */

import { AudioContext } from './AudioContext';

/**
 * Audio mixer bus (group) configuration.
 *
 * @example
 * ```typescript
 * const busConfig: AudioBusConfig = {
 *   name: 'Music',
 *   volume: 0.7,
 *   parent: 'Master'
 * };
 * ```
 */
export interface AudioBusConfig {
  /**
   * Bus name identifier.
   */
  name: string;

  /**
   * Initial volume (0.0 to 1.0, default: 1.0).
   */
  volume?: number;

  /**
   * Parent bus name for hierarchical mixing (default: null = root).
   */
  parent?: string | null;

  /**
   * Enable bus (default: true).
   */
  enabled?: boolean;
}

/**
 * Audio bus for grouping and mixing audio sources.
 *
 * Buses form a hierarchy allowing volume control at different levels:
 * - Master: All audio
 *   - Music: Background music
 *   - SFX: Sound effects
 *     - Footsteps
 *     - Weapons
 *   - Voice: Dialog and voiceovers
 *
 * @example
 * ```typescript
 * const bus = new AudioBus('SFX', mixer);
 * bus.setVolume(0.8);
 *
 * // Connect audio source to bus
 * const source = context.createBufferSource();
 * source.connect(bus.getInput());
 *
 * // Apply effects
 * bus.addEffect(reverbNode);
 * ```
 */
export class AudioBus {
  private name: string;
  private mixer: AudioMixer;
  private parent: AudioBus | null = null;
  private children: AudioBus[] = [];

  private inputNode: GainNode;
  private outputNode: GainNode;
  private effectsChain: AudioNode[] = [];

  private volume: number = 1.0;
  private enabled: boolean = true;
  private solo: boolean = false;
  private muted: boolean = false;

  /**
   * Creates a new audio bus.
   *
   * @param name - Bus identifier
   * @param mixer - Parent mixer
   * @param config - Configuration options
   *
   * @example
   * ```typescript
   * const bus = new AudioBus('Music', mixer);
   * ```
   */
  constructor(name: string, mixer: AudioMixer, config?: Partial<AudioBusConfig>) {
    this.name = name;
    this.mixer = mixer;

    const audioContext = AudioContext.getInstance();
    const context = audioContext.getContext();

    // Create input and output gain nodes
    this.inputNode = context.createGain();
    this.outputNode = context.createGain();

    // Initial connection (no effects)
    this.inputNode.connect(this.outputNode);

    // Apply config
    if (config) {
      if (config.volume !== undefined) this.setVolume(config.volume);
      if (config.enabled !== undefined) this.enabled = config.enabled;
    }
  }

  /**
   * Gets the bus name.
   *
   * @returns Bus name
   *
   * @example
   * ```typescript
   * console.log(`Bus: ${bus.getName()}`);
   * ```
   */
  public getName(): string {
    return this.name;
  }

  /**
   * Gets the input node for connecting audio sources.
   *
   * @returns Input GainNode
   *
   * @example
   * ```typescript
   * const input = bus.getInput();
   * audioSource.connect(input);
   * ```
   */
  public getInput(): GainNode {
    return this.inputNode;
  }

  /**
   * Gets the output node for connecting to other buses or destination.
   *
   * @returns Output GainNode
   *
   * @example
   * ```typescript
   * const output = bus.getOutput();
   * output.connect(masterBus.getInput());
   * ```
   */
  public getOutput(): GainNode {
    return this.outputNode;
  }

  /**
   * Sets the bus volume.
   *
   * @param volume - Volume level (0.0 to 1.0)
   * @param rampTime - Ramp time in seconds (default: 0.05)
   *
   * @example
   * ```typescript
   * bus.setVolume(0.5, 1.0); // Fade to 50% over 1 second
   * ```
   */
  public setVolume(volume: number, rampTime: number = 0.05): void {
    volume = Math.max(0, Math.min(1, volume));
    this.volume = volume;

    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();

    if (rampTime <= 0) {
      this.outputNode.gain.setValueAtTime(volume, now);
    } else {
      this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, now);
      this.outputNode.gain.linearRampToValueAtTime(volume, now + rampTime);
    }
  }

  /**
   * Gets the bus volume.
   *
   * @returns Volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const vol = bus.getVolume();
   * ```
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Gets the effective volume including parent bus volumes.
   *
   * @returns Effective volume (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const effectiveVol = bus.getEffectiveVolume();
   * ```
   */
  public getEffectiveVolume(): number {
    let vol = this.volume;
    let parent = this.parent;

    while (parent) {
      vol *= parent.getVolume();
      parent = parent.getParent();
    }

    return vol;
  }

  /**
   * Mutes the bus.
   *
   * @param mute - Mute state
   *
   * @example
   * ```typescript
   * bus.setMute(true); // Mute
   * bus.setMute(false); // Unmute
   * ```
   */
  public setMute(mute: boolean): void {
    this.muted = mute;
    this.updateMuteState();
  }

  /**
   * Gets the mute state.
   *
   * @returns True if muted
   *
   * @example
   * ```typescript
   * if (bus.isMuted()) {
   *   console.log('Bus is muted');
   * }
   * ```
   */
  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Sets solo mode (mutes all other buses at same level).
   *
   * @param solo - Solo state
   *
   * @example
   * ```typescript
   * bus.setSolo(true); // Solo this bus
   * ```
   */
  public setSolo(solo: boolean): void {
    this.solo = solo;
    this.mixer.updateSoloStates();
  }

  /**
   * Gets the solo state.
   *
   * @returns True if soloed
   *
   * @example
   * ```typescript
   * if (bus.isSoloed()) {
   *   console.log('Bus is soloed');
   * }
   * ```
   */
  public isSoloed(): boolean {
    return this.solo;
  }

  /**
   * Adds an audio effect to the bus.
   * Effects are chained in the order they're added.
   *
   * @param effect - Audio node to add to effects chain
   *
   * @example
   * ```typescript
   * const reverb = context.createConvolver();
   * bus.addEffect(reverb);
   * ```
   */
  public addEffect(effect: AudioNode): void {
    this.effectsChain.push(effect);
    this.rebuildEffectsChain();
  }

  /**
   * Removes an effect from the bus.
   *
   * @param effect - Audio node to remove
   * @returns True if removed
   *
   * @example
   * ```typescript
   * bus.removeEffect(reverb);
   * ```
   */
  public removeEffect(effect: AudioNode): boolean {
    const index = this.effectsChain.indexOf(effect);
    if (index === -1) {
      return false;
    }

    this.effectsChain.splice(index, 1);
    this.rebuildEffectsChain();
    return true;
  }

  /**
   * Clears all effects from the bus.
   *
   * @example
   * ```typescript
   * bus.clearEffects();
   * ```
   */
  public clearEffects(): void {
    this.effectsChain.length = 0;
    this.rebuildEffectsChain();
  }

  /**
   * Gets the parent bus.
   *
   * @returns Parent bus or null
   *
   * @example
   * ```typescript
   * const parent = bus.getParent();
   * ```
   */
  public getParent(): AudioBus | null {
    return this.parent;
  }

  /**
   * Sets the parent bus.
   *
   * @param parent - Parent bus or null
   *
   * @example
   * ```typescript
   * bus.setParent(masterBus);
   * ```
   */
  public setParent(parent: AudioBus | null): void {
    // Disconnect from old parent
    if (this.parent) {
      const index = this.parent.children.indexOf(this);
      if (index !== -1) {
        this.parent.children.splice(index, 1);
      }
      this.outputNode.disconnect();
    }

    // Connect to new parent
    this.parent = parent;
    if (parent) {
      parent.children.push(this);
      this.outputNode.connect(parent.getInput());
    }
  }

  /**
   * Gets child buses.
   *
   * @returns Array of child buses
   *
   * @example
   * ```typescript
   * const children = bus.getChildren();
   * ```
   */
  public getChildren(): AudioBus[] {
    return [...this.children];
  }

  /**
   * Disposes the bus and disconnects all nodes.
   *
   * @example
   * ```typescript
   * bus.dispose();
   * ```
   */
  public dispose(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();

    for (const effect of this.effectsChain) {
      effect.disconnect();
    }

    this.effectsChain.length = 0;
    this.children.length = 0;
    this.parent = null;
  }

  /**
   * Updates mute state based on solo/mute settings.
   * @internal
   */
  public updateMuteState(): void {
    const shouldMute = this.muted || (this.mixer.hasSoloBuses() && !this.solo);
    const targetGain = shouldMute ? 0 : this.volume;

    const audioContext = AudioContext.getInstance();
    const now = audioContext.getCurrentTime();
    this.outputNode.gain.setValueAtTime(targetGain, now);
  }

  /**
   * Rebuilds the effects chain connections.
   */
  private rebuildEffectsChain(): void {
    // Disconnect everything
    this.inputNode.disconnect();
    for (const effect of this.effectsChain) {
      effect.disconnect();
    }

    // Reconnect with effects
    if (this.effectsChain.length === 0) {
      this.inputNode.connect(this.outputNode);
    } else {
      this.inputNode.connect(this.effectsChain[0]);

      for (let i = 0; i < this.effectsChain.length - 1; i++) {
        this.effectsChain[i].connect(this.effectsChain[i + 1]);
      }

      this.effectsChain[this.effectsChain.length - 1].connect(this.outputNode);
    }
  }
}

/**
 * Audio mixer managing multiple audio buses.
 *
 * Provides hierarchical audio mixing with master, music, SFX, and voice groups.
 * Each bus can have its own volume, mute/solo state, and effects chain.
 *
 * @example
 * ```typescript
 * // Create mixer
 * const mixer = new AudioMixer();
 * mixer.initialize();
 *
 * // Get standard buses
 * const masterBus = mixer.getMasterBus();
 * const musicBus = mixer.getBus('Music');
 * const sfxBus = mixer.getBus('SFX');
 *
 * // Create custom bus
 * mixer.createBus('Footsteps', { parent: 'SFX', volume: 0.5 });
 *
 * // Control volumes
 * mixer.setMasterVolume(0.8);
 * mixer.setBusVolume('Music', 0.6);
 * mixer.setBusVolume('SFX', 0.9);
 *
 * // Connect audio source to bus
 * const source = context.createBufferSource();
 * source.connect(sfxBus.getInput());
 * source.start();
 * ```
 */
export class AudioMixer {
  private buses: Map<string, AudioBus> = new Map();
  private masterBus: AudioBus | null = null;
  private initialized: boolean = false;

  /**
   * Creates a new audio mixer.
   *
   * @example
   * ```typescript
   * const mixer = new AudioMixer();
   * ```
   */
  constructor() {}

  /**
   * Initializes the mixer with standard buses.
   * Creates Master, Music, SFX, and Voice buses.
   *
   * @example
   * ```typescript
   * mixer.initialize();
   * ```
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    const audioContext = AudioContext.getInstance();
    const masterOutput = audioContext.getMasterOutput();

    // Create master bus
    this.masterBus = new AudioBus('Master', this);
    this.buses.set('Master', this.masterBus);
    this.masterBus.getOutput().connect(masterOutput);

    // Create standard buses
    this.createBus('Music', { parent: 'Master', volume: 1.0 });
    this.createBus('SFX', { parent: 'Master', volume: 1.0 });
    this.createBus('Voice', { parent: 'Master', volume: 1.0 });

    this.initialized = true;
  }

  /**
   * Creates a new audio bus.
   *
   * @param name - Bus name
   * @param config - Bus configuration
   * @returns Created bus
   *
   * @example
   * ```typescript
   * const footstepsBus = mixer.createBus('Footsteps', {
   *   parent: 'SFX',
   *   volume: 0.7
   * });
   * ```
   */
  public createBus(name: string, config?: Partial<AudioBusConfig>): AudioBus {
    if (this.buses.has(name)) {
      throw new Error(`Bus "${name}" already exists`);
    }

    const bus = new AudioBus(name, this, config);
    this.buses.set(name, bus);

    // Connect to parent
    if (config?.parent) {
      const parent = this.buses.get(config.parent);
      if (parent) {
        bus.setParent(parent);
      }
    }

    return bus;
  }

  /**
   * Gets a bus by name.
   *
   * @param name - Bus name
   * @returns Bus or undefined if not found
   *
   * @example
   * ```typescript
   * const musicBus = mixer.getBus('Music');
   * ```
   */
  public getBus(name: string): AudioBus | undefined {
    return this.buses.get(name);
  }

  /**
   * Gets the master bus.
   *
   * @returns Master bus
   * @throws Error if not initialized
   *
   * @example
   * ```typescript
   * const master = mixer.getMasterBus();
   * ```
   */
  public getMasterBus(): AudioBus {
    if (!this.masterBus) {
      throw new Error('Mixer not initialized');
    }
    return this.masterBus;
  }

  /**
   * Removes a bus.
   *
   * @param name - Bus name
   * @returns True if removed
   *
   * @example
   * ```typescript
   * mixer.removeBus('Footsteps');
   * ```
   */
  public removeBus(name: string): boolean {
    if (name === 'Master') {
      throw new Error('Cannot remove master bus');
    }

    const bus = this.buses.get(name);
    if (!bus) {
      return false;
    }

    bus.dispose();
    this.buses.delete(name);
    return true;
  }

  /**
   * Sets the master volume.
   *
   * @param volume - Volume (0.0 to 1.0)
   * @param rampTime - Ramp time in seconds
   *
   * @example
   * ```typescript
   * mixer.setMasterVolume(0.5);
   * ```
   */
  public setMasterVolume(volume: number, rampTime?: number): void {
    if (this.masterBus) {
      this.masterBus.setVolume(volume, rampTime);
    }
  }

  /**
   * Gets the master volume.
   *
   * @returns Master volume
   *
   * @example
   * ```typescript
   * const vol = mixer.getMasterVolume();
   * ```
   */
  public getMasterVolume(): number {
    return this.masterBus ? this.masterBus.getVolume() : 1.0;
  }

  /**
   * Sets a bus volume by name.
   *
   * @param name - Bus name
   * @param volume - Volume (0.0 to 1.0)
   * @param rampTime - Ramp time in seconds
   *
   * @example
   * ```typescript
   * mixer.setBusVolume('Music', 0.6);
   * ```
   */
  public setBusVolume(name: string, volume: number, rampTime?: number): void {
    const bus = this.buses.get(name);
    if (bus) {
      bus.setVolume(volume, rampTime);
    }
  }

  /**
   * Gets a bus volume by name.
   *
   * @param name - Bus name
   * @returns Volume or 1.0 if not found
   *
   * @example
   * ```typescript
   * const vol = mixer.getBusVolume('SFX');
   * ```
   */
  public getBusVolume(name: string): number {
    const bus = this.buses.get(name);
    return bus ? bus.getVolume() : 1.0;
  }

  /**
   * Checks if any buses are soloed.
   *
   * @returns True if any bus is soloed
   * @internal
   */
  public hasSoloBuses(): boolean {
    for (const bus of this.buses.values()) {
      if (bus.isSoloed()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Updates all bus mute states based on solo settings.
   * @internal
   */
  public updateSoloStates(): void {
    for (const bus of this.buses.values()) {
      bus.updateMuteState();
    }
  }

  /**
   * Disposes the mixer and all buses.
   *
   * @example
   * ```typescript
   * mixer.dispose();
   * ```
   */
  public dispose(): void {
    for (const bus of this.buses.values()) {
      bus.dispose();
    }

    this.buses.clear();
    this.masterBus = null;
    this.initialized = false;
  }
}
