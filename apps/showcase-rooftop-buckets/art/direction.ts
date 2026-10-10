// apps/showcase-rooftop-buckets/art/direction.ts — C-35 art direction (PRD-14 §6.9.6).
// Fantasy: dusk streetball on a city rooftop, skyline lights coming on.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-rooftop-buckets",
  genre: "basketball",
  fantasy: "Dusk streetball on a city rooftop, skyline lights coming on.",
  rebuildTier: "S-world",
  wave: 2,
  references: [
    {
      file: "references/dusk-rooftop-hdri.json",
      source: "K1 dusk city-rooftop HDRI set (CC0)",
      licence: "reference-only",
      why: "Dusk skyline plate the open wall composition and warm-cool rim lighting target"
    },
    {
      file: "references/streetball-court.json",
      source: "shipped comparable: NBA Street / playground-court boards",
      licence: "reference-only",
      why: "Painted-concrete court wear, chain-link + parapet reads, dusk floodlight pools"
    },
    {
      file: "references/skinned-athletes.json",
      source: "admitted rooftopLayupScorer / rooftopDefender GLBs (44.6k tris, 191 joints, 4 clips)",
      licence: "reference-only",
      why: "The in-play athletes — clip set and joint budget drive the animation plan"
    }
  ],
  palette: {
    primary: ["#141b2e", "#2e3b52", "#6b4a2f", "#d98d4a"],
    accent: "#38d6ff",
    reservedObjective: "#ffd24d"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2600, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k1-dusk-rooftop", background: "hdri" },
    exposureEV: -0.1
  },
  framing: { rig: "shoulder", subjectHeightFraction: [0.4, 0.6], fovDeg: [40, 55], mobile: "landscape" },
  assets: [
    { role: "character", assetKey: "rooftop-layup-scorer", maxTriangles: 45000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["ready", "release", "celebrate"] } },
    { role: "character", assetKey: "rooftop-defender", maxTriangles: 45000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["contest", "idle"] } },
    { role: "world", assetKey: "rooftop-court", kit: "K2", maxTriangles: 80000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "hoop-set", kit: "K4", maxTriangles: 15000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "k2-skyline", kit: "K2", maxTriangles: 120000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048 },
    { role: "prop", assetKey: "basketball", maxTriangles: 6000, textureSet: "BC+N", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "shot-arc", kind: "trail" },
    { event: "swish", kind: "ring", flipbook: "k9-confetti" },
    { event: "on-fire", kind: "flipbook", flipbook: "k9-flame" },
    { event: "net-ripple", kind: "vertex-anim" }
  ],
  audio: [
    { event: "bounce", cue: "ball-bounce-court", variants: 4 },
    { event: "rim", cue: "rim-hit", variants: 3 },
    { event: "swish", cue: "net-swish", variants: 2 },
    { event: "crowd", cue: "crowd-swell", variants: 2 },
    { event: "bed", cue: "city-dusk-bed", variants: 1 }
  ],
  signatureEffect: "Skinned athletes under dusk sky against a live skyline; tapered arc ribbon and net ripple sell every release.",
  standIns: [
    { feature: "shoulder rig (PRD 08 rigs.shoulder)", file: "src/v2/scene/camera.ts", request: "R-14-10", removeWhen: "C-22 shoulder rig real" },
    { feature: "open dusk skyline (K2 buildings)", file: "src/v2/scene/world.ts", request: "R-14-07", removeWhen: "K2 window-atlas buildings admitted" },
    { feature: "vertex-animated cloth net", file: "src/v2/scene/world.ts", request: "R-14-14", removeWhen: "PRD 04 vertex anim / K9 net real" },
    { feature: "crossFadeTo shot clips", file: "src/v2/animation.ts", request: "R-14-14", removeWhen: "C-19 clip controller real" }
  ],
  criticalCategories: ["character_presentation", "animation_quality", "environment_world"],
  tiers: {
    low: { particles: 200, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 400, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 600, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 900, shadowMap: 4096, cascades: 3, textureMax: 4096 }
  }
});
