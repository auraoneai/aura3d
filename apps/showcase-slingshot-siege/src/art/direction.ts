// apps/showcase-slingshot-siege/src/art/direction.ts — GU47 WP-22 art direction (PRD §3.2 item 1, C-35).
// "Tilt-shift seaside siege diorama through one day": a painted wooden toy fort on a chalk sea-stack island, six
// chapters from a crisp morning to a lantern-lit starry night. The look table is src/game/look.ts, the VFX preset
// pack src/game/vfx.ts; tests/unit/slingshot-siege/art-direction.test.ts audits this file against every chapter's
// authored scene and writes direction.audit.json beside it.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-slingshot-siege",
  // GU47: no physics-destruction genre exists yet (handoff to E-J); golf-physics is the nearest aim-and-launch genre.
  genre: "golf-physics",
  fantasy: "A painted wooden toy siege on a chalk sea-stack island, seen through a tilt-shift lens from dawn to a lantern-lit night.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/tilt-shift-harbour.json",
      source: "photographic technique: tilt-shift miniature photographs of harbours and coastal villages shot from a cliff top",
      licence: "reference-only",
      why: "A narrow sharp band across the subject with a soft foreground and a soft sea horizon is what makes a real place read as a table-top model"
    },
    {
      file: "references/painted-wooden-toys.json",
      source: "craft reference: hand-painted wooden toy castles, peg figures and building blocks with rounded edges and visible brush strokes",
      licence: "reference-only",
      why: "Matte painted wood, chalky stone, clear glass, pale ice and glossy black stone are the five block families the fort must read as at a glance"
    },
    {
      file: "references/seaside-day-cycle.json",
      source: "observational reference: one coastal day from a crisp sunrise through noon haze and sea mist to a red storm sunset and a starry harbour night",
      licence: "reference-only",
      why: "Six distinct sun, sky and fog states over one chalk-cliff island give every chapter its own time of day while the palette stays one family"
    }
  ],
  palette: {
    // chalk cliff, sea teal, bleached sand, driftwood
    primary: ["#ece7da", "#2f8f9d", "#e9d6a8", "#a08466"],
    // pennant red (day chapters); lantern amber is the night accent and the reserved objective glow
    accent: "#e2483d",
    reservedObjective: "#ffb347"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5200, shadow: true },
    fill: "ibl",
    // ch4: two window points; ch5: two window points, the lighthouse spot and a harbour lantern (the stage caps it at 4)
    practicals: 4,
    // Image lighting from the chapter's catalogue HDRI; the visible background is the chapter's sky node and the sea.
    environment: { hdri: "spruit_sunrise", preset: "outdoor-day", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "follow2d", subjectHeightFraction: [0.18, 0.25], fovDeg: [50, 59], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "gullsiegeHeroGullMeshy", maxTriangles: 150000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "enemy", assetKey: "gullsiegeRaiderBossMeshy", maxTriangles: 150000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "gullsiegeCatapultMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "gullsiegeBridgeMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "gullsiegeCrateMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "gullsiegeBarrelMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "gullsiegePlanksMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "gullsiegeWatchtowerMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "gullsiegeGatehouseMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "gullsiegeWindmillMeshy", maxTriangles: 150000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "backdrop", assetKey: "propRockA", maxTriangles: 200000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "backdrop", assetKey: "propRockB", maxTriangles: 200000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "propPineTree", maxTriangles: 200000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "propConifer", maxTriangles: 60000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "launch", kind: "siege-launch-dust", flipbook: "dust-mote" },
    { event: "flight", kind: "trail" },
    { event: "wood-break", kind: "siege-break-wood", flipbook: "debris-chips" },
    { event: "stone-break", kind: "siege-break-stone", flipbook: "smoke-b" },
    { event: "glass-break", kind: "siege-break-glass", flipbook: "spark-streak" },
    { event: "ice-break", kind: "siege-break-ice", flipbook: "spark-streak" },
    { event: "obsidian-break", kind: "siege-break-obsidian", flipbook: "glow" },
    { event: "boar-hit", kind: "siege-boar-hit" },
    { event: "sea-splash", kind: "siege-sea-splash", flipbook: "splash" },
    { event: "fire-egg-blast", kind: "siege-ember-blast", flipbook: "fireball" },
    { event: "squid-yank", kind: "siege-yank-poof", flipbook: "smoke-a" },
    { event: "ability", kind: "siege-ability-pop", flipbook: "flare" },
    { event: "windmill-smash", kind: "siege-windmill-smash", flipbook: "debris-chips" },
    { event: "scorch", kind: "siege-scorch" }
  ],
  audio: [
    { event: "launch", cue: "launch", variants: 1 },
    { event: "wood-break", cue: "wood-crack", variants: 1 },
    { event: "stone-break", cue: "stone-thud", variants: 1 },
    { event: "glass-break", cue: "glass-shatter", variants: 1 },
    { event: "boar-hit", cue: "gull-squash", variants: 1 },
    { event: "boar-scare", cue: "gull-scare", variants: 1 },
    { event: "windmill-smash", cue: "windmill-snap", variants: 1 },
    { event: "level-clear", cue: "level-clear", variants: 1 },
    { event: "level-fail", cue: "level-fail", variants: 1 },
    { event: "ambience", cue: "wind", variants: 1 }
  ],
  // Unique among live games (PRD §6.1 G12). High tier and up; on Low the engine drops DOF and the painted toy palette,
  // the sky and the sea horizon carry the diorama (PRD §6.4 fallback cue).
  signatureEffect: "Tilt-shift miniature focus band that keeps the toy fort crisp over a real sea horizon, through six times of one seaside day.",
  criticalCategories: ["scale_depth_perception", "atmospheric_effects", "lighting", "material_quality", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 2, textureMax: 4096 }
  }
});
