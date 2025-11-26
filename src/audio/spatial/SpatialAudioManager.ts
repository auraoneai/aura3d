import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Listener configuration
 */
export interface ListenerConfig {
  /** Position in 3D space */
  position?: Vector3;
  /** Forward orientation vector */
  forward?: Vector3;
  /** Up orientation vector */
  up?: Vector3;
}

/**
 * Spatial audio source
 */
export interface SpatialSource {
  /** Unique identifier */
  id: string;
  /** Audio source node */
  sourceNode: AudioBufferSourceNode | MediaElementAudioSourceNode;
  /** Panner node for 3D positioning */
  pannerNode: PannerNode;
  /** Current position */
  position: Vector3;
  /** Current velocity for Doppler effect */
  velocity: Vector3;
  /** Whether the source is currently playing */
  isPlaying: boolean;
}

/**
 * Panner configuration
 */
export interface PannerConfig {
  /** Panning model */
  panningModel?: PanningModelType;
  /** Distance model */
  distanceModel?: DistanceModelType;
  /** Reference distance */
  refDistance?: number;
  /** Maximum distance */
  maxDistance?: number;
  /** Rolloff factor */
  rolloffFactor?: number;
  /** Cone inner angle in degrees */
  coneInnerAngle?: number;
  /** Cone outer angle in degrees */
  coneOuterAngle?: number;
  /** Cone outer gain */
  coneOuterGain?: number;
}

/**
 * 3D audio positioning manager with HRTF support.
 * Manages spatial audio sources and listener position/orientation.
 *
 * @example
 * ```typescript
 * const manager = new SpatialAudioManager(audioContext);
 * const sourceId = manager.createSource(audioBuffer, new Vector3(5, 0, 0));
 * manager.updateListenerPosition(new Vector3(0, 0, 0));
 * manager.playSource(sourceId);
 * ```
 */
export class SpatialAudioManager {
  private logger: Logger;
  private audioContext: AudioContext;
  private audioListener: AudioListener;
  private sources: Map<string, SpatialSource> = new Map();
  private defaultPannerConfig: Required<PannerConfig>;
  private nextSourceId: number = 0;

  /**
   * Creates a new SpatialAudioManager instance
   *
   * @param audioContext - Web Audio API audio context
   * @param pannerConfig - Default panner configuration
   */
  constructor(audioContext: AudioContext, pannerConfig: PannerConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;
    this.audioListener = audioContext.listener;

    this.defaultPannerConfig = {
      panningModel: pannerConfig.panningModel ?? 'HRTF',
      distanceModel: pannerConfig.distanceModel ?? 'inverse',
      refDistance: pannerConfig.refDistance ?? 1,
      maxDistance: pannerConfig.maxDistance ?? 10000,
      rolloffFactor: pannerConfig.rolloffFactor ?? 1,
      coneInnerAngle: pannerConfig.coneInnerAngle ?? 360,
      coneOuterAngle: pannerConfig.coneOuterAngle ?? 360,
      coneOuterGain: pannerConfig.coneOuterGain ?? 0
    };

    this.logger.info('SpatialAudioManager', 'Initialized with HRTF panning');
  }

  /**
   * Creates a spatial audio source from an AudioBuffer
   *
   * @param buffer - Audio buffer to play
   * @param position - Initial position in 3D space
   * @param config - Optional panner configuration
   * @returns Source ID
   */
  createSource(
    buffer: AudioBuffer,
    position: Vector3 = new Vector3(0, 0, 0),
    config?: PannerConfig
  ): string {
    const id = `source_${this.nextSourceId++}`;
    const sourceNode = this.audioContext.createBufferSource();
    sourceNode.buffer = buffer;

    const pannerNode = this.createPannerNode(config);
    sourceNode.connect(pannerNode);
    pannerNode.connect(this.audioContext.destination);

    const source: SpatialSource = {
      id,
      sourceNode,
      pannerNode,
      position: position.clone(),
      velocity: new Vector3(0, 0, 0),
      isPlaying: false
    };

    this.updateSourcePosition(source, position);
    this.sources.set(id, source);

    this.logger.info('SpatialAudioManager', `Created source ${id} at position ${position.toString()}`);
    return id;
  }

  /**
   * Creates a spatial audio source from a media element
   *
   * @param mediaElement - HTML audio or video element
   * @param position - Initial position in 3D space
   * @param config - Optional panner configuration
   * @returns Source ID
   */
  createMediaSource(
    mediaElement: HTMLMediaElement,
    position: Vector3 = new Vector3(0, 0, 0),
    config?: PannerConfig
  ): string {
    const id = `media_source_${this.nextSourceId++}`;
    const sourceNode = this.audioContext.createMediaElementSource(mediaElement);

    const pannerNode = this.createPannerNode(config);
    sourceNode.connect(pannerNode);
    pannerNode.connect(this.audioContext.destination);

    const source: SpatialSource = {
      id,
      sourceNode,
      pannerNode,
      position: position.clone(),
      velocity: new Vector3(0, 0, 0),
      isPlaying: false
    };

    this.updateSourcePosition(source, position);
    this.sources.set(id, source);

    this.logger.info('SpatialAudioManager', `Created media source ${id} at position ${position.toString()}`);
    return id;
  }

  /**
   * Creates and configures a panner node
   *
   * @param config - Panner configuration
   * @returns Configured panner node
   */
  private createPannerNode(config?: PannerConfig): PannerNode {
    const pannerNode = this.audioContext.createPanner();
    const finalConfig = { ...this.defaultPannerConfig, ...config };

    pannerNode.panningModel = finalConfig.panningModel;
    pannerNode.distanceModel = finalConfig.distanceModel;
    pannerNode.refDistance = finalConfig.refDistance;
    pannerNode.maxDistance = finalConfig.maxDistance;
    pannerNode.rolloffFactor = finalConfig.rolloffFactor;
    pannerNode.coneInnerAngle = finalConfig.coneInnerAngle;
    pannerNode.coneOuterAngle = finalConfig.coneOuterAngle;
    pannerNode.coneOuterGain = finalConfig.coneOuterGain;

    return pannerNode;
  }

  /**
   * Plays a spatial audio source
   *
   * @param sourceId - Source identifier
   * @param loop - Whether to loop the audio
   * @param startTime - When to start playing (in audio context time)
   */
  playSource(sourceId: string, loop: boolean = false, startTime?: number): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      this.logger.warn('SpatialAudioManager', `Source ${sourceId} not found`);
      return;
    }

    if (source.isPlaying) {
      this.logger.warn('SpatialAudioManager', `Source ${sourceId} is already playing`);
      return;
    }

    if ('loop' in source.sourceNode) {
      source.sourceNode.loop = loop;
    }

    const start = startTime ?? this.audioContext.currentTime;
    if ('start' in source.sourceNode) {
      source.sourceNode.start(start);
    }
    source.isPlaying = true;

    this.logger.info('SpatialAudioManager', `Playing source ${sourceId}`);
  }

  /**
   * Stops a spatial audio source
   *
   * @param sourceId - Source identifier
   * @param stopTime - When to stop playing (in audio context time)
   */
  stopSource(sourceId: string, stopTime?: number): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      this.logger.warn('SpatialAudioManager', `Source ${sourceId} not found`);
      return;
    }

    if (!source.isPlaying) {
      return;
    }

    const stop = stopTime ?? this.audioContext.currentTime;
    if ('stop' in source.sourceNode) {
      source.sourceNode.stop(stop);
    }
    source.isPlaying = false;

    this.logger.info('SpatialAudioManager', `Stopped source ${sourceId}`);
  }

  /**
   * Updates the position of a spatial audio source
   *
   * @param sourceId - Source identifier
   * @param position - New position
   */
  setSourcePosition(sourceId: string, position: Vector3): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      this.logger.warn('SpatialAudioManager', `Source ${sourceId} not found`);
      return;
    }

    this.updateSourcePosition(source, position);
  }

  /**
   * Updates source position internally
   *
   * @param source - Spatial source
   * @param position - New position
   */
  private updateSourcePosition(source: SpatialSource, position: Vector3): void {
    source.position.copy(position);

    if (source.pannerNode.positionX) {
      source.pannerNode.positionX.value = position.x;
      source.pannerNode.positionY.value = position.y;
      source.pannerNode.positionZ.value = position.z;
    } else {
      source.pannerNode.setPosition(position.x, position.y, position.z);
    }
  }

  /**
   * Sets the velocity of a spatial audio source for Doppler effect
   *
   * @param sourceId - Source identifier
   * @param velocity - Velocity vector
   */
  setSourceVelocity(sourceId: string, velocity: Vector3): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      this.logger.warn('SpatialAudioManager', `Source ${sourceId} not found`);
      return;
    }

    source.velocity.copy(velocity);

    if (source.pannerNode.positionX) {
      // Note: velocity API is deprecated but still supported
    }
  }

  /**
   * Sets the orientation of a spatial audio source (for directional sounds)
   *
   * @param sourceId - Source identifier
   * @param orientation - Forward direction vector
   */
  setSourceOrientation(sourceId: string, orientation: Vector3): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      this.logger.warn('SpatialAudioManager', `Source ${sourceId} not found`);
      return;
    }

    if (source.pannerNode.orientationX) {
      source.pannerNode.orientationX.value = orientation.x;
      source.pannerNode.orientationY.value = orientation.y;
      source.pannerNode.orientationZ.value = orientation.z;
    } else {
      source.pannerNode.setOrientation(orientation.x, orientation.y, orientation.z);
    }
  }

  /**
   * Updates listener position
   *
   * @param position - Listener position
   */
  updateListenerPosition(position: Vector3): void {
    if (this.audioListener.positionX) {
      this.audioListener.positionX.value = position.x;
      this.audioListener.positionY.value = position.y;
      this.audioListener.positionZ.value = position.z;
    } else {
      this.audioListener.setPosition(position.x, position.y, position.z);
    }
  }

  /**
   * Updates listener orientation
   *
   * @param forward - Forward direction vector
   * @param up - Up direction vector
   */
  updateListenerOrientation(forward: Vector3, up: Vector3): void {
    if (this.audioListener.forwardX) {
      this.audioListener.forwardX.value = forward.x;
      this.audioListener.forwardY.value = forward.y;
      this.audioListener.forwardZ.value = forward.z;
      this.audioListener.upX.value = up.x;
      this.audioListener.upY.value = up.y;
      this.audioListener.upZ.value = up.z;
    } else {
      this.audioListener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /**
   * Updates listener configuration
   *
   * @param config - Listener configuration
   */
  updateListener(config: ListenerConfig): void {
    if (config.position) {
      this.updateListenerPosition(config.position);
    }

    if (config.forward && config.up) {
      this.updateListenerOrientation(config.forward, config.up);
    }
  }

  /**
   * Gets a spatial source by ID
   *
   * @param sourceId - Source identifier
   * @returns Spatial source or undefined
   */
  getSource(sourceId: string): SpatialSource | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Gets all spatial sources
   *
   * @returns Array of all spatial sources
   */
  getAllSources(): SpatialSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * Removes a spatial audio source
   *
   * @param sourceId - Source identifier
   */
  removeSource(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      return;
    }

    if (source.isPlaying) {
      this.stopSource(sourceId);
    }

    source.pannerNode.disconnect();
    this.sources.delete(sourceId);

    this.logger.info('SpatialAudioManager', `Removed source ${sourceId}`);
  }

  /**
   * Updates default panner configuration
   *
   * @param config - New panner configuration
   */
  updateDefaultPannerConfig(config: PannerConfig): void {
    this.defaultPannerConfig = { ...this.defaultPannerConfig, ...config };
    this.logger.info('SpatialAudioManager', 'Default panner configuration updated');
  }

  /**
   * Cleans up all resources
   */
  dispose(): void {
    for (const [id] of this.sources) {
      this.removeSource(id);
    }

    this.sources.clear();
    this.logger.info('SpatialAudioManager', 'Disposed');
  }
}
