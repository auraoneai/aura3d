// Deterministic procedural 3D vehicles, storybook architecture & mechanical contraptions (WP-5).
// Built 100% natively on @aura3d/engine, @aura3d/engine/procedural, and ./rig-kit.js.
// Zero network fetches, zero clocks, zero randomness, zero console calls, and zero unsafe type assertions.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import type { ProceduralVec2, ProceduralVec3 } from "@aura3d/engine/procedural";
import type { Vec3 } from "../motion.js";
import {
  composeLobe,
  cylinderSpec,
  extrudeContourSpec,
  finalizeProceduralRig,
  makeSubPartRig,
  part,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  torusSpec,
  type BuiltSubPart,
  type LobePartInput,
  type OrganicPuffItem,
  type ProceduralAssetRig
} from "./rig-kit.js";

export type VehicleArchitectureAssetKey =
  | "gogoCarriage"
  | "car"
  | "barn"
  | "station"
  | "tunnel"
  | "house"
  | "door"
  | "lift"
  | "colourMachine";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;

// ---------------------------------------------------------------- shared architectural & mechanical micro-builders

/**
 * 8-sided XY-chamfered prism extruded along Z with optional front/back Z-bevels.
 * Produces crisp chamfered timber posts, battens, mullions, spokes, rails, and plinth blocks
 * with planar UVs for `woodGrainPlank` and `storybookBrickMasonry`.
 */
function chamferBeamSpec(
  width: number,
  height: number,
  depth: number,
  xyChamfer = Math.min(width, height) * 0.14,
  bevelSegments = 0
): AuraCustomGeometrySpec {
  const hw = Math.max(1e-4, width * 0.5);
  const hh = Math.max(1e-4, height * 0.5);
  const c = Math.max(1e-5, Math.min(xyChamfer, hw * 0.46, hh * 0.46));
  const outer: readonly ProceduralVec2[] = [
    [-hw + c, -hh],
    [hw - c, -hh],
    [hw, -hh + c],
    [hw, hh - c],
    [hw - c, hh],
    [-hw + c, hh],
    [-hw, hh - c],
    [-hw, -hh + c]
  ];
  return extrudeContourSpec({
    outer,
    depth: Math.max(1e-4, depth),
    bevelSegments,
    bevelThickness: bevelSegments > 0 ? Math.min(depth * 0.16, c * 0.85) : 0,
    bevelSize: bevelSegments > 0 ? c * 0.65 : 0,
    creaseAngle: 0.78
  });
}

/**
 * Smooth sphere / cabochon via direct `sculptOrganicLathe` (`scaleX = 1, scaleZ = 1`)
 * so small domes, brass doorknobs, flower blossoms, and headlight lenses stay compact and silky.
 */
function smoothOrbSpec(radius: number, radialSegs = 16, latRings = 7): AuraCustomGeometrySpec {
  const r = Math.max(1e-4, radius);
  const rings = Math.max(4, latRings);
  const profile: ProceduralVec2[] = [];
  for (let i = 0; i <= rings; i += 1) {
    const a = -HALF_PI + (i / rings) * Math.PI;
    profile.push([Math.max(0, Math.cos(a) * r), Math.sin(a) * r]);
  }
  return sculptOrganicLathe(profile, { segments: radialSegs, creaseAngle: Math.PI });
}

/**
 * Planar-UV circular disc facing +Z (`u, v` linearly spanning `[0, 1] x [0, 1]` around `(0.5, 0.5)`),
 * specifically engineered so `clockAndGaugeDial` renders crisp radial tick marks & hands without polar warp.
 */
function dialDiscSpec(radius: number, thickness: number, segments = 36): AuraCustomGeometrySpec {
  const r = Math.max(1e-4, radius);
  const segs = Math.max(16, segments);
  const outer: ProceduralVec2[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * TAU;
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return extrudeContourSpec({
    outer,
    depth: Math.max(1e-4, thickness),
    bevelSegments: 0,
    creaseAngle: 1.15
  });
}

/** Semicircular or segmental arch polygon in XY (`[-halfWidth, +halfWidth]`, `baseY -> springY -> crownY`). */
function archPolygon(
  halfWidth: number,
  baseY: number,
  springY: number,
  crownY: number,
  archSegs = 18
): readonly ProceduralVec2[] {
  const hw = Math.max(1e-4, halfWidth);
  const rise = Math.max(1e-4, crownY - springY);
  const pts: ProceduralVec2[] = [
    [-hw, baseY],
    [hw, baseY]
  ];
  for (let i = 0; i <= archSegs; i += 1) {
    const a = (i / archSegs) * Math.PI;
    pts.push([Math.cos(a) * hw, springY + Math.sin(a) * rise]);
  }
  return pts;
}

/** Open inverted-U arch frame polygon (`baseY` open at bottom between `-innerHalfWidth` and `+innerHalfWidth`). */
function openArchFramePolygon(
  outerHalfWidth: number,
  innerHalfWidth: number,
  baseY: number,
  springY: number,
  outerCrownY: number,
  innerCrownY: number,
  archSegs = 20
): readonly ProceduralVec2[] {
  const ohw = Math.max(2e-4, outerHalfWidth);
  const ihw = Math.max(1e-4, Math.min(ohw - 1e-4, innerHalfWidth));
  const outerRise = Math.max(1e-4, outerCrownY - springY);
  const innerRise = Math.max(1e-4, innerCrownY - springY);
  const pts: ProceduralVec2[] = [
    [ihw, baseY],
    [ohw, baseY]
  ];
  for (let i = 0; i <= archSegs; i += 1) {
    const a = (i / archSegs) * Math.PI;
    pts.push([Math.cos(a) * ohw, springY + Math.sin(a) * outerRise]);
  }
  pts.push([-ohw, baseY], [-ihw, baseY]);
  for (let i = archSegs; i >= 0; i -= 1) {
    const a = (i / archSegs) * Math.PI;
    pts.push([Math.cos(a) * ihw, springY + Math.sin(a) * innerRise]);
  }
  return pts;
}

/** Extruded circular arch bezel / ring (`outerRadius` minus `innerRadius`) in XY. */
function ringBezelSpec(
  outerRadius: number,
  innerRadius: number,
  depth: number,
  segments = 36
): AuraCustomGeometrySpec {
  const outer: ProceduralVec2[] = [];
  const inner: ProceduralVec2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    outer.push([ca * outerRadius, sa * outerRadius]);
    inner.push([ca * innerRadius, sa * innerRadius]);
  }
  return extrudeContourSpec({
    outer,
    holes: [inner],
    depth,
    bevelSegments: 0,
    creaseAngle: 1.1
  });
}

// ---------------------------------------------------------------- 1. gogoCarriage (0.70m, +Z forward)

function buildRailwayWheelSubPart(
  partId: "wheelFL" | "wheelFR" | "wheelRL" | "wheelRR",
  sideSign: -1 | 1,
  zPos: number
): BuiltSubPart {
  // Anchor at [±0.42, 0.17, ±0.36]; 36-segment outer flange radius = 0.17 touches exact ground y = 0.00!
  const anchor: Vec3 = [sideSign * 0.42, 0.17, zPos];
  const tireCyl = cylinderSpec(0.156, 0.156, 0.048, 16, 0);
  const innerFlange = cylinderSpec(0.17, 0.17, 0.014, 36, 0);
  const hubCyl = chamferBeamSpec(0.068, 0.072, 0.072, 0.016, 0);
  const spokeBeam = chamferBeamSpec(0.016, 0.256, 0.054, 0.003, 0);

  const wheelParts: LobePartInput[] = [
    part(tireCyl, "#2A2D3A", {
      position: [anchor[0], anchor[1], anchor[2]],
      rotation: [0, 0, HALF_PI]
    }),
    part(innerFlange, "#AEB7C6", {
      position: [anchor[0] - sideSign * 0.026, anchor[1], anchor[2]],
      rotation: [0, 0, HALF_PI]
    }),
    part(hubCyl, "#D94136", {
      position: [anchor[0], anchor[1], anchor[2]]
    })
  ];

  // 3 full-diameter crossed spoke bars protruding slightly past tire faces = 6 unmistakable radial spokes!
  for (let s = 0; s < 3; s += 1) {
    const ang = (s / 3) * Math.PI;
    wheelParts.push(
      part(spokeBeam, "#E44A3D", {
        position: [anchor[0], anchor[1], anchor[2]],
        rotation: [ang, HALF_PI, 0]
      })
    );
  }

  const wheelLobe = composeLobe({
    suffix: "flangedWheel",
    craft: "rubber",
    hinge: anchor,
    parts: wheelParts
  });
  return makeSubPartRig(partId, anchor, [wheelLobe]);
}

function buildGogoCarriageRig(): ProceduralAssetRig {
  const paintParts: LobePartInput[] = [];
  const woodParts: LobePartInput[] = [];
  const brassParts: LobePartInput[] = [];
  const glassParts: LobePartInput[] = [];

  // Crimson steel railway underframe solebars, headstocks & stepboards
  const solebar = chamferBeamSpec(0.055, 0.075, 1.14, 0.01, 0);
  paintParts.push(
    part(solebar, "#D84035", { position: [-0.34, 0.24, 0] }),
    part(solebar, "#D84035", { position: [0.34, 0.24, 0] })
  );
  const bufferBeam = chamferBeamSpec(0.84, 0.085, 0.065, 0.012, 0);
  paintParts.push(
    part(bufferBeam, "#DF463B", { position: [0, 0.245, 0.575] }),
    part(bufferBeam, "#DF463B", { position: [0, 0.245, -0.575] })
  );
  const stepBoard = chamferBeamSpec(0.065, 0.022, 0.98, 0.005, 0);
  woodParts.push(
    part(stepBoard, "#8C5938", { position: [-0.435, 0.2, 0] }),
    part(stepBoard, "#8C5938", { position: [0.435, 0.2, 0] })
  );

  // 4 axlebox journal housings over the wheels
  const axleBox = chamferBeamSpec(0.05, 0.075, 0.09, 0.008, 0);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-0.36, 0.36] as const) {
      paintParts.push(part(axleBox, "#323646", { position: [sx * 0.38, 0.2, sz] }));
    }
  }

  // Planked wooden coach deck & 2 interior slatted wooden benches (facing +Z)
  const coachFloor = chamferBeamSpec(0.8, 0.04, 1.1, 0.008, 0);
  woodParts.push(part(coachFloor, "#BA824E", { position: [0, 0.295, 0] }));

  const benchSeat = chamferBeamSpec(0.68, 0.036, 0.2, 0.007, 0);
  const benchBack = chamferBeamSpec(0.68, 0.16, 0.032, 0.007, 0);
  const benchLeg = chamferBeamSpec(0.04, 0.11, 0.16, 0.005, 0);
  for (const bz of [-0.24, 0.22] as const) {
    woodParts.push(
      part(benchSeat, "#DCA36A", { position: [0.02, 0.42, bz] }),
      part(benchBack, "#CF945A", { position: [0.02, 0.51, bz - 0.085], rotation: [-0.1, 0, 0] }),
      part(benchLeg, "#9E6A3E", { position: [-0.24, 0.355, bz] }),
      part(benchLeg, "#9E6A3E", { position: [0.28, 0.355, bz] })
    );
  }

  // Sunny buttercup-yellow (#F5C842) & warm cream (#FAF3E0) open-top coach body!
  // Front (+Z) and Rear (-Z) bulkheads with arched observation windows
  const endWallOuter: readonly ProceduralVec2[] = [
    [-0.42, 0.3],
    [0.42, 0.3],
    [0.42, 0.78],
    [0.28, 0.86],
    [-0.28, 0.86],
    [-0.42, 0.78]
  ];
  const endWinL = archPolygon(0.11, 0.54, 0.69, 0.76, 5).map(
    (p): ProceduralVec2 => [p[0] - 0.17, p[1]]
  );
  const endWinR = archPolygon(0.11, 0.54, 0.69, 0.76, 5).map(
    (p): ProceduralVec2 => [p[0] + 0.17, p[1]]
  );
  const endWallGeo = extrudeContourSpec({
    outer: endWallOuter,
    holes: [endWinL, endWinR],
    depth: 0.044,
    bevelSegments: 0
  });
  paintParts.push(
    part(endWallGeo, "#F5C842", { position: [0, 0, 0.53] }),
    part(endWallGeo, "#F5C842", { position: [0, 0, -0.53] })
  );

  // Cream upper frieze trim on front & rear bulkheads
  const endCreamBand = chamferBeamSpec(0.85, 0.045, 0.052, 0.006, 0);
  paintParts.push(
    part(endCreamBand, "#FAF3E0", { position: [0, 0.51, 0.53] }),
    part(endCreamBand, "#FAF3E0", { position: [0, 0.51, -0.53] })
  );

  // Right side wall (+X): full length lower yellow panel + cream waist + 2 arched window frames
  const rightSideOuter: readonly ProceduralVec2[] = [
    [-0.54, 0.3],
    [0.54, 0.3],
    [0.54, 0.78],
    [-0.54, 0.78]
  ];
  const sideWinRear = archPolygon(0.15, 0.53, 0.67, 0.73, 5).map(
    (p): ProceduralVec2 => [p[0] - 0.24, p[1]]
  );
  const sideWinFront = archPolygon(0.15, 0.53, 0.67, 0.73, 5).map(
    (p): ProceduralVec2 => [p[0] + 0.24, p[1]]
  );
  const rightSideGeo = extrudeContourSpec({
    outer: rightSideOuter,
    holes: [sideWinRear, sideWinFront],
    depth: 0.042,
    bevelSegments: 0
  });
  paintParts.push(
    part(rightSideGeo, "#F5C842", {
      position: [0.41, 0, 0],
      rotation: [0, HALF_PI, 0]
    }),
    part(chamferBeamSpec(0.05, 0.042, 1.09, 0.006, 0), "#FAF3E0", {
      position: [0.41, 0.505, 0]
    })
  );

  // Left side wall (-X): rear half (`z in [-0.54, +0.16]`) has arched window;
  // front doorway bay (`z in [+0.16, +0.44]`) is OPEN for hinged `cabDoorL`, plus front corner pillar (`z in [+0.44, +0.54]`)!
  const leftRearOuter: readonly ProceduralVec2[] = [
    [-0.54, 0.3],
    [0.16, 0.3],
    [0.16, 0.78],
    [-0.54, 0.78]
  ];
  const leftWinRear = archPolygon(0.16, 0.53, 0.67, 0.73, 5).map(
    (p): ProceduralVec2 => [p[0] - 0.2, p[1]]
  );
  const leftRearGeo = extrudeContourSpec({
    outer: leftRearOuter,
    holes: [leftWinRear],
    depth: 0.042,
    bevelSegments: 0
  });
  paintParts.push(
    part(leftRearGeo, "#F5C842", {
      position: [-0.41, 0, 0],
      rotation: [0, -HALF_PI, 0]
    }),
    part(chamferBeamSpec(0.044, 0.48, 0.1, 0.006, 0), "#F5C842", {
      position: [-0.41, 0.54, 0.49]
    }),
    part(chamferBeamSpec(0.05, 0.042, 0.7, 0.006, 0), "#FAF3E0", {
      position: [-0.41, 0.505, -0.19]
    }),
    // Crimson top waist capping rail around open excursion deck
    part(chamferBeamSpec(0.056, 0.032, 1.12, 0.006, 0), "#D94136", {
      position: [0.41, 0.79, 0]
    }),
    part(chamferBeamSpec(0.056, 0.032, 0.71, 0.006, 0), "#D94136", {
      position: [-0.41, 0.79, -0.185]
    })
  );

  // Arched side & bulkhead window glass panes
  glassParts.push(
    part(chamferBeamSpec(0.012, 0.2, 0.78, 0.002, 0), "#CBEAFF", { position: [0.41, 0.63, 0] }),
    part(chamferBeamSpec(0.012, 0.2, 0.3, 0.002, 0), "#CBEAFF", { position: [-0.41, 0.63, -0.2] }),
    part(chamferBeamSpec(0.56, 0.21, 0.012, 0.002, 0), "#CBEAFF", { position: [0, 0.64, 0.53] }),
    part(chamferBeamSpec(0.56, 0.21, 0.012, 0.002, 0), "#CBEAFF", { position: [0, 0.64, -0.53] })
  );

  // Front (+Z) and Rear (-Z) railway buffers + magnetic coupler pucks + top brass sightseeing rails (`y -> 1.0`)
  const bufferShank = chamferBeamSpec(0.038, 0.038, 0.06, 0.008, 0);
  const bufferFace = cylinderSpec(0.044, 0.044, 0.016, 10, 0);
  const couplerArm = chamferBeamSpec(0.045, 0.035, 0.085, 0.006, 0);
  const couplerMagnet = cylinderSpec(0.046, 0.046, 0.032, 10, 0);

  for (const zSign of [1, -1] as const) {
    for (const bx of [-0.24, 0.24] as const) {
      brassParts.push(
        part(bufferShank, "#8A94A6", { position: [bx, 0.245, zSign * 0.615] }),
        part(bufferFace, "#D9E1EC", {
          position: [bx, 0.245, zSign * 0.648],
          rotation: [HALF_PI, 0, 0]
        })
      );
    }
    brassParts.push(
      part(couplerArm, "#7E889A", { position: [0, 0.23, zSign * 0.61] }),
      part(couplerMagnet, "#F2C94C", {
        position: [0, 0.23, zSign * 0.655],
        rotation: [HALF_PI, 0, 0]
      })
    );
  }

  // Open-top brass gallery stanchions & perimeter sightseeing rail topping at y = 1.00
  const stanchion = chamferBeamSpec(0.02, 0.175, 0.02, 0.004, 0);
  for (const sx of [-0.39, 0.39] as const) {
    for (const sz of [-0.51, -0.18, 0.51] as const) {
      brassParts.push(part(stanchion, "#F2C94C", { position: [sx, 0.892, sz] }));
    }
  }
  const endArchRail = sculptCurvedLimb(
    [
      [-0.39, 0.96, 0.51],
      [0, 0.992, 0.51],
      [0.39, 0.96, 0.51]
    ],
    0.014,
    { steps: 4, radialSegments: 6 }
  );
  brassParts.push(
    part(chamferBeamSpec(0.024, 0.024, 1.02, 0.005, 0), "#F2C94C", { position: [0.39, 0.96, 0] }),
    part(chamferBeamSpec(0.024, 0.024, 0.34, 0.005, 0), "#F2C94C", { position: [-0.39, 0.96, -0.345] }),
    part(endArchRail, "#F2C94C"),
    part(endArchRail, "#F2C94C", { position: [0, 0, -1.02] })
  );

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({ suffix: "coachPaint", craft: "carPaint", parts: paintParts }),
    composeLobe({ suffix: "coachWood", craft: "wood", craftTexture: "woodGrainPlank", parts: woodParts }),
    composeLobe({ suffix: "coachBrass", craft: "brushedMetal", parts: brassParts }),
    composeLobe({ suffix: "coachGlass", craft: "glassCoat", baseColor: "#CBEAFF", parts: glassParts })
  ]);

  // Hinged left-side boarding door (`cabDoorL`):
  // Anchored at [-0.42, 0.44, 0.16] with door spanning z in [0.165, 0.435] (local dz > 0)
  // so `rotation: [0, -1.45, 0]` (`x' = dz * sin(-1.45) < 0`) swings cleanly OUTWARD into -X!
  const doorAnchor: Vec3 = [-0.42, 0.44, 0.16];
  const cabDoorLPart = makeSubPartRig(
    "cabDoorL",
    doorAnchor,
    [
      composeLobe({
        suffix: "boardingDoor",
        craft: "carPaint",
        hinge: doorAnchor,
        parts: [
          part(chamferBeamSpec(0.038, 0.44, 0.265, 0.008, 0), "#F5C842", {
            position: [-0.41, 0.52, 0.298]
          }),
          part(chamferBeamSpec(0.044, 0.044, 0.245, 0.006, 0), "#FAF3E0", {
            position: [-0.41, 0.505, 0.298]
          }),
          part(chamferBeamSpec(0.046, 0.03, 0.268, 0.005, 0), "#D94136", {
            position: [-0.41, 0.745, 0.298]
          }),
          // Brass exterior T-handle latch near forward edge z = 0.40
          part(smoothOrbSpec(0.02, 8, 4), "#F2C94C", {
            position: [-0.438, 0.55, 0.395],
            scale: [0.8, 1, 1.3]
          })
        ]
      })
    ],
    "body"
  );

  return finalizeProceduralRig("gogoCarriage", [
    bodyPart,
    cabDoorLPart,
    buildRailwayWheelSubPart("wheelFL", -1, 0.36),
    buildRailwayWheelSubPart("wheelFR", 1, 0.36),
    buildRailwayWheelSubPart("wheelRL", -1, -0.36),
    buildRailwayWheelSubPart("wheelRR", 1, -0.36)
  ]);
}

// ---------------------------------------------------------------- 2. car (0.60m, +Z forward, tintTarget bodyPaint)

function buildCoupeWheelSubPart(
  partId: "wheelFL" | "wheelFR" | "wheelRL" | "wheelRR",
  sideSign: -1 | 1,
  zPos: number
): BuiltSubPart {
  // Anchor [±0.48, 0.19, ±0.45], 36-segment outer tire radius 0.19 touches exact ground y = 0.00!
  const anchor: Vec3 = [sideSign * 0.48, 0.19, zPos];
  const tireCyl = cylinderSpec(0.19, 0.19, 0.088, 36, 0);
  const whitewallCyl = cylinderSpec(0.142, 0.142, 0.094, 16, 0);
  const hubCap = cylinderSpec(0.056, 0.062, 0.102, 10, 0);
  const spoke = chamferBeamSpec(0.018, 0.236, 0.099, 0.004, 0);

  const wheelParts: LobePartInput[] = [
    part(tireCyl, "#262936", {
      position: [anchor[0], anchor[1], anchor[2]],
      rotation: [0, 0, HALF_PI]
    }),
    part(whitewallCyl, "#FAF7F0", {
      position: [anchor[0], anchor[1], anchor[2]],
      rotation: [0, 0, HALF_PI]
    }),
    part(hubCap, "#F0F5FA", {
      position: [anchor[0], anchor[1], anchor[2]],
      rotation: [0, 0, HALF_PI]
    })
  ];

  // 3 diametral bars = 6 unmistakable whitewall wheel spokes
  for (let s = 0; s < 3; s += 1) {
    const ang = (s / 3) * Math.PI;
    wheelParts.push(
      part(spoke, "#DCE5F0", {
        position: [anchor[0], anchor[1], anchor[2]],
        rotation: [ang, HALF_PI, 0]
      })
    );
  }

  return makeSubPartRig(partId, anchor, [
    composeLobe({
      suffix: "whitewallWheel",
      craft: "rubber",
      hinge: anchor,
      tintTarget: false,
      parts: wheelParts
    })
  ]);
}

function buildCarRig(): ProceduralAssetRig {
  const bodyPaintParts: LobePartInput[] = [];
  const chromeParts: LobePartInput[] = [];
  const headlightParts: LobePartInput[] = [];
  const glassParts: LobePartInput[] = [];
  const detailParts: LobePartInput[] = [];

  // CRITICAL TINT CONTRACT (`G06` Car Wash + `E20`):
  // All main painted coupe body panels sit in `bodyPaint` (`craft: "carPaint"`, `baseColor: "#4A8FE8"`, `tintTarget: true`)
  // with pure `#FFFFFF` / `#F6F8FC` vertex colors so `setMaterial` / `tint` recolors cleanly!

  // Side silhouette contour of rounded retro storybook coupe (extruded along X, rotated so Z is forward!)
  // Wait: in `Ry(HALF_PI)`, local +X maps to -Z and local -X maps to +Z; with `Ry(-HALF_PI)`, local +X maps to +Z!
  // Let's check `rotateZYX([0, -HALF_PI, 0], [lx, ly, lz])`:
  // cy = 0, sy = -1 -> x2 = lz * (-1) = -lz; z2 = -lx * (-1) = +lx!
  // YES! Under `rotation: [0, -HALF_PI, 0]`, contour X maps 1:1 to +Z (front = +X, rear = -X)!
  const coupeSideProfile: readonly ProceduralVec2[] = [
    [-0.68, 0.2],
    [0.68, 0.2],
    [0.72, 0.28],
    [0.71, 0.44],
    [0.62, 0.54],
    [0.36, 0.58],
    [0.2, 0.88],
    [0.06, 0.97],
    [-0.18, 0.98],
    [-0.36, 0.9],
    [-0.5, 0.6],
    [-0.67, 0.52],
    [-0.71, 0.36]
  ];
  const winCutout: readonly ProceduralVec2[] = [
    [-0.28, 0.61],
    [0.14, 0.61],
    [0.03, 0.86],
    [-0.19, 0.87],
    [-0.31, 0.75]
  ];
  const mainBodyShell = extrudeContourSpec({
    outer: coupeSideProfile,
    holes: [winCutout],
    depth: 0.84,
    bevelSegments: 0,
    creaseAngle: 0.95
  });
  bodyPaintParts.push(
    part(mainBodyShell, "#FFFFFF", {
      position: [0, 0, 0],
      rotation: [0, -HALF_PI, 0]
    }),
    // Sculpted rounded front Beetle hood bulge (+Z), domed roof crown (`y -> 1.0`), and rear trunk deck (-Z)
    part(roundedBoxSpec(0.72, 0.24, 0.44, 0.09, 1), "#FFFFFF", {
      position: [0, 0.43, 0.47],
      rotation: [0.14, 0, 0]
    }),
    part(chamferBeamSpec(0.7, 0.12, 0.5, 0.045, 0), "#FFFFFF", {
      position: [0, 0.94, -0.07]
    }),
    part(chamferBeamSpec(0.72, 0.22, 0.36, 0.055, 0), "#FFFFFF", {
      position: [0, 0.44, -0.5],
      rotation: [-0.16, 0, 0]
    })
  );

  // 4 curvy flared fender arches + lower door panels (`#FFFFFF` / `#F7F9FC` for crisp carPaint tinting)
  const fenderFlareGeo = extrudeContourSpec({
    outer: archPolygon(0.228, 0.19, 0.215, 0.428, 8),
    depth: 0.095,
    bevelSegments: 0
  });
  for (const sx of [-1, 1] as const) {
    bodyPaintParts.push(
      part(fenderFlareGeo, "#FFFFFF", { position: [sx * 0.425, 0, 0.45], rotation: [0, HALF_PI, 0] }),
      part(fenderFlareGeo, "#FFFFFF", { position: [sx * 0.425, 0, -0.45], rotation: [0, HALF_PI, 0] }),
      // Subtle sculpted coupe door panel relief
      part(chamferBeamSpec(0.025, 0.26, 0.44, 0.008, 0), "#F6F8FC", {
        position: [sx * 0.42, 0.4, 0]
      })
    );
  }

  // Non-tinted Chrome Bumpers, Smiling Grille, Headlight Bezels, Mirrors & Handles (`brushedMetal`)
  const frontBumper = sculptCurvedLimb(
    [
      [-0.46, 0.23, 0.69],
      [0, 0.23, 0.77],
      [0.46, 0.23, 0.69]
    ],
    0.034,
    { steps: 4, radialSegments: 6 }
  );
  const rearBumper = sculptCurvedLimb(
    [
      [-0.45, 0.23, -0.68],
      [0, 0.23, -0.755],
      [0.45, 0.23, -0.68]
    ],
    0.034,
    { steps: 4, radialSegments: 6 }
  );
  chromeParts.push(part(frontBumper, "#E8EEF5"), part(rearBumper, "#E8EEF5"));

  const bumperette = chamferBeamSpec(0.044, 0.1, 0.048, 0.012, 0);
  for (const bx of [-0.22, 0.22] as const) {
    chromeParts.push(
      part(bumperette, "#F0F5FA", { position: [bx, 0.25, 0.76] }),
      part(bumperette, "#F0F5FA", { position: [bx, 0.25, -0.745] })
    );
  }

  // Friendly smiling front grille on +Z + hood badge + exhaust tailpipe
  const grilleSurround = ringBezelSpec(0.16, 0.125, 0.03, 12);
  chromeParts.push(
    part(grilleSurround, "#EEF3F9", {
      position: [0, 0.35, 0.725],
      scale: [1.55, 0.62, 1]
    }),
    part(chamferBeamSpec(0.38, 0.02, 0.025, 0.004, 0), "#F4F8FC", { position: [0, 0.365, 0.73] }),
    part(chamferBeamSpec(0.34, 0.02, 0.025, 0.004, 0), "#F4F8FC", { position: [0, 0.335, 0.73] }),
    // Hood crest & rear exhaust pipe
    part(chamferBeamSpec(0.032, 0.024, 0.16, 0.006, 0), "#F0F5FA", {
      position: [0, 0.565, 0.48],
      rotation: [0.14, 0, 0]
    }),
    part(cylinderSpec(0.024, 0.026, 0.09, 8, 0), "#C8D2DF", {
      position: [0.24, 0.17, -0.71],
      rotation: [HALF_PI, 0, 0]
    })
  );

  // Friendly round bezel headlight eyes (+Z) + side mirrors + door handles + rocker strips
  const headlightBezel = ringBezelSpec(0.086, 0.062, 0.036, 12);
  const headlightLens = smoothOrbSpec(0.064, 8, 4);
  for (const sx of [-1, 1] as const) {
    chromeParts.push(
      part(headlightBezel, "#F2F6FB", { position: [sx * 0.28, 0.44, 0.71] }),
      // Side wing mirror
      part(chamferBeamSpec(0.058, 0.044, 0.036, 0.014, 0), "#EEF3F9", {
        position: [sx * 0.455, 0.63, 0.18]
      }),
      // Chrome door handle & side rocker trim
      part(chamferBeamSpec(0.026, 0.022, 0.085, 0.005, 0), "#F0F5FA", {
        position: [sx * 0.435, 0.5, -0.06]
      }),
      part(chamferBeamSpec(0.022, 0.022, 0.46, 0.005, 0), "#DDE6F0", {
        position: [sx * 0.43, 0.23, 0]
      })
    );
    headlightParts.push(
      part(headlightLens, "#FFF7D6", {
        position: [sx * 0.28, 0.44, 0.708],
        scale: [1, 1, 0.52]
      })
    );
  }

  // Wrap-around `glassCoat` windshield (+Z), side windows, and rear window (-Z)
  glassParts.push(
    part(chamferBeamSpec(0.64, 0.28, 0.032, 0.016, 0), "#BCE4FF", {
      position: [0, 0.725, 0.305],
      rotation: [-0.46, 0, 0]
    }),
    part(chamferBeamSpec(0.6, 0.25, 0.032, 0.016, 0), "#BCE4FF", {
      position: [0, 0.735, -0.455],
      rotation: [0.48, 0, 0]
    }),
    part(chamferBeamSpec(0.76, 0.24, 0.42, 0.02, 0), "#C7EAFF", {
      position: [0, 0.73, -0.07]
    })
  );

  // Non-tinted ruby taillights (-Z), amber turn pips (+Z), interior seats & dark chassis pan
  detailParts.push(
    part(chamferBeamSpec(0.74, 0.05, 1.24, 0.01, 0), "#252936", { position: [0, 0.19, 0] }),
    // Interior caramel seats & steering wheel visible inside cabin
    part(chamferBeamSpec(0.56, 0.22, 0.22, 0.025, 0), "#D99B66", { position: [0, 0.56, -0.14] }),
    part(dialDiscSpec(0.065, 0.016, 16), "#3B3646", {
      position: [-0.15, 0.64, 0.1],
      rotation: [0.45, 0, 0]
    }),
    // Front & rear cream license plates
    part(chamferBeamSpec(0.2, 0.055, 0.016, 0.005, 0), "#FAF4E4", { position: [0, 0.23, 0.778] }),
    part(chamferBeamSpec(0.2, 0.055, 0.016, 0.005, 0), "#FAF4E4", { position: [0, 0.34, -0.715] })
  );
  for (const sx of [-1, 1] as const) {
    // Ruby-red oval taillights at -Z
    detailParts.push(
      part(smoothOrbSpec(0.052, 8, 4), "#E53935", {
        position: [sx * 0.28, 0.42, -0.7],
        scale: [0.75, 1.18, 0.5]
      }),
      // Warm amber front indicator pips below headlights at +Z
      part(chamferBeamSpec(0.052, 0.036, 0.024, 0.012, 0), "#FFB300", {
        position: [sx * 0.32, 0.33, 0.72]
      })
    );
  }

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "bodyPaint",
      craft: "carPaint",
      baseColor: "#4A8FE8",
      tintTarget: true,
      parts: bodyPaintParts
    }),
    composeLobe({
      suffix: "chromeTrim",
      craft: "brushedMetal",
      tintTarget: false,
      parts: chromeParts
    }),
    composeLobe({
      suffix: "headlights",
      craft: "warmGlow",
      baseColor: "#FFF8DC",
      emissive: "#FFEFA8",
      emissiveIntensity: 0.35,
      tintTarget: false,
      parts: headlightParts
    }),
    composeLobe({
      suffix: "cabinGlass",
      craft: "glassCoat",
      baseColor: "#BCE4FF",
      tintTarget: false,
      parts: glassParts
    }),
    composeLobe({
      suffix: "coupeDetails",
      craft: "lacquer",
      tintTarget: false,
      parts: detailParts
    })
  ]);

  return finalizeProceduralRig("car", [
    bodyPart,
    buildCoupeWheelSubPart("wheelFL", -1, 0.45),
    buildCoupeWheelSubPart("wheelFR", 1, 0.45),
    buildCoupeWheelSubPart("wheelRL", -1, -0.45),
    buildCoupeWheelSubPart("wheelRR", 1, -0.45)
  ]);
}

// ---------------------------------------------------------------- 3. barn (3.20m, +Z double X-braced doors)

function buildBarnDoorLeaf(partId: "hingeLeaf" | "hingeLeafR", sideSign: -1 | 1): BuiltSubPart {
  // Left hinge at [-0.26, 0.22, 0.41], right hinge at [+0.26, 0.22, 0.41].
  // Left leaf spans x in [-0.26, -0.004]; right leaf spans x in [+0.004, +0.26].
  // Under Ry(-1.75) on left and Ry(+1.75) on right, BOTH leaves swing cleanly OUTWARD toward +Z!
  const anchor: Vec3 = [sideSign * 0.26, 0.22, 0.41];
  const cx = sideSign * 0.132;
  const cy = 0.255;
  const cz = 0.41;

  const plankPanel = chamferBeamSpec(0.252, 0.35, 0.026, 0.005, 0);
  const hRail = chamferBeamSpec(0.254, 0.032, 0.036, 0.004, 0);
  const vStile = chamferBeamSpec(0.032, 0.352, 0.036, 0.004, 0);
  const diagBrace = chamferBeamSpec(0.028, 0.39, 0.038, 0.004, 0);
  const ironStrap = chamferBeamSpec(0.14, 0.02, 0.042, 0.003, 0);

  const doorParts: LobePartInput[] = [
    part(plankPanel, "#C93E34", { position: [cx, cy, cz] }),
    // Crisp white perimeter frame
    part(hRail, "#FAF4EA", { position: [cx, cy + 0.16, cz] }),
    part(hRail, "#FAF4EA", { position: [cx, cy - 0.16, cz] }),
    part(vStile, "#FAF4EA", { position: [sideSign * 0.244, cy, cz] }),
    part(vStile, "#FAF4EA", { position: [sideSign * 0.02, cy, cz] }),
    // White X-bracing diagonals
    part(diagBrace, "#FAF4EA", { position: [cx, cy, cz], rotation: [0, 0, 0.58] }),
    part(diagBrace, "#FAF4EA", { position: [cx, cy, cz], rotation: [0, 0, -0.58] }),
    // Wrought-iron strap hinges & latch
    part(ironStrap, "#343746", { position: [sideSign * 0.19, cy + 0.12, cz + 0.002] }),
    part(ironStrap, "#343746", { position: [sideSign * 0.19, cy - 0.12, cz + 0.002] })
  ];

  return makeSubPartRig(partId, anchor, [
    composeLobe({
      suffix: "xBracedDoor",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      hinge: anchor,
      parts: doorParts
    })
  ]);
}

function buildBarnRig(): ProceduralAssetRig {
  const stoneParts: LobePartInput[] = [];
  const timberParts: LobePartInput[] = [];
  const roofParts: LobePartInput[] = [];
  const brassParts: LobePartInput[] = [];

  // Coursed limestone foundation plinth (`storybookBrickMasonry`) + front threshold ramp
  stoneParts.push(
    part(chamferBeamSpec(1.06, 0.085, 0.84, 0.012, 1), "#E5DAC6", { position: [0, 0.0425, 0] }),
    part(chamferBeamSpec(0.62, 0.045, 0.12, 0.008, 0), "#DDD0B8", { position: [0, 0.0225, 0.44] })
  );

  // Gambrel barn wall contour (`extrudeContourSpec` with front doorway + upper hayloft arch cutouts on +Z!)
  const gambrelWallOuter: readonly ProceduralVec2[] = [
    [-0.5, 0.08],
    [0.5, 0.08],
    [0.5, 0.48],
    [0.34, 0.72],
    [0, 0.85],
    [-0.34, 0.72],
    [-0.5, 0.48]
  ];
  const frontDoorHole: readonly ProceduralVec2[] = [
    [-0.26, 0.082],
    [0.26, 0.082],
    [0.26, 0.432],
    [-0.26, 0.432]
  ];
  const hayloftHole = archPolygon(0.12, 0.51, 0.64, 0.74, 12);

  // Front wall (+Z) with genuine open doorway & hayloft arch, Rear wall (-Z), Side walls, and recessed warm interior!
  const frontWallGeo = extrudeContourSpec({
    outer: gambrelWallOuter,
    holes: [frontDoorHole, hayloftHole],
    depth: 0.06,
    bevelSegments: 0
  });
  const backWallGeo = extrudeContourSpec({
    outer: gambrelWallOuter,
    depth: 0.06,
    bevelSegments: 0
  });
  timberParts.push(
    part(frontWallGeo, "#D84A3E", { position: [0, 0, 0.375] }),
    part(backWallGeo, "#D84A3E", { position: [0, 0, -0.375] }),
    // Side walls (`±X`) & interior floor/back-wall behind open doorway so swinging doors reveal a real barn bay!
    part(chamferBeamSpec(0.06, 0.41, 0.74, 0.006, 0), "#D84A3E", { position: [-0.47, 0.28, 0] }),
    part(chamferBeamSpec(0.06, 0.41, 0.74, 0.006, 0), "#D84A3E", { position: [0.47, 0.28, 0] }),
    // Solid inner barn core behind z = +0.26 (with dark cozy barn interior face visible when doors open!)
    part(
      extrudeContourSpec({ outer: gambrelWallOuter, depth: 0.62, bevelSegments: 0 }),
      "#C84237",
      { position: [0, 0, -0.05] }
    ),
    part(chamferBeamSpec(0.52, 0.36, 0.02, 0.003, 0), "#4A2E24", { position: [0, 0.26, 0.27] })
  );

  // Board-and-batten vertical timber strips + cream corner posts & doorway/hayloft casing
  const sideBatten = chamferBeamSpec(0.02, 0.4, 0.022, 0.004, 0);
  for (const sx of [-1, 1] as const) {
    for (const bz of [-0.28, -0.14, 0, 0.14, 0.28] as const) {
      timberParts.push(part(sideBatten, "#C23B30", { position: [sx * 0.502, 0.28, bz] }));
    }
    // White corner pilasters
    timberParts.push(
      part(chamferBeamSpec(0.048, 0.41, 0.048, 0.006, 0), "#FAF4EA", { position: [sx * 0.495, 0.285, 0.395] }),
      part(chamferBeamSpec(0.048, 0.41, 0.048, 0.006, 0), "#FAF4EA", { position: [sx * 0.495, 0.285, -0.395] })
    );
  }

  // Cream doorway jambs, lintel, hayloft arch trim & projecting hayloft hoist beam
  const hayloftFrameOuter = archPolygon(0.152, 0.495, 0.64, 0.77, 12);
  const hayloftFrameGeo = extrudeContourSpec({
    outer: hayloftFrameOuter,
    holes: [hayloftHole],
    depth: 0.032,
    bevelSegments: 0
  });
  timberParts.push(
    part(chamferBeamSpec(0.58, 0.04, 0.04, 0.006, 0), "#FAF4EA", { position: [0, 0.445, 0.41] }),
    part(chamferBeamSpec(0.038, 0.37, 0.038, 0.005, 0), "#FAF4EA", { position: [-0.278, 0.265, 0.41] }),
    part(chamferBeamSpec(0.038, 0.37, 0.038, 0.005, 0), "#FAF4EA", { position: [0.278, 0.265, 0.41] }),
    part(hayloftFrameGeo, "#FAF4EA", { position: [0, 0, 0.41] }),
    part(chamferBeamSpec(0.038, 0.038, 0.16, 0.005, 0), "#FAF4EA", { position: [0, 0.79, 0.44] })
  );

  // Golden hay bale peeking out of the upper hayloft opening!
  timberParts.push(
    part(roundedBoxSpec(0.17, 0.11, 0.16, 0.024, 1), "#F2C444", {
      position: [0, 0.565, 0.36],
      rotation: [0, 0.08, 0]
    }),
    part(chamferBeamSpec(0.176, 0.114, 0.014, 0.003, 0), "#C78E2C", { position: [-0.04, 0.565, 0.36] }),
    part(chamferBeamSpec(0.176, 0.114, 0.014, 0.003, 0), "#C78E2C", { position: [0.04, 0.565, 0.36] })
  );

  // 4 Side windows (2 left, 2 right) with crisp white frames & cross-mullions
  for (const sx of [-1, 1] as const) {
    for (const wz of [-0.2, 0.2] as const) {
      roofParts.push(
        part(chamferBeamSpec(0.016, 0.13, 0.13, 0.002, 0), "#2E394B", { position: [sx * 0.503, 0.31, wz] })
      );
      timberParts.push(
        part(chamferBeamSpec(0.026, 0.154, 0.022, 0.003, 0), "#FAF4EA", { position: [sx * 0.508, 0.31, wz - 0.068] }),
        part(chamferBeamSpec(0.026, 0.154, 0.022, 0.003, 0), "#FAF4EA", { position: [sx * 0.508, 0.31, wz + 0.068] }),
        part(chamferBeamSpec(0.026, 0.022, 0.158, 0.003, 0), "#FAF4EA", { position: [sx * 0.508, 0.378, wz] }),
        part(chamferBeamSpec(0.026, 0.022, 0.158, 0.003, 0), "#FAF4EA", { position: [sx * 0.508, 0.242, wz] }),
        // Cross mullions
        part(chamferBeamSpec(0.024, 0.13, 0.014, 0.002, 0), "#FAF4EA", { position: [sx * 0.508, 0.31, wz] }),
        part(chamferBeamSpec(0.024, 0.014, 0.13, 0.002, 0), "#FAF4EA", { position: [sx * 0.508, 0.31, wz] })
      );
    }
  }

  // Slate-charcoal `extrudeContourSpec` Gambrel Roof + Overhanging Cream Bargeboards (`#FAF4EA`)
  const gambrelRoofShell: readonly ProceduralVec2[] = [
    [-0.57, 0.44],
    [-0.535, 0.42],
    [-0.34, 0.72],
    [0, 0.855],
    [0.34, 0.72],
    [0.535, 0.42],
    [0.57, 0.44],
    [0.37, 0.755],
    [0, 0.895],
    [-0.37, 0.755]
  ];
  const roofGeo = extrudeContourSpec({
    outer: gambrelRoofShell,
    depth: 0.88,
    bevelSegments: 0
  });
  const bargeboardGeo = extrudeContourSpec({
    outer: gambrelRoofShell,
    depth: 0.032,
    bevelSegments: 0
  });
  roofParts.push(
    part(roofGeo, "#3E4656", { position: [0, 0, 0] }),
    // Dark hayloft shadow recess behind hay bale
    part(chamferBeamSpec(0.24, 0.24, 0.02, 0.003, 0), "#2A2428", { position: [0, 0.62, 0.28] })
  );
  timberParts.push(
    part(bargeboardGeo, "#FAF4EA", { position: [0, -0.004, 0.448] }),
    part(bargeboardGeo, "#FAF4EA", { position: [0, -0.004, -0.448] })
  );

  // Rooftop Cupola + Brass Weathervane (`y -> 1.00`)
  timberParts.push(
    part(chamferBeamSpec(0.17, 0.09, 0.17, 0.01, 0), "#FAF4EA", { position: [0, 0.885, 0] }),
    part(chamferBeamSpec(0.184, 0.022, 0.184, 0.005, 0), "#D84A3E", { position: [0, 0.85, 0] })
  );
  const cupolaRoofProfile: readonly ProceduralVec2[] = [
    [0, 0.92],
    [0.135, 0.92],
    [0.02, 0.968],
    [0, 0.97]
  ];
  roofParts.push(
    part(sculptOrganicLathe(cupolaRoofProfile, { segments: 4, creaseAngle: 0.4 }), "#3E4656", {
      rotation: [0, Math.PI * 0.25, 0]
    })
  );
  brassParts.push(
    // Weathervane mast, cardinal arms, directional arrow & top finial orb at y = 1.00
    part(cylinderSpec(0.008, 0.01, 0.075, 8, 0), "#F2C94C", { position: [0, 0.995, 0] }),
    part(smoothOrbSpec(0.016, 8, 4), "#FFE074", { position: [0, 1.03, 0] }),
    part(chamferBeamSpec(0.13, 0.01, 0.01, 0.002, 0), "#E6BA38", { position: [0, 0.995, 0] }),
    part(chamferBeamSpec(0.01, 0.01, 0.14, 0.002, 0), "#F2C94C", { position: [0, 1.01, 0] }),
    // Hayloft pulley hook under front hoist beam
    part(torusSpec(0.02, 0.006, 10, 6), "#E6BA38", { position: [0, 0.755, 0.49] })
  );

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "timberWalls",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      parts: timberParts
    }),
    composeLobe({
      suffix: "stonePlinth",
      craft: "clay",
      craftTexture: "storybookBrickMasonry",
      parts: stoneParts
    }),
    composeLobe({
      suffix: "gambrelRoof",
      craft: "ceramic",
      parts: roofParts
    }),
    composeLobe({
      suffix: "brassVane",
      craft: "brushedMetal",
      parts: brassParts
    })
  ]);

  return finalizeProceduralRig("barn", [
    bodyPart,
    buildBarnDoorLeaf("hingeLeaf", -1),
    buildBarnDoorLeaf("hingeLeafR", 1)
  ]);
}

// ---------------------------------------------------------------- 4. station (2.60m, +Z platform canopy & clock)

function buildStationRig(): ProceduralAssetRig {
  const masonryParts: LobePartInput[] = [];
  const timberParts: LobePartInput[] = [];
  const roofParts: LobePartInput[] = [];
  const clockDialParts: LobePartInput[] = [];
  const metalParts: LobePartInput[] = [];
  const glowParts: LobePartInput[] = [];

  // Wide passenger platform base (`storybookBrickMasonry`) + warm terracotta tactile safety coping along +Z
  masonryParts.push(
    part(chamferBeamSpec(1.52, 0.095, 0.64, 0.012, 1), "#EDE0C4", { position: [0, 0.0475, 0] }),
    part(chamferBeamSpec(1.54, 0.028, 0.065, 0.006, 0), "#DF8B68", { position: [0, 0.092, 0.295] }),
    // Main cream limestone station building (`z in [-0.28, +0.14]`)
    part(chamferBeamSpec(1.22, 0.5, 0.42, 0.012, 1), "#F6EAD2", { position: [0, 0.34, -0.07] })
  );

  // Terracotta brick corner quoins & central clock-gable tower projection on +Z
  const clockGableOuter: readonly ProceduralVec2[] = [
    [-0.24, 0.09],
    [0.24, 0.09],
    [0.24, 0.66],
    [0, 0.86],
    [-0.24, 0.66]
  ];
  masonryParts.push(
    part(extrudeContourSpec({ outer: clockGableOuter, depth: 0.14, bevelSegments: 1, bevelThickness: 0.008, bevelSize: 0.006 }), "#F8EFE0", {
      position: [0, 0, 0.13]
    })
  );
  for (const sx of [-1, 1] as const) {
    for (let q = 0; q < 4; q += 1) {
      masonryParts.push(
        part(chamferBeamSpec(0.06, 0.07, 0.055, 0.006, 0), "#D96E54", {
          position: [sx * 0.595, 0.15 + q * 0.115, 0.125]
        })
      );
    }
  }

  // Tall corbelled terracotta brick chimney stack reaching y -> 1.00 on right roof slope
  masonryParts.push(
    part(chamferBeamSpec(0.13, 0.28, 0.13, 0.008, 0), "#D4664E", { position: [0.41, 0.81, -0.1] }),
    part(chamferBeamSpec(0.155, 0.032, 0.155, 0.006, 0), "#E6836B", { position: [0.41, 0.945, -0.1] })
  );
  roofParts.push(
    part(cylinderSpec(0.036, 0.044, 0.07, 20, 0.006), "#C85A42", { position: [0.41, 0.985, -0.1] })
  );

  // Pitched slate-blue shingled main gable roof (extruded along X) + front clock-dormer gable roof (along Z)
  const mainGableRoofProfile: readonly ProceduralVec2[] = [
    [-0.28, 0.56],
    [0, 0.85],
    [0.28, 0.56],
    [0.24, 0.535],
    [0, 0.8],
    [-0.24, 0.535]
  ];
  // Under Ry(HALF_PI), contour X maps to -Z, so symmetric [-0.28..+0.28] spans Z centered at z = -0.07!
  roofParts.push(
    part(
      extrudeContourSpec({ outer: mainGableRoofProfile, depth: 1.32, bevelSegments: 1, bevelThickness: 0.008, bevelSize: 0.006 }),
      "#587798",
      { position: [0, 0, -0.07], rotation: [0, HALF_PI, 0] }
    )
  );
  const dormerRoofProfile: readonly ProceduralVec2[] = [
    [-0.29, 0.64],
    [0, 0.895],
    [0.29, 0.64],
    [0.255, 0.618],
    [0, 0.85],
    [-0.255, 0.618]
  ];
  roofParts.push(
    part(
      extrudeContourSpec({ outer: dormerRoofProfile, depth: 0.3, bevelSegments: 1, bevelThickness: 0.007, bevelSize: 0.005 }),
      "#4F6D8E",
      { position: [0, 0, 0.08] }
    ),
    // Projecting +Z passenger platform canopy roof slope
    part(chamferBeamSpec(1.36, 0.036, 0.24, 0.006, 0), "#6383A6", {
      position: [0, 0.52, 0.24],
      rotation: [0.18, 0, 0]
    })
  );

  // Scalloped timber platform canopy valance along +Z (`z = 0.35`)
  const scallopPts: ProceduralVec2[] = [
    [-0.68, 0.5],
    [0.68, 0.5]
  ];
  const scallopCount = 12;
  for (let i = scallopCount; i >= 0; i -= 1) {
    const x = -0.68 + (i / scallopCount) * 1.36;
    scallopPts.push([x, 0.462]);
    if (i > 0) {
      const midX = -0.68 + ((i - 0.5) / scallopCount) * 1.36;
      scallopPts.push([midX, 0.434]);
    }
  }
  const valanceGeo = extrudeContourSpec({
    outer: scallopPts,
    depth: 0.022,
    bevelSegments: 0
  });
  timberParts.push(
    part(valanceGeo, "#FAF2DF", { position: [0, 0, 0.352] }),
    // Panelled teal/walnut ticket-office front door at +Z center + arched transom
    part(chamferBeamSpec(0.2, 0.33, 0.03, 0.006, 0), "#3E8E89", { position: [0, 0.255, 0.202] }),
    part(chamferBeamSpec(0.24, 0.03, 0.038, 0.005, 0), "#C88E55", { position: [0, 0.43, 0.205] }),
    // Cute wooden waiting bench on the right platform!
    part(chamferBeamSpec(0.26, 0.024, 0.09, 0.004, 0), "#CF9358", { position: [0.44, 0.165, 0.23] }),
    part(chamferBeamSpec(0.26, 0.08, 0.02, 0.004, 0), "#C4874D", { position: [0.44, 0.21, 0.19] }),
    part(chamferBeamSpec(0.026, 0.07, 0.08, 0.003, 0), "#8A5A36", { position: [0.34, 0.125, 0.23] }),
    part(chamferBeamSpec(0.026, 0.07, 0.08, 0.003, 0), "#8A5A36", { position: [0.54, 0.125, 0.23] })
  );

  // Arched mullioned windows on +Z with warm cozy interior glow (`warmGlow`, `emissiveIntensity: 0.32`)
  const archWinGeo = extrudeContourSpec({
    outer: archPolygon(0.095, 0.22, 0.35, 0.43, 10),
    depth: 0.024,
    bevelSegments: 0
  });
  const archSurroundGeo = extrudeContourSpec({
    outer: archPolygon(0.118, 0.2, 0.35, 0.455, 10),
    holes: [archPolygon(0.092, 0.22, 0.35, 0.428, 10)],
    depth: 0.034,
    bevelSegments: 0
  });
  for (const wx of [-0.39, 0.39] as const) {
    glowParts.push(part(archWinGeo, "#FFE7AD", { position: [wx, 0, 0.142] }));
    masonryParts.push(part(archSurroundGeo, "#D96E54", { position: [wx, 0, 0.148] }));
    timberParts.push(
      part(chamferBeamSpec(0.016, 0.2, 0.03, 0.002, 0), "#FAF4EA", { position: [wx, 0.32, 0.152] }),
      part(chamferBeamSpec(0.18, 0.016, 0.03, 0.002, 0), "#FAF4EA", { position: [wx, 0.33, 0.152] })
    );
  }
  // Warm platform entry lanterns flanking the ticket door
  for (const lx of [-0.15, 0.15] as const) {
    glowParts.push(part(smoothOrbSpec(0.026, 8, 4), "#FFE8AE", { position: [lx, 0.38, 0.225] }));
    metalParts.push(part(chamferBeamSpec(0.018, 0.018, 0.045, 0.003, 0), "#39414F", { position: [lx, 0.405, 0.21] }));
  }

  // Prominent front gable station clock (`clockAndGaugeDial` on planar-UV `dialDiscSpec` + brass bezel!)
  clockDialParts.push(
    part(dialDiscSpec(0.098, 0.018, 36), "#FFFFFF", { position: [0, 0.71, 0.206] })
  );
  metalParts.push(
    part(ringBezelSpec(0.116, 0.094, 0.03, 36), "#F2C94C", { position: [0, 0.71, 0.212] }),
    part(smoothOrbSpec(0.014, 8, 4), "#D89E28", { position: [0, 0.71, 0.222] }),
    // Brass door handles
    part(smoothOrbSpec(0.014, 8, 4), "#F2C94C", { position: [0.05, 0.25, 0.222] })
  );

  // 4 curved wrought-iron canopy brackets under +Z platform canopy
  for (const bx of [-0.54, -0.2, 0.2, 0.54] as const) {
    const bracket = sculptCurvedLimb(
      [
        [bx, 0.37, 0.14],
        [bx, 0.45, 0.2],
        [bx, 0.495, 0.32]
      ],
      0.012,
      { steps: 5, radialSegments: 6 }
    );
    metalParts.push(part(bracket, "#3C4352"));
  }

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "masonryWalls",
      craft: "clay",
      craftTexture: "storybookBrickMasonry",
      parts: masonryParts
    }),
    composeLobe({
      suffix: "timberCanopy",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      parts: timberParts
    }),
    composeLobe({
      suffix: "slateRoof",
      craft: "ceramic",
      parts: roofParts
    }),
    composeLobe({
      suffix: "clockDial",
      craft: "ceramic",
      craftTexture: "clockAndGaugeDial",
      parts: clockDialParts
    }),
    composeLobe({
      suffix: "ironAndBrass",
      craft: "brushedMetal",
      parts: metalParts
    }),
    composeLobe({
      suffix: "cozyWindows",
      craft: "warmGlow",
      baseColor: "#FFE7AD",
      emissive: "#FFE29A",
      emissiveIntensity: 0.32,
      parts: glowParts
    })
  ]);

  return finalizeProceduralRig("station", [bodyPart]);
}

// ---------------------------------------------------------------- 5. tunnel (1.80m, TRUE OPEN Z-BORE)

function buildTunnelRig(): ProceduralAssetRig {
  const masonryParts: LobePartInput[] = [];
  const hillParts: LobePartInput[] = [];
  const timberParts: LobePartInput[] = [];
  const brassParts: LobePartInput[] = [];

  // CRITICAL TRUE OPEN BORE:
  // `archHole` spans x in [-0.31, +0.31] (width = 0.62 * h >= 0.56 * h = 1.12m at 1.8m!)
  // and y from thin 0.014 sill up to crown y = 0.725 (arch height = 0.725 * h >= 0.68 * h = 1.30m at 1.8m!)
  // so `gogo` (0.90m) drives visibly straight through along Z with daylight clearance!
  const outerPortalContour: readonly ProceduralVec2[] = [
    [-0.78, 0],
    [0.78, 0],
    [0.72, 0.34],
    [0.58, 0.66],
    [0.36, 0.84],
    [0, 0.89],
    [-0.36, 0.84],
    [-0.58, 0.66],
    [-0.72, 0.34]
  ];
  const archHole = archPolygon(0.31, 0.014, 0.42, 0.725, 22);

  const barrelMasonry = extrudeContourSpec({
    outer: outerPortalContour,
    holes: [archHole],
    depth: 0.94,
    bevelSegments: 0,
    creaseAngle: 0.88
  });
  masonryParts.push(part(barrelMasonry, "#DDD2BE", { position: [0, 0, 0] }));

  // Splayed masonry wing-wall buttresses & parapet coping ledges on BOTH +Z and -Z portals
  const buttress = chamferBeamSpec(0.14, 0.58, 0.1, 0.014, 1);
  const parapetLedge = chamferBeamSpec(0.92, 0.048, 0.09, 0.008, 1);
  for (const zSign of [1, -1] as const) {
    masonryParts.push(
      part(parapetLedge, "#EAE0CE", { position: [0, 0.845, zSign * 0.465] }),
      part(buttress, "#D2C6B0", { position: [-0.52, 0.29, zSign * 0.47], rotation: [0, 0, -0.14] }),
      part(buttress, "#D2C6B0", { position: [0.52, 0.29, zSign * 0.47], rotation: [0, 0, 0.14] })
    );

    // Rusticated radial arch voussoirs + oversized crown keystone around BOTH +Z and -Z portals!
    // Positioned at radius 0.355 around [0, 0.42] so none protrude inside the 0.31 clear bore!
    const voussoir = chamferBeamSpec(0.068, 0.095, 0.055, 0.008, 0);
    const keystone = chamferBeamSpec(0.095, 0.135, 0.072, 0.01, 1);
    for (let k = 0; k <= 8; k += 1) {
      if (k === 4) continue; // Center crown gets the prominent keystone!
      const ang = (k / 8) * Math.PI;
      const vx = Math.cos(ang) * 0.358;
      const vy = 0.42 + Math.sin(ang) * 0.348;
      masonryParts.push(
        part(voussoir, k % 2 === 0 ? "#EAE0CE" : "#CFC2AA", {
          position: [vx, vy, zSign * 0.468],
          rotation: [0, 0, ang - HALF_PI]
        })
      );
    }
    masonryParts.push(
      part(keystone, "#F3EBDC", { position: [0, 0.775, zSign * 0.474] })
    );
    brassParts.push(
      part(dialDiscSpec(0.032, 0.014, 20), "#F2C94C", { position: [0, 0.775, zSign * 0.512] })
    );
  }

  // Lush sculpted grassy hillock cap (`sculptFbmOrganicPuffs`) crowning the arch barrel (`y -> 1.0`)
  // Every puff stays strictly ABOVE y = 0.78 over the bore (or outside |x| >= 0.52 on the embankments)
  // so the open Z-bore remains 100% clear!
  const hillPuffs: readonly OrganicPuffItem[] = [
    { position: [0, 0.91, 0], scale: [0.68, 0.2, 0.84], colorHex: "#79C968" },
    { position: [-0.26, 0.87, 0.06], scale: [0.5, 0.18, 0.78], colorHex: "#84D272" },
    { position: [0.26, 0.87, -0.05], scale: [0.5, 0.18, 0.78], colorHex: "#72C262" },
    { position: [-0.52, 0.66, 0], scale: [0.38, 0.34, 0.82], colorHex: "#6FBE5F" },
    { position: [0.52, 0.66, 0], scale: [0.38, 0.34, 0.82], colorHex: "#78C767" },
    { position: [-0.67, 0.34, 0.02], scale: [0.34, 0.48, 0.84], colorHex: "#68B659" },
    { position: [0.67, 0.34, -0.02], scale: [0.34, 0.48, 0.84], colorHex: "#6EB95E" },
    { position: [0, 0.94, 0.22], scale: [0.46, 0.15, 0.42], colorHex: "#8AD778" },
    { position: [0, 0.94, -0.22], scale: [0.46, 0.15, 0.42], colorHex: "#82D070" }
  ];
  const sculptedHill = sculptFbmOrganicPuffs(hillPuffs, {
    puffSegments: 6,
    amplitude: 0.014,
    frequency: 3.1,
    seed: 509
  });
  hillParts.push(
    part(sculptedHill.geometry, "#FFFFFF", { subShapes: sculptedHill.subShapeCount })
  );

  // Tiny cheerful storybook wildflowers dotting the grassy crest
  const blossom = smoothOrbSpec(0.024, 8, 4);
  const flowerSpots: readonly (readonly [number, number, number, string])[] = [
    [-0.18, 0.97, 0.24, "#F79AC0"],
    [-0.12, 0.985, 0.18, "#FFD84D"],
    [0.19, 0.975, 0.21, "#FFFDF7"],
    [0.25, 0.955, -0.16, "#F79AC0"],
    [-0.28, 0.94, -0.2, "#7EC4F8"],
    [0.08, 1.0, -0.08, "#FFD84D"]
  ];
  for (const [fx, fy, fz, col] of flowerSpots) {
    hillParts.push(part(blossom, col, { position: [fx, fy, fz], scale: [1, 0.65, 1] }));
  }

  // Split-rail timber safety fences atop the left & right hillock shoulders
  const fencePost = chamferBeamSpec(0.028, 0.14, 0.028, 0.005, 0);
  const fenceRail = chamferBeamSpec(0.018, 0.022, 0.56, 0.004, 0);
  for (const sx of [-1, 1] as const) {
    for (const fz of [-0.24, 0, 0.24] as const) {
      timberParts.push(part(fencePost, "#A67246", { position: [sx * 0.42, 0.91, fz] }));
    }
    timberParts.push(
      part(fenceRail, "#BA8354", { position: [sx * 0.42, 0.95, 0] }),
      part(fenceRail, "#B27B4D", { position: [sx * 0.42, 0.895, 0] })
    );
  }

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "portalMasonry",
      craft: "clay",
      craftTexture: "storybookBrickMasonry",
      parts: masonryParts
    }),
    composeLobe({
      suffix: "grassyHillock",
      craft: "felt",
      parts: hillParts
    }),
    composeLobe({
      suffix: "timberFence",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      parts: timberParts
    }),
    composeLobe({
      suffix: "brassMedallions",
      craft: "brushedMetal",
      parts: brassParts
    })
  ]);

  return finalizeProceduralRig("tunnel", [bodyPart]);
}

// ---------------------------------------------------------------- 6. house (3.00m, butter-yellow storybook cottage)

function buildHouseRig(): ProceduralAssetRig {
  const wallParts: LobePartInput[] = [];
  const roofParts: LobePartInput[] = [];
  const woodParts: LobePartInput[] = [];
  const brassParts: LobePartInput[] = [];
  const glowParts: LobePartInput[] = [];

  // Stone plinth (`storybookBrickMasonry`) + two-tier front stone doorstep on +Z
  wallParts.push(
    part(chamferBeamSpec(0.96, 0.09, 0.58, 0.012, 1), "#DDD2BE", { position: [0, 0.045, 0] }),
    part(chamferBeamSpec(0.32, 0.055, 0.12, 0.01, 1), "#D4C7B0", { position: [0, 0.0275, 0.31] }),
    part(chamferBeamSpec(0.26, 0.035, 0.08, 0.008, 0), "#E6DCC8", { position: [0, 0.068, 0.285] })
  );

  // Cozy butter-yellow (`#FCE29C`) cottage walls & front/back pitched gable walls
  const cottageGableOuter: readonly ProceduralVec2[] = [
    [-0.46, 0.085],
    [0.46, 0.085],
    [0.46, 0.58],
    [0, 0.88],
    [-0.46, 0.58]
  ];
  wallParts.push(
    part(
      extrudeContourSpec({
        outer: cottageGableOuter,
        depth: 0.54,
        bevelSegments: 1,
        bevelThickness: 0.012,
        bevelSize: 0.01
      }),
      "#FCE29C",
      { position: [0, 0, 0] }
    )
  );

  // Cream corner quoins + arched stone front door surround + brick chimney stack
  const doorSurroundGeo = extrudeContourSpec({
    outer: openArchFramePolygon(0.145, 0.112, 0.085, 0.34, 0.47, 0.435, 12),
    depth: 0.036,
    bevelSegments: 0
  });
  wallParts.push(
    part(doorSurroundGeo, "#EFE5D2", { position: [0, 0, 0.278] }),
    part(chamferBeamSpec(0.13, 0.3, 0.13, 0.008, 0), "#D86E58", { position: [0.27, 0.8, -0.08] }),
    part(chamferBeamSpec(0.155, 0.03, 0.155, 0.006, 0), "#E6826C", { position: [0.27, 0.945, -0.08] })
  );

  // Terracotta scalloped gable roof (`#E47362`) + turned chimney pot (`y -> 1.00`)
  const cottageRoofProfile: readonly ProceduralVec2[] = [
    [-0.53, 0.54],
    [0, 0.92],
    [0.53, 0.54],
    [0.495, 0.515],
    [0, 0.872],
    [-0.495, 0.515]
  ];
  roofParts.push(
    part(
      extrudeContourSpec({
        outer: cottageRoofProfile,
        depth: 0.65,
        bevelSegments: 1,
        bevelThickness: 0.01,
        bevelSize: 0.008
      }),
      "#E47362",
      { position: [0, 0, 0] }
    ),
    // Scalloped terracotta tile course ribs along both roof slopes + rounded ridge cresting
    part(cylinderSpec(0.024, 0.024, 0.66, 12, 0), "#CF5E4E", {
      position: [0, 0.922, 0],
      rotation: [HALF_PI, 0, 0]
    }),
    // Turned terracotta chimney pot topping out at y = 1.00
    part(
      sculptOrganicLathe(
        [
          [0, 0.945],
          [0.042, 0.945],
          [0.034, 0.985],
          [0.046, 0.994],
          [0.036, 1.0],
          [0, 1.0]
        ],
        { segments: 24, creaseAngle: 1.1 }
      ),
      "#C95848",
      { position: [0.27, 0, -0.08] }
    )
  );
  for (const rStep of [0.16, 0.32, 0.44] as const) {
    const ry = 0.895 - rStep * 0.69;
    for (const sx of [-1, 1] as const) {
      roofParts.push(
        part(chamferBeamSpec(0.026, 0.022, 0.64, 0.005, 0), "#D66453", {
          position: [sx * rStep, ry, 0],
          rotation: [0, 0, -sx * 0.62]
        })
      );
    }
  }

  // Cream gable bargeboards + arched teal wooden front door (+Z) + front porch gable hood
  const doorLeafGeo = extrudeContourSpec({
    outer: archPolygon(0.112, 0.085, 0.34, 0.436, 12),
    depth: 0.028,
    bevelSegments: 1,
    bevelThickness: 0.004,
    bevelSize: 0.004
  });
  woodParts.push(
    part(doorLeafGeo, "#43ACA5", { position: [0, 0, 0.272] }),
    // Charming pitched porch canopy over front door
    part(chamferBeamSpec(0.22, 0.026, 0.12, 0.005, 0), "#FAF3E4", {
      position: [-0.09, 0.505, 0.31],
      rotation: [0, 0, 0.42]
    }),
    part(chamferBeamSpec(0.22, 0.026, 0.12, 0.005, 0), "#FAF3E4", {
      position: [0.09, 0.505, 0.31],
      rotation: [0, 0, -0.42]
    })
  );

  // Brass ring knocker, doorknob & porch lantern on +Z
  brassParts.push(
    part(dialDiscSpec(0.022, 0.01, 16), "#F2C94C", { position: [0, 0.31, 0.29] }),
    part(torusSpec(0.024, 0.006, 12, 6), "#F2C94C", { position: [0, 0.286, 0.294] }),
    part(smoothOrbSpec(0.016, 8, 4), "#FFE074", { position: [0.068, 0.24, 0.294] }),
    part(chamferBeamSpec(0.018, 0.02, 0.05, 0.003, 0), "#434A59", { position: [0.16, 0.4, 0.29] })
  );
  glowParts.push(part(smoothOrbSpec(0.026, 8, 4), "#FFE5A3", { position: [0.16, 0.372, 0.31] }));

  // Two front shuttered windows (+Z) with glowing panes, cross-mullions & blooming window flower boxes
  const flowerOrb = smoothOrbSpec(0.024, 8, 4);
  for (const wx of [-0.285, 0.285] as const) {
    glowParts.push(
      part(chamferBeamSpec(0.135, 0.155, 0.02, 0.004, 0), "#FFE5A3", { position: [wx, 0.375, 0.272] })
    );
    woodParts.push(
      // White window frame + cross-mullions
      part(chamferBeamSpec(0.16, 0.02, 0.032, 0.003, 0), "#FAF4EA", { position: [wx, 0.46, 0.28] }),
      part(chamferBeamSpec(0.014, 0.155, 0.028, 0.002, 0), "#FAF4EA", { position: [wx, 0.375, 0.28] }),
      part(chamferBeamSpec(0.135, 0.014, 0.028, 0.002, 0), "#FAF4EA", { position: [wx, 0.375, 0.28] }),
      // Pastel teal louvered shutters flanking each window
      part(chamferBeamSpec(0.052, 0.16, 0.022, 0.004, 0), "#5BB8B0", { position: [wx - 0.102, 0.375, 0.28] }),
      part(chamferBeamSpec(0.052, 0.16, 0.022, 0.004, 0), "#5BB8B0", { position: [wx + 0.102, 0.375, 0.28] }),
      // Moulded wooden window flower box + green foliage strip
      part(chamferBeamSpec(0.18, 0.048, 0.065, 0.006, 0), "#BA804E", { position: [wx, 0.275, 0.305] }),
      part(chamferBeamSpec(0.165, 0.03, 0.05, 0.008, 0), "#6DC264", { position: [wx, 0.305, 0.305] })
    );
    // 3 blooming flowers in each window box
    roofParts.push(
      part(flowerOrb, "#F78FB3", { position: [wx - 0.05, 0.325, 0.312] }),
      part(flowerOrb, "#FFD84D", { position: [wx, 0.33, 0.316] }),
      part(flowerOrb, "#FF6F61", { position: [wx + 0.05, 0.325, 0.312] })
    );
  }

  // Cozy round gable attic window on +Z
  glowParts.push(part(dialDiscSpec(0.062, 0.02, 24), "#FFE5A3", { position: [0, 0.695, 0.272] }));
  woodParts.push(part(ringBezelSpec(0.078, 0.058, 0.03, 24), "#FAF4EA", { position: [0, 0.695, 0.278] }));

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "cottageWalls",
      craft: "clay",
      craftTexture: "storybookBrickMasonry",
      parts: wallParts
    }),
    composeLobe({
      suffix: "terracottaRoof",
      craft: "ceramic",
      parts: roofParts
    }),
    composeLobe({
      suffix: "woodwork",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      parts: woodParts
    }),
    composeLobe({
      suffix: "brassHardware",
      craft: "brushedMetal",
      parts: brassParts
    }),
    composeLobe({
      suffix: "windowGlow",
      craft: "warmGlow",
      baseColor: "#FFE5A3",
      emissive: "#FFE3A0",
      emissiveIntensity: 0.28,
      parts: glowParts
    })
  ]);

  return finalizeProceduralRig("house", [bodyPart]);
}

// ---------------------------------------------------------------- 7. door (1.60m, planted frame + left-hinged tintable leaf)

function buildDoorRig(): ProceduralAssetRig {
  const frameWoodParts: LobePartInput[] = [];
  const stepParts: LobePartInput[] = [];
  const leafPanelParts: LobePartInput[] = [];
  const knobParts: LobePartInput[] = [];

  // Exact [0, 1] calibration (`fitMode: "exact"`):
  // Planted limestone threshold step (`y in [0.00, 0.03]`)
  stepParts.push(
    part(chamferBeamSpec(0.68, 0.03, 0.16, 0.006, 1), "#E5DAC6", { position: [0, 0.015, 0] }),
    part(chamferBeamSpec(0.58, 0.012, 0.11, 0.003, 0), "#D6C9B2", { position: [0, 0.032, 0] })
  );

  // Stationary planted honey-cream moulded arched doorframe (`x in [-0.32, +0.32]`, `y in [0.03, 1.00]`)
  // with a TRUE open inner arch (`x in [-0.26, +0.26]`, `y in [0.03, 0.915]`)!
  const archFrameGeo = extrudeContourSpec({
    outer: openArchFramePolygon(0.32, 0.26, 0.03, 0.72, 0.985, 0.915, 22),
    depth: 0.088,
    bevelSegments: 1,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    creaseAngle: 0.9
  });

  // Raised front & back architrave casing ring + jamb plinth blocks + crown keystone (`y === 1.00`!)
  const casingGeo = extrudeContourSpec({
    outer: openArchFramePolygon(0.335, 0.275, 0.03, 0.72, 0.992, 0.928, 22),
    depth: 0.02,
    bevelSegments: 0
  });

  frameWoodParts.push(
    part(archFrameGeo, "#EAD9BF", { position: [0, 0, 0] }),
    part(casingGeo, "#F5E8D2", { position: [0, 0, 0.044] }),
    part(casingGeo, "#F5E8D2", { position: [0, 0, -0.044] }),
    // Plinth blocks at base of left & right jambs
    part(chamferBeamSpec(0.082, 0.11, 0.106, 0.008, 0), "#DFC9A8", { position: [-0.295, 0.085, 0] }),
    part(chamferBeamSpec(0.082, 0.11, 0.106, 0.008, 0), "#DFC9A8", { position: [0.295, 0.085, 0] }),
    // Crown keystone topping out at exact y = 1.00
    part(chamferBeamSpec(0.095, 0.09, 0.11, 0.01, 1), "#FAF0DF", { position: [0, 0.955, 0] })
  );

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "archFrame",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      tintTarget: false,
      parts: frameWoodParts
    }),
    composeLobe({
      suffix: "thresholdStep",
      craft: "clay",
      craftTexture: "storybookBrickMasonry",
      tintTarget: false,
      parts: stepParts
    })
  ]);

  // Left-hinged panelled door leaf `hingeLeaf` (`anchor: [-0.26, 0.03, 0.0]`):
  // Spans x in [-0.258, +0.256] in actor space -> `x in [+0.002, +0.516]` in hinge-local space!
  // Recessed stiles use `#DCE8EC` and raised fielded panels use `#FFFFFF` under `baseColor: "#49B7B0"` (`tintTarget: true`)!
  const hingeAnchor: Vec3 = [-0.26, 0.03, 0];
  const leafSlabGeo = extrudeContourSpec({
    outer: archPolygon(0.256, 0.035, 0.718, 0.91, 22),
    depth: 0.044,
    bevelSegments: 1,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    creaseAngle: 0.9
  });
  leafPanelParts.push(part(leafSlabGeo, "#D8E5EA", { position: [0, 0, 0] }));

  // 4 raised fielded bevel panels on BOTH +Z and -Z faces + arched transom crest panel
  const lowerFieldPanel = chamferBeamSpec(0.16, 0.27, 0.016, 0.012, 1);
  const upperFieldPanel = chamferBeamSpec(0.16, 0.25, 0.016, 0.012, 1);
  const archTopCrest = extrudeContourSpec({
    outer: archPolygon(0.175, 0.72, 0.73, 0.845, 14),
    depth: 0.016,
    bevelSegments: 1,
    bevelThickness: 0.003,
    bevelSize: 0.003
  });
  for (const zFace of [0.025, -0.025] as const) {
    for (const px of [-0.105, 0.105] as const) {
      leafPanelParts.push(
        part(lowerFieldPanel, "#FFFFFF", { position: [px, 0.23, zFace] }),
        part(upperFieldPanel, "#FFFFFF", { position: [px, 0.56, zFace] })
      );
    }
    leafPanelParts.push(part(archTopCrest, "#FFFFFF", { position: [0, 0, zFace] }));
  }

  // Separate `brushedMetal` brass doorknobs, roses, keyhole escutcheons on BOTH +Z and -Z faces + 3 hinge barrels!
  const knobSphere = smoothOrbSpec(0.032, 12, 6);
  const rosePlate = dialDiscSpec(0.034, 0.01, 18);
  const stemCyl = cylinderSpec(0.012, 0.014, 0.028, 12, 0);
  const escutcheon = chamferBeamSpec(0.026, 0.048, 0.01, 0.008, 0);
  for (const zSign of [1, -1] as const) {
    knobParts.push(
      part(rosePlate, "#E5B83B", { position: [0.19, 0.45, zSign * 0.026] }),
      part(stemCyl, "#D9A82E", {
        position: [0.19, 0.45, zSign * 0.04],
        rotation: [HALF_PI, 0, 0]
      }),
      part(knobSphere, "#F5CE54", { position: [0.19, 0.45, zSign * 0.062] }),
      part(escutcheon, "#E5B83B", { position: [0.19, 0.382, zSign * 0.026] })
    );
  }
  const hingeBarrel = cylinderSpec(0.012, 0.012, 0.065, 10, 0);
  for (const hy of [0.18, 0.46, 0.7] as const) {
    knobParts.push(part(hingeBarrel, "#E5B83B", { position: [-0.258, hy, 0.026] }));
  }

  const hingeLeafPart = makeSubPartRig("hingeLeaf", hingeAnchor, [
    composeLobe({
      suffix: "doorPanel",
      craft: "lacquer",
      baseColor: "#49B7B0",
      tintTarget: true,
      hinge: hingeAnchor,
      parts: leafPanelParts
    }),
    composeLobe({
      suffix: "brassKnobs",
      craft: "brushedMetal",
      tintTarget: false,
      hinge: hingeAnchor,
      parts: knobParts
    })
  ]);

  return finalizeProceduralRig("door", [bodyPart, hingeLeafPart], { fitMode: "exact" });
}

// ---------------------------------------------------------------- 8. lift (1.80m, exact restAt = 0.06, open +Z shaft)

function buildLiftRig(): ProceduralAssetRig {
  const towerWoodParts: LobePartInput[] = [];
  const towerEnamelParts: LobePartInput[] = [];
  const pulleyBrassParts: LobePartInput[] = [];
  const dialParts: LobePartInput[] = [];

  // Exact [0, 1] calibration (`fitMode: "exact"`):
  // Base sill bottom sits at exact y = 0.00; top crown pulley wheel rim touches exact y = 1.00!
  towerEnamelParts.push(
    // Ground landing sill (`y in [0.00, 0.026]`) so liftCab (`y in [0.028, 0.06]`) sits cleanly above it!
    part(chamferBeamSpec(0.56, 0.026, 0.4, 0.006, 1), "#CDBAF0", { position: [0, 0.013, 0] }),
    // Arched lavender-mint crown header (`y in [0.83, 0.965]`) with open arch window for pulley wheel
    part(
      extrudeContourSpec({
        outer: archPolygon(0.285, 0.83, 0.88, 0.968, 18),
        holes: [archPolygon(0.14, 0.85, 0.88, 0.935, 14)],
        depth: 0.055,
        bevelSegments: 1,
        bevelThickness: 0.006,
        bevelSize: 0.005
      }),
      "#CDBAF0",
      { position: [0, 0, 0.172] }
    ),
    part(
      extrudeContourSpec({
        outer: archPolygon(0.285, 0.83, 0.88, 0.968, 18),
        depth: 0.05,
        bevelSegments: 0
      }),
      "#BCE6DC",
      { position: [0, 0, -0.172] }
    ),
    part(chamferBeamSpec(0.57, 0.036, 0.39, 0.006, 0), "#BCE6DC", { position: [0, 0.84, 0] })
  );

  // 4 chamfered maple corner posts + 2nd-floor side/back landing rails + side X-bracing (leaving +Z OPEN!)
  const cornerPost = chamferBeamSpec(0.042, 0.82, 0.042, 0.007, 0);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      towerWoodParts.push(
        part(cornerPost, "#D8A673", { position: [sx * 0.258, 0.43, sz * 0.175] })
      );
    }
    // Side horizontal rails & lower/upper X-brace lattices (`±X` sides)
    towerWoodParts.push(
      part(chamferBeamSpec(0.028, 0.03, 0.33, 0.004, 0), "#E3B888", { position: [sx * 0.258, 0.48, 0] }),
      part(chamferBeamSpec(0.02, 0.38, 0.022, 0.003, 0), "#CCA070", {
        position: [sx * 0.258, 0.25, 0],
        rotation: [0.64, 0, 0]
      }),
      part(chamferBeamSpec(0.02, 0.38, 0.022, 0.003, 0), "#CCA070", {
        position: [sx * 0.258, 0.25, 0],
        rotation: [-0.64, 0, 0]
      }),
      part(chamferBeamSpec(0.02, 0.36, 0.022, 0.003, 0), "#CCA070", {
        position: [sx * 0.258, 0.66, 0],
        rotation: [0.64, 0, 0]
      }),
      part(chamferBeamSpec(0.02, 0.36, 0.022, 0.003, 0), "#CCA070", {
        position: [sx * 0.258, 0.66, 0],
        rotation: [-0.64, 0, 0]
      })
    );
  }
  // Rear (`-Z`) horizontal safety transoms
  for (const ry of [0.26, 0.5, 0.72] as const) {
    towerWoodParts.push(
      part(chamferBeamSpec(0.49, 0.028, 0.026, 0.004, 0), "#DEB180", { position: [0, ry, -0.175] })
    );
  }

  // Spoked brass crown pulley wheel whose top rim sits at EXACT `y = 1.00` (`centerY = 0.915, outerR = 0.085`)!
  pulleyBrassParts.push(
    part(ringBezelSpec(0.085, 0.062, 0.032, 36), "#F2C94C", { position: [0, 0.915, 0] }),
    part(cylinderSpec(0.022, 0.022, 0.08, 14, 0), "#D9A72E", {
      position: [0, 0.915, 0],
      rotation: [HALF_PI, 0, 0]
    }),
    // Twin vertical brass hoist guide cables down the rear shaft
    part(cylinderSpec(0.006, 0.006, 0.84, 8, 0), "#C89B32", { position: [-0.075, 0.48, -0.14] }),
    part(cylinderSpec(0.006, 0.006, 0.84, 8, 0), "#C89B32", { position: [0.075, 0.48, -0.14] }),
    // Front floor-indicator dial brass bezel (`+Z`)
    part(ringBezelSpec(0.058, 0.045, 0.02, 24), "#F2C94C", { position: [0, 0.895, 0.205] })
  );
  for (let s = 0; s < 3; s += 1) {
    pulleyBrassParts.push(
      part(chamferBeamSpec(0.012, 0.145, 0.016, 0.002, 0), "#E5B73B", {
        position: [0, 0.915, 0],
        rotation: [0, 0, (s / 3) * Math.PI]
      })
    );
  }

  // `clockAndGaugeDial` floor indicator dial on +Z crown header
  dialParts.push(
    part(dialDiscSpec(0.047, 0.014, 28), "#FFFFFF", { position: [0, 0.895, 0.202] })
  );

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "towerTimber",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      parts: towerWoodParts
    }),
    composeLobe({
      suffix: "towerEnamel",
      craft: "clay",
      parts: towerEnamelParts
    }),
    composeLobe({
      suffix: "pulleyBrass",
      craft: "brushedMetal",
      parts: pulleyBrassParts
    }),
    composeLobe({
      suffix: "floorDial",
      craft: "ceramic",
      craftTexture: "clockAndGaugeDial",
      parts: dialParts
    })
  ]);

  // Vertically sliding passenger cabin `liftCab` (`anchor: [0, 0.06, 0]`):
  // Deck spans `y in [0.028, 0.060]` so top of floor is at EXACT `restAt = 0.06`!
  const cabAnchor: Vec3 = [0, 0.06, 0];
  const cabWoodParts: LobePartInput[] = [
    part(chamferBeamSpec(0.45, 0.032, 0.31, 0.006, 1), "#F2CA8A", { position: [0, 0.044, 0] }),
    // Side & rear wooden handrails (`y = 0.25`)
    part(chamferBeamSpec(0.026, 0.026, 0.3, 0.005, 0), "#D9A066", { position: [-0.21, 0.25, 0] }),
    part(chamferBeamSpec(0.026, 0.026, 0.3, 0.005, 0), "#D9A066", { position: [0.21, 0.25, 0] }),
    part(chamferBeamSpec(0.44, 0.026, 0.026, 0.005, 0), "#D9A066", { position: [0, 0.25, -0.14] })
  ];
  const baluster = cylinderSpec(0.011, 0.013, 0.19, 8, 0);
  for (const bx of [-0.21, 0.21] as const) {
    for (const bz of [-0.14, 0, 0.13] as const) {
      cabWoodParts.push(part(baluster, "#E6B47C", { position: [bx, 0.155, bz] }));
    }
  }
  const cabBrassParts: LobePartInput[] = [
    part(chamferBeamSpec(0.462, 0.018, 0.322, 0.004, 0), "#E6BA3C", { position: [0, 0.036, 0] }),
    part(torusSpec(0.028, 0.007, 16, 8), "#F2C94C", { position: [0, 0.285, -0.14] })
  ];
  const liftCabPart = makeSubPartRig("liftCab", cabAnchor, [
    composeLobe({
      suffix: "cabWood",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      hinge: cabAnchor,
      parts: cabWoodParts
    }),
    composeLobe({
      suffix: "cabBrass",
      craft: "brushedMetal",
      hinge: cabAnchor,
      parts: cabBrassParts
    })
  ]);

  // Horizontally sliding collapsible brass/cream scissor-lattice gate `liftGate` (`anchor: [0, 0.18, 0.18]`)
  const gateAnchor: Vec3 = [0, 0.18, 0.18];
  const gateParts: LobePartInput[] = [
    part(chamferBeamSpec(0.45, 0.022, 0.022, 0.004, 0), "#F2C94C", { position: [0, 0.29, 0.18] }),
    part(chamferBeamSpec(0.45, 0.022, 0.022, 0.004, 0), "#F2C94C", { position: [0, 0.07, 0.18] }),
    // Brass latch handle on left leading stile
    part(smoothOrbSpec(0.018, 12, 6), "#FFE074", { position: [-0.2, 0.18, 0.198] })
  ];
  for (const px of [-0.21, -0.105, 0, 0.105, 0.21] as const) {
    gateParts.push(
      part(chamferBeamSpec(0.016, 0.22, 0.016, 0.003, 0), "#FAF3E4", { position: [px, 0.18, 0.18] })
    );
  }
  for (const lx of [-0.155, -0.052, 0.052, 0.155] as const) {
    gateParts.push(
      part(chamferBeamSpec(0.012, 0.21, 0.012, 0.002, 0), "#E6BA3C", {
        position: [lx, 0.18, 0.184],
        rotation: [0, 0, 0.44]
      }),
      part(chamferBeamSpec(0.012, 0.21, 0.012, 0.002, 0), "#E6BA3C", {
        position: [lx, 0.18, 0.176],
        rotation: [0, 0, -0.44]
      })
    );
  }
  const liftGatePart = makeSubPartRig("liftGate", gateAnchor, [
    composeLobe({
      suffix: "gateLattice",
      craft: "brushedMetal",
      hinge: gateAnchor,
      parts: gateParts
    })
  ]);

  return finalizeProceduralRig("lift", [bodyPart, liftCabPart, liftGatePart], { fitMode: "exact" });
}

// ---------------------------------------------------------------- 9. colourMachine (1.60m, whimsical colour contraption + lid)

function buildGearCogSpec(
  pitchRadius: number,
  toothCount: number,
  depth: number
): AuraCustomGeometrySpec {
  const outer: ProceduralVec2[] = [];
  const innerHole: ProceduralVec2[] = [];
  const rootR = pitchRadius * 0.84;
  const tipR = pitchRadius * 1.12;
  const steps = toothCount * 4;
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * TAU;
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? tipR : rootR;
    outer.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * TAU;
    innerHole.push([Math.cos(a) * pitchRadius * 0.34, Math.sin(a) * pitchRadius * 0.34]);
  }
  return extrudeContourSpec({
    outer,
    holes: [innerHole],
    depth,
    bevelSegments: 0,
    creaseAngle: 0.7
  });
}

function buildColourMachineRig(): ProceduralAssetRig {
  const enamelParts: LobePartInput[] = [];
  const woodParts: LobePartInput[] = [];
  const brassParts: LobePartInput[] = [];
  const glassParts: LobePartInput[] = [];
  const dialParts: LobePartInput[] = [];

  // Turned maple bun feet + chamfered maple plinth & front arcade button ledge (`woodGrainPlank`)
  const bunFoot = cylinderSpec(0.048, 0.036, 0.052, 12, 0);
  for (const fx of [-0.28, 0.28] as const) {
    for (const fz of [-0.18, 0.18] as const) {
      woodParts.push(part(bunFoot, "#C68C58", { position: [fx, 0.026, fz] }));
    }
  }
  woodParts.push(
    part(chamferBeamSpec(0.74, 0.055, 0.5, 0.012, 0), "#D9A16B", { position: [0, 0.085, 0] }),
    // Angled maple arcade-button console ledge on +Z
    part(chamferBeamSpec(0.58, 0.065, 0.16, 0.012, 0), "#E3AF7B", {
      position: [0, 0.38, 0.22],
      rotation: [0.32, 0, 0]
    })
  );

  // Rounded pastel lavender-enamel (`#C7B3F2`) cabinet + cream control fascia + front output chute (`+Z`)
  enamelParts.push(
    part(roundedBoxSpec(0.68, 0.58, 0.44, 0.075, 1), "#C7B3F2", { position: [0, 0.39, -0.01] }),
    part(chamferBeamSpec(0.52, 0.22, 0.025, 0.018, 0), "#FAF5FF", { position: [0, 0.54, 0.212] }),
    // Output chute hood & sky-blue catch tray at +Z bottom (`z = +0.27`)
    part(chamferBeamSpec(0.24, 0.11, 0.16, 0.018, 0), "#A9D4F2", {
      position: [0, 0.18, 0.24],
      rotation: [0.22, 0, 0]
    }),
    part(roundedBoxSpec(0.28, 0.055, 0.18, 0.018, 1), "#8FC4EB", { position: [0, 0.115, 0.28] })
  );

  // Flared 36-segment rainbow-banded top hopper funnel (`z = -0.01`, `y = 0.67..0.88`)!
  const rainbowBands: readonly (readonly [number, number, number, number, string])[] = [
    [0.67, 0.725, 0.085, 0.112, "#7FB8F0"],
    [0.722, 0.775, 0.11, 0.138, "#7ED6AE"],
    [0.772, 0.828, 0.136, 0.164, "#FFD55A"],
    [0.825, 0.88, 0.162, 0.185, "#F7A8C4"]
  ];
  for (const [y0, y1, r0, r1, col] of rainbowBands) {
    const bandGeo = cylinderSpec(r1, r0, y1 - y0, 36, 0);
    enamelParts.push(part(bandGeo, col, { position: [0, (y0 + y1) * 0.5, -0.01] }));
  }

  // 3 chunky primary-colour arcade buttons (`#E4574B`, `#F2C94C`, `#3F7FD9`) on the +Z console ledge
  const buttonCap = smoothOrbSpec(0.046, 10, 5);
  const buttonBezel = cylinderSpec(0.054, 0.058, 0.024, 12, 0);
  const buttonSpecs: readonly (readonly [number, string])[] = [
    [-0.17, "#E4574B"],
    [0, "#F2C94C"],
    [0.17, "#3F7FD9"]
  ];
  for (const [bx, bCol] of buttonSpecs) {
    brassParts.push(
      part(buttonBezel, "#E6BA3C", {
        position: [bx, 0.412, 0.242],
        rotation: [0.32, 0, 0]
      })
    );
    enamelParts.push(
      part(buttonCap, bCol, {
        position: [bx, 0.425, 0.25],
        rotation: [0.32, 0, 0],
        scale: [1, 0.62, 1]
      })
    );
  }

  // Curved `glassCoat` mixing dome + helical spiral colour-swirl tube!
  const spiralPts: ProceduralVec3[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const u = i / 14;
    const ang = u * TAU * 1.35;
    spiralPts.push([
      -0.37 + Math.cos(ang) * 0.045,
      0.62 - u * 0.34,
      0.02 + Math.sin(ang) * 0.085
    ]);
  }
  glassParts.push(
    part(smoothOrbSpec(0.115, 12, 6), "#D6EEFF", {
      position: [-0.15, 0.55, 0.2],
      scale: [0.95, 1.05, 0.65]
    }),
    part(sculptCurvedLimb(spiralPts, 0.026, { steps: 9, radialSegments: 7 }), "#C8E8FF")
  );

  // `clockAndGaugeDial` circular pressure gauge on upper +Z front fascia (`x = +0.13, y = 0.55, z = 0.226`)
  dialParts.push(
    part(dialDiscSpec(0.072, 0.016, 24), "#FFFFFF", { position: [0.13, 0.55, 0.224] })
  );

  // Toothed brass gears, curved side pipe, gauge bezel, crank lever & output nozzle rim
  const bigGear = buildGearCogSpec(0.105, 10, 0.026);
  const smallGear = buildGearCogSpec(0.068, 8, 0.026);
  const copperPipe = sculptCurvedLimb(
    [
      [0.14, 0.72, -0.01],
      [0.37, 0.68, 0],
      [0.39, 0.42, 0.05],
      [0.33, 0.22, 0.14]
    ],
    0.026,
    { steps: 7, radialSegments: 7 }
  );
  brassParts.push(
    part(ringBezelSpec(0.086, 0.068, 0.026, 24), "#F2C94C", { position: [0.13, 0.55, 0.23] }),
    part(bigGear, "#E8BC3E", { position: [0.355, 0.46, -0.04], rotation: [0, HALF_PI, 0] }),
    part(smallGear, "#D6A32C", { position: [0.355, 0.31, 0.05], rotation: [0, HALF_PI, 0.2] }),
    part(copperPipe, "#E4A853"),
    part(cylinderSpec(0.192, 0.184, 0.022, 36, 0), "#F2C94C", { position: [0, 0.88, -0.01] }),
    part(chamferBeamSpec(0.26, 0.024, 0.028, 0.005, 0), "#F2C94C", { position: [0, 0.15, 0.368] })
  );

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [
    composeLobe({
      suffix: "enamelChassis",
      craft: "lacquer",
      parts: enamelParts
    }),
    composeLobe({
      suffix: "mapleBase",
      craft: "wood",
      craftTexture: "woodGrainPlank",
      parts: woodParts
    }),
    composeLobe({
      suffix: "brassWorks",
      craft: "carPaint",
      parts: brassParts
    }),
    composeLobe({
      suffix: "mixingGlass",
      craft: "glassCoat",
      baseColor: "#D6EEFF",
      parts: glassParts
    }),
    composeLobe({
      suffix: "pressureDial",
      craft: "ceramic",
      craftTexture: "clockAndGaugeDial",
      parts: dialParts
    })
  ]);

  // Rear-hinged top hopper `lid` (`anchor: [0, 0.88, -0.14]`):
  // Spans z around -0.01 (`dz > 0` from hinge -0.14) so `Rx(-1.45)` flips it cleanly UPWARD & open!
  const lidAnchor: Vec3 = [0, 0.88, -0.14];
  const lidDome = sculptOrganicLathe(
    [
      [0, 0.882],
      [0.188, 0.882],
      [0.132, 0.944],
      [0, 0.966]
    ],
    { segments: 36, creaseAngle: 1.15 }
  );
  const lidPart = makeSubPartRig("lid", lidAnchor, [
    composeLobe({
      suffix: "lidEnamel",
      craft: "lacquer",
      hinge: lidAnchor,
      parts: [
        part(lidDome, "#F7B8D2", { position: [0, 0, -0.01] }),
        part(cylinderSpec(0.192, 0.192, 0.018, 24, 0), "#FAF3EA", { position: [0, 0.89, -0.01] })
      ]
    }),
    composeLobe({
      suffix: "lidKnob",
      craft: "carPaint",
      hinge: lidAnchor,
      parts: [
        part(cylinderSpec(0.014, 0.018, 0.024, 10, 0), "#E5B73B", { position: [0, 0.974, -0.01] }),
        part(smoothOrbSpec(0.026, 8, 4), "#FFE074", { position: [0, 0.996, -0.01] }),
        part(cylinderSpec(0.014, 0.014, 0.07, 8, 0), "#E5B73B", {
          position: [0, 0.885, -0.14],
          rotation: [0, 0, HALF_PI]
        })
      ]
    })
  ]);

  return finalizeProceduralRig("colourMachine", [bodyPart, lidPart]);
}

// ---------------------------------------------------------------- exported registry

export const VEHICLE_ARCHITECTURE_RIGS: Readonly<Record<VehicleArchitectureAssetKey, ProceduralAssetRig>> = {
  gogoCarriage: buildGogoCarriageRig(),
  car: buildCarRig(),
  barn: buildBarnRig(),
  station: buildStationRig(),
  tunnel: buildTunnelRig(),
  house: buildHouseRig(),
  door: buildDoorRig(),
  lift: buildLiftRig(),
  colourMachine: buildColourMachineRig()
};
