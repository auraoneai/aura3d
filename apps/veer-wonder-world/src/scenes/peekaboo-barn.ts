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
  buildCalmPondNode,
  buildIslandPlinthNode,
  ceramicMat,
  clayMat,
  clearcoatPaintMat,
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

const POND_CENTER: readonly [number, number] = [-3.4, -3.2];
const POND_RADIUS = 1.18;

function buildPeekabooBarnDiorama(ctx: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x6261726e);
  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Golden-green morning pasture island plinth with recessed duck-pond basin
  nodes.push(
    buildIslandPlinthNode({
      name: "barn golden pasture island plinth",
      seed: 505,
      material: feltMat("#A5BD68"),
      span: [32, 30],
      segments: [56, 52],
      flatStageRadius: 3.5,
      islandRadius: 14.2,
      outerSwellAmplitude: 0.36,
      basin: {
        center: POND_CENTER,
        radius: POND_RADIUS,
        depth: 0.24
      },
      plinthBaseY: -1.1
    }),
    primitives.cylinder({
      name: "barn clay plinth base",
      size: [29.4, 0.44, 27.6],
      position: [0, -0.92, 0],
      material: clayMat("#C8A379", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Warm golden-hour rolling pasture hills
  nodes.push(
    buildBackdropHillNode({
      name: "barn west sunrise hill",
      seed: 511,
      position: [-8.2, -0.2, -9.6],
      size: [14.4, 9.0],
      peakHeight: 2.3,
      material: feltMat("#B3C670", false),
      rotationY: 0.2
    }),
    buildBackdropHillNode({
      name: "barn north orchard hill",
      seed: 512,
      position: [0.4, -0.22, -11.9],
      size: [18.6, 10.2],
      peakHeight: 2.85,
      material: feltMat("#98B25E", false)
    }),
    buildBackdropHillNode({
      name: "barn east pasture hill",
      seed: 513,
      position: [8.3, -0.2, -9.4],
      size: [14.0, 9.0],
      peakHeight: 2.25,
      material: feltMat("#B8CA76", false),
      rotationY: -0.18
    })
  );

  // 3. Curved warm-ochre dirt courtyard spline path leading from the red barn apron
  nodes.push(
    ribbonAlongSpline({
      name: "barn ochre dirt courtyard path",
      points: [
        [0, 0.004, -5.2],
        [0.15, 0.004, -2.75],
        [1.9, 0.004, 2.48],
        [4.8, 0.004, 2.65],
        [6.8, 0.004, 1.4]
      ],
      halfWidthBottom: 0.68,
      halfWidthTop: 0.56,
      height: 0.02,
      baseY: -0.015,
      segments: 48,
      material: clayMat("#E2C69C", false)
    }),
    dioramaGroup(
      "barn courtyard grain silo",
      [
        primitives.cylinder({
          name: "barn silo tower body",
          size: [1.18, 2.85, 1.18],
          position: [0, 1.425, 0],
          material: clayMat("#F5EBDD"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "barn silo red band",
          size: [1.21, 0.22, 1.21],
          position: [0, 2.55, 0],
          material: clearcoatPaintMat("#C94A3E"),
          castShadow: false,
          receiveShadow: true
        }),
        primitives.sphere({
          name: "barn silo dome roof",
          size: [1.24, 0.86, 1.24],
          position: [0, 2.85, 0],
          material: clearcoatPaintMat("#C94A3E"),
          castShadow: true,
          receiveShadow: true
        })
      ],
      { position: [3.25, 0, -5.45] }
    )
  );

  // 4. Calm `world.water` duck pond at [-3.4, 0.01, -3.2] + sandy basin & river-stone rim
  nodes.push(
    primitives.cylinder({
      name: "barn duck pond sandy basin",
      size: [POND_RADIUS * 2.22, 0.05, POND_RADIUS * 2.22],
      position: [POND_CENTER[0], -0.03, POND_CENTER[1]],
      material: clayMat("#DEC8A2", false),
      castShadow: false,
      receiveShadow: true
    }),
    buildCalmPondNode({
      id: "barn-duck-pond",
      name: "barn calm duck pond",
      center: POND_CENTER,
      radius: POND_RADIUS,
      height: 0.012,
      shallowColor: "#74C6DE",
      deepColor: "#3B86A3",
      reducedMotion: ctx.reducedMotion
    })
  );

  const stoneTransforms: AuraTransformSpec[] = [];
  const stoneColors: AuraColor[] = [];
  const stonePalette: readonly AuraColor[] = ["#D8CEBF", "#C8BEB0", "#E2D9CA"];
  const stoneCount = 16;
  for (let i = 0; i < stoneCount; i += 1) {
    const a = (i / stoneCount) * Math.PI * 2;
    const r = POND_RADIUS + 0.08 + (rng() - 0.5) * 0.06;
    stoneTransforms.push({
      position: [POND_CENTER[0] + Math.cos(a) * r, 0.035, POND_CENTER[1] + Math.sin(a) * r],
      rotation: [0, a, 0],
      scale: [0.95 + rng() * 0.35, 0.58, 0.8 + rng() * 0.25]
    });
    stoneColors.push(stonePalette[i % stonePalette.length]!);
  }
  nodes.push(
    instances.sphere({
      name: "barn pond river pebbles",
      size: [0.24, 0.16, 0.24],
      material: instanceClayMat("#FFFFFF"),
      transforms: stoneTransforms,
      colors: stoneColors,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 5. Bevelled split-rail cedar fence along left & right pasture wings (single draw per pool)
  const fencePostCoords: readonly [number, number, number][] = [
    [-4.85, -1.85, 0.12],
    [-4.65, -0.55, 0.08],
    [-4.5, 0.75, 0.04],
    [4.85, -2.25, -0.14],
    [4.68, -0.95, -0.1],
    [4.52, 0.35, -0.05],
    [2.15, -3.85, 0.02],
    [3.55, -3.72, -0.08]
  ];
  const fencePostTransforms: AuraTransformSpec[] = fencePostCoords.map(([x, z, yaw]) => ({
    position: [x, 0.34, z],
    rotation: [0, yaw, 0]
  }));
  const fenceRailTransforms: AuraTransformSpec[] = [];
  const railPairs: readonly [number, number][] = [
    [0, 1],
    [1, 2],
    [3, 4],
    [4, 5],
    [6, 7]
  ];
  for (const [i0, i1] of railPairs) {
    const a = fencePostCoords[i0]!;
    const b = fencePostCoords[i1]!;
    const mx = (a[0] + b[0]) * 0.5;
    const mz = (a[1] + b[1]) * 0.5;
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    fenceRailTransforms.push(
      { position: [mx, 0.48, mz], rotation: [0, yaw, 0], scale: [1, 1, span] },
      { position: [mx, 0.24, mz], rotation: [0, yaw, 0], scale: [1, 1, span] }
    );
  }
  nodes.push(
    instances.roundedBox({
      name: "barn split rail cedar posts",
      size: [0.13, 0.68, 0.13],
      material: instanceWoodMat("#C99663"),
      transforms: fencePostTransforms,
      castShadow: true,
      receiveShadow: true
    }),
    instances.roundedBox({
      name: "barn split rail cedar rails",
      size: [0.065, 0.085, 1.0],
      material: instanceWoodMat("#D7A675"),
      transforms: fenceRailTransforms,
      castShadow: true,
      receiveShadow: true
    })
  );

  // 6. Stacked golden-wheat felt straw bales (warm tactile sheen, rounded edges)
  const strawMat = feltMat("#ECCB72");
  const baleSpecs: readonly { readonly pos: Vec3; readonly yaw: number }[] = [
    { pos: [3.45, 0.21, -2.85], yaw: -0.22 },
    { pos: [4.12, 0.21, -2.65], yaw: 0.14 },
    { pos: [3.78, 0.62, -2.76], yaw: -0.05 },
    { pos: [-3.85, 0.21, 1.48], yaw: 0.28 }
  ];
  baleSpecs.forEach((b, idx) => {
    nodes.push(
      primitives.box({
        name: `barn felt straw bale ${idx + 1}`,
        size: [0.64, 0.42, 0.44],
        position: [b.pos[0], b.pos[1], b.pos[2]],
        rotation: [0, b.yaw, 0],
        material: strawMat,
        castShadow: true,
        receiveShadow: true
      })
    );
  });

  // 7. Swaying golden sunflowers along the fence & barn wings (single-draw instanced pools + wind)
  const sunflowerCoords: readonly [number, number][] = [
    [-4.35, -1.65],
    [-4.22, -1.15],
    [-4.15, -0.25],
    [4.28, -2.05],
    [4.22, -1.45],
    [4.12, -0.55],
    [-1.95, -4.15],
    [1.95, -4.15]
  ];
  const stemTransforms: AuraTransformSpec[] = [];
  const headTransforms: AuraTransformSpec[] = [];
  const centerTransforms: AuraTransformSpec[] = [];
  sunflowerCoords.forEach(([sx, sz], idx) => {
    const h = 0.78 + (idx % 3) * 0.1;
    const yaw = (idx - 3.5) * 0.12;
    stemTransforms.push({ position: [sx, h * 0.5, sz], scale: [1, h, 1] });
    headTransforms.push({ position: [sx, h + 0.04, sz + 0.03], rotation: [0.32, yaw, 0] });
    centerTransforms.push({ position: [sx, h + 0.05, sz + 0.055], rotation: [0.32, yaw, 0] });
  });
  const sunflowerWind = gentleBreezeWind(ctx.reducedMotion, 0.22, 0.9, 32);
  nodes.push(
    instances.cylinder({
      name: "barn sunflower green stems",
      size: [0.055, 1.0, 0.055],
      material: instanceClayMat("#6AA454"),
      transforms: stemTransforms,
      ...(sunflowerWind ? { wind: sunflowerWind } : {}),
      castShadow: true,
      receiveShadow: true
    }),
    instances.cylinder({
      name: "barn sunflower golden petals",
      size: [0.34, 0.045, 0.34],
      material: instanceClayMat("#F7C844"),
      transforms: headTransforms,
      ...(sunflowerWind ? { wind: sunflowerWind } : {}),
      castShadow: true,
      receiveShadow: false
    }),
    instances.cylinder({
      name: "barn sunflower cocoa centers",
      size: [0.16, 0.055, 0.16],
      material: instanceClayMat("#6E4832"),
      transforms: centerTransforms,
      ...(sunflowerWind ? { wind: sunflowerWind } : {}),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.cylinder({
      name: "barn ceramic milk jug",
      size: [0.24, 0.36, 0.24],
      position: [-1.65, 0.18, -3.95],
      material: ceramicMat("#F7F3EA"),
      castShadow: true,
      receiveShadow: true
    })
  );

  // Drifting golden-sunrise sky clouds
  const cloudMat = plushCloudMat("#FFF7EB", { color: "#FFE0B2", power: 2.4, intensity: 0.3 });
  const barnClouds: readonly { readonly id: string; readonly at: Vec3; readonly amp: number; readonly speed: number }[] = [
    { id: "barn-cloud-drift-1", at: [-3.9, 4.6, -8.9], amp: 0.42, speed: 0.14 },
    { id: "barn-cloud-drift-2", at: [3.7, 4.9, -9.5], amp: 0.46, speed: 0.12 }
  ];
  barnClouds.forEach((c, idx) => {
    nodes.push(
      dioramaGroup(
        c.id,
        [
          primitives.sphere({ name: `${c.id}-a`, size: [1.52, 0.85, 1.0], material: cloudMat, castShadow: false, receiveShadow: false }),
          primitives.sphere({ name: `${c.id}-b`, size: [1.06, 0.7, 0.86], position: [-0.7, -0.06, 0.04], material: cloudMat, castShadow: false, receiveShadow: false }),
          primitives.sphere({ name: `${c.id}-c`, size: [1.1, 0.72, 0.88], position: [0.72, -0.05, -0.04], material: cloudMat, castShadow: false, receiveShadow: false })
        ],
        { position: c.at }
      ).runtime({ id: c.id, tags: ["diorama", "cloud"], mutable: true })
    );
    animated.push({
      id: c.id,
      restPosition: c.at,
      sample: (t) => ({
        position: [c.at[0] + Math.sin(t * c.speed + idx * 2.1) * c.amp, c.at[1], c.at[2]]
      })
    });
  });

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Peekaboo Barn — golden-green sunrise pasture, classic warm-red barn courtyard
 * with grain silo, ochre dirt path, split-rail cedar fence, stacked felt straw
 * bales, calm `world.water` duck pond at `[-3.4, 0.01, -3.2]`, and swaying sunflowers.
 */
export const peekabooBarn: WorldDefinition = {
  id: "peekaboo-barn",
  workingTitle: "Peeko Peekaboo Barn",
  ground: { color: "#A5BD68", size: 70 },
  musicBed: "barnBed",
  buildDiorama: buildPeekabooBarnDiorama,
  dressing: [
    { kind: "model", key: "barn", at: [0, 0, -5.85], heightM: 3.3, tint: "#E26A5C" },
    { kind: "model", key: "tree", at: [-4.55, 0, -4.2], yaw: 0.35, heightM: 2.65 },
    { kind: "model", key: "bush", at: [-2.35, 0, -4.05], yaw: 0.4, heightM: 0.62 },
    { kind: "model", key: "bush", at: [2.25, 0, -4.05], yaw: -0.4, heightM: 0.62 },
    { kind: "model", key: "flower", at: [3.28, 0, 1.55], yaw: -0.3, heightM: 0.42 },
    { kind: "model", key: "cloud", at: [0.3, 4.85, -8.5], yaw: -0.1, heightM: 0.98, castShadow: false }
  ]
};
