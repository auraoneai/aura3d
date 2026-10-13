// apps/showcase-orbital-defense/art/direction.ts — C-35 art direction (PRD-14 §6.9.4).
// Fantasy: low-orbit defense at the planet's terminator; drones streak in against the Milky Way; every kill explodes.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-orbital-defense",
  genre: "arena-shooter",
  fantasy: "Low-orbit defense at the planet's terminator; drones streak in against the Milky Way; every kill explodes.",
  rebuildTier: "F",
  wave: 1,
  references: [
    {
      file: "references/deep-space-hdri.json",
      source: "K1 deep-space starfield HDRI (8k equirect)",
      licence: "reference-only",
      why: "Milky Way background + IBL; sun source matched to HDRI bright spot"
    },
    {
      file: "references/terminator-planet.json",
      source: "Earth terminator photography board",
      licence: "reference-only",
      why: "Day/night terminator with night-side city-light emission"
    },
    {
      file: "references/geometry-wars-webgl.json",
      source: "Geometry Wars / WebGL arena-shooter comparables board",
      licence: "reference-only",
      why: "Additive streak/trail readability and explosion clarity at a glance"
    }
  ],
  palette: {
    primary: ["#050810", "#0d1b2e", "#16294a", "#3d5a80"],
    accent: "#7cf4ff",
    reservedObjective: "#ff5a3c"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5800, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { hdri: "k1-deep-space", background: "hdri" },
    exposureEV: 0
  },
  framing: { rig: "topDown", subjectHeightFraction: [0.65, 0.75], fovDeg: [35, 50], mobile: "landscape" },
  // The rebuilt single-path scene (src/main.ts) renders from exactly three
  // admitted typed assets (apps/showcase-orbital-defense/aura.assets.json):
  // the Kenney Space Kit craft_racer interceptor, craft_miner drone pool and
  // meteor_detailed core planet copied from the arena-shooter template. The
  // former wishlist roles (station-turret / interceptor / drone-a / drone-b /
  // asteroid-belt) were never admitted and are gone with the old scene.
  // Neither craft is staged in a shared kit yet, so no `kit` is claimed:
  // S10's kit half stays failing until a human look-dev review accepts a
  // staged kit file (verdicts are never authored here). The craft are
  // low-poly props (ship 280 tris, drone 384, planet 196, untextured), so
  // they carry `prop`/`world` roles — hero/enemy roles would claim a
  // triangle floor these GLBs do not meet. Budgets bound the measured GLBs.
  assets: [
    { role: "prop", assetKey: "ship", maxTriangles: 1000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "drone", maxTriangles: 1000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "planet", maxTriangles: 1000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "bolt-fire", kind: "trail", flipbook: "k9-streak" },
    { event: "drone-kill", kind: "burst", flipbook: "k9-explosion" },
    { event: "shield-hit", kind: "burst", flipbook: "k9-ripple" },
    { event: "muzzle", kind: "burst", flipbook: "k9-flash" }
  ],
  audio: [
    { event: "fire", cue: "laser", variants: 3 },
    { event: "explosion", cue: "explosion", variants: 3 },
    { event: "shield", cue: "shield-hit", variants: 2 },
    { event: "bed", cue: "space-hum", variants: 1 },
    { event: "music", cue: "orbital-music", variants: 1 }
  ],
  signatureEffect: "Planet at terminator with city-light night side; every drone kill is an HDR additive explosion + flash.",
  // The five former stand-ins lived in the deleted src/v2 tree (orbit rig,
  // terminator planet, shield fresnel, cue strings, night IBL); the rebuilt
  // single-path scene uses the template's real rig/look/effects instead, so
  // no route-local stand-ins remain to track.
  standIns: [],
  criticalCategories: ["environment_world", "modeling_assets", "vfx"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 2048, cascades: 1, textureMax: 4096 }
  }
});
