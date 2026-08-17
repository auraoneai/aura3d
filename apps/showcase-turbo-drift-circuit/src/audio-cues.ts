/**
 * Audio cue wishlist for a later CLI registration wave.
 * No playback in this wave — names only, for orchestrator handoff.
 */
export const TURBO_AUDIO_CUE_WISHLIST = [
  "start-light-red-tick",
  "start-light-go-blast",
  "engine-rev-loop",
  "tyre-scrub-loop",
  "nitro-whoosh",
  "rival-pass-doppler",
  "checkpoint-beep",
  "lap-complete-chime",
  "finish-fanfare",
  "pause-menu-blip",
  "reset-confirm",
  "off-track-grass-rumble"
] as const;

export type TurboAudioCueId = (typeof TURBO_AUDIO_CUE_WISHLIST)[number];
