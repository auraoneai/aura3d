/**
 * @fileoverview ECS audio system for the G3D engine.
 * Integrates audio sources and listener with the entity-component-system.
 * @module audio/AudioSystem
 */

import { System, SystemContext, SystemPriorities } from '../ecs/System';
import { IComponent } from '../ecs/Component';
import { Entity } from '../ecs/Entity';
import { Query as QueryClass } from '../ecs/Query';
import { TransformComponent as TransformComponentClass } from '../ecs/components/TransformComponent';
import { AudioSource, AudioSourceConfig } from './AudioSource';
import { AudioListener } from './AudioListener';
import { SpatialAudio, SpatialAudioConfig } from './SpatialAudio';
import { AudioClip } from './AudioClip';
import { Vector3 } from '../math/Vector3';

/**
 * Audio source component for ECS entities.
 *
 * @example
 * ```typescript
 * class AudioSourceComponent implements IComponent {
 *   audioSource: AudioSource = new AudioSource('entity_audio');
 *   clip: AudioClip | null = null;
 *   autoPlay: boolean = false;
 * }
 * ```
 */
export class AudioSourceComponent implements IComponent {
  /**
   * Audio source instance.
   */
  audioSource: AudioSource;

  /**
   * Audio clip to play.
   */
  clip: AudioClip | null = null;

  /**
   * Auto-play when component is attached (default: false).
   */
  autoPlay: boolean = false;

  /**
   * Enable spatial audio (default: false).
   */
  spatial: boolean = false;

  /**
   * Spatial audio instance (created if spatial = true).
   */
  spatialAudio: SpatialAudio | null = null;

  /**
   * Configuration for audio source.
   */
  config: AudioSourceConfig = {
    loop: false,
    volume: 1.0,
    pitch: 1.0,
    pan: 0.0
  };

  /**
   * Configuration for spatial audio (if spatial = true).
   */
  spatialConfig: SpatialAudioConfig = {
    maxDistance: 100,
    refDistance: 1.0,
    rolloffFactor: 1.0
  };

  constructor(name: string = 'AudioSource') {
    this.audioSource = new AudioSource(name);
  }

  onAttach?(entity: Entity): void {
    // Setup audio source
    if (this.clip) {
      this.audioSource.setClip(this.clip);
    }

    // Auto-play if enabled
    if (this.autoPlay && this.clip && this.clip.isLoaded()) {
      this.audioSource.play(this.config);
    }
  }

  onDetach?(entity: Entity): void {
    // Stop and cleanup
    this.audioSource.stop();
    if (this.spatialAudio) {
      this.spatialAudio.dispose();
      this.spatialAudio = null;
    }
  }

  reset?(): void {
    this.audioSource.stop();
    this.audioSource.setClip(null);
    this.audioSource.setVolume(1.0);
    this.audioSource.setPitch(1.0);
    this.audioSource.setPan(0.0);
    this.audioSource.setLoop(false);

    if (this.spatialAudio) {
      this.spatialAudio.dispose();
      this.spatialAudio = null;
    }

    this.clip = null;
    this.autoPlay = false;
    this.spatial = false;
  }
}

/**
 * Audio listener component for ECS entities.
 * Typically attached to the camera/player entity.
 *
 * @example
 * ```typescript
 * class AudioListenerComponent implements IComponent {
 *   listener: AudioListener = new AudioListener();
 * }
 * ```
 */
export class AudioListenerComponent implements IComponent {
  /**
   * Audio listener instance.
   */
  listener: AudioListener;

  constructor() {
    this.listener = new AudioListener();
  }

  onAttach?(entity: Entity): void {
    this.listener.initialize();
  }

  onDetach?(entity: Entity): void {
    this.listener.dispose();
  }

  reset?(): void {
    this.listener.setPosition(new Vector3(0, 0, 0));
    this.listener.setOrientation(new Vector3(0, 0, -1), new Vector3(0, 1, 0));
  }
}

/**
 * Transform component type alias for compatibility.
 * Used to sync audio listener/sources with entity positions.
 */
export type TransformComponent = TransformComponentClass;

/**
 * ECS system for processing audio sources and listeners.
 *
 * Handles:
 * - Syncing audio listener position/orientation with camera transform
 * - Updating spatial audio source positions
 * - Automatic playback management
 * - Zero-allocation position updates
 *
 * @example
 * ```typescript
 * // Add system to world
 * const audioSystem = new AudioSystem();
 * world.addSystem(audioSystem);
 *
 * // Create entity with audio source
 * const entity = world.createEntity();
 * const audioComp = new AudioSourceComponent('explosion');
 * audioComp.clip = explosionClip;
 * audioComp.autoPlay = true;
 * audioComp.spatial = true;
 * entity.addComponent(audioComp);
 *
 * const transform = new TransformComponent();
 * transform.position = new Vector3(10, 0, 5);
 * entity.addComponent(transform);
 *
 * // Create entity with audio listener (camera)
 * const camera = world.createEntity();
 * camera.addComponent(new AudioListenerComponent());
 * camera.addComponent(new TransformComponent());
 *
 * // System automatically updates audio positions every frame
 * ```
 */
export class AudioSystem extends System {
  /**
   * Query for entities with audio listener and transform.
   */
  readonly query = [AudioListenerComponent];

  /**
   * Query for entities with audio source (and optionally transform for spatial).
   */
  private audioSourceQuery: any = null;

  /**
   * Cached listener entity for efficient access.
   */
  private listenerEntity: Entity | null = null;

  /**
   * Last update time for velocity calculation.
   */
  private lastUpdateTime: number = 0;

  /**
   * Creates the audio system.
   *
   * @example
   * ```typescript
   * const audioSystem = new AudioSystem();
   * ```
   */
  constructor() {
    super({
      name: 'AudioSystem',
      priority: SystemPriorities.POST_UPDATE, // After movement updates
      enabled: true
    });
  }

  /**
   * Initializes the system.
   * Called once when added to the world.
   */
  override onInit?(): void {
    // Setup audio source query
    if (this.world) {
      this.audioSourceQuery = this.world.getQuery([AudioSourceComponent]);
    }
  }

  /**
   * Updates audio sources and listener positions.
   * Zero-allocation updates using cached values.
   *
   * @param context - System update context
   */
  update(context: SystemContext): void {
    const deltaTime = context.deltaTime;

    // Update audio listener
    this.updateListener(deltaTime);

    // Update audio sources
    this.updateAudioSources(deltaTime);
  }

  /**
   * Updates the audio listener position and orientation.
   * Syncs with camera/player transform.
   */
  private updateListener(deltaTime: number): void {
    const query = this.getQuery() as QueryClass;

    // Find listener entity (cache for efficiency)
    const entities = query.entityArray;
    if (!this.listenerEntity && entities.length > 0) {
      this.listenerEntity = entities[0];
    }

    if (!this.listenerEntity) {
      return; // No listener in scene
    }

    const components = query.get(this.listenerEntity);
    if (!components) {
      this.listenerEntity = null;
      return;
    }

    const listenerComp = components[0] as AudioListenerComponent;

    // Try to get transform component from entity - we need a separate query for this
    // For now, we'll create a simple transform query
    const transformQuery = this.world?.getQuery({ all: [TransformComponentClass] });
    const transformComponents = transformQuery?.get(this.listenerEntity);
    const transform = transformComponents?.[0] as TransformComponentClass | undefined;
    if (!transform) {
      return; // No transform component
    }

    // Update position
    listenerComp.listener.setPosition(transform.position);

    // Update orientation
    const forward = transform.forward;
    const up = transform.up;
    if (forward && up) {
      listenerComp.listener.setOrientation(forward, up);
    }

    // Update velocity for Doppler effect
    if (deltaTime > 0) {
      listenerComp.listener.updateVelocity(deltaTime);
    }
  }

  /**
   * Updates all audio source positions for spatial audio.
   */
  private updateAudioSources(deltaTime: number): void {
    if (!this.audioSourceQuery) {
      return;
    }

    const sources = this.audioSourceQuery as any;

    sources.forEach((entity: Entity, components: IComponent[]) => {
      const audioComp = components[0] as AudioSourceComponent;

      // Skip if not spatial
      if (!audioComp.spatial) {
        return;
      }

      // Initialize spatial audio if needed
      if (!audioComp.spatialAudio) {
        audioComp.spatialAudio = new SpatialAudio();
        audioComp.spatialAudio.initialize(audioComp.spatialConfig);

        // Note: AudioSource doesn't currently expose output nodes for connection
        // In a full implementation, you would need to refactor AudioSource to support
        // external audio graph connections for spatial audio processing
      }

      // Update spatial audio position from transform
      // Try to get transform component
      const transformQuery = this.world?.getQuery({ all: [TransformComponentClass] });
      const transformComponents = transformQuery?.get(entity);
      const transform = transformComponents?.[0] as TransformComponentClass | undefined;
      if (transform) {

        // Update position
        audioComp.spatialAudio.setPosition(transform.position);

        // Update orientation if available
        const forward = transform.forward;
        if (forward) {
          audioComp.spatialAudio.setOrientation(forward);
        }

        // Update velocity for Doppler effect
        if (deltaTime > 0) {
          audioComp.spatialAudio.updateVelocity(deltaTime);
        }
      }
    });
  }

  /**
   * Cleanup when system is destroyed.
   */
  override onDestroy?(): void {
    this.listenerEntity = null;
    this.audioSourceQuery = null;
  }
}
