/**
 * PRD-04 lane scene index (C-30). Ten scenes, one per §16.1 row. All fields a
 * translator cannot express are recorded in its capability log, never tuned.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { RESOLUTION } from "../../shared/types";
import type { Prd04SceneSpec } from "./spec";

const T = 1.25;
const base = {
  resolution: RESOLUTION,
  toneMapping: "aces-filmic",
  exposure: 1,
  time: T,
  settleFrames: 4,
  owner: "prd04",
  referenceProfile: "contract",
  masks: ["object-id"],
  primaryRegion: "subject",
  qrFlags: ["materials"]
} as const;

const sun = (intensity: number, position: [number, number, number]) =>
  ({
    kind: "directional",
    name: "key",
    color: "#fff4e5",
    intensity,
    position,
    target: [0, 0, 0],
    castShadow: false
  }) as const;

export const prd04SceneSpecs: Record<string, Prd04SceneSpec> = {
  "prd04-texture-transform": {
    ...base,
    id: "prd04-texture-transform",
    index: 401,
    title: "KHR_texture_transform grid",
    purpose: "All 9 tiles show the \"correct\" arrow — per-slot UV transform applied to every texture channel.",
    camera: { position: [0, 0, 4.6], target: [0, 0, 0], fov: 38, near: 0.1, far: 50 },
    background: { kind: "color", color: "#202226" },
    lights: [{ kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.6 }, sun(2.0, [2, 4, 4])],
    objects: [
      { kind: "model", name: "transform-grid", asset: "textureTransformTest", position: [0, 0, 0], castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "texture-transform"
  },
  "prd04-normal-tangent": {
    ...base,
    id: "prd04-normal-tangent",
    index: 402,
    title: "Normal / mirrored-UV tangent parity",
    purpose: "Mirrored-UV normal maps light consistently; halves differ by <=2 dE when tangents are correct.",
    camera: { position: [0, 0.15, 5.0], target: [0, 0, 0], fov: 36, near: 0.1, far: 50 },
    background: { kind: "color", color: "#232629" },
    lights: [{ kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.25 }, sun(2.5, [3, 4, 4])],
    objects: [
      { kind: "model", name: "normal-tangent", asset: "normalTangentTest", position: [-1.75, 0, 0], castShadow: false, receiveShadow: false },
      {
        kind: "model",
        name: "normal-tangent-mirror",
        asset: "normalTangentMirrorTest",
        position: [1.75, 0, 0],
        castShadow: false,
        receiveShadow: false
      }
    ],
    primaryCriterion: "normal-tangent"
  },
  "prd04-iridescence": {
    ...base,
    id: "prd04-iridescence",
    index: 403,
    title: "Thin-film iridescence lamp",
    purpose: "Thin-film hue shifts with view angle and thickness map (KHR_materials_iridescence).",
    camera: { position: [0, 0.75, 2.4], target: [0, 0.35, 0], fov: 34, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#2a2d31", intensity: 1.0 },
    environment: { hdri: "studioSmall08", intensity: 1.0, rotation: 0 },
    lights: [sun(1.5, [3, 4, 2])],
    objects: [
      { kind: "model", name: "iridescence-lamp", asset: "iridescenceLamp", position: [0, -0.55, 0], scale: 5, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "iridescence-hue-shift"
  },
  "prd04-anisotropy": {
    ...base,
    id: "prd04-anisotropy",
    index: 404,
    title: "Anisotropic highlights",
    purpose: "Elongated highlights follow the anisotropy direction texture (KHR_materials_anisotropy).",
    camera: { position: [0, 0.5, 2.7], target: [0, 0.1, 0], fov: 40, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#26292d", intensity: 0.9 },
    environment: { hdri: "studioSmall08", intensity: 0.8, rotation: 0 },
    lights: [sun(2.5, [2, 3, 3])],
    objects: [
      { kind: "model", name: "barn-lamp", asset: "anisotropyBarnLamp", position: [-0.55, -0.6, 0], scale: 6, castShadow: false, receiveShadow: false },
      {
        kind: "model",
        name: "rotation-discs",
        asset: "anisotropyRotationTest",
        position: [1.35, -0.55, -0.4],
        scale: 0.16,
        castShadow: false,
        receiveShadow: false
      }
    ],
    primaryCriterion: "anisotropy-direction"
  },
  "prd04-transmission": {
    ...base,
    id: "prd04-transmission",
    index: 410,
    title: "Transmission capture target (P4-4)",
    purpose: "KHR_materials_transmission drives the lane's transmission capture target (CompareTransmission sample).",
    camera: { position: [0, 0.5, 3.1], target: [0, 0.3, 0], fov: 38, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#26292d", intensity: 1.0 },
    environment: { hdri: "studioSmall08", intensity: 1.0, rotation: 0 },
    lights: [sun(2.0, [2, 4, 3])],
    objects: [
      { kind: "model", name: "compare-transmission", asset: "compareTransmission", position: [0, -0.55, 0], scale: 1.6, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "transmission-capture-active"
  },
  "prd04-dispersion": {
    ...base,
    id: "prd04-dispersion",
    index: 405,
    title: "Chromatic dispersion prisms",
    purpose: "Chromatic separation through prisms (KHR_materials_dispersion, High tier).",
    camera: { position: [0, 0.3, 1.6], target: [0, 0.05, 0], fov: 36, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#24272b", intensity: 1.2 },
    environment: { hdri: "studioSmall08", intensity: 1.2, rotation: 0 },
    lights: [sun(3.0, [3, 4, 2])],
    objects: [
      { kind: "model", name: "dispersion-prisms", asset: "dispersionTest", position: [0, -0.3, 0], scale: 6, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "dispersion-fringes"
  },
  "prd04-variants": {
    ...base,
    id: "prd04-variants",
    index: 406,
    title: "KHR_materials_variants selection",
    purpose: "The same shoe rendered with its three authored variants (midnight / beach / street).",
    camera: { position: [0, 0.45, 2.3], target: [0, 0.1, 0], fov: 40, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#2b2d30", intensity: 1.0 },
    environment: { hdri: "studioSmall08", intensity: 1.0, rotation: 0 },
    lights: [sun(2.0, [3, 5, 3])],
    objects: [
      {
        kind: "model",
        name: "shoe-midnight",
        asset: "materialsVariantsShoe",
        position: [-0.8, -0.35, 0],
        scale: 4.5,
        variant: "midnight",
        castShadow: false,
        receiveShadow: false
      },
      {
        kind: "model",
        name: "shoe-beach",
        asset: "materialsVariantsShoe",
        position: [0, -0.35, 0],
        scale: 4.5,
        variant: "beach",
        castShadow: false,
        receiveShadow: false
      },
      {
        kind: "model",
        name: "shoe-street",
        asset: "materialsVariantsShoe",
        position: [0.8, -0.35, 0],
        scale: 4.5,
        variant: "street",
        castShadow: false,
        receiveShadow: false
      }
    ],
    primaryCriterion: "variant-switch"
  },
  "prd04-ktx2": {
    ...base,
    id: "prd04-ktx2",
    index: 407,
    title: "KTX2/BasisU vs PNG reference",
    purpose: "Base colour not washed out vs PNG: UASTC every map (reference), ETC1S variant informational.",
    camera: { position: [0, 0.5, 4.4], target: [0, 0, 0], fov: 38, near: 0.1, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#26292d", intensity: 0.9 },
    environment: { hdri: "studioSmall08", intensity: 1.0, rotation: 0 },
    lights: [sun(2.0, [3, 4, 4])],
    objects: [
      { kind: "model", name: "helmet-png", asset: "damagedHelmet", position: [-1.4, 0, 0], castShadow: false, receiveShadow: false },
      { kind: "model", name: "helmet-uastc", asset: "damagedHelmetUastc", position: [0, 0, 0], castShadow: false, receiveShadow: false },
      { kind: "model", name: "helmet-etc1s", asset: "damagedHelmetEtc1s", position: [1.4, 0, 0], castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "ktx2-color-parity"
  },
  "prd04-tiled-ground": {
    ...base,
    id: "prd04-tiled-ground",
    index: 408,
    title: "Tiled ground at grazing angle",
    purpose: "No seams, no shimmer, anisotropic sharpness on a 40 m plane of 1 m CC0 tiles.",
    camera: { position: [0, 0.9, 6], target: [0, 0.35, -14], fov: 55, near: 0.05, far: 120 },
    background: { kind: "hdri", hdri: "autumnFieldPuresky", fallbackColor: "#39404a", intensity: 0.7 },
    environment: { hdri: "autumnFieldPuresky", intensity: 0.7, rotation: 0 },
    lights: [sun(3.0, [4, 6, 3])],
    objects: [
      {
        kind: "primitive",
        name: "tiled-ground",
        shape: "plane",
        size: [40, 1, 40],
        position: [0, 0, -8],
        material: { color: "#ffffff", roughness: 0.85, metalness: 0.6 },
        textureMaps: { textureSet: "metalPlates013", repeat: 40, anisotropy: "tier" },
        castShadow: false,
        receiveShadow: true
      }
    ],
    strip: { frames: 12, intervalMs: 50, orbitDegrees: 6 },
    primaryCriterion: "tiled-ground-shimmer"
  },
  "prd04-tinted-hero": {
    ...base,
    id: "prd04-tinted-hero",
    index: 409,
    title: "Texture detail retained under tint",
    purpose: "Meshy hero keeps authored maps under a color tint (S3; E2 regression target).",
    camera: { position: [0, 0.6, 3.6], target: [0, 0.1, 0], fov: 42, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#2a2c30", intensity: 0.9 },
    environment: { hdri: "studioSmall08", intensity: 0.9, rotation: 0 },
    lights: [{ kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.15 }, sun(2.2, [4, 5, 3])],
    objects: [
      {
        kind: "model",
        name: "tinted-van",
        asset: "courierVanMeshyV2Decimated",
        position: [-0.35, -0.45, 0],
        scale: 1.5,
        tint: { color: "#e85d75" },
        castShadow: false,
        receiveShadow: false
      },
      {
        kind: "model",
        name: "reference-aircraft",
        asset: "patrolAircraftMeshy",
        position: [1.35, -0.3, -1.4],
        scale: 1.1,
        castShadow: false,
        receiveShadow: false
      }
    ],
    primaryCriterion: "tinted-texture-retention"
  },
  "prd04-alpha-mask": {
    ...base,
    id: "prd04-alpha-mask",
    index: 410,
    title: "MASK alpha edges under MSAA",
    purpose: "Opaque/MASK/BLEND row renders authored cutouts; MASK edges stay correct under MSAA 4x.",
    camera: { position: [0, 0.7, 7.2], target: [0, 0.3, 0], fov: 44, near: 0.1, far: 60 },
    background: { kind: "hdri", hdri: "autumnFieldPuresky", fallbackColor: "#33383f", intensity: 0.8 },
    environment: { hdri: "autumnFieldPuresky", intensity: 0.8, rotation: 0 },
    lights: [sun(2.0, [3, 5, 4])],
    objects: [
      { kind: "model", name: "alpha-panels", asset: "alphaBlendModeTest", position: [0, -0.7, 0], castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "alpha-mask-edges"
  }
};

export const scenes: readonly BenchSceneRegistration[] = Object.values(prd04SceneSpecs).map((spec) => ({
  id: spec.id,
  spec
}));

export function getPrd04SceneSpec(id: string): Prd04SceneSpec {
  const spec = prd04SceneSpecs[id];
  if (!spec) throw new Error(`Unknown prd04 scene "${id}". Known: ${Object.keys(prd04SceneSpecs).join(", ")}`);
  return spec;
}
