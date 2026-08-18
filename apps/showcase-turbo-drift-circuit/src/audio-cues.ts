/**
 * Turbo Drift Circuit committed audio cues.
 *
 * Each id maps to a synthesized CC0 WAV asset registered through the CLI
 * (`assets.turbo*Sfx`) and played via `createGameAudio` in `turbo-audio.ts`.
 * `audioCueWishlist` is retained as an evidence field name for compatibility;
 * the list now reflects the cues actually implemented and played by the route.
 */
export const TURBO_AUDIO_CUE_WISHLIST = [
  "engine",
  "drift-scuff",
  "wind",
  "checkpoint",
  "countdown",
  "go",
  "finish-fanfare",
  "off-track",
  "ui-confirm"
] as const;

export type TurboAudioCueId = (typeof TURBO_AUDIO_CUE_WISHLIST)[number];
