import {
  geometry,
  instances,
  lights,
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
  plushCloudMat,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  splitInstancePlacements,
  warmPracticalGlowMat,
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

function buildGoldenCrescentMoonArch(): AuraNodeBuilder<AuraSceneNode> {
  const cloudPedestalSpec = cachedDioramaSpec("starlight-cloud-moon-arch-bolsters", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [-1.18, 0, 0], scale: [1.42, 0.86, 1.18] },
        { position: [-0.62, 0.12, 0.14], scale: [0.98, 0.68, 0.92] },
        { position: [1.18, 0, 0], scale: [1.38, 0.84, 1.15] },
        { position: [0.64, 0.1, -0.12], scale: [0.96, 0.66, 0.9] }
      ],
      { seed: 842, amplitude: 0.028, frequency: 2.3 }
    );
    return built.geometry;
  });

  const crescentArchSpec = cachedDioramaSpec("starlight-cloud-golden-crescent-arch", () => {
    const spine: ProceduralVec3[] = [];
    const steps = 28;
    const startAng = Math.PI * 0.14;
    const endAng = Math.PI * 1.18;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const ang = startAng + t * (endAng - startAng);
      spine.push([Math.cos(ang) * 1.72, Math.sin(ang) * 1.92 + 0.52, 0]);
    }
    return sculptCurvedLimb(
      spine,
      (t) => 0.048 + Math.sin(t * Math.PI) * 0.24,
      {
        steps: 36,
        radialSegments: 18,
        profileScaleX: 1.0,
        profileScaleY: 0.78
      }
    );
  });

  const starDropCordSpec = cachedDioramaSpec("starlight-cloud-arch-star-cord", () =>
    cylinderSpec(0.008, 0.008, 0.56, 10)
  );

  const starCharmSpec = cachedDioramaSpec("starlight-cloud-arch-star-charm", () =>
    extrudeContourSpec({
      outer: starPolygon2D(0.18, 0.084, 5),
      depth: 0.068,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      bevelSegments: 2
    })
  );

  return dioramaGroup(
    "starlight cloud crescent moon arch",
    [
      geometry.custom(cloudPedestalSpec, {
        name: "starlight moon arch cloud bolsters",
        material: plushCloudMat("#F7EEE6"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(crescentArchSpec, {
        name: "starlight golden crescent moon arch",
        material: ceramicMat("#F6CE76", { color: "#FFF6DA", power: 2.5, intensity: 0.32 }),
        castShadow: true,
        receiveShadow: true
      }),
      geometry
        .custom(starDropCordSpec, {
          name: "starlight moon arch brass cord",
          material: brushedMetalMat("#DFBA6E"),
          castShadow: false,
          receiveShadow: false
        })
        .position(-0.18, 2.02, 0),
      geometry
        .custom(starCharmSpec, {
          name: "starlight moon arch warm star charm",
          material: warmPracticalGlowMat("#FFE8AC", "#FFD584", 1.12),
          castShadow: false,
          receiveShadow: false
        })
        .position(-0.18, 1.66, 0)
        .rotation(0, 0.18, 0)
    ],
    { position: [-3.75, 0.12, -5.55], rotation: [0, 0.32, 0] }
  );
}

function buildStarlightLanternPostNodes(
  id: string,
  basePos: Vec3
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const cloudBaseSpec = cachedDioramaSpec("starlight-cloud-lantern-bolster", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0.08, 0], scale: [0.58, 0.34, 0.56] },
        { position: [-0.22, 0.04, 0.08], scale: [0.38, 0.24, 0.36] },
        { position: [0.22, 0.05, -0.06], scale: [0.38, 0.25, 0.36] }
      ],
      { seed: 853, amplitude: 0.018, frequency: 2.6 }
    );
    return built.geometry;
  });

  const postSpec = cachedDioramaSpec("starlight-cloud-brass-lantern-post", () => {
    const column = sculptOrganicLathe(
      [
        [0, 0],
        [0.18, 0],
        [0.16, 0.05],
        [0.09, 0.1],
        [0.038, 0.2],
        [0.032, 0.85],
        [0.05, 0.92],
        [0.03, 0.99],
        [0.028, 1.38],
        [0.085, 1.44],
        [0, 1.46]
      ],
      { segments: 22 }
    );
    const cap = sculptOrganicLathe(
      [
        [0, 0],
        [0.15, 0],
        [0.12, 0.06],
        [0.045, 0.13],
        [0.022, 0.19],
        [0, 0.22]
      ],
      { segments: 20 }
    );
    return composeGeometry([
      { geometry: column },
      { geometry: cap, position: [0, 1.72, 0] }
    ]);
  });

  const globeSpec = cachedDioramaSpec("starlight-cloud-lantern-globe", () =>
    ellipsoidSpec(0.135, 0.165, 0.135, 20, 16)
  );

  return [
    dioramaGroup(
      id,
      [
        geometry.custom(cloudBaseSpec, {
          name: `${id}-cloud-bolster`,
          material: plushCloudMat("#F6EDE4"),
          castShadow: false,
          receiveShadow: true
        }),
        geometry.custom(postSpec, {
          name: `${id}-brass-post`,
          material: brushedMetalMat("#DFBA6E"),
          castShadow: true,
          receiveShadow: true
        }),
        geometry
          .custom(globeSpec, {
            name: `${id}-amber-globe`,
            material: warmPracticalGlowMat("#FFF0CE", "#FFD89E", 1.22),
            castShadow: false,
            receiveShadow: false
          })
          .position(0, 1.58, 0)
      ],
      { position: basePos }
    ),
    lights.point({
      name: `${id}-warm-point`,
      position: [basePos[0], basePos[1] + 1.58, basePos[2] + 0.08],
      color: "#FFD89E",
      intensity: 1.48,
      distance: 7.6,
      decay: 2
    })
  ];
}

export function buildStarlightCloudDiorama(
  ctx: WorldDioramaContext = {
    reducedMotion: false,
    available: () => false
  }
): WorldDioramaSlice {
  const rng = createDeterministicRng(0x73746172);
  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  const quiltedIslandMat = feltMat("#C9B8E8", {
    color: "#FFE8C8",
    power: 2.4,
    intensity: 0.32
  });

  // 1. Quilted lavender-and-cream cloud island (`flatStageRadius: 3.6`, `y === 0.000` at center)
  nodes.push(
    buildIslandPlinthNode({
      name: "starlight cloud quilted island",
      seed: 808,
      material: quiltedIslandMat,
      span: [42, 26],
      segments: [38, 36],
      flatStageRadius: 3.6,
      islandRadius: 12.4,
      islandRadiusX: 19.6,
      outerSwellAmplitude: 0.38,
      quiltAmplitude: 0.24,
      plinthBaseY: -1.15
    }),
    primitives.sphere({
      name: "starlight cloud dusk underbelly cushion",
      size: [36.8, 2.4, 21.2],
      position: [0, -1.28, -0.3],
      material: plushCloudMat("#78609A", false),
      castShadow: false,
      receiveShadow: false
    })
  );

  // 2. Quilted perimeter cloud pillows (single-draw `instances.custom` + stitched back-perimeter bolsters)
  const perimeterPillowSpec = cachedDioramaSpec("starlight-cloud-perimeter-pillow", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.38, 0.88, 1.16] },
        { position: [-0.5, -0.05, 0.08], scale: [0.96, 0.72, 0.92] },
        { position: [0.52, -0.04, -0.06], scale: [0.98, 0.74, 0.94] }
      ],
      { seed: 829, amplitude: 0.026, frequency: 2.3 }
    );
    return built.geometry;
  });

  const pillowInstances: AuraInstanceInput[] = [];
  const pillowPalette: readonly AuraColor[] = [
    "#F8EFE6",
    "#DFD0F2",
    "#F2D8E4",
    "#F9EBD2"
  ];
  const pillowCount = 18;
  for (let i = 0; i < pillowCount; i += 1) {
    const angle = (i / pillowCount) * Math.PI * 2 + 0.14;
    const isFront = Math.sin(angle) > 0.42;
    const radius = isFront ? 5.2 + rng() * 0.55 : 4.65 + rng() * 1.25;
    const px = Math.cos(angle) * radius * 1.12;
    const pz = Math.sin(angle) * radius * 0.96 - 0.55;
    const sy = isFront ? 0.52 + rng() * 0.15 : 0.88 + rng() * 0.36;
    const sx = 1.06 + rng() * 0.36;
    pillowInstances.push({
      position: [px, isFront ? -0.14 : 0.2 + rng() * 0.22, pz],
      rotation: [0, angle, 0],
      scale: [sx, sy, 1.0 + rng() * 0.28],
      color: pillowPalette[i % pillowPalette.length]!
    });
  }
  nodes.push(
    instances.custom(perimeterPillowSpec, {
      name: "starlight cloud perimeter pillows",
      material: instanceFeltMat("#FFFFFF"),
      ...splitInstancePlacements(pillowInstances),
      castShadow: false,
      receiveShadow: true
    })
  );

  const quiltedBolsterRowSpec = cachedDioramaSpec("starlight-cloud-quilted-bolsters", () => {
    const bolster = ellipsoidSpec(0.56, 0.22, 0.38, 20, 14);
    const parts: ComposePart[] = [
      { geometry: bolster, position: [-1.45, 0.16, -3.55], rotation: [0, 0.24, 0] },
      { geometry: bolster, position: [0, 0.18, -3.78], rotation: [0, -0.04, 0] },
      { geometry: bolster, position: [1.48, 0.16, -3.52], rotation: [0, -0.26, 0] }
    ];
    return composeGeometry(parts);
  });
  nodes.push(
    geometry.custom(quiltedBolsterRowSpec, {
      name: "starlight quilted cloud bolster row",
      material: fabricMat("#EFE4F8", undefined, "quiltedStitch"),
      castShadow: true,
      receiveShadow: true
    })
  );

  // 3. Sculpted golden crescent moon arch on back-left perimeter + two brass starlight lantern posts
  nodes.push(
    buildGoldenCrescentMoonArch(),
    ...buildStarlightLanternPostNodes("starlight-lantern-left", [-3.52, 0, -2.85]),
    ...buildStarlightLanternPostNodes("starlight-lantern-right", [3.52, 0, -2.85])
  );

  // 4. Gentle slow drift on distant clouds when `!ctx.reducedMotion`
  const distantCloudMat = plushCloudMat("#F9F1EB", {
    color: "#FFE6C4",
    power: 2.4,
    intensity: 0.3
  });
  const distantCloudSpec = cachedDioramaSpec("starlight-cloud-distant-puff", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0, 0], scale: [1.58, 0.86, 1.04] },
        { position: [-0.74, -0.06, 0.05], scale: [1.08, 0.72, 0.88] },
        { position: [0.74, -0.05, -0.04], scale: [1.12, 0.74, 0.9] }
      ],
      { seed: 867, amplitude: 0.025, frequency: 2.4 }
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
    { id: "starlight-cloud-drift-1", at: [-4.35, 4.35, -7.25], scale: 1.06, amp: 0.38, speed: 0.12 },
    { id: "starlight-cloud-drift-2", at: [4.45, 4.55, -7.45], scale: 1.1, amp: 0.42, speed: 0.1 },
    { id: "starlight-cloud-drift-3", at: [0.25, 4.95, -9.35], scale: 1.18, amp: 0.34, speed: 0.09 }
  ];

  driftingClouds.forEach((c, idx) => {
    nodes.push(
      geometry
        .custom(distantCloudSpec, {
          name: c.id,
          material: distantCloudMat,
          castShadow: false,
          receiveShadow: false
        })
        .position(c.at[0], c.at[1], c.at[2])
        .scale(c.scale)
        .runtime({ id: c.id, tags: ["diorama", "cloud"], mutable: true })
    );
    if (!ctx.reducedMotion) {
      animated.push({
        id: c.id,
        restPosition: c.at,
        sample: (t) => ({
          position: [
            c.at[0] + Math.sin(t * c.speed + idx * 2.1) * c.amp,
            c.at[1] + Math.cos(t * c.speed * 0.75 + idx) * 0.04,
            c.at[2]
          ]
        })
      });
    }
  });

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Starlight Cloud — quilted lavender-and-cream cloud island (`flatStageRadius: 3.6`,
 * `y === 0.000` at center), sculpted golden crescent moon arch on back-left
 * perimeter, turned brass starlight lantern posts with warm amber globes,
 * quilted perimeter cloud pillows, and gentle slow drift on distant clouds.
 */
export const starlightCloud: WorldDefinition = {
  id: "starlight-cloud",
  workingTitle: "Starlight Cloud",
  ground: { color: "#C9B8E8", size: 70 },
  musicBed: "starlightBed",
  buildDiorama: buildStarlightCloudDiorama,
  dressing: [
    {
      kind: "model",
      key: "cloud",
      at: [-3.35, 4.65, -8.1],
      yaw: 0.1,
      heightM: 0.96,
      castShadow: false
    },
    {
      kind: "model",
      key: "cloud",
      at: [3.45, 4.9, -8.4],
      yaw: -0.12,
      heightM: 1.04,
      castShadow: false
    },
    {
      kind: "model",
      key: "cloud",
      at: [-0.85, 5.2, -11.2],
      yaw: 0.06,
      heightM: 1.32,
      castShadow: false
    },
    {
      kind: "model",
      key: "cushion",
      at: [-3.38, 0.06, -2.42],
      yaw: 0.32,
      heightM: 0.22
    },
    {
      kind: "model",
      key: "cushion",
      at: [3.38, 0.06, -2.42],
      yaw: -0.32,
      heightM: 0.22
    }
  ]
};
