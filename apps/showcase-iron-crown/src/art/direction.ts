// apps/showcase-iron-crown/src/art/direction.ts — C-35 art direction for IRON CROWN (GU47 WP-15 "The Royal Forge",
// PRD §3.2 item 1). A theatrical tournament fighter in black iron, molten gold and ember crimson: one hard overhead
// follow-spot through smoke, fighters rimmed in their own colour on a reflective floor, sparks and embers, letterboxed
// intro and K.O. cinematics. Not imported by the route (no bundle cost); tests/unit/iron-crown/art-direction.test.ts
// audits it against every mounted venue and writes art/direction.audit.json for the `art-direction` game-check.
//
// Asset roles list every model a venue mounts today, including the borrowed cross-game keys IC47-A1 replaces (WP-36
// generates the Iron Crown props; the lane report lists each key and its replacement). The fighters are base-colour
// only today: their contracted "BC+N" set is the target of the WP-36 retexture (asset needs in the lane report).
import { defineArtDirection } from "@aura3d/game/art";

const FIGHTER = { role: "character", maxTriangles: 40000, minTriangles: 20000, textureSet: "BC+N", maxTextureSize: 2048 } as const;
const MESHY_PROP = { role: "prop", maxTriangles: 20000, textureSet: "BC+N+ORM", maxTextureSize: 2048 } as const;
const MESHY_PROP_E = { role: "prop", maxTriangles: 20000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048 } as const;

export default defineArtDirection({
  id: "showcase-iron-crown",
  genre: "fighting",
  fantasy: "A theatrical tournament fight in black iron, molten gold and ember crimson, under one hard follow-spot through forge smoke.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/single-follow-spot.json",
      source: "generic reference: a title fight in a dark arena under one hard overhead follow-spot through haze (event photography genre)",
      licence: "reference-only",
      why: "One shadowed overhead key whose pool holds the pair while the outer ring falls to black iron; the beam reads in the haze"
    },
    {
      file: "references/forge-at-night.json",
      source: "generic reference: a blacksmith forge and foundry pour at night (industrial photography genre)",
      licence: "reference-only",
      why: "Molten-gold highlights and ember-crimson glow on black iron, spark showers on impact and embers rising through smoke"
    },
    {
      file: "references/letterbox-fight-cinematics.json",
      source: "generic reference: letterboxed round intros and knockout replays of arcade versus fighters (genre convention)",
      licence: "reference-only",
      why: "Black bars only while the camera performs: a venue dolly, fighter close-ups, a K.O. orbit and a winner hero shot"
    }
  ],
  palette: {
    primary: ["#0e0b0d", "#d9a441", "#9e1b22"],
    // The boot venue's accent (forge ember); every venue has its own (src/game/look.ts STAGE_LOOKS[*].accent).
    accent: "#ff4d1f",
    // The SUPER meter, crown pips and the special burst: white-hot gold, used for nothing else.
    reservedObjective: "#ffe08a"
  },
  lighting: {
    // Crown Arena: the follow-spot (tungsten); outdoor venues swap it for their sun, still the one shadowed key.
    key: { type: "spot", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    // Two back rims in the fighters' colours, plus Neo-Tokyo's two rect panels.
    practicals: 4,
    // Phase 3: the Crown lights with the neutral studio HDRI (warm_bar turned the cyan gi green under the blind panel).
    environment: { hdri: "studio_small_08", background: "enclosed" },
    exposureEV: 0
  },
  framing: { rig: "fighting", subjectHeightFraction: [0.2, 0.3], fovDeg: [40, 45], mobile: "both" },
  assets: [
    { ...FIGHTER, assetKey: "ironcrownKenji", animated: { clips: ["Combat_Stance", "Walk_Fight_Forward", "Left_Jab_from_Guard", "Dead"] } },
    { ...FIGHTER, assetKey: "ironcrownVolt", animated: { clips: ["Combat_Stance", "Walk_Fight_Forward", "Left_Jab_from_Guard", "Dead"] } },
    { ...FIGHTER, assetKey: "ironcrownBoulder", animated: { clips: ["Combat_Stance", "Walk_Fight_Forward", "Left_Jab_from_Guard", "Dead"] } },
    { ...FIGHTER, assetKey: "ironcrownSeraph", animated: { clips: ["Combat_Stance", "Walk_Fight_Forward", "Left_Jab_from_Guard", "Dead"] } },
    { ...FIGHTER, assetKey: "ironcrownJinx", animated: { clips: ["Combat_Stance", "Walk_Fight_Forward", "Left_Jab_from_Guard", "Dead"] } },
    { ...FIGHTER, assetKey: "ironcrownSovereign", animated: { clips: ["Combat_Stance", "Walk_Fight_Forward", "Left_Jab_from_Guard", "Dead"] } },
    { role: "prop", assetKey: "ironcrownCrown", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 2048 },
    // Borrowed today (IC47-A1 replaces each with an Iron Crown key; WP-36).
    { ...MESHY_PROP, assetKey: "auraClashCornerBrazierPylonMeshy" },
    { ...MESHY_PROP, assetKey: "auraClashStageSpeakerTowerMeshy" },
    { ...MESHY_PROP, assetKey: "auroraFuelDepotTankMeshy" },
    { role: "set-dressing", assetKey: "auroraPadBeacon", maxTriangles: 2000, textureSet: "BC", maxTextureSize: 512 },
    { ...MESHY_PROP, assetKey: "billiardsClubChairMeshy" },
    { ...MESHY_PROP, assetKey: "bunkerBarrelMeshy" },
    { ...MESHY_PROP, assetKey: "bunkerCrateMeshy" },
    { ...MESHY_PROP_E, assetKey: "clashDragonStatueMeshy" },
    { ...MESHY_PROP, assetKey: "courierDeliveryKioskMeshy" },
    { ...MESHY_PROP_E, assetKey: "courierNeonStorefrontMeshy" },
    { ...MESHY_PROP, assetKey: "galleryMarbleBustExhibitMeshy" },
    { ...MESHY_PROP, assetKey: "gullsiegeBarrelMeshy" },
    { ...MESHY_PROP, assetKey: "gullsiegeCrateMeshy" },
    { ...MESHY_PROP, role: "world", assetKey: "gullsiegeGatehouseMeshy" },
    { ...MESHY_PROP, role: "world", assetKey: "gullsiegeWatchtowerMeshy" },
    { role: "world", assetKey: "heatsinkArch", maxTriangles: 2000, textureSet: "BC", maxTextureSize: 512 },
    { role: "set-dressing", assetKey: "heatsinkHoloBillboard", maxTriangles: 2000, textureSet: "BC", maxTextureSize: 512 },
    { ...MESHY_PROP, assetKey: "neonCyberPylonMeshy" },
    { role: "set-dressing", assetKey: "neonStreetLampProp", maxTriangles: 280000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { ...MESHY_PROP, role: "world", assetKey: "patrolCoastalRadarTowerMeshy" },
    { ...MESHY_PROP_E, assetKey: "patrolJetAircraftMeshy" },
    { role: "set-dressing", assetKey: "propBoulder", maxTriangles: 12000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "propPineTree", maxTriangles: 50000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048 },
    { role: "set-dressing", assetKey: "propRockA", maxTriangles: 32000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { ...MESHY_PROP_E, assetKey: "reactorFusionTurbineMeshy" },
    { role: "backdrop", assetKey: "showcaseModernBuildingOne", maxTriangles: 8000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "showcaseModernOfficeBuilding", maxTriangles: 230000, textureSet: "BC+N+ORM+E", maxTextureSize: 2048 },
    { role: "world", assetKey: "showcaseTeaHouse", maxTriangles: 120000, textureSet: "BC", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "hit", kind: "ic-forge-spark" },
    { event: "blocked", kind: "ic-guard-ember" },
    { event: "special", kind: "ic-special-burst" },
    { event: "knockout", kind: "ic-ko-shower" },
    { event: "crown-ambient-embers", kind: "ic-forge-embers" },
    { event: "dock-lantern-motes", kind: "ic-lantern-motes" },
    { event: "colosseum-noon-dust", kind: "ic-dust-devil" },
    { event: "win-hero-shot", kind: "ic-win-confetti" }
  ],
  audio: [
    { event: "hit", cue: "hit-light / hit / hit-heavy / hit-special", variants: 4 },
    { event: "blocked", cue: "blocked", variants: 1 },
    { event: "special", cue: "special", variants: 1 },
    { event: "throw", cue: "throw", variants: 1 },
    { event: "throw-tech", cue: "tech", variants: 1 },
    { event: "knockout", cue: "ko + ko-voice", variants: 2 },
    { event: "round-start", cue: "round + fight", variants: 2 },
    { event: "bout-end", cue: "win / lose", variants: 2 },
    { event: "venue-ambience", cue: "amb-* per stage", variants: 6 }
  ],
  signatureEffect: "Single follow-spot chiaroscuro: one hard overhead spot through forge smoke holds the pair on black iron, with letterboxed intro and K.O. cinematics.",
  criticalCategories: ["lighting", "character_presentation", "camera", "vfx", "atmospheric_effects"],
  tiers: {
    low: { particles: 600, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 1200, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 2000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
