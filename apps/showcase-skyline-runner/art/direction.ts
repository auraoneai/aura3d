// apps/showcase-skyline-runner/art/direction.ts — C-35 art direction (PRD-14 §6.9.15).
// Fantasy: winter-dusk rooftop platformer across five acts — painted backdrop,
// lit 3D foreground.
import { defineArtDirection } from "@aura3d/game/art";

export default defineArtDirection({
  id: "showcase-skyline-runner",
  genre: "platformer",
  fantasy: "Winter-dusk rooftop platformer across five acts: painted parallax backdrop, lit 3D foreground.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/winter-dusk-rooftops.json",
      source: "shipped comparable: winter dusk platformer skies (Celeste snowy ridgelines / INSIDE cold dusk gradients)",
      licence: "reference-only",
      why: "The five-act winter-dusk gradient bands and fog-matched parallax depth the backdrop re-cut targets"
    },
    {
      file: "references/painted-foreground.json",
      source: "shipped comparable: lit 3D foreground over painted backdrops (Rayman Legends stage layering / Ori environments)",
      licence: "reference-only",
      why: "Lit textured kit pieces floating over a 3-4 layer parallax painting with matched key direction"
    },
    {
      file: "references/runner-hero.json",
      source: "shipped comparable: compact runner hero readability (Celeste Madeline silhouette / Geometry Dash icon contrast)",
      licence: "reference-only",
      why: "A 0.44u hero that stays readable against dark blue at gameplay distance with jump/fall silhouettes"
    }
  ],
  palette: {
    primary: ["#0a1626", "#16304a", "#3d6a8f", "#dbe9f4"],
    accent: "#ffb454",
    reservedObjective: "#62f8e7"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 5500, shadow: true },
    fill: "ibl",
    practicals: 2,
    environment: { hdri: "k1-winter-dusk", background: "sky" },
    exposureEV: 0
  },
  framing: { rig: "follow2d", subjectHeightFraction: [0.1, 0.22], fovDeg: [42, 50], mobile: "landscape" },
  assets: [
    { role: "character", assetKey: "skyline-hero-runner", maxTriangles: 48000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["run", "jump", "fall", "land"] } },
    { role: "world", assetKey: "snow-platform-kit", kit: "K3", maxTriangles: 160000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "enemy", assetKey: "sentry-patrols", kit: "K7", maxTriangles: 20000, minTriangles: 3000, textureSet: "BC+N+ORM", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "parallax-act-backdrops", kit: "K1", maxTriangles: 20000, textureSet: "BC", maxTextureSize: 2048 }
  ],
  vfx: [
    { event: "landing-puff", kind: "burst" },
    { event: "snowfall", kind: "ambient" },
    { event: "pickup-sparkle", kind: "spark" },
    { event: "ember-volley", kind: "burst" },
    { event: "checkpoint-chime", kind: "ring" }
  ],
  audio: [
    { event: "footstep", cue: "snow-metal-steps", variants: 6 },
    { event: "jump", cue: "runner-jump", variants: 3 },
    { event: "land", cue: "runner-land", variants: 3 },
    { event: "pickup", cue: "shard-pickup", variants: 3 },
    { event: "act-ambience", cue: "winter-wind-bed", variants: 5 }
  ],
  signatureEffect: "Five acts of lit snow-kit rooftops sliding over a matched-fog parallax dusk painting, snowfall and landing puffs tying the two depth layers together.",
  standIns: [
    { feature: "k1-winter-dusk HDRI + per-act fog", file: "src/v2/scene/lighting.ts", request: "R-14-13", removeWhen: "winter-dusk HDRI admitted" },
    { feature: "K3 snow platform kit + parallax backdrops", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "platform kit + backdrop layers admitted" },
    { feature: "rigged skylineHeroRunner clips", file: "src/v2/scene/world.ts", request: "R-14-15", removeWhen: "rigged hero admitted" },
    { feature: "K8 footstep/ambience sample set", file: "src/v2/audio.ts", request: "R-14-15", removeWhen: "K8 snow-metal steps admitted" }
  ],
  criticalCategories: ["animation_quality"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
