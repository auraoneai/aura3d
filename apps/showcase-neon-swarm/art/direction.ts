// apps/showcase-neon-swarm/art/direction.ts — C-35 art direction (PRD-14 §6.9.8).
// Fantasy: neon plaza at night overrun by a swarm — readable silhouettes on a
// reflective grid.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-neon-swarm",
  genre: "twin-stick",
  fantasy: "Neon plaza at night overrun by a swarm — readable silhouettes on a reflective grid.",
  rebuildTier: "S-world",
  wave: 2,
  references: [
    {
      file: "references/night-plaza.json",
      source: "shipped comparable: neon-lit plaza arenas (Geometry Wars / Ghostrunner plaza)",
      licence: "reference-only",
      why: "Overhead readability, baked emissive grid and night-atmosphere the arena targets"
    },
    {
      file: "references/drone-swarm.json",
      source: "admitted neonSwarmInterceptFleet / neonSwarmEngineHiveFleet GLBs (45k tris)",
      licence: "reference-only",
      why: "Two rigged+skinned drone families already admitted — silhouette and emissive budget"
    },
    {
      file: "references/mech-hero.json",
      source: "admitted neonSwarmMechHero GLB (28.7k tris, 124 joints, 37 clips)",
      licence: "reference-only",
      why: "The hero mech — clip list defines run/strafe/fire/staff states to wire"
    }
  ],
  palette: {
    primary: ["#070a14", "#101a2e", "#1e2a44", "#25345c"],
    accent: "#35e0ff",
    reservedObjective: "#ff8ae0"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    practicals: 3,
    environment: { hdri: "k1-night-city", background: "hdri" },
    exposureEV: 0.0
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.3, 0.45], fovDeg: [35, 45], mobile: "landscape" },
  assets: [
    { role: "character", assetKey: "mech-hero", maxTriangles: 30000, minTriangles: 10000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048, animated: { clips: ["run", "strafe", "fire", "staff"] } },
    { role: "enemy", assetKey: "intercept-drone", maxTriangles: 30000, minTriangles: 3000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024, animated: { clips: ["fly", "attack"] } },
    { role: "enemy", assetKey: "hive-drone", maxTriangles: 30000, minTriangles: 3000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024, animated: { clips: ["fly", "attack"] } },
    { role: "world", assetKey: "night-plaza-arena", kit: "K2", maxTriangles: 120000, textureSet: "BC+N+E", maxTextureSize: 2048 },
    { role: "prop", assetKey: "plaza-lamps", kit: "K2", maxTriangles: 5000, textureSet: "BC+N+ORM+E", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "muzzle", kind: "burst", flipbook: "k9-muzzle" },
    { event: "drone-death", kind: "flipbook", flipbook: "k9-explosion" },
    { event: "beam", kind: "tracer" },
    { event: "dash", kind: "trail" },
    { event: "pickup", kind: "ring" }
  ],
  audio: [
    { event: "fire", cue: "energy-fire", variants: 4 },
    { event: "hit", cue: "drone-hit", variants: 4 },
    { event: "explosion", cue: "drone-explode", variants: 3 },
    { event: "pickup", cue: "energy-pickup", variants: 2 },
    { event: "bed", cue: "neon-night-bed", variants: 1 }
  ],
  signatureEffect: "Baked emissive grid under drifting night atmosphere; drone explosions light the swarm while the hero stays silhouette-crisp from overhead.",
  standIns: [
    { feature: "K2 plaza architecture", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "K2 kit admitted" },
    { feature: "drone material authenticity (multi-UV/ORM)", file: "src/v2/scene/drones.ts", request: "R-14-15", removeWhen: "admitted drone materials inspected" },
    { feature: "mech walk/strafe staff clips", file: "src/v2/animation.ts", request: "R-14-14", removeWhen: "C-19 clip controller real" },
    { feature: "drone-death flipbook", file: "src/v2/fx.ts", request: "R-14-15", removeWhen: "K9 flipbook clips admitted" }
  ],
  criticalCategories: ["environment_world", "lighting", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 2, textureMax: 4096 }
  }
});
