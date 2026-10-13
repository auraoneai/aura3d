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
  // The rebuilt single-path scene (src/main.ts) renders from exactly two
  // admitted typed assets (apps/showcase-blockfall-reactor/aura.assets.json):
  // the crate GLB instanced per board cell / active piece / frame / flash,
  // and the modular wall panel as the cabinet-silhouette world piece. The
  // trashed scene's cabinet/room/mascot roles are gone. Neither asset is
  // staged in a shared kit yet, so no `kit` is claimed: S10's kit half
  // stays failing until a human look-dev review accepts a staged kit file
  // (verdicts are never authored here). Triangle budgets bound the measured
  // GLBs (crate 264 tris, wall 1,670 tris, both untextured).
  assets: [
    { role: "prop", assetKey: "quaterniusCubeCrate", maxTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "quaterniusWallModular", maxTriangles: 5000, textureSet: "BC+N", maxTextureSize: 1024 }
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
  standIns: [],
  criticalCategories: ["vfx", "camera", "polish_juice"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1800, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
