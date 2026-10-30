// examples/drift-and-deliver-port/art/direction.ts — GU47 WP-28 (G18) art direction, "Last shift on the harbour".
// A pastel hillside port town just after summer rain; the 3:00 shift runs the sun down from golden light to sunset to
// blue hour. Look table: ../phases.ts (PHASES). VFX pack: ../fx.ts. Identity sheet:
// evidence/game-upgrades-47/drift-and-deliver-port/identity.md.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "drift-and-deliver-port",
  genre: "vehicle-delivery",
  fantasy: "Last courier shift in a rain-washed pastel harbour town, racing the sun from golden hour into blue hour.",
  rebuildTier: "S-presentation",
  wave: 2,
  references: [
    {
      file: "evidence/game-upgrades-47/drift-and-deliver-port/identity.md#references",
      source: "generic reference: Mediterranean hillside port towns at golden hour after a summer shower (travel photography)",
      licence: "reference-only",
      why: "Terracotta, mint and cream stucco blocks stepping down to a harbour, with wet charcoal streets mirroring a warm sky"
    },
    {
      file: "evidence/game-upgrades-47/drift-and-deliver-port/identity.md#references",
      source: "generic reference: blue-hour street photography of sodium-lit old towns",
      licence: "reference-only",
      why: "Sodium lamp pools and shop windows switching on block by block against an ink-blue sky with the last rose glow"
    },
    {
      file: "evidence/game-upgrades-47/drift-and-deliver-port/identity.md#references",
      source: "shipped comparable: arcade delivery and taxi games with a tall objective pillar over the rooftops",
      licence: "reference-only",
      why: "A single reserved-colour light pillar you can read from 300 m above the skyline, with a ring burst on delivery"
    }
  ],
  palette: {
    // asphalt, terracotta, mint, cream
    primary: ["#2b2f36", "#d9765f", "#9fd8c4", "#efe3cf"],
    accent: "#ffb347",
    // courier teal: the car, the drop-off beacon and the minimap only
    reservedObjective: "#22c3c9"
  },
  lighting: {
    // golden sun 3200 K grading to a 7500 K moon fill at blue hour; one shadowed key at every phase
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    // 5 sodium lamp pool points + 1 headlight spot (C-35 caps practicals at 6; GC-L4 asked for 16)
    practicals: 6,
    environment: { hdri: "venice_sunset", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.15, 0.2], fovDeg: [58, 72], mobile: "both" },
  assets: [
    { role: "vehicle", assetKey: "courier", maxTriangles: 60000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "sedan", maxTriangles: 12000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "hatch", maxTriangles: 12000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "van", maxTriangles: 12000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "truck", maxTriangles: 14000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "lamp", maxTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "signal", maxTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "tree", maxTriangles: 6000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "palm", maxTriangles: 6000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "shelter", maxTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "hydrant", maxTriangles: 6000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "clocktower", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "lighthouse", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "watertank", maxTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "drift", kind: "courier-tyre-smoke" },
    { event: "drift-skid", kind: "skid-ribbon" },
    { event: "nitro", kind: "courier-nitro-streak" },
    { event: "delivered", kind: "courier-delivery-ring" },
    { event: "job-missed", kind: "courier-job-missed" },
    { event: "pickup-coin", kind: "courier-pickup-parcel" },
    { event: "pickup-star", kind: "courier-pickup-express" },
    { event: "pickup-heart", kind: "courier-pickup-care" },
    { event: "traffic-bump", kind: "courier-traffic-bump" }
  ],
  audio: [
    { event: "pickup", cue: "pickup-chime", variants: 3 },
    { event: "delivered", cue: "delivery-chime", variants: 1 },
    { event: "traffic-bump", cue: "thud", variants: 1 },
    { event: "engine", cue: "engine-bed", variants: 1 }
  ],
  signatureEffect: "delivery-beacon",
  criticalCategories: ["lighting", "environment_world", "atmospheric_effects", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 200, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 400, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1200, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
