export { SpatialAudioManager } from './SpatialAudioManager';
export type {
  ListenerConfig,
  SpatialSource,
  PannerConfig
} from './SpatialAudioManager';

export { HRTFPanner } from './HRTFPanner';
export type {
  HRTFProfile,
  BinauralParams
} from './HRTFPanner';

export { AmbisonicsDecoder, AmbisonicsOrder, AmbisonicsChannel } from './AmbisonicsDecoder';
export type {
  SpeakerConfig,
  AmbisonicsDecoderConfig
} from './AmbisonicsDecoder';

export { AudioZone, ZoneShape } from './AudioZone';
export type {
  AudioZoneConfig,
  ReverbConfig,
  ZoneEvent
} from './AudioZone';

export { DopplerEffect } from './DopplerEffect';
export type {
  DopplerConfig,
  VelocityTracker,
  DopplerShift
} from './DopplerEffect';

export { SoundPropagation } from './SoundPropagation';
export type {
  MaterialProperties,
  PathSegment,
  PropagationConfig,
  PropagationResult
} from './SoundPropagation';
