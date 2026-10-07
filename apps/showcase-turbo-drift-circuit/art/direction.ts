// apps/showcase-turbo-drift-circuit/art/direction.ts — C-35 art direction (PRD-14 §6.9.2).
// Fantasy: sunset alpine circuit — golden low sun, long shadows, tyre smoke.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-turbo-drift-circuit",
  genre: "racing",
  fantasy: "Sunset alpine circuit: golden low sun, long shadows, tyre smoke.",
  rebuildTier: "S-world",
  wave: 1,
  references: [
    {
      file: "references/sunset-alpine-hdri.json",
      source: "Poly Haven sunset/alpine HDRI set (K1, CC0)",
      licence: "reference-only",
      why: "Golden low sun as sky and IBL source; long-shadow direction for the CSM"
    },
    {
      file: "references/trackmania-webgl.json",
      source: "TrackMania / WebGL racing comparables board",
      licence: "reference-only",
      why: "Shipped-target chase framing and speed readability"
    },
    {
      file: "references/asphalt-circuit.json",
      source: "K3 circuit-surface reference set",
      licence: "reference-only",
      why: "UV'd asphalt with rubbered racing line, kerb and run-off decals"
    }
  ],
  palette: {
    primary: ["#35452e", "#5a4632", "#8c6a3f", "#d98d4a"],
    accent: "#f2a65a",
    reservedObjective: "#ffd24d"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2400, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { hdri: "k1-sunset", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.2, 0.28], fovDeg: [55, 68], mobile: "landscape" },
  assets: [
    { role: "hero", assetKey: "hero-car", kit: "K2", maxTriangles: 60000, minTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "turbo-road", kit: "K3", maxTriangles: 90000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "splat-terrain", kit: "K3", maxTriangles: 120000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "trackside-mods", kit: "K3", maxTriangles: 80000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "ai-cars", kit: "K2", maxTriangles: 40000, minTriangles: 15000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "grandstand-crowd", kit: "K6", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "tyre-slip", kind: "trail", flipbook: "k9-smoke-lit" },
    { event: "wall-scrape", kind: "burst", flipbook: "k9-sparks" },
    { event: "off-track", kind: "trail", flipbook: "k9-dust" }
  ],
  audio: [
    { event: "engine", cue: "car-sport-rpm", variants: 1 },
    { event: "skid", cue: "skid-loop", variants: 1 },
    { event: "wind", cue: "speed-wind", variants: 1 },
    { event: "bed", cue: "crowd-bed", variants: 1 },
    { event: "music", cue: "turbo-music", variants: 1 }
  ],
  signatureEffect: "Golden-hour sun with 3-cascade CSM over a textured alpine circuit; lit tyre smoke reads slip.",
  standIns: [
    { feature: "chase rig subjectHeightFraction + fov perSpeed", file: "src/v2/scene/camera.ts", request: "R-14-10", removeWhen: "C-22 rigs.chase real" },
    { feature: "spline-extruded road + splat terrain", file: "src/v2/scene/world.ts", request: "R-14-13", removeWhen: "PRD 10 road/terrain/scatter real" },
    { feature: "clearcoat car paint + flake normal", file: "src/v2/scene/materials.ts", request: "R-14-14", removeWhen: "PRD 04 clearcoat real (§8.6)" },
    { feature: "3-cascade CSM sun shadows", file: "src/v2/scene/lighting.ts", request: "R-14-14", removeWhen: "C-10 CSM real" },
    { feature: "car-sport RPM engine layer", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "C-25 game-sfx real" }
  ],
  criticalCategories: ["environment_world", "shadows", "vfx"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1800, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
