import {
  geometry,
  instances,
  lights,
  primitives,
  type AuraColor,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import { path2d, type ComposePart, type ProceduralVec2, type ProceduralVec3 } from "@aura3d/engine/procedural";
import {
  brushedMetalMat,
  buildPleatedCurtainPanel,
  cachedDioramaSpec,
  ceramicMat,
  clayMat,
  clearcoatPaintMat,
  clearGlassMat,
  clockDialMat,
  composeGeometry,
  coneSpec,
  cylinderSpec,
  dioramaGroup,
  ellipsoidSpec,
  extrudeContour,
  fabricMat,
  feltMat,
  instanceWoodMat,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  srgbHexToLinearRgba,
  torusSpec,
  warmPracticalGlowMat,
  woodMat
} from "./diorama-terrain.js";
import type { Vec3 } from "./motion.js";
import type {
  WorldAnimatedNodeSpec,
  WorldDefinition,
  WorldDioramaContext,
  WorldDioramaSlice
} from "./worlds.js";

const DADO_MOLDING_PROFILE = path2d()
  .moveTo(-0.045, -0.038)
  .lineTo(-0.045, 0.055)
  .lineTo(0.028, 0.055)
  .quadTo(0.058, 0.055, 0.058, 0.018)
  .lineTo(0.058, -0.038)
  .close()
  .points({ curveSegments: 3 });

const BASEBOARD_PROFILE = path2d()
  .moveTo(-0.035, -0.068)
  .lineTo(-0.035, 0.068)
  .lineTo(0.018, 0.068)
  .quadTo(0.046, 0.068, 0.048, 0.038)
  .lineTo(0.052, -0.068)
  .close()
  .points({ curveSegments: 3 });

const CROWN_CORNICE_PROFILE = path2d()
  .moveTo(-0.05, -0.06)
  .lineTo(-0.05, 0.075)
  .lineTo(0.095, 0.075)
  .lineTo(0.095, 0.035)
  .quadTo(0.062, 0.032, 0.052, -0.008)
  .quadTo(0.04, -0.048, 0.014, -0.06)
  .close()
  .points({ curveSegments: 4 });

function buildClockDialDiscSpec(radius: number, radialSegs = 40): ReturnType<typeof cachedDioramaSpec> {
  return cachedDioramaSpec(`home-nook-clock-dial:${radius.toFixed(3)}:${radialSegs}`, () => {
    const positions: number[] = [0, 0, 0];
    const normals: number[] = [0, 0, 1];
    const uvs: number[] = [0.5, 0.5];
    const indices: number[] = [];

    for (let s = 0; s < radialSegs; s += 1) {
      const theta = (s / radialSegs) * Math.PI * 2;
      const cx = Math.cos(theta);
      const sy = Math.sin(theta);
      positions.push(cx * radius, sy * radius, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5 + cx * 0.48, 0.5 + sy * 0.48);
    }

    for (let s = 0; s < radialSegs; s += 1) {
      const next = (s + 1) % radialSegs;
      indices.push(0, 1 + s, 1 + next);
    }

    return {
      kind: "aura-custom-geometry",
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint16Array.from(indices)
    };
  });
}

function buildBraidedConcentricRugNodes(): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const outerBraidSpec = cachedDioramaSpec("home-nook-rug-outer-braids", () => {
    const parts: ComposePart[] = [];
    const ringRadii = [2.14, 1.94, 1.54, 1.24];
    for (const r of ringRadii) {
      parts.push({
        geometry: torusSpec(r, 0.048, 12, 56),
        position: [0, 0.008, 0],
        rotation: [Math.PI * 0.5, 0, 0],
        scale: [1, 0.715, 0.14]
      });
    }
    return composeGeometry(parts);
  });

  const innerBraidSpec = cachedDioramaSpec("home-nook-rug-inner-braids", () => {
    const parts: ComposePart[] = [];
    const ringRadii = [2.04, 1.74, 1.39, 0.88, 0.54];
    for (const r of ringRadii) {
      parts.push({
        geometry: torusSpec(r, 0.044, 12, 52),
        position: [0, 0.009, 0],
        rotation: [Math.PI * 0.5, 0, 0],
        scale: [1, 0.715, 0.14]
      });
    }
    return composeGeometry(parts);
  });

  return [
    primitives.cylinder({
      name: "nook woven terracotta rug outer",
      size: [4.42, 0.008, 3.16],
      position: [0, 0.004, 0.1],
      material: feltMat("#E6A079", false),
      castShadow: false,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nook woven cream rug inner",
      size: [3.66, 0.009, 2.56],
      position: [0, 0.005, 0.1],
      material: feltMat("#F8E9D4", false),
      castShadow: false,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nook woven sage rug center",
      size: [2.16, 0.01, 1.52],
      position: [0, 0.006, 0.1],
      material: feltMat("#DCE5D0", false),
      castShadow: false,
      receiveShadow: true
    }),
    geometry
      .custom(outerBraidSpec, {
        name: "nook braided rug terracotta rings",
        material: fabricMat("#D88966", false, "wickerWeave"),
        castShadow: false,
        receiveShadow: true
      })
      .position(0, 0, 0.1),
    geometry
      .custom(innerBraidSpec, {
        name: "nook braided rug oatmeal stitch rings",
        material: fabricMat("#F4DFC8", false, "quiltedStitch"),
        castShadow: false,
        receiveShadow: true
      })
      .position(0, 0, 0.1)
  ];
}

function buildOutdoorWindowFlowerBox(): AuraNodeBuilder<AuraSceneNode> {
  const troughSpec = cachedDioramaSpec("home-nook-window-planter-box", () => {
    const body = roundedBoxSpec(2.08, 0.24, 0.3, 0.028);
    const rim = roundedBoxSpec(2.16, 0.048, 0.35, 0.016);
    const corbel = roundedBoxSpec(0.09, 0.18, 0.24, 0.018);
    return composeGeometry([
      { geometry: body, position: [0, 0.12, 0] },
      { geometry: rim, position: [0, 0.24, 0] },
      { geometry: corbel, position: [-0.74, -0.06, 0.02], rotation: [0.22, 0, 0] },
      { geometry: corbel, position: [0, -0.06, 0.02], rotation: [0.22, 0, 0] },
      { geometry: corbel, position: [0.74, -0.06, 0.02], rotation: [0.22, 0, 0] }
    ]);
  });

  const foliageSpec = cachedDioramaSpec("home-nook-window-planter-foliage", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [-0.76, 0.28, 0.02], scale: [0.32, 0.19, 0.22] },
        { position: [-0.38, 0.31, -0.02], scale: [0.35, 0.22, 0.24] },
        { position: [0, 0.32, 0.02], scale: [0.38, 0.24, 0.25] },
        { position: [0.38, 0.3, -0.01], scale: [0.34, 0.21, 0.23] },
        { position: [0.76, 0.28, 0.02], scale: [0.31, 0.18, 0.22] }
      ],
      { seed: 612, amplitude: 0.018, frequency: 3.1 }
    );
    return built.geometry;
  });

  const blossomsSpec = cachedDioramaSpec("home-nook-window-planter-blossoms", () => {
    const parts: ComposePart[] = [];
    const petal = ellipsoidSpec(0.042, 0.02, 0.062, 12, 10);
    const center = ellipsoidSpec(0.032, 0.024, 0.032, 10, 8);
    const flowerSpots: readonly [number, number, number, string][] = [
      [-0.78, 0.42, 0.05, "#FF8EA2"],
      [-0.48, 0.46, -0.02, "#FFD86B"],
      [-0.18, 0.48, 0.04, "#C7A6F7"],
      [0.14, 0.47, -0.01, "#FF9882"],
      [0.46, 0.45, 0.05, "#FFE17D"],
      [0.76, 0.41, 0.01, "#F79AC0"]
    ];
    for (const [fx, fy, fz, hex] of flowerSpots) {
      const petalCol = srgbHexToLinearRgba(hex);
      const heartCol = srgbHexToLinearRgba("#FFF3A6");
      for (let p = 0; p < 5; p += 1) {
        const ang = (p / 5) * Math.PI * 2;
        parts.push({
          geometry: petal,
          position: [fx + Math.sin(ang) * 0.046, fy, fz + Math.cos(ang) * 0.046],
          rotation: [0.18, ang, 0],
          color: petalCol
        });
      }
      parts.push({
        geometry: center,
        position: [fx, fy + 0.014, fz],
        color: heartCol
      });
    }
    return composeGeometry(parts);
  });

  return dioramaGroup(
    "nook outdoor flower planter",
    [
      geometry.custom(troughSpec, {
        name: "nook outdoor planter cedar box",
        material: woodMat("#C58B59"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(foliageSpec, {
        name: "nook outdoor planter leaf mound",
        material: clayMat("#66B46C"),
        castShadow: false,
        receiveShadow: true
      }),
      geometry.custom(blossomsSpec, {
        name: "nook outdoor planter petals",
        material: ceramicMat("#FFFFFF"),
        castShadow: false,
        receiveShadow: true
      })
    ],
    { position: [-1.2, 0.82, -4.62] }
  );
}

function buildCarvedWallClock(animated: WorldAnimatedNodeSpec[]): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const clockPos: Vec3 = [0.42, 2.58, -4.22];

  const caseSpec = cachedDioramaSpec("home-nook-carved-clock-case", () => {
    const outerRing = torusSpec(0.26, 0.042, 16, 40);
    const backing = cylinderSpec(0.27, 0.28, 0.06, 32);
    const pediment = roundedBoxSpec(0.36, 0.09, 0.075, 0.022);
    const finialProfile: ProceduralVec2[] = [
      [0, 0],
      [0.036, 0],
      [0.028, 0.03],
      [0.044, 0.065],
      [0.02, 0.105],
      [0, 0.12]
    ];
    const finial = sculptOrganicLathe(finialProfile, { segments: 18 });
    const lowerApron = roundedBoxSpec(0.24, 0.14, 0.055, 0.02);
    return composeGeometry([
      { geometry: backing, rotation: [Math.PI * 0.5, 0, 0], position: [0, 0, -0.01] },
      { geometry: outerRing, position: [0, 0, 0.022] },
      { geometry: pediment, position: [0, 0.28, 0.006] },
      { geometry: finial, position: [0, 0.32, 0.008] },
      { geometry: lowerApron, position: [0, -0.29, -0.008] }
    ]);
  });

  const handsSpec = cachedDioramaSpec("home-nook-clock-hands", () => {
    const hourHand = roundedBoxSpec(0.022, 0.12, 0.012, 0.004);
    const minuteHand = roundedBoxSpec(0.016, 0.175, 0.012, 0.004);
    const centerPin = cylinderSpec(0.022, 0.022, 0.024, 14);
    return composeGeometry([
      { geometry: hourHand, position: [-0.036, 0.036, 0.034], rotation: [0, 0, 0.78] },
      { geometry: minuteHand, position: [0.028, 0.068, 0.038], rotation: [0, 0, -0.38] },
      { geometry: centerPin, rotation: [Math.PI * 0.5, 0, 0], position: [0, 0, 0.04] }
    ]);
  });

  const pendulumSpec = cachedDioramaSpec("home-nook-clock-pendulum", () => {
    const rod = cylinderSpec(0.008, 0.008, 0.22, 10);
    const bob = cylinderSpec(0.052, 0.052, 0.022, 24);
    return composeGeometry([
      { geometry: rod, position: [0, -0.11, 0] },
      { geometry: bob, rotation: [Math.PI * 0.5, 0, 0], position: [0, -0.22, 0.006] }
    ]);
  });

  const pendulumPivot: Vec3 = [clockPos[0], clockPos[1] - 0.2, clockPos[2] + 0.018];
  animated.push({
    id: "nook-clock-pendulum",
    restPosition: pendulumPivot,
    restRotation: [0, 0, 0],
    sample: (t) => ({
      position: pendulumPivot,
      rotation: [0, 0, Math.sin(t * 2.1) * 0.14]
    })
  });

  return [
    dioramaGroup(
      "nook carved wooden wall clock",
      [
        geometry.custom(caseSpec, {
          name: "nook wall clock walnut bezel",
          material: woodMat("#9B683F"),
          castShadow: true,
          receiveShadow: true
        }),
        geometry
          .custom(buildClockDialDiscSpec(0.225), {
            name: "nook wall clock enamel dial",
            material: clockDialMat("#FFFDF6"),
            castShadow: false,
            receiveShadow: false
          })
          .position(0, 0, 0.026),
        geometry.custom(handsSpec, {
          name: "nook wall clock brass hands",
          material: clearcoatPaintMat("#384354", false),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: clockPos }
    ),
    geometry
      .custom(pendulumSpec, {
        name: "nook-clock-pendulum",
        material: brushedMetalMat("#E4BE68"),
        castShadow: true,
        receiveShadow: false
      })
      .position(pendulumPivot[0], pendulumPivot[1], pendulumPivot[2])
      .runtime({ id: "nook-clock-pendulum", tags: ["diorama", "clock"], mutable: true })
  ];
}

export function homeNookScene(
  _ctx: WorldDioramaContext & { readonly softwareRenderer?: boolean } = {
    reducedMotion: false,
    available: () => false
  }
): WorldDioramaSlice {
  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Honey-oak plank floor (flush top at y = 0.000) + bevelled room plinth
  nodes.push(
    primitives.box({
      name: "nook subfloor plinth",
      size: [22.8, 0.26, 11.4],
      position: [0, -0.15, 0.4],
      material: woodMat("#B98452", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  const plankTransforms: AuraTransformSpec[] = [];
  const plankColors: AuraColor[] = [];
  const oakTones: readonly AuraColor[] = ["#DCA974", "#D39E68", "#E3B27E", "#CCA070", "#DAA56F"];
  const plankCount = 50;
  const plankWidth = 0.46;
  for (let i = 0; i < plankCount; i += 1) {
    const x = (i - (plankCount - 1) * 0.5) * plankWidth;
    plankTransforms.push({
      position: [x, -0.018, 0.4]
    });
    plankColors.push(oakTones[i % oakTones.length]!);
  }
  nodes.push(
    instances.roundedBox({
      name: "nook honey oak floor planks",
      size: [plankWidth - 0.012, 0.036, 11.0],
      material: instanceWoodMat("#FFFFFF"),
      transforms: plankTransforms,
      colors: plankColors,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Cozy braided concentric rug rings (wafer-thin <= 0.011m so active stage floor stays flat at y ≈ 0)
  nodes.push(...buildBraidedConcentricRugNodes());

  // 3. Cream-plaster walls + baseboard, dado rail, wainscoting panels & crown mouldings
  const wallPlaster = clayMat("#FAF0DF", false);
  const wainscotCream = clayMat("#EFE1CA", false);
  const trimWood = woodMat("#DFC7A7", false);

  nodes.push(
    primitives.box({
      name: "nook back wall left",
      size: [9.15, 6.2, 0.22],
      position: [-6.825, 3.1, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook back wall right",
      size: [11.55, 6.2, 0.22],
      position: [5.625, 3.1, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook back wall window apron",
      size: [2.14, 0.96, 0.22],
      position: [-1.2, 0.48, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook back wall window header",
      size: [2.14, 3.24, 0.22],
      position: [-1.2, 4.58, -4.35],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook left wing wall",
      size: [0.22, 6.2, 11.4],
      position: [-11.25, 3.1, 1.2],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook right wing wall",
      size: [0.22, 6.2, 11.4],
      position: [11.25, 3.1, 1.2],
      material: wallPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    // Baseboard mouldings (back, left, and right walls)
    extrudeContour({
      name: "nook back baseboard moulding",
      profile: BASEBOARD_PROFILE,
      from: [-11.15, 0.068, -4.22],
      to: [11.15, 0.068, -4.22],
      material: trimWood,
      castShadow: false
    }),
    extrudeContour({
      name: "nook left baseboard moulding",
      profile: BASEBOARD_PROFILE,
      from: [-11.12, 0.068, 5.2],
      to: [-11.12, 0.068, -4.22],
      material: trimWood,
      castShadow: false
    }),
    extrudeContour({
      name: "nook right baseboard moulding",
      profile: BASEBOARD_PROFILE,
      from: [11.12, 0.068, -4.22],
      to: [11.12, 0.068, 5.2],
      material: trimWood,
      castShadow: false
    }),
    // Dado rails
    extrudeContour({
      name: "nook back dado rail",
      profile: DADO_MOLDING_PROFILE,
      from: [-11.15, 0.92, -4.22],
      to: [11.15, 0.92, -4.22],
      material: trimWood,
      castShadow: true
    }),
    extrudeContour({
      name: "nook left dado rail",
      profile: DADO_MOLDING_PROFILE,
      from: [-11.12, 0.92, 5.2],
      to: [-11.12, 0.92, -4.22],
      material: trimWood,
      castShadow: false
    }),
    extrudeContour({
      name: "nook right dado rail",
      profile: DADO_MOLDING_PROFILE,
      from: [11.12, 0.92, -4.22],
      to: [11.12, 0.92, 5.2],
      material: trimWood,
      castShadow: false
    }),
    // Crown cornice mouldings
    extrudeContour({
      name: "nook back crown cornice",
      profile: CROWN_CORNICE_PROFILE,
      from: [-11.15, 3.88, -4.2],
      to: [11.15, 3.88, -4.2],
      material: trimWood,
      castShadow: false
    }),
    extrudeContour({
      name: "nook left crown cornice",
      profile: CROWN_CORNICE_PROFILE,
      from: [-11.12, 3.88, 5.2],
      to: [-11.12, 3.88, -4.2],
      material: trimWood,
      castShadow: false
    }),
    extrudeContour({
      name: "nook right crown cornice",
      profile: CROWN_CORNICE_PROFILE,
      from: [11.12, 3.88, -4.2],
      to: [11.12, 3.88, 5.2],
      material: trimWood,
      castShadow: false
    })
  );

  // Recessed wainscoting panels across back & side walls (1 draw call)
  const wainscotTransforms: AuraTransformSpec[] = [];
  for (let i = 0; i < 17; i += 1) {
    const x = -10.24 + i * 1.28;
    wainscotTransforms.push({ position: [x, 0.48, -4.22] });
  }
  for (let j = 0; j < 5; j += 1) {
    const z = -3.4 + j * 1.45;
    wainscotTransforms.push({ position: [-11.12, 0.48, z], rotation: [0, Math.PI * 0.5, 0] });
    wainscotTransforms.push({ position: [11.12, 0.48, z], rotation: [0, Math.PI * 0.5, 0] });
  }
  nodes.push(
    instances.roundedBox({
      name: "nook bevelled wainscoting panels",
      size: [1.08, 0.7, 0.04],
      material: instanceWoodMat("#EFE1CA"),
      transforms: wainscotTransforms,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 4. Sunlit exterior garden backdrop (`home-nook-sky-disc`), outdoor flower-box, arched window & pleated `parametricSurface` curtains
  const backdropDiscSpec = cachedDioramaSpec("home-nook-outside-disc", () =>
    composeGeometry([
      {
        geometry: cylinderSpec(2.38, 2.38, 0.06, 40),
        rotation: [Math.PI * 0.5, 0, 0],
        scale: [1.08, 0.86, 1]
      }
    ])
  );
  const backdropRestPos: Vec3 = [-1.2, 2.1, -5.85];

  const gardenShrubSpec = cachedDioramaSpec("home-nook-exterior-shrubs", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [-0.66, 0, 0.04], scale: [0.82, 0.56, 0.48] },
        { position: [0.62, 0.05, -0.02], scale: [0.86, 0.62, 0.5] },
        { position: [-0.04, -0.08, -0.06], scale: [0.68, 0.48, 0.42] }
      ],
      { seed: 519, amplitude: 0.026, frequency: 2.5 }
    );
    return built.geometry;
  });

  const archedCasingSpec = cachedDioramaSpec("home-nook-arched-casing", () => {
    const pts: readonly ProceduralVec3[] = [
      [-2.24, 0.96, -4.24],
      [-2.24, 2.52, -4.24],
      [-1.85, 2.94, -4.24],
      [-1.2, 3.08, -4.24],
      [-0.55, 2.94, -4.24],
      [-0.16, 2.52, -4.24],
      [-0.16, 0.96, -4.24]
    ];
    return sculptCurvedLimb(pts, 0.056, { steps: 38, radialSegments: 14 });
  });

  const curtainRodSpec = cachedDioramaSpec("home-nook-curtain-rod", () => {
    const rod = cylinderSpec(0.022, 0.022, 2.92, 18);
    const finial = ellipsoidSpec(0.052, 0.066, 0.052, 16, 12);
    return composeGeometry([
      { geometry: rod, rotation: [0, 0, Math.PI * 0.5] },
      { geometry: finial, position: [-1.5, 0, 0], rotation: [0, 0, Math.PI * 0.5] },
      { geometry: finial, position: [1.5, 0, 0], rotation: [0, 0, Math.PI * 0.5] }
    ]);
  });

  nodes.push(
    geometry
      .custom(backdropDiscSpec, {
        name: "home-nook-outside-backdrop",
        material: warmPracticalGlowMat("#8ECEFF", "#B4DFFF", 0.42),
        castShadow: false,
        receiveShadow: false
      })
      .position(backdropRestPos[0], backdropRestPos[1], backdropRestPos[2])
      .runtime({ id: "home-nook-sky-disc", tags: ["diorama", "backdrop"], mutable: true }),
    geometry
      .custom(gardenShrubSpec, {
        name: "nook exterior garden hedgerow",
        material: feltMat("#88C67A", false),
        castShadow: false,
        receiveShadow: false
      })
      .position(-1.2, 1.18, -5.28),
    buildOutdoorWindowFlowerBox(),
    primitives.box({
      name: "nook honey oak window sill",
      size: [2.42, 0.08, 0.34],
      position: [-1.2, 0.95, -4.2],
      material: woodMat("#CFA06E"),
      castShadow: true,
      receiveShadow: true
    }),
    primitives.box({
      name: "nook window clear glass pane",
      size: [2.06, 1.96, 0.02],
      position: [-1.2, 1.95, -4.34],
      material: clearGlassMat("#EAF7FF"),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nook window vertical mullion",
      size: [0.055, 1.96, 0.06],
      position: [-1.2, 1.95, -4.3],
      material: wainscotCream,
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nook window horizontal mullion",
      size: [2.06, 0.055, 0.06],
      position: [-1.2, 1.96, -4.3],
      material: wainscotCream,
      castShadow: false,
      receiveShadow: false
    }),
    geometry.custom(archedCasingSpec, {
      name: "nook arched window casing",
      material: woodMat("#CFA06E"),
      castShadow: true,
      receiveShadow: true
    }),
    geometry
      .custom(curtainRodSpec, {
        name: "nook brass curtain rod",
        material: brushedMetalMat("#DFBA6E"),
        castShadow: true,
        receiveShadow: false
      })
      .position(-1.2, 3.16, -4.08)
  );

  animated.push({
    id: "home-nook-sky-disc",
    restPosition: backdropRestPos,
    restScale: [1, 1, 1],
    sample: (t) => {
      const s = 1 + Math.sin(t * 0.42) * 0.008;
      return {
        position: backdropRestPos,
        scale: [s, s, 1]
      };
    }
  });

  const curtainConfigs: readonly {
    readonly id: "nook-curtain-left" | "nook-curtain-right";
    readonly side: "left" | "right";
    readonly x: number;
    readonly phase: number;
  }[] = [
    { id: "nook-curtain-left", side: "left", x: -2.28, phase: 0 },
    { id: "nook-curtain-right", side: "right", x: -0.12, phase: 1.4 }
  ];
  for (const c of curtainConfigs) {
    const restPos: Vec3 = [c.x, 1.98, -4.08];
    nodes.push(
      buildPleatedCurtainPanel({
        name: c.id,
        side: c.side,
        width: 0.62,
        height: 2.34,
        color: "#F3AD96",
        cordColor: "#E5B96E"
      })
        .position(restPos[0], restPos[1], restPos[2])
        .runtime({ id: c.id, tags: ["diorama", "curtain"], mutable: true })
    );
    animated.push({
      id: c.id,
      restPosition: restPos,
      restRotation: [0, 0, 0],
      sample: (t) => ({
        position: restPos,
        rotation: [0, 0, Math.sin(t * 0.75 + c.phase) * 0.018]
      })
    });
  }

  // 5. Carved wooden wall clock (`clockAndGaugeDial` texture) + brass pendulum
  nodes.push(...buildCarvedWallClock(animated));

  // 6. Turned wooden floor lamp (`home-nook-lamp-shade` + `lights.point`), afternoon `lights.spot` & `effects.lightCone` (`home-nook-window-beam`)
  const lampPos: Vec3 = [3.58, 0, -3.22];
  const lampStandSpec = cachedDioramaSpec("home-nook-turned-floor-lamp", () => {
    const profile: ProceduralVec2[] = [
      [0, 0],
      [0.24, 0],
      [0.23, 0.04],
      [0.16, 0.075],
      [0.06, 0.13],
      [0.036, 0.22],
      [0.032, 0.88],
      [0.048, 0.94],
      [0.03, 1.0],
      [0.028, 1.62],
      [0.046, 1.68],
      [0, 1.72]
    ];
    return sculptOrganicLathe(profile, { segments: 24 });
  });

  const lampShadeSpec = cachedDioramaSpec("home-nook-linen-lamp-shade", () => {
    const profile: ProceduralVec2[] = [
      [0.14, 0.22],
      [0.29, -0.22],
      [0.275, -0.22],
      [0.128, 0.22],
      [0.14, 0.22]
    ];
    return sculptOrganicLathe(profile, { segments: 28 });
  });
  const shadeRestPos: Vec3 = [lampPos[0], 1.84, lampPos[2]];

  nodes.push(
    geometry
      .custom(lampStandSpec, {
        name: "nook floor lamp turned stand",
        material: woodMat("#C7915D"),
        castShadow: true,
        receiveShadow: true
      })
      .position(lampPos[0], 0, lampPos[2]),
    geometry
      .custom(lampShadeSpec, {
        name: "home-nook-lamp-shade",
        material: warmPracticalGlowMat("#FFF8EC", "#FFEAC4", 0.35),
        castShadow: false,
        receiveShadow: false
      })
      .position(shadeRestPos[0], shadeRestPos[1], shadeRestPos[2])
      .runtime({ id: "home-nook-lamp-shade", tags: ["diorama", "lamp-shade"], mutable: true }),
    lights.point({
      name: "nook floor lamp warm point",
      position: [lampPos[0], 1.72, lampPos[2] + 0.08],
      color: "#FFF0D4",
      intensity: 0.45,
      distance: 3.2,
      decay: 2
    })
  );

  animated.push({
    id: "home-nook-lamp-shade",
    restPosition: shadeRestPos,
    restScale: [1, 1, 1],
    sample: (t) => {
      const pulse = 1 + Math.sin(t * 0.85) * 0.006;
      return {
        position: shadeRestPos,
        scale: [pulse, 1, pulse]
      };
    }
  });

  // 7. Framed pastel relief wall art (abstract hills & sun — zero text or figures)
  nodes.push(
    dioramaGroup(
      "nook pastel relief frame 1",
      [
        primitives.box({
          name: "nook art frame 1 oak",
          size: [0.92, 0.74, 0.05],
          material: woodMat("#CEA06E"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.box({
          name: "nook art frame 1 azure mat",
          size: [0.78, 0.6, 0.06],
          position: [0, 0, 0.01],
          material: clayMat("#DCEBFA", false),
          castShadow: false,
          receiveShadow: true
        }),
        primitives.cylinder({
          name: "nook art frame 1 sun disc",
          size: [0.22, 0.02, 0.22],
          position: [0.16, 0.11, 0.04],
          rotation: [Math.PI * 0.5, 0, 0],
          material: ceramicMat("#FAD373", false),
          castShadow: false,
          receiveShadow: false
        }),
        primitives.sphere({
          name: "nook art frame 1 hill relief",
          size: [0.56, 0.24, 0.04],
          position: [-0.08, -0.14, 0.04],
          material: feltMat("#9AD0A6", false),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: [1.58, 2.18, -4.21] }
    ),
    dioramaGroup(
      "nook pastel relief frame 2",
      [
        primitives.box({
          name: "nook art frame 2 oak",
          size: [0.72, 0.86, 0.05],
          material: woodMat("#CEA06E"),
          castShadow: true,
          receiveShadow: true
        }),
        primitives.box({
          name: "nook art frame 2 blush mat",
          size: [0.58, 0.72, 0.06],
          position: [0, 0, 0.01],
          material: clayMat("#F9E1E6", false),
          castShadow: false,
          receiveShadow: true
        }),
        primitives.torus({
          name: "nook art frame 2 pastel arc",
          size: [0.34, 0.34, 0.05],
          position: [0, -0.04, 0.04],
          material: ceramicMat("#C8AEF4", false),
          castShadow: false,
          receiveShadow: false
        })
      ],
      { position: [2.68, 2.02, -4.21] }
    )
  );

  // 8. Honey-oak wooden toy cubby shelf + ceramic/wood miniatures + sculpted terracotta potted plant
  const cubbyShelfSpec = cachedDioramaSpec("home-nook-cubby-shelf", () => {
    const top = roundedBoxSpec(1.42, 0.055, 0.44, 0.014);
    const bottom = roundedBoxSpec(1.42, 0.065, 0.44, 0.014);
    const mid = roundedBoxSpec(1.34, 0.042, 0.4, 0.01);
    const side = roundedBoxSpec(0.055, 1.02, 0.42, 0.012);
    const divider = roundedBoxSpec(0.04, 0.94, 0.38, 0.008);
    const back = roundedBoxSpec(1.36, 1.0, 0.03, 0.006);
    return composeGeometry([
      { geometry: bottom, position: [0, 0.035, 0] },
      { geometry: mid, position: [0, 0.53, 0.01] },
      { geometry: top, position: [0, 1.03, 0] },
      { geometry: side, position: [-0.67, 0.53, 0] },
      { geometry: side, position: [0.67, 0.53, 0] },
      { geometry: divider, position: [0, 0.53, 0.01] },
      { geometry: back, position: [0, 0.53, -0.19] }
    ]);
  });

  const terracottaPotSpec = cachedDioramaSpec("home-nook-terracotta-pot", () => {
    const profile: ProceduralVec2[] = [
      [0, 0],
      [0.15, 0],
      [0.195, 0.31],
      [0.215, 0.33],
      [0.215, 0.38],
      [0.18, 0.38],
      [0.165, 0.32],
      [0, 0.32]
    ];
    return sculptOrganicLathe(profile, { segments: 24 });
  });

  const indoorFoliageSpec = cachedDioramaSpec("home-nook-potted-foliage", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [0, 0.5, 0], scale: [0.24, 0.19, 0.24] },
        { position: [0.13, 0.66, 0.05], scale: [0.19, 0.16, 0.19] },
        { position: [-0.12, 0.62, -0.04], scale: [0.18, 0.15, 0.18] }
      ],
      { seed: 734, amplitude: 0.016, frequency: 3.0 }
    );
    return built.geometry;
  });

  nodes.push(
    dioramaGroup(
      "nook wooden toy shelf",
      [
        geometry.custom(cubbyShelfSpec, {
          name: "nook shelf cabinet",
          material: woodMat("#CFA06C"),
          castShadow: true,
          receiveShadow: true
        }),
        geometry
          .custom(
            cachedDioramaSpec("home-nook-shelf-bowl", () =>
              sculptOrganicLathe(
                [
                  [0, 0],
                  [0.075, 0],
                  [0.115, 0.06],
                  [0.12, 0.12],
                  [0.1, 0.12],
                  [0.07, 0.03],
                  [0, 0.03]
                ],
                { segments: 20 }
              )
            ),
            {
              name: "nook shelf ceramic bowl",
              material: ceramicMat("#94CAFA"),
              castShadow: true,
              receiveShadow: true
            }
          )
          .position(-0.34, 1.06, 0.02),
        geometry
          .custom(
            cachedDioramaSpec("home-nook-shelf-tower", () =>
              composeGeometry([
                { geometry: torusSpec(0.085, 0.028, 12, 24), position: [0, 0.03, 0], rotation: [Math.PI * 0.5, 0, 0] },
                { geometry: torusSpec(0.068, 0.025, 12, 24), position: [0, 0.08, 0], rotation: [Math.PI * 0.5, 0, 0] },
                { geometry: torusSpec(0.05, 0.022, 12, 24), position: [0, 0.125, 0], rotation: [Math.PI * 0.5, 0, 0] },
                { geometry: coneSpec(0.038, 0.09, 16, 0.012), position: [0, 0.19, 0] }
              ])
            ),
            {
              name: "nook shelf stacking tower",
              material: ceramicMat("#F6A4BE"),
              castShadow: true,
              receiveShadow: true
            }
          )
          .position(0.06, 1.06, 0),
        primitives.cylinder({
          name: "nook shelf honey drum",
          size: [0.22, 0.18, 0.22],
          position: [0.4, 1.15, 0],
          material: ceramicMat("#FAD36E"),
          castShadow: true,
          receiveShadow: true
        })
      ],
      { position: [-3.72, 0, -3.55], rotation: [0, 0.16, 0] }
    ),
    dioramaGroup(
      "nook terracotta potted plant",
      [
        geometry.custom(terracottaPotSpec, {
          name: "nook terracotta pot",
          material: clayMat("#D47E5A"),
          castShadow: true,
          receiveShadow: true
        }),
        geometry.custom(indoorFoliageSpec, {
          name: "nook plant leaf cluster",
          material: feltMat("#7BB976"),
          castShadow: true,
          receiveShadow: true
        })
      ],
      { position: [-4.15, 0, -2.55] }
    )
  );

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Home Nook — honey-oak plank floor, cozy braided concentric rug rings,
 * baseboard, dado & crown cornice mouldings, arched sunlit garden window with
 * outdoor flower-box, pleated `parametricSurface` curtains & soft afternoon
 * `effects.lightCone`, carved wooden wall clock (`clockAndGaugeDial`), turned
 * floor lamp (`lights.point`), framed pastel reliefs, and toy cubby shelf.
 */
export const homeNook: WorldDefinition = {
  id: "home-nook",
  workingTitle: "Home Nook",
  ground: { color: "#DCA974", size: 40 },
  musicBed: "homeBed",
  buildDiorama: homeNookScene,
  dressing: [
    {
      kind: "primitive",
      shape: "cylinder",
      at: [3.45, 0.16, -1.95],
      size: [0.72, 0.32, 0.72],
      color: "#E8A690",
      materialStyle: "felt"
    },
    {
      kind: "model",
      key: "cushion",
      at: [3.45, 0.32, -1.95],
      yaw: -0.25,
      heightM: 0.22
    },
    {
      kind: "model",
      key: "table",
      at: [3.65, 0, -0.85],
      yaw: -0.35,
      heightM: 0.62
    },
    {
      kind: "model",
      key: "plate",
      at: [3.65, 0.62, -0.85],
      yaw: 0.2,
      heightM: 0.08
    },
    {
      kind: "model",
      key: "bush",
      at: [-4.15, 0.38, -2.55],
      heightM: 0.72
    }
  ]
};
