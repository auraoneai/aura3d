// apps/showcase-last-train-port/art/direction.ts: C-35 art direction for Lamplight Line (GU47 WP-31 "The last tram before dark").
// The look table is examples/last-train-port/bands.ts (bands A-E); the effect pack is examples/last-train-port/vfx.ts. The audit
// record (direction.audit.json beside this file) is written by tests/unit/last-train-port/art-direction.test.ts, which audits
// the authored band scenes the world builds (lights, environment, models and emissive materials read from the scene JSON).
import { defineArtDirection } from "@aura3d/engine/game/art";
import { BANDS, HDRI_URL, LAMPLIGHT_PALETTE as P } from "../../../examples/last-train-port/bands";
import { PRACTICAL_COUNT } from "../../../examples/last-train-port/lights";
import { LAMPLIGHT_VFX_KINDS } from "../../../examples/last-train-port/vfx";

export default defineArtDirection({
  id: "showcase-last-train-port",
  genre: "racing",
  fantasy: "Drive the last tram of the day between pastel hill towns on a cloud sea while the sun sets and the lamps come on.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/tilt-shift-hill-towns.json",
      source: "photographic genre: tilt-shift miniature photography of Mediterranean hill towns at late afternoon",
      licence: "reference-only",
      why: "A shallow focus band and saturated warm light turn cream stucco and terracotta roofs into a toy-like miniature"
    },
    {
      file: "references/blue-hour-tram-stops.json",
      source: "photographic genre: heritage trams at blue hour (Lisbon line 28 and San Francisco cable cars in evening light)",
      licence: "reference-only",
      why: "A cobalt sky over warm sodium and tungsten practicals: the platforms and the tram's bulbs out-shine the sky after sunset"
    },
    {
      file: "references/sky-lantern-festival.json",
      source: "photographic genre: sky-lantern festivals (Yi Peng / Pingxi), paper lanterns rising into a dusk sky",
      licence: "reference-only",
      why: "Dozens of warm paper lanterns hang in a cooling sky: the signature reads from their amber points against blue"
    },
    {
      file: "references/cozy-rail-games.json",
      source: "shipped comparable: cosy rail and town games (Mini Motorways palettes, Townscaper pastel islands, A Short Hike evening)",
      licence: "reference-only",
      why: "Pastel islands floating on soft cloud, a single warm accent, readable silhouettes at a small screen size"
    }
  ],
  palette: {
    primary: [P.apricot, P.rose, P.cream, P.terracotta],
    accent: P.lamplight,
    reservedObjective: P.cherry
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3600, shadow: true },
    fill: "ibl+bounce",
    practicals: PRACTICAL_COUNT,
    environment: { hdri: HDRI_URL(BANDS.A.hdri), preset: "late-afternoon to blue hour", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [52, 64], mobile: "both" },
  assets: [
    // GU47 phase 9 (D2): CC0 Kenney Pirate Kit distant keep/tower landmarks; streetcar, riders, houses, clock towers,
    // lighthouses, crates, swan-neck lamps, coastal flora, and stratified basalt undercrofts are procedural multi-material (WP-25)
    { role: "backdrop", assetKey: "lamplightKeep", maxTriangles: 40000, textureSet: "BC", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "lamplightTower", maxTriangles: 40000, textureSet: "BC", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "clean-arrival", kind: "sky-lanterns" },
    { event: "catch", kind: "lamplight-gutter" },
    { event: "curve-at-speed", kind: "lamplight-pantograph" },
    { event: "fare-paid", kind: "lamplight-fare" },
    { event: "monsoon-arrival", kind: "lamplight-splash" },
    { event: "departure", kind: "lamplight-dust" },
    { event: "rain", kind: "rain" },
    { event: "snow", kind: "snow" }
  ],
  audio: [
    { event: "motor", cue: "tram-motor", variants: 1 },
    { event: "bell", cue: "tram-bell", variants: 1 },
    { event: "fare-paid", cue: "fare", variants: 1 },
    { event: "catch", cue: "catch", variants: 1 }
  ],
  signatureEffect: "Earned sky lanterns: every clean arrival releases paper lanterns that stay aloft, so the dusk sky fills with the lights the driver earned.",
  standIns: [],
  criticalCategories: ["lighting", "atmospheric_effects", "environment_world", "vfx"],
  tiers: {
    low: { particles: 48, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 72, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 96, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 128, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});

/** Every runtime effect kind the pack registers (re-exported for the QA hook and the test). */
export const LAMPLIGHT_EFFECT_KINDS = LAMPLIGHT_VFX_KINDS;
