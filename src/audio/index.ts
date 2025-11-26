/**
 * @fileoverview Audio system module for G3D 5.0 engine.
 * Provides complete Web Audio API integration with 3D spatial audio.
 * @module audio
 */

// Core audio context
export { AudioContext, AudioContextState } from './AudioContext';
export type { AudioContextConfig } from './AudioContext';

// Audio clips
export { AudioClip, AudioClipState } from './AudioClip';
export type { AudioClipLoadConfig } from './AudioClip';

// Audio sources
export {
  AudioSource,
  AudioSourceState
} from './AudioSource';
export type {
  AudioSourceConfig
} from './AudioSource';

// Spatial audio
export {
  AudioListener,
  DistanceModel
} from './AudioListener';
export type {
  AudioListenerConfig
} from './AudioListener';

export {
  SpatialAudio,
  SpatialDistanceModel,
  SpatialPanningModel
} from './SpatialAudio';
export type {
  SpatialAudioConfig
} from './SpatialAudio';

// Audio mixer
export { AudioMixer, AudioBus } from './AudioMixer';
export type { AudioBusConfig } from './AudioMixer';

// Audio effects
export {
  ReverbEffect,
  DelayEffect,
  FilterEffect,
  CompressorEffect
} from './AudioEffect';
export type {
  IAudioEffect
} from './AudioEffect';

// Audio pooling
export { AudioPool, AudioPriority } from './AudioPool';
export type { AudioPoolConfig } from './AudioPool';

// ECS integration
export {
  AudioSystem,
  AudioSourceComponent,
  AudioListenerComponent
} from './AudioSystem';
// Note: TransformComponent is exported from './ecs', not re-exported here to avoid conflicts
