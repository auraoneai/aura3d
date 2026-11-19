// Splat Turf art direction (WP-16 procedural multi-material Street-Sport Ink Arena).
// Fantasy: sunlit urban street-sport ink arena & skate-park causeway — a warm gesso deck flanked by
// pressurized chromed ink reservoirs, sun-sail bleachers, truss floodlight towers, and aerosol monuments.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "splat-turf",
  genre: "maze-arcade",
  fantasy: "Race a paint roller down a sunlit skate-park road, coating every metre in wet glossy ink while solvent strips and erasers wipe your trail.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: street paint festivals and sunlit skate-park bowls (glossy acrylic pigment over primed gesso concrete)",
      licence: "reference-only",
      why: "Saturated wet-clearcoat rainbow trail paint over a bright sunlit gesso road, cycling hue every 25 m stretch so coverage reads at a glance"
    },
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: broadcast sports territory meters and enamel signage (plum ink on cream paper, gold grade ticks)",
      licence: "reference-only",
      why: "Plum ink HUD on cream paper chips with gold action buttons and C/B/A/S territory ticks keeps every text pair above 4.5:1 against the sunlit world"
    },
    {
      file: "evidence/splat-turf/README.md",
      source: "generic reference: watercolour & acrylic solvent wash-out techniques (solvent lifting fresh pigment off primed deck)",
      licence: "reference-only",
      why: "The solvent wipe wash lifts a lane strip back to primed gesso with a brief cyan wash, mirroring wet pigment lift"
    }
  ],
  palette: {
    primary: ["#4f2a8f", "#ff9fc8", "#ffd9a8", "#ffffff"],
    accent: "#ffb400",
    reservedObjective: "#ff3d8b"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5600, shadow: true },
    fill: "ibl",
    practicals: 0,
    environment: { preset: "softbox", background: "sky" },
    exposureEV: 0.08
  },
  framing: { rig: "chase", subjectHeightFraction: [0.1, 0.3], fovDeg: [55, 80], mobile: "both" },
  // Idol pass (2026-11): image-to-3D GLBs from speridlabs/idol/max (tools/idol/specs), admitted typed assets.
  assets: [
    { role: "vehicle", assetKey: "turfHeroKartShell", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "enemy", assetKey: "turfRivalKartShell", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "turfKartWheel", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 512 },
    { role: "prop", assetKey: "turfScrubBrush", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 512 },
    { role: "character", assetKey: "turfHeroDriverRig", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024, animated: { clips: ["driven-pose"] } },
    { role: "character", assetKey: "turfRivalDriverRig", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024, animated: { clips: ["driven-pose"] } },
    { role: "prop", assetKey: "turfAerosolCan", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "turfPaintBucketMagenta", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "turfPaintBucketAmber", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "turfPaintBucketCyan", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "turfPaintBucketViolet", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfBleacher", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfTrussTower", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfAerosolMonument", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfInflatableBarrier", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfStreetPalm", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfInkTank", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "turfFinishGantry", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turfIslandTree", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turfIslandTower", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turfBalloon", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turfIslandPaintPot", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turfIslandPalette", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "turfIslandEasel", maxTriangles: 40000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "paint-trail", kind: "trail" },
    { event: "solvent-wipe", kind: "burst" },
    { event: "eraser-wipe", kind: "burst" },
    { event: "stretch-combo", kind: "burst" },
    { event: "finish", kind: "burst" }
  ],
  audio: [
    { event: "can", cue: "can", variants: 1 },
    { event: "solvent", cue: "solvent", variants: 1 },
    { event: "eraser", cue: "eraser", variants: 1 },
    { event: "stretch", cue: "stretch", variants: 1 },
    { event: "finish", cue: "finish", variants: 1 },
    { event: "gameover", cue: "gameover", variants: 1 }
  ],
  signatureEffect: "Sunlit wet-ink skate-arena carnival: a persistent GPU splat coverage map with raised clearcoat meniscus highlights down a primed gesso road, plus a cyan solvent wipe wash that lifts pigment back to white.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 90, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    high: { particles: 90, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 90, shadowMap: 2048, cascades: 2, textureMax: 2048 }
  }
});
