// apps/showcase-aura-fc-3d/art/direction.ts — C-35 art direction (GU47 WP-19 "Floodlight football in weather").
//
// Proven by tests/unit/aura-fc-3d/art-direction.test.ts, which audits the authored scene of every venue with
// auditArtDirection and writes art/direction.audit.json (the record the `art-direction` and `look-identity`
// game-checks read). Rerun that test after every edit of this file and commit both.
//
// Per-venue look rows: src/game/look.ts (VENUE_LOOKS). Runtime VFX pack: src/game/vfx.ts.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-aura-fc-3d",
  // GU47(E-J): GameGenre has no football entry; "basketball" is the only team ball-sport genre (pitch/court,
  // broadcast framing, one ball). Switch to "football" when the union gains it (handoff in the lane report).
  genre: "basketball",
  fantasy: "European broadcast night football: rain slants through steel floodlight banks onto wet turf, six venues in weather.",
  rebuildTier: "S-presentation",
  wave: 2,
  references: [
    {
      file: "references/night-match-in-rain.json",
      source: "generic reference: a televised European night match in heavy rain under four steel floodlight banks",
      licence: "reference-only (description, no image)",
      why: "Rain streaks are only visible where they cross a floodlight shaft, back-lit toward the camera against a dark sky"
    },
    {
      file: "references/wet-turf-specular.json",
      source: "generic reference: a mown pitch soaked by rain, photographed from the main-stand gantry",
      licence: "reference-only (description, no image)",
      why: "Wet turf throws long specular streaks from each flood bank while the mow stripes stay readable underneath"
    },
    {
      file: "references/tv-match-package.json",
      source: "generic reference: a broadcast football graphics package (score bug, venue ident, goal lower third, replay stinger)",
      licence: "reference-only (description, no image)",
      why: "One compact score bug top-left, a lower third on goals and a replay stinger, set in one licensed sans family"
    }
  ],
  palette: {
    // storm navy, wet emerald, cold flood white, steel slate (venue accents vary; lime is the game accent)
    primary: ["#14223a", "#1e5c40", "#e6eef6", "#34465c"],
    accent: "#d8ff3e",
    reservedObjective: "#fdfdf6"
  },
  lighting: {
    // Night venues: the main-stand flood is the one shadowed key (PCSS spot); day venues use a cascaded sun.
    key: { type: "spot", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    // look key (0.4 front fill) + cool rim + one unshadowed flood on the sunset venue; phase 2 relit the night venues
    // with the three other tower banks as unshadowed spots (look key + rim + 3 banks): at most 5 non-key lights
    practicals: 5,
    environment: { hdri: "night-2k", background: "sky" },
    exposureEV: 0.15
  },
  framing: { rig: "follow2d", subjectHeightFraction: [0.08, 0.3], fovDeg: [34, 54], mobile: "both" },
  // Triangle counts and texture sets measured from the shipped GLBs (lane report, "Asset facts"). Characters and the
  // ball state the target set (BC+N); today's athlete GLBs carry colour-only materials and the ball a single base
  // colour map: both are listed in standIns until WP-36 delivers textured kits.
  assets: [
    { role: "character", assetKey: "fcSoccerStrikerMeshy", maxTriangles: 30000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["Ready", "Walk_Loop", "Run", "Sprint_Loop"] } },
    { role: "character", assetKey: "fcGoalkeeperMeshy", maxTriangles: 30000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["Ready", "Run", "Sprint_Loop"] } },
    { role: "hero", assetKey: "fcMatchBallMeshy", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "fcSoccerGoalNetMeshy", maxTriangles: 10000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "world", assetKey: "fcFloodlightPylonMeshy", maxTriangles: 12000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "world", assetKey: "fcScoreboardGantryMeshy", maxTriangles: 12000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "world", assetKey: "fcGlacierDomeMeshy", maxTriangles: 14000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "fcHeroTrophyMeshy", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 1024 },
    // borrowed until WP-36 delivers the football kit (fcStandModule, fcDugout, fcBallCart): see the lane report
    { role: "backdrop", assetKey: "diamondStadium", maxTriangles: 16000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "diamondDugout", maxTriangles: 16000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "hoopsBallCart", maxTriangles: 14000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "kick", kind: "fc-turf-divot" },
    { event: "tackle", kind: "fc-turf-divot" },
    { event: "wet-touch", kind: "fc-wet-splash" },
    { event: "goal-net", kind: "fc-net-spark" },
    { event: "goal", kind: "fc-goal-pyro" },
    { event: "save", kind: "fc-net-spark" },
    { event: "storm", kind: "fc-lightning" },
    { event: "ball-flight", kind: "trail" },
    { event: "weather", kind: "rain" }
  ],
  audio: [
    { event: "kick", cue: "fc-kick", variants: 1 },
    { event: "goal-net", cue: "fc-net", variants: 1 },
    { event: "woodwork", cue: "fc-post", variants: 1 },
    { event: "whistle", cue: "referee-whistle", variants: 1 },
    { event: "crowd", cue: "stadium-crowd-bed", variants: 1 }
  ],
  signatureEffect: "Rain slanting through steel floodlight shafts onto wet turf that throws back specular streaks, under a storm-navy night sky.",
  standIns: [
    { feature: "box stands, capsule crowd, borrowed dugout / stadium / ball cart", file: "src/game/scene.ts", request: "R-14-07", removeWhen: "WP-36 football kit (stand module, rigged fans, dugout, ball cart) admitted" },
    { feature: "colour-only athlete kit materials and a base-colour-only match ball", file: "src/game/rig.ts", request: "R-14-07", removeWhen: "WP-36 textured kits (BC+N, number sheet) and a BC+N ball admitted" },
    { feature: "instanced light pools for the three unshadowed towers", file: "src/game/scene.ts", request: "R-14-13", removeWhen: "a per-tier multi-caster budget allows four shadowed floods" }
  ],
  criticalCategories: ["lighting", "atmospheric_effects", "vfx", "material_quality", "camera"],
  tiers: {
    low: { particles: 600, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 1600, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 3200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 4800, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
