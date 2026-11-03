// apps/showcase-roadster-rush/src/art/direction.ts: C-35 art direction for Apex Overdrive (GU47 WP-12 "Blue-hour skyway").
// The look table is src/art/look.ts; the audit record (direction.audit.json beside this file) is written by
// tests/unit/roadster-rush-native/art-direction.test.ts, which audits a mirror of the mounted scene built from that table.
import { defineArtDirection } from "@aura3d/game/art";
import { APEX_IBL_HDRI, APEX_PALETTE, APEX_PRACTICAL_COUNT } from "./look";

export default defineArtDirection({
  id: "showcase-roadster-rush",
  genre: "racing",
  fantasy: "Thread backlit sunset traffic on an elevated skyway above a hazed city, then take the sky lane between glass towers.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/backlit-sunset-traffic.json",
      source: "shipped comparable: low-sun arcade racing (OutRun 2 coastal sunset stages / Burnout Paradise golden-hour freeways)",
      licence: "reference-only",
      why: "A low sun dead ahead backlights every car: rim-lit silhouettes, long shadows toward camera and a hot corona over the road"
    },
    {
      file: "references/elevated-skyway.json",
      source: "shipped comparable: elevated city highways above a haze layer (Ridge Racer Type 4 city flyovers / Need for Speed Heat bridges)",
      licence: "reference-only",
      why: "The deck reads as high above the city because the ground dissolves into lit haze with window specks far below the barriers"
    },
    {
      file: "references/blue-hour-tail-lights.json",
      source: "photographic genre: blue-hour long exposures of urban expressways (cobalt zenith, tangerine horizon, red tail-light rivers)",
      licence: "reference-only",
      why: "Cobalt-to-violet zenith over a thin tangerine band, sodium lamps and red tail-light rivers with no magenta at night"
    }
  ],
  palette: {
    primary: [APEX_PALETTE.charcoal, APEX_PALETTE.tangerine, APEX_PALETTE.cobalt],
    accent: APEX_PALETTE.cyan,
    reservedObjective: APEX_PALETTE.rival
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2400, shadow: true },
    fill: "ibl",
    practicals: APEX_PRACTICAL_COUNT,
    environment: { hdri: APEX_IBL_HDRI, preset: "golden-hour", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.1, 0.24], fovDeg: [56, 66], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "hero", maxTriangles: 60000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "enemy", assetKey: "roadsterRushSkyCar", maxTriangles: 60000, minTriangles: 4000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "skycar-far", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 512 },
    { role: "vehicle", assetKey: "sedan", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "hatch", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "suv", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "taxi", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "van", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "pickup", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "boxtruck", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "bus", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "vehicle", assetKey: "carrier", maxTriangles: 60000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "traffic-far-lod", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "apex-glass-towers", maxTriangles: 2000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "crash", kind: "apex-crash" },
    { event: "bolt-pickup", kind: "apex-bolt" },
    { event: "landing", kind: "apex-land" },
    { event: "rocket-send", kind: "apex-rocket" },
    { event: "sky-dodge", kind: "apex-skykill" },
    { event: "player-wake", kind: "trail" },
    { event: "rival-wake", kind: "trail" },
    { event: "speed", kind: "speed-lines" }
  ],
  audio: [
    { event: "engine", cue: "apex-engine-loop", variants: 1 },
    { event: "crash", cue: "apex-crash", variants: 1 },
    { event: "bolt-pickup", cue: "apex-bolt", variants: 1 },
    { event: "near-miss", cue: "apex-whoosh", variants: 1 },
    { event: "rocket-send", cue: "apex-rocket-music", variants: 1 }
  ],
  signatureEffect: "Backlit skyway traffic above a haze floor: a low tangerine sun dead ahead rims every car while the city glows 25 m below the deck.",
  standIns: [
    { feature: "glass tower kit (procedural curtain-wall towers until the Meshy kit lands)", file: "src/render/towers.ts", request: "R-14-07", removeWhen: "WP-36 apex glass tower kit admitted" },
    { feature: "deck pylons (instanced primitive pylons until the Meshy pylon lands)", file: "src/render/pylons.ts", request: "R-14-07", removeWhen: "WP-36 apex deck pylon admitted" }
  ],
  criticalCategories: ["lighting", "atmospheric_effects", "environment_world", "gameplay_readability"],
  tiers: {
    low: { particles: 48, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 72, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 96, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 128, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
