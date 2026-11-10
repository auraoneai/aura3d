import {
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import { type ProceduralVec3 } from "@aura3d/engine/procedural";
import {
  buildIslandPlinthNode,
  ceramicMat,
  createDeterministicRng,
  dioramaGroup,
  instanceClayMat,
  lacquerMat,
  plushCloudMat,
  tubeAlongSpline
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type { WorldAnimatedNodeSpec, WorldDefinition, WorldDioramaSlice } from "./worlds.js";

const RAINBOW_BANDS: readonly {
  readonly name: string;
  readonly color: AuraColor;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly z: number;
}[] = [
  { name: "rose", color: "#F58EB6", radiusX: 7.45, radiusY: 5.55, z: -8.9 },
  { name: "buttercup", color: "#FAD06C", radiusX: 7.06, radiusY: 5.18, z: -8.84 },
  { name: "mint", color: "#9BE0B4", radiusX: 6.67, radiusY: 4.81, z: -8.78 },
  { name: "sky", color: "#88C4F4", radiusX: 6.28, radiusY: 4.44, z: -8.72 },
  { name: "lavender", color: "#C3A6F4", radiusX: 5.89, radiusY: 4.07, z: -8.66 }
];

function rainbowSplinePoints(radiusX: number, radiusY: number, z: number): readonly ProceduralVec3[] {
  const pts: ProceduralVec3[] = [];
  const count = 13;
  for (let i = 0; i < count; i += 1) {
    const frac = i / (count - 1);
    const angle = Math.PI * (1 - frac);
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY + 0.35;
    pts.push([x, y, z]);
  }
  return pts;
}

function buildLearningCloudDiorama(): WorldDioramaSlice {
  const rng = createDeterministicRng(0x636c6f75);
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Sculpted plush quilted cloud-island floor (`y = 0.000` inside `r <= 3.75m`,
  //    soft quilted pillow swells around the outer deck — NO flat 90x40m box wall!)
  nodes.push(
    buildIslandPlinthNode({
      name: "learning cloud plush quilted island",
      seed: 606,
      material: plushCloudMat("#FAF5FF", {
        color: "#FFE3F6",
        power: 2.3,
        intensity: 0.36
      }),
      span: [27, 25],
      segments: [56, 52],
      flatStageRadius: 3.75,
      islandRadius: 12.2,
      outerSwellAmplitude: 0.42,
      quiltAmplitude: 0.22,
      plinthBaseY: -1.15
    }),
    primitives.sphere({
      name: "learning cloud underbelly cushion",
      size: [22.5, 2.4, 20.8],
      position: [0, -1.28, -0.3],
      material: plushCloudMat("#EADFF9", false),
      castShadow: false,
      receiveShadow: false
    })
  );

  // 2. 16 Single-draw instanced fluffy cloud billows ringing the cloud-island perimeter
  const billowTransforms: AuraTransformSpec[] = [];
  const billowColors: AuraColor[] = [];
  const billowPalette: readonly AuraColor[] = [
    "#FFFBFD",
    "#F6ECFF",
    "#FCEBF5",
    "#EBF2FF"
  ];
  const billowCount = 16;
  for (let i = 0; i < billowCount; i += 1) {
    const angle = (i / billowCount) * Math.PI * 2 + 0.12;
    const isFront = Math.sin(angle) > 0.45;
    const radius = isFront ? 5.15 + rng() * 0.6 : 4.55 + rng() * 1.35;
    const bx = Math.cos(angle) * radius * 1.14;
    const bz = Math.sin(angle) * radius * 0.96 - 0.55;
    const sy = isFront ? 0.52 + rng() * 0.16 : 0.88 + rng() * 0.42;
    const sx = 1.25 + rng() * 0.55;
    billowTransforms.push({
      position: [bx, isFront ? -0.12 : 0.22 + rng() * 0.26, bz],
      rotation: [0, angle, 0],
      scale: [sx, sy, 1.05 + rng() * 0.35]
    });
    billowColors.push(billowPalette[i % billowPalette.length]!);
  }
  nodes.push(
    instances.sphere({
      name: "learning cloud rim billows",
      size: [1.75, 1.25, 1.55],
      material: instanceClayMat("#FFFFFF"),
      transforms: billowTransforms,
      colors: billowColors,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 3. Smooth 5-Band `tubeAlongSpline` Satin Ceramic Rainbow Arch + fluffy cloud anchors
  for (const band of RAINBOW_BANDS) {
    nodes.push(
      tubeAlongSpline({
        name: `learning cloud satin rainbow ${band.name}`,
        points: rainbowSplinePoints(band.radiusX, band.radiusY, band.z),
        radius: 0.21,
        segments: 64,
        radialSegments: 16,
        material: ceramicMat(band.color, {
          color: "#FFF6FC",
          power: 2.6,
          intensity: 0.28
        }),
        castShadow: false,
        receiveShadow: false
      })
    );
  }

  const anchorCloudMat = plushCloudMat("#FFF9FE");
  for (const side of [-1, 1] as const) {
    const ax = side * 6.65;
    const az = -8.75;
    nodes.push(
      dioramaGroup(
        `learning cloud rainbow anchor ${side < 0 ? "left" : "right"}`,
        [
          primitives.sphere({
            name: `rainbow-anchor-core-${side}`,
            size: [2.75, 1.55, 1.95],
            material: anchorCloudMat,
            castShadow: false,
            receiveShadow: true
          }),
          primitives.sphere({
            name: `rainbow-anchor-inner-${side}`,
            size: [2.05, 1.25, 1.65],
            position: [-side * 0.95, -0.12, 0.22],
            material: anchorCloudMat,
            castShadow: false,
            receiveShadow: true
          }),
          primitives.sphere({
            name: `rainbow-anchor-top-${side}`,
            size: [1.75, 1.15, 1.45],
            position: [side * 0.35, 0.52, 0.1],
            material: anchorCloudMat,
            castShadow: false,
            receiveShadow: true
          })
        ],
        { position: [ax, 0.55, az] }
      )
    );
  }

  // 4. 3 Bevelled Lacquered Floating Storybook Pedestals with Golden Star Trim
  const pedestalSpecs: readonly {
    readonly id: string;
    readonly at: Vec3;
    readonly bodyColor: AuraColor;
    readonly topColor: AuraColor;
    readonly phase: number;
  }[] = [
    {
      id: "cloud-pedestal-1",
      at: [-3.42, 0.22, -2.55],
      bodyColor: "#F8BDD6",
      topColor: "#FDE2EE",
      phase: 0
    },
    {
      id: "cloud-pedestal-2",
      at: [0, 0.28, -3.25],
      bodyColor: "#FCE08B",
      topColor: "#FFF4CC",
      phase: 1.25
    },
    {
      id: "cloud-pedestal-3",
      at: [3.42, 0.22, -2.55],
      bodyColor: "#A6CCF8",
      topColor: "#E1EEFF",
      phase: 2.5
    }
  ];

  const goldStarMat = ceramicMat("#F8C954", { color: "#FFF6D6", power: 2.8, intensity: 0.3 });
  for (const ped of pedestalSpecs) {
    nodes.push(
      dioramaGroup(
        ped.id,
        [
          primitives.cylinder({
            name: `${ped.id}-plinth`,
            size: [0.88, 0.32, 0.88],
            position: [0, 0, 0],
            material: lacquerMat(ped.bodyColor),
            castShadow: true,
            receiveShadow: true
          }),
          primitives.cylinder({
            name: `${ped.id}-cap`,
            size: [0.96, 0.08, 0.96],
            position: [0, 0.18, 0],
            material: lacquerMat(ped.topColor),
            castShadow: true,
            receiveShadow: true
          }),
          primitives.torus({
            name: `${ped.id}-gold-collar`,
            size: [0.92, 0.92, 0.055],
            position: [0, 0.14, 0],
            rotation: [Math.PI * 0.5, 0, 0],
            material: goldStarMat,
            castShadow: false,
            receiveShadow: false
          }),
          primitives.box({
            name: `${ped.id}-star-a`,
            size: [0.18, 0.18, 0.04],
            position: [0, 0.01, 0.44],
            rotation: [0, 0, Math.PI * 0.25],
            material: goldStarMat,
            castShadow: false,
            receiveShadow: false
          }),
          primitives.box({
            name: `${ped.id}-star-b`,
            size: [0.18, 0.18, 0.04],
            position: [0, 0.01, 0.44],
            material: goldStarMat,
            castShadow: false,
            receiveShadow: false
          })
        ],
        { position: ped.at }
      ).runtime({ id: ped.id, tags: ["diorama", "pedestal"], mutable: true })
    );
    animated.push({
      id: ped.id,
      restPosition: ped.at,
      sample: (t) => ({
        position: [
          ped.at[0],
          ped.at[1] + Math.sin(t * 1.05 + ped.phase) * 0.035,
          ped.at[2]
        ]
      })
    });
  }

  // 5. High drifting pastel sky cloud puffs
  const skyCloudMat = plushCloudMat("#FFFBFD", { color: "#FBDDF2", power: 2.4, intensity: 0.32 });
  const skyClouds: readonly {
    readonly id: string;
    readonly at: Vec3;
    readonly scale: number;
    readonly amp: number;
    readonly speed: number;
  }[] = [
    { id: "cloud-puff-drift-1", at: [-4.4, 4.4, -7.2], scale: 1.05, amp: 0.44, speed: 0.16 },
    { id: "cloud-puff-drift-2", at: [4.5, 4.6, -7.4], scale: 1.08, amp: 0.46, speed: 0.14 }
  ];
  skyClouds.forEach((c, idx) => {
    nodes.push(
      dioramaGroup(
        c.id,
        [
          primitives.sphere({ name: `${c.id}-core`, size: [1.55, 0.88, 1.02], material: skyCloudMat, castShadow: false, receiveShadow: false }),
          primitives.sphere({ name: `${c.id}-l`, size: [1.08, 0.72, 0.88], position: [-0.72, -0.07, 0.05], material: skyCloudMat, castShadow: false, receiveShadow: false }),
          primitives.sphere({ name: `${c.id}-r`, size: [1.12, 0.74, 0.9], position: [0.72, -0.06, -0.04], material: skyCloudMat, castShadow: false, receiveShadow: false })
        ],
        { position: c.at, scale: c.scale }
      ).runtime({ id: c.id, tags: ["diorama", "cloud"], mutable: true })
    );
    animated.push({
      id: c.id,
      restPosition: c.at,
      sample: (t) => ({
        position: [
          c.at[0] + Math.sin(t * c.speed + idx * 2.2) * c.amp,
          c.at[1] + Math.cos(t * c.speed * 0.8 + idx) * 0.05,
          c.at[2]
        ]
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
 * Learning Cloud — sculpted plush quilted cloud-island floor surrounded by 16
 * single-draw instanced cloud billows, a smooth 5-band `tubeAlongSpline` satin
 * ceramic rainbow arch against a rich periwinkle & rose-gold sky, and 3
 * bevelled lacquered floating storybook pedestals with golden star badges.
 */
export const learningCloud: WorldDefinition = {
  id: "learning-cloud",
  workingTitle: "Lumi Learning Cloud",
  ground: { color: "#B8C6F4", size: 70 },
  musicBed: "cloudBed",
  buildDiorama: buildLearningCloudDiorama,
  dressing: [
    // Declarative concentric rainbow band metadata retained for layout/clearance
    // inspection; superseded at build time by the 5-band `tubeAlongSpline` arch.
    {
      kind: "primitive",
      shape: "torus",
      at: [0, 3.6, -13.9],
      size: [16.0, 16.0, 1.44],
      color: "#F58EB6",
      castShadow: false,
      replacedByDiorama: true
    },
    {
      kind: "primitive",
      shape: "torus",
      at: [0, 3.6, -13.82],
      size: [12.95, 12.95, 1.165],
      color: "#FAD06C",
      castShadow: false,
      replacedByDiorama: true
    },
    {
      kind: "primitive",
      shape: "torus",
      at: [0, 3.6, -13.74],
      size: [10.48, 10.48, 0.943],
      color: "#88C4F4",
      castShadow: false,
      replacedByDiorama: true
    },
    { kind: "model", key: "cloud", at: [-3.2, 4.65, -7.8], yaw: 0.1, heightM: 0.96, castShadow: false },
    { kind: "model", key: "cloud", at: [3.3, 4.95, -8.2], yaw: -0.12, heightM: 1.04, castShadow: false },
    { kind: "model", key: "cloud", at: [-1.1, 5.25, -11.4], yaw: 0.06, heightM: 1.38, castShadow: false }
  ]
};
