// apps/showcase-beat-hopper/src/art/direction.ts — WP-6 (lane G6) art direction for Beat Hopper.
// Fantasy: a neon night stage where the skyline is an equalizer and every obstacle lands on the beat.
// The look table is `../look.ts`; the signature effect is the whole-world beat pulse + PERFECT timing rings.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "beat-hopper",
  genre: "platformer",
  fantasy: "Hop and duck across a neon night stage on a 132 BPM beat grid while the equalizer skyline dances and PERFECT timing rings ripple out.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/beat-hopper/README.md",
      source: "generic reference: night-city neon palettes (deep indigo sky, magenta and cyan practicals)",
      licence: "reference-only",
      why: "Five-stop night gradient from ink zenith to hot-magenta horizon with cyan road stripes and magenta rails"
    },
    {
      file: "evidence/beat-hopper/README.md",
      source: "generic reference: audio equalizer bar visualizations as city skylines",
      licence: "reference-only",
      why: "Two rows of towers whose heights dance on the sim beat, reading the rhythm before the obstacle arrives"
    },
    {
      file: "evidence/beat-hopper/README.md",
      source: "generic reference: rhythm-game timing feedback (expanding judgement rings, beat-synced world pulses)",
      licence: "reference-only",
      why: "PERFECT judgements fire gold expanding rings; the whole world's emissive gain pulses exactly on the beat"
    }
  ],
  palette: {
    primary: ["#14082e", "#23e6ff", "#ff2fb3", "#341259"],
    accent: "#ffd166",
    reservedObjective: "#ff4d6d"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 8500, shadow: true },
    fill: "ibl+bounce",
    practicals: 2,
    environment: { preset: "neutral", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [55, 80], mobile: "both" },
  assets: [],
  vfx: [
    { event: "perfect", kind: "ring" },
    { event: "good", kind: "ring" },
    { event: "miss", kind: "burst" },
    { event: "milestone", kind: "burst" }
  ],
  audio: [
    { event: "hop", cue: "hop", variants: 1 },
    { event: "duck", cue: "duck", variants: 1 },
    { event: "perfect", cue: "perfect", variants: 1 },
    { event: "good", cue: "good", variants: 1 },
    { event: "miss", cue: "miss", variants: 1 },
    { event: "milestone", cue: "milestone", variants: 1 },
    { event: "gameover", cue: "gameover", variants: 1 }
  ],
  signatureEffect: "Night-neon equalizer stage: the whole world pulses on the 132 BPM sim beat and PERFECT judgements fire expanding gold timing rings.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 90, shadowMap: 512, cascades: 1, textureMax: 1024 },
    medium: { particles: 90, shadowMap: 512, cascades: 1, textureMax: 1024 },
    high: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    ultra: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 }
  }
});