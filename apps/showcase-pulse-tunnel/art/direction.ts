// apps/showcase-pulse-tunnel/art/direction.ts — C-35 art direction (PRD-14 §6.9.9).
// Fantasy: rhythm flight inside a synthwave tunnel — neon ribbons, gradient sky,
// a small drone riding the beat.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-pulse-tunnel",
  genre: "rhythm-runner",
  fantasy: "Rhythm flight inside a synthwave tunnel — neon ribbons, gradient sky, a small drone riding the beat.",
  rebuildTier: "S-world",
  wave: 2,
  references: [
    {
      file: "references/synthwave-tunnel.json",
      source: "shipped comparable: synthwave tunnel runners (Audiosurf / Sayonara Wild Hearts)",
      licence: "reference-only",
      why: "Neon ribbon tunnel reads, gradient sky and beat-synced lighting the art targets"
    },
    {
      file: "references/beam-drone.json",
      source: "admitted pulseTunnelBeamDrone GLB (14.4k tris, 4.7M verts, 65 maps)",
      licence: "reference-only",
      why: "The rider drone — its map set and emissive masks define the hero material"
    },
    {
      file: "references/beam-karn.json",
      source: "admitted pulseTunnelBeamKarn GLB (28.5k tris, 34 joints, 2 clips)",
      licence: "reference-only",
      why: "Second admitted vessel — alternate hero/rider stand-in for gate sequences"
    }
  ],
  palette: {
    primary: ["#0a0714", "#190f33", "#2a1a4d", "#0e3b4d"],
    accent: "#ff4fd8",
    reservedObjective: "#3ff2ff"
  },
  lighting: {
    key: { type: "spot", colorTemperatureK: 6500, shadow: true },
    fill: "ibl",
    practicals: 6,
    environment: { hdri: "k1-synthwave-dome", background: "hdri" },
    exposureEV: 0.0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.15, 0.3], fovDeg: [55, 75], mobile: "landscape" },
  assets: [
    { role: "hero", assetKey: "beam-drone", maxTriangles: 15000, minTriangles: 4000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "hero", assetKey: "beam-karn", maxTriangles: 30000, minTriangles: 8000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "world", assetKey: "pulse-tunnel-segments", kit: "K4", maxTriangles: 80000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "gate-frames", kit: "K4", maxTriangles: 12000, textureSet: "BC+N+ORM+E", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "gradient-sky", maxTriangles: 2000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "perfect", kind: "burst", flipbook: "k9-flash" },
    { event: "graze", kind: "trail" },
    { event: "hit-wall", kind: "burst", flipbook: "k9-sparks" },
    { event: "speed-lines", kind: "post" }
  ],
  audio: [
    { event: "perfect", cue: "pulse-perfect", variants: 2 },
    { event: "graze", cue: "pulse-graze", variants: 2 },
    { event: "hit", cue: "pulse-hit", variants: 2 },
    { event: "music", cue: "pulse-track-stems", variants: 1 },
    { event: "bed", cue: "tunnel-wind-bed", variants: 1 }
  ],
  signatureEffect: "Beat-synced emissive ribbons on a synthwave dome; drone trails and camera FOV kick land the rhythm.",
  standIns: [
    { feature: "curve/ribbon geometry (PRD 01 curve)", file: "src/v2/scene/tunnel.ts", request: "R-14-14", removeWhen: "C-23 curve/ribbon real" },
    { feature: "drive-scale tunnel textures", file: "src/v2/scene/tunnel.ts", request: "R-14-07", removeWhen: "authored 1-2k mipped maps" },
    { feature: "section lighting sync", file: "src/v2/lighting.ts", request: "R-14-14", removeWhen: "PRD 09 event lighting real" },
    { feature: "K9 flipbook atlas", file: "src/v2/fx.ts", request: "R-14-07", removeWhen: "K9 flipbooks admitted" }
  ],
  criticalCategories: ["environment_world", "vfx", "atmospheric_effects"],
  tiers: {
    low: { particles: 200, shadowMap: 512, cascades: 1, textureMax: 1024 },
    medium: { particles: 400, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 600, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 900, shadowMap: 2048, cascades: 1, textureMax: 2048 }
  }
});
