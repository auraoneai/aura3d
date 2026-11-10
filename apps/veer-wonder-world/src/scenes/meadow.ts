import {
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  buildBackdropHillNode,
  buildIslandPlinthNode,
  clayMat,
  createDeterministicRng,
  dioramaGroup,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  instanceWoodMat,
  plushCloudMat,
  ribbonAlongSpline
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type {
  WorldAnimatedNodeSpec,
  WorldDefinition,
  WorldDioramaContext,
  WorldDioramaSlice
} from "./worlds.js";

const DAISY_COLORS: readonly AuraColor[] = [
  "#FFFDF6",
  "#FFE680",
  "#FFD0DE",
  "#FFF7CC",
  "#E5D8FA"
];

function buildCloudCluster(id: string, name: string, at: Vec3, scale = 1): AuraNodeBuilder<AuraSceneNode> {
  const puffMat = plushCloudMat("#FFFDF9", { color: "#FFEBD2", power: 2.4, intensity: 0.28 });
  return dioramaGroup(
    name,
    [
      primitives.sphere({
        name: `${name}-core`,
        size: [1.55, 0.88, 1.05],
        position: [0, 0, 0],
        material: puffMat,
        castShadow: false,
        receiveShadow: false
      }),
      primitives.sphere({
        name: `${name}-left`,
        size: [1.08, 0.72, 0.88],
        position: [-0.72, -0.08, 0.06],
        material: puffMat,
        castShadow: false,
        receiveShadow: false
      }),
      primitives.sphere({
        name: `${name}-right`,
        size: [1.14, 0.76, 0.9],
        position: [0.74, -0.06, -0.04],
        material: puffMat,
        castShadow: false,
        receiveShadow: false
      })
    ],
    { position: at, scale }
  ).runtime({ id, tags: ["diorama", "cloud"], mutable: true });
}

function buildMeadowDiorama(ctx: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x51a7e1);
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];

  // 1. Sculpted felt clover-green island plinth (strictly y = 0.000 inside r <= 3.75m)
  nodes.push(
    buildIslandPlinthNode({
      name: "meadow felt island plinth",
      seed: 101,
      material: feltMat("#7FBC6B"),
      span: [32, 30],
      segments: [56, 52],
      flatStageRadius: 3.75,
      islandRadius: 14.2,
      outerSwellAmplitude: 0.38,
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

  // 3. Winding cream-clay garden path curving gently around the outer meadow apron
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
        [5.8, 0.004, -3.9]
      ],
      halfWidthBottom: 0.56,
      halfWidthTop: 0.46,
      height: 0.022,
      baseY: -0.015,
      segments: 56,
      material: clayMat("#F1E4CC", false)
    })
  );

  // Stepping pebbles along the garden path (1 draw call)
  const pebbleTransforms: AuraTransformSpec[] = [
    { position: [-5.4, 0.014, 2.6], scale: [1.05, 1, 0.86], rotation: [0, 0.25, 0] },
    { position: [-2.8, 0.014, 2.58], scale: [0.92, 1, 0.82], rotation: [0, -0.3, 0] },
    { position: [0.3, 0.014, 2.62], scale: [1.08, 1, 0.88], rotation: [0, 0.14, 0] },
    { position: [3.2, 0.014, 2.42], scale: [0.96, 1, 0.84], rotation: [0, -0.22, 0] },
    { position: [5.6, 0.014, 0.65], scale: [1.02, 1, 0.86], rotation: [0, 0.48, 0] }
  ];
  nodes.push(
    instances.cylinder({
      name: "meadow path stepping pebbles",
      size: [0.44, 0.026, 0.44],
      material: instanceClayMat("#E5D4B7"),
      transforms: pebbleTransforms,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 4. Instanced clover/grass tufts & daisy blossoms with GPU vertex wind (single draw per pool)
  const grassTransforms: AuraTransformSpec[] = [];
  const grassColors: AuraColor[] = [];
  const daisyTransforms: AuraTransformSpec[] = [];
  const daisyColors: AuraColor[] = [];
  const grassPalette: readonly AuraColor[] = ["#6FB05B", "#7EC06A", "#63A352", "#8BC975"];

  const ringCount = 34;
  for (let i = 0; i < ringCount; i += 1) {
    const angle = (i / ringCount) * Math.PI * 2 + (rng() - 0.5) * 0.12;
    const radius = 3.65 + rng() * 3.8;
    const gx = Math.cos(angle) * radius;
    const gz = Math.sin(angle) * radius * 0.88 - 0.45;
    if (Math.abs(gx) < 3.1 && gz > -2.35 && gz < 2.35) continue;
    const scaleY = 0.78 + rng() * 0.48;
    grassTransforms.push({
      position: [gx, 0.11 * scaleY, gz],
      rotation: [0, rng() * Math.PI * 2, (rng() - 0.5) * 0.14],
      scale: [0.85 + rng() * 0.3, scaleY, 0.85 + rng() * 0.3]
    });
    grassColors.push(grassPalette[i % grassPalette.length]!);

    if (i % 3 !== 2) {
      const dx = gx + (rng() - 0.5) * 0.36;
      const dz = gz + (rng() - 0.5) * 0.36;
      if (Math.abs(dx) < 3.1 && dz > -2.35 && dz < 2.35) continue;
      daisyTransforms.push({
        position: [dx, 0.16 + rng() * 0.06, dz],
        rotation: [0.08 * (rng() - 0.5), rng() * Math.PI * 2, 0.08 * (rng() - 0.5)],
        scale: 0.85 + rng() * 0.35
      });
      daisyColors.push(DAISY_COLORS[i % DAISY_COLORS.length]!);
    }
  }

  const grassWind = gentleBreezeWind(ctx.reducedMotion, 0.24, 0.28, 40);
  const daisyWind = gentleBreezeWind(ctx.reducedMotion, 0.26, 0.24, 40);
  nodes.push(
    instances.cone({
      name: "meadow clover grass tufts",
      size: [0.16, 0.26, 0.16],
      material: instanceClayMat("#FFFFFF"),
      transforms: grassTransforms,
      colors: grassColors,
      ...(grassWind ? { wind: grassWind } : {}),
      castShadow: false,
      receiveShadow: true
    }),
    instances.cylinder({
      name: "meadow daisy blossoms",
      size: [0.18, 0.045, 0.18],
      material: instanceClayMat("#FFFFFF"),
      transforms: daisyTransforms,
      colors: daisyColors,
      ...(daisyWind ? { wind: daisyWind } : {}),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 5. Honey-cedar wooden picket edge posts framing the outer meadow wings
  const picketPostTransforms: AuraTransformSpec[] = [
    { position: [-4.85, 0.28, -1.95], rotation: [0, 0.18, 0] },
    { position: [-4.65, 0.28, -0.85], rotation: [0, 0.12, 0] },
    { position: [-4.55, 0.28, 0.25], rotation: [0, 0.06, 0] },
    { position: [4.85, 0.28, -1.95], rotation: [0, -0.18, 0] },
    { position: [4.65, 0.28, -0.85], rotation: [0, -0.12, 0] },
    { position: [4.55, 0.28, 0.25], rotation: [0, -0.06, 0] }
  ];
  const picketRailTransforms: AuraTransformSpec[] = [
    { position: [-4.75, 0.36, -1.4], rotation: [0, 0.16, 0], scale: [1, 1, 1.15] },
    { position: [-4.6, 0.36, -0.3], rotation: [0, 0.09, 0], scale: [1, 1, 1.15] },
    { position: [4.75, 0.36, -1.4], rotation: [0, -0.16, 0], scale: [1, 1, 1.15] },
    { position: [4.6, 0.36, -0.3], rotation: [0, -0.09, 0], scale: [1, 1, 1.15] }
  ];
  nodes.push(
    instances.roundedBox({
      name: "meadow cedar picket posts",
      size: [0.11, 0.56, 0.11],
      material: instanceWoodMat("#DFBE93"),
      transforms: picketPostTransforms,
      castShadow: true,
      receiveShadow: true
    }),
    instances.roundedBox({
      name: "meadow cedar picket rails",
      size: [0.06, 0.08, 1.08],
      material: instanceWoodMat("#E7CAA2"),
      transforms: picketRailTransforms,
      castShadow: true,
      receiveShadow: true
    })
  );

  // 6. Soft drifting storybook sky clouds
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
    nodes.push(buildCloudCluster(c.id, c.id, c.at, c.scale));
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
 * Sunny Meadow — felt clover island, winding cream-clay path, rolling outer hills,
 * single-draw instanced daisies & grass tufts in a gentle breeze, cedar picket
 * posts, and drifting golden-hour clouds.
 */
export const meadow: WorldDefinition = {
  id: "meadow",
  workingTitle: "Momo Meadow",
  ground: { color: "#7FBC6B", size: 70 },
  musicBed: "meadowBed",
  buildDiorama: buildMeadowDiorama,
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
