// apps/showcase-aurora-lander/art/direction.ts — C-35 art direction (PRD-14 §6.9.12).
// Fantasy: night landing on an icy moon under a moving aurora; the exhaust
// lights the regolith.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-aurora-lander",
  genre: "lander",
  fantasy: "Night landing on an icy moon under a moving aurora; the exhaust lights the regolith.",
  rebuildTier: "S-world",
  wave: 3,
  references: [
    {
      file: "references/aurora-sky.json",
      source: "shipped comparable: aurora-lit night skies (Death Stranding north / FS night ops)",
      licence: "reference-only",
      why: "Moving aurora ribbons over a star field — the game's title promise — read the K1 starfield targets"
    },
    {
      file: "references/icy-regolith.json",
      source: "shipped comparable: icy moon surfaces (Moon in Kerbal / Deliver Us Mars surface runs)",
      licence: "reference-only",
      why: "Triplanar regolith/ice albedo + normal + detail layering the far-ring terrain is built from"
    },
    {
      file: "references/lander-craft.json",
      source: "admitted auroraLanderProbe GLB (460 tris) to be replaced by a panel-lined 3-5k lander",
      licence: "reference-only",
      why: "Panel-lined descent craft silhouette with nozzle assembly — the hero body every shot frames"
    }
  ],
  palette: {
    primary: ["#050a18", "#0c1a33", "#26426b", "#9fd8ff"],
    accent: "#46e0a0",
    reservedObjective: "#59d7ff"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 6500, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k1-starfield", background: "hdri" },
    exposureEV: -0.2
  },
  framing: { rig: "altitude", subjectHeightFraction: [0.08, 0.12], fovDeg: [35, 50], mobile: "landscape" },
  assets: [
    { role: "vehicle", assetKey: "descent-lander", maxTriangles: 5000, minTriangles: 3000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "moon-regolith", kit: "K3", maxTriangles: 240000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "pad-beacon", maxTriangles: 4000, minTriangles: 500, textureSet: "BC+N", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "aurora-ribbons", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "thrust-plume", kind: "cone" },
    { event: "ground-dust", kind: "burst" },
    { event: "snow-drift", kind: "ambient" },
    { event: "crash-debris", kind: "burst", flipbook: "k9-debris" },
    { event: "touchdown-shockwave", kind: "ring" }
  ],
  audio: [
    { event: "throttle", cue: "thruster-rpm", variants: 3 },
    { event: "wind", cue: "high-altitude-wind-bed", variants: 1 },
    { event: "touchdown", cue: "landing-thud", variants: 3 },
    { event: "crash", cue: "hull-crunch", variants: 2 },
    { event: "success", cue: "pad-stinger", variants: 1 }
  ],
  signatureEffect: "Aurora ribbons drifting over a starfield night sky while the nozzle exhaust casts a moving light across icy regolith.",
  standIns: [
    { feature: "K1 starfield + aurora ribbon layer", file: "src/v2/scene/world.ts", request: "R-14-13", removeWhen: "starfield sky + aurora preset admitted" },
    { feature: "K3 regolith splat + far rings", file: "src/v2/scene/world.ts", request: "R-14-13", removeWhen: "K3 terrain splat admitted" },
    { feature: "panel-lined lander + pad beacons", file: "src/v2/scene/props.ts", request: "R-14-07", removeWhen: "K7 lander craft admitted" },
    { feature: "K8 thruster loop set", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "K8 thruster clips admitted" }
  ],
  criticalCategories: ["environment_world", "atmospheric_effects", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1800, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
