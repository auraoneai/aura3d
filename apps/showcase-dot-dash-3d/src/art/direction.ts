// apps/showcase-dot-dash-3d/src/art/direction.ts — C-35 art direction (GU47 WP-23, "Night shift on the workbench").
// A tilt-shift macro view of a powered circuit board under one warm desk lamp late at night: glossy solder mask,
// black epoxy chip walls with silver pins, copper traces that light up behind the courier, edges dissolving into an
// out-of-focus walnut bench. Six boards are six PCB types (src/game/look.ts holds one row per board).
//
// Proven by tests/unit/dot-dash-3d/art-direction.test.ts, which audits the authored scene (buildScene) with
// auditArtDirection and writes art/direction.audit.json for the `art-direction` game-check.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "dot-dash-3d",
  genre: "maze-arcade",
  fantasy: "Night shift on the workbench: a courier drone races the copper traces of a powered circuit board under one warm desk lamp.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "references/references.json#macro-board",
      source: "genre comparable: macro product photography of populated circuit boards (glossy solder mask, raised copper, a millimetre-thin focal plane)",
      licence: "reference-only",
      why: "Glossy solder mask, copper traces and silver pads read at macro scale while everything off the focal plane melts into blur"
    },
    {
      file: "references/references.json#lamp-bench",
      source: "genre comparable: a night-time electronics workbench lit by one articulated desk lamp (warm cone, dark room, walnut top)",
      licence: "reference-only",
      why: "One warm cone of light pools on the board from the left, the bench falls away into warm dark wood and the room stays dark"
    },
    {
      file: "references/references.json#maze-chase",
      source: "shipped comparable: top-down maze-chase arcade boards (dot corridors, four pursuer personalities, a power-up reversal)",
      licence: "reference-only",
      why: "Corridor, collectible and pursuer read at a glance from a fixed high camera; each pursuer keeps its own colour and silhouette"
    }
  ],
  palette: {
    // Board 1 (Relay Grid): solder-mask green, copper, silver. The other five boards are other PCB types (look.ts).
    primary: ["#1f4a38", "#c8743a", "#c9ced6"],
    accent: "#5ff3ff",
    reservedObjective: "#ffb23e"
  },
  lighting: {
    // One shadowed PCSS spot (the desk lamp) from the upper left; the indoor-workshop HDRI plus a cool unshadowed
    // directional bounce fill; no ambient or hemisphere light.
    key: { type: "spot", colorTemperatureK: 3000, shadow: true },
    fill: "ibl+bounce",
    // The bounce directional, the courier's cyan point and four pooled event points (amber on live surge cells,
    // slate on the sentries during a surge): six non-key lights.
    practicals: 6,
    environment: { hdri: "indoor-workshop", background: "enclosed" },
    exposureEV: 0
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.025, 0.08], fovDeg: [45, 52], mobile: "both" },
  assets: [
    // Planned WP-36 generations (Meshy credits are exhausted until 2026-11-01): today's courier, sentries and
    // dressing stay procedural until these keys are admitted (lane report, "Asset needs").
    { role: "hero", assetKey: "dotDashCourierPod", maxTriangles: 12000, minTriangles: 2000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "enemy", assetKey: "dotDashSentryHunter", maxTriangles: 8000, minTriangles: 2000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "enemy", assetKey: "dotDashSentryAmbusher", maxTriangles: 8000, minTriangles: 2000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "enemy", assetKey: "dotDashSentryDrifter", maxTriangles: 8000, minTriangles: 2000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "enemy", assetKey: "dotDashSentrySkittish", maxTriangles: 8000, minTriangles: 2000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "world", assetKey: "dotDashBoardSet", maxTriangles: 4000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "prop", assetKey: "dotDashComponentKit", maxTriangles: 24000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "dotDashBenchProps", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "dotDashWalnutBench", maxTriangles: 200, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "shard-pickup", kind: "trace-light" },
    { event: "surge-cell", kind: "surge-ring" },
    { event: "surge-cell", kind: "trace-pulse" },
    { event: "sentry-disabled", kind: "short-circuit" },
    { event: "courier-intercepted", kind: "blown-fuse" },
    { event: "dash", kind: "solder-spark" },
    { event: "cache-gem", kind: "solder-spark" },
    { event: "board-ready", kind: "power-up-wave" },
    { event: "board-clear", kind: "trace-sweep" },
    { event: "lamp-cone", kind: "dust-motes" }
  ],
  audio: [
    { event: "shard-pickup", cue: "ui.score-tick", variants: 1 },
    { event: "surge-cell", cue: "pickup.power-up", variants: 1 },
    { event: "sentry-disabled", cue: "pickup.combo-up", variants: 1 },
    { event: "cache-gem", cue: "pickup.gem", variants: 1 },
    { event: "courier-intercepted", cue: "stinger.lose", variants: 1 },
    { event: "board-clear", cue: "stinger.win", variants: 1 },
    { event: "dash", cue: "whoosh.dash", variants: 1 },
    { event: "bench-room", cue: "ambience.space-hum", variants: 1 }
  ],
  signatureEffect: "Shallow macro depth of field on a lamp-lit circuit board whose copper traces light up along the courier's path.",
  criticalCategories: ["lighting", "material_quality", "postprocessing", "composition", "gameplay_readability"],
  tiers: {
    // Runtime VFX stay at or under 60 live particles; the lamp-cone motes add 60 on Medium and up.
    low: { particles: 60, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 120, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    high: { particles: 120, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    ultra: { particles: 180, shadowMap: 4096, cascades: 1, textureMax: 2048 }
  }
});
