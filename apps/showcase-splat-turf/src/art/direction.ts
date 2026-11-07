// Splat Turf art direction (WP-4). Fantasy: a paint-world carnival — a white road you colour in at speed.
// The look table is `../look.ts`; the signature effect is the persistent coverage map plus the solvent wipe wash.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "splat-turf",
  // The catalog genre is "arcade"; GameGenre has no plain arcade member, so the art contract uses the
  // nearest arcade family (same approach as slingshot-siege's golf-physics stand-in).
  genre: "maze-arcade",
  fantasy: "Race a paint ball down a white carnival road, colouring every metre while solvent strips and eraser bots try to wipe your trail.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: street paint festivals (colour runs, pigment powder over white pavement)",
      licence: "reference-only",
      why: "Saturated rainbow trail paint over a bright white road, cycling hue every 25 m stretch so coverage reads at a glance"
    },
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: carnival midway signage (plum ink lettering on cream enamel, gold bulb accents)",
      licence: "reference-only",
      why: "Plum ink HUD on cream paper chips with gold action buttons keeps every text pair above 4.5:1 against the busy paint world"
    },
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: watercolour wash-out techniques (solvent lifting fresh pigment off paper)",
      licence: "reference-only",
      why: "The solvent wipe wash desaturates a lane strip back to white with a brief cyan screen wash, mirroring pigment lift"
    }
  ],
  palette: {
    primary: ["#4f2a8f", "#ff9fc8", "#ffd9a8", "#ffffff"],
    accent: "#ffb400",
    reservedObjective: "#ff3d8b"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { preset: "neutral", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.1, 0.3], fovDeg: [55, 80], mobile: "both" },
  assets: [],
  vfx: [
    { event: "paint-trail", kind: "trail" },
    { event: "solvent-wipe", kind: "burst" },
    { event: "eraser-wipe", kind: "burst" },
    { event: "stretch-combo", kind: "burst" },
    { event: "finish", kind: "burst" }
  ],
  audio: [
    { event: "can", cue: "can", variants: 1 },
    { event: "solvent", cue: "solvent", variants: 1 },
    { event: "eraser", cue: "eraser", variants: 1 },
    { event: "stretch", cue: "stretch", variants: 1 },
    { event: "finish", cue: "finish", variants: 1 },
    { event: "gameover", cue: "gameover", variants: 1 }
  ],
  signatureEffect: "Paint-world carnival: a persistent per-cell coverage map rainbowing down a white road, with a cyan solvent wipe wash that lifts the trail back to white.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 90, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    ultra: { particles: 90, shadowMap: 2048, cascades: 1, textureMax: 2048 }
  }
});