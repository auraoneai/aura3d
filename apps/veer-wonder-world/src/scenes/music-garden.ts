import {
  instances,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  brushedMetalMat,
  buildBackdropHillNode,
  buildIslandPlinthNode,
  ceramicMat,
  clayMat,
  createDeterministicRng,
  dioramaGroup,
  feltMat,
  gentleBreezeWind,
  instanceClayMat,
  instanceSatinMat,
  lacquerMat,
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

const STOMP_PAD_SPECS: readonly { readonly at: Vec3; readonly color: string; readonly yaw: number }[] = [
  { at: [-3.18, 0, 0.35], color: "#F59CB8", yaw: 0.18 },
  { at: [-2.15, 0, -2.52], color: "#FAD26E", yaw: 0.08 },
  { at: [0, 0, -2.72], color: "#93DEB4", yaw: 0 },
  { at: [2.15, 0, -2.52], color: "#8AC4F4", yaw: -0.08 },
  { at: [3.18, 0, 0.35], color: "#C5A6F2", yaw: -0.18 }
];

function buildMusicGardenDiorama(ctx: WorldDioramaContext): WorldDioramaSlice {
  const rng = createDeterministicRng(0x6d757369);
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Seafoam felt island plinth (strictly y = 0.000 inside r <= 3.75m)
  nodes.push(
    buildIslandPlinthNode({
      name: "music garden seafoam island plinth",
      seed: 302,
      material: feltMat("#84C6A8"),
      span: [31, 29],
      segments: [54, 50],
      flatStageRadius: 3.75,
      islandRadius: 13.8,
      outerSwellAmplitude: 0.32,
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
      material: clayMat("#F3EDE1", false),
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

  // 3. Curved 2-tier travertine amphitheater terrace behind the stage
  nodes.push(
    ribbonAlongSpline({
      name: "music garden lower amphitheater terrace",
      points: [
        [-5.6, 0, -2.55],
        [-3.2, 0, -3.65],
        [0, 0, -4.15],
        [3.2, 0, -3.65],
        [5.6, 0, -2.55]
      ],
      halfWidthBottom: 0.62,
      halfWidthTop: 0.54,
      height: 0.24,
      baseY: -0.02,
      segments: 56,
      material: clayMat("#F4EAD8"),
      castShadow: true,
      receiveShadow: true
    }),
    ribbonAlongSpline({
      name: "music garden upper amphitheater terrace",
      points: [
        [-6.1, 0.2, -3.15],
        [-3.5, 0.2, -4.35],
        [0, 0.2, -4.88],
        [3.5, 0.2, -4.35],
        [6.1, 0.2, -3.15]
      ],
      halfWidthBottom: 0.56,
      halfWidthTop: 0.48,
      height: 0.28,
      baseY: -0.04,
      segments: 56,
      material: ceramicMat("#FCF5E7"),
      castShadow: true,
      receiveShadow: true
    })
  );

  // 4. 18 Bevelled Lacquered Piano Keys curved along the amphitheater apron
  //    (11 ivory naturals + 7 charcoal sharps in single-draw instance pools)
  const whiteTransforms: AuraTransformSpec[] = [];
  const blackTransforms: AuraTransformSpec[] = [];
  const sharpPattern: readonly boolean[] = [true, true, false, true, true, true, false, true, true, false, false];
  const naturalCount = 11;

  for (let i = 0; i < naturalCount; i += 1) {
    const u = (i / (naturalCount - 1)) * 2 - 1;
    const angle = u * 0.58;
    const radius = 3.22;
    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius + 0.08;
    whiteTransforms.push({
      position: [x, 0.055, z],
      rotation: [0, -angle, 0]
    });

    if (sharpPattern[i] && i < naturalCount - 1) {
      const uMid = ((i + 0.5) / (naturalCount - 1)) * 2 - 1;
      const aMid = uMid * 0.58;
      const rSharp = 3.36;
      blackTransforms.push({
        position: [Math.sin(aMid) * rSharp, 0.095, -Math.cos(aMid) * rSharp + 0.08],
        rotation: [0, -aMid, 0]
      });
    }
  }

  nodes.push(
    instances.roundedBox({
      name: "music garden ivory piano keys",
      size: [0.26, 0.09, 0.62],
      material: instanceSatinMat("#FFFDF8"),
      transforms: whiteTransforms,
      castShadow: true,
      receiveShadow: true
    }),
    instances.roundedBox({
      name: "music garden ebony sharp keys",
      size: [0.15, 0.09, 0.38],
      material: instanceSatinMat("#3C4252"),
      transforms: blackTransforms,
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

  // 5. Inlaid ceramic note reliefs crowning the 5 pastel stompStone pads
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

  // 6. Sculpted wooden arch with 5 hanging brushed-brass wind chimes (0.4 Hz pendulum sway)
  nodes.push(
    tubeAlongSpline({
      name: "music garden wooden chime arch",
      points: [
        [-2.35, 0, -4.55],
        [-2.15, 1.85, -4.55],
        [-1.15, 2.98, -4.55],
        [0, 3.22, -4.55],
        [1.15, 2.98, -4.55],
        [2.15, 1.85, -4.55],
        [2.35, 0, -4.55]
      ],
      radius: 0.095,
      segments: 48,
      radialSegments: 14,
      material: woodMat("#C79058", { color: "#FFEAD0", power: 2.8, intensity: 0.2 })
    })
  );

  const chimeHeights: readonly number[] = [0.68, 0.84, 0.98, 0.84, 0.68];
  const brassMat = brushedMetalMat("#E8C468", { color: "#FFF5D6", power: 3.0, intensity: 0.25 });
  const chimeChildren: AuraNodeBuilder<AuraSceneNode>[] = [];
  for (let i = 0; i < chimeHeights.length; i += 1) {
    const h = chimeHeights[i]!;
    const cx = (i - 2) * 0.34;
    chimeChildren.push(
      primitives.cylinder({
        name: `music-wind-chime-${i + 1}`,
        size: [0.058, h, 0.058],
        position: [cx, -h * 0.5 - 0.08, 0],
        material: brassMat,
        castShadow: true,
        receiveShadow: false
      })
    );
  }
  const chimePivot: Vec3 = [0, 3.08, -4.55];
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

  // 7. Single-draw instanced garden blossom clusters around the outer terrace
  const bloomTransforms: AuraTransformSpec[] = [];
  const bloomColors: AuraColor[] = [];
  const bloomPalette: readonly AuraColor[] = ["#F7A6C1", "#FAD678", "#C8ACF5", "#96E0B8", "#94CAFA"];
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2 + (rng() - 0.5) * 0.1;
    const r = 3.85 + rng() * 2.8;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r * 0.86 - 0.6;
    if (Math.abs(bx) < 3.15 && bz > -2.4 && bz < 2.4) continue;
    bloomTransforms.push({
      position: [bx, 0.16 + rng() * 0.08, bz],
      rotation: [0, rng() * Math.PI * 2, 0],
      scale: 0.85 + rng() * 0.35
    });
    bloomColors.push(bloomPalette[i % bloomPalette.length]!);
  }
  const bloomWind = gentleBreezeWind(ctx.reducedMotion, 0.2, 0.26, 52);
  nodes.push(
    instances.sphere({
      name: "music garden pastel blooms",
      size: [0.22, 0.18, 0.22],
      material: instanceClayMat("#FFFFFF"),
      transforms: bloomTransforms,
      colors: bloomColors,
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
 * Music Garden — seafoam felt island, curved travertine amphitheater terrace,
 * 18 bevelled lacquered piano keys, 5 pastel `stompStone` pads with ceramic
 * note inlays, and a wooden arch with 5 swaying brushed-brass wind chimes.
 */
export const musicGarden: WorldDefinition = {
  id: "music-garden",
  workingTitle: "Lulu Music Garden",
  ground: { color: "#84C6A8", size: 70 },
  musicBed: "gardenBed",
  buildDiorama: buildMusicGardenDiorama,
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
