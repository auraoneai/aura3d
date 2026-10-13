// apps/showcase-courier-rush/art/direction.ts — C-35 art direction (PRD-14 §6.9.7).
// Fantasy: night-shift delivery run through a wet neon city.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-courier-rush",
  genre: "vehicle-delivery",
  fantasy: "Night-shift delivery run through a wet neon city.",
  rebuildTier: "S-world",
  wave: 2,
  references: [
    {
      file: "references/dawn-rain-city.json",
      source: "shipped comparable: wet-dawn open-world city boards (Watch Dogs / Drive Club rain)",
      licence: "reference-only",
      why: "Wet asphalt road reads, cool dawn palette and rain sheen the K2 city needs to hit"
    },
    {
      file: "references/k2-city-kit.json",
      source: "K2 modular city kit: roads, intersections, buildings, props (§14.3)",
      licence: "reference-only",
      why: "Real streets must come from the modular kit — defines block scale and draw budget"
    },
    {
      file: "references/delivery-van.json",
      source: "commercial van body under warm amber interior (shipped comparables)",
      licence: "reference-only",
      why: "Van silhouette, 4-wheel layout and interior-glow treatment the hero vehicle targets"
    }
  ],
  palette: {
    primary: ["#10141c", "#232e3d", "#3d4a5c", "#7f95ab"],
    accent: "#ffb84d",
    reservedObjective: "#49e6c8"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 4300, shadow: true },
    fill: "ibl",
    practicals: 4,
    // The single-path scene applies the engine `night-city` look preset
    // (no HDRI; cool moon key over the kit's lit windows). The former
    // "k1-dawn-overcast" HDRI claim was a mislabelled sunset file.
    environment: { hdri: "night-city", background: "enclosed" },
    exposureEV: 0.1
  },
  framing: { rig: "chase", subjectHeightFraction: [0.25, 0.4], fovDeg: [45, 58], mobile: "portrait" },
  // The rebuilt single-path scene (src/main.ts) renders from exactly the
  // six admitted typed model assets below (all present by id in the
  // repo-root aura.assets.json; see src/aura-assets.ts): the hero van, the
  // carried parcel, two metre-scale traffic bodies, and the dock bollard
  // and awning props. The city itself is the engine city-block kit, not a
  // typed asset, so no world role is claimed. No asset is staged in a
  // shared kit, so no `kit` is claimed: S10's kit half stays failing until
  // a human look-dev review accepts a staged kit file (verdicts are never
  // authored here).
  assets: [
    { role: "vehicle", assetKey: "courierVanMeshyV2Decimated", minTriangles: 2000, maxTriangles: 600000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "courierParcel", maxTriangles: 100000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "deliveryCar", minTriangles: 2000, maxTriangles: 50000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "showcaseCityVehicle", minTriangles: 2000, maxTriangles: 200000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "courierZoneBollard", maxTriangles: 200000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "courierZoneAwning", maxTriangles: 300000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "rain", kind: "particles" },
    { event: "splash", kind: "burst", flipbook: "k9-splash" },
    { event: "skid", kind: "burst", flipbook: "k9-dust" },
    { event: "headlight", kind: "projector-decal" },
    { event: "pickup", kind: "ring", flipbook: "k9-ring" }
  ],
  // Direction events src/main.ts cues from real gameplay (engine/bed
  // loops at start; pickup from the dispatch sensor; horn from traffic
  // proximity; skid from handbrake scrubs at speed), on the route's typed
  // WAV assets plus the game-sfx tyre-skid. Cue names stay aligned with
  // the K8 kit sample map (tests/qr/prd14/unit/kits.test.ts).
  audio: [
    { event: "engine", cue: "van-engine-loop", variants: 1 },
    { event: "skid", cue: "wet-skid", variants: 3 },
    { event: "horn", cue: "city-horn", variants: 2 },
    { event: "pickup", cue: "pickup-chime", variants: 2 },
    { event: "bed", cue: "rain-city-bed", variants: 1 }
  ],
  signatureEffect: "Wet night asphalt, amber marker glow and headlight pools on a real city-block street grid.",
  // The v2 stand-ins (K2 geometry, separate-wheel van, rain effects,
  // legacy cue map) retired with the deleted src/v2 and src/legacy trees;
  // the single-path scene claims none of those features.
  standIns: [],
  criticalCategories: ["environment_world", "atmospheric_effects", "material_quality"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 2200, shadowMap: 4096, cascades: 3, textureMax: 4096 }
  }
});
