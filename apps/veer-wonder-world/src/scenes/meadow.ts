import {
  geometry,
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { type ComposePart, type ProceduralVec3 } from "@aura3d/engine/procedural";
import {
  archStoneBridge,
  buildAnimatedBrookNode,
  buildBackdropHillNode,
  buildIslandPlinthNode,
  cachedDioramaSpec,
  clayMat,
  composeGeometry,
  coneSpec,
  createDeterministicRng,
  ellipsoidSpec,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  instanceStoneMat,
  instanceWoodMat,
  plushCloudMat,
  ribbonAlongSpline,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  splitInstancePlacements,
  srgbHexToLinearRgba,
  type AuraInstanceInput
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type {
  WorldAnimatedNodeSpec,
  WorldDefinition,
  WorldDioramaContext,
  WorldDioramaSlice
} from "./worlds.js";

const WILDFLOWER_COLORS: readonly AuraColor[] = [
  "#FFFDF6",
  "#FFE680",
  "#FFB8CC",
  "#FFF4B8",
  "#D9C6FA",
  "#FFAEC2"
];

const BROOK_CHANNEL_2D: readonly (readonly [number, number])[] = [
  [-7.8, -4.65],
  [-4.9, -4.2],
  [-1.95, -4.02],
  [1.35, -4.18],
  [4.55, -3.62],
  [6.95, -1.95]
];

const BROOK_SPLINE_3D: readonly ProceduralVec3[] = BROOK_CHANNEL_2D.map(([x, z]) => [x, -0.025, z]);

function buildSculptedCloudNode(id: string, at: Vec3, scale = 1): AuraNodeBuilder<AuraSceneNode> {
  const puffMat = plushCloudMat("#FFFDF9", { color: "#FFEBD2", power: 2.4, intensity: 0.28 });
  const spec = cachedDioramaSpec("meadow-cumulus-puff", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.58, 0.88, 1.04] },
        { position: [-0.72, -0.08, 0.06], scale: [1.12, 0.72, 0.88] },
        { position: [0.74, -0.06, -0.04], scale: [1.16, 0.76, 0.9] },
        { position: [0.08, 0.28, 0.02], scale: [0.95, 0.68, 0.82] }
      ],
      { seed: 117, amplitude: 0.026, frequency: 2.4 }
    );
    return built.geometry;
  });

  return geometry
    .custom(spec, {
      name: id,
      material: puffMat,
      castShadow: false,
      receiveShadow: false
    })
    .position(at[0], at[1], at[2])
    .scale(scale)
    .runtime({ id, tags: ["diorama", "cloud"], mutable: true });
}

export function meadowScene(ctx: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x51a7e1);
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];

  // 1. Sculpted felt clover-green island plinth (strictly y = 0.000 inside r <= 3.75m)
  //    with a carved creek channel in the outer mid-ground for the animated brook.
  nodes.push(
    buildIslandPlinthNode({
      name: "meadow felt island plinth",
      seed: 101,
      material: feltMat("#7FBC6B"),
      span: [32, 30],
      segments: [38, 36],
      flatStageRadius: 3.75,
      islandRadius: 14.2,
      outerSwellAmplitude: 0.38,
      channel: {
        points: BROOK_CHANNEL_2D,
        halfWidth: 0.56,
        depth: 0.22
      },
      plinthBaseY: -1.1
    }),
    primitives.cylinder({
      name: "meadow clay plinth rim",
      size: [29.4, 0.45, 27.6],
      position: [0, -0.92, 0],
      material: clayMat("#C8A882", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Rolling sculpted outer hills framing the golden-hour horizon
  nodes.push(
    buildBackdropHillNode({
      name: "meadow west hill",
      seed: 211,
      position: [-8.2, -0.18, -9.4],
      size: [14.5, 9.2],
      peakHeight: 2.35,
      material: feltMat("#8CC875", false),
      rotationY: 0.18
    }),
    buildBackdropHillNode({
      name: "meadow center hill",
      seed: 212,
      position: [0.6, -0.22, -11.8],
      size: [18.5, 10.4],
      peakHeight: 2.95,
      material: feltMat("#76B364", false)
    }),
    buildBackdropHillNode({
      name: "meadow east hill",
      seed: 213,
      position: [8.4, -0.18, -9.2],
      size: [14.2, 9.0],
      peakHeight: 2.2,
      material: feltMat("#95CE7D", false),
      rotationY: -0.16
    })
  );

  // 3. Winding animated storybook brook + pebble banks + arched timber-and-cobble footbridge
  nodes.push(
    ribbonAlongSpline({
      name: "meadow creek sandy bed",
      points: BROOK_CHANNEL_2D.map(([x, z]): ProceduralVec3 => [x, -0.14, z]),
      halfWidthBottom: 0.72,
      halfWidthTop: 0.64,
      height: 0.03,
      baseY: -0.04,
      segments: 48,
      material: clayMat("#DFCAA6", false)
    }),
    buildAnimatedBrookNode({
      name: "meadow babbling brook surface",
      points: BROOK_SPLINE_3D,
      halfWidth: 0.54,
      segments: 52,
      shallowColor: "#74DAEE",
      deepColor: "#2E92BD",
      reducedMotion: ctx.reducedMotion
    }),
    archStoneBridge({
      name: "meadow cobble timber footbridge",
      position: [-1.88, 0.02, -4.02],
      rotationY: Math.PI * 0.48,
      spanLength: 2.25,
      deckWidth: 1.08,
      archRise: 0.34
    })
  );

  const brookPebbleSpec = cachedDioramaSpec("meadow-brook-pebble", () =>
    ellipsoidSpec(0.14, 0.075, 0.11, 16, 12)
  );
  const brookPebbleInstances: AuraInstanceInput[] = [];
  for (let i = 0; i < BROOK_CHANNEL_2D.length - 1; i += 1) {
    const a = BROOK_CHANNEL_2D[i]!;
    const b = BROOK_CHANNEL_2D[i + 1]!;
    for (let sub = 0; sub < 4; sub += 1) {
      const f = (sub + 0.3) / 4;
      const cx = a[0] + (b[0] - a[0]) * f;
      const cz = a[1] + (b[1] - a[1]) * f;
      if (Math.abs(cx + 1.88) < 0.85) continue;
      for (const bank of [-1, 1] as const) {
        brookPebbleInstances.push({
          position: [cx + (rng() - 0.5) * 0.22, 0.02, cz + bank * (0.58 + rng() * 0.14)],
          rotation: [0, rng() * Math.PI * 2, 0],
          scale: [0.8 + rng() * 0.45, 0.75 + rng() * 0.35, 0.8 + rng() * 0.4],
          color: bank < 0 ? "#DED5C7" : "#CFC5B6"
        });
      }
    }
  }
  nodes.push(
    instances.custom(brookPebbleSpec, {
      name: "meadow brook bank cobbles",
      material: instanceStoneMat("#FFFFFF"),
      ...splitInstancePlacements(brookPebbleInstances),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 4. Winding cream-clay garden path + sculpted stepping-stone flower path
  nodes.push(
    ribbonAlongSpline({
      name: "meadow winding clay path",
      points: [
        [-7.4, 0.004, 2.75],
        [-4.2, 0.004, 2.48],
        [-1.2, 0.004, 2.68],
        [1.8, 0.004, 2.54],
        [4.5, 0.004, 2.15],
        [6.6, 0.004, -0.8],
        [5.8, 0.004, -3.3]
      ],
      halfWidthBottom: 0.56,
      halfWidthTop: 0.46,
      height: 0.022,
      baseY: -0.015,
      segments: 48,
      material: clayMat("#F1E4CC", false)
    })
  );

  const steppingStoneSpec = cachedDioramaSpec("meadow-stepping-stone", () =>
    roundedBoxSpec(0.46, 0.036, 0.36, 0.09, 3)
  );
  const steppingStones: readonly AuraInstanceInput[] = [
    { position: [-6.1, 0.016, 2.66], scale: [1.04, 1, 0.9], rotation: [0, 0.18, 0], color: "#EAE0CE" },
    { position: [-4.7, 0.016, 2.53], scale: [0.94, 1, 0.88], rotation: [0, -0.22, 0], color: "#DFD3BF" },
    { position: [-3.3, 0.016, 2.58], scale: [1.02, 1, 0.86], rotation: [0, 0.28, 0], color: "#EDE3D2" },
    { position: [-1.85, 0.018, -2.72], scale: [0.92, 1, 0.84], rotation: [0, 0.08, 0], color: "#E6DBC8" },
    { position: [-1.88, 0.02, -3.12], scale: [0.96, 1, 0.86], rotation: [0, -0.12, 0], color: "#DFD3BF" },
    { position: [0.3, 0.016, 2.62], scale: [1.06, 1, 0.88], rotation: [0, 0.14, 0], color: "#EAE0CE" },
    { position: [2.5, 0.016, 2.48], scale: [0.96, 1, 0.84], rotation: [0, -0.2, 0], color: "#E2D6C2" },
    { position: [4.35, 0.016, 2.16], scale: [1.02, 1, 0.88], rotation: [0, 0.36, 0], color: "#ECE2D0" },
    { position: [5.85, 0.016, 0.42], scale: [0.98, 1, 0.86], rotation: [0, 0.62, 0], color: "#DFD3BF" }
  ];
  nodes.push(
    instances.custom(steppingStoneSpec, {
      name: "meadow stepping stone flags",
      material: instanceStoneMat("#FFFFFF"),
      ...splitInstancePlacements(steppingStones),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 5. Multi-petal swaying wildflowers & sculpted clover grass tufts (single draw per pool)
  const grassTuftSpec = cachedDioramaSpec("meadow-clover-grass-tuft", () => {
    const blade = coneSpec(0.036, 0.26, 10, 0.008);
    const leaf = ellipsoidSpec(0.048, 0.016, 0.038, 10, 8);
    return composeGeometry([
      { geometry: blade, position: [0, 0.13, 0], rotation: [0.08, 0, 0.1] },
      { geometry: blade, position: [-0.035, 0.11, 0.02], rotation: [-0.12, 0.6, 0.22], scale: 0.86 },
      { geometry: blade, position: [0.038, 0.115, -0.02], rotation: [0.14, -0.5, -0.2], scale: 0.9 },
      { geometry: leaf, position: [-0.04, 0.04, 0.04], rotation: [0.2, 0.4, 0] },
      { geometry: leaf, position: [0.04, 0.045, -0.03], rotation: [-0.2, -0.5, 0] }
    ]);
  });

  const wildflowerSpec = cachedDioramaSpec("meadow-wildflower-blossom", () => {
    const parts: ComposePart[] = [];
    const stem = sculptCurvedLimb(
      [
        [0, 0, 0],
        [0.012, 0.11, 0.008],
        [0, 0.22, 0]
      ],
      0.015,
      { steps: 8, radialSegments: 8 }
    );
    parts.push({
      geometry: stem,
      color: srgbHexToLinearRgba("#6AB05A")
    });
    const leaf = ellipsoidSpec(0.046, 0.014, 0.024, 10, 8);
    parts.push(
      {
        geometry: leaf,
        position: [0.035, 0.08, 0],
        rotation: [0, 0.3, 0.38],
        color: srgbHexToLinearRgba("#74B963")
      },
      {
        geometry: leaf,
        position: [-0.032, 0.11, 0.01],
        rotation: [0, -0.4, -0.36],
        color: srgbHexToLinearRgba("#68AD58")
      }
    );
    const petal = ellipsoidSpec(0.046, 0.015, 0.026, 12, 8);
    const petalCount = 6;
    for (let p = 0; p < petalCount; p += 1) {
      const ang = (p / petalCount) * Math.PI * 2;
      parts.push({
        geometry: petal,
        position: [Math.cos(ang) * 0.052, 0.225, Math.sin(ang) * 0.052],
        rotation: [0.12, -ang, 0],
        color: srgbHexToLinearRgba("#FFFFFF")
      });
    }
    const pollen = ellipsoidSpec(0.032, 0.022, 0.032, 12, 8);
    parts.push({
      geometry: pollen,
      position: [0, 0.236, 0],
      color: srgbHexToLinearRgba("#F9C642")
    });
    return composeGeometry(parts);
  });

  const grassInstances: AuraInstanceInput[] = [];
  const flowerInstances: AuraInstanceInput[] = [];
  const grassPalette: readonly AuraColor[] = ["#6FB05B", "#7EC06A", "#63A352", "#8BC975"];

  const ringCount = 40;
  for (let i = 0; i < ringCount; i += 1) {
    const angle = (i / ringCount) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const radius = 3.72 + rng() * 3.75;
    const gx = Math.cos(angle) * radius;
    const gz = Math.sin(angle) * radius * 0.88 - 0.45;
    // Keep stage play area and brook channel clear
    if (Math.abs(gx) < 3.15 && gz > -2.4 && gz < 2.2) continue;
    if (gz < -3.35 && gz > -4.75) continue;

    const scaleY = 0.82 + rng() * 0.46;
    grassInstances.push({
      position: [gx, 0, gz],
      rotation: [0, rng() * Math.PI * 2, (rng() - 0.5) * 0.1],
      scale: [0.88 + rng() * 0.3, scaleY, 0.88 + rng() * 0.3],
      color: grassPalette[i % grassPalette.length]!
    });

    if (i % 4 !== 3) {
      const dx = gx + (rng() - 0.5) * 0.38;
      const dz = gz + (rng() - 0.5) * 0.38;
      if (Math.abs(dx) < 3.15 && dz > -2.4 && dz < 2.2) continue;
      if (dz < -3.35 && dz > -4.75) continue;
      flowerInstances.push({
        position: [dx, 0, dz],
        rotation: [0.06 * (rng() - 0.5), rng() * Math.PI * 2, 0.06 * (rng() - 0.5)],
        scale: 0.88 + rng() * 0.38,
        color: WILDFLOWER_COLORS[i % WILDFLOWER_COLORS.length]!
      });
    }
  }

  const grassWind = gentleBreezeWind(ctx.reducedMotion, 0.24, 0.28, 40);
  const flowerWind = gentleBreezeWind(ctx.reducedMotion, 0.26, 0.28, 40);
  nodes.push(
    instances.custom(grassTuftSpec, {
      name: "meadow clover grass tufts",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(grassInstances),
      ...(grassWind ? { wind: grassWind } : {}),
      castShadow: false,
      receiveShadow: true
    }),
    instances.custom(wildflowerSpec, {
      name: "meadow multi petal wildflowers",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(flowerInstances),
      ...(flowerWind ? { wind: flowerWind } : {}),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 6. Sculpted split-rail cedar timber fence framing the outer meadow wings (`instances.custom`)
  const fencePostSpec = cachedDioramaSpec("meadow-split-rail-post", () =>
    composeGeometry([
      { geometry: roundedBoxSpec(0.115, 0.58, 0.115, 0.022), position: [0, 0.29, 0] },
      { geometry: ellipsoidSpec(0.068, 0.045, 0.068, 14, 10), position: [0, 0.59, 0] }
    ])
  );
  const fenceRailSpec = cachedDioramaSpec("meadow-split-rail-bar", () =>
    roundedBoxSpec(0.058, 0.078, 1.0, 0.016)
  );

  const postCoords: readonly [number, number, number][] = [
    [-4.95, -2.25, 0.2],
    [-4.72, -1.05, 0.14],
    [-4.55, 0.15, 0.07],
    [-4.48, 1.32, 0.03],
    [4.95, -2.25, -0.2],
    [4.72, -1.05, -0.14],
    [4.55, 0.15, -0.07],
    [4.48, 1.32, -0.03]
  ];
  const postInstances: AuraInstanceInput[] = postCoords.map(([px, pz, yaw]) => ({
    position: [px, 0, pz],
    rotation: [0, yaw, 0]
  }));

  const railPairs: readonly [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [4, 5],
    [5, 6],
    [6, 7]
  ];
  const railInstances: AuraInstanceInput[] = [];
  for (const [i0, i1] of railPairs) {
    const a = postCoords[i0]!;
    const b = postCoords[i1]!;
    const mx = (a[0] + b[0]) * 0.5;
    const mz = (a[1] + b[1]) * 0.5;
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    railInstances.push(
      { position: [mx, 0.44, mz], rotation: [0, yaw, 0], scale: [1, 1, span] },
      { position: [mx, 0.23, mz], rotation: [0, yaw, 0], scale: [1, 1, span] }
    );
  }

  nodes.push(
    instances.custom(fencePostSpec, {
      name: "meadow cedar fence posts",
      material: instanceWoodMat("#DFBE93"),
      ...splitInstancePlacements(postInstances),
      castShadow: true,
      receiveShadow: true
    }),
    instances.custom(fenceRailSpec, {
      name: "meadow cedar split rails",
      material: instanceWoodMat("#E7CAA2"),
      ...splitInstancePlacements(railInstances),
      castShadow: true,
      receiveShadow: true
    })
  );

  // 7. Soft drifting sculpted cumulus clouds
  const cloudSpecs: readonly {
    readonly id: string;
    readonly at: Vec3;
    readonly scale: number;
    readonly amp: number;
    readonly speed: number;
    readonly phase: number;
  }[] = [
    { id: "meadow-cloud-drift-1", at: [-4.2, 4.5, -8.8], scale: 1.05, amp: 0.42, speed: 0.18, phase: 0.2 },
    { id: "meadow-cloud-drift-2", at: [0.8, 5.1, -10.4], scale: 1.22, amp: 0.5, speed: 0.14, phase: 1.7 },
    { id: "meadow-cloud-drift-3", at: [4.6, 4.4, -8.6], scale: 0.96, amp: 0.38, speed: 0.2, phase: 3.1 }
  ];

  const animated: WorldAnimatedNodeSpec[] = [];
  for (const c of cloudSpecs) {
    nodes.push(buildSculptedCloudNode(c.id, c.at, c.scale));
    animated.push({
      id: c.id,
      restPosition: c.at,
      sample: (t) => ({
        position: [
          c.at[0] + Math.sin(t * c.speed + c.phase) * c.amp,
          c.at[1] + Math.cos(t * c.speed * 0.7 + c.phase) * 0.06,
          c.at[2]
        ]
      })
    });
  }

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Sunny Meadow — felt clover island, animated crystal brook with arched cobble
 * & timber footbridge, stepping-stone flower path, split-rail cedar fence,
 * single-draw multi-petal swaying wildflowers, and drifting cumulus clouds.
 */
export const meadow: WorldDefinition = {
  id: "meadow",
  workingTitle: "Momo Meadow",
  ground: { color: "#7FBC6B", size: 70 },
  musicBed: "meadowBed",
  buildDiorama: meadowScene,
  dressing: [
    { kind: "model", key: "tree", at: [-3.9, 0, -3.5], yaw: 0.3, heightM: 2.65 },
    { kind: "model", key: "tree", at: [4.0, 0, -3.7], yaw: -0.42, heightM: 2.45 },
    { kind: "model", key: "tree", at: [0.45, 0, -5.1], yaw: 0.85, heightM: 2.95 },
    { kind: "model", key: "bush", at: [-3.25, 0, -2.55], yaw: 0.5, heightM: 0.68 },
    { kind: "model", key: "bush", at: [3.25, 0, -2.65], yaw: -0.6, heightM: 0.64 },
    { kind: "model", key: "bush", at: [-4.25, 0, 0.95], yaw: 1.1, heightM: 0.6 },
    { kind: "model", key: "flower", at: [-3.08, 0, 1.55], yaw: 0.2, heightM: 0.42 },
    { kind: "model", key: "flower", at: [3.12, 0, 1.48], yaw: -0.4, heightM: 0.42 },
    { kind: "model", key: "flower", at: [-2.35, 0, -2.85], yaw: 0.7, heightM: 0.4 },
    { kind: "model", key: "flower", at: [2.45, 0, -2.85], yaw: -0.8, heightM: 0.4 },
    { kind: "model", key: "cloud", at: [-2.8, 4.35, -7.4], yaw: 0.1, heightM: 0.92, castShadow: false },
    { kind: "model", key: "cloud", at: [3.1, 4.75, -8.1], yaw: -0.15, heightM: 1.05, castShadow: false }
  ]
};
