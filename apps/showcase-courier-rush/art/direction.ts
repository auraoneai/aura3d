// apps/showcase-courier-rush/art/direction.ts — C-35 art direction (PRD-14 §6.9.7).
// Fantasy: early-rain delivery run through a wet dawn city.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-courier-rush",
  genre: "vehicle-delivery",
  fantasy: "Early-rain delivery run through a wet dawn city.",
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
    environment: { hdri: "k1-dawn-overcast", background: "hdri" },
    exposureEV: 0.1
  },
  framing: { rig: "chase", subjectHeightFraction: [0.25, 0.4], fovDeg: [45, 58], mobile: "portrait" },
  assets: [
    { role: "vehicle", assetKey: "delivery-van", maxTriangles: 35000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "k2-city-blocks", kit: "K2", maxTriangles: 400000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "street-props", kit: "K2", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "vehicle", assetKey: "traffic-cars", kit: "K2", maxTriangles: 20000, minTriangles: 3000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "pickup-dropoff-markers", maxTriangles: 4000, textureSet: "BC", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "rain", kind: "particles" },
    { event: "splash", kind: "burst", flipbook: "k9-splash" },
    { event: "skid", kind: "burst", flipbook: "k9-dust" },
    { event: "headlight", kind: "projector-decal" },
    { event: "pickup", kind: "ring", flipbook: "k9-ring" }
  ],
  audio: [
    { event: "engine", cue: "van-engine-loop", variants: 1 },
    { event: "skid", cue: "wet-skid", variants: 3 },
    { event: "horn", cue: "city-horn", variants: 2 },
    { event: "pickup", cue: "pickup-chime", variants: 2 },
    { event: "bed", cue: "rain-city-bed", variants: 1 }
  ],
  signatureEffect: "Wet dawn asphalt, amber marker glow and headlight pools on a real K2 street grid in rain.",
  standIns: [
    { feature: "K2 modular city geometry", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "K2 kit admitted + tile-assembling builder" },
    { feature: "van GLB (separate wheels)", file: "src/v2/scene/vehicle.ts", request: "R-14-15", removeWhen: "admitted van asset (van + wheels separate)" },
    { feature: "3-point-perspective skyscraper tilt", file: "src/v2/scene/camera.ts", request: "R-14-15", removeWhen: "K2 city geometry + camera rung real" },
    { feature: "rain via engine effects", file: "src/v2/fx/rain.ts", request: "R-14-14", removeWhen: "PRD 09 particle/headlight projectors real" }
  ],
  criticalCategories: ["environment_world", "atmospheric_effects", "material_quality"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 1400, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 2200, shadowMap: 4096, cascades: 3, textureMax: 4096 }
  }
});
