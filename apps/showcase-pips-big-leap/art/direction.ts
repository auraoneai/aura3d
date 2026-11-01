// apps/showcase-pips-big-leap/art/direction.ts: C-35 art direction (GU47 WP-16, PRD section 3.2).
// Fantasy: a hand-made felt-and-clay woodland diorama seen through a macro lens, Pip acorn-sized.
//
// The contract object is type-checked against `GameArtDirection` here and validated with
// `defineArtDirection` in tests/unit/pips-big-leap/art-direction.test.ts, which also runs
// `auditArtDirection` on every world's authored diorama scene and writes
// art/direction.audit.json (E-I recipe). The import is type-only so the unit suite can load
// this file: vitest maps `@aura3d/engine/game` by prefix, so `@aura3d/engine/game/art` does
// not resolve there (lane report handoff to E-I).
import type { GameArtDirection } from "@aura3d/engine/game/art";

const direction: GameArtDirection = {
  id: "showcase-pips-big-leap",
  genre: "platformer",
  fantasy: "A hand-made felt-and-clay woodland diorama seen through a macro lens, with an acorn-sized Pip leaping between toadstools.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    {
      file: "references/macro-diorama-photography.json",
      source: "genre comparable: macro photography of hand-built model dioramas (shallow depth of field at f/2)",
      licence: "reference-only",
      why: "The shallow-focus miniature lens: one sharp acorn-sized hero while the set melts into soft bokeh"
    },
    {
      file: "references/felt-and-clay-sets.json",
      source: "genre comparable: stop-motion puppet sets built from wool felt, modelling clay and painted wood",
      licence: "reference-only",
      why: "Felt nap sheen on moss and caps, matte clay bodies with soft rounded edges, only the caps lacquered"
    },
    {
      file: "references/forest-floor-macro.json",
      source: "nature comparable: forest-floor macro photography at dawn, golden hour and night",
      licence: "reference-only",
      why: "Each world's hour as one light colour: dawn shafts, golden hour, lava glow, amber lanterns, moonlight"
    }
  ],
  // Moss, toadstool red, birch cream; sun-seed gold only for pickups and the Sun-Gate.
  palette: {
    primary: ["#4f7a3a", "#c8432f", "#efe3c8"],
    accent: "#ffc23d",
    reservedObjective: "#ffc23d"
  },
  lighting: {
    // One PCSS key per world (src/game/looks.ts); IBL fill from the world's catalogue HDRI.
    key: { type: "directional", colorTemperatureK: 5000, shadow: true },
    fill: "ibl",
    // Hemisphere + cool rim in every world, plus up to four practicals (w4 lava, w5 lanterns and throne spot, w6 crystals).
    practicals: 6,
    // GU47 phase 3: the daylight worlds (academy, w1, w3) draw autumn_field_puresky as their visible
    // sky (w2 draws industrial_sunset_puresky; w4-w6 keep enclosed colour or star backdrops).
    environment: { hdri: "autumn_field_puresky", background: "hdri" },
    exposureEV: -0.2
  },
  framing: { rig: "shoulder", subjectHeightFraction: [0.18, 0.25], fovDeg: [46, 68], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "pipsPip", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024, animated: { clips: ["Idle", "Quick_Walk", "RunFast", "Regular_Jump", "Dead", "Victory_Cheer"] } },
    { role: "enemy", assetKey: "pipsBrambleback", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024, animated: { clips: ["Idle", "Quick_Walk", "Attack", "Hit_Reaction", "Dead", "Chest_Pound_Taunt"] } },
    // NPC runners: kept until the rigged villagers (PBL-A3, WP-36) replace them.
    { role: "character", assetKey: "showcaseSidekickRunner", maxTriangles: 30000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024, animated: { clips: ["idle"] } },
    { role: "character", assetKey: "helperChar", maxTriangles: 30000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024, animated: { clips: ["idle"] } },
    { role: "prop", assetKey: "pipsSunseed", maxTriangles: 4000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "pipsGoldenAcorn", maxTriangles: 4000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "pipsCheckpointFlag", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "pipsSungate", maxTriangles: 10000, textureSet: "BC", maxTextureSize: 1024 },
    // Borrowed shared props: mounted today, replaced by the woodland set (PBL-A2, WP-36).
    { role: "set-dressing", assetKey: "propConifer", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "propBoulder", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "propRockB", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "gullsiegeWindmillMeshy", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "gullsiegeWatchtowerMeshy", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "gullsiegeCrateMeshy", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "gullsiegeBarrelMeshy", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "skylineCrystalShardMeshy", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "fpsEnergyCorePickupMeshy", maxTriangles: 8000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "auraClashCornerBrazierPylonMeshy", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "neonStreetLampProp", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "heatsinkBoostPad", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "heatsinkArch", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "galleryShiftPedestal", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "reactorFusionTurbineMeshy", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "blockfallReactorContainmentPylonMeshy", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "heatsinkDroneNighthawk", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  // One entry per gameplay event; the pack lives in src/game/vfx.ts.
  vfx: [
    { event: "land", kind: "pip-land-dust" },
    { event: "jump", kind: "pip-jump-puff" },
    { event: "seed", kind: "pip-seed-sparkle" },
    { event: "acorn", kind: "pip-acorn-ring" },
    { event: "checkpoint", kind: "pip-checkpoint-leaf" },
    { event: "hurt", kind: "pip-thorn-hit" },
    { event: "gate", kind: "pip-gate-open" },
    { event: "glide", kind: "pip-glide-trail" },
    { event: "dive", kind: "pip-dive-trail" },
    { event: "ambient", kind: "pip-ambient-emitter" }
  ],
  audio: [
    { event: "jump", cue: "whoosh.dash.00", variants: 1 },
    { event: "seed", cue: "pickup.power-up.00", variants: 1 },
    { event: "acorn", cue: "pickup.coin.00", variants: 1 },
    { event: "checkpoint", cue: "stinger.checkpoint.00", variants: 1 },
    { event: "gate", cue: "stinger.win.00", variants: 1 },
    { event: "world-bed", cue: "ambience.wind-open", variants: 1 }
  ],
  signatureEffect: "Shallow-focus miniature lens: an f/2 macro depth of field holds acorn-sized Pip sharp while each felt-and-clay diorama melts into bokeh over a fogged base (below High: corner vignette and base fog).",
  criticalCategories: ["camera", "postprocessing", "material_quality", "environment_world", "atmospheric_effects"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    high: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1000, shadowMap: 4096, cascades: 4, textureMax: 2048 }
  }
};

export default direction;
