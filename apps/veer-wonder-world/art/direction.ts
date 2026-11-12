// Wonder World art direction contract (C-35, Aura3D 5.5.1, 100% Procedural Craft Rigs).
// Validated via `defineArtDirection` and audited across all 6 Wonder World storybook dioramas
// in `tests/unit/stage/art-direction.test.ts`, which writes `art/direction.audit.json`.
import { defineArtDirection, type GameArtDirection } from "@aura3d/engine/game/art";
import { WONDER_VFX } from "../src/scenes/vfx-presets.js";

const directionSpec: GameArtDirection = {
  id: "wonder-world",
  genre: "maze-arcade",
  fantasy:
    "A needle-felted wool, matte clay, and beechwood picture-book diorama stage where toddler friends explore warm morning sets.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "src/scenes/LOOK-BRIEF.md",
      source: "genre comparable: stop-motion needle-felted wool, matte clay, and painted beechwood miniature picture-book sets lit by soft morning daylight",
      licence: "reference-only",
      why: "Procedural felt/clay/ceramic/lacquer rigs with crisp dual-catchlight eyes, warm beechwood bevels, and grounded contact shadows on raised diorama islands"
    },
    {
      file: "provenance/hdri.json",
      source: "lighting comparable: Poly Haven CC0 1k HDRI skies paired with warm 2048 PCSS key light, hemisphere bounce, and rim separation",
      licence: "CC0-1.0",
      why: "True IBL reflection and diffuse sky fill across all six worlds without flat ambient washes or dark vignettes"
    },
    {
      file: "src/scenes/diorama-terrain.ts",
      source: "craft comparable: sculpted tabletop island bases with flat central play stages, rolling perimeter hills, and swept timber molding",
      licence: "reference-only",
      why: "Every procedural character and tap prop sits flush on a flat play stage framed by lush instanced meadow blades, pebbles, clouds, and animated pond ripples"
    }
  ],
  palette: {
    primary: ["#FBF6EC", "#98D47E", "#F2848E", "#93B9EE"],
    accent: "#F4B942",
    reservedObjective: "#FFE8A3"
  },
  lighting: {
    key: {
      type: "directional",
      colorTemperatureK: 5200,
      shadow: true
    },
    fill: "ibl+bounce",
    practicals: 6,
    environment: {
      hdri: "./hdri/autumn_field_puresky_1k.hdr",
      preset: "storybook-daylight",
      background: "sky"
    },
    exposureEV: -0.05
  },
  framing: {
    rig: "static",
    subjectHeightFraction: [0.18, 0.42],
    fovDeg: [38, 48],
    mobile: "both"
  },
  // All 66 stage rigs are first-party procedural custom geometries (`PROCEDURAL_RIGS`, zero external `.glb`s);
  // triangle & sub-shape budgets are enforced directly against `PROCEDURAL_RIGS` in `spots.test.ts` and `art-direction.test.ts`.
  assets: [],
  vfx: Object.keys(WONDER_VFX).map((kind) => ({
    event: kind,
    kind
  })),
  audio: [
    { event: "tap-prop", cue: "tap_soft", variants: 1 },
    { event: "choice-chime", cue: "chime", variants: 1 },
    { event: "peekaboo-reveal", cue: "pop", variants: 1 },
    { event: "train-whistle", cue: "train_chug", variants: 1 },
    { event: "celebrate-turn", cue: "giggle_warm", variants: 1 }
  ],
  signatureEffect:
    "Warm storybook miniature felt-clay-and-beechwood diorama lighting: WebGPU-first live rendering, six world-matched CC0 HDRI IBL skies with gradient sky domes, 2048 PCSS key light, close-range contact shadows, animated ripples, and syllable-envelope articulated procedural puppetry with zero vignette.",
  criticalCategories: [
    "environment_world",
    "material_quality",
    "lighting",
    "ibl_reflections",
    "character_presentation",
    "animation_quality",
    "typography",
    "ui_hud"
  ],
  tiers: {
    low: { particles: 48, shadowMap: 1024, cascades: 1, textureMax: 1024 },
    medium: { particles: 96, shadowMap: 2048, cascades: 1, textureMax: 2048 },
    high: { particles: 144, shadowMap: 2048, cascades: 2, textureMax: 2048 },
    ultra: { particles: 192, shadowMap: 2048, cascades: 2, textureMax: 2048 }
  }
};

export const direction: GameArtDirection = defineArtDirection(directionSpec);
export default direction;
