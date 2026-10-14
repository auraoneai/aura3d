// apps/showcase-gallery-shift/art/direction.ts — C-35 art direction (PRD-14 §6.9.18).
// Fantasy: night heist in a private gallery — pools of light, sweeping guard
// flashlights, marble and glass.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-gallery-shift",
  genre: "stealth",
  fantasy: "Night heist in a private gallery: pools of light, sweeping guard flashlights, marble and glass.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "references/museum-night.json",
      source: "shipped comparable: night museum interiors (The Dark Mod gallery missions / Hitman museum levels)",
      licence: "reference-only",
      why: "Pools of warm exhibit light over dark marble — the contrast structure the heist read depends on"
    },
    {
      file: "references/vision-cones.json",
      source: "shipped comparable: readable stealth vision cones (Monaco's FOV wedges / Metal Gear alert arcs)",
      licence: "reference-only",
      why: "Correctly parented, lit cone volumes that read as 'AVOID THE CONES' — today none render"
    },
    {
      file: "references/thief-figure.json",
      source: "shipped comparable: lit humanoid sneak silhouette (Sly Cooper / Mark of the Ninja read at height)",
      licence: "reference-only",
      why: "A rigged 5k-tri thief that faces its heading and reads against dark exhibits"
    }
  ],
  palette: {
    primary: ["#07090d", "#141a22", "#2c3542", "#d8c9a8"],
    accent: "#ffb454",
    reservedObjective: "#62f8e7"
  },
  lighting: {
    key: { type: "spot", colorTemperatureK: 3200, shadow: true },
    fill: "ibl",
    practicals: 6,
    environment: { hdri: "k1-gallery-interior", background: "enclosed" },
    exposureEV: -0.2
  },
  framing: { rig: "chase", subjectHeightFraction: [0.15, 0.3], fovDeg: [50, 62], mobile: "landscape" },
  // B5 PORT rebuild: the fresh single-path scene (src/main.ts) renders the
  // museum interior from the salvaged FloorLayout rects using exactly two
  // admitted typed assets (aura.assets.json): the crate GLB per floor /
  // pedestal / case / exit / figure role and the modular wall panel per
  // wall rect. The trashed route's rigged-character and marble-kit roles
  // are gone; the GLB-interior candidate binding was deleted with them.
  // Neither asset is staged in a shared kit yet, so no `kit` is claimed:
  // S10's kit half stays failing until a human look-dev review accepts a
  // staged kit file (verdicts are never authored here). Triangle budgets
  // bound the measured GLBs (crate 264 tris, wall 1,670 tris, untextured).
  assets: [
    { role: "prop", assetKey: "quaterniusCubeCrate", maxTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "world", assetKey: "quaterniusWallModular", maxTriangles: 5000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "vision-cones", kind: "ambient" },
    { event: "beam-dust", kind: "ambient" },
    { event: "alarm-strobe", kind: "flash" },
    { event: "lift-sparkle", kind: "spark" }
  ],
  audio: [
    { event: "footstep-marble", cue: "steps-marble", variants: 6 },
    { event: "footstep-wood", cue: "steps-wood", variants: 6 },
    { event: "guard-bark", cue: "radio-bark", variants: 4 },
    { event: "alarm", cue: "gallery-alarm", variants: 1 },
    { event: "tension-layer", cue: "heist-tension", variants: 1 }
  ],
  signatureEffect: "Warm exhibit spot-pools on dark marble, two shadowed guard flashlights sweeping real vision cones, and a facing thief threading between them under glass glints.",
  standIns: [
    { feature: "k1-gallery-interior HDRI (interior-warm look preset stands in)", file: "src/main.ts", request: "R-14-13", removeWhen: "gallery interior HDRI admitted" },
    { feature: "K4 marble kit + licensed exhibits (typed crate/wall props stand in)", file: "src/main.ts", request: "R-14-07", removeWhen: "museum kit + exhibits admitted" },
    { feature: "rigged thief + guard clips (tinted crate figures stand in; salvaged clip-name constants wait for matching rigs)", file: "src/main.ts", request: "R-14-07", removeWhen: "K6 humanoid rigs admitted" },
    { feature: "K8 surface footsteps + barks (no route audio in the fresh scene)", file: "src/main.ts", request: "R-14-09", removeWhen: "K8 set admitted" }
  ],
  criticalCategories: ["animation_quality", "lighting"],
  tiers: {
    low: { particles: 200, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 500, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 1400, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
