// examples/strange-orbit-port/art/direction.ts — GU47 WP-25 (lane g15) art direction for Craterline GP.
// Look table: ./look.ts. VFX preset pack: ./vfx.ts. Identity sheet: evidence/game-upgrades-47/strange-orbit-port/identity.md.
import { defineArtDirection } from "@aura3d/game/art";

const SHEET = "../../../evidence/game-upgrades-47/strange-orbit-port/identity.md";

export default defineArtDirection({
  id: "strange-orbit-port",
  genre: "racing",
  fantasy: "A moon race painted in thick gouache at permanent planet-rise, along a jagged crater rim under a low white sun.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: `${SHEET}#references`,
      source: "generic reference: thick gouache and oil impasto landscape painting with raking side light",
      licence: "reference-only",
      why: "Visible brush relief on the road that a low raking key picks out, with long cast shadows across the strokes"
    },
    {
      file: `${SHEET}#references`,
      source: "generic reference: retro space-age planetary illustration with a banded ringed gas giant on the horizon",
      licence: "reference-only",
      why: "A huge banded peach planet with a ring filling one side of the sky, painted rather than photographic"
    },
    {
      file: `${SHEET}#references`,
      source: "generic reference: lunar crater rim photography at low sun angle",
      licence: "reference-only",
      why: "A jagged, strata-banded crater wall silhouette on the horizon and dense mist pooling below the rim"
    }
  ],
  palette: {
    // terracotta road, deep teal vein, chalk highlight, violet nebula
    primary: ["#d98464", "#294e52", "#f3ddaf", "#5b3f86"],
    accent: "#ecb75f",
    reservedObjective: "#93ead5"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    // hemisphere ground bounce, planetshine directional, headlight spot, 3 rival tail points
    practicals: 6,
    environment: { preset: "capture:nebula-gas-giant", background: "sky" },
    exposureEV: 1.75
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [60, 76], mobile: "both" },
  assets: [
    { role: "vehicle", assetKey: "bikeRider", maxTriangles: 120000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "rivalBike", maxTriangles: 120000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "skateRider", maxTriangles: 120000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "pylon", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "boulderA", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "boulderB", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "backdrop", assetKey: "lander", maxTriangles: 80000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "backdrop", assetKey: "observatory", maxTriangles: 80000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "moonRock", maxTriangles: 40000, textureSet: "BC+N", maxTextureSize: 2048 }
  ],
  vfx: [
    { event: "land", kind: "craterline-land-dust" },
    { event: "hit", kind: "craterline-hit-debris" },
    { event: "dust", kind: "craterline-dust-pickup" },
    { event: "gate", kind: "craterline-gate-ring" },
    { event: "sling", kind: "craterline-sling" },
    { event: "boost", kind: "trail" }
  ],
  audio: [
    { event: "gate", cue: "gate", variants: 1 },
    { event: "dust", cue: "dust", variants: 1 },
    { event: "hit", cue: "hit", variants: 1 },
    { event: "land", cue: "land", variants: 1 },
    { event: "lap", cue: "lap", variants: 1 }
  ],
  signatureEffect: "Brush-textured moving gouache painting: impasto road relief raked by a low white sun into long shadows, under a ringed peach gas giant.",
  criticalCategories: ["lighting", "shadows", "texture_quality", "atmospheric_effects", "composition"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
