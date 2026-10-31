// apps/showcase-heatsink/art/direction.ts: C-35 art direction for Thermal Drift (GU47 WP-13, G03).
// Fantasy: a race through a foundry megacity seen through heat. The three circuits are three times of day of one
// foundry city (look table: src/look.ts); the signature effect is a refraction heat haze (src/heatHaze.ts).
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-heatsink",
  genre: "racing",
  fantasy: "A combat-drone race through a foundry megacity seen through heat: molten channels, slag light and refracting exhaust.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/foundry-night.json",
      source: "photographic reference: steel-mill casting floors and blast-furnace tapping at night (generic industrial photography)",
      licence: "reference-only",
      why: "Warm molten-amber key against soot-black iron, with slag-red falloff and steam catching the light; the MEGACITY palette"
    },
    {
      file: "references/dust-storm-sunset.json",
      source: "photographic reference: low sun through an ochre dust storm over an industrial plain (generic weather photography)",
      licence: "reference-only",
      why: "A 9-degree burnt sun behind suspended dust: god rays, height fog that eats the far road, ochre ground; the DUSTFALL mood"
    },
    {
      file: "references/heat-shimmer.json",
      source: "shipped comparable: exhaust heat shimmer and thermal-camera ramps in racing and flight games (generic genre convention)",
      licence: "reference-only",
      why: "Refraction behind hot exhausts and vents that bends the city without blurring the track, plus a thermal edge ramp near overheat"
    }
  ],
  palette: {
    // Soot, oxidised iron, molten amber, slag red. Coolant cyan is reserved for pickups, shields and the cooling HUD.
    primary: ["#14110f", "#3a2a22", "#ff8a1f", "#d2361c"],
    accent: "#35d6ff",
    reservedObjective: "#35d6ff"
  },
  lighting: {
    // One PCSS 3-cascade key per circuit (MEGACITY #ffb070 sodium, DUSTFALL #ff9a4a burnt sun, VESPER #b9a4ff pre-dawn).
    key: { type: "directional", colorTemperatureK: 3000, shadow: true },
    fill: "ibl",
    // Unshadowed: cyan counter-rim, drone headlight, gantry sodium points (VESPER trades one for the vent up-fill).
    practicals: 6,
    environment: { hdri: "cobblestone_street_night", background: "hdri" },
    exposureEV: 0.4
  },
  framing: { rig: "chase", subjectHeightFraction: [0.15, 0.25], fovDeg: [62, 84], mobile: "both" },
  assets: [
    { role: "vehicle", assetKey: "heatsinkDroneOrion", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "heatsinkDroneVolt", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "heatsinkDroneBastion", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "heatsinkDroneSpectre", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "heatsinkDroneRazor", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "heatsinkDroneNighthawk", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "heatsinkDroneWraith", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "heatsinkGantryStart", maxTriangles: 40000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "world", assetKey: "heatsinkArch", maxTriangles: 40000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "world", assetKey: "heatsinkOverpass", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "heatsinkTunnelFrame", maxTriangles: 40000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "heatsinkStatue", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "heatsinkTowerL", maxTriangles: 60000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "heatsinkTowerT", maxTriangles: 60000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "heatsinkTowerX", maxTriangles: 60000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "heatsinkHoloBillboard", maxTriangles: 20000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "heatsinkLavaFall", maxTriangles: 20000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "heatsinkWaterEmitter", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkBarrierA", maxTriangles: 12000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkCheckpointRing", maxTriangles: 20000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkBoostPad", maxTriangles: 12000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkCoolingCanister", maxTriangles: 12000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkShieldPickup", maxTriangles: 12000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkExplosiveBarrel", maxTriangles: 12000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkWeaponShockwave", maxTriangles: 12000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkWeaponMine", maxTriangles: 12000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "barrel", kind: "td-slag-burst" },
    { event: "hit", kind: "td-ember-hit" },
    { event: "scrape", kind: "td-wall-scrape" },
    { event: "pickup-coolant", kind: "td-coolant-burst" },
    { event: "pickup-boost", kind: "td-boost-flare" },
    { event: "shock", kind: "td-shock" },
    { event: "takedown", kind: "td-slag-burst" },
    { event: "missile-flight", kind: "trail" },
    { event: "drone-exhaust", kind: "trail" },
    { event: "overheat", kind: "heat-haze-edge-ramp" }
  ],
  audio: [
    { event: "countdown", cue: "tick", variants: 1 },
    { event: "go", cue: "go", variants: 1 },
    { event: "lap", cue: "lap", variants: 1 },
    { event: "hit", cue: "hit", variants: 1 },
    { event: "takedown", cue: "takedown", variants: 1 },
    { event: "boost", cue: "drone-boost", variants: 1 }
  ],
  signatureEffect: "Refraction heat haze: drone exhausts, lava curtains and foundry vents bend the megacity behind them, and the screen edge runs a thermal ramp as the core overheats.",
  criticalCategories: ["lighting", "atmospheric_effects", "postprocessing", "vfx", "environment_world"],
  tiers: {
    low: { particles: 48, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 72, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    high: { particles: 96, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 96, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
