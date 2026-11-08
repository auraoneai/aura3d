// apps/showcase-number-surge/src/art/direction.ts — SplatSiblings WP-3 art direction.
// Fantasy: a neon-arcade dusk highway of arithmetic gates; grow a glowing number ball and shatter boss walls.
// The look table is `../look.ts`; the signature VFX are the wall-shatter shards and the gold score geyser.
import { defineArtDirection } from "@aura3d/engine/game/art";

export default defineArtDirection({
  id: "number-surge",
  genre: "platformer",
  fantasy: "Steer a glowing number ball down a neon dusk highway, pick the better arithmetic gate, and smash boss walls with a bigger number.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "evidence/number-surge/README.md",
      source: "generic reference: neon arcade cabinets at dusk (deep indigo skies with cyan and magenta tube lighting)",
      licence: "reference-only",
      why: "Five-stop indigo-to-violet dusk sky with cyan/magenta gate coding that stays readable at speed"
    },
    {
      file: "evidence/number-surge/README.md",
      source: "generic reference: arcade score geysers and shattering glass walls (gold particle fountains, violet shards)",
      licence: "reference-only",
      why: "Wall shatter shard burst plus a gold score geyser make the smash the signature moment"
    },
    {
      file: "evidence/number-surge/README.md",
      source: "generic reference: luminous numeric decals on dark toy spheres (bold rounded digits, high contrast ink)",
      licence: "reference-only",
      why: "Canvas-text op panels and the ball number decal keep the arithmetic legible on mobile"
    }
  ],
  palette: {
    primary: ["#0d0b2e", "#221d4e", "#3ef2ff", "#ff4fd8"],
    accent: "#ffd84d",
    reservedObjective: "#ff4f6d"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 4200, shadow: true },
    fill: "ibl+bounce",
    practicals: 1,
    environment: { hdri: "kloppenheim_06_puresky", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.3], fovDeg: [58, 83], mobile: "both" },
  assets: [],
  vfx: [
    { event: "smash", kind: "burst" },
    { event: "pick-good", kind: "burst" },
    { event: "powerup", kind: "burst" },
    { event: "milestone", kind: "burst" }
  ],
  audio: [
    { event: "pick-good", cue: "pick-good", variants: 1 },
    { event: "pick-bad", cue: "pick-bad", variants: 1 },
    { event: "smash", cue: "smash", variants: 1 },
    { event: "wall-fail", cue: "wall-fail", variants: 1 },
    { event: "powerup", cue: "powerup", variants: 1 },
    { event: "milestone", cue: "milestone", variants: 1 },
    { event: "gameover", cue: "gameover", variants: 1 }
  ],
  signatureEffect: "Neon-arcade dusk: cyan/magenta arithmetic gates under a deep indigo sky, boss walls shattering into violet shards with a gold score geyser.",
  criticalCategories: ["lighting", "environment_world", "vfx", "gameplay_readability"],
  tiers: {
    low: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 90, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    high: { particles: 90, shadowMap: 2048, cascades: 1, textureMax: 1024 },
    ultra: { particles: 90, shadowMap: 2048, cascades: 2, textureMax: 1024 }
  }
});