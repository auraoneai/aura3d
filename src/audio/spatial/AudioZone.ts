import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Zone shape types
 */
export enum ZoneShape {
  /** Spherical zone */
  SPHERE = 'sphere',
  /** Box-shaped zone */
  BOX = 'box',
  /** Cylindrical zone */
  CYLINDER = 'cylinder'
}

/**
 * Zone configuration
 */
export interface AudioZoneConfig {
  /** Zone shape */
  shape?: ZoneShape;
  /** Zone center position */
  position?: Vector3;
  /** Zone size (radius for sphere, dimensions for box) */
  size?: Vector3;
  /** Volume multiplier inside the zone */
  innerGain?: number;
  /** Volume multiplier outside the zone */
  outerGain?: number;
  /** Transition width between inner and outer zones */
  transitionWidth?: number;
  /** Reverb settings for the zone */
  reverb?: ReverbConfig;
}

/**
 * Reverb configuration
 */
export interface ReverbConfig {
  /** Reverb enable state */
  enabled: boolean;
  /** Reverb decay time in seconds */
  decayTime?: number;
  /** Pre-delay in seconds */
  preDelay?: number;
  /** Wet/dry mix (0-1) */
  mix?: number;
  /** Impulse response for convolution reverb */
  impulseResponse?: AudioBuffer;
}

/**
 * Zone entry/exit event data
 */
export interface ZoneEvent {
  /** Zone identifier */
  zoneId: string;
  /** Listener position */
  position: Vector3;
  /** Whether entering (true) or exiting (false) */
  entering: boolean;
  /** Distance from zone center */
  distance: number;
}

/**
 * Spatial audio zone with attenuation and reverb.
 * Creates areas with different acoustic properties and volume levels.
 *
 * @example
 * ```typescript
 * const zone = new AudioZone(audioContext, {
 *   position: new Vector3(0, 0, 0),
 *   size: new Vector3(10, 10, 10),
 *   innerGain: 1.0,
 *   outerGain: 0.3
 * });
 * zone.updateListenerPosition(listenerPos);
 * ```
 */
export class AudioZone {
  private logger: Logger;
  private audioContext: AudioContext;
  private config: Required<Omit<AudioZoneConfig, 'reverb'>> & { reverb?: ReverbConfig };

  private id: string;
  private inputNode: GainNode;
  private outputNode: GainNode;
  private attenuationNode: GainNode;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode;

  private listenerPosition: Vector3 = new Vector3(0, 0, 0);
  private isListenerInside: boolean = false;
  private currentBlend: number = 0;

  private onEnterCallbacks: Array<(event: ZoneEvent) => void> = [];
  private onExitCallbacks: Array<(event: ZoneEvent) => void> = [];

  private static nextZoneId: number = 0;

  /**
   * Creates a new AudioZone instance
   *
   * @param audioContext - Web Audio API audio context
   * @param config - Zone configuration
   */
  constructor(audioContext: AudioContext, config: AudioZoneConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;

    this.id = `zone_${AudioZone.nextZoneId++}`;

    this.config = {
      shape: config.shape ?? ZoneShape.SPHERE,
      position: config.position?.clone() ?? new Vector3(0, 0, 0),
      size: config.size?.clone() ?? new Vector3(10, 10, 10),
      innerGain: config.innerGain ?? 1.0,
      outerGain: config.outerGain ?? 0.5,
      transitionWidth: config.transitionWidth ?? 2.0,
      reverb: config.reverb
    };

    this.inputNode = audioContext.createGain();
    this.outputNode = audioContext.createGain();
    this.attenuationNode = audioContext.createGain();
    this.dryGain = audioContext.createGain();

    this.setupAudioGraph();

    if (this.config.reverb?.enabled) {
      this.setupReverb(this.config.reverb);
    }

    this.logger.info('AudioZone', `Created zone ${this.id} at ${this.config.position.toString()}`);
  }

  /**
   * Sets up the audio routing graph
   */
  private setupAudioGraph(): void {
    this.inputNode.connect(this.attenuationNode);
    this.attenuationNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
  }

  /**
   * Sets up reverb processing
   *
   * @param reverbConfig - Reverb configuration
   */
  private setupReverb(reverbConfig: ReverbConfig): void {
    this.reverbGain = this.audioContext.createGain();
    this.reverbGain.gain.value = reverbConfig.mix ?? 0.3;

    if (reverbConfig.impulseResponse) {
      this.reverbNode = this.audioContext.createConvolver();
      this.reverbNode.buffer = reverbConfig.impulseResponse;

      this.attenuationNode.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.outputNode);

      this.dryGain.gain.value = 1 - (reverbConfig.mix ?? 0.3);
    }
  }

  /**
   * Calculates the distance from a point to the zone
   *
   * @param position - Point position
   * @returns Distance (negative if inside)
   */
  private calculateDistance(position: Vector3): number {
    const relativePos = position.clone().sub(this.config.position);

    switch (this.config.shape) {
      case ZoneShape.SPHERE: {
        const distance = relativePos.length();
        const radius = this.config.size.x;
        return distance - radius;
      }

      case ZoneShape.BOX: {
        const halfSize = this.config.size.clone().multiplyScalar(0.5);
        const dx = Math.max(0, Math.abs(relativePos.x) - halfSize.x);
        const dy = Math.max(0, Math.abs(relativePos.y) - halfSize.y);
        const dz = Math.max(0, Math.abs(relativePos.z) - halfSize.z);

        const isInside = Math.abs(relativePos.x) < halfSize.x &&
                        Math.abs(relativePos.y) < halfSize.y &&
                        Math.abs(relativePos.z) < halfSize.z;

        if (isInside) {
          const distX = halfSize.x - Math.abs(relativePos.x);
          const distY = halfSize.y - Math.abs(relativePos.y);
          const distZ = halfSize.z - Math.abs(relativePos.z);
          return -Math.min(distX, distY, distZ);
        }

        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      case ZoneShape.CYLINDER: {
        const radius = this.config.size.x;
        const height = this.config.size.y;
        const halfHeight = height / 2;

        const radialDist = Math.sqrt(relativePos.x * relativePos.x + relativePos.z * relativePos.z);
        const verticalDist = Math.abs(relativePos.y) - halfHeight;

        if (radialDist < radius && Math.abs(relativePos.y) < halfHeight) {
          const distR = radius - radialDist;
          const distV = halfHeight - Math.abs(relativePos.y);
          return -Math.min(distR, distV);
        }

        const rDist = Math.max(0, radialDist - radius);
        const vDist = Math.max(0, verticalDist);

        return Math.sqrt(rDist * rDist + vDist * vDist);
      }

      default:
        return 0;
    }
  }

  /**
   * Calculates blend factor for smooth transitions
   *
   * @param distance - Distance from zone boundary
   * @returns Blend factor (0-1, 0 = fully outside, 1 = fully inside)
   */
  private calculateBlend(distance: number): number {
    if (distance <= 0) {
      return 1;
    }

    if (distance >= this.config.transitionWidth) {
      return 0;
    }

    const t = distance / this.config.transitionWidth;
    return 1 - (3 * t * t - 2 * t * t * t);
  }

  /**
   * Updates listener position and zone attenuation
   *
   * @param position - Listener position
   */
  updateListenerPosition(position: Vector3): void {
    this.listenerPosition.copy(position);

    const distance = this.calculateDistance(position);
    const blend = this.calculateBlend(distance);
    const wasInside = this.isListenerInside;
    const isInside = distance <= 0;

    this.currentBlend = blend;
    const gain = this.config.outerGain + (this.config.innerGain - this.config.outerGain) * blend;
    this.attenuationNode.gain.value = gain;

    if (wasInside !== isInside) {
      this.isListenerInside = isInside;

      const event: ZoneEvent = {
        zoneId: this.id,
        position: position.clone(),
        entering: isInside,
        distance: Math.abs(distance)
      };

      if (isInside) {
        this.onEnterCallbacks.forEach(callback => callback(event));
      } else {
        this.onExitCallbacks.forEach(callback => callback(event));
      }
    }
  }

  /**
   * Registers a callback for zone entry
   *
   * @param callback - Function to call when entering the zone
   */
  onEnter(callback: (event: ZoneEvent) => void): void {
    this.onEnterCallbacks.push(callback);
  }

  /**
   * Registers a callback for zone exit
   *
   * @param callback - Function to call when exiting the zone
   */
  onExit(callback: (event: ZoneEvent) => void): void {
    this.onExitCallbacks.push(callback);
  }

  /**
   * Removes an enter callback
   *
   * @param callback - Callback to remove
   */
  offEnter(callback: (event: ZoneEvent) => void): void {
    const index = this.onEnterCallbacks.indexOf(callback);
    if (index !== -1) {
      this.onEnterCallbacks.splice(index, 1);
    }
  }

  /**
   * Removes an exit callback
   *
   * @param callback - Callback to remove
   */
  offExit(callback: (event: ZoneEvent) => void): void {
    const index = this.onExitCallbacks.indexOf(callback);
    if (index !== -1) {
      this.onExitCallbacks.splice(index, 1);
    }
  }

  /**
   * Checks if a position is inside the zone
   *
   * @param position - Position to check
   * @returns True if inside the zone
   */
  isInside(position: Vector3): boolean {
    return this.calculateDistance(position) <= 0;
  }

  /**
   * Gets the current blend factor
   *
   * @returns Blend factor (0-1)
   */
  getBlend(): number {
    return this.currentBlend;
  }

  /**
   * Gets the zone ID
   *
   * @returns Zone identifier
   */
  getId(): string {
    return this.id;
  }

  /**
   * Gets the zone position
   *
   * @returns Zone center position
   */
  getPosition(): Vector3 {
    return this.config.position.clone();
  }

  /**
   * Sets the zone position
   *
   * @param position - New zone position
   */
  setPosition(position: Vector3): void {
    this.config.position.copy(position);
    this.updateListenerPosition(this.listenerPosition);
  }

  /**
   * Gets the zone size
   *
   * @returns Zone size
   */
  getSize(): Vector3 {
    return this.config.size.clone();
  }

  /**
   * Sets the zone size
   *
   * @param size - New zone size
   */
  setSize(size: Vector3): void {
    this.config.size.copy(size);
    this.updateListenerPosition(this.listenerPosition);
  }

  /**
   * Updates zone configuration
   *
   * @param config - New configuration options
   */
  updateConfig(config: Partial<AudioZoneConfig>): void {
    if (config.position) {
      this.config.position.copy(config.position);
    }
    if (config.size) {
      this.config.size.copy(config.size);
    }
    if (config.innerGain !== undefined) {
      this.config.innerGain = config.innerGain;
    }
    if (config.outerGain !== undefined) {
      this.config.outerGain = config.outerGain;
    }
    if (config.transitionWidth !== undefined) {
      this.config.transitionWidth = config.transitionWidth;
    }
    if (config.shape !== undefined) {
      this.config.shape = config.shape;
    }

    this.updateListenerPosition(this.listenerPosition);
    this.logger.info('AudioZone', `Zone ${this.id} configuration updated`);
  }

  /**
   * Connects the zone to a source
   *
   * @param source - Audio source node
   */
  connectSource(source: AudioNode): void {
    source.connect(this.inputNode);
  }

  /**
   * Connects the zone output to a destination
   *
   * @param destination - Destination audio node
   */
  connect(destination: AudioNode): void {
    this.outputNode.connect(destination);
  }

  /**
   * Disconnects the zone from all sources and destinations
   */
  disconnect(): void {
    this.inputNode.disconnect();
    this.outputNode.disconnect();
  }

  /**
   * Gets the input node
   *
   * @returns Input gain node
   */
  getInputNode(): GainNode {
    return this.inputNode;
  }

  /**
   * Gets the output node
   *
   * @returns Output gain node
   */
  getOutputNode(): GainNode {
    return this.outputNode;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.disconnect();
    this.attenuationNode.disconnect();
    this.dryGain.disconnect();

    if (this.reverbNode) {
      this.reverbNode.disconnect();
      this.reverbNode = null;
    }

    if (this.reverbGain) {
      this.reverbGain.disconnect();
      this.reverbGain = null;
    }

    this.onEnterCallbacks = [];
    this.onExitCallbacks = [];

    this.logger.info('AudioZone', `Disposed zone ${this.id}`);
  }
}
