// apps/aura-clash-showcase/art/direction.ts — C-35 art direction (PRD-14 §6.9.3).
// Fantasy: rain-soaked neon rooftop street fight, 2.5D.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "aura-clash-showcase",
  genre: "fighting",
  fantasy: "Rain-soaked neon rooftop street fight, 2.5D.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    {
      file: "references/night-city-hdri.json",
      source: "K1 night-city street / dusk rooftop city HDRI",
      licence: "reference-only",
      why: "Wet-neon skyline key direction and city-light IBL"
    },
    {
      file: "street-fighter-comparables.json",
      source: "fighting-game framing comparables board",
      licence: "reference-only",
      why: "2.5D fight-plane composition; fighters 45-60% of frame height"
    },
    {
      file: "wet-neon-materials.json",
      source: "wet asphalt + neon signage reference set",
      licence: "reference-only",
      why: "Neon signs at HDR emissive 4-8 over dark wet ground; SSR wet floor"
    }
  ],
  palette: {
    primary: ["#0b1020", "#1d2b3a", "#35414f", "#5b6b7c"],
    accent: "#ff2d78",
    reservedObjective: "#39d6ff"
  },
  lighting: {
    key: { type: "spot", colorTemperatureK: 4000, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k1-night-city", background: "enclosed" },
    exposureEV: -0.3
  },
  framing: { rig: "fighting", subjectHeightFraction: [0.45, 0.6], fovDeg: [30, 34], mobile: "landscape" },
  assets: [
    { role: "hero", assetKey: "fighter-p1", kit: "K2", maxTriangles: 40000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "hero", assetKey: "fighter-p2", kit: "K2", maxTriangles: 40000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "rooftop-arena", kit: "K4", maxTriangles: 90000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "skyline-layer", kit: "K2", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "vertex-crowd", kit: "K6", maxTriangles: 15000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "hit-impact", kind: "burst", flipbook: "k9-spark" },
    { event: "dash", kind: "trail", flipbook: "k9-afterimage" },
    { event: "landing", kind: "burst", flipbook: "k9-dust" }
  ],
  audio: [
    { event: "hit", cue: "kenney-hit", variants: 6 },
    { event: "whoosh", cue: "move-whoosh", variants: 3 },
    { event: "announcer", cue: "round-fight-ko", variants: 3 },
    { event: "bed", cue: "crowd-bed", variants: 1 },
    { event: "music", cue: "clash-music", variants: 1 }
  ],
  signatureEffect: "Warm overhead spot over rain-lit neon: 0.08 s impact point light with K9 spark flipbook on every hit.",
  standIns: [
    { feature: "fighting rig subjectHeightFraction 0.5 + separation dolly", file: "src/v2/scene/camera.ts", request: "R-14-10", removeWhen: "C-22 rigs.fighting real" },
    { feature: "rim term team identity", file: "src/v2/scene/materials.ts", request: "R-14-14", removeWhen: "PRD 04 rim real (§8.10)" },
    { feature: "SSR wet floor + rain", file: "src/v2/scene/fx.ts", request: "R-14-14", removeWhen: "C-13 SSR + C-21 rain real" },
    { feature: "announcer + crowd bed", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "C-25 game-sfx real" }
  ],
  criticalCategories: ["lighting", "vfx", "animation_quality", "camera"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 1500, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 2200, shadowMap: 2048, cascades: 1, textureMax: 4096 }
  }
});
