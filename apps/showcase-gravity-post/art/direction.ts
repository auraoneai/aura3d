// apps/showcase-gravity-post/art/direction.ts — C-35 art direction (PRD-14 §6.9.13).
// Fantasy: slingshot courier between lit planets; orbits are thin light, the
// sun actually lights the system.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-gravity-post",
  genre: "orbital-puzzle",
  fantasy: "Slingshot courier between lit planets; orbits are thin light, the sun actually lights the system.",
  rebuildTier: "S-world",
  wave: 3,
  references: [
    {
      file: "references/deep-space-system.json",
      source: "shipped comparable: lit-planet system boards (Outer Wilds solar system / FTL system map)",
      licence: "reference-only",
      why: "One sun disc lighting every planet with real terminators reads the K1 deep-space targets"
    },
    {
      file: "references/atmospheric-planets.json",
      source: "shipped comparable: atmosphere-shell planets (Elite-style planetary rims)",
      licence: "reference-only",
      why: "Albedo+normal planet spheres with a fresnel atmosphere shell — the §8.1 one-art-language target"
    },
    {
      file: "references/orbit-lines.json",
      source: "existing RING/orbit guides in src/wells.ts trajectories, restyled as thin additive lines",
      licence: "reference-only",
      why: "Hairline orbit ribbons + dock gate markers — the navigation language the board view depends on"
    }
  ],
  palette: {
    primary: ["#040612", "#0d1b33", "#274472", "#e8b04a"],
    accent: "#ffd166",
    reservedObjective: "#59d7ff"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5800, shadow: true },
    fill: "ibl",
    practicals: 1,
    environment: { hdri: "k1-deep-space", background: "hdri" },
    exposureEV: 0.0
  },
  framing: { rig: "orbit", subjectHeightFraction: [0.5, 0.9], fovDeg: [40, 60], mobile: "landscape" },
  // The single-path scene (src/main.ts) renders from the admitted typed assets
  // in apps/showcase-gravity-post/aura.assets.json: the courier skiff pod,
  // dock gate and beacon station props, and the five NASA planet models for
  // Cinder/Verdance/Aquaria/Rust/Gale. No asset is staged in a shared kit, so
  // no `kit` is claimed.
  assets: [
    { role: "vehicle", assetKey: "gravityPostCourierSkiff", maxTriangles: 12000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "gravityPostDockGate", maxTriangles: 24000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "gravityPostDockBeacon", maxTriangles: 24000, minTriangles: 1000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "gravityPlanetMercury", maxTriangles: 32000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "world", assetKey: "gravityPlanetEarth", maxTriangles: 32000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "world", assetKey: "gravityPlanetNeptune", maxTriangles: 32000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "world", assetKey: "gravityPlanetMars", maxTriangles: 32000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "world", assetKey: "gravityPlanetJupiter", maxTriangles: 32000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048 }
  ],
  vfx: [
    { event: "orbit-guide", kind: "trail" },
    { event: "pod-thrust", kind: "cone" },
    { event: "flight-ribbon", kind: "trail" },
    { event: "dock-clamp", kind: "burst" },
    { event: "delivery", kind: "ring" }
  ],
  audio: [
    { event: "launch", cue: "slingshot-release", variants: 2 },
    { event: "thrust", cue: "thruster-loop", variants: 2 },
    { event: "dock", cue: "dock-clamp", variants: 2 },
    { event: "delivered", cue: "delivery-stinger", variants: 1 },
    { event: "bed", cue: "space-hum", variants: 1 }
  ],
  signatureEffect: "A sun-lit system board — every planet shows a real terminator — crossed by hairline orbit guides and a ribboned courier path.",
  standIns: [],
  criticalCategories: ["lighting", "pbr_credibility", "environment_world"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
