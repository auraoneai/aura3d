// apps/showcase-patrol-wing/art/direction.ts — C-35 art direction (PRD-14 §6.9.11).
// Fantasy: evening coastal patrol — sunset over the ocean, island cliffs,
// drones to intercept, rings to thread.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-patrol-wing",
  genre: "flight",
  fantasy: "Evening coastal patrol: sunset over the ocean, island cliffs, drones to intercept, rings to thread.",
  rebuildTier: "S-world",
  wave: 3,
  references: [
    {
      file: "references/sunset-ocean.json",
      source: "shipped comparable: sunset coastal flight scenes (Microsoft Flight Simulator golden-hour coastline / Ace Combat dusk missions)",
      licence: "reference-only",
      why: "Low warm sun over open water with island silhouettes reads the K1 sunset-ocean lighting targets"
    },
    {
      file: "references/patrol-aircraft.json",
      source: "admitted patrolAircraftMeshy GLB (60k tris, BC+N+MR) + K7 drone/vehicle kit",
      licence: "reference-only",
      why: "The Meshy hero aircraft silhouette and the PBR drone family the intercept wave is built from"
    },
    {
      file: "references/ring-gates.json",
      source: "existing ring/sensor layer in src/sky.ts (RING_GATES) + racing-style slalom gate language",
      licence: "reference-only",
      why: "Emissive-gradient torus gates the patrol route threads — objective ring treatment across the sortie"
    }
  ],
  palette: {
    primary: ["#0d2237", "#1e4a5f", "#d98e4a", "#f4e3c2"],
    accent: "#ffb454",
    reservedObjective: "#59d7ff"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k1-sunset-ocean", background: "hdri" },
    exposureEV: 0.1
  },
  framing: { rig: "flight", subjectHeightFraction: [0.12, 0.3], fovDeg: [65, 73], mobile: "landscape" },
  assets: [
    { role: "vehicle", assetKey: "patrol-aircraft", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "ocean-islands", kit: "K3", maxTriangles: 260000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "enemy", assetKey: "intercept-drone", kit: "K7", maxTriangles: 30000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "radar-tower-props", kit: "K3", maxTriangles: 40000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "wingtip-contrail", kind: "trail" },
    { event: "engine-heat-haze", kind: "shimmer" },
    { event: "drone-kill", kind: "burst", flipbook: "k9-explosion" },
    { event: "tracer-fire", kind: "trail" },
    { event: "ring-pass", kind: "ring" }
  ],
  audio: [
    { event: "engine-rpm", cue: "prop-plane-rpm", variants: 3 },
    { event: "wind-speed", cue: "airspeed-wind-bed", variants: 1 },
    { event: "gunfire", cue: "cannon-burst", variants: 3 },
    { event: "drone-destroyed", cue: "air-burst", variants: 2 },
    { event: "ring-clear", cue: "gate-chime", variants: 2 }
  ],
  signatureEffect: "Sunset-ocean HDRI sky with a real ocean plane to the horizon, cliff island splats, and emissive ring gates threading the sortie.",
  standIns: [
    { feature: "K1 sunset-ocean HDRI + PRD 10 ocean", file: "src/v2/scene/world.ts", request: "R-14-13", removeWhen: "ocean preset + sunset HDRI admitted" },
    { feature: "K3 island splat + runway terrain", file: "src/v2/scene/world.ts", request: "R-14-13", removeWhen: "K3 terrain splat admitted" },
    { feature: "K9 explosion clips", file: "src/v2/fx.ts", request: "R-14-15", removeWhen: "K9 flipbooks admitted" },
    { feature: "K8 prop-plane RPM set", file: "src/v2/audio.ts", request: "R-14-15", removeWhen: "K8 engine loops admitted" }
  ],
  criticalCategories: ["environment_world", "camera", "atmospheric_effects"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2400, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
