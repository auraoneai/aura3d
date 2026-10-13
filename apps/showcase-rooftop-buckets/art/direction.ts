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
  // The ported single-path scene (src/main.ts) renders from exactly six
  // admitted typed assets (route aura.assets.json mirroring the root
  // admissions): the rooftop court set, backboard and rim props at the
  // salvaged court constants, the solver-synced ball, and the two athlete
  // figures (shooter re-spotted per shot spot; defender shown only in the
  // pressure heat, driven by the salvaged hoop telegraph). The trashed
  // scene's skyline/venue-v2 roles are gone. None of these assets is staged
  // in a shared kit yet, so no `kit` is claimed: S10's kit half stays
  // failing until a human look-dev review accepts a staged kit file
  // (verdicts are never authored here).
  assets: [
    { role: "character", assetKey: "rooftopLayupScorer", maxTriangles: 45000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["Ready", "Load", "Release", "FollowThrough"] } },
    { role: "character", assetKey: "rooftopDefender", maxTriangles: 45000, minTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["Plant", "Telegraph", "Jump", "Contest"] } },
    { role: "world", assetKey: "rooftopCourt", maxTriangles: 80000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "rooftopBackboard", maxTriangles: 15000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "rooftopRim", maxTriangles: 15000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "rooftopBall", maxTriangles: 6000, textureSet: "BC+N", maxTextureSize: 512 }
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
  // The ported scene claims only what it renders: a fixed broadcast rig
  // (real camera.rigs.static), the athletes' authored loop clips assigned
  // in the scene spec, and solver-synced ball/aim-guide nodes from the
  // typed ball GLB. No route-local substitute stands in for a missing
  // engine feature, so there are no stand-ins to track.
  standIns: [],
  criticalCategories: ["character_presentation", "animation_quality", "environment_world"],
  tiers: {
    low: { particles: 200, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 400, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 600, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 900, shadowMap: 4096, cascades: 3, textureMax: 4096 }
  }
});
