// apps/showcase-cross-hop/src/art/direction.ts — GU47 WP-24 art direction (PRD §3.2 item 1, CH47-20).
// Fantasy: a handmade tabletop toy diorama seen through a tilt-shift lens, with a day clock across six themes.
import { defineArtDirection } from "@aura3d/game/art";

const CRITTERS = ["hop", "chick", "turtle", "bun", "axolotl", "ducky", "roboFrog", "toastCat", "mushroomKid", "knightToad", "astroFrog", "goldenHop"] as const;
const VEHICLES = ["trafficSedan", "trafficHatch", "trafficSuv", "trafficTaxi", "trafficVan", "trafficPickup", "trafficBoxtruck", "tramCar", "trainCar", "trafficSkyCar"] as const;

export default defineArtDirection({
  id: "cross-hop",
  genre: "platformer",
  fantasy: "A handmade tabletop toy diorama through a tilt-shift lens: felt meadows, clay critters, lacquered toy cars, one low sun.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/game-upgrades-47/cross-hop/identity.md#references",
      source: "generic reference: tilt-shift photography of real towns and model railways (miniature-faking lens blur)",
      licence: "reference-only",
      why: "A sharp horizontal focus band on the player row with blur ramping to the top and bottom of the frame"
    },
    {
      file: "evidence/game-upgrades-47/cross-hop/identity.md#references",
      source: "generic reference: handmade felt-and-clay stop-motion tabletop sets lit by one low practical sun",
      licence: "reference-only",
      why: "Felt and gravel ground with soft sheen, clay critters and painted wood props under one shadowed low key"
    },
    {
      file: "evidence/game-upgrades-47/cross-hop/identity.md#references",
      source: "generic reference: lacquered wooden toy cars and trains on bevelled play tiles",
      licence: "reference-only",
      why: "Glossy clearcoat vehicles and water against matte felt so surfaces separate by roughness, not by hue alone"
    }
  ],
  palette: {
    primary: ["#a8dcc4", "#f4dc8a", "#c8693f", "#4f5d6b"],
    accent: "#ffc531",
    reservedObjective: "#ffc531"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 4300, shadow: true },
    fill: "ibl",
    // Hemisphere fill everywhere; Emberline and Neon add pooled lamp points (lane report: the PRD's 12 exceeds this cap).
    practicals: 6,
    environment: { hdri: "spruit_sunrise", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "follow2d", subjectHeightFraction: [0.15, 0.2], fovDeg: [32, 35], mobile: "both" },
  assets: [
    ...CRITTERS.map((assetKey) => ({
      role: (assetKey === "hop" ? "hero" : "character") as "hero" | "character",
      assetKey,
      maxTriangles: 60000,
      minTriangles: 2000,
      textureSet: "BC+N" as const,
      maxTextureSize: 1024 as const,
      animated: { clips: ["Idle", "Regular_Jump"] }
    })),
    { role: "enemy", assetKey: "hawk", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "rescuePod", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "coin", maxTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    ...VEHICLES.map((assetKey) => ({
      role: "vehicle" as const,
      assetKey,
      maxTriangles: 40000,
      minTriangles: 2000,
      textureSet: "BC+N+ORM" as const,
      maxTextureSize: 1024 as const
    }))
  ],
  vfx: [
    { event: "hop-land", kind: "crosshop-land-dust" },
    { event: "log-land", kind: "crosshop-log-splash" },
    { event: "pad-land", kind: "crosshop-log-ring" },
    { event: "stone-land", kind: "crosshop-lava-sparks" },
    { event: "coin-pickup", kind: "crosshop-coin-pickup" },
    { event: "coin-combo", kind: "trail" },
    { event: "rescue-pod", kind: "crosshop-rescue-pop" },
    { event: "death-squashed", kind: "crosshop-death-squashed" },
    { event: "death-flattened", kind: "crosshop-death-flattened" },
    { event: "death-drowned", kind: "crosshop-death-drowned" },
    { event: "death-burned", kind: "crosshop-death-burned" },
    { event: "death-snatched", kind: "crosshop-death-snatched" }
  ],
  audio: [
    { event: "hop", cue: "whoosh.swing-light", variants: 1 },
    { event: "land", cue: "footsteps.grass", variants: 1 },
    { event: "coin", cue: "pickup.coin", variants: 1 },
    { event: "death", cue: "impact.plastic.medium", variants: 1 },
    { event: "theme", cue: "stinger.level-start", variants: 1 }
  ],
  signatureEffect: "tilt-shift diorama + day clock: tilt-shift blur bands on the player row and a sun that moves with progress",
  standIns: [
    { feature: "verge dressing kits, gate arches, lamp model, lane furniture (primitive pools)", file: "src/game/core.ts", request: "R-14-07", removeWhen: "WP-36 cross-hop kit GLBs admitted" },
    { feature: "coin, logs, lily pad, basalt stone (primitive pools)", file: "src/game/core.ts", request: "R-14-07", removeWhen: "WP-36 cross-hop prop GLBs admitted" }
  ],
  criticalCategories: ["postprocessing", "lighting", "camera", "environment_world"],
  tiers: {
    low: { particles: 600, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 1200, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    high: { particles: 2000, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 2, textureMax: 2048 }
  }
});
