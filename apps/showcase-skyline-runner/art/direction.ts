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
  // The rebuilt single-path scene (src/main.ts) renders from the four typed
  // assets in apps/showcase-skyline-runner/aura.assets.json: the rigged
  // Kenney Oobi hero (idle/walk/sprint/jump/fall embedded clips), the crate
  // GLB scaled to every authored platform/hazard rect, and the star/key
  // pickup models. The trashed flat-card hero, world GLB, sentry and
  // parallax roles are gone. No asset is staged in a shared kit yet, so no
  // `kit` is claimed: S10's kit half stays failing until a human look-dev
  // review accepts a staged kit file (verdicts are never authored here).
  assets: [
    { role: "character", assetKey: "showcaseKenneyOobiPlatformerHero", maxTriangles: 48000, minTriangles: 5000, textureSet: "BC+N+ORM", maxTextureSize: 2048, animated: { clips: ["run", "jump", "fall", "land"] } },
    { role: "world", assetKey: "quaterniusCubeCrate", maxTriangles: 160000, textureSet: "BC+N+ORM", maxTextureSize: 2048 },
    { role: "prop", assetKey: "kenneyPlatformerKitStar", maxTriangles: 5000, textureSet: "BC", maxTextureSize: 1024 },
    { role: "prop", assetKey: "kenneyPlatformerKitKey", maxTriangles: 5000, textureSet: "BC", maxTextureSize: 1024 }
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
    { feature: "polar-night look preset for k1-winter-dusk HDRI + per-act fog", file: "src/main.ts", request: "R-14-13", removeWhen: "winter-dusk HDRI admitted" },
    { feature: "crate GLB scaled to authored rects for K3 snow platform kit + parallax backdrops", file: "src/main.ts", request: "R-14-07", removeWhen: "platform kit + backdrop layers admitted" },
    { feature: "land state plays the rig crouch clip (no dedicated land clip)", file: "src/main.ts", request: "R-14-07", removeWhen: "rigged hero with land clip admitted" },
    { feature: "shared sfx-pack cues for K8 footstep/ambience sample set", file: "src/main.ts", request: "R-14-09", removeWhen: "K8 snow-metal steps admitted" }
  ],
  criticalCategories: ["animation_quality"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 2, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    high: { particles: 1200, shadowMap: 2048, cascades: 3, textureMax: 2048 },
    ultra: { particles: 2000, shadowMap: 4096, cascades: 4, textureMax: 4096 }
  }
});
