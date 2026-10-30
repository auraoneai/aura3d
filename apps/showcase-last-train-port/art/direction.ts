// apps/showcase-last-train-port/art/direction.ts: C-35 art direction for Lamplight Line (GU47 WP-31 "The last tram before dark").
// The look table is examples/last-train-port/bands.ts (bands A-E); the effect pack is examples/last-train-port/vfx.ts. The audit
// record (direction.audit.json beside this file) is written by tests/unit/last-train-port/art-direction.test.ts, which audits
// the authored band scenes the world builds (lights, environment, models and emissive materials read from the scene JSON).
import { defineArtDirection } from "@aura3d/game/art";
import { BANDS, HDRI_URL, LAMPLIGHT_PALETTE as P } from "../../../examples/last-train-port/bands";
import { PRACTICAL_COUNT } from "../../../examples/last-train-port/lights";
import { LAMPLIGHT_VFX_KINDS } from "../../../examples/last-train-port/vfx";

const world = (assetKey: string, maxTriangles = 40000) => ({ role: "world" as const, assetKey, maxTriangles, textureSet: "BC+N+ORM" as const, maxTextureSize: 1024 as const });
const rider = (assetKey: string) => ({ role: "character" as const, assetKey, maxTriangles: 30000, minTriangles: 2000, textureSet: "BC+N+ORM" as const, maxTextureSize: 1024 as const });

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
    { role: "vehicle", assetKey: "tram", maxTriangles: 80000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    rider("paxEasy"), rider("paxSightseer"), rider("paxRushed"), rider("paxSleeper"),
    world("houseCream"), world("houseOchre"), world("houseBlue"),
    world("clockTower"), world("lighthouse"),
    { role: "prop", assetKey: "crates", maxTriangles: 12000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "lamp", maxTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "windmill", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "tower", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 512 }
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
  standIns: [
    { feature: "primitive tree canopies, pines, bushes, rocks and cloud puffs (until the WP-36 tree, rock and cloud kits land)", file: "examples/last-train-port/world.ts", request: "R-14-21", removeWhen: "WP-36 Lamplight tree, rock and cloud-puff kits admitted (LT-10)" },
    { feature: "primitive island undersides (cones until the island-underside models land)", file: "examples/last-train-port/world.ts", request: "R-14-22", removeWhen: "WP-36 Lamplight island undersides admitted (LT-10)" },
    { feature: "sky lanterns drawn as one instanced emissive capsule (until the paper-lantern model lands)", file: "examples/last-train-port/lanterns.ts", request: "R-14-23", removeWhen: "WP-36 paper sky lantern admitted (LT-13)" }
  ],
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
