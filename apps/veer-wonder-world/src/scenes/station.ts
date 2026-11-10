import {
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import { catmullRomCurve, path2d, sampleCurve, type ProceduralVec3 } from "@aura3d/engine/procedural";
import {
  brushedMetalMat,
  buildBackdropHillNode,
  buildIslandPlinthNode,
  ceramicMat,
  clayMat,
  clearcoatPaintMat,
  dioramaGroup,
  extrudeContour,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  instanceWoodMat,
  plushCloudMat,
  ribbonAlongSpline,
  tubeAlongSpline,
  woodMat
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

function ovalTrackPoints(railOffset: number, y: number): readonly ProceduralVec3[] {
  // Closed scenic railway loop: straight across the stage along z = TRACK_Z,
  // entering the grassy brick tunnel on the left (-5.8) and looping behind the mountain!
  const raw: readonly [number, number][] = [
    [-5.8, TRACK_Z],
    [-2.6, TRACK_Z],
    [0, TRACK_Z],
    [2.8, TRACK_Z],
    [5.8, TRACK_Z],
    [7.8, -2.65],
    [8.2, -5.25],
    [5.8, -7.75],
    [0, -8.45],
    [-5.8, -7.75],
    [-8.2, -5.25],
    [-7.8, -2.65]
  ];
  const centerX = 0;
  const centerZ = -5.02;
  return raw.map(([x, z]) => {
    if (Math.abs(railOffset) < 1e-6) {
      return [x, y, z];
    }
    if (Math.abs(z - TRACK_Z) < 1e-4 && Math.abs(x) <= 5.85) {
      return [x, y, z + railOffset];
    }
    const dx = x - centerX;
    const dz = z - centerZ;
    const len = Math.hypot(dx, dz) || 1;
    return [x + (dx / len) * railOffset, y, z + (dz / len) * railOffset];
  });
}

function buildStationDiorama(ctx: WorldDioramaContext): WorldDioramaSlice {
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Meadow-sage felt island plinth (strictly y = 0.000 inside r <= 3.75m)
  nodes.push(
    buildIslandPlinthNode({
      name: "station sage island plinth",
      seed: 404,
      material: feltMat("#8FBB7D"),
      span: [34, 30],
      segments: [56, 52],
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

  // 3. Continuous closed-oval limestone gravel ballast trackbed + cedar sleepers + brushed-steel rails
  const centerLoop = ovalTrackPoints(0, 0.002);
  nodes.push(
    ribbonAlongSpline({
      name: "station limestone gravel ballast bed",
      points: centerLoop,
      halfWidthBottom: 0.62,
      halfWidthTop: 0.48,
      height: 0.028,
      baseY: -0.02,
      segments: 96,
      closed: true,
      material: clayMat("#CFC8BC", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  const loopCurve = catmullRomCurve(centerLoop, { closed: true });
  const sampled = sampleCurve(loopCurve, 56);
  const sleeperTransforms: AuraTransformSpec[] = [];
  for (let i = 0; i < sampled.points.length - 1; i += 1) {
    const pt = sampled.points[i]!;
    const tg = sampled.tangents[i]!;
    const yaw = Math.atan2(tg[0], tg[2]);
    sleeperTransforms.push({
      position: [pt[0], 0.026, pt[2]],
      rotation: [0, yaw, 0]
    });
  }
  nodes.push(
    instances.roundedBox({
      name: "station cedar track sleepers",
      size: [0.84, 0.028, 0.13],
      material: instanceWoodMat("#A9784E"),
      transforms: sleeperTransforms,
      castShadow: false,
      receiveShadow: true
    }),
    tubeAlongSpline({
      name: "station outer brushed steel rail",
      points: ovalTrackPoints(0.28, 0.052),
      radius: 0.024,
      segments: 104,
      radialSegments: 10,
      closed: true,
      material: brushedMetalMat("#CFD7E0"),
      castShadow: false,
      receiveShadow: true
    }),
    tubeAlongSpline({
      name: "station inner brushed steel rail",
      points: ovalTrackPoints(-0.28, 0.052),
      radius: 0.024,
      segments: 104,
      radialSegments: 10,
      closed: true,
      material: brushedMetalMat("#CFD7E0"),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 4. Bevelled limestone station platform on the right + yellow tactile safety stripe + canopy bench
  nodes.push(
    extrudeContour({
      name: "station bevelled stone platform",
      profile: PLATFORM_PROFILE,
      from: [0.75, 0, -2.85],
      to: [5.75, 0, -2.85],
      material: clayMat("#EAE0CE"),
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
      { position: [1.62, 0.22, -2.96] }
    ),
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
          material: ceramicMat("#FFFDF5", false),
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

  // Friendly railway semaphore post + gently nodding mint/coral signal paddle
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

  // 5. Single-draw instanced hillside conifer pines (with GPU wind) & drifting clouds
  const pinePositions: readonly [number, number, number, number][] = [
    [-6.6, 0.65, -5.8, 1.12],
    [-4.8, 0.45, -7.8, 1.3],
    [-2.4, 0.5, -9.2, 1.25],
    [2.6, 0.5, -9.1, 1.28],
    [4.9, 0.42, -7.4, 1.18],
    [6.8, 0.35, -6.2, 1.14],
    [-5.8, 0.12, -3.7, 0.96],
    [6.3, 0.25, -2.9, 0.94]
  ];
  const pineConeTransforms: AuraTransformSpec[] = [];
  const pineConeColors: AuraColor[] = [];
  const pineShades: readonly AuraColor[] = ["#568F63", "#649E6F", "#4D835A"];
  pinePositions.forEach(([px, py, pz, s], idx) => {
    pineConeTransforms.push(
      { position: [px, py + 0.55 * s, pz], scale: [1.05 * s, 0.95 * s, 1.05 * s] },
      { position: [px, py + 1.05 * s, pz], scale: [0.8 * s, 0.85 * s, 0.8 * s] }
    );
    pineConeColors.push(pineShades[idx % pineShades.length]!, pineShades[(idx + 1) % pineShades.length]!);
  });
  const pineWind = gentleBreezeWind(ctx.reducedMotion, 0.18, 1.2, 30);
  nodes.push(
    instances.cone({
      name: "station hillside pine crowns",
      size: [0.92, 1.05, 0.92],
      material: instanceClayMat("#FFFFFF"),
      transforms: pineConeTransforms,
      colors: pineConeColors,
      ...(pineWind ? { wind: pineWind } : {}),
      castShadow: true,
      receiveShadow: true
    })
  );

  const cloudPuffMat = plushCloudMat("#FFFDF9");
  const stationClouds: readonly { readonly id: string; readonly at: Vec3; readonly amp: number; readonly speed: number }[] = [
    { id: "station-cloud-drift-1", at: [-3.8, 4.7, -9.2], amp: 0.44, speed: 0.15 },
    { id: "station-cloud-drift-2", at: [3.4, 5.0, -9.8], amp: 0.48, speed: 0.13 }
  ];
  stationClouds.forEach((c, idx) => {
    nodes.push(
      dioramaGroup(
        c.id,
        [
          primitives.sphere({ name: `${c.id}-a`, size: [1.5, 0.84, 0.98], material: cloudPuffMat, castShadow: false, receiveShadow: false }),
          primitives.sphere({ name: `${c.id}-b`, size: [1.05, 0.68, 0.84], position: [-0.68, -0.06, 0.04], material: cloudPuffMat, castShadow: false, receiveShadow: false }),
          primitives.sphere({ name: `${c.id}-c`, size: [1.1, 0.72, 0.86], position: [0.7, -0.05, -0.04], material: cloudPuffMat, castShadow: false, receiveShadow: false })
        ],
        { position: c.at }
      ).runtime({ id: c.id, tags: ["diorama", "cloud"], mutable: true })
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
 * GoGo Station — meadow-sage island, raised limestone gravel ballast bed,
 * continuous closed-oval brushed-steel rails & cedar sleepers looping into the
 * grassy brick `tunnel` on the left, bevelled stone platform on the right with
 * yellow tactile safety stripe, canopy bench, clock, semaphore, and hillside pines.
 */
export const station: WorldDefinition = {
  id: "station",
  workingTitle: "GoGo Station",
  ground: { color: "#8FBB7D", size: 70 },
  musicBed: "stationBed",
  buildDiorama: buildStationDiorama,
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
