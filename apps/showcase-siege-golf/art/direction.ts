// apps/showcase-siege-golf/art/direction.ts — C-35 art direction (PRD-14 §6.9.10).
// Fantasy: a castle siege frozen mid-battle — stone keep, wooden trebuchets and
// barbicans under a golden-hour valley sun.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-siege-golf",
  genre: "golf-physics",
  fantasy: "A castle siege frozen mid-battle — stone keep, wooden trebuchets and barbicans under a golden-hour valley sun.",
  rebuildTier: "S-world",
  wave: 2,
  references: [
    {
      file: "references/golden-valley.json",
      source: "shipped comparable: golden-hour open-valley boards (Ghost of Tsushima fields / Halo Infinite valleys)",
      licence: "reference-only",
      why: "Warm low sun, valley haze and grass-rock terrain reads the K1 lighting targets"
    },
    {
      file: "references/siege-structures.json",
      source: "admitted siegeGolfCastle / miniGolfCastle* GLBs + K3 castle-piece kit",
      licence: "reference-only",
      why: "Castle keep, trebuchets and barbicans the one-scene-per-hole holes are built from"
    },
    {
      file: "references/siege-ammo.json",
      source: "admitted siegeGolfAmmo GLB (spinning ammo crate, 16k tris)",
      licence: "reference-only",
      why: "The crate/prop family the playing field scatters — restored maps needed"
    }
  ],
  palette: {
    primary: ["#1d2a14", "#33401f", "#6d5a2e", "#a8823f"],
    accent: "#ffcf5c",
    reservedObjective: "#59d7ff"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2900, shadow: true },
    fill: "ibl",
    practicals: 1,
    environment: { hdri: "k1-golden-valley", background: "hdri" },
    exposureEV: 0.2
  },
  framing: { rig: "altitude", subjectHeightFraction: [0.45, 0.7], fovDeg: [45, 60], mobile: "landscape" },
  assets: [
    { role: "world", assetKey: "valley-terrain", kit: "K3", maxTriangles: 250000, textureSet: "BC+N", maxTextureSize: 2048 },
    { role: "prop", assetKey: "siege-castle-set", kit: "K3", maxTriangles: 180000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "ammo-crate", maxTriangles: 16000, minTriangles: 2000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "trebuchet", kit: "K3", maxTriangles: 30000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "prop", assetKey: "golf-ball", maxTriangles: 4000, textureSet: "BC+N", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "structure-break", kind: "burst", flipbook: "k9-debris" },
    { event: "stone-impact", kind: "burst", flipbook: "k9-dust" },
    { event: "ball-trail", kind: "trail" },
    { event: "hole-clear", kind: "ring" }
  ],
  audio: [
    { event: "launch", cue: "trebuchet-launch", variants: 2 },
    { event: "bounce", cue: "stone-bounce", variants: 4 },
    { event: "break", cue: "wood-splinter", variants: 4 },
    { event: "hole", cue: "hole-clear-stinger", variants: 1 },
    { event: "bed", cue: "valley-wind-bed", variants: 1 }
  ],
  signatureEffect: "Golden-hour sun raking across a K3 terrain with castle silhouettes; wooden structures splinter under cannon fire.",
  standIns: [
    { feature: "K3 valley terrain + castle kit", file: "src/v2/scene/world.ts", request: "R-14-07", removeWhen: "K3 terrain/castle admitted" },
    { feature: "crate maps (siegeGolfAmmo textures)", file: "src/v2/scene/props.ts", request: "R-14-07", removeWhen: "crate maps restored" },
    { feature: "K9 debris/dust clips", file: "src/v2/fx.ts", request: "R-14-07", removeWhen: "K9 flipbooks admitted" },
    { feature: "sampled stone/wood audio", file: "src/v2/audio.ts", request: "R-14-09", removeWhen: "K9 sound clips admitted" }
  ],
  criticalCategories: ["environment_world", "lighting", "material_quality"],
  tiers: {
    low: { particles: 300, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 600, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1000, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1600, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
