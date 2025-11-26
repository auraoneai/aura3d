/**
 * @fileoverview Music system module exports.
 * @module audio/music
 */

export { MusicTrack, MusicTrackState } from './MusicTrack';
export type { MusicTrackConfig, MusicTrackMetadata, LoopPoints } from './MusicTrack';
export { MusicPlayer, MusicPlayerState } from './MusicPlayer';
export type { PlaybackConfig } from './MusicPlayer';
export { MusicPlaylist, RepeatMode } from './MusicPlaylist';
export type { PlaylistConfig } from './MusicPlaylist';
export { CrossfadeManager, CrossfadeCurve } from './CrossfadeManager';
export type { CrossfadeConfig } from './CrossfadeManager';
export { AdaptiveMusic, AdaptiveMusicState } from './AdaptiveMusic';
export type { AdaptiveMusicLayer } from './AdaptiveMusic';
export { MusicCue } from './MusicCue';
export type { MusicCuePoint, MusicCueCallback } from './MusicCue';
