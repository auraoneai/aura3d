// apps/showcase-aura-diamond-3d/art/direction.ts — C-35 art direction (GU47 WP-18 DIA-X1, PRD 3.2).
// Fantasy: summer baseball on broadcast TV, six ballparks each a postcard with its own hour, sky and light.
// The per-park numbers live in ./look.ts (one row per park); this file is the game-level contract the audit reads.
import { defineArtDirection } from "@aura3d/engine/game/art";
import { DIAMOND_PALETTE, PARK_LOOKS, SIGNATURE_EFFECT } from "./look";

const boot = PARK_LOOKS.sandlot;

export default defineArtDirection({
  id: "showcase-aura-diamond-3d",
  // GU47(E-J): GameGenre has no "baseball" yet; "golf-physics" is the nearest ball-flight sports genre (launch angle,
  // exit velocity, broadcast tracer). Handoff to E-J in docs/prds/game-upgrades-47/lanes/g08.md.
  genre: "golf-physics",
  fantasy: "Summer baseball on broadcast TV: six ballparks, each a postcard with its own hour, sky and light.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/broadcast-baseball.json",
      source: "generic reference: centre-field broadcast camera of a professional ballgame (any league, any season)",
      licence: "reference-only",
      why: "Mown turf stripes, terracotta infield clay, chalk lines and a warm broadcast film grade under one hard key"
    },
    {
      file: "references/ballpark-postcards.json",
      source: "generic reference: mid-century travel postcards of ballparks at golden hour, night and indoors",
      licence: "reference-only",
      why: "One hour and one sky per venue, a visible horizon behind the stands and a single accent colour per park"
    },
    {
      file: "references/bat-crack.json",
      source: "generic reference: slow-motion footage of a wooden bat meeting a pitched ball",
      licence: "reference-only",
      why: "The contact frame: ash splinters leaving the barrel and a short white flash read as the moment of the swing"
    }
  ],
  palette: {
    primary: [...DIAMOND_PALETTE.primary],
    accent: DIAMOND_PALETTE.accent,
    reservedObjective: DIAMOND_PALETTE.reservedObjective
  },
  lighting: {
    // One shadowed directional key per park (the sun, or the moon over Midtown); local lamps stay unshadowed.
    key: { type: "directional", colorTemperatureK: boot.sun.colorTemperatureK, shadow: true },
    fill: "ibl",
    // Midtown's six tower banks are the most practicals any park mounts (the rim counts as one on parks that have it).
    practicals: 6,
    // Boot park (Harbor Sandlot): belfast_sunset lights it, the analytic Preetham sky is the visible sky (DIA-E2).
    environment: { hdri: boot.hdri.id, background: boot.sky ? "sky" : "hdri" },
    exposureEV: boot.exposureEv
  },
  framing: { rig: "static", subjectHeightFraction: [0.18, 0.45], fovDeg: [40, 48], mobile: "both" },
  assets: [],
  vfx: [
    { event: "bat-contact", kind: "diamond-bat-crack", flipbook: "debris-chips" },
    { event: "ball-landing", kind: "diamond-clay-puff", flipbook: "smoke-a" },
    { event: "foul-line-landing", kind: "diamond-chalk-puff", flipbook: "smoke-b" },
    { event: "home-run", kind: "diamond-hr-firework", flipbook: "spark-streak" },
    { event: "canyon-landing", kind: "diamond-canyon-dust", flipbook: "smoke-b" },
    { event: "dome-home-run", kind: "diamond-dome-confetti", flipbook: "debris-chips" },
    { event: "lunar-landing", kind: "diamond-regolith-arc", flipbook: "dust-mote" },
    { event: "ball-flight", kind: "trail" }
  ],
  audio: [
    { event: "bat-contact", cue: "crack", variants: 1 },
    { event: "foul-tip", cue: "contact", variants: 1 },
    { event: "pitch", cue: "pitch", variants: 1 },
    { event: "mitt-catch", cue: "pop", variants: 1 },
    { event: "foul-ball", cue: "foul", variants: 1 },
    { event: "strikeout", cue: "strikeout", variants: 1 },
    { event: "home-run", cue: "homer", variants: 2 },
    { event: "crowd-bed", cue: "crowd", variants: 1 },
    { event: "swing", cue: "swing", variants: 1 },
    { event: "win", cue: "win", variants: 1 },
    { event: "walk", cue: "walk", variants: 1 }
  ],
  signatureEffect: SIGNATURE_EFFECT,
  criticalCategories: ["lighting", "environment_world", "atmospheric_effects", "vfx", "camera"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 1200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
