// examples/splat-rush-port/art/direction.ts — GU47 WP-26 (G16) art direction for Chroma Roll (splat-rush-port).
// Fantasy: a wet-paint ribbon road through a low-sun sky; hand-inked cel paint carnival at sunset.
// The look table is `../look.ts` (one row per variant: original, carnival); the VFX preset pack is `../vfx3d.ts`.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "splat-rush-port",
  genre: "platformer",
  fantasy: "Roll a wet-paint ball down a ribbon road through a paint carnival at golden hour, matching gate colours.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/game-upgrades-47/splat-rush-port/identity.md",
      source: "generic reference: hand-inked cel animation backgrounds at sunset (painted sky gradients with a rose band)",
      licence: "reference-only",
      why: "Five-stop painted sunset sky with a low sun disc, rose band and lilac cloud sea under an ink-teal zenith"
    },
    {
      file: "evidence/game-upgrades-47/splat-rush-port/identity.md",
      source: "generic reference: toon-shaded arcade rollers with plum ink outlines and stepped warm rims",
      licence: "reference-only",
      why: "Stepped toon ramp plus a warm fresnel rim and a plum ink line that keep the ball and gates readable at speed"
    },
    {
      file: "evidence/game-upgrades-47/splat-rush-port/identity.md",
      source: "generic reference: fairground paint festivals (bunting, paint pots, wet splatters drying on canvas)",
      licence: "reference-only",
      why: "Gate-coloured bunting, painted-canvas deck weave and glossy wet splatters that dry over two seconds"
    }
  ],
  palette: {
    primary: ["#1f4a63", "#f3a96b", "#e8798a", "#a99bc9"],
    accent: "#ffc58a",
    reservedObjective: "#f0433a"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 3200, shadow: true },
    fill: "ibl+bounce",
    practicals: 1,
    environment: { hdri: "kloppenheim_06_puresky", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [55, 83], mobile: "both" },
  assets: [
    { role: "backdrop", assetKey: "islandTree", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "islandTower", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 },
    { role: "backdrop", assetKey: "balloon", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "gemRainbow", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "gemShield", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "gemDouble", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 },
    { role: "prop", assetKey: "gemSwitch", maxTriangles: 30000, textureSet: "BC", maxTextureSize: 512 }
  ],
  vfx: [
    { event: "gate-match", kind: "burst" },
    { event: "perfect", kind: "burst" },
    { event: "pickup", kind: "burst" },
    { event: "ball-path", kind: "trail" }
  ],
  audio: [
    { event: "match", cue: "match", variants: 1 },
    { event: "perfect", cue: "perfect", variants: 1 },
    { event: "hit", cue: "hit", variants: 1 },
    { event: "pickup", cue: "pickup", variants: 1 },
    { event: "burst", cue: "burst", variants: 1 }
  ],
  signatureEffect: "Hand-inked cel paint carnival at sunset: plum-inked toon ribbon road under a golden-to-violet painted sky with gate-coloured paint splashes.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 120, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 240, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 360, shadowMap: 2048, cascades: 2, textureMax: 1024 },
    ultra: { particles: 480, shadowMap: 2048, cascades: 2, textureMax: 2048 }
  }
});
