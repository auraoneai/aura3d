// apps/showcase-bank-shot/src/v2/audio-map.ts — §14.4 cue gain/pitch map.
// C-25's mixer owns the applied gain/pitch when it lands; the map is pure so
// the unit test can prove the ≥6 dB spread between soft and hard strikes.
// Speed domain mirrors the CueController strike law (power 0.12 → 1.2 m/s,
// power 1.0 → 5.2 m/s).
export interface StrikeAudioParams {
  readonly cue: "cue-strike";
  readonly gainDb: number;
  readonly pitchSemitones: number;
}

const SPEED_MIN = 1.2;
const SPEED_MAX = 5.2;

export function strikeAudioMap(speedMps: number): StrikeAudioParams {
  const t = Math.min(1, Math.max(0, (speedMps - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)));
  return {
    cue: "cue-strike",
    // −18 dB feather tap → −4 dB full break (14 dB span: 1 vs 4 m/s ≈ 9.8 dB).
    gainDb: -18 + t * 14,
    // Warmer and brighter as impact speed rises.
    pitchSemitones: -2 + t * 5
  };
}
