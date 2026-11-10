// Shape Shift Sprint art direction (SplatSiblings WP-2 + WP-15 visual overhaul). Fantasy: a candy-primary
// kinetic morph-runner on a glossy cream sky bridge over a cloud sea with floating toy islands and 6 Toybox Worlds.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "shape-shift-sprint",
  genre: "platformer",
  fantasy: "Sprint a shape-shifting toy along a glossy candy sky bridge past floating islands, fitting through 3D gates across six Toybox Worlds.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/shape-shift-sprint/README.md",
      source: "generic reference: wooden and lacquered vinyl shape-sorter toys (sphere, cube, cone cut-outs in a bright board)",
      licence: "reference-only",
      why: "Molded 3D cutout wall blocks with bevelled rims read immediately: three outlined holes, one fits the active form"
    },
    {
      file: "evidence/shape-shift-sprint/README.md",
      source: "generic reference: candy-coloured clearcoat playground toys on warm cream skyway surfaces",
      licence: "reference-only",
      why: "Multi-lobe primaries (crimson carPaint sphere, solar clearcoatPaint cube, cobalt lacquer cone) stay readable at speed"
    },
    {
      file: "evidence/shape-shift-sprint/README.md",
      source: "generic reference: plasma shockwaves and confetti bursts at party arcade games",
      licence: "reference-only",
      why: "Plasma morph burst plus a shape-confetti trail and hole rims glowing in the matching colour reward every fit"
    }
  ],
  palette: {
    primary: ["#e8453c", "#f7c531", "#2f6fe4", "#f7ecd9"],
    accent: "#2e9be6",
    reservedObjective: "#b45ae8"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    practicals: 1,
    environment: { preset: "studio", background: "sky" },
    exposureEV: 0.08
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [55, 86], mobile: "both" },
  assets: [],
  vfx: [
    { event: "gate-match", kind: "burst" },
    { event: "perfect", kind: "burst" },
    { event: "morph", kind: "burst" },
    { event: "player-path", kind: "trail" },
    { event: "milestone", kind: "burst" }
  ],
  audio: [
    { event: "match", cue: "match", variants: 1 },
    { event: "perfect", cue: "perfect", variants: 1 },
    { event: "morph", cue: "morph", variants: 1 },
    { event: "hit", cue: "hit", variants: 1 },
    { event: "shield", cue: "shield", variants: 1 },
    { event: "wildcard", cue: "wildcard", variants: 1 },
    { event: "x2", cue: "x2", variants: 1 },
    { event: "milestone", cue: "milestone", variants: 1 },
    { event: "gameover", cue: "gameover", variants: 1 }
  ],
  signatureEffect: "Candy primaries on cream: plasma morph burst and shape-confetti trail behind the multi-lobe player forms, with bevelled 3D hole rims glowing in the matching shape colour under a 6-world Toybox skyway.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 114, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 114, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 228, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    ultra: { particles: 228, shadowMap: 2048, cascades: 2, textureMax: 2048 }
  }
});
