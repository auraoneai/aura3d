// examples/aura-slam/art/direction.ts — C-35 art direction for Aura Slam 3D (GU47 WP-11 TT-H3, PRD §3.2 item 1).
// Fantasy: a long-lens TV tennis broadcast on a world tour; each venue its own hour and climate (view/look.ts).
//
// Genre: `GameGenre` has no racket or court-sports entry; "basketball" is the nearest broadcast court-ball genre and only
// selects the rubric fallback (handoff to E-J in docs/prds/game-upgrades-47/lanes/g01.md: add a "tennis" genre).
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "showcase-top-tennis",
  genre: "basketball",
  fantasy: "A long-lens TV tennis broadcast on a world tour: six venues, each with its own hour, climate and crowd.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    {
      file: "references/broadcast-long-lens.json",
      source: "shipped comparable: televised tennis main-camera coverage (high end-on long lens over the baseline)",
      licence: "reference-only",
      why: "Compressed long-lens perspective with both athletes, the full court and the far stand in one steady frame"
    },
    {
      file: "references/venue-hours.json",
      source: "shipped comparable: tour-circuit venue identity in sports games (floodlit hard court, grass in late-morning sun, clay at golden hour)",
      licence: "reference-only",
      why: "Each venue reads by its hour, sun angle and surface colour before any logo: navy night, striped turf, raking terracotta light"
    },
    {
      file: "references/surface-marks.json",
      source: "shipped comparable: persistent ball marks and bounce dust on clay and hard courts in tennis broadcasts",
      licence: "reference-only",
      why: "Surface-coloured marks that stay where the ball landed and small bounce puffs that match the surface pigment"
    },
    {
      file: "references/crowd-follow.json",
      source: "shipped comparable: stadium crowds turning their heads with the rally in televised tennis",
      licence: "reference-only",
      why: "Seated spectators whose heads track the ball left and right with a small per-seat lag, then stand on the point"
    }
  ],
  palette: {
    // navy acrylic, racing green, terracotta, teal; electric-yellow ball/trim accent; the out-call red is reserved.
    primary: ["#14284a", "#1f4d36", "#c4653f", "#2f8f8a"],
    accent: "#d8ff3e",
    reservedObjective: "#ff3b30"
  },
  lighting: {
    // Five venues are lit by one shadowed sun (view/look.ts VENUE_LOOKS[].sun); the hard court's key is the far floodlight pair.
    key: { type: "directional", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    practicals: 4,
    // Boot venue (hard court, New York night). The other five HDRIs are listed in evidence/game-upgrades-47/top-tennis/identity.md.
    environment: { hdri: "rooftop_night", background: "hdri" },
    exposureEV: 0
  },
  framing: { rig: "static", subjectHeightFraction: [0.06, 0.16], fovDeg: [15, 60], mobile: "both" },
  assets: [
    { role: "set-dressing", assetKey: "showcaseStadiumSeats", kit: "K4", maxTriangles: 60000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "rooftopScoreboardRigMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "rooftopFloodlightTowerMeshy", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 2048 }
  ],
  vfx: [
    { event: "ball-bounce-clay", kind: "clay-puff" },
    { event: "ball-bounce-grass", kind: "grass-flick" },
    { event: "ball-bounce-hard", kind: "hard-skid" },
    { event: "ball-bounce-moon", kind: "regolith-drift" },
    { event: "ball-mark", kind: "decal" },
    { event: "out-call", kind: "out-ring" },
    { event: "ball-flight", kind: "trail" },
    { event: "ace", kind: "ace-flash" }
  ],
  audio: [
    { event: "racket-hit", cue: "racket", variants: 1 },
    { event: "ball-bounce", cue: "bounce", variants: 1 }
  ],
  signatureEffect: "Surface-coloured ball marks that persist where the ball landed, venue-tinted bounce puffs, and a seated crowd whose heads follow the rally.",
  criticalCategories: ["lighting", "camera", "environment_world", "atmospheric_effects", "gameplay_readability"],
  tiers: {
    low: { particles: 120, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 240, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 400, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 600, shadowMap: 2048, cascades: 1, textureMax: 2048 }
  }
});
