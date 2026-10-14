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
      source: "route-local CC0 patrolWingPlane / drone family (scripts/build-models.mjs) staged in aura.assets.json",
      licence: "reference-only",
      why: "The authored +X-forward stunt plane and quad-rotor drone silhouettes the fresh single-path scene flies"
    },
    {
      file: "references/ring-gates.json",
      source: "extracted ring course in src/gameplay/course-data.ts (RING_GATES) + racing-style slalom gate language",
      licence: "reference-only",
      why: "Emissive torus gates the patrol route threads — objective ring treatment across the sortie"
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
  // The rebuilt single-path scene (src/scene.ts) renders from exactly the
  // four admitted typed assets in apps/showcase-patrol-wing/aura.assets.json:
  // the authored stunt plane (player + ghost shell), the two pursuit-drone
  // variants, and the landing-pad beacon. Island terrain, ocean, and ring
  // gates are authored geometry over the extracted course data, not GLBs,
  // and the 19.8 MB Meshy hero the trashed scene flew is not re-admitted.
  // No asset is staged in a shared kit yet, so no `kit` is claimed: S10's
  // kit half stays failing until a human look-dev review accepts a staged
  // kit file (verdicts are never authored here). Triangle budgets bound the
  // measured GLBs (plane 220 tris, drones 108 each, pad beacon 88).
  assets: [
    { role: "vehicle", assetKey: "patrolWingPlane", minTriangles: 2000, maxTriangles: 5000, textureSet: "BC+N", maxTextureSize: 512 },
    { role: "enemy", assetKey: "patrolWingDroneA", minTriangles: 2000, maxTriangles: 5000, textureSet: "BC+N", maxTextureSize: 512 },
    { role: "enemy", assetKey: "patrolWingDroneB", minTriangles: 2000, maxTriangles: 5000, textureSet: "BC+N", maxTextureSize: 512 },
    { role: "prop", assetKey: "patrolWingPadBeacon", maxTriangles: 300, textureSet: "BC", maxTextureSize: 512 }
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
  signatureEffect: "Golden-hour look over a real ocean plane to the horizon, an authored island heightfield, and emissive ring gates threading the sortie.",
  standIns: [
    { feature: "K1 sunset-ocean HDRI + PRD 10 ocean (golden-hour look + PBR ocean plane stand in)", file: "src/scene.ts", request: "R-14-13", removeWhen: "ocean preset + sunset HDRI admitted" },
    { feature: "K3 island splat terrain (authored heightfield triangulation stands in)", file: "src/scene.ts", request: "R-14-13", removeWhen: "K3 terrain splat admitted" },
    { feature: "K9 explosion clips (pool fx bursts stand in)", file: "src/main.ts", request: "R-14-07", removeWhen: "K9 flipbooks admitted" },
    { feature: "K8 prop-plane RPM set (sfx-pack ambience loop stands in)", file: "src/main.ts", request: "R-14-09", removeWhen: "K8 engine loops admitted" }
  ],
  criticalCategories: ["environment_world", "camera", "atmospheric_effects"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2400, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
