// Wonder World art direction contract (C-35, Aura3D 5.5.1).
// Validated via `defineArtDirection` and audited across all 6 Wonder World storybook dioramas
// in `tests/unit/stage/art-direction.test.ts`, which writes `art/direction.audit.json`.
import { defineArtDirection, type ArtAssetRole, type GameArtDirection } from "@aura3d/engine/game/art";
import { MODEL_KEYS, type ModelKey } from "../src/aura-assets.js";
import { WONDER_VFX } from "../src/scenes/vfx-presets.js";

const HERO_KEYS: ReadonlySet<ModelKey> = new Set([
  "momo",
  "lulu",
  "sheru",
  "peeko",
  "lumi"
]);

const CHARACTER_KEYS: ReadonlySet<ModelKey> = new Set([
  "teddy",
  "robot",
  "cow",
  "sheep",
  "duck",
  "horse",
  "bird",
  "butterfly"
]);

const VEHICLE_KEYS: ReadonlySet<ModelKey> = new Set([
  "gogo",
  "gogoCarriage",
  "car"
]);

const WORLD_KEYS: ReadonlySet<ModelKey> = new Set([
  "barn",
  "station",
  "tunnel",
  "house",
  "tree"
]);

const SET_DRESSING_KEYS: ReadonlySet<ModelKey> = new Set([
  "flower",
  "flowerBud",
  "bush",
  "bed",
  "sink",
  "table",
  "chair",
  "cushion",
  "toyBox",
  "bench",
  "stompStone",
  "cloud",
  "sun"
]);

function assetEntryForKey(assetKey: ModelKey): ArtAssetRole {
  if (HERO_KEYS.has(assetKey)) {
    return {
      role: "hero",
      assetKey,
      minTriangles: 2000,
      maxTriangles: 80000,
      textureSet: "BC+N",
      maxTextureSize: 2048
    };
  }
  if (CHARACTER_KEYS.has(assetKey)) {
    return {
      role: "character",
      assetKey,
      minTriangles: 2000,
      maxTriangles: 60000,
      textureSet: "BC+N",
      maxTextureSize: 2048
    };
  }
  if (VEHICLE_KEYS.has(assetKey)) {
    return {
      role: "vehicle",
      assetKey,
      minTriangles: 2000,
      maxTriangles: 80000,
      textureSet: "BC+N",
      maxTextureSize: 2048
    };
  }
  if (WORLD_KEYS.has(assetKey)) {
    return {
      role: "world",
      assetKey,
      minTriangles: 2000,
      maxTriangles: 80000,
      textureSet: "BC+N",
      maxTextureSize: 2048
    };
  }
  if (SET_DRESSING_KEYS.has(assetKey)) {
    return {
      role: "set-dressing",
      assetKey,
      maxTriangles: 50000,
      textureSet: "BC+N",
      maxTextureSize: 2048
    };
  }
  return {
    role: "prop",
    assetKey,
    maxTriangles: 50000,
    textureSet: "BC+N",
    maxTextureSize: 2048
  };
}

const directionSpec: GameArtDirection = {
  id: "wonder-world",
  genre: "maze-arcade",
  fantasy:
    "A handcrafted clay-and-beechwood picture-book diorama stage where toddler friends explore warm morning sets together.",
  rebuildTier: "S-world",
  wave: 4,
  references: [
    {
      file: "src/scenes/LOOK-BRIEF.md",
      source: "genre comparable: stop-motion clay and painted beechwood miniature picture-book sets lit by soft morning daylight",
      licence: "reference-only",
      why: "Matte clay characters with crisp sclera/pupil contrast, warm beechwood bevels, and grounded contact shadows on raised diorama islands"
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
      why: "Every character and tap prop sits flush on a flat play stage framed by lush instanced meadow blades, pebbles, clouds, and pond ripples"
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
  assets: MODEL_KEYS.map(assetEntryForKey),
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
    "Warm storybook miniature clay-and-beechwood diorama lighting: six world-matched CC0 HDRI IBL skies with a single 2048 PCSS key light, rim separation, soft contact shadows, and syllable-envelope articulated puppetry with zero vignette.",
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
