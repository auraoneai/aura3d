// apps/showcase-teleoperator/src/art/direction.ts — C-35 art direction for Grid Dispatch (GU47 WP-14, PRD §3.2 item 1).
// "Marine-layer dispatch feed": a remote operator's sensor feed over a cool bay-city avenue at dusk.
// Not imported by the route (no bundle cost); tests/unit/teleoperator/art-direction.test.ts audits it against the
// mounted scene and writes art/direction.audit.json for the `art-direction` game-check.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "showcase-teleoperator",
  genre: "racing",
  fantasy: "A remote operator's sensor feed over a bay-city avenue at dusk, where a marine fog bank swallows the tower tops.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/marine-layer-dusk.json",
      source: "generic reference: coastal city at dusk under a low marine fog layer (photography genre, no specific work)",
      licence: "reference-only",
      why: "A grey fog deck at 30-40 m swallows tower tops while the street below stays clear and lit, sun glow under the deck"
    },
    {
      file: "references/sodium-avenue.json",
      source: "generic reference: wet sodium-lit avenue with cable-car rails at night (street photography genre)",
      licence: "reference-only",
      why: "Warm sodium lamp pools and lit bay windows against cool slate-teal fog; red and brass cable cars as the street accent"
    },
    {
      file: "references/sensor-feed-overlay.json",
      source: "generic reference: autonomous-vehicle LiDAR visualisation and remote-operation console feeds",
      licence: "reference-only",
      why: "A teal depth-ring scan sweeping out from the vehicle and a console bezel; teal is reserved for the sensor and objective"
    }
  ],
  palette: {
    primary: ["#5f7f8c", "#2b3a55", "#ffb15a", "#b3262b"],
    accent: "#b59449",
    reservedObjective: "#3fd6c6"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2600, shadow: true },
    fill: "ibl",
    // Non-key lights, cap 6 (defineArtDirection): hemisphere + 2 headlight spots + up to 3 sodium points (night).
    practicals: 6,
    environment: { hdri: "belfast_sunset_puresky", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [56, 62], mobile: "both" },
  // Idol wow pass (tools/idol/specs/teleoperator.json): wheel-less player fleet / rival / traffic bodies (gd*W, wheels spin in
  // sf-wheels), wheeled parked cars (gd*T), commuter, street tree, two landmarks.
  assets: [
    { role: "vehicle", assetKey: "gdCruiserPodW3", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdCrossoverAvW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdHeavySemiW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdGtCrimsonW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdInterceptorCobaltW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdShuttleW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdGtChampagneW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdResponseSuvW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdCableCarW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdGtAmberW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdSedanSlateW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdSedanPearlW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdSedanPearlT", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdCoupeNavyW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdTaxiCabW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdHatchCoralW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdHatchMintW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdTransitBusW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdPickupGraphiteW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdPickupBronzeW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdBoxTruckW", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "gdParkedHatchWhiteT", maxTriangles: 60000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    ...(["gdWalkerA", "gdWalkerB", "gdWalkerC", "gdWalkerD"] as const).map((assetKey) => (
      { role: "character" as const, assetKey, maxTriangles: 40000, minTriangles: 8000, textureSet: "BC+N+ORM" as const, maxTextureSize: 1024 as const, animated: { clips: ["idle", "walk"] } }
    )),
    { role: "character", assetKey: "gdCommuter", maxTriangles: 40000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024, animated: { clips: ["idle", "walk"] } },
    { role: "set-dressing", assetKey: "gdStreetTree", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "gdFerryTerminal", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "gdPyramidTower", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "collision", kind: "grid-impact" },
    { event: "pickup", kind: "grid-objective-ring" },
    { event: "dropoff", kind: "grid-objective-ring" },
    { event: "night-wet-tyres", kind: "grid-tyre-splash" },
    { event: "manhole-steam", kind: "grid-manhole-steam" },
    { event: "driving", kind: "trail" },
    { event: "sensor-sweep", kind: "lidar-scan-pulse" }
  ],
  audio: [
    { event: "collision", cue: "collision", variants: 1 },
    { event: "pickup", cue: "pickup", variants: 1 },
    { event: "dropoff", cue: "dropoff", variants: 1 },
    { event: "fare-paid", cue: "earn", variants: 1 },
    { event: "missed-kerb", cue: "miss", variants: 1 },
    { event: "penalty", cue: "warn", variants: 1 },
    { event: "near-miss", cue: "nearMiss", variants: 1 }
  ],
  signatureEffect: "Marine-layer fog deck that swallows the bay-city tower tops above a clear street, swept by a teal LiDAR scan pulse from the robotaxi's sensor feed.",
  criticalCategories: ["atmospheric_effects", "lighting", "postprocessing", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 1200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 3, textureMax: 4096 }
  }
});
