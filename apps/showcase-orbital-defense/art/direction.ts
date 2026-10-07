// apps/showcase-orbital-defense/art/direction.ts — C-35 art direction (PRD-14 §6.9.4).
// Fantasy: low-orbit defense at the planet's terminator; drones streak in against the Milky Way; every kill explodes.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-orbital-defense",
  genre: "arena-shooter",
  fantasy: "Low-orbit defense at the planet's terminator; drones streak in against the Milky Way; every kill explodes.",
  rebuildTier: "F",
  wave: 1,
  references: [
    {
      file: "references/deep-space-hdri.json",
      source: "K1 deep-space starfield HDRI (8k equirect)",
      licence: "reference-only",
      why: "Milky Way background + IBL; sun source matched to HDRI bright spot"
    },
    {
      file: "references/terminator-planet.json",
      source: "Earth terminator photography board",
      licence: "reference-only",
      why: "Day/night terminator with night-side city-light emission"
    },
    {
      file: "references/geometry-wars-webgl.json",
      source: "Geometry Wars / WebGL arena-shooter comparables board",
      licence: "reference-only",
      why: "Additive streak/trail readability and explosion clarity at a glance"
    }
  ],
  palette: {
    primary: ["#050810", "#0d1b2e", "#16294a", "#3d5a80"],
    accent: "#7cf4ff",
    reservedObjective: "#ff5a3c"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5800, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { hdri: "k1-deep-space", background: "hdri" },
    exposureEV: 0
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.65, 0.75], fovDeg: [35, 50], mobile: "landscape" },
  assets: [
    { role: "world", assetKey: "planet", kit: "K5", maxTriangles: 32768, minTriangles: 16384, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "hero", assetKey: "station-turret", kit: "K7", maxTriangles: 12000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "interceptor", kit: "K7", maxTriangles: 8000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "drone-a", kit: "K7", maxTriangles: 8000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "drone-b", kit: "K7", maxTriangles: 8000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "asteroid-belt", kit: "K5", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "bolt-fire", kind: "trail", flipbook: "k9-streak" },
    { event: "drone-kill", kind: "burst", flipbook: "k9-explosion" },
    { event: "shield-hit", kind: "burst", flipbook: "k9-ripple" },
    { event: "muzzle", kind: "burst", flipbook: "k9-flash" }
  ],
  audio: [
    { event: "fire", cue: "laser", variants: 3 },
    { event: "explosion", cue: "explosion", variants: 3 },
    { event: "shield", cue: "shield-hit", variants: 2 },
    { event: "bed", cue: "space-hum", variants: 1 },
    { event: "music", cue: "orbital-music", variants: 1 }
  ],
  signatureEffect: "Planet at terminator with city-light night side; every drone kill is an HDR additive explosion + flash.",
  standIns: [
    { feature: "orbital camera 25-35° above plane + slow drift", file: "src/v2/scene/camera.ts", request: "R-14-10", removeWhen: "C-22 rigs.orbit/topDown real" },
    { feature: "planet day/night terminator + atmosphere rim", file: "src/v2/scene/materials.ts", request: "R-14-14", removeWhen: "PRD 04 material.planet/atmosphere real (§8.1)" },
    { feature: "shield additive Fresnel + hex mask", file: "src/v2/scene/fx.ts", request: "R-14-14", removeWhen: "PRD 04 §8.1 shield variant real" },
    { feature: "laser/explosion/shield cues + hum bed", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "C-25 game-sfx real" }
  ],
  criticalCategories: ["environment_world", "modeling_assets", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 2048, cascades: 1, textureMax: 4096 }
  }
});
