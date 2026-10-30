// examples/saiyan-snake-way-port/art/direction.ts: C-35 art direction for serpentine-sky-run-port (GU47 WP-27).
// Fantasy: a mythic dusk pilgrimage along the back of a sky serpent, one evening told as an eight-stage colour script.
import { defineArtDirection } from "@aura3d/game/art";
import { SERPENT_PALETTE } from "./colorScript";

export default defineArtDirection({
  id: "serpentine-sky-run-port",
  genre: "platformer",
  fantasy: "A dusk pilgrimage along a sky serpent's back: pearl and jade scales, a gold spine, a low sun ahead over a molten cloud sea.",
  rebuildTier: "S-presentation",
  wave: 4,
  references: [
    {
      file: "references/backlit-runner.json",
      source: "photographic reference: low-sun backlit figures on a ridge at golden hour (generic stock category, no specific work)",
      licence: "reference-only",
      why: "A low sun ahead of the subject rims the runner into a hot silhouette while the camera side stays in violet fill"
    },
    {
      file: "references/cloud-sea.json",
      source: "photographic reference: aerial cloud seas at sunset seen from a summit or aircraft window (generic category)",
      licence: "reference-only",
      why: "Lit cumulus tops in gold over a darker under-deck, with the horizon band hottest under the sun and indigo above"
    },
    {
      file: "references/lacquer-and-scales.json",
      source: "craft reference: East Asian red lacquerware, mother-of-pearl inlay and jade carving (museum-category, no specific object)",
      licence: "reference-only",
      why: "Mother-of-pearl sheen that shifts hue with view angle, jade green ramps and gold hairline inlay for the road scales"
    }
  ],
  palette: {
    primary: [SERPENT_PALETTE.indigo, SERPENT_PALETTE.coral, SERPENT_PALETTE.cloudGold],
    accent: SERPENT_PALETTE.pearlJade,
    reservedObjective: "#fff2c4"
  },
  lighting: {
    key: { type: "directional", colorTemperatureK: 2600, shadow: true },
    fill: "ibl+bounce",
    practicals: 2,
    environment: { preset: "neutral", background: "sky" },
    exposureEV: 0.13
  },
  framing: { rig: "chase", subjectHeightFraction: [0.12, 0.24], fovDeg: [62, 84], mobile: "both" },
  assets: [
    { role: "character", assetKey: "runner", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 2048, animated: { clips: ["Run_Loop", "Jump_Loop", "Flight_Loop", "Dive_Loop", "Slide_Loop", "Idle_Loop", "Hit_React"] } },
    { role: "prop", assetKey: "gate", maxTriangles: 30000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "barrier", maxTriangles: 30000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "enemy", assetKey: "ogre", maxTriangles: 40000, minTriangles: 2000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "cart", maxTriangles: 30000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "prop", assetKey: "feast", maxTriangles: 30000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "set-dressing", assetKey: "lantern", maxTriangles: 12000, textureSet: "BC+N", maxTextureSize: 1024 },
    { role: "backdrop", assetKey: "island", maxTriangles: 40000, textureSet: "BC+N", maxTextureSize: 1024 }
  ],
  vfx: [
    { event: "orb-pickup", kind: "serpent-orb" },
    { event: "power-pickup", kind: "serpent-power" },
    { event: "barrier-smash", kind: "serpent-pearl-chips" },
    { event: "land-and-roll", kind: "serpent-cloud-puff" },
    { event: "surge", kind: "serpent-surge" },
    { event: "stumble", kind: "serpent-hit" },
    { event: "soul-pass", kind: "serpent-soul" },
    { event: "storm-strike", kind: "serpent-lightning" },
    { event: "surge-and-flight", kind: "trail" }
  ],
  audio: [
    { event: "orb-pickup", cue: "orb-chime", variants: 3 },
    { event: "stumble", cue: "hit-thud", variants: 2 },
    { event: "surge", cue: "surge-swell", variants: 1 },
    { event: "stage-start", cue: "stage-gong", variants: 1 }
  ],
  signatureEffect: "Stage colour script on a scaled serpent road: eight evening looks blended along pearl-and-jade scales with a pulsing gold spine.",
  criticalCategories: ["lighting", "atmospheric_effects", "material_quality", "composition"],
  tiers: {
    low: { particles: 400, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 800, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 1600, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 2400, shadowMap: 4096, cascades: 2, textureMax: 2048 }
  }
});
