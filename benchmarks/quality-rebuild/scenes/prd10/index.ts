/**
 * Lane prd10 scene index (CONTRACTS.md §3.8). Scene ids are `<owner>-<slug>`.
 *
 * PRD-10 T1.13 — the nine lane scenes of §16.1. Today every spec is authored
 * from base primitives (the world runtime lands in Phases 2-6); each scene
 * declares `qrFlags: ["world"]` so the C-30 capture matrix exercises both
 * `world` and `none` arms of S16 flag-off identity. Fields an engine cannot
 * express yet (wind, Gerstner displacement, biome resolve, CDLOD) are recorded
 * in that adapter's capability log, not faked.
 */
import { cityBuildings, instancingGrid } from "../../shared/procedural";
import type { BenchSceneRegistration } from "../../shared/registry";
import {
  RESOLUTION,
  type LightSpec,
  type MaterialSpec,
  type ObjectSpec,
  type PrimitiveObjectSpec,
  type SceneSpec,
  type ShadowSpec,
  type TransformSpec,
  type Vec3
} from "../../shared/types";

const CAPTURE_TIME = 1.25;
const SETTLE_FRAMES = 4;

function primitive(
  name: string,
  shape: PrimitiveObjectSpec["shape"],
  size: Vec3,
  position: Vec3,
  material: MaterialSpec,
  extra: Partial<Pick<PrimitiveObjectSpec, "rotation" | "scale" | "castShadow" | "receiveShadow">> = {}
): PrimitiveObjectSpec {
  return {
    kind: "primitive",
    name,
    shape,
    size,
    position,
    material,
    castShadow: extra.castShadow ?? shape !== "plane",
    receiveShadow: extra.receiveShadow ?? true,
    ...(extra.rotation ? { rotation: extra.rotation } : {}),
    ...(extra.scale !== undefined ? { scale: extra.scale } : {})
  };
}

function sun(intensity: number, position: Vec3, castShadow: boolean, color = "#fff4e5"): LightSpec {
  return { kind: "directional", name: "sun", color, intensity, position, target: [0, 0, 0], castShadow };
}

const shadows = (extent: number): ShadowSpec => ({
  mapSize: 2048,
  type: "pcf-soft",
  directionalExtent: extent,
  bias: -0.0005,
  normalBias: 0.02
});

function base(id: string, index: number, title: string, purpose: string): Pick<SceneSpec, "id" | "index" | "title" | "purpose" | "resolution" | "toneMapping" | "exposure" | "time" | "settleFrames" | "owner" | "qrFlags"> {
  return {
    id,
    index,
    title,
    purpose,
    resolution: RESOLUTION,
    toneMapping: "aces-filmic",
    exposure: 1,
    time: CAPTURE_TIME,
    settleFrames: SETTLE_FRAMES,
    owner: "prd10",
    qrFlags: ["world"]
  };
}

const grass: MaterialSpec = { color: "#5d7a3a", roughness: 0.95, metalness: 0 };
const rock: MaterialSpec = { color: "#6b6a66", roughness: 0.9, metalness: 0 };
const sand: MaterialSpec = { color: "#c9b891", roughness: 0.95, metalness: 0 };
const water: MaterialSpec = { color: "#2f6f8f", roughness: 0.15, metalness: 0, opacity: 0.85 };
const bark: MaterialSpec = { color: "#4d3b28", roughness: 0.95, metalness: 0 };
const foliage: MaterialSpec = { color: "#3f6b2f", roughness: 0.9, metalness: 0 };

// ---------------------------------------------------------------- terrain --

/** Low hills built from instanced cylinders; replaces the terrain node until Phase 2 lands it. */
function hills(seed: number, count: number, radius: number): ObjectSpec {
  const rng = (() => {
    let s = seed;
    return () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
  })();
  const transforms: TransformSpec[] = [];
  const colors: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = rng() * Math.PI * 2;
    const r = 8 + rng() * radius;
    const h = 1.5 + rng() * 6;
    transforms.push({ position: [Math.cos(angle) * r, h / 2 - 0.5, Math.sin(angle) * r], rotation: [0, rng() * Math.PI, 0], scale: [1 + rng() * 3, h, 1 + rng() * 3] });
    colors.push(rng() > 0.55 ? "#5d7a3a" : "#6b6a66");
  }
  return { kind: "instanced", name: "terrain hills", shape: "cylinder", size: [1, 1, 1], material: rock, transforms, colors, castShadow: true, receiveShadow: true };
}

const sceneSpecs: readonly SceneSpec[] = [
  {
    ...base(
      "prd10-terrain-flyover",
      101,
      "Terrain flyover",
      "Low camera dolly over undulating ground (S1, S2: height agreement, crack/luma popping). Terrain is stand-in instanced hills until the Phase 2 terrain node exists."
    ),
    camera: { position: [0, 14, 42], target: [0, 2, 0], fov: 50, near: 0.1, far: 600 },
    background: { kind: "color", color: "#a8c8e8" },
    lights: [sun(2.6, [30, 45, 20], true)],
    objects: [
      primitive("terrain ground", "plane", [220, 1, 220], [0, -0.5, 0], grass, { castShadow: false }),
      hills(11, 60, 90)
    ],
    shadows: shadows(120),
    fog: { color: "#a8c8e8", density: 0.0016 },
    masks: ["sky", "object-id"],
    primaryCriterion: "S2",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-terrain-layers",
      102,
      "Terrain layers",
      "S3 discriminant: 4+ terrain layer regions with visibly different albedo (rock vs grass mean ΔE2000 ≥ 10; per-pixel luma std-dev ≥ 0.03). Stand-in: tiled material regions."
    ),
    camera: { position: [0, 26, 34], target: [0, 0, 0], fov: 45, near: 0.1, far: 400 },
    background: { kind: "color", color: "#b8cfdd" },
    lights: [sun(2.4, [-20, 40, 25], true)],
    objects: [
      primitive("grass layer", "plane", [60, 1, 30], [-16, 0, -8], grass, { castShadow: false }),
      primitive("rock layer", "plane", [60, 1, 30], [16, 0.01, 8], rock, { castShadow: false }),
      primitive("sand layer", "plane", [60, 1, 30], [-16, 0.02, 16], sand, { castShadow: false }),
      primitive("scree layer", "plane", [60, 1, 30], [16, 0.03, -16], { color: "#8d8578", roughness: 1, metalness: 0 }, { castShadow: false }),
      hills(23, 24, 40)
    ],
    shadows: shadows(80),
    fog: { color: "#b8cfdd", density: 0.002 },
    masks: ["sky", "object-id"],
    brokenControls: ["flat-sky", "albedo-only"],
    primaryCriterion: "S3",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-forest-wind",
      103,
      "Forest wind",
      "S7 wind motion in instanced foliage; a capture strip must show ≥1% pixels moving in the foliage mask over 1 s. Trees are stand-in instanced trunks+crowns until the scatter/wind path lands."
    ),
    camera: { position: [0, 4, 18], target: [0, 3, 0], fov: 55, near: 0.1, far: 300 },
    background: { kind: "color", color: "#9db8cf" },
    lights: [sun(2.2, [15, 30, 10], true)],
    objects: [
      primitive("forest floor", "plane", [80, 1, 80], [0, 0, 0], { color: "#55603c", roughness: 1, metalness: 0 }, { castShadow: false }),
      ((): ObjectSpec => {
        const grid = instancingGrid(160, 31);
        return {
          kind: "instanced",
          name: "tree trunks",
          shape: "cylinder",
          size: [0.16, 1, 0.16],
          material: bark,
          transforms: grid.transforms.map((t) => ({ ...t, scale: [1, 3 + ((t.scale as Vec3)[1] ?? 1), 1] })),
          castShadow: true,
          receiveShadow: true
        };
      })(),
      ((): ObjectSpec => {
        const grid = instancingGrid(160, 31);
        return {
          kind: "instanced",
          name: "tree crowns",
          shape: "sphere",
          size: [1, 1, 1],
          material: foliage,
          transforms: grid.transforms.map((t) => ({ position: [t.position[0], t.position[1] + 3.4, t.position[2]] as Vec3, scale: [1.6, 1.9, 1.6] as Vec3 })),
          colors: grid.colors,
          castShadow: true,
          receiveShadow: false
        };
      })()
    ],
    shadows: shadows(60),
    fog: { color: "#9db8cf", density: 0.006 },
    strip: { frames: 8, intervalMs: 125, orbitDegrees: 2 },
    masks: ["object-id"],
    primaryCriterion: "S7",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-meadow-grass",
      104,
      "Meadow grass",
      "S6-scale vegetation: a dense grass stand-in (10k instanced blades) exercising the instancing hot path; real grass blades land with the Phase 4 grass module."
    ),
    camera: { position: [6, 1.6, 10], target: [0, 0.4, 0], fov: 55, near: 0.05, far: 120 },
    background: { kind: "color", color: "#aecbe4" },
    lights: [sun(2.0, [-10, 22, 14], true)],
    objects: [
      primitive("meadow floor", "plane", [60, 1, 60], [0, 0, 0], { color: "#4c6633", roughness: 1, metalness: 0 }, { castShadow: false }),
      {
        kind: "instanced",
        name: "grass blades",
        shape: "box",
        size: [0.02, 0.5, 0.02],
        material: { color: "#ffffff", roughness: 0.95, metalness: 0 },
        transforms: instancingGrid(10000, 7).transforms,
        colors: instancingGrid(10000, 7).colors,
        castShadow: false,
        receiveShadow: false
      }
    ],
    fog: { color: "#aecbe4", density: 0.004 },
    strip: { frames: 8, intervalMs: 125, orbitDegrees: 0 },
    masks: ["object-id"],
    primaryCriterion: "S6",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-coast-water",
      105,
      "Coast water",
      "S9/S10 water stand-in: a translucent water plane meets a sand strip; reflection/refraction modes land with the Phase 3 water module and are recorded as capability gaps until then."
    ),
    camera: { position: [0, 8, 26], target: [0, 0, -6], fov: 50, near: 0.1, far: 500 },
    background: { kind: "color", color: "#b6d4ea" },
    lights: [sun(2.4, [25, 35, 15], true)],
    objects: [
      primitive("sea", "plane", [140, 1, 90], [0, 0.4, -55], water, { castShadow: false }),
      primitive("beach", "plane", [140, 1, 40], [0, 0, 8], sand, { castShadow: false }),
      primitive("headland", "box", [30, 7, 14], [-38, 3.5, -16], rock, {}),
      hills(41, 10, 55)
    ],
    shadows: shadows(90),
    fog: { color: "#b6d4ea", density: 0.0025 },
    masks: ["sky", "object-id"],
    primaryCriterion: "S9",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-city-street",
      106,
      "City street",
      "Kit/placement stand-in (S11): seeded procedural blocks approximating a street canyon; the real city kit lands in Phase 5."
    ),
    camera: { position: [0, 2.2, 18], target: [0, 4, -10], fov: 55, near: 0.1, far: 400 },
    background: { kind: "color", color: "#b9c9d8" },
    lights: [sun(2.5, [-18, 42, 20], true)],
    objects: [
      primitive("street", "plane", [14, 1, 60], [0, 0, -8], { color: "#3c3f44", roughness: 0.98, metalness: 0 }, { castShadow: false }),
      ...cityBuildings(4, 3, 91).map((b, i): ObjectSpec => primitive(`building ${i}`, "box", b.size as Vec3, b.position as Vec3, { color: b.color, roughness: 0.85, metalness: 0.05 }, {}))
    ],
    shadows: shadows(70),
    fog: { color: "#b9c9d8", density: 0.003 },
    masks: ["object-id", "sky"],
    primaryCriterion: "S11",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-interior-room",
      107,
      "Interior room",
      "Interior biome stand-in (interior-warm): enclosed room lit by a warm key light; used by the biome resolver as the interior signal until real env rigs land."
    ),
    camera: { position: [0, 2.2, 7.5], target: [0, 1.6, 0], fov: 55, near: 0.05, far: 60 },
    background: { kind: "color", color: "#1c1a17" },
    lights: [
      { kind: "point", name: "warm key", color: "#ffd9a0", intensity: 60, position: [2.5, 3.4, 2], range: 0 },
      { kind: "ambient", name: "fill", color: "#4a4038", intensity: 0.35 }
    ],
    objects: [
      primitive("floor", "plane", [16, 1, 16], [0, 0, 0], { color: "#6b5340", roughness: 0.9, metalness: 0 }, { castShadow: false }),
      primitive("back wall", "box", [16, 6, 0.3], [0, 3, -8], { color: "#8a7a68", roughness: 0.95, metalness: 0 }, {}),
      primitive("side wall", "box", [0.3, 6, 16], [-8, 3, 0], { color: "#8a7a68", roughness: 0.95, metalness: 0 }, {}),
      primitive("table", "box", [2.6, 0.12, 1.4], [0, 1.1, -2], { color: "#5c4630", roughness: 0.6, metalness: 0 }, {}),
      primitive("chair", "box", [0.5, 0.5, 0.5], [1.2, 0.25, -1], { color: "#7a4030", roughness: 0.85, metalness: 0 }, {}),
      primitive("lamp", "sphere", [0.4, 0.4, 0.4], [2.5, 3.2, 2], { color: "#ffd9a0", roughness: 0.4, metalness: 0, emissive: "#ffb95e", emissiveIntensity: 3 }, { castShadow: false })
    ],
    masks: ["object-id"],
    primaryCriterion: "S14",
    primaryRegion: "subject"
  },
  {
    ...base(
      "prd10-biomes-sweep",
      108,
      "Biomes sweep",
      "S14: one capture per biome id (11 frames over the strip). A neutral material row under neutral light; the sweep re-captures it once per BIOME_RIGS id when the resolver lands."
    ),
    camera: { position: [0, 4, 16], target: [0, 1.5, 0], fov: 45, near: 0.1, far: 120 },
    background: { kind: "color", color: "#b8c4cf" },
    lights: [sun(2.0, [10, 30, 12], true)],
    objects: [
      primitive("sweep floor", "plane", [40, 1, 24], [0, 0, 0], { color: "#7d8178", roughness: 0.95, metalness: 0 }, { castShadow: false }),
      ...(["#c9ced4", "#8a8f96", "#5b6570", "#3f4a55", "#7a8a99", "#9fb2a0", "#6e7d8f", "#8f7d6e", "#545f66", "#2c3640", "#4a5560"] as const).map(
        (color, i): ObjectSpec =>
          primitive(`biome marker ${i}`, "sphere", [1.4, 1.4, 1.4], [-15 + i * 3, 1.4, -2], { color, roughness: 0.7, metalness: i % 3 === 0 ? 0.6 : 0 }, {})
      )
    ],
    shadows: shadows(40),
    strip: { frames: 11, intervalMs: 200, orbitDegrees: 0 },
    masks: ["sky", "object-id"],
    brokenControls: ["flat-sky", "albedo-only"],
    primaryCriterion: "S14",
    primaryRegion: "frame"
  },
  {
    ...base(
      "prd10-space-orbit",
      109,
      "Space orbit",
      "Space biome stand-in: a planet sphere with terminator lighting and a starfield particle backdrop; real space bake lands in Phase 6."
    ),
    camera: { position: [0, 1.2, 14], target: [0, 0, 0], fov: 50, near: 0.05, far: 400 },
    background: { kind: "color", color: "#04060c" },
    lights: [sun(3.2, [-20, 4, 8], false, "#fffdf4")],
    objects: [
      primitive("planet", "sphere", [9, 9, 9], [0, -0.5, 0], { color: "#3a5f8a", roughness: 0.75, metalness: 0 }, { receiveShadow: false }),
      primitive("moon", "sphere", [1.6, 1.6, 1.6], [7, 2.5, -6], { color: "#9a9a9a", roughness: 0.95, metalness: 0 }, {}),
      { kind: "particles", name: "starfield", count: 600, seed: 77, center: [0, 0, -60], radius: 120, height: 120, color: "#dfe8ff", size: 0.5, blending: "additive" }
    ],
    strip: { frames: 8, intervalMs: 125, orbitDegrees: 4 },
    masks: ["object-id"],
    primaryCriterion: "S14",
    primaryRegion: "frame"
  }
];

export const scenes: readonly BenchSceneRegistration[] = sceneSpecs.map((spec) => ({ id: spec.id, spec }));

export function getPrd10Scene(id: string): SceneSpec {
  const spec = sceneSpecs.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown prd10 scene "${id}"`);
  return spec;
}
