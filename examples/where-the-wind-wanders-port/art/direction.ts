// examples/where-the-wind-wanders-port/art/direction.ts — C-35 art direction (GU47 WP-33, PRD §3.2 and §6.1 row G23).
// Fantasy: a storybook gouache valley where the wind is a character; the day moves on with every letter found.
// Look table: ../daylight.ts (one key per letter, bell and epilogue). Wind model: ../wind.ts. VFX presets: ../vfx.ts.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "where-the-wind-wanders-port",
  // No exploration genre exists in GAME_GENRES; the walk-and-hop traveller is closest to "platformer" (decision in lanes/g23.md).
  genre: "platformer",
  fantasy: "A storybook gouache valley where the wind is a character and the day moves on with every letter you find.",
  rebuildTier: "S-presentation",
  wave: 1,
  references: [
    {
      file: "references/gouache-valley.md",
      source: "generic reference: children's picture-book gouache landscapes (flat painted surfaces, soft dry-brush edges)",
      licence: "reference-only",
      why: "Untextured painted surfaces with brush grain and soft value steps instead of photographic texture detail"
    },
    {
      file: "references/late-afternoon-light.md",
      source: "generic reference: late-afternoon to dusk plein-air colour studies of a coastal valley",
      licence: "reference-only",
      why: "A low apricot sun from the west-southwest with long shadows, warm grass and a slate-teal sea in cool shade"
    },
    {
      file: "references/visible-wind.md",
      source: "generic reference: wind-swept meadow footage, cloud shadows rolling over grassland",
      licence: "reference-only",
      why: "Gust bands travelling through tall grass and cloud shadows drifting downwind make the wind itself visible"
    }
  ],
  palette: {
    primary: ["#8fae6a", "#3f7f86", "#ffc58a"],
    accent: "#d9a441",
    reservedObjective: "#b8432f"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3600, shadow: true },
    fill: "ibl+bounce",
    practicals: 4,
    // primary visible environment is the painted a3d_sky dome; kloppenheim_06 is an IBL-only fill for the GLBs (no background)
    environment: { hdri: "kloppenheim_06_puresky", background: "sky" },
    exposureEV: 0.07
  },
  framing: { rig: "chase", subjectHeightFraction: [0.18, 0.22], fovDeg: [40, 52], mobile: "both" },
  assets: [
    { role: "hero", assetKey: "hero", maxTriangles: 20000, minTriangles: 8000, textureSet: "BC+N+ORM", maxTextureSize: 1024, animated: { clips: ["Idle", "Walk", "Run"] } },
    { role: "world", assetKey: "belltower", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "bell", maxTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "world", assetKey: "cottage", maxTriangles: 60000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "boat", maxTriangles: 30000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "letter", maxTriangles: 24000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "oak", maxTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "pine", maxTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "shrub", maxTriangles: 1000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "stones", maxTriangles: 24000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    // the companion stays until the paper kite (WW47-A1, WP-36 asset windKite) replaces it
    { role: "prop", assetKey: "wisp", maxTriangles: 22000, textureSet: "BC+N+ORM", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "wind-petals", kind: "wind-petals" },
    { event: "gust-streak", kind: "wind-gust-streak" },
    { event: "letter-found", kind: "wind-letter-flutter" },
    { event: "bell-ring", kind: "wind-bell-ring" },
    { event: "lantern-light", kind: "wind-lantern-flare" },
    { event: "hop-landing", kind: "wind-grass-flick" },
    { event: "water-step", kind: "wind-ripple" }
  ],
  audio: [
    { event: "footstep", cue: "grass-footstep", variants: 4 },
    { event: "hop", cue: "hop-swish", variants: 1 },
    { event: "land", cue: "hop-land", variants: 1 },
    { event: "letter-found", cue: "letter-chime", variants: 3 },
    { event: "bell-ring", cue: "bell-toll", variants: 1 }
  ],
  signatureEffect: "Visible wind over a gouache valley: cloud shadows and gust waves roll downwind across sage grass while one continuous day moves from afternoon to lilac dusk.",
  criticalCategories: ["lighting", "atmospheric_effects", "environment_world", "composition"],
  tiers: {
    low: { particles: 0, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 220, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    high: { particles: 300, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    ultra: { particles: 300, shadowMap: 2048, cascades: 2, textureMax: 1024 }
  }
});
