import {
  geometry,
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { type ComposePart, type ProceduralVec2, type ProceduralVec3 } from "@aura3d/engine/procedural";
import {
  brushedMetalMat,
  buildIslandPlinthNode,
  cachedDioramaSpec,
  ceramicMat,
  composeGeometry,
  createDeterministicRng,
  cylinderSpec,
  dioramaGroup,
  ellipsoidSpec,
  extrudeContourSpec,
  fabricMat,
  feltMat,
  instanceFeltMat,
  lacquerMat,
  pastelRainbowRibbons,
  plushCloudMat,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  splitInstancePlacements,
  torusSpec,
  type AuraInstanceInput
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type {
  WorldAnimatedNodeSpec,
  WorldDefinition,
  WorldDioramaContext,
  WorldDioramaSlice
} from "./worlds.js";

function starPolygon2D(outerR: number, innerR: number, points = 5): readonly ProceduralVec2[] {
  const ring: ProceduralVec2[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const ang = (i / total) * Math.PI * 2 - Math.PI * 0.5;
    ring.push([Math.cos(ang) * r, -Math.sin(ang) * r]);
  }
  return ring;
}

function buildCrescentReadingPerch(): AuraNodeBuilder<AuraSceneNode> {
  const cloudletSpec = cachedDioramaSpec("learning-cloud-perch-cloudlet", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.85, 0.88, 1.35] },
        { position: [-0.68, 0.08, 0.12], scale: [1.18, 0.76, 1.02] },
        { position: [0.7, 0.1, -0.08], scale: [1.22, 0.78, 1.04] },
        { position: [0.05, 0.26, -0.15], scale: [1.05, 0.68, 0.92] }
      ],
      { seed: 641, amplitude: 0.028, frequency: 2.3 }
    );
    return built.geometry;
  });

  const crescentSpec = cachedDioramaSpec("learning-cloud-crescent-perch", () => {
    const spine: ProceduralVec3[] = [];
    const steps = 22;
    const startAng = Math.PI * 0.24;
    const endAng = Math.PI * 1.62;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = startAng + t * (endAng - startAng);
      spine.push([Math.cos(a) * 0.78, Math.sin(a) * 0.78 + 0.82, 0]);
    }
    return sculptCurvedLimb(
      spine,
      (t) => {
        const belly = Math.sin(t * Math.PI);
        return 0.032 + belly * 0.165;
      },
      {
        steps: 32,
        radialSegments: 18,
        profileScaleX: 1.0,
        profileScaleY: 0.76
      }
    );
  });

  const cushionSpec = cachedDioramaSpec("learning-cloud-perch-cushion", () =>
    ellipsoidSpec(0.32, 0.11, 0.26, 20, 14)
  );

  return dioramaGroup(
    "learning cloud crescent moon perch",
    [
      geometry.custom(cloudletSpec, {
        name: "learning cloud distant reading cloudlet",
        material: plushCloudMat("#FFFBFD"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry
        .custom(crescentSpec, {
          name: "learning cloud golden crescent cradle",
          material: ceramicMat("#FAD36B", { color: "#FFF8DE", power: 2.6, intensity: 0.32 }),
          castShadow: true,
          receiveShadow: true
        })
        .position(0.08, 0.12, 0),
      geometry
        .custom(cushionSpec, {
          name: "learning cloud quilted reading cushion",
          material: fabricMat("#D8B8FA", undefined, "quiltedStitch"),
          castShadow: true,
          receiveShadow: true
        })
        .position(-0.08, 0.36, 0.04)
    ],
    { position: [4.65, 2.45, -6.95], rotation: [0, -0.34, 0] }
  );
}

function buildStarPrismMobile(
  id: "cloud-mobile-left" | "cloud-mobile-right",
  pivot: Vec3,
  phase: number,
  animated: WorldAnimatedNodeSpec[]
): AuraNodeBuilder<AuraSceneNode> {
  const frameSpec = cachedDioramaSpec("learning-cloud-mobile-frame", () => {
    const hoop = composeGeometry([
      { geometry: torusSpec(0.42, 0.018, 28, 12), rotation: [Math.PI * 0.5, 0, 0] },
      { geometry: cylinderSpec(0.012, 0.012, 0.84, 10), rotation: [0, 0, Math.PI * 0.5] },
      { geometry: cylinderSpec(0.012, 0.012, 0.84, 10), rotation: [Math.PI * 0.5, 0, 0] },
      { geometry: cylinderSpec(0.01, 0.01, 0.45, 8), position: [0, 0.22, 0] }
    ]);
    const cordLengths: readonly [number, number, number][] = [
      [-0.36, 0, 0.38],
      [0.36, 0, 0.48],
      [0, 0.36, 0.32],
      [0, -0.36, 0.44]
    ];
    const parts: ComposePart[] = [{ geometry: hoop }];
    for (const [cx, cz, len] of cordLengths) {
      parts.push({
        geometry: cylinderSpec(0.006, 0.006, len, 8),
        position: [cx, -len * 0.5, cz]
      });
    }
    return composeGeometry(parts);
  });

  const starPrismSpec = cachedDioramaSpec("learning-cloud-faceted-star-prism", () =>
    extrudeContourSpec({
      outer: starPolygon2D(0.145, 0.068, 5),
      depth: 0.065,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      bevelSegments: 2
    })
  );

  const starDrops: readonly { readonly pos: Vec3; readonly color: AuraColor; readonly yaw: number }[] = [
    { pos: [-0.36, -0.44, 0], color: "#FCE07E", yaw: 0.2 },
    { pos: [0.36, -0.54, 0], color: "#F7A8C8", yaw: -0.35 },
    { pos: [0, -0.38, 0.36], color: "#9CD4FF", yaw: 0.55 },
    { pos: [0, -0.5, -0.36], color: "#C9B0FA", yaw: -0.5 }
  ];

  animated.push({
    id,
    restPosition: pivot,
    restRotation: [0, 0, 0],
    sample: (t) => ({
      position: [pivot[0], pivot[1] + Math.sin(t * 0.9 + phase) * 0.04, pivot[2]],
      rotation: [
        Math.cos(t * 0.65 + phase) * 0.035,
        t * 0.28 + phase,
        Math.sin(t * 0.75 + phase) * 0.045
      ]
    })
  });

  return dioramaGroup(
    id,
    [
      geometry.custom(frameSpec, {
        name: `${id}-brass-hoop`,
        material: brushedMetalMat("#ECCB74"),
        castShadow: false,
        receiveShadow: false
      }),
      ...starDrops.map((drop, idx) =>
        geometry
          .custom(starPrismSpec, {
            name: `${id}-star-prism-${idx + 1}`,
            material: ceramicMat(drop.color, { color: "#FFFFFF", power: 2.4, intensity: 0.32 }),
            castShadow: true,
            receiveShadow: false
          })
          .position(drop.pos[0], drop.pos[1], drop.pos[2])
          .rotation(0, drop.yaw, 0)
      )
    ],
    { position: pivot }
  ).runtime({ id, tags: ["diorama", "mobile"], mutable: true });
}

export function learningCloudScene(_ctx?: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x636c6f75);
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  const cloudIslandMat = feltMat("#9BB8FA", {
    color: "#FFC6EB",
    power: 2.3,
    intensity: 0.38
  });

  // 1. Sculpted plush quilted cloud-island floor (`y = 0.000` inside `r <= 3.75m`)
  nodes.push(
    buildIslandPlinthNode({
      name: "learning cloud plush quilted island",
      seed: 606,
      material: cloudIslandMat,
      span: [42, 25],
      segments: [38, 36],
      flatStageRadius: 3.75,
      islandRadius: 12.2,
      islandRadiusX: 19.6,
      outerSwellAmplitude: 0.42,
      quiltAmplitude: 0.22,
      plinthBaseY: -1.15
    }),
    primitives.sphere({
      name: "learning cloud underbelly cushion",
      size: [36.4, 2.4, 20.8],
      position: [0, -1.28, -0.3],
      material: plushCloudMat("#8EA9F4", false),
      castShadow: false,
      receiveShadow: false
    })
  );

  // 2. Soft pearlescent cloud-puff stage rim (single-draw `instances.custom` sculpted cumulus puffs)
  const rimCloudPuffSpec = cachedDioramaSpec("learning-cloud-rim-puff", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.35, 0.92, 1.15] },
        { position: [-0.48, -0.06, 0.08], scale: [0.95, 0.74, 0.92] },
        { position: [0.5, -0.05, -0.06], scale: [0.98, 0.76, 0.94] }
      ],
      { seed: 619, amplitude: 0.026, frequency: 2.3 }
    );
    return built.geometry;
  });

  const billowInstances: AuraInstanceInput[] = [];
  const billowPalette: readonly AuraColor[] = [
    "#DCE6FF",
    "#E4DAFF",
    "#FCE0F2",
    "#D4EBFF"
  ];
  const billowCount = 18;
  for (let i = 0; i < billowCount; i += 1) {
    const angle = (i / billowCount) * Math.PI * 2 + 0.12;
    const isFront = Math.sin(angle) > 0.42;
    const radius = isFront ? 5.15 + rng() * 0.55 : 4.55 + rng() * 1.3;
    const bx = Math.cos(angle) * radius * 1.12;
    let bz = Math.sin(angle) * radius * 0.96 - 0.55;
    const sy = isFront ? 0.54 + rng() * 0.16 : 0.9 + rng() * 0.38;
    const sx = 1.05 + rng() * 0.38;
    const by = isFront ? -0.14 : 0.22 + rng() * 0.24;
    const sz = 1.0 + rng() * 0.3;
    if (Math.abs(bx) > 3.5) {
      const dzCorridor = bz - 0.1;
      if (Math.abs(dzCorridor) < 1.05) continue;
      if (Math.abs(dzCorridor) < 1.68) {
        bz = 0.1 + (dzCorridor < 0 ? -1.68 : 1.68);
      }
    }
    billowInstances.push({
      position: [bx, by, bz],
      rotation: [0, angle, 0],
      scale: [sx, sy, sz],
      color: billowPalette[i % billowPalette.length]!
    });
  }
  nodes.push(
    instances.custom(rimCloudPuffSpec, {
      name: "learning cloud pearlescent rim puffs",
      material: instanceFeltMat("#FFFFFF"),
      ...splitInstancePlacements(billowInstances),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 3. 5 smooth `sculptCurvedLimb` pastel ribbons seated in cumulus cloud pedestals + crescent reading perch
  nodes.push(
    pastelRainbowRibbons({
      name: "learning-cloud-pastel-prism-arch",
      position: [0, 0.48, -8.8],
      spanRadius: 6.75,
      archHeight: 5.05,
      colors: ["#F46BA2", "#FAC54B", "#6FD89C", "#5FAEF2", "#AE88F2"]
    }),
    buildCrescentReadingPerch(),
    buildStarPrismMobile("cloud-mobile-left", [-3.82, 3.45, -4.55], 0.15, animated),
    buildStarPrismMobile("cloud-mobile-right", [3.82, 3.45, -4.55], 1.75, animated)
  );

  // 4. 3 Bevelled Lacquered Floating Storybook Pedestals with Faceted Golden Star Badges
  const pedestalBadgeStar = cachedDioramaSpec("learning-cloud-pedestal-star", () =>
    extrudeContourSpec({
      outer: starPolygon2D(0.115, 0.054, 5),
      depth: 0.036,
      bevelSize: 0.008,
      bevelThickness: 0.008,
      bevelSegments: 2
    })
  );

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
          geometry
            .custom(pedestalBadgeStar, {
              name: `${ped.id}-star-emblem`,
              material: goldStarMat,
              castShadow: false,
              receiveShadow: false
            })
            .position(0, 0.01, 0.45)
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

  // 5. High drifting sculpted pastel cloud puffs
  const highCloudMat = plushCloudMat("#FFFBFD", { color: "#FBDDF2", power: 2.4, intensity: 0.32 });
  const highCloudSpec = cachedDioramaSpec("learning-cloud-high-puff", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.55, 0.88, 1.02] },
        { position: [-0.72, -0.07, 0.05], scale: [1.08, 0.72, 0.88] },
        { position: [0.72, -0.06, -0.04], scale: [1.12, 0.74, 0.9] }
      ],
      { seed: 677, amplitude: 0.025, frequency: 2.4 }
    );
    return built.geometry;
  });

  const driftingClouds: readonly {
    readonly id: string;
    readonly at: Vec3;
    readonly scale: number;
    readonly amp: number;
    readonly speed: number;
  }[] = [
    { id: "cloud-puff-drift-1", at: [-4.4, 4.4, -7.2], scale: 1.05, amp: 0.44, speed: 0.16 },
    { id: "cloud-puff-drift-2", at: [4.5, 4.6, -7.4], scale: 1.08, amp: 0.46, speed: 0.14 }
  ];
  driftingClouds.forEach((c, idx) => {
    nodes.push(
      geometry
        .custom(highCloudSpec, {
          name: c.id,
          material: highCloudMat,
          castShadow: false,
          receiveShadow: false
        })
        .position(c.at[0], c.at[1], c.at[2])
        .scale(c.scale)
        .runtime({ id: c.id, tags: ["diorama", "cloud"], mutable: true })
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
 * Learning Cloud — sculpted plush quilted cloud-island floor ringed by
 * pearlescent cumulus puffs, 5 smooth `sculptCurvedLimb` pastel arch ribbons
 * seated in cumulus pedestals, a crescent-moon reading perch on a distant
 * cloudlet, faceted star prisms on `cloud-mobile-left` & `cloud-mobile-right`,
 * and 3 floating storybook pedestals.
 */
export const learningCloud: WorldDefinition = {
  id: "learning-cloud",
  workingTitle: "Lumi Learning Cloud",
  ground: { color: "#B8C6F4", size: 70 },
  musicBed: "cloudBed",
  buildDiorama: learningCloudScene,
  dressing: [
    // Declarative concentric pastel arch metadata retained for layout/clearance
    // inspection; superseded at build time by the 5-band sculpted pastel arch.
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
