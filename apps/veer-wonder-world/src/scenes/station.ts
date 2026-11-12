import {
  geometry,
  instances,
  lights,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { path2d, type ComposePart, type ProceduralVec2, type ProceduralVec3 } from "@aura3d/engine/procedural";
import {
  brushedMetalMat,
  buildBackdropHillNode,
  buildIslandPlinthNode,
  cachedDioramaSpec,
  ceramicMat,
  clayMat,
  clearcoatPaintMat,
  clockDialMat,
  composeGeometry,
  coneSpec,
  cylinderSpec,
  dioramaGroup,
  extrudeContour,
  fabricMat,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  plushCloudMat,
  railTrackSleepers,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  splitInstancePlacements,
  srgbHexToLinearRgba,
  stoneMat,
  torusSpec,
  warmPracticalGlowMat,
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

/** The front straight railway track runs along `z = TRACK_Z`, under the back spots. */
export const TRACK_Z = -1.6;

const PLATFORM_PROFILE = path2d()
  .moveTo(-0.04, -0.58)
  .lineTo(-0.04, 0.58)
  .lineTo(0.17, 0.58)
  .quadTo(0.22, 0.58, 0.22, 0.52)
  .lineTo(0.22, -0.52)
  .quadTo(0.22, -0.58, 0.17, -0.58)
  .close()
  .points({ curveSegments: 3 });

const OVAL_TRACK_CENTERLINE: readonly ProceduralVec3[] = [
  [-5.8, 0.002, TRACK_Z],
  [-2.6, 0.002, TRACK_Z],
  [0, 0.002, TRACK_Z],
  [2.8, 0.002, TRACK_Z],
  [5.8, 0.002, TRACK_Z],
  [7.8, 0.002, -2.65],
  [8.2, 0.002, -5.25],
  [5.8, 0.002, -7.75],
  [0, 0.002, -8.45],
  [-5.8, 0.002, -7.75],
  [-8.2, 0.002, -5.25],
  [-7.8, 0.002, -2.65]
];

function buildPlatformLuggageTrolley(): AuraNodeBuilder<AuraSceneNode> {
  const woodDeckSpec = cachedDioramaSpec("station-luggage-trolley-deck", () => {
    const parts: ComposePart[] = [];
    for (let i = -2; i <= 2; i += 1) {
      parts.push({
        geometry: roundedBoxSpec(0.76, 0.032, 0.072, 0.008),
        position: [0, 0.16, i * 0.082]
      });
    }
    parts.push(
      { geometry: roundedBoxSpec(0.8, 0.042, 0.038, 0.008), position: [0, 0.16, 0.22] },
      { geometry: roundedBoxSpec(0.8, 0.042, 0.038, 0.008), position: [0, 0.16, -0.22] }
    );
    return composeGeometry(parts);
  });

  const brassHardwareSpec = cachedDioramaSpec("station-luggage-trolley-hardware", () => {
    const parts: ComposePart[] = [];
    const wheel = torusSpec(0.078, 0.016, 20, 10);
    const hub = cylinderSpec(0.024, 0.024, 0.04, 14);
    const spoke = cylinderSpec(0.007, 0.007, 0.145, 8);
    const wheelLocs: readonly [number, number][] = [
      [-0.27, 0.2],
      [0.27, 0.2],
      [-0.27, -0.2],
      [0.27, -0.2]
    ];
    for (const [wx, wz] of wheelLocs) {
      parts.push(
        { geometry: wheel, position: [wx, 0.088, wz] },
        { geometry: hub, position: [wx, 0.088, wz], rotation: [Math.PI * 0.5, 0, 0] },
        { geometry: spoke, position: [wx, 0.088, wz] },
        { geometry: spoke, position: [wx, 0.088, wz], rotation: [0, 0, Math.PI * 0.5] }
      );
    }
    // Curved tubular push handle on right end + suitcase clasps/handles
    parts.push(
      {
        geometry: sculptCurvedLimb(
          [
            [0.37, 0.17, -0.18],
            [0.42, 0.56, -0.18],
            [0.42, 0.58, 0],
            [0.42, 0.56, 0.18],
            [0.37, 0.17, 0.18]
          ],
          0.016,
          { steps: 22, radialSegments: 10 }
        )
      },
      // Lower suitcase arched handle & clasps
      {
        geometry: sculptCurvedLimb(
          [
            [-0.08, 0.36, 0.17],
            [0, 0.4, 0.19],
            [0.08, 0.36, 0.17]
          ],
          0.011,
          { steps: 10, radialSegments: 8 }
        )
      },
      { geometry: roundedBoxSpec(0.032, 0.045, 0.018, 0.004), position: [-0.13, 0.31, 0.175] },
      { geometry: roundedBoxSpec(0.032, 0.045, 0.018, 0.004), position: [0.13, 0.31, 0.175] },
      // Upper suitcase arched handle
      {
        geometry: sculptCurvedLimb(
          [
            [-0.08, 0.51, 0.13],
            [-0.02, 0.55, 0.14],
            [0.04, 0.51, 0.13]
          ],
          0.01,
          { steps: 10, radialSegments: 8 }
        )
      }
    );
    return composeGeometry(parts);
  });

  const lowerSuitcaseSpec = cachedDioramaSpec("station-stitched-suitcase-lower", () =>
    composeGeometry([
      { geometry: roundedBoxSpec(0.48, 0.19, 0.33, 0.028), position: [-0.03, 0.275, 0] },
      { geometry: roundedBoxSpec(0.042, 0.202, 0.344, 0.01), position: [-0.16, 0.275, 0] },
      { geometry: roundedBoxSpec(0.042, 0.202, 0.344, 0.01), position: [0.1, 0.275, 0] }
    ])
  );

  const upperSuitcaseSpec = cachedDioramaSpec("station-stitched-suitcase-upper", () =>
    composeGeometry([
      {
        geometry: roundedBoxSpec(0.36, 0.15, 0.25, 0.024),
        position: [-0.02, 0.445, -0.01],
        rotation: [0, 0.18, 0]
      },
      {
        geometry: roundedBoxSpec(0.036, 0.162, 0.262, 0.008),
        position: [-0.12, 0.445, -0.028],
        rotation: [0, 0.18, 0]
      },
      {
        geometry: roundedBoxSpec(0.036, 0.162, 0.262, 0.008),
        position: [0.08, 0.445, 0.008],
        rotation: [0, 0.18, 0]
      }
    ])
  );

  return dioramaGroup(
    "station platform luggage trolley",
    [
      geometry.custom(woodDeckSpec, {
        name: "station trolley slatted oak deck",
        material: woodMat("#B88452"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(brassHardwareSpec, {
        name: "station trolley brass wheels and frame",
        material: brushedMetalMat("#D9B25F"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(lowerSuitcaseSpec, {
        name: "station stitched cognac suitcase",
        material: fabricMat("#B96B43", undefined, "quiltedStitch"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(upperSuitcaseSpec, {
        name: "station stitched teal suitcase",
        material: fabricMat("#5E98A8", undefined, "quiltedStitch"),
        castShadow: true,
        receiveShadow: true
      })
    ],
    { position: [2.84, 0.22, -2.86], rotation: [0, -0.14, 0] }
  );
}

function buildWroughtIronLamppost(): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const postPos: Vec3 = [0.96, 0.22, -2.92];
  const lanternWorld: Vec3 = [postPos[0] + 0.26, postPos[1] + 2.02, postPos[2] + 0.14];

  const ironworkSpec = cachedDioramaSpec("station-wrought-iron-lamppost", () => {
    const postProfile: ProceduralVec2[] = [
      [0, 0],
      [0.135, 0],
      [0.13, 0.12],
      [0.095, 0.22],
      [0.068, 0.34],
      [0.056, 1.35],
      [0.072, 1.42],
      [0.048, 1.98],
      [0.068, 2.08],
      [0.032, 2.18],
      [0, 2.22]
    ];
    const column = sculptOrganicLathe(postProfile, { segments: 22 });
    const bracket = sculptCurvedLimb(
      [
        [0, 1.88, 0],
        [0.14, 2.16, 0.08],
        [0.26, 2.18, 0.14],
        [0.26, 2.11, 0.14]
      ],
      0.018,
      { steps: 16, radialSegments: 10 }
    );
    const scrollBrace = sculptCurvedLimb(
      [
        [0.03, 1.68, 0.02],
        [0.15, 1.84, 0.08],
        [0.2, 2.06, 0.11]
      ],
      0.012,
      { steps: 12, radialSegments: 8 }
    );
    const lanternCap = coneSpec(0.155, 0.14, 8, 0.02);
    const lanternBase = cylinderSpec(0.085, 0.055, 0.06, 8);
    return composeGeometry([
      { geometry: column },
      { geometry: bracket },
      { geometry: scrollBrace },
      { geometry: lanternCap, position: [0.26, 2.13, 0.14] },
      { geometry: lanternBase, position: [0.26, 1.89, 0.14] }
    ]);
  });

  const lanternGlassSpec = cachedDioramaSpec("station-lantern-glass", () =>
    cylinderSpec(0.105, 0.082, 0.19, 8)
  );

  return [
    dioramaGroup(
      "station wrought iron lamppost",
      [
        geometry.custom(ironworkSpec, {
          name: "station lamppost fluted ironwork",
          material: brushedMetalMat("#3B4D49"),
          castShadow: true,
          receiveShadow: true
        }),
        geometry
          .custom(lanternGlassSpec, {
            name: "station lamppost warm lantern",
            material: warmPracticalGlowMat("#FFF5DC", "#FFD48A", 1.35),
            castShadow: false,
            receiveShadow: false
          })
          .position(0.26, 2.01, 0.14)
      ],
      { position: postPos }
    ),
    lights.point({
      name: "station platform lantern fill",
      position: [lanternWorld[0], lanternWorld[1] - 0.06, lanternWorld[2] + 0.05],
      color: "#FFE2A8",
      intensity: 1.45,
      distance: 6.2,
      decay: 2
    })
  ];
}

export function stationScene(ctx: WorldDioramaContext): WorldDioramaSlice {
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Meadow-sage felt island plinth (strictly y = 0.000 inside r <= 3.75m)
  nodes.push(
    buildIslandPlinthNode({
      name: "station sage island plinth",
      seed: 404,
      material: feltMat("#8FBB7D"),
      span: [34, 30],
      segments: [38, 36],
      flatStageRadius: 3.75,
      islandRadius: 14.6,
      outerSwellAmplitude: 0.36,
      plinthBaseY: -1.1
    }),
    primitives.cylinder({
      name: "station clay plinth base",
      size: [30.8, 0.44, 27.8],
      position: [0, -0.92, 0],
      material: clayMat("#C5B49C", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Sculpted pine-covered backdrop hills (left tunnel mountain + valley ridge + east hill)
  nodes.push(
    buildBackdropHillNode({
      name: "station left tunnel mountain",
      seed: 411,
      position: [-6.8, -0.15, -4.6],
      size: [9.2, 7.8],
      peakHeight: 2.25,
      material: feltMat("#84B076", false),
      rotationY: 0.22
    }),
    buildBackdropHillNode({
      name: "station north valley ridge",
      seed: 412,
      position: [0, -0.22, -12.2],
      size: [19.4, 10.2],
      peakHeight: 3.05,
      material: feltMat("#739E68", false)
    }),
    buildBackdropHillNode({
      name: "station east meadow hill",
      seed: 413,
      position: [8.4, -0.2, -9.4],
      size: [14.0, 9.0],
      peakHeight: 2.45,
      material: feltMat("#80AB73", false),
      rotationY: -0.18
    })
  );

  // 3. Continuous closed-oval `railTrackSleepers` (stone ballast + `instances.custom` oak sleepers + swept steel I-rails)
  nodes.push(
    railTrackSleepers({
      name: "station scenic track loop",
      points: OVAL_TRACK_CENTERLINE,
      closed: true,
      sleeperCount: 58,
      gauge: 0.54,
      ballastColor: "#CFC8BC",
      sleeperColor: "#9A6B44",
      railColor: "#CFD7E0"
    })
  );

  // 4. Bevelled limestone station platform + safety stripe + canopy bench + luggage trolley + lamppost + clock
  nodes.push(
    extrudeContour({
      name: "station bevelled stone platform",
      profile: PLATFORM_PROFILE,
      from: [0.75, 0, -2.85],
      to: [5.75, 0, -2.85],
      material: stoneMat("#EAE0CE"),
      castShadow: true,
      receiveShadow: true
    }),
    primitives.box({
      name: "station yellow tactile safety stripe",
      size: [4.86, 0.016, 0.11],
      position: [3.25, 0.224, -2.36],
      material: ceramicMat("#F6C948", false),
      castShadow: false,
      receiveShadow: true
    }),
    dioramaGroup(
      "station waiting bench and canopy",
      [
        primitives.box({
          name: "station bench seat",
          size: [1.14, 0.07, 0.36],
          position: [0, 0.28, 0.04],
          material: woodMat("#C9925B"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.box({
          name: "station bench backrest",
          size: [1.14, 0.32, 0.06],
          position: [0, 0.48, -0.12],
          material: woodMat("#C9925B"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "station canopy post left",
          size: [0.07, 1.52, 0.07],
          position: [-0.52, 0.76, -0.14],
          material: clearcoatPaintMat("#4F7D69"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "station canopy post right",
          size: [0.07, 1.52, 0.07],
          position: [0.52, 0.76, -0.14],
          material: clearcoatPaintMat("#4F7D69"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.box({
          name: "station canopy pitched roof",
          size: [1.42, 0.1, 0.76],
          position: [0, 1.55, 0.02],
          rotation: [0.14, 0, 0],
          material: clearcoatPaintMat("#5D8E78"),
          castShadow: true,
          receiveShadow: true
        })
      ],
      { position: [1.68, 0.22, -2.96] }
    ),
    buildPlatformLuggageTrolley(),
    ...buildWroughtIronLamppost(),
    dioramaGroup(
      "station clock post",
      [
        primitives.cylinder({
          name: "station clock iron post",
          size: [0.08, 1.88, 0.08],
          position: [0, 0.94, 0],
          material: clearcoatPaintMat("#4A6B62"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "station clock brass bezel",
          size: [0.52, 0.1, 0.52],
          position: [0, 1.98, 0],
          rotation: [Math.PI * 0.5, 0, 0],
          material: brushedMetalMat("#E4BE66"),
          castShadow: true,
          receiveShadow: false
        }),
        primitives.cylinder({
          name: "station clock cream dial",
          size: [0.42, 0.12, 0.42],
          position: [0, 1.98, 0.01],
          rotation: [Math.PI * 0.5, 0, 0],
          material: clockDialMat("#FFFDF5"),
          castShadow: false,
          receiveShadow: false
        }),
        primitives.box({
          name: "station clock minute hand",
          size: [0.03, 0.15, 0.02],
          position: [0, 2.04, 0.08],
          material: clearcoatPaintMat("#364152", false),
          castShadow: false,
          receiveShadow: false
        }),
        primitives.box({
          name: "station clock hour hand",
          size: [0.12, 0.03, 0.02],
          position: [0.05, 1.98, 0.08],
          material: clearcoatPaintMat("#D65A4E", false),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: [4.92, 0.22, -2.98] }
    )
  );

  // 5. Friendly railway semaphore post + gently nodding mint/coral signal paddle (`station-semaphore-arm`)
  const semPostX = -2.92;
  const semPostZ = -2.62;
  const armPivot: Vec3 = [semPostX, 1.72, semPostZ];
  nodes.push(
    primitives.cylinder({
      name: "station semaphore mast",
      size: [0.09, 1.92, 0.09],
      position: [semPostX, 0.96, semPostZ],
      material: clearcoatPaintMat("#F4EFE4"),
      castShadow: true,
      receiveShadow: true
    }),
    dioramaGroup(
      "station-semaphore-arm",
      [
        primitives.box({
          name: "station semaphore paddle blade",
          size: [0.58, 0.14, 0.05],
          position: [0.26, 0, 0.04],
          material: clearcoatPaintMat("#E86B58"),
          castShadow: true,
          receiveShadow: false
        }),
        primitives.cylinder({
          name: "station semaphore mint hub",
          size: [0.18, 0.08, 0.18],
          position: [0, 0, 0.04],
          rotation: [Math.PI * 0.5, 0, 0],
          material: ceramicMat("#8CD8B2"),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: armPivot }
    ).runtime({ id: "station-semaphore-arm", tags: ["diorama", "semaphore"], mutable: true })
  );
  animated.push({
    id: "station-semaphore-arm",
    restPosition: armPivot,
    restRotation: [0, 0, 0.18],
    sample: (t) => ({
      position: armPivot,
      rotation: [0, 0, 0.18 + Math.sin(t * 0.9) * 0.08]
    })
  });

  // 6. Single-draw instanced sculpted hillside conifer pines (with GPU wind) & drifting cumulus clouds
  const pineTreeSpec = cachedDioramaSpec("station-sculpted-conifer", () =>
    composeGeometry([
      { geometry: cylinderSpec(0.08, 0.11, 0.42, 12), position: [0, 0.21, 0], color: srgbHexToLinearRgba("#7E5838") },
      { geometry: coneSpec(0.5, 0.92, 16, 0.04), position: [0, 0.72, 0], color: srgbHexToLinearRgba("#FFFFFF") },
      { geometry: coneSpec(0.39, 0.82, 16, 0.035), position: [0, 1.2, 0], color: srgbHexToLinearRgba("#FFFFFF") },
      { geometry: coneSpec(0.28, 0.68, 16, 0.03), position: [0, 1.62, 0], color: srgbHexToLinearRgba("#FFFFFF") }
    ])
  );

  const pinePositions: readonly [number, number, number, number][] = [
    [-6.6, 0.45, -5.8, 1.08],
    [-4.8, 0.35, -7.8, 1.24],
    [-2.4, 0.38, -9.2, 1.2],
    [2.6, 0.38, -9.1, 1.22],
    [4.9, 0.32, -7.4, 1.14],
    [6.8, 0.25, -6.2, 1.1],
    [-5.8, 0.06, -3.7, 0.92],
    [6.3, 0.18, -2.9, 0.9]
  ];
  const pineShades: readonly AuraColor[] = ["#568F63", "#649E6F", "#4D835A"];
  const pineInstances: AuraInstanceInput[] = pinePositions.map(([px, py, pz, s], idx) => ({
    position: [px, py, pz],
    rotation: [0, idx * 0.9, 0],
    scale: s,
    color: pineShades[idx % pineShades.length]!
  }));
  const pineWind = gentleBreezeWind(ctx.reducedMotion, 0.18, 1.8, 30);
  nodes.push(
    instances.custom(pineTreeSpec, {
      name: "station hillside pine crowns",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(pineInstances),
      ...(pineWind ? { wind: pineWind } : {}),
      castShadow: true,
      receiveShadow: true
    })
  );

  const cloudPuffMat = plushCloudMat("#FFFDF9");
  const stationCloudSpec = cachedDioramaSpec("station-cumulus-puff", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.5, 0.84, 0.98] },
        { position: [-0.68, -0.06, 0.04], scale: [1.05, 0.68, 0.84] },
        { position: [0.7, -0.05, -0.04], scale: [1.1, 0.72, 0.86] }
      ],
      { seed: 431, amplitude: 0.025, frequency: 2.4 }
    );
    return built.geometry;
  });

  const stationClouds: readonly { readonly id: string; readonly at: Vec3; readonly amp: number; readonly speed: number }[] = [
    { id: "station-cloud-drift-1", at: [-3.8, 4.7, -9.2], amp: 0.44, speed: 0.15 },
    { id: "station-cloud-drift-2", at: [3.4, 5.0, -9.8], amp: 0.48, speed: 0.13 }
  ];
  stationClouds.forEach((c, idx) => {
    nodes.push(
      geometry
        .custom(stationCloudSpec, {
          name: c.id,
          material: cloudPuffMat,
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
        position: [c.at[0] + Math.sin(t * c.speed + idx * 1.9) * c.amp, c.at[1], c.at[2]]
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
 * GoGo Station — meadow-sage island, continuous `railTrackSleepers` loop with
 * batched oak sleepers & swept steel I-rails entering the brick `tunnel`,
 * bevelled stone platform with vintage wooden luggage trolley & 2 stitched
 * suitcases, wrought-iron lamppost with warm practical lantern, dial clock,
 * and nodding semaphore.
 */
export const station: WorldDefinition = {
  id: "station",
  workingTitle: "GoGo Station",
  ground: { color: "#8FBB7D", size: 70 },
  musicBed: "stationBed",
  buildDiorama: stationScene,
  dressing: [
    { kind: "model", key: "station", at: [3.45, 0.2, -4.05], heightM: 2.55 },
    { kind: "model", key: "tunnel", at: [-5.8, 0, TRACK_Z], heightM: 1.85, yaw: Math.PI / 2 },
    { kind: "model", key: "bush", at: [-3.6, 0, -3.7], heightM: 0.76 },
    { kind: "model", key: "bush", at: [6.4, 0, -3.2], heightM: 0.76 },
    { kind: "model", key: "tree", at: [-6.5, 0, -7.0], heightM: 2.9 },
    { kind: "model", key: "tree", at: [7.4, 0, -8.0], heightM: 2.75 },
    { kind: "model", key: "cloud", at: [0.2, 4.85, -8.6], yaw: 0.08, heightM: 0.96, castShadow: false }
  ]
};
