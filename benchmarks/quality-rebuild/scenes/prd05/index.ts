/**
 * Lane prd05 scene index (C-30). Five optimized-pipeline scenes — every object
 * loads a `derived/` GLB produced by `tools/asset-optimize` (meshopt +
 * KHR_mesh_quantization + KHR_texture_basisu), so both engines exercise the
 * real decode path: Aura via the C-16 registry + `A3D_QR_ASSETS`, three via
 * GLTFLoader + MeshoptDecoder + KTX2Loader.
 */
import type { BenchSceneRegistration } from "../../shared/registry";
import { RESOLUTION } from "../../shared/types";
import type { Prd05SceneSpec } from "./spec";

const T = 1.25;
const base = {
  resolution: RESOLUTION,
  toneMapping: "aces-filmic",
  exposure: 1,
  time: T,
  settleFrames: 4,
  owner: "prd05",
  referenceProfile: "contract",
  masks: ["object-id"],
  primaryRegion: "subject",
  primaryCriterion: "asset rendered with released pipeline output",
  brokenControls: [],
  qrFlags: ["assets"]
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

export const prd05SceneSpecs: Readonly<Record<string, Prd05SceneSpec>> = {
  "prd05-optimized-damaged-helmet": {
    ...base,
    id: "prd05-optimized-damaged-helmet",
    index: 501,
    title: "Optimized damaged helmet (meshopt + KTX2)",
    purpose:
      "DamagedHelmet re-derived by the §6.3 pipeline: meshopt-compressed, quantized, UASTC/ETC1S textures. Both engines must decode EXT_meshopt_compression + KHR_mesh_quantization + KHR_texture_basisu and render the PBR maps intact.",
    camera: { position: [0, 0, 3.4], target: [0, 0, 0], fov: 34, near: 0.05, far: 50 },
    background: { kind: "color", color: "#202327" },
    lights: [
      { kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.45 },
      sun(2.2, [3, 4, 4])
    ],
    objects: [
      { kind: "model", name: "damaged-helmet", asset: "damagedHelmet", position: [0, 0, 0], castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "optimized-glb-decode"
  },

  "prd05-optimized-pbr-product": {
    ...base,
    id: "prd05-optimized-pbr-product",
    index: 502,
    title: "Optimized PBR product shot (antique camera)",
    purpose:
      "AntiqueCamera optimized: many PBR materials survive weld/dedup/tangents/KTX2 without map loss or facet artifacts; the product-lighting look must match across engines.",
    camera: { position: [0.4, 0.55, 3.1], target: [0, 0.35, 0], fov: 36, near: 0.05, far: 50 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#26292d", intensity: 1.0 },
    environment: { hdri: "studioSmall08", intensity: 1.0, rotation: 0 },
    lights: [sun(1.8, [3, 4, 2])],
    objects: [
      { kind: "model", name: "antique-camera", asset: "antiqueCamera", position: [0, -0.4, 0], scale: 2.4, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "optimized-pbr-materials"
  },

  "prd05-optimized-skinned": {
    ...base,
    id: "prd05-optimized-skinned",
    index: 503,
    title: "Optimized skinned characters",
    purpose:
      "Soldier + CesiumMan + Fox through hero-character: skinned attributes are never quantized (positions stay float) while other attributes compress; bind poses stay faithful across engines.",
    camera: { position: [0, 1.1, 5.4], target: [0, 0.85, 0], fov: 40, near: 0.05, far: 60 },
    background: { kind: "color", color: "#23262a" },
    lights: [
      { kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.5 },
      sun(2.0, [3, 5, 3])
    ],
    objects: [
      { kind: "model", name: "soldier", asset: "soldier", position: [-2.4, 0, 0], scale: 1.4, castShadow: false, receiveShadow: false },
      { kind: "model", name: "cesium-man", asset: "cesiumMan", position: [0, 0, 0], scale: 1.4, castShadow: false, receiveShadow: false },
      { kind: "model", name: "fox", asset: "fox", position: [2.2, 0, 0.4], scale: 0.02, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "optimized-skinned-bind-pose"
  },

  "prd05-optimized-outdoor": {
    ...base,
    id: "prd05-optimized-outdoor",
    index: 504,
    title: "Optimized outdoor props",
    purpose:
      "propRockA/propRockB catalog GLBs re-optimized (30k/10k tris): join + resize + meshopt shrink download bytes while silhouette + shading hold under outdoor sun.",
    camera: { position: [0.6, 0.9, 6.2], target: [0, 0.4, 0], fov: 42, near: 0.05, far: 80 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#2b2e33", intensity: 0.9 },
    environment: { hdri: "studioSmall08", intensity: 0.85, rotation: 0 },
    lights: [sun(2.4, [4, 6, 3])],
    objects: [
      { kind: "model", name: "rock-a", asset: "rockA", position: [-1.6, -0.2, 0], scale: 0.012, castShadow: false, receiveShadow: false },
      { kind: "model", name: "rock-b", asset: "rockB", position: [1.7, -0.3, -0.6], scale: 0.012, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "optimized-outdoor-silhouette"
  },

  "prd05-optimized-game-scene": {
    ...base,
    id: "prd05-optimized-game-scene",
    index: 505,
    title: "Optimized game composite",
    purpose:
      "A mixed game tableau — crate + rocks + a skinned soldier — all from optimized GLBs. Exercises mixed profiles (prop-small vs hero-character) in one scene and multiple decode streams per frame.",
    camera: { position: [0, 1.3, 6.8], target: [0, 0.5, 0], fov: 44, near: 0.05, far: 80 },
    background: { kind: "color", color: "#1d2126" },
    lights: [
      { kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.55 },
      sun(2.0, [-3, 5, 4])
    ],
    objects: [
      { kind: "model", name: "crate-1", asset: "crate", position: [-1.9, 0, 0], castShadow: false, receiveShadow: false },
      { kind: "model", name: "crate-2", asset: "crate", position: [-1.0, 0, -0.8], rotation: [0, 0.6, 0], castShadow: false, receiveShadow: false },
      { kind: "model", name: "rock-left", asset: "rockA", position: [-3.2, -0.2, -1.0], scale: 0.010, castShadow: false, receiveShadow: false },
      { kind: "model", name: "rock-right", asset: "rockB", position: [3.0, -0.3, -0.7], scale: 0.010, castShadow: false, receiveShadow: false },
      { kind: "model", name: "soldier", asset: "soldier", position: [1.0, 0, 0.4], scale: 1.4, castShadow: false, receiveShadow: false }
    ],
    primaryCriterion: "optimized-mixed-profiles"
  },

  "prd05-asset-lod-transition": {
    ...base,
    id: "prd05-asset-lod-transition",
    index: 506,
    title: "LOD transition dolly (hero vehicle ×3)",
    purpose:
      "Optimized courier sedan at 5/25/80 m over a 120-frame dolly — the MSFT_lod chain written by `assets optimize` must switch levels under Aura's `A3D_QR_ASSETS_LOD` selector and the lane's three-side loader plugin alike. Phase 5 re-points this scene at the library `vehicles/road` hero car.",
    camera: { position: [0, 1.8, 0], target: [4, 0.4, -25], fov: 50, near: 0.05, far: 200 },
    strip: { frames: 120, intervalMs: 33, orbitDegrees: 8 },
    background: { kind: "hdri", hdri: "studioSmall08", fallbackColor: "#2b2e33", intensity: 0.9 },
    environment: { hdri: "studioSmall08", intensity: 0.8, rotation: 0 },
    lights: [
      { kind: "ambient", name: "fill", color: "#ffffff", intensity: 0.35 },
      sun(2.2, [4, 6, 3])
    ],
    objects: [
      { kind: "primitive", name: "ground", shape: "plane", position: [4, -0.02, -40], size: [200, 1, 200], material: { color: "#2e3236", roughness: 0.95, metalness: 0 }, castShadow: false, receiveShadow: true },
      { kind: "model", name: "sedan-near-5m", asset: "courierSedan", position: [0, 0, -5], rotation: [0, 0.55, 0], castShadow: false, receiveShadow: false },
      { kind: "model", name: "sedan-mid-25m", asset: "courierSedan", position: [4, 0, -25], rotation: [0, 0.4, 0], castShadow: false, receiveShadow: false },
      { kind: "model", name: "sedan-far-80m", asset: "courierSedan", position: [10, 0, -80], rotation: [0, 0.25, 0], castShadow: false, receiveShadow: false }
    ],
    qrFlags: ["assets", "assets.lod"],
    primaryCriterion: "msft-lod-transition"
  }
};

export const scenes: readonly BenchSceneRegistration[] = Object.values(prd05SceneSpecs).map((spec) => ({
  id: spec.id,
  spec,
  status: "active"
}));
