import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Spatial voice participant with 3D position
 */
export interface SpatialVoiceParticipant {
  /** Participant ID */
  id: string;
  /** 3D position */
  position: Vector3;
  /** Audio panner node */
  pannerNode?: PannerNode;
  /** Audio source node */
  sourceNode?: MediaStreamAudioSourceNode;
  /** Gain node for volume control */
  gainNode?: GainNode;
}

/**
 * Spatial voice configuration
 */
export interface SpatialVoiceConfig {
  /** Audio context */
  audioContext: AudioContext;
  /** Maximum audible distance */
  maxDistance?: number;
  /** Reference distance (distance at which volume is 1.0) */
  refDistance?: number;
  /** Rolloff factor (how quickly volume decreases with distance) */
  rolloffFactor?: number;
  /** Distance model */
  distanceModel?: DistanceModelType;
  /** Panning model */
  panningModel?: PanningModelType;
  /** Enable doppler effect */
  dopplerEffect?: boolean;
  /** Speed of sound (m/s) for doppler */
  speedOfSound?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Listener (camera/player) position and orientation
 */
export interface ListenerTransform {
  /** Position */
  position: Vector3;
  /** Forward direction */
  forward: Vector3;
  /** Up direction */
  up: Vector3;
}

/**
 * Spatial voice audio positioning for 3D environments.
 * Uses Web Audio API for directional audio and distance attenuation.
 *
 * @example
 * ```typescript
 * const audioContext = new AudioContext();
 * const spatialVoice = new SpatialVoice({
 *   audioContext,
 *   maxDistance: 50,
 *   refDistance: 1,
 *   rolloffFactor: 1
 * });
 *
 * // Update listener (camera) position
 * spatialVoice.setListenerTransform({
 *   position: new Vector3(0, 0, 0),
 *   forward: new Vector3(0, 0, -1),
 *   up: new Vector3(0, 1, 0)
 * });
 *
 * // Add participant with position
 * spatialVoice.addParticipant('player1', remoteStream, new Vector3(10, 0, 5));
 * ```
 */
export class SpatialVoice {
  private readonly participants: Map<string, SpatialVoiceParticipant> = new Map();
  private readonly audioContext: AudioContext;
  private readonly listener: AudioListener;
  private readonly config: Required<Omit<SpatialVoiceConfig, 'audioContext'>>;
  private readonly logger: Logger;
  private listenerTransform: ListenerTransform;

  constructor(config: SpatialVoiceConfig) {
    this.audioContext = config.audioContext;
    this.listener = this.audioContext.listener;

    this.config = {
      maxDistance: config.maxDistance ?? 50.0,
      refDistance: config.refDistance ?? 1.0,
      rolloffFactor: config.rolloffFactor ?? 1.0,
      distanceModel: config.distanceModel ?? 'inverse',
      panningModel: config.panningModel ?? 'HRTF',
      dopplerEffect: config.dopplerEffect ?? false,
      speedOfSound: config.speedOfSound ?? 343.3,
      debug: config.debug ?? false
    };

    this.logger = new Logger('SpatialVoice');

    // Initialize listener position
    this.listenerTransform = {
      position: new Vector3(0, 0, 0),
      forward: new Vector3(0, 0, -1),
      up: new Vector3(0, 1, 0)
    };

    this.updateListenerPosition();
  }

  /**
   * Add a participant with spatial audio
   *
   * @param participantId - Participant ID
   * @param mediaStream - Remote audio stream
   * @param position - Initial 3D position
   * @returns Spatial voice participant
   */
  public addParticipant(
    participantId: string,
    mediaStream: MediaStream,
    position: Vector3
  ): SpatialVoiceParticipant {
    if (this.participants.has(participantId)) {
      this.logger.warn(`Participant ${participantId} already exists`);
      return this.participants.get(participantId)!;
    }

    // Create audio nodes
    const sourceNode = this.audioContext.createMediaStreamSource(mediaStream);
    const pannerNode = this.audioContext.createPanner();
    const gainNode = this.audioContext.createGain();

    // Configure panner
    pannerNode.panningModel = this.config.panningModel;
    pannerNode.distanceModel = this.config.distanceModel;
    pannerNode.refDistance = this.config.refDistance;
    pannerNode.maxDistance = this.config.maxDistance;
    pannerNode.rolloffFactor = this.config.rolloffFactor;

    // Set initial position
    pannerNode.positionX.value = position.x;
    pannerNode.positionY.value = position.y;
    pannerNode.positionZ.value = position.z;

    // Connect: source -> panner -> gain -> destination
    sourceNode.connect(pannerNode);
    pannerNode.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    const participant: SpatialVoiceParticipant = {
      id: participantId,
      position: position.clone(),
      pannerNode,
      sourceNode,
      gainNode
    };

    this.participants.set(participantId, participant);

    if (this.config.debug) {
      this.logger.debug(`Added spatial participant ${participantId} at`, position);
    }

    return participant;
  }

  /**
   * Remove a participant
   *
   * @param participantId - Participant ID
   */
  public removeParticipant(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (!participant) {
      return;
    }

    // Disconnect audio nodes
    if (participant.sourceNode) {
      participant.sourceNode.disconnect();
    }
    if (participant.pannerNode) {
      participant.pannerNode.disconnect();
    }
    if (participant.gainNode) {
      participant.gainNode.disconnect();
    }

    this.participants.delete(participantId);

    if (this.config.debug) {
      this.logger.debug(`Removed spatial participant ${participantId}`);
    }
  }

  /**
   * Update participant position
   *
   * @param participantId - Participant ID
   * @param position - New 3D position
   */
  public updateParticipantPosition(participantId: string, position: Vector3): void {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.pannerNode) {
      return;
    }

    // Update position
    participant.position.copy(position);

    // Update panner node position
    participant.pannerNode.positionX.value = position.x;
    participant.pannerNode.positionY.value = position.y;
    participant.pannerNode.positionZ.value = position.z;

    if (this.config.debug) {
      const distance = this.listenerTransform.position.distanceTo(position);
      this.logger.debug(
        `Updated ${participantId} position to ${position.toString()}, distance: ${distance.toFixed(2)}`
      );
    }
  }

  /**
   * Update participant orientation (for directional audio sources)
   *
   * @param participantId - Participant ID
   * @param orientation - Direction vector
   */
  public updateParticipantOrientation(
    participantId: string,
    orientation: Vector3
  ): void {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.pannerNode) {
      return;
    }

    participant.pannerNode.orientationX.value = orientation.x;
    participant.pannerNode.orientationY.value = orientation.y;
    participant.pannerNode.orientationZ.value = orientation.z;
  }

  /**
   * Set participant volume
   *
   * @param participantId - Participant ID
   * @param volume - Volume level (0-1)
   */
  public setParticipantVolume(participantId: string, volume: number): void {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.gainNode) {
      return;
    }

    participant.gainNode.gain.value = Math.max(0, Math.min(1, volume));

    if (this.config.debug) {
      this.logger.debug(`Set volume for ${participantId}: ${volume}`);
    }
  }

  /**
   * Set listener (camera/player) transform
   *
   * @param transform - Listener transform
   */
  public setListenerTransform(transform: ListenerTransform): void {
    this.listenerTransform = {
      position: transform.position.clone(),
      forward: transform.forward.clone().normalize(),
      up: transform.up.clone().normalize()
    };

    this.updateListenerPosition();
  }

  /**
   * Update listener position in audio context
   */
  private updateListenerPosition(): void {
    const pos = this.listenerTransform.position;
    const fwd = this.listenerTransform.forward;
    const up = this.listenerTransform.up;

    // Set position
    if (this.listener.positionX) {
      this.listener.positionX.value = pos.x;
      this.listener.positionY.value = pos.y;
      this.listener.positionZ.value = pos.z;
    }

    // Set orientation (forward and up vectors)
    if (this.listener.forwardX) {
      this.listener.forwardX.value = fwd.x;
      this.listener.forwardY.value = fwd.y;
      this.listener.forwardZ.value = fwd.z;
    }

    if (this.listener.upX) {
      this.listener.upX.value = up.x;
      this.listener.upY.value = up.y;
      this.listener.upZ.value = up.z;
    }

    if (this.config.debug) {
      this.logger.debug(`Updated listener position to ${pos.toString()}`);
    }
  }

  /**
   * Get listener transform
   */
  public getListenerTransform(): ListenerTransform {
    return {
      position: this.listenerTransform.position.clone(),
      forward: this.listenerTransform.forward.clone(),
      up: this.listenerTransform.up.clone()
    };
  }

  /**
   * Get participant position
   *
   * @param participantId - Participant ID
   * @returns Position or undefined
   */
  public getParticipantPosition(participantId: string): Vector3 | undefined {
    const participant = this.participants.get(participantId);
    return participant ? participant.position.clone() : undefined;
  }

  /**
   * Get distance to participant from listener
   *
   * @param participantId - Participant ID
   * @returns Distance or null
   */
  public getDistanceToParticipant(participantId: string): number | null {
    const participant = this.participants.get(participantId);
    if (!participant) {
      return null;
    }

    return this.listenerTransform.position.distanceTo(participant.position);
  }

  /**
   * Check if participant is audible
   *
   * @param participantId - Participant ID
   * @returns True if within max distance
   */
  public isParticipantAudible(participantId: string): boolean {
    const distance = this.getDistanceToParticipant(participantId);
    if (distance === null) {
      return false;
    }

    return distance <= this.config.maxDistance;
  }

  /**
   * Get all participants within audible range
   *
   * @returns Array of participant IDs
   */
  public getAudibleParticipants(): string[] {
    const audible: string[] = [];

    for (const [participantId] of this.participants) {
      if (this.isParticipantAudible(participantId)) {
        audible.push(participantId);
      }
    }

    return audible;
  }

  /**
   * Update spatial audio configuration
   *
   * @param updates - Configuration updates
   */
  public updateConfig(updates: Partial<Omit<SpatialVoiceConfig, 'audioContext'>>): void {
    Object.assign(this.config, updates);

    // Apply to all existing panner nodes
    for (const participant of this.participants.values()) {
      if (participant.pannerNode) {
        if (updates.distanceModel !== undefined) {
          participant.pannerNode.distanceModel = updates.distanceModel;
        }
        if (updates.panningModel !== undefined) {
          participant.pannerNode.panningModel = updates.panningModel;
        }
        if (updates.refDistance !== undefined) {
          participant.pannerNode.refDistance = updates.refDistance;
        }
        if (updates.maxDistance !== undefined) {
          participant.pannerNode.maxDistance = updates.maxDistance;
        }
        if (updates.rolloffFactor !== undefined) {
          participant.pannerNode.rolloffFactor = updates.rolloffFactor;
        }
      }
    }

    if (this.config.debug) {
      this.logger.debug('Spatial voice configuration updated', updates);
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): Omit<SpatialVoiceConfig, 'audioContext'> {
    return { ...this.config };
  }

  /**
   * Get all participants
   */
  public getParticipants(): SpatialVoiceParticipant[] {
    return Array.from(this.participants.values()).map(p => ({
      id: p.id,
      position: p.position.clone(),
      pannerNode: p.pannerNode,
      sourceNode: p.sourceNode,
      gainNode: p.gainNode
    }));
  }

  /**
   * Batch update participant positions (optimized for many participants)
   *
   * @param positions - Map of participant ID to position
   */
  public batchUpdatePositions(positions: Map<string, Vector3>): void {
    for (const [participantId, position] of positions) {
      this.updateParticipantPosition(participantId, position);
    }
  }

  /**
   * Get spatial voice statistics
   */
  public getStats(): {
    participantCount: number;
    audibleParticipants: number;
    maxDistance: number;
    refDistance: number;
    listenerPosition: Vector3;
  } {
    return {
      participantCount: this.participants.size,
      audibleParticipants: this.getAudibleParticipants().length,
      maxDistance: this.config.maxDistance,
      refDistance: this.config.refDistance,
      listenerPosition: this.listenerTransform.position.clone()
    };
  }

  /**
   * Clear all participants
   */
  public clear(): void {
    const participantIds = Array.from(this.participants.keys());
    for (const id of participantIds) {
      this.removeParticipant(id);
    }

    if (this.config.debug) {
      this.logger.debug('All spatial participants cleared');
    }
  }
}
