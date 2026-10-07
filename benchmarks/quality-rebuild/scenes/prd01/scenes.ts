/**
 * PRD-01 lane scene specs (PRD-01 §17.3). Engine-agnostic content; adapters in
 * `aura3d/scenes/prd01` and `three/scenes/prd01` translate these to concrete
 * scenes. Region rects are normalized over the 1280x720 stage.
 */

import type { Prd01LaneSceneSpec, Prd01ShapeNode } from "./types";

const VEHICLE_WHEELS: readonly Prd01ShapeNode[] = ([
  ["wheel-fl", [-0.55, -0.24, 0.42]],
  ["wheel-fr", [0.55, -0.24, 0.42]],
  ["wheel-rl", [-0.55, -0.24, -0.42]],
  ["wheel-rr", [0.55, -0.24, -0.42]]
] as const).map(([id, position]) => ({
  id,
  shape: "cylinder",
  material: { color: "#1c1f24", roughness: 0.9, metalness: 0.05 },
  position: position as readonly [number, number, number],
  rotation: [Math.PI / 2, 0, 0],
  scale: [0.24, 0.16, 0.24]
}));

const HIERARCHY: Prd01LaneSceneSpec = {
  kind: "hierarchy",
  owner: "prd01",
  description:
    "Nested groups: a vehicle group (wheels mounted under a rotated+scaled transform) plus a scene-mounted sign group. " +
    "Built identically with three Object3D to test the C-06 scene graph.",
  referenceProfile: "contract",
  qrFlags: ["core"],
  primaryCriterion: "alpha-coverage mask IoU >= 0.98 with object centroid within 2 px",
  camera: { position: [0, 1.9, 5.4], target: [0, 0.62, 0], fov: 40 },
  background: "#10141c",
  lights: [
    { kind: "ambient", intensity: 0.5, color: "#cdd6e4" },
    { kind: "directional", intensity: 1.6, color: "#fff4e0", position: [3.2, 4.5, 2.6] }
  ],
  content: {
    kind: "hierarchy",
    groups: [
      {
        id: "vehicle",
        transform: { position: [-1.35, 0.62, 0], rotation: [0, 0.5, 0.1], scale: [1.35, 1.35, 1.35] },
        children: [
          {
            id: "vehicle-body",
            shape: "box",
            material: { color: "#c33b2f", roughness: 0.42, metalness: 0.35 },
            scale: [1.7, 0.42, 0.85],
            children: VEHICLE_WHEELS
          },
          {
            id: "vehicle-cabin",
            shape: "box",
            material: { color: "#7cc4de", roughness: 0.18, metalness: 0.2 },
            position: [0.12, 0.42, 0],
            scale: [0.85, 0.4, 0.72]
          }
        ]
      },
      {
        id: "sign",
        transform: { position: [1.6, 0, -0.4], rotation: [0, -0.38, 0] },
        children: [
          {
            id: "sign-pole",
            shape: "cylinder",
            material: { color: "#8a8f98", roughness: 0.5, metalness: 0.7 },
            position: [0, 0.8, 0],
            scale: [0.07, 1.6, 0.07]
          },
          {
            id: "sign-board-main",
            shape: "box",
            material: { color: "#2563eb", roughness: 0.55, metalness: 0.05 },
            position: [0, 1.55, 0],
            scale: [0.95, 0.55, 0.06]
          },
          {
            id: "sign-board-secondary",
            shape: "box",
            material: { color: "#22c55e", roughness: 0.55, metalness: 0.05 },
            position: [0, 1.0, 0],
            rotation: [0, 0.32, 0],
            scale: [0.7, 0.34, 0.05]
          }
        ]
      }
    ]
  },
  masks: [
    { id: "vehicle", description: "boot-mounted wheels + rotated/scaled vehicle group", rect: { x: 0.05, y: 0.15, w: 0.5, h: 0.7 } },
    { id: "sign", description: "scene-mounted sign group", rect: { x: 0.55, y: 0.15, w: 0.4, h: 0.7 } }
  ],
  metric: { name: "mask-iou", target: "IoU >= 0.98, centroid <= 2 px", regions: [] }
};

const TONEMAP_STOPS = Array.from({ length: 12 }, (_, index) => Math.pow(2, index - 4));

const TONEMAP: Prd01LaneSceneSpec = {
  kind: "tonemap-ramp",
  owner: "prd01",
  description:
    "Twelve emissive swatches at linear intensities 2^-4..2^7 plus an 18% grey patch, captured per " +
    "(operator, exposure) variant — the C-05 tonemap ruler.",
  referenceProfile: "contract",
  qrFlags: ["core"],
  primaryCriterion: "deltaE2000 <= 2 after sRGB encode; mean <= 1",
  camera: { position: [0, 0.6, 7.4], target: [0, 0.35, 0], fov: 34 },
  background: "#181818",
  lights: [{ kind: "ambient", intensity: 0.4, color: "#ffffff" }],
  content: {
    kind: "tonemap-ramp",
    emissiveStops: TONEMAP_STOPS,
    greyLevel: 0.18,
    operators: ["aces", "agx", "neutral"],
    exposures: [0.5, 1, 2]
  },
  masks: [
    { id: "ramp", description: "12-swatch emissive ramp", rect: { x: 0.07, y: 0.3, w: 0.86, h: 0.28 } },
    { id: "grey", description: "18% grey patch", rect: { x: 0.44, y: 0.66, w: 0.12, h: 0.16 } }
  ],
  metric: { name: "delta-e", target: "deltaE2000 <= 2, mean <= 1", regions: [] }
};

const BLEND: Prd01LaneSceneSpec = {
  kind: "blend-modes",
  owner: "prd01",
  description:
    "Five blend columns (normal, additive, multiply, screen, overlay): an opaque red quad behind a " +
    "0.85-opacity teal quad. Three uses real blending; Aura records which modes are still unwired.",
  referenceProfile: "contract",
  qrFlags: ["core"],
  primaryCriterion: "mean absolute difference <= 2/255 over the quad region",
  camera: { position: [0, 0.8, 6.4], target: [0, 0.5, 0], fov: 36 },
  background: "#202226",
  lights: [{ kind: "ambient", intensity: 1.2, color: "#ffffff" }],
  content: {
    kind: "blend-modes",
    modes: ["normal", "additive", "multiply", "screen", "overlay"],
    backColor: "#b02020",
    frontColor: "#20a8b0",
    frontOpacity: 0.85
  },
  masks: [
    { id: "quads", description: "five blend column pairs", rect: { x: 0.06, y: 0.24, w: 0.88, h: 0.52 } }
  ],
  metric: { name: "mad", target: "MAD <= 2/255", regions: [] }
};

const SPECULAR: Prd01LaneSceneSpec = {
  kind: "specular-aa",
  owner: "prd01",
  description:
    "Five chrome spheres (metalness 1, roughness 0.05) under a directional light orbiting the " +
    "azimuth — the C-17 specular AA probe; temporal sigma across the capture strip.",
  referenceProfile: "contract",
  qrFlags: ["core"],
  primaryCriterion: "temporal sigma <= 1.2x three, and <= 0.5x flag-off after the AA change",
  animated: true,
  camera: { position: [0, 1.25, 5.6], target: [0, 0.5, 0], fov: 38 },
  background: "#0d1015",
  lights: [
    { kind: "ambient", intensity: 0.22, color: "#96a4bd" },
    {
      kind: "directional",
      intensity: 2.6,
      color: "#ffffff",
      orbitCenter: [0, 2.2, 0],
      orbitRadius: 4.2,
      orbitPeriodSeconds: 4
    }
  ],
  content: { kind: "specular-aa", sphereCount: 5, metalness: 1, roughness: 0.05 },
  masks: [
    { id: "spheres", description: "chrome sphere row", rect: { x: 0.1, y: 0.3, w: 0.8, h: 0.42 } }
  ],
  metric: { name: "temporal-sigma", target: "sigma <= 1.2x three; <= 0.5x flag-off", regions: [] }
};

const CATALOG: Prd01LaneSceneSpec = {
  kind: "primitive-catalog",
  owner: "prd01",
  description:
    "Every primitives.* shape in one row (box, sphere, plane, cylinder, capsule, torus) with the " +
    "same clay material — silhouette IoU plus cap luma/normal checks on cylinder+capsule.",
  referenceProfile: "contract",
  qrFlags: ["core"],
  primaryCriterion: "mask IoU >= 0.98 (caps >= 0.97), cap luma +-10%, cap normal within 10 deg",
  camera: { position: [0, 1.5, 6.8], target: [0, 0.6, 0], fov: 36 },
  background: "#12161d",
  lights: [
    { kind: "ambient", intensity: 0.55, color: "#d8dee9" },
    { kind: "directional", intensity: 1.4, color: "#fff1d6", position: [2.8, 4, 3] }
  ],
  content: { kind: "primitive-catalog", shapes: ["box", "sphere", "plane", "cylinder", "capsule", "torus"] },
  masks: [
    { id: "catalog", description: "six primitives in a row", rect: { x: 0.04, y: 0.22, w: 0.92, h: 0.56 } },
    { id: "cylinder-cap", description: "cylinder cap region", rect: { x: 0.52, y: 0.2, w: 0.16, h: 0.2 } },
    { id: "capsule-cap", description: "capsule cap region", rect: { x: 0.66, y: 0.2, w: 0.16, h: 0.2 } }
  ],
  metric: { name: "mask-iou", target: "IoU >= 0.98; caps >= 0.97; luma +-10%; normal <= 10 deg", regions: [] }
};

const THROUGHPUT: Prd01LaneSceneSpec = {
  kind: "draw-throughput",
  owner: "prd01",
  description:
    "Submission-pressure scene: a 50x40 grid of unique-material boxes (2000 programs-worth of state), " +
    "plus 10k instanced boxes behind. Skinned humans declared but pending rigged assets.",
  referenceProfile: "contract",
  qrFlags: ["core"],
  primaryCriterion: "submission pressure under A3D_QR_CORE=v2 (Phase 6 perf table)",
  camera: { position: [0, 9.5, 13.5], target: [0, 0.4, 0], fov: 46 },
  background: "#0e1218",
  lights: [
    { kind: "ambient", intensity: 0.6, color: "#c7d2e8" },
    { kind: "directional", intensity: 1.2, color: "#ffffff", position: [4, 8, 5] }
  ],
  content: {
    kind: "draw-throughput",
    uniqueMaterials: { rows: 40, cols: 50 },
    instanced: { shape: "box", count: 10000, cols: 100, spacing: 0.62 },
    skinned: { requested: 50 }
  },
  masks: [
    { id: "grid", description: "unique-material grid", rect: { x: 0.04, y: 0.45, w: 0.92, h: 0.5 } },
    { id: "instanced", description: "10k instanced boxes", rect: { x: 0.04, y: 0.02, w: 0.92, h: 0.42 } }
  ],
  metric: { name: "throughput", target: "Phase 6 perf table", regions: [] }
};

export const PRD01_SCENE_SPECS: Readonly<Record<string, Prd01LaneSceneSpec>> = {
  "prd01-scene-graph-hierarchy": HIERARCHY,
  "prd01-tonemap-exposure-ramp": TONEMAP,
  "prd01-blend-modes": BLEND,
  "prd01-specular-aa": SPECULAR,
  "prd01-primitive-catalog": CATALOG,
  "prd01-draw-throughput": THROUGHPUT
};
