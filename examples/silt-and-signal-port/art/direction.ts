// examples/silt-and-signal-port/art/direction.ts — GU47 WP-34 (G24) art direction (PRD §3.2 item 1).
// Duneglide: a hand-inked gouache travel poster; seven chapters are seven hours of one long day.
import { defineArtDirection } from "@aura3d/engine/game/art";
import { SILT_PALETTE } from "./look";

export default defineArtDirection({
  id: "showcase-silt-and-signal-port",
  genre: "flight",
  fantasy: "Courier on a hoverboard crossing a hand-inked desert canal at seven hours of one long day, sand always moving.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/gouache-travel-poster.md",
      source: "genre comparable: mid-century gouache railway and travel posters (flat sunlit planes, indigo shadow shapes)",
      licence: "reference-only",
      why: "Sun-bleached sandstone and terracotta planes over indigo shadows with one saturated accent: the chapter palette and grade targets"
    },
    {
      file: "references/inked-desert-journey.md",
      source: "shipped comparable: inked desert-journey games (Sable's line-art dunes, Journey's moving sand and low sun)",
      licence: "reference-only",
      why: "Umber ink lines that thin out with distance, a sand wake behind the rider and a low sun with long shadows across dunes"
    },
    {
      file: "references/day-cycle-colour-script.md",
      source: "film comparable: one-day colour scripts (animated feature colour keys from dusk through night to dawn)",
      licence: "reference-only",
      why: "Seven chapters as seven hours: the key direction and colour change every chapter while the palette and ink stay one family"
    }
  ],
  palette: {
    primary: [SILT_PALETTE.sandstone, SILT_PALETTE.terracotta, SILT_PALETTE.bone, SILT_PALETTE.indigo],
    accent: SILT_PALETTE.jade,
    reservedObjective: SILT_PALETTE.jade
  },
  lighting: {
    // boot chapter 0 is amber dusk (about 3,200 K); the key's colour and direction follow art/look.ts per chapter
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    // the jade-white rim plus up to five amber practicals in the night chapters
    practicals: 6,
    environment: { hdri: "belfast_sunset_puresky", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.07, 0.2], fovDeg: [62, 86], mobile: "both" },
  assets: [],
  vfx: [
    { event: "board-low-fast", kind: "silt-sand-wake" },
    { event: "board-over-canal", kind: "silt-canal-spray" },
    { event: "ring-pass", kind: "silt-signal" },
    { event: "impact", kind: "silt-impact" },
    { event: "boost", kind: "trail" },
    { event: "ambient-sand", kind: "silt-motes-sand" },
    { event: "ambient-fireflies", kind: "silt-motes-fireflies" },
    { event: "ambient-wick-glow", kind: "silt-motes-wick-glow" },
    { event: "ambient-pollen", kind: "silt-motes-pollen" },
    { event: "ambient-embers", kind: "silt-motes-embers" }
  ],
  audio: [
    { event: "ring-pass", cue: "signal-chime", variants: 1 },
    { event: "impact", cue: "board-thud", variants: 1 },
    { event: "objective", cue: "objective-bell", variants: 1 },
    { event: "chapter", cue: "chapter-theme", variants: 7 }
  ],
  signatureEffect: "Sand wake thrown up under the hoverboard at speed and low altitude, inside a hand-inked frame whose umber ink fades to nothing by 600 m.",
  standIns: [],
  criticalCategories: ["lighting", "postprocessing", "vfx", "atmospheric_effects"],
  tiers: {
    low: { particles: 300, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    medium: { particles: 450, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 600, shadowMap: 4096, cascades: 3, textureMax: 2048 },
    ultra: { particles: 600, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
