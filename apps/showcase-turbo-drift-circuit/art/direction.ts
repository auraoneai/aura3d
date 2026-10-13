// apps/showcase-turbo-drift-circuit/art/direction.ts — C-35 art direction (PRD-14 §6.9.2).
// Fantasy: sunset alpine circuit — golden low sun, long shadows, tyre smoke.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-turbo-drift-circuit",
  genre: "racing",
  fantasy: "Sunset alpine circuit: golden low sun, long shadows, tyre smoke.",
  rebuildTier: "S-world",
  wave: 1,
  references: [
    {
      file: "references/sunset-alpine-hdri.json",
      source: "Poly Haven sunset/alpine HDRI set (K1, CC0)",
      licence: "reference-only",
      why: "Golden low sun as sky and IBL source; long-shadow direction for the CSM"
    },
    {
      file: "references/trackmania-webgl.json",
      source: "TrackMania / WebGL racing comparables board",
      licence: "reference-only",
      why: "Shipped-target chase framing and speed readability"
    },
    {
      file: "references/asphalt-circuit.json",
      source: "K3 circuit-surface reference set",
      licence: "reference-only",
      why: "UV'd asphalt with rubbered racing line, kerb and run-off decals"
    }
  ],
  palette: {
    primary: ["#35452e", "#5a4632", "#8c6a3f", "#d98d4a"],
    accent: "#f2a65a",
    reservedObjective: "#ffd24d"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2400, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { hdri: "k1-sunset", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.2, 0.28], fovDeg: [55, 68], mobile: "landscape" },
  // The rebuilt single-path scene (src/main.ts) renders from exactly two
  // admitted typed assets (apps/showcase-turbo-drift-circuit/
  // aura.assets.json): the sports-car GLB (player, rival and ghost) and
  // the kart-circuit GLB the ground query in src/track-surface.ts is
  // extracted from. The trashed scene's formula-circuit/venue/crowd roles
  // are gone. Neither asset is staged in a shared kit yet, so no `kit` is
  // claimed: S10's kit half stays failing until a human look-dev review
  // accepts a staged kit file (verdicts are never authored here).
  // Triangle budgets bound the measured GLBs (car 8,494 tris, circuit
  // 24,493 tris).
  assets: [
    { role: "hero", assetKey: "carModel", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "world", assetKey: "trackModel", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 2048 }
  ],
  vfx: [
    { event: "tyre-slip", kind: "trail", flipbook: "k9-smoke-lit" },
    { event: "wall-scrape", kind: "burst", flipbook: "k9-sparks" },
    { event: "off-track", kind: "trail", flipbook: "k9-dust" }
  ],
  audio: [
    { event: "engine", cue: "car-sport-rpm", variants: 1 },
    { event: "skid", cue: "skid-loop", variants: 1 },
    { event: "wind", cue: "speed-wind", variants: 1 },
    { event: "bed", cue: "crowd-bed", variants: 1 },
    { event: "music", cue: "turbo-music", variants: 1 }
  ],
  signatureEffect: "Golden-hour sun with 3-cascade CSM over a textured alpine circuit; lit tyre smoke reads slip.",
  standIns: [],
  criticalCategories: ["environment_world", "shadows", "vfx"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1800, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
