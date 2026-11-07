// apps/showcase-polarity-orbs/src/art/direction.ts — WP-5 (lane G5) art direction for Polarity Orbs.
// Fantasy: roll a charged ball through a split warm/cool dusk world, flipping polarity to match the orbs ahead.
// The look table is `../look.ts`; every surface is procedural (no catalog GLBs, no Meshy).
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "polarity-orbs",
  genre: "maze-arcade",
  fantasy: "Roll a charged ball down a split warm-red / cool-blue dusk road, flipping polarity to collect your colour of orbs.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/polarity-orbs/README.md",
      source: "generic reference: split-tone dusk landscapes (warm sunset half against a cool blue-hour half)",
      licence: "reference-only",
      why: "Dual-dusk sky gradient and road halves whose dominance swaps when the player flips polarity"
    },
    {
      file: "evidence/polarity-orbs/README.md",
      source: "generic reference: toon-shaded arcade collectors with bold two-colour object coding",
      licence: "reference-only",
      why: "Stepped toon ramp with red/blue orb coding keeps collect and dodge decisions readable at speed"
    },
    {
      file: "evidence/polarity-orbs/README.md",
      source: "generic reference: shockwave rings and tractor-beam streams in arcade power-up fantasy",
      licence: "reference-only",
      why: "Expanding flip shockwave ring plus purple magnet attraction streams mark the two signature power moments"
    }
  ],
  palette: {
    primary: ["#ff5a4e", "#4ea8ff", "#63303a", "#2f4a6e"],
    accent: "#ffd24e",
    reservedObjective: "#7ef0c8"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3600, shadow: true },
    fill: "ibl+bounce",
    practicals: 1,
    environment: { background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.1, 0.28], fovDeg: [60, 70], mobile: "both" },
  assets: [
    { role: "world", assetKey: "deckHalves", maxTriangles: 6000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "polarityBall", maxTriangles: 1000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "polarityOrbs", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "powerupGems", maxTriangles: 500, textureSet: "BC", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "flip", kind: "shockwave-ring" },
    { event: "collect", kind: "burst" },
    { event: "wrong", kind: "burst" },
    { event: "magnet", kind: "attraction-streams" },
    { event: "milestone", kind: "burst" }
  ],
  audio: [
    { event: "flip", cue: "flip", variants: 1 },
    { event: "collect", cue: "collect", variants: 1 },
    { event: "wrong", cue: "wrong", variants: 1 },
    { event: "powerup", cue: "powerup", variants: 1 },
    { event: "milestone", cue: "milestone", variants: 1 },
    { event: "gameover", cue: "gameover", variants: 1 }
  ],
  signatureEffect: "Dual-tone world halves (warm red / cool blue) that shift dominance on every polarity flip, with a flip shockwave ring and magnet attraction streams.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 90, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    ultra: { particles: 90, shadowMap: 2048, cascades: 2, textureMax: 2048 }
  }
});