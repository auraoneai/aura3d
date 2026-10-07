// apps/showcase-bank-shot/art/direction.ts — C-35 art direction (PRD-14 §6.9.1).
// Fantasy: late-night pool hall, one warm lamp over felt, the room falls into darkness.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-bank-shot",
  genre: "billiards",
  fantasy: "Late-night pool hall: one warm lamp over felt, the room falls into darkness.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    {
      file: "references/pool-hall-lamp.json",
      source: "K4 pool-hall reference set (photo board)",
      licence: "reference-only",
      why: "One warm lamp over felt; room luminance below 5% of table luminance beyond 3 m"
    },
    {
      file: "references/8-ball-pool-webgl.json",
      source: "8 Ball Pool (Miniclip, WebGL)",
      licence: "reference-only",
      why: "Shipped WebGL billiards target: legible felt/pocket read at play camera"
    },
    {
      file: "references/pool-nation-webgl.json",
      source: "Pool Nation FX-style cue sports framing (WebGL comparables board)",
      licence: "reference-only",
      why: "Aim-orbit camera framing on cue-ball; 3/4 overhead roll camera"
    }
  ],
  palette: {
    primary: ["#1f3a24", "#0e1a12", "#5c3a21", "#caa25a"],
    accent: "#e8b45a",
    reservedObjective: "#f0f0e8"
  },
  lighting: {
    key: { type: "spot", colorTemperatureK: 3000, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k1-pool-hall", background: "enclosed" },
    exposureEV: 0
  },
  framing: { rig: "orbit", subjectHeightFraction: [0.2, 0.4], fovDeg: [35, 50], mobile: "landscape" },
  assets: [
    { role: "hero", assetKey: "bank-table", kit: "K4", maxTriangles: 40000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "ball-atlas", kit: "K4", maxTriangles: 32000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "cue", kit: "K4", maxTriangles: 8000, minTriangles: 3000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "pool-hall-set", kit: "K4", maxTriangles: 120000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "bar-props", kit: "K4", maxTriangles: 40000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "cue-strike", kind: "burst", flipbook: "k9-dust" },
    { event: "break", kind: "burst", flipbook: "k9-dust" }
  ],
  audio: [
    { event: "ball-impact", cue: "billiard-clack", variants: 3 },
    { event: "cushion", cue: "cushion", variants: 2 },
    { event: "pocket", cue: "pocket", variants: 2 },
    { event: "cue-strike", cue: "cue-strike", variants: 1 },
    { event: "bed", cue: "room-tone", variants: 1 }
  ],
  signatureEffect: "One pendant spot as the only shadow caster; room luminance falls below 5% of table luminance beyond 3 m.",
  standIns: [
    { feature: "aim-orbit + overhead roll camera rig", file: "src/v2/scene/camera.ts", request: "R-14-10", removeWhen: "C-22 rigs.orbit/static real" },
    { feature: "sheen felt + clearcoat balls/rails", file: "src/v2/scene/materials.ts", request: "R-14-14", removeWhen: "PRD 04 sheen/clearcoat real (§8.6)" },
    { feature: "spot-cone haze (High/Ultra)", file: "src/v2/scene/fx.ts", request: "R-14-14", removeWhen: "C-21 volumetric spot real" },
    { feature: "sampled billiards cues", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "C-25 game-sfx real" }
  ],
  criticalCategories: ["material_quality", "lighting", "shadows"],
  tiers: {
    low: { particles: 50, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 150, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 300, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 500, shadowMap: 2048, cascades: 1, textureMax: 4096 }
  }
});
