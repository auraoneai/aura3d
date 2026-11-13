import {
  geometry,
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import { type ComposePart, type ProceduralVec2 } from "@aura3d/engine/procedural";
import {
  brushedMetalMat,
  buildAnimatedWaterMaterial,
  buildBackdropHillNode,
  buildCalmPondNode,
  buildIslandPlinthNode,
  cachedDioramaSpec,
  ceramicMat,
  clayMat,
  clearcoatPaintMat,
  composeGeometry,
  coneSpec,
  createDeterministicRng,
  cylinderSpec,
  dioramaGroup,
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
  sculptOrganicLathe,
  splitInstancePlacements,
  srgbHexToLinearRgba,
  torusSpec,
  woodMat,
  type AuraInstanceInput
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

function buildTurnedMilkChurnsNode(): AuraNodeBuilder<AuraSceneNode> {
  const churnBodySpec = cachedDioramaSpec("barn-turned-milk-churn", () => {
    const profile: ProceduralVec2[] = [
      [0, 0],
      [0.145, 0],
      [0.15, 0.03],
      [0.142, 0.28],
      [0.135, 0.34],
      [0.092, 0.42],
      [0.088, 0.49],
      [0.106, 0.515],
      [0.102, 0.545],
      [0.045, 0.575],
      [0, 0.585]
    ];
    const vessel = sculptOrganicLathe(profile, { segments: 26 });
    const leftHandle = sculptCurvedLimb(
      [
        [-0.125, 0.35, 0],
        [-0.175, 0.39, 0],
        [-0.105, 0.43, 0]
      ],
      0.014,
      { steps: 10, radialSegments: 8 }
    );
    const rightHandle = sculptCurvedLimb(
      [
        [0.125, 0.35, 0],
        [0.175, 0.39, 0],
        [0.105, 0.43, 0]
      ],
      0.014,
      { steps: 10, radialSegments: 8 }
    );
    return composeGeometry([{ geometry: vessel }, { geometry: leftHandle }, { geometry: rightHandle }]);
  });

  return dioramaGroup("barn dairy milk churns", [
    geometry
      .custom(churnBodySpec, {
        name: "barn tall milk churn",
        material: brushedMetalMat("#C5D0DB", { color: "#FFF3D8", power: 2.6, intensity: 0.18 }),
        castShadow: true,
        receiveShadow: true
      })
      .position(-1.68, 0, -3.95),
    geometry
      .custom(churnBodySpec, {
        name: "barn creamery milk churn",
        material: ceramicMat("#ECE2D0"),
        castShadow: true,
        receiveShadow: true
      })
      .position(-1.32, 0, -4.14)
      .scale(0.84)
      .rotation(0, 0.55, 0)
  ]);
}

function buildWaterTroughNode(reducedMotion: boolean): AuraNodeBuilder<AuraSceneNode> {
  const troughWoodSpec = cachedDioramaSpec("barn-wooden-water-trough", () => {
    const bottom = roundedBoxSpec(1.06, 0.055, 0.48, 0.012);
    const longWall = roundedBoxSpec(1.08, 0.28, 0.055, 0.012);
    const endWall = roundedBoxSpec(0.055, 0.28, 0.42, 0.012);
    const leg = roundedBoxSpec(0.075, 0.16, 0.48, 0.014);
    return composeGeometry([
      { geometry: leg, position: [-0.38, 0.08, 0] },
      { geometry: leg, position: [0.38, 0.08, 0] },
      { geometry: bottom, position: [0, 0.16, 0] },
      { geometry: longWall, position: [0, 0.28, 0.215] },
      { geometry: longWall, position: [0, 0.28, -0.215] },
      { geometry: endWall, position: [-0.51, 0.28, 0] },
      { geometry: endWall, position: [0.51, 0.28, 0] }
    ]);
  });

  const waterSheetSpec = cachedDioramaSpec("barn-trough-water-sheet", () => {
    const positions = new Float32Array([
      -0.46, 0, -0.17,
       0.46, 0, -0.17,
       0.46, 0,  0.17,
      -0.46, 0,  0.17
    ]);
    const normals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
    return {
      kind: "aura-custom-geometry",
      positions,
      normals,
      uvs,
      indices
    };
  });

  return dioramaGroup(
    "barn paddock water trough",
    [
      geometry.custom(troughWoodSpec, {
        name: "barn oak water trough",
        material: woodMat("#A97448"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry
        .custom(waterSheetSpec, {
          name: "barn trough shimmering water",
          material: buildAnimatedWaterMaterial({
            shallowColor: "#78D8EE",
            deepColor: "#3592BA",
            reducedMotion,
            channelShore: false,
            ringFrequency: 12
          }),
          castShadow: false,
          receiveShadow: true
        })
        .position(0, 0.35, 0)
    ],
    { position: [2.72, 0, -3.52], rotation: [0, -0.24, 0] }
  );
}

function buildSpokedWagonWheelNode(): AuraNodeBuilder<AuraSceneNode> {
  const wheelWoodSpec = cachedDioramaSpec("barn-wagon-wheel-wood", () => {
    const parts: ComposePart[] = [
      { geometry: torusSpec(0.42, 0.036, 32, 14) },
      {
        geometry: cylinderSpec(0.085, 0.085, 0.14, 20),
        rotation: [Math.PI * 0.5, 0, 0]
      }
    ];
    const spoke = cylinderSpec(0.018, 0.022, 0.78, 12);
    for (let i = 0; i < 4; i += 1) {
      parts.push({
        geometry: spoke,
        rotation: [0, 0, (i / 4) * Math.PI]
      });
    }
    return composeGeometry(parts);
  });

  const tireRimSpec = cachedDioramaSpec("barn-wagon-wheel-tire", () =>
    torusSpec(0.452, 0.016, 32, 12)
  );

  return dioramaGroup(
    "barn paddock wagon wheel",
    [
      geometry.custom(wheelWoodSpec, {
        name: "barn wagon wheel spokes and felloe",
        material: woodMat("#9B6B42"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(tireRimSpec, {
        name: "barn wagon wheel iron band",
        material: brushedMetalMat("#666E78"),
        castShadow: true,
        receiveShadow: true
      })
    ],
    {
      position: [4.46, 0.44, -1.55],
      rotation: [0.06, -Math.PI * 0.46, 0.22]
    }
  );
}

function buildFarmWindmillNodes(animated: WorldAnimatedNodeSpec[]): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const basePos: Vec3 = [-2.85, 0, -5.65];
  const hubWorld: Vec3 = [basePos[0], 2.78, basePos[2] + 0.24];

  const towerSpec = cachedDioramaSpec("barn-windmill-tower", () => {
    const parts: ComposePart[] = [];
    const legOffsets: readonly [number, number][] = [
      [-0.36, -0.36],
      [0.36, -0.36],
      [-0.36, 0.36],
      [0.36, 0.36]
    ];
    for (const [lx, lz] of legOffsets) {
      parts.push({
        geometry: sculptCurvedLimb(
          [
            [lx, 0, lz],
            [lx * 0.42, 2.68, lz * 0.42]
          ],
          0.042,
          { steps: 8, radialSegments: 10 }
        )
      });
    }
    const platform = roundedBoxSpec(0.56, 0.06, 0.56, 0.014);
    const nacelle = cylinderSpec(0.14, 0.16, 0.48, 18);
    parts.push(
      { geometry: roundedBoxSpec(0.62, 0.045, 0.045, 0.01), position: [0, 1.15, 0.26] },
      { geometry: roundedBoxSpec(0.62, 0.045, 0.045, 0.01), position: [0, 1.15, -0.26] },
      { geometry: roundedBoxSpec(0.045, 0.045, 0.62, 0.01), position: [-0.26, 1.15, 0] },
      { geometry: roundedBoxSpec(0.045, 0.045, 0.62, 0.01), position: [0.26, 1.15, 0] },
      { geometry: platform, position: [0, 2.62, 0] },
      { geometry: nacelle, position: [0, 2.78, 0.04], rotation: [Math.PI * 0.5, 0, 0] }
    );
    return composeGeometry(parts);
  });

  const rotorSpec = cachedDioramaSpec("barn-windmill-rotor-sails", () => {
    const parts: ComposePart[] = [
      {
        geometry: cylinderSpec(0.095, 0.095, 0.12, 18),
        rotation: [Math.PI * 0.5, 0, 0]
      }
    ];
    const sailSpar = cylinderSpec(0.02, 0.024, 0.88, 10);
    const sailPaddle = roundedBoxSpec(0.22, 0.64, 0.022, 0.008);
    for (let b = 0; b < 4; b += 1) {
      const ang = (b / 4) * Math.PI * 2;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      parts.push(
        {
          geometry: sailSpar,
          position: [cs * 0.44, sn * 0.44, 0],
          rotation: [0, 0, ang - Math.PI * 0.5]
        },
        {
          geometry: sailPaddle,
          position: [cs * 0.54, sn * 0.54, 0.015],
          rotation: [0.18, 0.18, ang - Math.PI * 0.5]
        }
      );
    }
    return composeGeometry(parts);
  });

  animated.push({
    id: "barn-windmill-rotor",
    restPosition: hubWorld,
    restRotation: [0, 0, 0],
    sample: (t) => ({
      position: hubWorld,
      rotation: [0, 0, -t * 0.62]
    })
  });

  return [
    geometry
      .custom(towerSpec, {
        name: "barn timber windmill tower",
        material: woodMat("#B88352"),
        castShadow: true,
        receiveShadow: true
      })
      .position(basePos[0], basePos[1], basePos[2]),
    geometry
      .custom(rotorSpec, {
        name: "barn-windmill-rotor",
        material: clayMat("#EDE0C8", false),
        castShadow: true,
        receiveShadow: true
      })
      .position(hubWorld[0], hubWorld[1], hubWorld[2])
      .runtime({ id: "barn-windmill-rotor", tags: ["diorama", "windmill"], mutable: true })
  ];
}

export function peekabooBarnScene(ctx: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x6261726e);
  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Golden-green morning pasture island plinth with recessed duck-pond basin
  nodes.push(
    buildIslandPlinthNode({
      name: "barn golden pasture island plinth",
      seed: 505,
      material: feltMat("#A5BD68"),
      span: [46, 30],
      segments: [38, 36],
      flatStageRadius: 3.5,
      islandRadius: 14.2,
      islandRadiusX: 21.6,
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
      size: [43.2, 0.44, 27.6],
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
      position: [-9.8, -0.2, -9.6],
      size: [18.4, 9.2],
      peakHeight: 2.3,
      material: feltMat("#B3C670", false),
      rotationY: 0.2
    }),
    buildBackdropHillNode({
      name: "barn north orchard hill",
      seed: 512,
      position: [0.4, -0.22, -11.9],
      size: [21.6, 10.2],
      peakHeight: 2.85,
      material: feltMat("#98B25E", false)
    }),
    buildBackdropHillNode({
      name: "barn east pasture hill",
      seed: 513,
      position: [9.9, -0.2, -9.4],
      size: [18.2, 9.2],
      peakHeight: 2.25,
      material: feltMat("#B8CA76", false),
      rotationY: -0.18
    })
  );

  // 3. Ochre dirt courtyard path, fodder silo, farmyard windmill (`barn-windmill-rotor`),
  //    wooden water trough, turned milk churns, and spoked wagon wheel
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
      "barn courtyard fodder silo",
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
          name: "barn silo crimson band",
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
    ),
    ...buildFarmWindmillNodes(animated),
    buildTurnedMilkChurnsNode(),
    buildWaterTroughNode(ctx.reducedMotion),
    buildSpokedWagonWheelNode()
  );

  // 4. Animated `buildCalmPondNode` duck pond at [-3.4, 0.012, -3.2] + river stones + cattail reeds
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
      height: 0.014,
      shallowColor: "#74CEE6",
      deepColor: "#3289AD",
      reducedMotion: ctx.reducedMotion
    })
  );

  const stoneSpec = cachedDioramaSpec("barn-pond-cobble", () =>
    ellipsoidSpec(0.14, 0.08, 0.11, 14, 10)
  );
  const stoneInstances: AuraInstanceInput[] = [];
  const stonePalette: readonly AuraColor[] = ["#D8CEBF", "#C8BEB0", "#E2D9CA"];
  const stoneCount = 16;
  for (let i = 0; i < stoneCount; i += 1) {
    const a = (i / stoneCount) * Math.PI * 2;
    const r = POND_RADIUS + 0.08 + (rng() - 0.5) * 0.06;
    stoneInstances.push({
      position: [POND_CENTER[0] + Math.cos(a) * r, 0.035, POND_CENTER[1] + Math.sin(a) * r],
      rotation: [0, a, 0],
      scale: [0.95 + rng() * 0.35, 0.72, 0.85 + rng() * 0.25],
      color: stonePalette[i % stonePalette.length]!
    });
  }
  nodes.push(
    instances.custom(stoneSpec, {
      name: "barn pond river pebbles",
      material: instanceStoneMat("#FFFFFF"),
      ...splitInstancePlacements(stoneInstances),
      castShadow: false,
      receiveShadow: true
    })
  );

  // Cattail reeds around the duck pond
  const cattailSpec = cachedDioramaSpec("barn-cattail-reed-clump", () => {
    const stalk = cylinderSpec(0.014, 0.018, 0.68, 10);
    const seedSpike = cylinderSpec(0.036, 0.036, 0.18, 14);
    const tip = coneSpec(0.012, 0.09, 10);
    const blade = coneSpec(0.024, 0.52, 8, 0.005);
    return composeGeometry([
      { geometry: stalk, position: [0, 0.34, 0], color: srgbHexToLinearRgba("#6AA456") },
      { geometry: seedSpike, position: [0, 0.56, 0], color: srgbHexToLinearRgba("#6D4428") },
      { geometry: tip, position: [0, 0.69, 0], color: srgbHexToLinearRgba("#7DB262") },
      {
        geometry: stalk,
        position: [0.055, 0.29, 0.025],
        rotation: [0.05, 0, -0.09],
        scale: 0.86,
        color: srgbHexToLinearRgba("#74AD5E")
      },
      {
        geometry: seedSpike,
        position: [0.072, 0.48, 0.035],
        rotation: [0.05, 0, -0.09],
        scale: 0.86,
        color: srgbHexToLinearRgba("#784B2D")
      },
      {
        geometry: blade,
        position: [-0.05, 0.24, 0.02],
        rotation: [0.08, 0.4, 0.18],
        color: srgbHexToLinearRgba("#7DB664")
      },
      {
        geometry: blade,
        position: [0.03, 0.22, -0.05],
        rotation: [-0.14, -0.5, -0.14],
        color: srgbHexToLinearRgba("#6EA858")
      }
    ]);
  });

  const cattailAngles: readonly number[] = [2.15, 2.55, 2.95, 3.35, 3.78, 4.18, 4.55];
  const cattailInstances: AuraInstanceInput[] = cattailAngles.map((ang, idx) => {
    const rad = POND_RADIUS + 0.06 + (idx % 2) * 0.08;
    return {
      position: [POND_CENTER[0] + Math.cos(ang) * rad, 0.01, POND_CENTER[1] + Math.sin(ang) * rad],
      rotation: [0, ang * 1.3, 0],
      scale: 0.88 + (idx % 3) * 0.12
    };
  });
  const reedWind = gentleBreezeWind(ctx.reducedMotion, 0.2, 0.72, 36);
  nodes.push(
    instances.custom(cattailSpec, {
      name: "barn duck pond cattail reeds",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(cattailInstances),
      ...(reedWind ? { wind: reedWind } : {}),
      castShadow: true,
      receiveShadow: true
    })
  );

  // 5. Bevelled split-rail cedar fence along left & right pasture wings with open z ≈ 0.1 gateways
  const fencePostCoords: readonly [number, number, number][] = [
    [-4.9, -2.2, 0.14],
    [-4.7, -1.0, 0.09],
    [-4.66, 1.2, -0.05],
    [-4.8, 2.05, -0.09],
    [4.86, -2.25, -0.14],
    [4.7, -1.0, -0.1],
    [4.66, 1.2, 0.05],
    [4.8, 1.92, 0.09],
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
    [2, 3],
    [4, 5],
    [6, 7],
    [8, 9]
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

  // 6. Stacked golden-wheat felt straw bales + golden wheat tuft instancing
  const baleSpec = cachedDioramaSpec("barn-chamfered-straw-bale", () =>
    roundedBoxSpec(0.64, 0.42, 0.44, 0.055)
  );
  const baleInstances: readonly AuraInstanceInput[] = [
    { position: [3.55, 0.21, -2.85], rotation: [0, -0.22, 0], color: "#ECCB72" },
    { position: [4.22, 0.21, -2.65], rotation: [0, 0.14, 0], color: "#E6C468" },
    { position: [3.88, 0.62, -2.76], rotation: [0, -0.05, 0], color: "#F1D27B" },
    { position: [-3.85, 0.21, 1.62], rotation: [0, 0.28, 0], color: "#ECCB72" }
  ];
  nodes.push(
    instances.custom(baleSpec, {
      name: "barn golden straw bales",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(baleInstances),
      castShadow: true,
      receiveShadow: true
    })
  );

  const wheatSheafSpec = cachedDioramaSpec("barn-golden-wheat-tuft", () => {
    const parts: ComposePart[] = [];
    const stalkAngles: readonly [number, number, number][] = [
      [0, 0, 1],
      [0.14, 0.12, 0.94],
      [-0.15, 0.08, 0.92],
      [0.06, -0.16, 0.88],
      [-0.08, -0.14, 0.9]
    ];
    const culm = cylinderSpec(0.011, 0.014, 0.48, 8);
    const ear = ellipsoidSpec(0.026, 0.085, 0.026, 12, 10);
    for (const [rx, rz, sc] of stalkAngles) {
      parts.push(
        {
          geometry: culm,
          position: [rz * 0.18, 0.24 * sc, rx * 0.18],
          rotation: [rx, 0, rz],
          scale: sc,
          color: srgbHexToLinearRgba("#DFBA5C")
        },
        {
          geometry: ear,
          position: [rz * 0.42, 0.5 * sc, rx * 0.42],
          rotation: [rx * 1.25, 0, rz * 1.25],
          scale: sc,
          color: srgbHexToLinearRgba("#F5CE62")
        }
      );
    }
    return composeGeometry(parts);
  });

  const wheatInstances: AuraInstanceInput[] = [];
  const wheatSpots: readonly [number, number][] = [
    [-5.15, -2.1],
    [-4.95, -1.32],
    [-4.92, 1.55],
    [-4.88, 2.22],
    [-3.45, 2.25],
    [-2.15, 2.55],
    [3.85, 2.15],
    [4.92, 1.52],
    [4.95, -1.28],
    [5.18, -1.85],
    [5.25, -2.55],
    [4.45, -3.55],
    [1.65, -4.45],
    [-1.45, -4.45]
  ];
  wheatSpots.forEach(([wx, wz], idx) => {
    wheatInstances.push({
      position: [wx + (rng() - 0.5) * 0.18, 0, wz + (rng() - 0.5) * 0.18],
      rotation: [0, idx * 0.85, 0],
      scale: 0.88 + (idx % 3) * 0.14,
      color: idx % 2 === 0 ? "#FFF8E4" : "#F8EBC6"
    });
  });
  const wheatWind = gentleBreezeWind(ctx.reducedMotion, 0.25, 0.58, 34);
  nodes.push(
    instances.custom(wheatSheafSpec, {
      name: "barn golden wheat tufts",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(wheatInstances),
      ...(wheatWind ? { wind: wheatWind } : {}),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 7. Swaying golden sunflowers along the fence & barn wings (outside z ≈ 0.1 walk corridors)
  const sunflowerCoords: readonly [number, number][] = [
    [-4.45, -1.68],
    [-4.42, -1.22],
    [-4.38, 1.42],
    [4.28, -2.15],
    [4.38, 1.42],
    [-1.95, -4.15],
    [1.95, -4.15]
  ];
  const sunflowerSpec = cachedDioramaSpec("barn-sculpted-sunflower", () => {
    const parts: ComposePart[] = [
      {
        geometry: cylinderSpec(0.024, 0.03, 0.86, 12),
        position: [0, 0.43, 0],
        color: srgbHexToLinearRgba("#6AA454")
      },
      {
        geometry: ellipsoidSpec(0.085, 0.022, 0.052, 12, 8),
        position: [0.065, 0.36, 0],
        rotation: [0, 0.2, 0.35],
        color: srgbHexToLinearRgba("#72AE5A")
      },
      {
        geometry: ellipsoidSpec(0.085, 0.022, 0.052, 12, 8),
        position: [-0.065, 0.5, 0],
        rotation: [0, -0.3, -0.35],
        color: srgbHexToLinearRgba("#68A252")
      },
      {
        geometry: ellipsoidSpec(0.085, 0.085, 0.035, 16, 10),
        position: [0, 0.88, 0.035],
        rotation: [0.22, 0, 0],
        color: srgbHexToLinearRgba("#6E4832")
      }
    ];
    const petal = ellipsoidSpec(0.036, 0.092, 0.018, 12, 8);
    for (let p = 0; p < 12; p += 1) {
      const a = (p / 12) * Math.PI * 2;
      parts.push({
        geometry: petal,
        position: [Math.cos(a) * 0.135, 0.88 + Math.sin(a) * 0.135, 0.02],
        rotation: [0.22, 0, a - Math.PI * 0.5],
        color: srgbHexToLinearRgba("#F9CA42")
      });
    }
    return composeGeometry(parts);
  });

  const sunflowerInstances: AuraInstanceInput[] = sunflowerCoords.map(([sx, sz], idx) => ({
    position: [sx, 0, sz],
    rotation: [0, (idx - 3) * 0.14, 0],
    scale: 0.9 + (idx % 3) * 0.1
  }));
  const sunflowerWind = gentleBreezeWind(ctx.reducedMotion, 0.22, 0.92, 32);
  nodes.push(
    instances.custom(sunflowerSpec, {
      name: "barn swaying golden sunflowers",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(sunflowerInstances),
      ...(sunflowerWind ? { wind: sunflowerWind } : {}),
      castShadow: true,
      receiveShadow: true
    })
  );

  // 8. Drifting sculpted sunrise cumulus clouds
  const cloudMat = plushCloudMat("#FFF7EB", { color: "#FFE0B2", power: 2.4, intensity: 0.3 });
  const barnCloudSpec = cachedDioramaSpec("barn-cumulus-puff", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.52, 0.85, 1.0] },
        { position: [-0.7, -0.06, 0.04], scale: [1.08, 0.7, 0.86] },
        { position: [0.72, -0.05, -0.04], scale: [1.12, 0.72, 0.88] }
      ],
      { seed: 523, amplitude: 0.025, frequency: 2.4 }
    );
    return built.geometry;
  });

  const barnClouds: readonly { readonly id: string; readonly at: Vec3; readonly amp: number; readonly speed: number }[] = [
    { id: "barn-cloud-drift-1", at: [-3.9, 4.6, -8.9], amp: 0.42, speed: 0.14 },
    { id: "barn-cloud-drift-2", at: [3.7, 4.9, -9.5], amp: 0.46, speed: 0.12 }
  ];
  barnClouds.forEach((c, idx) => {
    nodes.push(
      geometry
        .custom(barnCloudSpec, {
          name: c.id,
          material: cloudMat,
          castShadow: false,
          receiveShadow: false
        })
        .position(c.at[0], c.at[1], c.at[2])
        .runtime({ id: c.id, tags: ["diorama", "cloud"], mutable: true })
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
 * with fodder silo & animated timber windmill (`barn-windmill-rotor`), wooden
 * water trough with shimmering water, turned milk churns, spoked wagon wheel,
 * golden wheat tufts, and cattail reeds around the animated duck pond.
 */
export const peekabooBarn: WorldDefinition = {
  id: "peekaboo-barn",
  workingTitle: "Peeko Peekaboo Barn",
  ground: { color: "#A5BD68", size: 70 },
  musicBed: "barnBed",
  buildDiorama: peekabooBarnScene,
  dressing: [
    { kind: "model", key: "barn", at: [0, 0, -5.85], heightM: 3.3, tint: "#E26A5C" },
    { kind: "model", key: "tree", at: [-4.55, 0, -4.2], yaw: 0.35, heightM: 2.65 },
    { kind: "model", key: "bush", at: [-2.35, 0, -4.05], yaw: 0.4, heightM: 0.62 },
    { kind: "model", key: "bush", at: [2.25, 0, -4.05], yaw: -0.4, heightM: 0.62 },
    { kind: "model", key: "flower", at: [3.28, 0, 1.55], yaw: -0.3, heightM: 0.42 },
    { kind: "model", key: "cloud", at: [0.3, 4.85, -8.5], yaw: -0.1, heightM: 0.98, castShadow: false }
  ]
};
