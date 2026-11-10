// Splat Turf art direction (WP-17). Fantasy: sunlit urban skate-arena / paint-world carnival causeway —
// a warm gesso deck you coat in glossy clearcoat acrylic ink at speed.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "splat-turf",
  genre: "maze-arcade",
  fantasy: "Race a paint roller down a sunlit skate-park road, coating every metre in wet glossy ink while solvent strips and erasers wipe your trail.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: street paint festivals and sunlit skate-park bowls (glossy acrylic pigment over primed gesso concrete)",
      licence: "reference-only",
      why: "Saturated wet-clearcoat rainbow trail paint over a bright sunlit gesso road, cycling hue every 25 m stretch so coverage reads at a glance"
    },
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: broadcast sports territory meters and enamel signage (plum ink on cream paper, gold grade ticks)",
      licence: "reference-only",
      why: "Plum ink HUD on cream paper chips with gold action buttons and C/B/A/S territory ticks keeps every text pair above 4.5:1 against the sunlit world"
    },
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: watercolour & acrylic solvent wash-out techniques (solvent lifting fresh pigment off primed deck)",
      licence: "reference-only",
      why: "The solvent wipe wash lifts a lane strip back to primed gesso with a brief cyan wash, mirroring wet pigment lift"
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
    environment: { preset: "softbox", background: "sky" },
    exposureEV: 0.08
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
  signatureEffect: "Sunlit wet-ink skate-arena carnival: a persistent GPU splat coverage map with raised clearcoat meniscus highlights down a primed gesso road, plus a cyan solvent wipe wash that lifts pigment back to white.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 90, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    high: { particles: 90, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 90, shadowMap: 2048, cascades: 2, textureMax: 2048 }
  }
});
