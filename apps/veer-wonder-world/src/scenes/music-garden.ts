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
  buildBackdropHillNode,
  buildCalmPondNode,
  buildIslandPlinthNode,
  cachedDioramaSpec,
  ceramicMat,
  clayMat,
  composeGeometry,
  createDeterministicRng,
  cylinderSpec,
  dioramaGroup,
  ellipsoidSpec,
  extrudeContourSpec,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  instanceSatinMat,
  instanceStoneMat,
  lacquerMat,
  pergolaTrellis,
  ribbonAlongSpline,
  roundedBoxSpec,
  sculptOrganicLathe,
  splitInstancePlacements,
  srgbHexToLinearRgba,
  stoneMat,
  tubeAlongSpline,
  type AuraInstanceInput
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type {
  WorldAnimatedNodeSpec,
  WorldDefinition,
  WorldDioramaContext,
  WorldDioramaSlice
} from "./worlds.js";

const STOMP_PAD_SPECS: readonly { readonly at: Vec3; readonly color: string; readonly yaw: number }[] = [
  { at: [-3.18, 0, 0.35], color: "#F59CB8", yaw: 0.18 },
  { at: [-2.15, 0, -2.52], color: "#FAD26E", yaw: 0.08 },
  { at: [0, 0, -2.72], color: "#93DEB4", yaw: 0 },
  { at: [2.15, 0, -2.52], color: "#8AC4F4", yaw: -0.08 },
  { at: [3.18, 0, 0.35], color: "#C5A6F2", yaw: -0.18 }
];

const LOTUS_POND_CENTER: readonly [number, number] = [-4.55, -1.55];
const LOTUS_POND_RADIUS = 1.02;

function buildLilyPadAndLotusNodes(): AuraNodeBuilder<AuraSceneNode> {
  const padSpec = cachedDioramaSpec("music-garden-lily-pad", () => {
    const outer: ProceduralVec2[] = [];
    const segs = 28;
    const startAngle = 0.22;
    const endAngle = Math.PI * 2 - 0.22;
    outer.push([0.02, 0]);
    for (let i = 0; i <= segs; i += 1) {
      const a = startAngle + (i / segs) * (endAngle - startAngle);
      outer.push([Math.cos(a) * 0.24, Math.sin(a) * 0.24]);
    }
    const raw = extrudeContourSpec({
      outer,
      depth: 0.022,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 2
    });
    return composeGeometry([{ geometry: raw, rotation: [Math.PI * 0.5, 0, 0] }]);
  });

  const lotusSpec = cachedDioramaSpec("music-garden-lotus-blossom", () => {
    const parts: ComposePart[] = [];
    const outerPetal = ellipsoidSpec(0.068, 0.024, 0.034, 14, 10);
    const innerPetal = ellipsoidSpec(0.054, 0.032, 0.028, 14, 10);
    for (let i = 0; i < 8; i += 1) {
      const ang = (i / 8) * Math.PI * 2;
      parts.push({
        geometry: outerPetal,
        position: [Math.cos(ang) * 0.062, 0.024, Math.sin(ang) * 0.062],
        rotation: [0, -ang, 0.36],
        color: srgbHexToLinearRgba("#FF9EBD")
      });
    }
    for (let i = 0; i < 6; i += 1) {
      const ang = ((i + 0.5) / 6) * Math.PI * 2;
      parts.push({
        geometry: innerPetal,
        position: [Math.cos(ang) * 0.042, 0.046, Math.sin(ang) * 0.042],
        rotation: [0, -ang, 0.68],
        color: srgbHexToLinearRgba("#FFD0E2")
      });
    }
    parts.push({
      geometry: ellipsoidSpec(0.034, 0.026, 0.034, 12, 10),
      position: [0, 0.052, 0],
      color: srgbHexToLinearRgba("#FAD15A")
    });
    return composeGeometry(parts);
  });

  const padSpots: readonly { readonly pos: Vec3; readonly yaw: number; readonly scale: number; readonly hasLotus: boolean }[] = [
    { pos: [-4.32, 0.024, -1.32], yaw: 0.4, scale: 1.05, hasLotus: true },
    { pos: [-4.82, 0.024, -1.72], yaw: 2.1, scale: 0.96, hasLotus: true },
    { pos: [-4.38, 0.024, -1.88], yaw: -1.1, scale: 0.84, hasLotus: false },
    { pos: [-4.72, 0.024, -1.18], yaw: 1.3, scale: 0.9, hasLotus: true }
  ];

  const padInstances: AuraInstanceInput[] = padSpots.map((s) => ({
    position: s.pos,
    rotation: [0, s.yaw, 0],
    scale: s.scale,
    color: "#5DB07E"
  }));
  const lotusInstances: AuraInstanceInput[] = padSpots
    .filter((s) => s.hasLotus)
    .map((s, idx) => ({
      position: [s.pos[0], s.pos[1] + 0.012, s.pos[2]],
      rotation: [0, s.yaw + idx * 0.5, 0],
      scale: s.scale,
      color: idx === 1 ? "#FFF4F8" : "#FFFFFF"
    }));

  return dioramaGroup("music garden lotus lily pads", [
    instances.custom(padSpec, {
      name: "music garden notched lily pads",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(padInstances),
      castShadow: false,
      receiveShadow: true
    }),
    instances.custom(lotusSpec, {
      name: "music garden sculpted lotus blossoms",
      material: instanceSatinMat("#FFFFFF"),
      ...splitInstancePlacements(lotusInstances),
      castShadow: true,
      receiveShadow: true
    })
  ]);
}

export function musicGardenScene(ctx: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x6d757369);
  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Seafoam felt island plinth (strictly y = 0.000 inside r <= 3.75m) + recessed lotus pond basin
  nodes.push(
    buildIslandPlinthNode({
      name: "music garden seafoam island plinth",
      seed: 302,
      material: feltMat("#84C6A8"),
      span: [31, 29],
      segments: [38, 36],
      flatStageRadius: 3.75,
      islandRadius: 13.8,
      outerSwellAmplitude: 0.32,
      basin: {
        center: LOTUS_POND_CENTER,
        radius: LOTUS_POND_RADIUS,
        depth: 0.22
      },
      plinthBaseY: -1.08
    }),
    primitives.cylinder({
      name: "music garden plinth base",
      size: [28.6, 0.42, 26.8],
      position: [0, -0.9, 0],
      material: clayMat("#D8C7B2", false),
      castShadow: false,
      receiveShadow: true
    }),
    // Flat pastel stage acoustic medallion (height 0.012m, flush on stage)
    primitives.cylinder({
      name: "music garden stage medallion",
      size: [3.6, 0.012, 3.6],
      position: [0, 0.004, 0.05],
      material: stoneMat("#F3EDE1", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Mint & sage backdrop hills
  nodes.push(
    buildBackdropHillNode({
      name: "music garden left hill",
      seed: 311,
      position: [-7.8, -0.2, -9.2],
      size: [13.6, 8.8],
      peakHeight: 2.1,
      material: feltMat("#92D0B4", false),
      rotationY: 0.2
    }),
    buildBackdropHillNode({
      name: "music garden center hill",
      seed: 312,
      position: [0, -0.22, -11.4],
      size: [17.4, 9.6],
      peakHeight: 2.55,
      material: feltMat("#78BA9C", false)
    }),
    buildBackdropHillNode({
      name: "music garden right hill",
      seed: 313,
      position: [7.8, -0.2, -9.2],
      size: [13.6, 8.8],
      peakHeight: 2.1,
      material: feltMat("#92D0B4", false),
      rotationY: -0.2
    })
  );

  // 3. Terraced stone amphitheater rim + turned-column wooden pergola with climbing ivy garlands
  nodes.push(
    ribbonAlongSpline({
      name: "music garden lower amphitheater stone tier",
      points: [
        [-5.6, 0, -2.55],
        [-3.2, 0, -3.65],
        [0, 0, -4.15],
        [3.2, 0, -3.65],
        [5.6, 0, -2.55]
      ],
      halfWidthBottom: 0.64,
      halfWidthTop: 0.56,
      height: 0.24,
      baseY: -0.02,
      segments: 52,
      material: stoneMat("#EFE4D2"),
      castShadow: true,
      receiveShadow: true
    }),
    ribbonAlongSpline({
      name: "music garden upper amphitheater stone tier",
      points: [
        [-6.1, 0.22, -3.15],
        [-3.5, 0.22, -4.35],
        [0, 0.22, -4.88],
        [3.5, 0.22, -4.35],
        [6.1, 0.22, -3.15]
      ],
      halfWidthBottom: 0.58,
      halfWidthTop: 0.5,
      height: 0.28,
      baseY: -0.04,
      segments: 52,
      material: stoneMat("#F8F1E3"),
      castShadow: true,
      receiveShadow: true
    }),
    ribbonAlongSpline({
      name: "music garden amphitheater stone coping rim",
      points: [
        [-6.35, 0.46, -3.45],
        [-3.68, 0.46, -4.72],
        [0, 0.46, -5.26],
        [3.68, 0.46, -4.72],
        [6.35, 0.46, -3.45]
      ],
      halfWidthBottom: 0.42,
      halfWidthTop: 0.36,
      height: 0.16,
      baseY: -0.04,
      segments: 52,
      material: ceramicMat("#FFF9EE"),
      castShadow: true,
      receiveShadow: true
    }),
    pergolaTrellis({
      name: "music garden amphitheater pergola",
      position: [0, 0.48, -5.32],
      spanWidth: 5.2,
      depth: 1.12,
      columnHeight: 2.38,
      woodColor: "#EDE0CE",
      foliageColor: "#58AD68",
      blossomColor: "#FFA2BF"
    })
  );

  // 4. Animated lotus pond with paired GLSL+WGSL water, cobble rim & 3D lotus blossoms
  const pondCobbleSpec = cachedDioramaSpec("music-garden-pond-cobble", () =>
    ellipsoidSpec(0.13, 0.075, 0.11, 14, 10)
  );
  const pondCobbleInstances: AuraInstanceInput[] = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const rad = LOTUS_POND_RADIUS + 0.07 + (rng() - 0.5) * 0.04;
    pondCobbleInstances.push({
      position: [LOTUS_POND_CENTER[0] + Math.cos(a) * rad, 0.032, LOTUS_POND_CENTER[1] + Math.sin(a) * rad],
      rotation: [0, a, 0],
      scale: [0.92 + rng() * 0.3, 0.72, 0.85 + rng() * 0.25],
      color: i % 2 === 0 ? "#E6DDD0" : "#D6CCBD"
    });
  }

  nodes.push(
    primitives.cylinder({
      name: "music garden lotus pond basin",
      size: [LOTUS_POND_RADIUS * 2.2, 0.05, LOTUS_POND_RADIUS * 2.2],
      position: [LOTUS_POND_CENTER[0], -0.03, LOTUS_POND_CENTER[1]],
      material: stoneMat("#DFD3BE", false),
      castShadow: false,
      receiveShadow: true
    }),
    buildCalmPondNode({
      id: "music-garden-lotus-pond",
      name: "music garden calm lotus pond",
      center: LOTUS_POND_CENTER,
      radius: LOTUS_POND_RADIUS,
      height: 0.014,
      shallowColor: "#72DAEA",
      deepColor: "#2D94B8",
      reducedMotion: ctx.reducedMotion
    }),
    instances.custom(pondCobbleSpec, {
      name: "music garden lotus pond cobbles",
      material: instanceStoneMat("#FFFFFF"),
      ...splitInstancePlacements(pondCobbleInstances),
      castShadow: false,
      receiveShadow: true
    }),
    buildLilyPadAndLotusNodes()
  );

  // 5. 18 Bevelled Lacquered Piano Keys curved along the amphitheater apron
  const whiteKeySpec = cachedDioramaSpec("music-ivory-key", () =>
    roundedBoxSpec(0.26, 0.09, 0.62, 0.018)
  );
  const blackKeySpec = cachedDioramaSpec("music-ebony-key", () =>
    roundedBoxSpec(0.15, 0.09, 0.38, 0.014)
  );
  const whiteInstances: AuraInstanceInput[] = [];
  const blackInstances: AuraInstanceInput[] = [];
  const sharpPattern: readonly boolean[] = [true, true, false, true, true, true, false, true, true, false, false];
  const naturalCount = 11;

  for (let i = 0; i < naturalCount; i += 1) {
    const u = (i / (naturalCount - 1)) * 2 - 1;
    const angle = u * 0.58;
    const radius = 3.22;
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius + 0.08;
    whiteInstances.push({
      position: [x, 0.055, z],
      rotation: [0, -angle, 0]
    });

    if (sharpPattern[i] && i < naturalCount - 1) {
      const uMid = ((i + 0.5) / (naturalCount - 1)) * 2 - 1;
      const aMid = uMid * 0.58;
      const rSharp = 3.36;
      blackInstances.push({
        position: [Math.sin(aMid) * rSharp, 0.095, -Math.cos(aMid) * rSharp + 0.08],
        rotation: [0, -aMid, 0]
      });
    }
  }

  nodes.push(
    instances.custom(whiteKeySpec, {
      name: "music garden ivory piano keys",
      material: instanceSatinMat("#FFFDF8"),
      ...splitInstancePlacements(whiteInstances),
      castShadow: true,
      receiveShadow: true
    }),
    instances.custom(blackKeySpec, {
      name: "music garden ebony sharp keys",
      material: instanceSatinMat("#3C4252"),
      ...splitInstancePlacements(blackInstances),
      castShadow: true,
      receiveShadow: true
    })
  );

  // 3 pastel musical note accent caps above the terrace keys that ripple gently
  const noteCapColors: readonly AuraColor[] = ["#F59CB8", "#FAD26E", "#8AC4F4"];
  for (let k = 0; k < 3; k += 1) {
    const x = (k - 1) * 0.88;
    const restPos: Vec3 = [x, 0.13, -3.45];
    const id = `music-key-ripple-${k + 1}`;
    nodes.push(
      primitives
        .cylinder({
          name: id,
          size: [0.22, 0.04, 0.22],
          position: [restPos[0], restPos[1], restPos[2]],
          material: lacquerMat(noteCapColors[k]!),
          castShadow: false,
          receiveShadow: true
        })
        .runtime({ id, tags: ["diorama", "piano-accent"], mutable: true })
    );
    animated.push({
      id,
      restPosition: restPos,
      sample: (t) => ({
        position: [
          restPos[0],
          restPos[1] + Math.max(0, Math.sin(t * 2.1 - k * 0.9)) * 0.025,
          restPos[2]
        ]
      })
    });
  }

  // 6. Inlaid ceramic note reliefs crowning the 5 pastel stompStone pads
  const inlayTransforms: AuraTransformSpec[] = STOMP_PAD_SPECS.map((pad) => ({
    position: [pad.at[0], 0.095, pad.at[2]],
    rotation: [0, pad.yaw, 0]
  }));
  const inlayColors: AuraColor[] = STOMP_PAD_SPECS.map((pad) => pad.color);
  nodes.push(
    instances.cylinder({
      name: "music garden stomp pad note inlays",
      size: [0.34, 0.024, 0.34],
      material: instanceSatinMat("#FFFFFF"),
      transforms: inlayTransforms,
      colors: inlayColors,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 7. Sculpted brass chime arch with turned pedestals & 5 swaying brushed-brass chimes
  const brassMat = brushedMetalMat("#E8C468", { color: "#FFF5D6", power: 3.0, intensity: 0.25 });
  const chimePedestalSpec = cachedDioramaSpec("music-chime-arch-bases", () => {
    const base = sculptOrganicLathe(
      [
        [0, 0],
        [0.17, 0],
        [0.16, 0.12],
        [0.12, 0.22],
        [0.105, 0.38],
        [0.13, 0.44],
        [0, 0.48]
      ],
      { segments: 22 }
    );
    const crownFinial = sculptOrganicLathe(
      [
        [0, 0],
        [0.11, 0.02],
        [0.075, 0.12],
        [0.095, 0.2],
        [0.03, 0.32],
        [0, 0.36]
      ],
      { segments: 20 }
    );
    return composeGeometry([
      { geometry: base, position: [-2.18, 0.2, -4.48] },
      { geometry: base, position: [2.18, 0.2, -4.48] },
      { geometry: crownFinial, position: [0, 3.24, -4.48] }
    ]);
  });

  nodes.push(
    tubeAlongSpline({
      name: "music garden sculpted brass chime arch",
      points: [
        [-2.18, 0.42, -4.48],
        [-2.04, 1.92, -4.48],
        [-1.12, 2.98, -4.48],
        [0, 3.24, -4.48],
        [1.12, 2.98, -4.48],
        [2.04, 1.92, -4.48],
        [2.18, 0.42, -4.48]
      ],
      radius: 0.078,
      segments: 48,
      radialSegments: 14,
      material: brassMat
    }),
    geometry.custom(chimePedestalSpec, {
      name: "music garden chime arch finials",
      material: brassMat,
      castShadow: true,
      receiveShadow: true
    })
  );

  const chimeHeights: readonly number[] = [0.68, 0.84, 0.98, 0.84, 0.68];
  const chimeChildren: AuraNodeBuilder<AuraSceneNode>[] = [];
  for (let i = 0; i < chimeHeights.length; i += 1) {
    const h = chimeHeights[i]!;
    const cx = (i - 2) * 0.34;
    const tubeSpec = cachedDioramaSpec(`music-chime-tube-${i}`, () =>
      composeGeometry([
        { geometry: cylinderSpec(0.032, 0.032, h, 20), position: [0, -h * 0.5 - 0.08, 0] },
        { geometry: ellipsoidSpec(0.042, 0.026, 0.042, 16, 10), position: [0, -0.07, 0] },
        { geometry: ellipsoidSpec(0.028, 0.038, 0.028, 14, 10), position: [0, -h - 0.12, 0] }
      ])
    );
    chimeChildren.push(
      geometry
        .custom(tubeSpec, {
          name: `music-wind-chime-${i + 1}`,
          material: brassMat,
          castShadow: true,
          receiveShadow: false
        })
        .position(cx, 0, 0)
    );
  }
  const chimePivot: Vec3 = [0, 3.1, -4.48];
  nodes.push(
    dioramaGroup("music-chimes-sway", chimeChildren, { position: chimePivot }).runtime({
      id: "music-chimes-sway",
      tags: ["diorama", "chimes"],
      mutable: true
    })
  );
  animated.push({
    id: "music-chimes-sway",
    restPosition: chimePivot,
    restRotation: [0, 0, 0],
    sample: (t) => ({
      position: chimePivot,
      rotation: [
        Math.cos(t * Math.PI * 0.6) * 0.025,
        0,
        Math.sin(t * Math.PI * 0.8) * 0.055
      ]
    })
  });

  // 8. Single-draw instanced multi-petal garden blossom clusters around the outer terrace
  const gardenBloomSpec = cachedDioramaSpec("music-garden-blossom-cluster", () => {
    const parts: ComposePart[] = [];
    const petal = ellipsoidSpec(0.055, 0.026, 0.038, 12, 8);
    for (let p = 0; p < 5; p += 1) {
      const ang = (p / 5) * Math.PI * 2;
      parts.push({
        geometry: petal,
        position: [Math.cos(ang) * 0.055, 0.08, Math.sin(ang) * 0.055],
        rotation: [0.15, -ang, 0],
        color: srgbHexToLinearRgba("#FFFFFF")
      });
    }
    parts.push({
      geometry: ellipsoidSpec(0.035, 0.025, 0.035, 10, 8),
      position: [0, 0.095, 0],
      color: srgbHexToLinearRgba("#FCE07C")
    });
    return composeGeometry(parts);
  });

  const bloomInstances: AuraInstanceInput[] = [];
  const bloomPalette: readonly AuraColor[] = ["#F7A6C1", "#FAD678", "#C8ACF5", "#96E0B8", "#94CAFA"];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + (rng() - 0.5) * 0.1;
    const r = 3.88 + rng() * 2.75;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r * 0.86 - 0.6;
    if (Math.abs(bx) < 3.15 && bz > -2.4 && bz < 2.4) continue;
    if (Math.hypot(bx - LOTUS_POND_CENTER[0], bz - LOTUS_POND_CENTER[1]) < LOTUS_POND_RADIUS + 0.35) continue;
    bloomInstances.push({
      position: [bx, 0.04, bz],
      rotation: [0, rng() * Math.PI * 2, 0],
      scale: 0.9 + rng() * 0.35,
      color: bloomPalette[i % bloomPalette.length]!
    });
  }
  const bloomWind = gentleBreezeWind(ctx.reducedMotion, 0.2, 0.26, 52);
  nodes.push(
    instances.custom(gardenBloomSpec, {
      name: "music garden pastel blossoms",
      material: instanceClayMat("#FFFFFF"),
      ...splitInstancePlacements(bloomInstances),
      ...(bloomWind ? { wind: bloomWind } : {}),
      castShadow: false,
      receiveShadow: true
    })
  );

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Music Garden — seafoam felt island, terraced stone amphitheater rim,
 * turned-column wooden pergola with climbing ivy garlands, animated lotus pond
 * with 3D lotus blossoms on lily pads, 18 bevelled lacquered piano keys, 5
 * pastel `stompStone` pads, and a sculpted brass chime arch.
 */
export const musicGarden: WorldDefinition = {
  id: "music-garden",
  workingTitle: "Lulu Music Garden",
  ground: { color: "#84C6A8", size: 70 },
  musicBed: "gardenBed",
  buildDiorama: musicGardenScene,
  dressing: [
    ...STOMP_PAD_SPECS.map((pad) => ({
      kind: "model" as const,
      key: "stompStone" as const,
      at: pad.at,
      yaw: pad.yaw,
      heightM: 0.18,
      tint: pad.color
    })),
    { kind: "model", key: "tree", at: [-4.25, 0, -3.7], yaw: 0.4, heightM: 2.55 },
    { kind: "model", key: "tree", at: [4.25, 0, -3.7], yaw: -0.4, heightM: 2.55 },
    { kind: "model", key: "bush", at: [-3.55, 0, -2.05], yaw: 0.3, heightM: 0.64 },
    { kind: "model", key: "bush", at: [3.55, 0, -2.05], yaw: -0.3, heightM: 0.64 },
    { kind: "model", key: "flower", at: [-3.25, 0, 1.55], yaw: 0.2, heightM: 0.44 },
    { kind: "model", key: "flower", at: [3.25, 0, 1.55], yaw: -0.2, heightM: 0.44 }
  ]
};
