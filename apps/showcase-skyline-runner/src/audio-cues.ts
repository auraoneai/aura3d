/**
 * Audio cue wishlist for a later CLI registration wave.
 * No playback is wired here; routes should not claim shipped SFX.
 */
export const SKYLINE_AUDIO_CUE_WISHLIST = [
  { id: "jump", trigger: "hero leaves ground", mood: "light spring pluck" },
  { id: "land", trigger: "hero lands on certified surface", mood: "soft thud with leaf rustle" },
  { id: "dash", trigger: "shift dash burst", mood: "whoosh with wind slice" },
  { id: "coin", trigger: "sky-shard collect", mood: "bright chime stack" },
  { id: "ember-pickup", trigger: "ember charge collect", mood: "warm crackle swell" },
  { id: "ember-fire", trigger: "ember volley launch", mood: "short flare pop" },
  { id: "ember-deny", trigger: "fire pressed with empty stock", mood: "muted fizzle" },
  { id: "ember-impact", trigger: "volley hits sentry", mood: "ember burst sizzle" },
  { id: "sentry-telegraph", trigger: "sentry 0.5s intercept warning", mood: "servo whine rise" },
  { id: "sentry-defeat", trigger: "sentry defeated", mood: "metallic clatter + score ping" },
  { id: "stomp", trigger: "hero stomps sentry", mood: "heavy stomp crunch" },
  { id: "checkpoint", trigger: "relay checkpoint activated", mood: "relay chime + act sting" },
  { id: "death", trigger: "fall or hazard respawn", mood: "quick sting, no long dirge" },
  { id: "finish", trigger: "summit beacon reached", mood: "aurora swell + victory motif" },
  { id: "pause", trigger: "P pause toggle", mood: "soft UI latch" },
  { id: "reset", trigger: "R full reset", mood: "rewind whoosh" }
] as const;
