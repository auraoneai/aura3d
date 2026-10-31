// apps/showcase-aura-links-3d/art/direction.ts — C-35 art direction (GU47 WP-20, PRD §3.2).
// Fantasy: a golf-broadcast postcard tour; six courses, six places and hours (look table: src/game/lighting.ts,
// VFX pack: src/game/vfx.ts). Audited by tests/unit/aura-links-3d/art-direction.test.ts, which writes
// art/direction.audit.json for the `art-direction` and `look-identity` game-checks.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-aura-links-3d",
  genre: "golf-physics",
  fantasy: "A golf-broadcast postcard tour: six courses, six places and hours, framed by flyovers, shot tracers and cup cams.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/references.json#broadcast-camera",
      source: "generic reference: televised golf coverage camera language (hole flyover, live ball tracer, low cup camera)",
      licence: "reference-only",
      why: "The broadcast shot grammar the signature effect copies: a flyover before the tee shot, a tracer on drives, a cup cam on putts"
    },
    {
      file: "references/references.json#postcard-light",
      source: "generic reference: landscape postcard photography of coastal links at sunrise and parkland at golden hour",
      licence: "reference-only",
      why: "One low warm key per course with long turf shadows, sea haar or warm haze for depth, and a sky that names the hour"
    },
    {
      file: "references/references.json#hard-light",
      source: "generic reference: public-domain lunar surface photography and floodlit night stadium photography",
      licence: "reference-only",
      why: "The two non-daylight courses: airless black-sky hard shadows under an earthrise, and floodlight cones in a wet navy night"
    }
  ],
  palette: {
    // the tour's own tones (links fairway, bunker sand, harbour sea, pin white); each course adds its own in the look table
    primary: ["#2d7a3e", "#d8b878", "#154c79", "#f2f0e2"],
    accent: "#ffd257",
    reservedObjective: "#ff4d3d"
  },
  lighting: {
    // the boot course (St. Auroras); every course has one shadowed key from its own sun and an HDRI fill
    key: { type: "directional", colorTemperatureK: 4200, shadow: true },
    fill: "ibl",
    practicals: 4,
    environment: { hdri: "kloppenheim_06_puresky", background: "hdri" },
    exposureEV: 0
  },
  framing: { rig: "shoulder", subjectHeightFraction: [0.22, 0.6], fovDeg: [30, 58], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "linksGolferAthleteMeshy", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["Ready", "Idle_Loop"] } },
    { role: "prop", assetKey: "linksGolfCartMeshy", maxTriangles: 16000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "linksPinFlagMeshy", maxTriangles: 20000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "siegeGolfBall", maxTriangles: 80000, textureSet: "BC", maxTextureSize: 512 },
    { role: "set-dressing", assetKey: "propPineTree", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "propRockA", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "siegeWindmillTowerMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "siegeStoneBridgeMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "skylineCrystalShardMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turboAlpineVenueBackdrop", maxTriangles: 120000, textureSet: "BC", maxTextureSize: 2048 },
    { role: "prop", assetKey: "neonStreetLampProp", maxTriangles: 60000, textureSet: "BC+N+ORM+E", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "showcaseModernBuildingOne", maxTriangles: 60000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "showcaseModernOfficeBuilding", maxTriangles: 120000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "backdrop", assetKey: "showcaseVoxelBuilding", maxTriangles: 60000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "auroraHabitatDomeMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "lunarRoverMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "gravityOrbitalRelayMeshy", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "tee-strike", kind: "links-strike" },
    { event: "fairway-landing", kind: "links-divot" },
    { event: "bunker-landing", kind: "links-sand-burst" },
    { event: "water-hazard", kind: "links-water-splash" },
    { event: "lava-hazard", kind: "links-ember-hiss" },
    { event: "lunar-landing", kind: "links-lowg-dust" },
    { event: "hole-out", kind: "links-holeout-ring" },
    { event: "ball-flight", kind: "trail" },
    { event: "course-ambience", kind: "particles" }
  ],
  audio: [
    { event: "drive", cue: "drive", variants: 1 },
    { event: "putt", cue: "putt", variants: 1 },
    { event: "bounce", cue: "bounce", variants: 1 },
    { event: "hole-out", cue: "cup", variants: 1 },
    { event: "lip-out", cue: "rattle", variants: 1 },
    { event: "water-hazard", cue: "splash", variants: 1 },
    { event: "birdie", cue: "parChime", variants: 1 },
    { event: "bogey", cue: "bogey", variants: 1 },
    { event: "eagle", cue: "win", variants: 1 },
    { event: "menu", cue: "ui", variants: 1 },
    { event: "course-ambience", cue: "wind", variants: 1 }
  ],
  signatureEffect: "Golf-broadcast camera language: a three-shot hole flyover under letterbox bars, a live shot tracer on every drive and a low cup cam on short putts.",
  criticalCategories: ["camera", "lighting", "environment_world", "atmospheric_effects", "ibl_reflections"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 1200, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    high: { particles: 2000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 3, textureMax: 4096 }
  }
});
