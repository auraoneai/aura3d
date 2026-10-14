// apps/showcase-blockfall-reactor/art/direction.ts — C-35 art direction (PRD-14 §6.9.16).
// Fantasy: falling-blocks cabinet in a living arcade — jewel tiles catch
// reflections, clears detonate.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-blockfall-reactor",
  genre: "falling-blocks",
  fantasy: "Falling-blocks cabinet in a living arcade: jewel tiles catch reflections, clears detonate.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/arcade-cabinet.json",
      source: "shipped comparable: arcade cabinet presentation (Tetris Effect: Connected stage framing / Arcade Paradise cabinet close-ups)",
      licence: "reference-only",
      why: "The cabinet-as-hero framing with marquee, bezel and floor reflections the room rebuild targets"
    },
    {
      file: "references/jewel-tiles.json",
      source: "shipped comparable: emissive jewel-block language (Tetris Effect particle tiles / Columns remaster glow)",
      licence: "reference-only",
      why: "Bevelled emissive tiles that catch HDRI reflections without clipping to white under bloom"
    },
    {
      file: "references/clear-detonation.json",
      source: "shipped comparable: line-clear detonation staging (Tetris Effect Zone clears / Lumines block sweeps)",
      licence: "reference-only",
      why: "Per-cell lock flash, hard-drop trail and GPU clear bursts replacing the single orange ring"
    }
  ],
  palette: {
    primary: ["#0d0514", "#241a3d", "#4a3f7a", "#0fbfae"],
    accent: "#ffd45c",
    reservedObjective: "#ff5c7a"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 4200, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k2-arcade-interior", background: "enclosed" },
    exposureEV: 0.1
  },
  framing: { rig: "static", subjectHeightFraction: [0.55, 0.75], fovDeg: [40, 50], mobile: "landscape" },
  assets: [
    { role: "hero", assetKey: "arcade-cabinet", maxTriangles: 45000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "arcade-room", kit: "K4", maxTriangles: 120000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "neighbouring-cabinets", kit: "K2", maxTriangles: 90000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "mascot-figures", kit: "K6", maxTriangles: 30000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "lock-flash", kind: "burst" },
    { event: "hard-drop", kind: "trail" },
    { event: "line-clear", kind: "burst", flipbook: "k9-shockwave" },
    { event: "quad-detonation", kind: "explosion", flipbook: "k9-explosion" },
    { event: "danger-pulse", kind: "ring" }
  ],
  audio: [
    { event: "tile-lock", cue: "block-lock-thud", variants: 3 },
    { event: "line-clear", cue: "clear-sweep", variants: 3 },
    { event: "quad-clear", cue: "quad-detonation", variants: 2 },
    { event: "level-up", cue: "level-fanfare", variants: 1 },
    { event: "reactor-hum", cue: "arcade-ambience-bed", variants: 1 }
  ],
  signatureEffect: "Instanced jewel tiles bevel-catching a warm arcade key while line clears detonate through GPU bursts and the cabinet breathes inside a living room.",
  standIns: [
    { feature: "k2-arcade-interior HDRI + room ambience", file: "src/v2/scene/lighting.ts", request: "R-14-13", removeWhen: "arcade interior HDRI admitted" },
    { feature: "K4 arcade room + K2 neighbouring cabinets", file: "src/v2/scene/world.ts", request: "R-14-07", removeWhen: "arcade kit GLBs admitted" },
    { feature: "K9 clear/shockwave flipbooks", file: "src/v2/scene/fx.ts", request: "R-14-07", removeWhen: "K9 flipbooks admitted" },
    { feature: "K8 sampled stem set", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "K8 stem library admitted" }
  ],
  criticalCategories: ["vfx", "camera", "polish_juice"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1800, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
