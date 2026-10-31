// examples/roadster-hours-port/art/direction.ts — GU47 WP-32 (RH47-18) art direction for Saltwind Highway.
// Fantasy: a wind-scoured maritime road trip, three hours of one day on an Atlantic coast highway.
import { defineArtDirection } from "@aura3d/game/art";

const vehicle = (assetKey: string, maxTriangles = 8000) =>
  ({ role: "vehicle" as const, assetKey, maxTriangles, minTriangles: 2000, textureSet: "BC+N+ORM" as const, maxTextureSize: 1024 as const });
const prop = (assetKey: string, maxTriangles = 8000) =>
  ({ role: "set-dressing" as const, assetKey, maxTriangles, textureSet: "BC+N+ORM" as const, maxTextureSize: 1024 as const });

export default defineArtDirection({
  id: "roadster-hours-port",
  genre: "racing",
  fantasy: "A wind-scoured maritime road trip: salt haze, limestone cliffs and a teal Atlantic, from 4 pm to blue hour.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/game-upgrades-47/roadster-hours-port/identity.md#references",
      source: "generic reference: Atlantic coast road photography in late-afternoon side light (limestone cliffs, surf lines, lighthouse)",
      licence: "reference-only",
      why: "Low side sun through salt haze: bleached limestone and ochre cliffs, a deep teal sea with white surf lines and a red-white lighthouse"
    },
    {
      file: "evidence/game-upgrades-47/roadster-hours-port/identity.md#references",
      source: "generic reference: desert canyon highway at last light with heat shimmer over the asphalt",
      licence: "reference-only",
      why: "A low 15-degree orange sun with a violet rim on the far side, heat shimmer beyond 40 m and blown sand crossing the road"
    },
    {
      file: "evidence/game-upgrades-47/roadster-hours-port/identity.md#references",
      source: "generic reference: elevated city expressway photographed at blue hour from above the skyline",
      licence: "reference-only",
      why: "Indigo zenith with a pale city-glow band, a mercury-white and sea-glass city carpet below and sparse red aircraft beacons"
    }
  ],
  palette: {
    primary: ["#e9e4d6", "#12606e", "#c9a25e"],
    accent: "#c8321f",
    reservedObjective: "#c8321f"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 4300, shadow: true },
    fill: "ibl+bounce",
    practicals: 3,
    environment: { hdri: "belfast_sunset_puresky", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.08, 0.2], fovDeg: [56, 74], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "roadster", maxTriangles: 60000, minTriangles: 20000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048 },
    vehicle("sedan"), vehicle("hatch"), vehicle("suv"), vehicle("pickup"), vehicle("bus"), vehicle("boxtruck"),
    vehicle("semi", 12000), vehicle("tanker", 12000),
    { role: "world", assetKey: "lighthouse", maxTriangles: 12000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    prop("townhouse"), prop("villa"), prop("pine"), prop("palm"), prop("boulders"),
    { role: "vehicle", assetKey: "sportsCar", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "baked-cc0-cars", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "crosswind", kind: "spray-sheet" },
    { event: "launch", kind: "burst" },
    { event: "land", kind: "ring" },
    { event: "landingFlare", kind: "light" },
    { event: "scrape", kind: "sparks" },
    { event: "nitro", kind: "trail" },
    { event: "checkpoint", kind: "flare" },
    { event: "impact", kind: "burst" },
    { event: "cell", kind: "pickup" },
    { event: "recover", kind: "burst" },
    { event: "finish", kind: "burst" },
    { event: "drift", kind: "decal" }
  ],
  audio: [
    { event: "engine", cue: "roadster-engine-loop", variants: 1 },
    { event: "land", cue: "suspension-thump", variants: 3 },
    { event: "checkpoint", cue: "relay-chime", variants: 1 },
    { event: "nitro", cue: "nitro-burst", variants: 3 },
    { event: "wind", cue: "coastal-wind-bed", variants: 1 }
  ],
  signatureEffect: "Crosswind salt spray: sheets of salt, sand or mist lift off the sea-side cliff base and blow across the highway with the route wind.",
  criticalCategories: ["atmospheric_effects", "lighting", "environment_world", "vfx"],
  tiers: {
    low: { particles: 800, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 1400, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    high: { particles: 2000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 3, textureMax: 2048 }
  }
});
