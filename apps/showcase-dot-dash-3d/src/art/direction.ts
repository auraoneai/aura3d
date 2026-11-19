// apps/showcase-dot-dash-3d/src/art/direction.ts — art direction (arcade-readability pass, owner review 2026-11-18).
// Classic maze-chase cabinet readability with original characters: a near-top-down camera on the whole maze, thin
// neon wall outlines on a near-black floor, a glowing gold courier orb-bot, four flat spinning star drones in solid
// red / magenta / cyan / orange with big white eyes, warm-white pellets and pulsing power cells (look.ts ARCADE).
//
// Proven by tests/unit/dot-dash-3d/art-direction.test.ts, which audits the authored scene (buildScene) with
// auditArtDirection and writes art/direction.audit.json for the `art-direction` game-check.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "dot-dash-3d",
  genre: "maze-arcade",
  fantasy: "A glowing courier orb-bot races a neon circuit maze, collecting data pellets while four spinning sentry drones hunt it.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "references/references.json#macro-board",
      source: "genre comparable: neon vector-outline arcade mazes (thin glowing wall lines on black, no fill)",
      licence: "reference-only",
      why: "Thin single-colour glowing outlines on black make every corridor readable at a glance and leave the actors the brightest things"
    },
    {
      file: "references/references.json#lamp-bench",
      source: "genre comparable: high-contrast arcade sprite colour coding (one saturated colour per pursuer, white eyes, a shared frightened colour)",
      licence: "reference-only",
      why: "Each pursuer is one flat saturated colour with big white eyes looking where it moves; frightened pursuers share one dark blue"
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
    primary: ["#05060c", "#2f6bff", "#fff1cf"],
    accent: "#ffd21a",
    reservedObjective: "#ffe6a8"
  },
  lighting: {
    // One overhead shadowed directional key and a low indoor-workshop IBL fill (never drawn); the actors, pellets and
    // neon walls are self-lit practical materials. No ambient or hemisphere light, no other lights.
    key: { type: "directional", colorTemperatureK: 6500, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { hdri: "indoor-workshop", background: "enclosed" },
    exposureEV: 0
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.04, 0.08], fovDeg: [30, 40], mobile: "both" },
  // Arcade-readability pass: nothing off the maze is drawn, so the Idol pylon GLBs (assets/idol/gcCapacitor,
  // gcHeatsink) are no longer mounted or typed for this route. Every drawn mesh is procedural (src/art/arcadeActors.ts).
  assets: [],
  vfx: [
    { event: "shard-pickup", kind: "trace-light" },
    { event: "surge-cell", kind: "surge-ring" },
    { event: "surge-cell", kind: "trace-pulse" },
    { event: "sentry-disabled", kind: "short-circuit" },
    { event: "courier-intercepted", kind: "blown-fuse" },
    { event: "dash", kind: "solder-spark" },
    { event: "cache-gem", kind: "solder-spark" },
    { event: "board-clear", kind: "neon-flash" }
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
  signatureEffect: "Neon maze outlines that blink white when a board is cleared, under a gold courier with a glowing trail.",
  criticalCategories: ["lighting", "material_quality", "postprocessing", "composition", "gameplay_readability"],
  tiers: {
    // Runtime VFX stay at or under 60 live particles.
    low: { particles: 60, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 120, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    high: { particles: 120, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    ultra: { particles: 180, shadowMap: 4096, cascades: 1, textureMax: 2048 }
  }
});
