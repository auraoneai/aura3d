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
  clearGlassMat,
  composeGeometry,
  cylinderSpec,
  dioramaGroup,
  ellipsoidSpec,
  extrudeContour,
  extrudeContourSpec,
  fabricMat,
  feltMat,
  instanceWoodMat,
  plushCloudMat,
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

const NURSERY_DADO_PROFILE = path2d()
  .moveTo(-0.045, -0.038)
  .lineTo(-0.045, 0.055)
  .lineTo(0.028, 0.055)
  .quadTo(0.058, 0.055, 0.058, 0.018)
  .lineTo(0.058, -0.038)
  .close()
  .points({ curveSegments: 3 });

const NURSERY_BASEBOARD_PROFILE = path2d()
  .moveTo(-0.035, -0.068)
  .lineTo(-0.035, 0.068)
  .lineTo(0.018, 0.068)
  .quadTo(0.046, 0.068, 0.048, 0.038)
  .lineTo(0.052, -0.068)
  .close()
  .points({ curveSegments: 3 });

const NURSERY_CORNICE_PROFILE = path2d()
  .moveTo(-0.05, -0.06)
  .lineTo(-0.05, 0.075)
  .lineTo(0.095, 0.075)
  .lineTo(0.095, 0.035)
  .quadTo(0.062, 0.032, 0.052, -0.008)
  .quadTo(0.04, -0.048, 0.014, -0.06)
  .close()
  .points({ curveSegments: 4 });

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

function buildBraidedNurseryRugNodes(): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const outerBraidSpec = cachedDioramaSpec("moonlit-nursery-rug-outer-braids", () => {
    const parts: ComposePart[] = [];
    const ringRadii = [2.18, 1.96, 1.56, 1.22];
    for (const r of ringRadii) {
      parts.push({
        geometry: torusSpec(r, 0.044, 12, 52),
        position: [0, 0.001, 0],
        rotation: [Math.PI * 0.5, 0, 0],
        scale: [1, 0.72, 0.12]
      });
    }
    return composeGeometry(parts);
  });

  const innerBraidSpec = cachedDioramaSpec("moonlit-nursery-rug-inner-braids", () => {
    const parts: ComposePart[] = [];
    const ringRadii = [2.06, 1.76, 1.38, 0.88, 0.52];
    for (const r of ringRadii) {
      parts.push({
        geometry: torusSpec(r, 0.04, 12, 48),
        position: [0, 0.0015, 0],
        rotation: [Math.PI * 0.5, 0, 0],
        scale: [1, 0.72, 0.12]
      });
    }
    return composeGeometry(parts);
  });

  // Recessed stepped discs so the active center rug sits flush at y === 0.000.
  return [
    primitives.cylinder({
      name: "nursery braided plum rug outer",
      size: [4.56, 0.008, 3.28],
      position: [0, -0.005, 0.1],
      material: feltMat("#7D6084", false),
      castShadow: false,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nursery braided oatmeal rug middle",
      size: [3.68, 0.008, 2.64],
      position: [0, -0.0045, 0.1],
      material: feltMat("#EADBC8", false),
      castShadow: false,
      receiveShadow: true
    }),
    primitives.cylinder({
      name: "nursery braided lavender rug center",
      size: [2.36, 0.008, 1.68],
      position: [0, -0.004, 0.1],
      material: feltMat("#CDBCE0", false),
      castShadow: false,
      receiveShadow: true
    }),
    geometry
      .custom(outerBraidSpec, {
        name: "nursery braided rug plum rings",
        material: fabricMat("#94769E", false, "wickerWeave"),
        castShadow: false,
        receiveShadow: true
      })
      .position(0, 0, 0.1),
    geometry
      .custom(innerBraidSpec, {
        name: "nursery braided rug cream stitch rings",
        material: fabricMat("#F2E4D2", false, "quiltedStitch"),
        castShadow: false,
        receiveShadow: true
      })
      .position(0, 0, 0.1)
  ];
}

function buildWindowMoonAndStarsNode(): AuraNodeBuilder<AuraSceneNode> {
  const crescentSpec = cachedDioramaSpec("moonlit-nursery-window-crescent", () => {
    const spine: ProceduralVec3[] = [];
    const steps = 24;
    const startAng = Math.PI * 0.32;
    const endAng = Math.PI * 1.68;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const ang = startAng + t * (endAng - startAng);
      spine.push([Math.cos(ang) * 0.42, Math.sin(ang) * 0.42, 0]);
    }
    return sculptCurvedLimb(
      spine,
      (t) => 0.018 + Math.sin(t * Math.PI) * 0.095,
      { steps: 30, radialSegments: 16, profileScaleX: 1, profileScaleY: 0.62 }
    );
  });

  const windowStarsSpec = cachedDioramaSpec("moonlit-nursery-window-stars", () => {
    const smallStar = extrudeContourSpec({
      outer: starPolygon2D(0.068, 0.032, 5),
      depth: 0.024,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 2
    });
    const tinyStar = extrudeContourSpec({
      outer: starPolygon2D(0.044, 0.02, 5),
      depth: 0.02,
      bevelSize: 0.005,
      bevelThickness: 0.005,
      bevelSegments: 2
    });
    return composeGeometry([
      { geometry: smallStar, position: [0.46, 0.34, 0.02], rotation: [0, 0, 0.18] },
      { geometry: smallStar, position: [-0.54, -0.16, 0.02], rotation: [0, 0, -0.24] },
      { geometry: tinyStar, position: [0.22, -0.36, 0.01], rotation: [0, 0, 0.42] },
      { geometry: tinyStar, position: [-0.28, 0.48, 0.01], rotation: [0, 0, -0.14] },
      { geometry: tinyStar, position: [0.62, -0.06, 0.01], rotation: [0, 0, 0.3] }
    ]);
  });

  const nightCloudSillSpec = cachedDioramaSpec("moonlit-nursery-window-cloud-sill", () => {
    const built = sculptFbmOrganicPuffs(
      [
        { position: [-0.62, 0, 0.02], scale: [0.78, 0.46, 0.38] },
        { position: [0.02, -0.04, 0], scale: [0.92, 0.52, 0.42] },
        { position: [0.64, 0.03, 0.02], scale: [0.76, 0.44, 0.36] }
      ],
      { seed: 814, amplitude: 0.022, frequency: 2.4 }
    );
    return built.geometry;
  });

  return dioramaGroup(
    "nursery arched window night vista",
    [
      geometry
        .custom(crescentSpec, {
          name: "nursery window brass crescent moon",
          material: warmPracticalGlowMat("#FFE6A8", "#FFD584", 1.15),
          castShadow: false,
          receiveShadow: false
        })
        .position(-0.14, 0.18, 0)
        .rotation(0, 0, -0.22),
      geometry.custom(windowStarsSpec, {
        name: "nursery window brass star cluster",
        material: warmPracticalGlowMat("#FFF0BE", "#FFD990", 1.08),
        castShadow: false,
        receiveShadow: false
      }),
      geometry
        .custom(nightCloudSillSpec, {
          name: "nursery window dusk cloud bank",
          material: plushCloudMat("#4B3966", false),
          castShadow: false,
          receiveShadow: false
        })
        .position(0, -0.78, 0.14)
    ],
    { position: [-1.15, 2.22, -5.38] }
  );
}

function buildWallSconceNodes(
  id: string,
  wallPos: Vec3
): readonly AuraNodeBuilder<AuraSceneNode>[] {
  const bracketSpec = cachedDioramaSpec("moonlit-nursery-sconce-bracket", () => {
    const plate = cylinderSpec(0.11, 0.115, 0.028, 24);
    const arm = sculptCurvedLimb(
      [
        [0, -0.02, 0.015],
        [0, -0.06, 0.1],
        [0, 0.02, 0.17],
        [0, 0.09, 0.18]
      ],
      0.016,
      { steps: 16, radialSegments: 10 }
    );
    const cup = cylinderSpec(0.038, 0.024, 0.036, 16);
    return composeGeometry([
      { geometry: plate, rotation: [Math.PI * 0.5, 0, 0] },
      { geometry: arm },
      { geometry: cup, position: [0, 0.1, 0.18] }
    ]);
  });

  const shadeSpec = cachedDioramaSpec("moonlit-nursery-sconce-shade", () =>
    sculptOrganicLathe(
      [
        [0.072, 0.11],
        [0.145, -0.09],
        [0.134, -0.09],
        [0.064, 0.11],
        [0.072, 0.11]
      ],
      { segments: 24 }
    )
  );

  return [
    dioramaGroup(
      id,
      [
        geometry.custom(bracketSpec, {
          name: `${id}-brass-bracket`,
          material: brushedMetalMat("#DFBA6E"),
          castShadow: true,
          receiveShadow: false
        }),
        geometry
          .custom(shadeSpec, {
            name: `${id}-amber-shade`,
            material: warmPracticalGlowMat("#FFF0D2", "#FFD89E", 1.2),
            castShadow: false,
            receiveShadow: false
          })
          .position(0, 0.19, 0.18)
      ],
      { position: wallPos }
    ),
    lights.point({
      name: `${id}-warm-point`,
      position: [wallPos[0], wallPos[1] + 0.18, wallPos[2] + 0.24],
      color: "#FFD89E",
      intensity: 1.55,
      distance: 7.4,
      decay: 2
    })
  ];
}

function buildLowBookshelfNode(): AuraNodeBuilder<AuraSceneNode> {
  const shelfFrameSpec = cachedDioramaSpec("moonlit-nursery-low-bookshelf", () => {
    const top = roundedBoxSpec(1.46, 0.055, 0.44, 0.014);
    const bottom = roundedBoxSpec(1.46, 0.065, 0.44, 0.014);
    const mid = roundedBoxSpec(1.38, 0.042, 0.4, 0.01);
    const side = roundedBoxSpec(0.055, 1.02, 0.42, 0.012);
    const divider = roundedBoxSpec(0.04, 0.94, 0.38, 0.008);
    const back = roundedBoxSpec(1.4, 1.0, 0.03, 0.006);
    return composeGeometry([
      { geometry: bottom, position: [0, 0.035, 0] },
      { geometry: mid, position: [0, 0.53, 0.01] },
      { geometry: top, position: [0, 1.03, 0] },
      { geometry: side, position: [-0.69, 0.53, 0] },
      { geometry: side, position: [0.69, 0.53, 0] },
      { geometry: divider, position: [0, 0.53, 0.01] },
      { geometry: back, position: [0, 0.53, -0.19] }
    ]);
  });

  const storybooksSpec = cachedDioramaSpec("moonlit-nursery-bedtime-books", () => {
    const book = roundedBoxSpec(0.055, 0.32, 0.24, 0.008);
    const palette = ["#E4A2B4", "#9EC2EA", "#F2CE82", "#C4ACE6", "#9CD0B2", "#EAB898"];
    const parts: ComposePart[] = [];
    for (let i = 0; i < palette.length; i += 1) {
      const tilt = i === palette.length - 1 ? -0.22 : 0;
      parts.push({
        geometry: book,
        position: [-0.52 + i * 0.066 + (tilt !== 0 ? 0.04 : 0), 0.72, 0.02],
        rotation: [0, 0, tilt],
        color: srgbHexToLinearRgba(palette[i]!)
      });
    }
    return composeGeometry(parts);
  });

  const ceramicJarSpec = cachedDioramaSpec("moonlit-nursery-ceramic-jar", () =>
    sculptOrganicLathe(
      [
        [0, 0],
        [0.075, 0],
        [0.115, 0.08],
        [0.11, 0.19],
        [0.082, 0.23],
        [0.09, 0.25],
        [0, 0.26]
      ],
      { segments: 20 }
    )
  );

  return dioramaGroup(
    "nursery low cedar bookshelf",
    [
      geometry.custom(shelfFrameSpec, {
        name: "nursery cedar bookshelf frame",
        material: woodMat("#B88458"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(storybooksSpec, {
        name: "nursery bedtime board books",
        material: ceramicMat("#FFFFFF"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry
        .custom(ceramicJarSpec, {
          name: "nursery lavender ceramic jar",
          material: ceramicMat("#D7C6EC"),
          castShadow: true,
          receiveShadow: true
        })
        .position(0.36, 0.56, 0.02)
    ],
    { position: [-3.78, 0, -3.52], rotation: [0, 0.16, 0] }
  );
}

function buildRockingNookNode(): AuraNodeBuilder<AuraSceneNode> {
  const rockerFrameSpec = cachedDioramaSpec("moonlit-nursery-rocker-frame", () => {
    const runnerPtsLeft: readonly ProceduralVec3[] = [
      [-0.32, 0.08, -0.44],
      [-0.32, 0.02, -0.14],
      [-0.32, 0.02, 0.16],
      [-0.32, 0.09, 0.44]
    ];
    const runnerPtsRight: readonly ProceduralVec3[] = [
      [0.32, 0.08, -0.44],
      [0.32, 0.02, -0.14],
      [0.32, 0.02, 0.16],
      [0.32, 0.09, 0.44]
    ];
    const runnerL = sculptCurvedLimb(runnerPtsLeft, 0.026, { steps: 18, radialSegments: 10 });
    const runnerR = sculptCurvedLimb(runnerPtsRight, 0.026, { steps: 18, radialSegments: 10 });
    const leg = cylinderSpec(0.022, 0.018, 0.38, 10);
    const seat = roundedBoxSpec(0.68, 0.055, 0.62, 0.018);
    const crest = roundedBoxSpec(0.68, 0.075, 0.045, 0.018);
    const arm = roundedBoxSpec(0.065, 0.036, 0.54, 0.014);
    const spindle = cylinderSpec(0.013, 0.013, 0.58, 8);
    const parts: ComposePart[] = [
      { geometry: runnerL },
      { geometry: runnerR },
      { geometry: leg, position: [-0.28, 0.21, -0.24], rotation: [-0.08, 0, 0] },
      { geometry: leg, position: [0.28, 0.21, -0.24], rotation: [-0.08, 0, 0] },
      { geometry: leg, position: [-0.28, 0.21, 0.22], rotation: [0.06, 0, 0] },
      { geometry: leg, position: [0.28, 0.21, 0.22], rotation: [0.06, 0, 0] },
      { geometry: seat, position: [0, 0.4, 0] },
      { geometry: crest, position: [0, 0.98, -0.28], rotation: [-0.14, 0, 0] },
      { geometry: arm, position: [-0.32, 0.62, 0.02] },
      { geometry: arm, position: [0.32, 0.62, 0.02] },
      { geometry: leg, position: [-0.31, 0.51, 0.22] },
      { geometry: leg, position: [0.31, 0.51, 0.22] }
    ];
    for (let s = -2; s <= 2; s += 1) {
      parts.push({
        geometry: spindle,
        position: [s * 0.12, 0.7, -0.25],
        rotation: [-0.14, 0, 0]
      });
    }
    return composeGeometry(parts);
  });

  const cushionSpec = cachedDioramaSpec("moonlit-nursery-rocker-cushions", () =>
    composeGeometry([
      { geometry: ellipsoidSpec(0.29, 0.075, 0.26, 18, 12), position: [0, 0.46, 0.02] },
      {
        geometry: ellipsoidSpec(0.24, 0.18, 0.08, 16, 12),
        position: [0, 0.66, -0.19],
        rotation: [-0.14, 0, 0]
      }
    ])
  );

  return dioramaGroup(
    "nursery cedar rocking nook",
    [
      geometry.custom(rockerFrameSpec, {
        name: "nursery cedar rocking chair",
        material: woodMat("#BD895B"),
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(cushionSpec, {
        name: "nursery rocker quilted cushions",
        material: fabricMat("#EFE0CE", undefined, "quiltedStitch"),
        castShadow: true,
        receiveShadow: true
      })
    ],
    { position: [3.58, 0, -3.12], rotation: [0, -0.44, 0] }
  );
}

function buildOverheadStarMobile(
  reducedMotion: boolean,
  animated: WorldAnimatedNodeSpec[]
): AuraNodeBuilder<AuraSceneNode> {
  const pivot: Vec3 = [0, 3.36, -1.18];
  const mobileId = "nursery-star-mobile";

  const frameSpec = cachedDioramaSpec("moonlit-nursery-mobile-frame", () => {
    const hoop = torusSpec(0.46, 0.018, 28, 12);
    const crossA = cylinderSpec(0.011, 0.011, 0.92, 10);
    const crossB = cylinderSpec(0.011, 0.011, 0.92, 10);
    const stem = cylinderSpec(0.01, 0.01, 0.48, 8);
    const cords: readonly [number, number, number][] = [
      [-0.38, 0, 0.4],
      [0.38, 0, 0.48],
      [0, 0.38, 0.34],
      [0, -0.38, 0.44],
      [0, 0, 0.28]
    ];
    const parts: ComposePart[] = [
      { geometry: hoop, rotation: [Math.PI * 0.5, 0, 0] },
      { geometry: crossA, rotation: [0, 0, Math.PI * 0.5] },
      { geometry: crossB, rotation: [Math.PI * 0.5, 0, 0] },
      { geometry: stem, position: [0, 0.24, 0] }
    ];
    for (const [cx, cz, len] of cords) {
      parts.push({
        geometry: cylinderSpec(0.005, 0.005, len, 8),
        position: [cx, -len * 0.5, cz]
      });
    }
    return composeGeometry(parts);
  });

  const starCharmSpec = cachedDioramaSpec("moonlit-nursery-mobile-star-charm", () =>
    extrudeContourSpec({
      outer: starPolygon2D(0.115, 0.054, 5),
      depth: 0.048,
      bevelSize: 0.014,
      bevelThickness: 0.014,
      bevelSegments: 2
    })
  );

  const centerMoonSpec = cachedDioramaSpec("moonlit-nursery-mobile-center-moon", () =>
    sculptCurvedLimb(
      [
        [-0.08, 0.11, 0],
        [-0.14, 0, 0],
        [-0.08, -0.11, 0],
        [0.05, -0.14, 0]
      ],
      (t) => 0.016 + Math.sin(t * Math.PI) * 0.044,
      { steps: 18, radialSegments: 14 }
    )
  );

  const drops: readonly { readonly pos: Vec3; readonly color: AuraColor; readonly yaw: number }[] = [
    { pos: [-0.38, -0.44, 0], color: "#FCE08A", yaw: 0.24 },
    { pos: [0.38, -0.52, 0], color: "#DEC8F4", yaw: -0.38 },
    { pos: [0, -0.38, 0.38], color: "#F5C4D4", yaw: 0.52 },
    { pos: [0, -0.48, -0.38], color: "#BCD8F6", yaw: -0.46 }
  ];

  if (!reducedMotion) {
    animated.push({
      id: mobileId,
      restPosition: pivot,
      restRotation: [0, 0, 0],
      sample: (t) => ({
        position: [pivot[0], pivot[1] + Math.sin(t * 0.62) * 0.024, pivot[2]],
        rotation: [
          Math.cos(t * 0.48) * 0.022,
          t * 0.22,
          Math.sin(t * 0.54) * 0.026
        ]
      })
    });
  }

  return dioramaGroup(
    mobileId,
    [
      geometry.custom(frameSpec, {
        name: "nursery mobile beechwood hoop",
        material: woodMat("#CFA070"),
        castShadow: false,
        receiveShadow: false
      }),
      geometry
        .custom(centerMoonSpec, {
          name: "nursery mobile warm moon charm",
          material: warmPracticalGlowMat("#FFEAC2", "#FFD89E", 1.05),
          castShadow: false,
          receiveShadow: false
        })
        .position(0, -0.32, 0),
      ...drops.map((drop, idx) =>
        geometry
          .custom(starCharmSpec, {
            name: `nursery mobile felt star ${idx + 1}`,
            material: feltMat(drop.color, { color: "#FFF4DC", power: 2.4, intensity: 0.28 }),
            castShadow: true,
            receiveShadow: false
          })
          .position(drop.pos[0], drop.pos[1], drop.pos[2])
          .rotation(0, drop.yaw, 0)
      )
    ],
    { position: pivot }
  ).runtime({ id: mobileId, tags: ["diorama", "mobile"], mutable: true });
}

export function buildMoonlitNurseryDiorama(
  ctx: WorldDioramaContext = {
    reducedMotion: false,
    available: () => false
  }
): WorldDioramaSlice {
  const nodes: (AuraNodeBuilder<AuraSceneNode> | AuraSceneNode)[] = [];
  const animated: WorldAnimatedNodeSpec[] = [];

  // 1. Warm cedar subfloor plinth + instanced floorboards (recessed beneath y = 0.000 center rug)
  nodes.push(
    primitives.box({
      name: "nursery cedar subfloor plinth",
      size: [12.4, 0.26, 11.4],
      position: [0, -0.156, 0.4],
      material: woodMat("#9A6B44", false),
      castShadow: false,
      receiveShadow: true
    })
  );

  const plankTransforms: AuraTransformSpec[] = [];
  const plankColors: AuraColor[] = [];
  const cedarTones: readonly AuraColor[] = ["#B88458", "#AE7A4E", "#C28E62", "#A9764C", "#BC885C"];
  const plankCount = 26;
  const plankWidth = 0.46;
  for (let i = 0; i < plankCount; i += 1) {
    const x = (i - (plankCount - 1) * 0.5) * plankWidth;
    plankTransforms.push({
      position: [x, -0.024, 0.4]
    });
    plankColors.push(cedarTones[i % cedarTones.length]!);
  }
  nodes.push(
    instances.roundedBox({
      name: "nursery warm cedar floor planks",
      size: [plankWidth - 0.012, 0.036, 11.0],
      material: instanceWoodMat("#FFFFFF"),
      transforms: plankTransforms,
      colors: plankColors,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 2. Braided oval nursery rug (y === 0.000 at stage center)
  nodes.push(...buildBraidedNurseryRugNodes());

  // 3. Cozy dusk plaster walls + warm cedar baseboard, dado rail, wainscoting & crown cornice
  const duskPlaster = clayMat("#DECFC4", false);
  const cedarTrim = woodMat("#B88458", false);

  nodes.push(
    primitives.box({
      name: "nursery back wall left",
      size: [4.05, 6.2, 0.22],
      position: [-4.2, 3.1, -4.35],
      material: duskPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nursery back wall right",
      size: [6.25, 6.2, 0.22],
      position: [3.05, 3.1, -4.35],
      material: duskPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nursery back wall window apron",
      size: [2.16, 0.96, 0.22],
      position: [-1.15, 0.48, -4.35],
      material: duskPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nursery back wall window header",
      size: [2.16, 3.24, 0.22],
      position: [-1.15, 4.58, -4.35],
      material: duskPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nursery left wing wall",
      size: [0.22, 6.2, 11.4],
      position: [-6.05, 3.1, 1.2],
      material: duskPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    primitives.box({
      name: "nursery right wing wall",
      size: [0.22, 6.2, 11.4],
      position: [6.05, 3.1, 1.2],
      material: duskPlaster,
      castShadow: false,
      receiveShadow: true
    }),
    extrudeContour({
      name: "nursery back cedar baseboard",
      profile: NURSERY_BASEBOARD_PROFILE,
      from: [-5.95, 0.068, -4.22],
      to: [5.95, 0.068, -4.22],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery left cedar baseboard",
      profile: NURSERY_BASEBOARD_PROFILE,
      from: [-5.92, 0.068, 5.2],
      to: [-5.92, 0.068, -4.22],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery right cedar baseboard",
      profile: NURSERY_BASEBOARD_PROFILE,
      from: [5.92, 0.068, -4.22],
      to: [5.92, 0.068, 5.2],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery back cedar dado rail",
      profile: NURSERY_DADO_PROFILE,
      from: [-5.95, 0.92, -4.22],
      to: [5.95, 0.92, -4.22],
      material: cedarTrim,
      castShadow: true
    }),
    extrudeContour({
      name: "nursery left cedar dado rail",
      profile: NURSERY_DADO_PROFILE,
      from: [-5.92, 0.92, 5.2],
      to: [-5.92, 0.92, -4.22],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery right cedar dado rail",
      profile: NURSERY_DADO_PROFILE,
      from: [5.92, 0.92, -4.22],
      to: [5.92, 0.92, 5.2],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery back crown cornice",
      profile: NURSERY_CORNICE_PROFILE,
      from: [-5.95, 3.88, -4.2],
      to: [5.95, 3.88, -4.2],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery left crown cornice",
      profile: NURSERY_CORNICE_PROFILE,
      from: [-5.92, 3.88, 5.2],
      to: [-5.92, 3.88, -4.2],
      material: cedarTrim,
      castShadow: false
    }),
    extrudeContour({
      name: "nursery right crown cornice",
      profile: NURSERY_CORNICE_PROFILE,
      from: [5.92, 3.88, -4.2],
      to: [5.92, 3.88, 5.2],
      material: cedarTrim,
      castShadow: false
    })
  );

  const wainscotTransforms: AuraTransformSpec[] = [];
  for (let i = 0; i < 9; i += 1) {
    const x = -5.12 + i * 1.28;
    wainscotTransforms.push({ position: [x, 0.48, -4.22] });
  }
  for (let j = 0; j < 5; j += 1) {
    const z = -3.4 + j * 1.45;
    wainscotTransforms.push({ position: [-5.92, 0.48, z], rotation: [0, Math.PI * 0.5, 0] });
    wainscotTransforms.push({ position: [5.92, 0.48, z], rotation: [0, Math.PI * 0.5, 0] });
  }
  nodes.push(
    instances.roundedBox({
      name: "nursery cedar wainscoting panels",
      size: [1.08, 0.7, 0.04],
      material: instanceWoodMat("#C49062"),
      transforms: wainscotTransforms,
      castShadow: false,
      receiveShadow: true
    })
  );

  // 4. Arched starlight window overlooking deep velvet night plum (#221933) with brass crescent moon & stars
  const nightBackdropSpec = cachedDioramaSpec("moonlit-nursery-night-backdrop-disc", () =>
    composeGeometry([
      {
        geometry: cylinderSpec(2.42, 2.42, 0.06, 40),
        rotation: [Math.PI * 0.5, 0, 0],
        scale: [1.08, 0.88, 1]
      }
    ])
  );

  const archedCasingSpec = cachedDioramaSpec("moonlit-nursery-arched-casing", () => {
    const pts: readonly ProceduralVec3[] = [
      [-2.19, 0.96, -4.24],
      [-2.19, 2.52, -4.24],
      [-1.8, 2.94, -4.24],
      [-1.15, 3.08, -4.24],
      [-0.5, 2.94, -4.24],
      [-0.11, 2.52, -4.24],
      [-0.11, 0.96, -4.24]
    ];
    return sculptCurvedLimb(pts, 0.056, { steps: 38, radialSegments: 14 });
  });

  const curtainRodSpec = cachedDioramaSpec("moonlit-nursery-curtain-rod", () => {
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
      .custom(nightBackdropSpec, {
        name: "nursery-window-night-backdrop",
        material: clayMat("#221933", false),
        castShadow: false,
        receiveShadow: false
      })
      .position(-1.15, 2.1, -5.78),
    buildWindowMoonAndStarsNode(),
    primitives.box({
      name: "nursery cedar window sill",
      size: [2.42, 0.08, 0.34],
      position: [-1.15, 0.95, -4.2],
      material: woodMat("#B88458"),
      castShadow: true,
      receiveShadow: true
    }),
    primitives.box({
      name: "nursery window clear glass pane",
      size: [2.06, 1.96, 0.02],
      position: [-1.15, 1.95, -4.34],
      material: clearGlassMat("#F4E6D8"),
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nursery window vertical mullion",
      size: [0.052, 1.96, 0.06],
      position: [-1.15, 1.95, -4.3],
      material: cedarTrim,
      castShadow: false,
      receiveShadow: false
    }),
    primitives.box({
      name: "nursery window horizontal mullion",
      size: [2.06, 0.052, 0.06],
      position: [-1.15, 1.96, -4.3],
      material: cedarTrim,
      castShadow: false,
      receiveShadow: false
    }),
    geometry.custom(archedCasingSpec, {
      name: "nursery arched window casing",
      material: woodMat("#B88458"),
      castShadow: true,
      receiveShadow: true
    }),
    geometry
      .custom(curtainRodSpec, {
        name: "nursery brass curtain rod",
        material: brushedMetalMat("#DFBA6E"),
        castShadow: true,
        receiveShadow: false
      })
      .position(-1.15, 3.16, -4.08)
  );

  const curtainConfigs: readonly {
    readonly id: "nursery-curtain-left" | "nursery-curtain-right";
    readonly side: "left" | "right";
    readonly x: number;
    readonly phase: number;
  }[] = [
    { id: "nursery-curtain-left", side: "left", x: -2.23, phase: 0 },
    { id: "nursery-curtain-right", side: "right", x: -0.07, phase: 1.5 }
  ];
  for (const c of curtainConfigs) {
    const restPos: Vec3 = [c.x, 1.98, -4.08];
    nodes.push(
      buildPleatedCurtainPanel({
        name: c.id,
        side: c.side,
        width: 0.62,
        height: 2.34,
        color: "#8B698C",
        cordColor: "#E4BD72"
      })
        .position(restPos[0], restPos[1], restPos[2])
        .runtime({ id: c.id, tags: ["diorama", "curtain"], mutable: true })
    );
    if (!ctx.reducedMotion) {
      animated.push({
        id: c.id,
        restPosition: restPos,
        restRotation: [0, 0, 0],
        sample: (t) => ({
          position: restPos,
          rotation: [0, 0, Math.sin(t * 0.55 + c.phase) * 0.014]
        })
      });
    }
  }

  // 5. Warm amber wall-sconce practicals (unshadowed `lights.point` + `warmPracticalGlowMat`)
  nodes.push(
    ...buildWallSconceNodes("nursery-sconce-left", [-3.08, 2.18, -4.22]),
    ...buildWallSconceNodes("nursery-sconce-right", [1.58, 2.18, -4.22])
  );

  // 6. Low cedar bookshelf (back-left), cozy rocking nook (back-right), and slowly turning overhead star mobile
  nodes.push(
    buildLowBookshelfNode(),
    buildRockingNookNode(),
    buildOverheadStarMobile(ctx.reducedMotion, animated)
  );

  return {
    nodes,
    animated,
    replaceDefaultGround: true
  };
}

/**
 * Moonlit Nursery — warm cedar wainscot & cozy dusk plaster nursery room,
 * braided oval nursery rug (`y === 0.000` at center), arched starlight window
 * overlooking deep velvet night plum (`#221933`) with brass crescent moon &
 * stars, low cedar bookshelf & rocking nook, warm amber wall-sconce practicals,
 * and a slowly turning overhead wooden-and-felt star mobile.
 */
export const moonlitNursery: WorldDefinition = {
  id: "moonlit-nursery",
  workingTitle: "Moonlit Nursery",
  ground: { color: "#B88458", size: 40 },
  musicBed: "nurseryBed",
  buildDiorama: buildMoonlitNurseryDiorama,
  dressing: [
    {
      kind: "model",
      key: "bed",
      at: [-3.45, 0, -2.55],
      yaw: 0.28,
      heightM: 0.72
    },
    {
      kind: "model",
      key: "cushion",
      at: [-3.45, 0.34, -2.55],
      yaw: 0.18,
      heightM: 0.2
    },
    {
      kind: "model",
      key: "teddy",
      at: [-3.68, 1.06, -3.52],
      yaw: 0.22,
      heightM: 0.34
    },
    {
      kind: "model",
      key: "storyBox",
      at: [3.48, 0, -1.75],
      yaw: -0.35,
      heightM: 0.42
    },
    {
      kind: "primitive",
      shape: "cylinder",
      at: [3.12, 0.14, -2.58],
      size: [0.64, 0.28, 0.64],
      color: "#D8C2DF",
      materialStyle: "felt"
    },
    {
      kind: "model",
      key: "cushion",
      at: [3.12, 0.28, -2.58],
      yaw: -0.4,
      heightM: 0.18
    }
  ]
};
