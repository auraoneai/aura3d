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
      source: "instanced grunt capsule + elite box swarm pools (360 + 96 capacity)",
      licence: "reference-only",
      why: "Two instanced drone pools with deterministic seek/separation/orbit/flee/telegraph steering"
    },
    {
      file: "references/mech-hero.json",
      source: "admitted neonCourierAvatar GLB (Daniel Darko, CC-BY-4.0)",
      licence: "reference-only",
      why: "High-value cyan/white courier silhouette readable from overhead against the swarm"
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
    environment: { hdri: "night-city", background: "enclosed" },
    exposureEV: 0.0
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.3, 0.45], fovDeg: [35, 45], mobile: "landscape" },
  // The rebuilt single-path scene (src/main.ts) mounts the three admitted
  // typed model assets below (all present by id in aura.assets.json): the
  // courier avatar, the street barricade obstacles, and the perimeter street
  // lamps. Drones are native instanced capsule/box pools so 320+ threats
  // submit in two instanced draw calls.
  assets: [
    { role: "character", assetKey: "neonCourierAvatar", maxTriangles: 30000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048 },
    { role: "prop", assetKey: "neonBarricadeProp", maxTriangles: 15000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "neonStreetLampProp", maxTriangles: 25000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 }
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
  standIns: [],
  criticalCategories: ["environment_world", "lighting", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 2, textureMax: 4096 }
  }
});
