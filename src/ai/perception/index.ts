/**
 * @fileoverview Perception system exports.
 * @module ai/perception
 */

// Sensor System
export {
  SensorSystem,
  SensorLOD,
  DefaultSensorSystemConfig,
} from './SensorSystem';

export type {
  ISensor,
  LODConfig,
  SensorSystemConfig,
  SensorStats,
} from './SensorSystem';

// Vision Sensor
export {
  VisionSensor,
  DefaultVisionConfig,
} from './VisionSensor';

export type {
  VisibilityInfo,
  VisionConfig,
  RaycastCallback,
} from './VisionSensor';

// Hearing Sensor
export {
  HearingSensor,
  SoundType,
  DefaultHearingConfig,
} from './HearingSensor';

export type {
  SoundEvent,
  HearingConfig,
  OcclusionCallback,
} from './HearingSensor';

// Proximity Sensor
export {
  ProximitySensor,
  DefaultProximityConfig,
} from './ProximitySensor';

export type {
  ProximityInfo,
  TriggerZone,
  ProximityConfig,
} from './ProximitySensor';

// Memory System
export {
  MemorySystem,
  MemoryType,
  MemoryImportance,
  DefaultMemorySystemConfig,
} from './MemorySystem';

export type {
  Memory,
  MemorySystemConfig,
  MemoryStats,
} from './MemorySystem';

// Stimulus System
export {
  StimulusSystem,
  StimulusCategory,
  DefaultStimulusSystemConfig,
} from './StimulusSystem';

export type {
  Stimulus,
  StimulusListener,
  StimulusSystemConfig,
  StimulusStats,
} from './StimulusSystem';
