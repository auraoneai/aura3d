// Group 4 procedural 3D rigs: Music, Furniture, Containers & Nature (19 StageAssetKeys).
// Built 100% natively on @aura3d/engine/procedural and ./rig-kit.js.
// Zero network fetches, zero clocks, zero non-deterministic RNG, zero logging, and zero unsafe casts.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import {
  composeGeometry,
  latheGeometry,
  type ProceduralVec2,
  type ProceduralVec3
} from "@aura3d/engine/procedural";
import type { Vec3 } from "../motion.js";
import {
  bezierProfilePoints,
  composeLobe,
  coneSpec,
  cylinderSpec,
  ensureOutwardNormals,
  extrudeContourSpec,
  finalizeProceduralRig,
  makeSubPartRig,
  part,
  roundedBoxSpec,
  sculptCurvedLimb,
  sculptFbmOrganicPuffs,
  sculptOrganicLathe,
  torusSpec,
  type LobePartInput,
  type OrganicPuffItem,
  type ProceduralAssetRig
} from "./rig-kit.js";

export type MusicFurnitureNatureAssetKey =
  | "drum"
  | "shaker"
  | "toyPiano"
  | "mirror"
  | "bed"
  | "sink"
  | "table"
  | "chair"
  | "cushion"
  | "bench"
  | "picnicBasket"
  | "toyBox"
  | "storyBox"
  | "tree"
  | "bush"
  | "flower"
  | "flowerBud"
  | "cloud"
  | "stompStone";

const TAU = Math.PI * 2;
const ORIGIN: Vec3 = [0, 0, 0];

// ---------------------------------------------------------------- compact smooth helper geometries

/** Smooth unit-radius sphere (`r = 1.0`) with controlled segment counts for small details & cushions. */
function unitOrbSpec(radialSegs = 16, ringSegs = 8): AuraCustomGeometrySpec {
  const profile: ProceduralVec2[] = [];
  for (let i = 0; i <= ringSegs; i += 1) {
    const a = -Math.PI * 0.5 + (i / ringSegs) * Math.PI;
    profile.push([Math.max(0, Math.cos(a)), Math.sin(a)]);
  }
  return ensureOutwardNormals(
    latheGeometry({
      profile,
      segments: radialSegs,
      creaseAngle: Math.PI
    })
  );
}

/** Smooth 2D rounded-rectangle contour in XY centered on `[cx, cy]`. */
function roundedRectRing2D(
  width: number,
  height: number,
  cornerRadius = Math.min(width, height) * 0.16,
  cx = 0,
  cy = 0,
  arcSteps = 1
): readonly ProceduralVec2[] {
  const hw = Math.max(1e-4, width * 0.5);
  const hh = Math.max(1e-4, height * 0.5);
  const r = Math.max(1e-4, Math.min(cornerRadius, hw * 0.92, hh * 0.92));
  const ix = hw - r;
  const iy = hh - r;
  const centers: readonly (readonly [number, number, number])[] = [
    [ix, iy, 0],
    [-ix, iy, Math.PI * 0.5],
    [-ix, -iy, Math.PI],
    [ix, -iy, Math.PI * 1.5]
  ];
  const pts: ProceduralVec2[] = [];
  for (const [ox, oy, a0] of centers) {
    for (let s = 0; s <= arcSteps; s += 1) {
      const a = a0 + (s / arcSteps) * (Math.PI * 0.5);
      pts.push([cx + ox + Math.cos(a) * r, cy + oy + Math.sin(a) * r]);
    }
  }
  return pts;
}

/** Chamfered / filleted rectangular bar centered at `[0, 0, 0]` with exact `[width, height, depth]` bounds. */
function chamferBarSpec(
  width: number,
  height: number,
  depth: number,
  bevel = Math.min(width, height, depth) * 0.14,
  arcSteps = 2
): AuraCustomGeometrySpec {
  const b = Math.max(1e-4, Math.min(bevel, width * 0.35, height * 0.35, depth * 0.35));
  return extrudeContourSpec({
    outer: roundedRectRing2D(width, height, b * 1.25, 0, 0, arcSteps),
    depth,
    bevelThickness: b,
    bevelSize: b * 0.85,
    bevelSegments: 1,
    creaseAngle: 0.95
  });
}

/** Compact 12-edge chamfered rectangular prism (28 tris) for crisp keys, pedals & trim bars. */
function bevelPrismSpec(
  width: number,
  height: number,
  depth: number,
  bevel = Math.min(width, height, depth) * 0.16
): AuraCustomGeometrySpec {
  const hw = Math.max(1e-4, width * 0.5);
  const hh = Math.max(1e-4, height * 0.5);
  const b = Math.max(1e-4, Math.min(bevel, width * 0.35, height * 0.35, depth * 0.35));
  return extrudeContourSpec({
    outer: [
      [hw, hh],
      [-hw, hh],
      [-hw, -hh],
      [hw, -hh]
    ],
    depth,
    bevelThickness: b,
    bevelSize: b * 0.85,
    bevelSegments: 1,
    creaseAngle: 0.85
  });
}

/** Regular 2D circle contour in XY centered on `[cx, cy]`. */
function circleRing2D(cx: number, cy: number, radius: number, segs = 36): readonly ProceduralVec2[] {
  const out: ProceduralVec2[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * TAU;
    out.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return out;
}

/** Soft 5-point storybook star contour in XY centered on `[cx, cy]`. */
function starRing2D(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5
): readonly ProceduralVec2[] {
  const out: ProceduralVec2[] = [];
  const total = points * 2;
  for (let i = 0; i < total; i += 1) {
    const a = (i / total) * TAU + Math.PI * 0.5;
    const r = i % 2 === 0 ? outerR : innerR;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Turned wooden furniture leg / spindle centered on Y (`[-height/2, +height/2]`). */
function turnedSpindleSpec(
  height: number,
  footR: number,
  waistR: number,
  neckR: number,
  radialSegs = 18
): AuraCustomGeometrySpec {
  const hh = height * 0.5;
  const profile: readonly ProceduralVec2[] = [
    [0, -hh],
    [footR * 0.78, -hh],
    [footR, -hh + height * 0.06],
    [waistR * 1.18, -hh + height * 0.24],
    [waistR, 0],
    [neckR * 1.14, hh - height * 0.22],
    [neckR, hh - height * 0.05],
    [0, hh]
  ];
  return sculptOrganicLathe(profile, { segments: radialSegs });
}

// ---------------------------------------------------------------- 1. drum (0.60 m)

function buildDrumRig(): ProceduralAssetRig {
  // Turned crimson-red lacquered shell with subtle central swell
  const shellProfile = bezierProfilePoints(
    [0.455, 0.07],
    [
      { cp1: [0.478, 0.28], cp2: [0.478, 0.72], to: [0.455, 0.93] }
    ],
    4
  );
  const shellGeo = sculptOrganicLathe(shellProfile, { segments: 22 });
  const centerBandGeo = cylinderSpec(0.474, 0.474, 0.055, 20, 0);

  // Turned maple counter-hoops (hollow rings around top & bottom drumheads)
  const hoopRingProfile: readonly ProceduralVec2[] = [
    [0.442, -0.055],
    [0.508, -0.055],
    [0.512, 0.0],
    [0.508, 0.055],
    [0.442, 0.055],
    [0.442, -0.055]
  ];
  const hoopGeo = latheGeometry({ profile: hoopRingProfile, segments: 22, creaseAngle: 1.15 });

  // Cream vellum top & bottom drumheads spanning exact [0..1]
  const topVellumGeo = cylinderSpec(0.452, 0.458, 0.044, 20, 0);
  const botVellumGeo = cylinderSpec(0.458, 0.452, 0.044, 20, 0);

  const vellumAndCords: LobePartInput[] = [
    part(topVellumGeo, "#FAF2E1", { position: [0, 0.978, 0] }),
    part(botVellumGeo, "#F6ECDA", { position: [0, 0.022, 0] })
  ];

  const brassParts: LobePartInput[] = [];
  const rodGeo = cylinderSpec(0.013, 0.013, 0.78, 6, 0);
  const lugCollarGeo = cylinderSpec(0.026, 0.026, 0.065, 6, 0);
  const lugCount = 8;

  for (let i = 0; i < lugCount; i += 1) {
    const a0 = (i / lugCount) * TAU;
    const a1 = ((i + 0.5) / lugCount) * TAU;
    const rLug = 0.514;
    const lx = Math.sin(a0) * rLug;
    const lz = Math.cos(a0) * rLug;
    brassParts.push(
      part(rodGeo, "#F2C94C", {
        position: [lx, 0.5, lz],
        subShapes: 1
      })
    );
    if (i % 2 === 0) {
      brassParts.push(
        part(lugCollarGeo, "#E5B53A", {
          position: [lx, 0.89, lz],
          subShapes: 1
        }),
        part(lugCollarGeo, "#E5B53A", {
          position: [lx, 0.11, lz],
          subShapes: 1
        })
      );
    }

    // Diagonal V-pattern cotton cord segment between top lug i and bottom midpoint i+0.5
    const rCord = 0.492;
    const pTop: ProceduralVec3 = [Math.sin(a0) * rCord, 0.88, Math.cos(a0) * rCord];
    const pMid: ProceduralVec3 = [
      Math.sin((a0 + a1) * 0.5) * (rCord + 0.008),
      0.5,
      Math.cos((a0 + a1) * 0.5) * (rCord + 0.008)
    ];
    const pBot: ProceduralVec3 = [Math.sin(a1) * rCord, 0.12, Math.cos(a1) * rCord];
    const cordGeo = sculptCurvedLimb([pTop, pMid, pBot], 0.013, {
      steps: 4,
      radialSegments: 5
    });
    vellumAndCords.push(part(cordGeo, "#FFF8EC"));
  }

  // Front +Z brass air-vent badge grommet so +Z front reads crisply
  const badgeGeo = cylinderSpec(0.055, 0.055, 0.024, 12, 0);
  brassParts.push(
    part(badgeGeo, "#FFD55A", {
      position: [0, 0.5, 0.478],
      rotation: [Math.PI * 0.5, 0, 0]
    })
  );

  const lacquerLobe = composeLobe({
    suffix: "shell",
    craft: "lacquer",
    parts: [
      part(shellGeo, "#E45245"),
      part(centerBandGeo, "#FFF5E4", { position: [0, 0.5, 0] })
    ]
  });
  const woodLobe = composeLobe({
    suffix: "hoops",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(hoopGeo, "#DBA66C", { position: [0, 0.945, 0] }),
      part(hoopGeo, "#D39B60", { position: [0, 0.055, 0] })
    ]
  });
  const vellumLobe = composeLobe({
    suffix: "vellum",
    craft: "felt",
    parts: vellumAndCords
  });
  const brassLobe = composeLobe({
    suffix: "brass",
    craft: "brushedMetal",
    parts: brassParts
  });

  return finalizeProceduralRig("drum", [
    makeSubPartRig("body", ORIGIN, [lacquerLobe, woodLobe, vellumLobe, brassLobe])
  ]);
}

// ---------------------------------------------------------------- 2. shaker (0.35 m)

function buildShakerRig(): ProceduralAssetRig {
  // Turned ergonomic maple handle (y: 0..0.44)
  const handleProfile = bezierProfilePoints(
    [0, 0.0],
    [
      { cp1: [0.075, 0.01], cp2: [0.088, 0.06], to: [0.062, 0.16] },
      { cp1: [0.05, 0.25], cp2: [0.068, 0.38], to: [0.078, 0.445] },
      { cp1: [0.035, 0.45], cp2: [0.01, 0.45], to: [0, 0.45] }
    ],
    4
  );
  const handleGeo = sculptOrganicLathe(handleProfile, { segments: 18 });

  // Turned tangerine maraca gourd (y: 0.42..1.00)
  const gourdProfile = bezierProfilePoints(
    [0, 0.42],
    [
      { cp1: [0.09, 0.43], cp2: [0.22, 0.5], to: [0.268, 0.68] },
      { cp1: [0.285, 0.8], cp2: [0.165, 0.96], to: [0.035, 0.994] },
      { cp1: [0.018, 1.0], cp2: [0.006, 1.0], to: [0, 1.0] }
    ],
    4
  );
  const gourdGeo = sculptOrganicLathe(gourdProfile, { segments: 24 });

  // Festive mint & warm cream painted equatorial bands + 6 bead dots
  const mintBandGeo = cylinderSpec(0.268, 0.272, 0.078, 22, 0);
  const creamBandGeo = cylinderSpec(0.276, 0.276, 0.036, 22, 0);
  const ferruleGeo = cylinderSpec(0.088, 0.084, 0.042, 16, 0);
  const beadOrb = unitOrbSpec(7, 4);

  const ceramicParts: LobePartInput[] = [
    part(mintBandGeo, "#76DAB2", { position: [0, 0.695, 0] }),
    part(creamBandGeo, "#FFF8EC", { position: [0, 0.695, 0] })
  ];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    const r = 0.274;
    const dotColor = i === 0 ? "#FFD24A" : i % 2 === 0 ? "#FFF9EE" : "#FF6F8E";
    const s = i === 0 ? 0.032 : 0.024;
    ceramicParts.push(
      part(beadOrb, dotColor, {
        position: [Math.sin(a) * r, 0.695, Math.cos(a) * r],
        scale: [s, s, s * 0.65]
      })
    );
  }

  const gourdLobe = composeLobe({
    suffix: "gourd",
    craft: "lacquer",
    parts: [
      part(gourdGeo, "#FF9436"),
      part(beadOrb, "#FFE37A", { position: [0, 0.975, 0], scale: [0.042, 0.026, 0.042] })
    ]
  });
  const woodLobe = composeLobe({
    suffix: "handle",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(handleGeo, "#DDA86E"),
      part(cylinderSpec(0.072, 0.078, 0.05, 14, 0), "#C98E54", { position: [0, 0.08, 0] })
    ]
  });
  const ceramicLobe = composeLobe({
    suffix: "band",
    craft: "ceramic",
    parts: ceramicParts
  });
  const brassLobe = composeLobe({
    suffix: "ferrule",
    craft: "brushedMetal",
    parts: [part(ferruleGeo, "#F2C94C", { position: [0, 0.435, 0] })]
  });

  return finalizeProceduralRig("shaker", [
    makeSubPartRig("body", ORIGIN, [gourdLobe, woodLobe, ceramicLobe, brassLobe])
  ]);
}

// ---------------------------------------------------------------- 3. toyPiano (0.60 m)

function buildToyPianoRig(): ProceduralAssetRig {
  // Sculpted S-curved side cheek contour (in XY where X -> Z depth, Y -> Y height, then rotated to YZ)
  const cheekContour: readonly ProceduralVec2[] = [
    [-0.38, 0.0],
    [-0.22, 0.0],
    [-0.18, 0.38],
    [0.24, 0.42],
    [0.39, 0.44],
    [0.39, 0.55],
    [0.14, 0.58],
    [0.06, 0.88],
    [-0.36, 0.9],
    [-0.38, 0.72]
  ];
  const rawCheekGeo = extrudeContourSpec({
    outer: cheekContour,
    depth: 0.075,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 1,
    creaseAngle: 0.9
  });
  // Rotate XY -> ZY (`ry = PI/2` sends +X -> -Z? Let's check: with `rotation: [0, -Math.PI * 0.5, 0]`, +X -> +Z!)
  const cheekSideGeo = composeGeometry([
    {
      geometry: rawCheekGeo,
      rotation: [0, -Math.PI * 0.5, 0]
    }
  ]);

  const upperCabinetGeo = roundedBoxSpec(1.26, 0.44, 0.42, 0.032, 2);
  const topHoodGeo = chamferBarSpec(1.38, 0.065, 0.46, 0.022, 1);
  const keybedGeo = chamferBarSpec(1.36, 0.085, 0.36, 0.02, 1);
  const lowerKneeGeo = chamferBarSpec(1.24, 0.34, 0.12, 0.018, 1);
  const pedalPlinthGeo = chamferBarSpec(0.46, 0.09, 0.24, 0.016, 1);
  const frontLegGeo = turnedSpindleSpec(0.44, 0.044, 0.034, 0.048, 8);
  const musicDeskGeo = chamferBarSpec(0.68, 0.14, 0.026, 0.008, 1);

  const woodParts: LobePartInput[] = [
    part(cheekSideGeo, "#F5ACC4", { position: [-0.65, 0, 0] }),
    part(cheekSideGeo, "#F5ACC4", { position: [0.65, 0, 0] }),
    part(upperCabinetGeo, "#F7B6CB", { position: [0, 0.66, -0.16] }),
    part(topHoodGeo, "#F9C2D4", { position: [0, 0.885, -0.15] }),
    part(keybedGeo, "#F4A4BE", { position: [0, 0.465, 0.21] }),
    part(lowerKneeGeo, "#EFA0BA", { position: [0, 0.24, -0.26] }),
    part(pedalPlinthGeo, "#E5B480", { position: [0, 0.045, -0.14] }),
    part(frontLegGeo, "#E5B480", { position: [-0.56, 0.22, 0.31] }),
    part(frontLegGeo, "#E5B480", { position: [0.56, 0.22, 0.31] }),
    part(musicDeskGeo, "#E7B987", {
      position: [0, 0.935, 0.02],
      rotation: [-0.26, 0, 0]
    })
  ];

  // 7 beveled ivory white keys + 5 raised ebony black keys on +Z keyboard ledge
  const whiteKeyGeo = bevelPrismSpec(0.148, 0.046, 0.24, 0.008);
  const blackKeyGeo = bevelPrismSpec(0.086, 0.048, 0.145, 0.007);
  const sheetCardGeo = bevelPrismSpec(0.54, 0.125, 0.016, 0.004);
  const notePipGeo = unitOrbSpec(6, 4);

  const lacquerParts: LobePartInput[] = [];
  for (let k = 0; k < 7; k += 1) {
    const kx = (k - 3) * 0.164;
    lacquerParts.push(
      part(whiteKeyGeo, "#FFFDF7", {
        position: [kx, 0.525, 0.245]
      })
    );
  }
  const blackSlots: readonly number[] = [-2.5, -1.5, 0.5, 1.5, 2.5];
  for (const slot of blackSlots) {
    lacquerParts.push(
      part(blackKeyGeo, "#2A2433", {
        position: [slot * 0.164, 0.562, 0.19]
      })
    );
  }
  lacquerParts.push(
    part(sheetCardGeo, "#FFFDF9", {
      position: [0, 0.942, 0.038],
      rotation: [-0.26, 0, 0]
    }),
    part(notePipGeo, "#FF7390", { position: [-0.14, 0.948, 0.048], scale: [0.026, 0.022, 0.012] }),
    part(notePipGeo, "#52BDF6", { position: [0, 0.962, 0.044], scale: [0.026, 0.022, 0.012] }),
    part(notePipGeo, "#FFB838", { position: [0.14, 0.938, 0.051], scale: [0.026, 0.022, 0.012] })
  );

  // 2 brass pedals at base + brass name-rail above keyboard
  const pedalGeo = bevelPrismSpec(0.068, 0.028, 0.14, 0.007);
  const nameRailGeo = bevelPrismSpec(1.22, 0.024, 0.024, 0.005);
  const brassParts: LobePartInput[] = [
    part(pedalGeo, "#F2C94C", { position: [-0.095, 0.055, -0.02], rotation: [0.16, 0, 0] }),
    part(pedalGeo, "#F2C94C", { position: [0.095, 0.055, -0.02], rotation: [0.16, 0, 0] }),
    part(nameRailGeo, "#F2C94C", { position: [0, 0.555, 0.105] })
  ];

  const woodLobe = composeLobe({
    suffix: "cabinet",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: woodParts
  });
  const lacquerLobe = composeLobe({
    suffix: "keys",
    craft: "lacquer",
    parts: lacquerParts
  });
  const brassLobe = composeLobe({
    suffix: "pedals",
    craft: "brushedMetal",
    parts: brassParts
  });

  return finalizeProceduralRig("toyPiano", [
    makeSubPartRig("body", ORIGIN, [woodLobe, lacquerLobe, brassLobe])
  ]);
}

// ---------------------------------------------------------------- 4. mirror (0.60 m, fitMode: "exact")
// CRITICAL E01 REFLECTION CLIPPING CONTRACT:
// stage.ts clips reflections to `centerY = 0.627 * h, frontZ = 0.03 * h, radius = 0.305 * h`.
// Glass disc sits centered at `[0, 0.627, 0.015]` with front face strictly at `z = +0.03`
// and clear aperture radius `0.318` (`>= 0.315 >= 0.305`), inside a scalloped frame reaching `y = 1.0`.

function buildMirrorRig(): ProceduralAssetRig {
  const centerY = 0.627;

  // Planar-UV concentric looking-glass disc facing +Z (exact [0, 0, 1] front normals at z = +0.015 local -> +0.030 world, r = 0.32)
  const glassDiscGeo = ((): AuraCustomGeometrySpec => {
    const segs = 28;
    const rings: readonly number[] = [0.11, 0.22, 0.32];
    const hz = 0.015;
    const invSpan = 1 / 0.64;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Front face (+Z)
    positions.push(0, 0, hz);
    normals.push(0, 0, 1);
    uvs.push(0.5, 0.5);
    for (const r of rings) {
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * TAU;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        positions.push(x, y, hz);
        normals.push(0, 0, 1);
        uvs.push(x * invSpan + 0.5, y * invSpan + 0.5);
      }
    }
    for (let i = 0; i < segs; i += 1) {
      const ni = (i + 1) % segs;
      indices.push(0, 1 + i, 1 + ni);
    }
    for (let ri = 0; ri < rings.length - 1; ri += 1) {
      const r0 = 1 + ri * segs;
      const r1 = 1 + (ri + 1) * segs;
      for (let i = 0; i < segs; i += 1) {
        const ni = (i + 1) % segs;
        indices.push(r0 + i, r1 + i, r1 + ni, r0 + i, r1 + ni, r0 + ni);
      }
    }

    // Back face (-Z)
    const backCenter = positions.length / 3;
    positions.push(0, 0, -hz);
    normals.push(0, 0, -1);
    uvs.push(0.5, 0.5);
    for (const r of rings) {
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * TAU;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        positions.push(x, y, -hz);
        normals.push(0, 0, -1);
        uvs.push(0.5 - x * invSpan, y * invSpan + 0.5);
      }
    }
    for (let i = 0; i < segs; i += 1) {
      const ni = (i + 1) % segs;
      indices.push(backCenter, backCenter + 1 + ni, backCenter + 1 + i);
    }
    for (let ri = 0; ri < rings.length - 1; ri += 1) {
      const r0 = backCenter + 1 + ri * segs;
      const r1 = backCenter + 1 + (ri + 1) * segs;
      for (let i = 0; i < segs; i += 1) {
        const ni = (i + 1) % segs;
        indices.push(r0 + i, r1 + ni, r1 + i, r0 + i, r0 + ni, r1 + ni);
      }
    }

    // Outer rim band (r = 0.32)
    const rimBase = positions.length / 3;
    const rMax = rings[rings.length - 1] ?? 0.32;
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const u = i / segs;
      positions.push(ca * rMax, sa * rMax, hz, ca * rMax, sa * rMax, -hz);
      normals.push(ca, sa, 0, ca, sa, 0);
      uvs.push(u, 1, u, 0);
    }
    for (let i = 0; i < segs; i += 1) {
      const ni = (i + 1) % segs;
      const f0 = rimBase + i * 2;
      const b0 = f0 + 1;
      const f1 = rimBase + ni * 2;
      const b1 = f1 + 1;
      indices.push(f0, b0, b1, f0, b1, f1);
    }

    return {
      kind: "aura-custom-geometry",
      positions: Float32Array.from(positions),
      normals: Float32Array.from(normals),
      uvs: Float32Array.from(uvs),
      indices: Uint16Array.from(indices)
    };
  })();

  // Scalloped circular frame centered on [0, 0.627, 0] with clear inner aperture r = 0.318
  // and top crown scallop reaching exact y = 1.000 (0.627 + 0.373 = 1.000).
  const frameOuter: ProceduralVec2[] = [];
  const frameSegs = 36;
  for (let i = 0; i < frameSegs; i += 1) {
    const a = (i / frameSegs) * TAU;
    const scallop = 0.01 * Math.cos(12 * a);
    const crownLift = Math.sin(a) > 0.75 ? Math.pow((Math.sin(a) - 0.75) / 0.25, 1.5) * 0.008 : 0;
    const r = 0.355 + scallop + crownLift;
    frameOuter.push([Math.cos(a) * r, centerY + Math.sin(a) * r]);
  }
  const frameHole = circleRing2D(0, centerY, 0.318, 28);
  const scallopedFrameGeo = extrudeContourSpec({
    outer: frameOuter,
    holes: [frameHole],
    depth: 0.052,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1,
    creaseAngle: 0.9
  });

  // Top crest finial reaching exact y = 1.000 (behind z = +0.025, well outside r = 0.34)
  const crestOrb = unitOrbSpec(8, 4);

  // Rear maple backing plate behind the mirror glass (z in [-0.032, -0.006])
  const backingPlateGeo = composeGeometry([
    {
      geometry: cylinderSpec(0.342, 0.342, 0.024, 24, 0),
      rotation: [Math.PI * 0.5, 0, 0]
    }
  ]);

  // Turned maple & pastel-rose trestle stand (y = 0.000 .. 0.315, keeping clear of aperture)
  const basePlinthGeo = chamferBarSpec(0.56, 0.044, 0.24, 0.012);
  const footPadGeo = chamferBarSpec(0.14, 0.032, 0.28, 0.01);
  const centerStemGeo = turnedSpindleSpec(0.24, 0.056, 0.038, 0.05, 12);

  // Curved side yoke arms rising seamlessly from the central stem outside the frame up to swivel pins at y = 0.627
  const leftYokeGeo = sculptCurvedLimb(
    [
      [0, 0.235, 0],
      [-0.34, 0.3, 0],
      [-0.405, 0.46, 0],
      [-0.395, centerY, 0]
    ],
    0.022,
    { steps: 7, radialSegments: 7 }
  );
  const rightYokeGeo = sculptCurvedLimb(
    [
      [0, 0.235, 0],
      [0.34, 0.3, 0],
      [0.405, 0.46, 0],
      [0.395, centerY, 0]
    ],
    0.022,
    { steps: 7, radialSegments: 7 }
  );

  const woodLobe = composeLobe({
    suffix: "frameStand",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(scallopedFrameGeo, "#F5AAC3", { position: [0, 0, 0.002] }),
      part(backingPlateGeo, "#DDA86E", { position: [0, centerY, -0.018] }),
      part(footPadGeo, "#D8A165", { position: [-0.21, 0.016, 0] }),
      part(footPadGeo, "#D8A165", { position: [0.21, 0.016, 0] }),
      part(basePlinthGeo, "#F4A9C2", { position: [0, 0.038, 0] }),
      part(centerStemGeo, "#DDA86E", { position: [0, 0.165, 0] }),
      part(leftYokeGeo, "#DDA86E"),
      part(rightYokeGeo, "#DDA86E")
    ]
  });

  const glassLobe = composeLobe({
    suffix: "mirrorDisc",
    craft: "ceramic",
    parts: [part(glassDiscGeo, "#DCEBF9", { position: [0, centerY, 0.015] })]
  });

  const ceramicLobe = composeLobe({
    suffix: "finials",
    craft: "ceramic",
    parts: [
      part(crestOrb, "#FFF8EE", { position: [0, 0.982, 0.004], scale: [0.042, 0.018, 0.02] }),
      part(crestOrb, "#FFE07D", { position: [-0.412, centerY, 0], scale: [0.026, 0.026, 0.026] }),
      part(crestOrb, "#FFE07D", { position: [0.412, centerY, 0], scale: [0.026, 0.026, 0.026] })
    ]
  });

  return finalizeProceduralRig(
    "mirror",
    [makeSubPartRig("body", ORIGIN, [woodLobe, glassLobe, ceramicLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 5. bed (0.70 m, fitMode: "exact", restAt: 0.62)

function buildBedRig(): ProceduralAssetRig {
  // Arched cottage headboard in YZ plane at x = -0.89 (reaching y = 0.96, corner finials reaching exact y = 1.000)
  const makeArchBoard = (boardH: number, archDrop: number): AuraCustomGeometrySpec => {
    const hz = 0.54;
    const contour: ProceduralVec2[] = [
      [-hz, 0],
      [hz, 0],
      [hz, boardH - archDrop]
    ];
    for (let i = 1; i < 10; i += 1) {
      const u = i / 10;
      const z = hz - u * hz * 2;
      const y = boardH - archDrop + Math.sin(u * Math.PI) * archDrop;
      contour.push([z, y]);
    }
    contour.push([-hz, boardH - archDrop]);
    const extruded = extrudeContourSpec({
      outer: contour,
      depth: 0.068,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 1,
      creaseAngle: 0.9
    });
    return composeGeometry([
      {
        geometry: extruded,
        rotation: [0, Math.PI * 0.5, 0]
      }
    ]);
  };

  const headBoardGeo = makeArchBoard(0.76, 0.14);
  const footBoardGeo = makeArchBoard(0.46, 0.08);
  const headPostGeo = cylinderSpec(0.044, 0.048, 0.93, 12, 0);
  const footPostGeo = cylinderSpec(0.044, 0.048, 0.62, 12, 0);
  const sideRailGeo = chamferBarSpec(1.76, 0.15, 0.06, 0.014);
  const finialOrb = unitOrbSpec(8, 4);

  // Cream mattress base (y: 0.24 .. 0.56) + plump pillow at head end (-X)
  const mattressGeo = roundedBoxSpec(1.72, 0.32, 1.08, 0.055, 2);
  const pillowGeo = roundedBoxSpec(0.38, 0.15, 0.78, 0.055, 2);

  // Sky-blue quilted blanket (`quiltedStitch` on `felt` lobe) with top sleeping surface strictly at y = 0.620!
  // Blanket spans y = 0.44 .. 0.620 (`centerY = 0.530, height = 0.180 -> maxY = 0.620`).
  const blanketGeo = roundedBoxSpec(1.36, 0.18, 1.14, 0.042, 2);
  const foldCuffGeo = chamferBarSpec(0.18, 0.182, 1.15, 0.026);

  const woodLobe = composeLobe({
    suffix: "frame",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(headBoardGeo, "#E2B37E", { position: [-0.89, 0.2, 0] }),
      part(footBoardGeo, "#E2B37E", { position: [0.89, 0.18, 0] }),
      part(headPostGeo, "#D6A36A", { position: [-0.89, 0.465, -0.55] }),
      part(headPostGeo, "#D6A36A", { position: [-0.89, 0.465, 0.55] }),
      part(footPostGeo, "#D6A36A", { position: [0.89, 0.31, -0.55] }),
      part(footPostGeo, "#D6A36A", { position: [0.89, 0.31, 0.55] }),
      part(sideRailGeo, "#DDA972", { position: [0, 0.26, -0.54] }),
      part(sideRailGeo, "#DDA972", { position: [0, 0.26, 0.54] }),
      // Turned corner finials: head finials top out at exact 0.965 + 0.035 = 1.000
      part(finialOrb, "#EBC292", { position: [-0.89, 0.965, -0.55], scale: [0.046, 0.035, 0.046] }),
      part(finialOrb, "#EBC292", { position: [-0.89, 0.965, 0.55], scale: [0.046, 0.035, 0.046] }),
      part(finialOrb, "#EBC292", { position: [0.89, 0.648, -0.55], scale: [0.044, 0.032, 0.044] }),
      part(finialOrb, "#EBC292", { position: [0.89, 0.648, 0.55], scale: [0.044, 0.032, 0.044] })
    ]
  });

  const quiltLobe = composeLobe({
    suffix: "quilt",
    craft: "felt",
    craftTexture: "quiltedStitch",
    parts: [
      part(blanketGeo, "#82BAE8", { position: [0.16, 0.53, 0] }),
      part(foldCuffGeo, "#FFF8EC", { position: [-0.46, 0.529, 0] })
    ]
  });

  const beddingClayLobe = composeLobe({
    suffix: "pillowMattress",
    craft: "clay",
    parts: [
      part(mattressGeo, "#FFFDF6", { position: [0, 0.4, 0] }),
      part(pillowGeo, "#FFFDF9", { position: [-0.66, 0.635, 0], rotation: [0, 0, -0.12] })
    ]
  });

  return finalizeProceduralRig(
    "bed",
    [makeSubPartRig("body", ORIGIN, [woodLobe, quiltLobe, beddingClayLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 6. sink (0.90 m)

function buildSinkRig(): ProceduralAssetRig {
  // Fluted/waisted porcelain pedestal column (y: 0.00 .. 0.66)
  const pedestalProfile: readonly ProceduralVec2[] = [
    [0, 0.0],
    [0.21, 0.0],
    [0.22, 0.045],
    [0.185, 0.09],
    [0.132, 0.18],
    [0.112, 0.38],
    [0.135, 0.56],
    [0.19, 0.64],
    [0, 0.66]
  ];
  const pedestalGeo = sculptOrganicLathe(pedestalProfile, { segments: 20 });

  // True concave porcelain washbasin bowl (outer mint shell + recessed white well, scaled oval in Z)
  const basinProfile: readonly ProceduralVec2[] = [
    [0, 0.62],
    [0.18, 0.63],
    [0.31, 0.68],
    [0.385, 0.76],
    [0.395, 0.815],
    [0.365, 0.835],
    [0.325, 0.825],
    [0.285, 0.735],
    [0.16, 0.69],
    [0, 0.682]
  ];
  const basinGeo = latheGeometry({ profile: basinProfile, segments: 24, creaseAngle: 1.2 });
  const backsplashGeo = chamferBarSpec(0.56, 0.11, 0.09, 0.02);
  const soapDishGeo = cylinderSpec(0.072, 0.06, 0.022, 12, 0);

  // Chrome gooseneck faucet curving up to y = 1.00 and down over the basin well
  const spoutGeo = sculptCurvedLimb(
    [
      [0, 0.82, -0.18],
      [0, 0.94, -0.18],
      [0, 0.992, -0.1],
      [0, 0.915, -0.015]
    ],
    (t) => 0.022 - 0.004 * t,
    { steps: 9, radialSegments: 8 }
  );
  const tapStemGeo = cylinderSpec(0.022, 0.026, 0.055, 8, 0);
  const tapCrossGeo = chamferBarSpec(0.078, 0.016, 0.02, 0.004);
  const drainGeo = cylinderSpec(0.036, 0.036, 0.012, 10, 0);
  const overflowGeo = cylinderSpec(0.02, 0.02, 0.012, 8, 0);
  const soapBarGeo = chamferBarSpec(0.088, 0.034, 0.058, 0.01);

  const ceramicLobe = composeLobe({
    suffix: "porcelain",
    craft: "ceramic",
    parts: [
      part(pedestalGeo, "#F5FAF8"),
      part(basinGeo, "#BCEAD8", { scale: [1, 1, 0.8] }),
      part(backsplashGeo, "#BCEAD8", { position: [0, 0.835, -0.19] }),
      part(soapDishGeo, "#FFFDF9", { position: [0.23, 0.835, -0.09] })
    ]
  });

  const chromeLobe = composeLobe({
    suffix: "faucet",
    craft: "brushedMetal",
    parts: [
      part(spoutGeo, "#E5ECF2"),
      part(tapStemGeo, "#DCE5EC", { position: [-0.15, 0.865, -0.18] }),
      part(tapStemGeo, "#DCE5EC", { position: [0.15, 0.865, -0.18] }),
      part(tapCrossGeo, "#E5ECF2", { position: [-0.15, 0.895, -0.18] }),
      part(tapCrossGeo, "#E5ECF2", { position: [0.15, 0.895, -0.18] }),
      part(drainGeo, "#CFD9E2", { position: [0, 0.686, 0.01] }),
      part(overflowGeo, "#CFD9E2", {
        position: [0, 0.775, -0.215],
        rotation: [Math.PI * 0.5, 0, 0]
      })
    ]
  });

  const soapAndPipsLobe = composeLobe({
    suffix: "soap",
    craft: "clay",
    parts: [
      part(soapBarGeo, "#FF9887", { position: [0.23, 0.858, -0.09], rotation: [0, 0.22, 0] }),
      part(unitOrbSpec(10, 5), "#FF756B", { position: [-0.15, 0.906, -0.18], scale: 0.012 }),
      part(unitOrbSpec(10, 5), "#5BB8F5", { position: [0.15, 0.906, -0.18], scale: 0.012 })
    ]
  });

  return finalizeProceduralRig("sink", [
    makeSubPartRig("body", ORIGIN, [ceramicLobe, chromeLobe, soapAndPipsLobe])
  ]);
}

// ---------------------------------------------------------------- 7. table (0.60 m, fitMode: "exact", restAt: 1.0)

function buildTableRig(): ProceduralAssetRig {
  // Flat chamfered circular honey-maple tabletop with top strictly at y = 1.000
  // (`centerY = 0.960, height = 0.080 -> maxY = 1.000`).
  const topGeo = cylinderSpec(0.81, 0.795, 0.08, 30, 0.018);

  // Scalloped circular apron ring underneath (`y: 0.84 .. 0.93`)
  const apronProfile: readonly ProceduralVec2[] = [
    [0.61, -0.045],
    [0.658, -0.045],
    [0.658, 0.045],
    [0.61, 0.045],
    [0.61, -0.045]
  ];
  const apronGeo = latheGeometry({ profile: apronProfile, segments: 24, creaseAngle: 1.1 });
  const crossRailGeo = chamferBarSpec(1.12, 0.055, 0.065, 0.012);

  // 4 splayed legs descending from [±0.42, 0.90, ±0.42] to [±0.52, 0.032, ±0.52]
  // resting on horizontal brass floor ferrules (`centerY = 0.018, height = 0.036 -> minY = 0.000`).
  const ferruleGeo = cylinderSpec(0.044, 0.04, 0.036, 10, 0);
  const cornerPinGeo = unitOrbSpec(6, 4);

  const woodParts: LobePartInput[] = [
    part(topGeo, "#E5B982", { position: [0, 0.96, 0] }),
    part(apronGeo, "#D8A76D", { position: [0, 0.885, 0] }),
    part(crossRailGeo, "#D29F65", { position: [0, 0.875, 0], rotation: [0, Math.PI * 0.25, 0] }),
    part(crossRailGeo, "#D29F65", { position: [0, 0.875, 0], rotation: [0, -Math.PI * 0.25, 0] })
  ];
  const brassParts: LobePartInput[] = [];

  const signs: readonly (readonly [-1 | 1, -1 | 1])[] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  for (const [sx, sz] of signs) {
    const legGeo = sculptCurvedLimb(
      [
        [sx * 0.42, 0.9, sz * 0.42],
        [sx * 0.47, 0.48, sz * 0.47],
        [sx * 0.52, 0.032, sz * 0.52]
      ],
      (t) => 0.058 - 0.018 * t,
      { steps: 6, radialSegments: 8 }
    );
    woodParts.push(part(legGeo, "#DAA970"));
    brassParts.push(
      part(ferruleGeo, "#F2C94C", { position: [sx * 0.52, 0.018, sz * 0.52] }),
      part(cornerPinGeo, "#F2C94C", {
        position: [sx * 0.47, 0.885, sz * 0.47],
        scale: 0.018
      })
    );
  }

  const woodLobe = composeLobe({
    suffix: "mapleTop",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: woodParts
  });
  const brassLobe = composeLobe({
    suffix: "ferrules",
    craft: "brushedMetal",
    parts: brassParts
  });

  return finalizeProceduralRig(
    "table",
    [makeSubPartRig("body", ORIGIN, [woodLobe, brassLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 8. chair (0.70 m, fitMode: "exact", restAt: 0.60)

function buildChairRig(): ProceduralAssetRig {
  // Chamfered saddle seat with flat resting top strictly at y = 0.600
  // (`centerY = 0.564, height = 0.072 -> maxY = 0.600`).
  const seatGeo = roundedBoxSpec(0.62, 0.072, 0.58, 0.022, 2);
  const seatApronGeo = chamferBarSpec(0.52, 0.05, 0.48, 0.012);
  const sideStretcherGeo = chamferBarSpec(0.034, 0.034, 0.46, 0.008);
  const crossStretcherGeo = chamferBarSpec(0.48, 0.034, 0.034, 0.008);
  const glideGeo = cylinderSpec(0.034, 0.032, 0.032, 8, 0);

  // Curved spindle backrest rising from y = 0.58 to exact y = 1.000 on -Z
  const leftStileGeo = sculptCurvedLimb(
    [
      [-0.25, 0.58, -0.23],
      [-0.26, 0.78, -0.255],
      [-0.26, 0.955, -0.275]
    ],
    0.028,
    { steps: 6, radialSegments: 7 }
  );
  const rightStileGeo = sculptCurvedLimb(
    [
      [0.25, 0.58, -0.23],
      [0.26, 0.78, -0.255],
      [0.26, 0.955, -0.275]
    ],
    0.028,
    { steps: 6, radialSegments: 7 }
  );
  // Arched crest rail peaking at exact y = 1.000 (`0.968 + 0.032 = 1.000`)
  const crestRailGeo = sculptCurvedLimb(
    [
      [-0.28, 0.94, -0.275],
      [-0.14, 0.964, -0.27],
      [0, 0.968, -0.266],
      [0.14, 0.964, -0.27],
      [0.28, 0.94, -0.275]
    ],
    0.032,
    { steps: 8, radialSegments: 7 }
  );
  const spindleGeo = cylinderSpec(0.015, 0.016, 0.36, 7, 0);

  const woodParts: LobePartInput[] = [
    part(seatGeo, "#F6B07A", { position: [0, 0.564, 0.01] }),
    part(seatApronGeo, "#E69C63", { position: [0, 0.52, 0.01] }),
    part(leftStileGeo, "#F6B07A"),
    part(rightStileGeo, "#F6B07A"),
    part(crestRailGeo, "#F8BC8C"),
    part(spindleGeo, "#ECA36B", { position: [-0.12, 0.765, -0.252], rotation: [-0.1, 0, 0] }),
    part(spindleGeo, "#ECA36B", { position: [0, 0.77, -0.25], rotation: [-0.1, 0, 0] }),
    part(spindleGeo, "#ECA36B", { position: [0.12, 0.765, -0.252], rotation: [-0.1, 0, 0] }),
    part(sideStretcherGeo, "#DF955B", { position: [-0.25, 0.21, 0.01] }),
    part(sideStretcherGeo, "#DF955B", { position: [0.25, 0.21, 0.01] }),
    part(crossStretcherGeo, "#DF955B", { position: [0, 0.21, 0.01] })
  ];

  const ceramicParts: LobePartInput[] = [
    part(unitOrbSpec(12, 6), "#FFF8EC", {
      position: [0, 0.966, -0.236],
      scale: [0.038, 0.024, 0.014]
    })
  ];

  const legSigns: readonly (readonly [-1 | 1, -1 | 1])[] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  for (const [sx, sz] of legSigns) {
    const legGeo = sculptCurvedLimb(
      [
        [sx * 0.23, 0.54, sz * 0.21 + 0.01],
        [sx * 0.25, 0.28, sz * 0.235 + 0.01],
        [sx * 0.27, 0.028, sz * 0.255 + 0.01]
      ],
      (t) => 0.034 - 0.008 * t,
      { steps: 5, radialSegments: 7 }
    );
    woodParts.push(part(legGeo, "#E59B62"));
    ceramicParts.push(
      part(glideGeo, "#FFF6E8", { position: [sx * 0.27, 0.016, sz * 0.255 + 0.01] })
    );
  }

  const woodLobe = composeLobe({
    suffix: "chairWood",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: woodParts
  });
  const ceramicLobe = composeLobe({
    suffix: "glides",
    craft: "ceramic",
    parts: ceramicParts
  });

  return finalizeProceduralRig(
    "chair",
    [makeSubPartRig("body", ORIGIN, [woodLobe, ceramicLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 9. cushion (0.25 m, fitMode: "exact", restAt: 0.90, tintTarget: true)
// Wide flat tufted floor pouf (`width = 2.2h, depth = 2.2h`, `rx = 1.05, ry = 0.45, rz = 1.05`).
// Resting shoulder ring sits at y = 0.900; central cream button-tuft pip peaks at y = 1.000.

function buildCushionRig(): ProceduralAssetRig {
  // Wide squashy tufted pouf profile from y = 0.000 up to shoulder y = 0.900, dipping into central button dimple
  const poufProfile: readonly ProceduralVec2[] = [
    [0, 0.02],
    [0.36, 0.0],
    [0.72, 0.035],
    [0.95, 0.16],
    [1.05, 0.34],
    [1.05, 0.56],
    [0.95, 0.74],
    [0.74, 0.87],
    [0.52, 0.9],
    [0.32, 0.9],
    [0.16, 0.855],
    [0, 0.81]
  ];
  const poufGeo = sculptOrganicLathe(poufProfile, {
    segments: 16,
    modulate: (theta, _v, baseR) => {
      // Soft pillowy 4-corner cushion fullness + subtle 8-seam radial tuft fluting
      const cornerFullness = 1 + 0.038 * Math.cos(4 * (theta - Math.PI * 0.25));
      const tuftPleat = 1 + 0.018 * Math.cos(8 * theta);
      const r = baseR * cornerFullness * tuftPleat;
      return { rx: r, rz: r };
    }
  });

  // Braided equatorial piping cord + central button-tuft pip peaking at exact y = 1.000 + 4 corner pom-pom tassels
  const pipingRingGeo = composeGeometry([
    {
      geometry: torusSpec(1.03, 0.044, 18, 6),
      rotation: [Math.PI * 0.5, 0, 0]
    }
  ]);
  const pomOrb = unitOrbSpec(7, 4);

  const trimParts: LobePartInput[] = [
    // Central top button-tuft pip (`0.91 + 0.09 = 1.000` exact!)
    part(pomOrb, "#FFF8EC", { position: [0, 0.91, 0], scale: [0.145, 0.09, 0.145] }),
    // Bottom center base tuft pad (`0.04 - 0.04 = 0.000`)
    part(pomOrb, "#F4E8D6", { position: [0, 0.04, 0], scale: [0.16, 0.04, 0.16] }),
    part(pipingRingGeo, "#FFF6E6", { position: [0, 0.45, 0] })
  ];

  const corners: readonly (readonly [-1 | 1, -1 | 1])[] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  for (const [sx, sz] of corners) {
    trimParts.push(
      part(pomOrb, "#EAD8BE", {
        position: [sx * 0.75, 0.45, sz * 0.75],
        scale: [0.065, 0.055, 0.065]
      }),
      part(pomOrb, "#FFF9EE", {
        position: [sx * 0.85, 0.42, sz * 0.85],
        scale: [0.105, 0.095, 0.105]
      })
    );
  }

  const poufFeltLobe = composeLobe({
    suffix: "pouf",
    craft: "felt",
    craftTexture: "quiltedStitch",
    baseColor: "#B68CE4",
    tintTarget: true,
    parts: [part(poufGeo, "#FFFFFF")]
  });

  const tasselsLobe = composeLobe({
    suffix: "tassels",
    craft: "clay",
    parts: trimParts
  });

  return finalizeProceduralRig(
    "cushion",
    [makeSubPartRig("body", ORIGIN, [poufFeltLobe, tasselsLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 10. bench (0.60 m, fitMode: "exact", restAt: 0.70)

function buildBenchRig(): ProceduralAssetRig {
  // 3 chamfered honey-maple seat planks with flat top strictly at y = 0.700
  // (`centerY = 0.672, height = 0.056 -> maxY = 0.700`).
  const seatPlankGeo = chamferBarSpec(1.94, 0.056, 0.15, 0.012);
  // 3 slatted backrest planks reaching exact y = 1.000 (`centerY = 0.972, height = 0.056 -> maxY = 1.000`)
  const backPlankGeo = chamferBarSpec(1.92, 0.056, 0.044, 0.01);

  const woodParts: LobePartInput[] = [
    part(seatPlankGeo, "#E5B880", { position: [0, 0.672, -0.14] }),
    part(seatPlankGeo, "#DFAF75", { position: [0, 0.672, 0.04] }),
    part(seatPlankGeo, "#E5B880", { position: [0, 0.672, 0.22] }),
    part(backPlankGeo, "#E5B880", { position: [0, 0.79, -0.255] }),
    part(backPlankGeo, "#DFAF75", { position: [0, 0.882, -0.27] }),
    part(backPlankGeo, "#E8BE88", { position: [0, 0.972, -0.285] })
  ];

  // Wrought-iron side frames, scrolled armrests, foot pads (`minY = 0.000`), and brass rosette bolts
  const footPadGeo = cylinderSpec(0.048, 0.044, 0.036, 10, 0);
  const stretcherBarGeo = chamferBarSpec(1.86, 0.042, 0.042, 0.009);
  const sideSeatBearerGeo = chamferBarSpec(0.055, 0.05, 0.52, 0.01);
  const rivetOrb = unitOrbSpec(7, 4);

  const metalParts: LobePartInput[] = [
    part(stretcherBarGeo, "#454E59", { position: [0, 0.24, -0.02] })
  ];

  for (const sx of [-1, 1] as const) {
    const x = sx * 0.93;
    const frontLegGeo = sculptCurvedLimb(
      [
        [x, 0.028, 0.23],
        [x, 0.36, 0.22],
        [x, 0.66, 0.21]
      ],
      0.034,
      { steps: 5, radialSegments: 7 }
    );
    const backPostGeo = sculptCurvedLimb(
      [
        [x, 0.028, -0.24],
        [x, 0.52, -0.23],
        [x, 0.97, -0.285]
      ],
      0.034,
      { steps: 6, radialSegments: 7 }
    );
    const armrestGeo = sculptCurvedLimb(
      [
        [x, 0.86, -0.255],
        [x + sx * 0.02, 0.85, 0.02],
        [x, 0.81, 0.24],
        [x, 0.67, 0.22]
      ],
      0.03,
      { steps: 7, radialSegments: 7 }
    );
    metalParts.push(
      part(frontLegGeo, "#454E59"),
      part(backPostGeo, "#454E59"),
      part(armrestGeo, "#4E5865"),
      part(sideSeatBearerGeo, "#454E59", { position: [x, 0.635, 0.02] }),
      part(footPadGeo, "#3D4550", { position: [x, 0.018, 0.23] }),
      part(footPadGeo, "#3D4550", { position: [x, 0.018, -0.24] }),
      part(rivetOrb, "#F2C94C", { position: [x, 0.78, 0.248], scale: 0.022 })
    );
  }

  const woodLobe = composeLobe({
    suffix: "slats",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: woodParts
  });
  const ironLobe = composeLobe({
    suffix: "ironFrame",
    craft: "brushedMetal",
    parts: metalParts
  });

  return finalizeProceduralRig(
    "bench",
    [makeSubPartRig("body", ORIGIN, [woodLobe, ironLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 11. picnicBasket (0.45 m, parts: body + lid, fitMode: "exact", restAt: 0.60)

function buildPicnicBasketRig(): ProceduralAssetRig {
  const lidAnchor: Vec3 = [0, 0.62, -0.34];

  // Hollow woven rattan hamper (`y: 0.000 .. 0.600` rim, interior floor top at `y = 0.14`)
  const baseFloorGeo = chamferBarSpec(1.16, 0.14, 0.78, 0.024);
  const frontBackWallGeo = chamferBarSpec(1.24, 0.48, 0.08, 0.02);
  const sideWallGeo = chamferBarSpec(0.08, 0.48, 0.74, 0.02);
  const rimBandGeo = chamferBarSpec(1.3, 0.065, 0.88, 0.018);

  // Arched woven carry handle rising cleanly to exact y = 1.000 (`0.968 + 0.032 = 1.000`)
  const handleArchGeo = sculptCurvedLimb(
    [
      [-0.58, 0.56, 0],
      [-0.52, 0.86, 0],
      [0, 0.968, 0],
      [0.52, 0.86, 0],
      [0.58, 0.56, 0]
    ],
    0.032,
    { steps: 14, radialSegments: 10 }
  );

  // Folded red-and-cream gingham cloth liner cuff around the rim (`y = 0.53 .. 0.60`)
  const ginghamFrontBackGeo = chamferBarSpec(1.33, 0.075, 0.055, 0.015);
  const ginghamSideGeo = chamferBarSpec(0.055, 0.075, 0.86, 0.015);

  const bodyWickerLobe = composeLobe({
    suffix: "hamperWicker",
    craft: "wood",
    craftTexture: "wickerWeave",
    parts: [
      part(baseFloorGeo, "#D69B52", { position: [0, 0.07, 0] }),
      part(frontBackWallGeo, "#DDA35B", { position: [0, 0.34, 0.37] }),
      part(frontBackWallGeo, "#DDA35B", { position: [0, 0.34, -0.37] }),
      part(sideWallGeo, "#D4984F", { position: [-0.58, 0.34, 0] }),
      part(sideWallGeo, "#D4984F", { position: [0.58, 0.34, 0] }),
      part(rimBandGeo, "#E5AE68", { position: [0, 0.565, 0] }),
      part(handleArchGeo, "#CE9148")
    ]
  });

  const bodyGinghamLobe = composeLobe({
    suffix: "ginghamTrim",
    craft: "felt",
    craftTexture: "ginghamCheck",
    parts: [
      part(ginghamFrontBackGeo, "#FF8A84", { position: [0, 0.565, 0.425] }),
      part(ginghamFrontBackGeo, "#FF8A84", { position: [0, 0.565, -0.425] }),
      part(ginghamSideGeo, "#FF8A84", { position: [-0.64, 0.565, 0] }),
      part(ginghamSideGeo, "#FF8A84", { position: [0.64, 0.565, 0] })
    ]
  });

  // Rear-hinged woven lid (`anchor: [0, 0.62, -0.34]`) with cognac strap & brass buckle on +Z
  const lidSlabGeo = chamferBarSpec(1.24, 0.062, 0.82, 0.018);
  const strapGeo = chamferBarSpec(0.11, 0.085, 0.04, 0.008);
  const hingeStrapGeo = chamferBarSpec(0.085, 0.045, 0.08, 0.008);
  const buckleGeo = chamferBarSpec(0.13, 0.065, 0.028, 0.006);

  const lidWickerLobe = composeLobe({
    suffix: "lidWicker",
    craft: "wood",
    craftTexture: "wickerWeave",
    hinge: lidAnchor,
    parts: [
      part(lidSlabGeo, "#E2AA63", { position: [0, 0.631, 0.01] }),
      part(strapGeo, "#8D5232", { position: [0, 0.605, 0.425] }),
      part(hingeStrapGeo, "#8D5232", { position: [-0.34, 0.625, -0.35] }),
      part(hingeStrapGeo, "#8D5232", { position: [0.34, 0.625, -0.35] })
    ]
  });

  const lidBuckleLobe = composeLobe({
    suffix: "lidBuckle",
    craft: "brushedMetal",
    hinge: lidAnchor,
    parts: [part(buckleGeo, "#F2C94C", { position: [0, 0.59, 0.44] })]
  });

  return finalizeProceduralRig(
    "picnicBasket",
    [
      makeSubPartRig("body", ORIGIN, [bodyWickerLobe, bodyGinghamLobe]),
      makeSubPartRig("lid", lidAnchor, [lidWickerLobe, lidBuckleLobe])
    ],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 12. toyBox (0.60 m, parts: body + lid, fitMode: "exact", restAt: 0.20)

function buildToyBoxRig(): ProceduralAssetRig {
  const lidAnchor: Vec3 = [0, 0.78, -0.4];

  // 4 sturdy maple corner feet (`y: 0.000 .. 0.09`) + recessed floor top strictly at `y = 0.200`
  const footGeo = chamferBarSpec(0.14, 0.09, 0.14, 0.02, 1);
  const floorPanelGeo = chamferBarSpec(1.18, 0.12, 0.8, 0.016, 1);
  // 4 dovetailed pastel-mint walls around a genuine hollow interior (`y: 0.08 .. 0.78`)
  const frontBackWallGeo = chamferBarSpec(1.24, 0.7, 0.075, 0.018, 1);
  const leftRightWallGeo = chamferBarSpec(0.075, 0.7, 0.74, 0.018, 1);
  const cornerPostGeo = chamferBarSpec(0.095, 0.72, 0.095, 0.02, 1);

  // Carved front star + fluffy cloud emblem & side handles
  const starEmblemGeo = extrudeContourSpec({
    outer: starRing2D(0, 0, 0.125, 0.062, 5),
    depth: 0.03,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 1
  });
  const cloudPuffOrb = unitOrbSpec(8, 4);
  const sideHandleGeo = sculptCurvedLimb(
    [
      [0, 0.52, -0.14],
      [0.055, 0.46, 0],
      [0, 0.52, 0.14]
    ],
    0.022,
    { steps: 6, radialSegments: 6 }
  );

  const bodyWoodLobe = composeLobe({
    suffix: "chestWalls",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(footGeo, "#DFAF76", { position: [-0.55, 0.045, -0.35] }),
      part(footGeo, "#DFAF76", { position: [0.55, 0.045, -0.35] }),
      part(footGeo, "#DFAF76", { position: [-0.55, 0.045, 0.35] }),
      part(footGeo, "#DFAF76", { position: [0.55, 0.045, 0.35] }),
      // Floor top strictly at `0.14 + 0.06 = 0.200`!
      part(floorPanelGeo, "#E7BE8A", { position: [0, 0.14, 0] }),
      part(frontBackWallGeo, "#9ADBB0", { position: [0, 0.43, 0.39] }),
      part(frontBackWallGeo, "#9ADBB0", { position: [0, 0.43, -0.39] }),
      part(leftRightWallGeo, "#8FD3A6", { position: [-0.585, 0.43, 0] }),
      part(leftRightWallGeo, "#8FD3A6", { position: [0.585, 0.43, 0] }),
      part(cornerPostGeo, "#E2B37B", { position: [-0.59, 0.43, 0.39] }),
      part(cornerPostGeo, "#E2B37B", { position: [0.59, 0.43, 0.39] }),
      part(cornerPostGeo, "#E2B37B", { position: [-0.59, 0.43, -0.39] }),
      part(cornerPostGeo, "#E2B37B", { position: [0.59, 0.43, -0.39] })
    ]
  });

  const bodyEmblemLobe = composeLobe({
    suffix: "emblemHandles",
    craft: "ceramic",
    parts: [
      part(starEmblemGeo, "#FFD559", { position: [-0.11, 0.48, 0.435] }),
      part(cloudPuffOrb, "#FFFDF9", { position: [0.14, 0.44, 0.432], scale: [0.095, 0.065, 0.026] }),
      part(cloudPuffOrb, "#FFFDF9", { position: [0.22, 0.42, 0.432], scale: [0.068, 0.05, 0.024] }),
      part(sideHandleGeo, "#F6EFE2", { position: [-0.62, 0, 0] }),
      part(sideHandleGeo, "#F6EFE2", { position: [0.62, 0, 0], rotation: [0, Math.PI, 0] })
    ]
  });

  // Rear-hinged lid (`anchor: [0, 0.78, -0.40]`) reaching exact y = 1.000 via carved rainbow/star crown handle
  const lidBaseGeo = chamferBarSpec(1.28, 0.08, 0.88, 0.022, 1);
  const lidCrownGeo = chamferBarSpec(1.12, 0.075, 0.72, 0.022, 1);
  const topArchHandleGeo = sculptCurvedLimb(
    [
      [-0.16, 0.89, 0],
      [0, 0.974, 0],
      [0.16, 0.89, 0]
    ],
    0.026,
    { steps: 8, radialSegments: 8 }
  );

  const lidWoodLobe = composeLobe({
    suffix: "lidPanel",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    hinge: lidAnchor,
    parts: [
      part(lidBaseGeo, "#A4E2B9", { position: [0, 0.82, 0] }),
      part(lidCrownGeo, "#E5B780", { position: [0, 0.885, 0] })
    ]
  });
  const lidHandleLobe = composeLobe({
    suffix: "lidCrown",
    craft: "ceramic",
    hinge: lidAnchor,
    parts: [part(topArchHandleGeo, "#FFD559")]
  });

  return finalizeProceduralRig(
    "toyBox",
    [
      makeSubPartRig("body", ORIGIN, [bodyWoodLobe, bodyEmblemLobe]),
      makeSubPartRig("lid", lidAnchor, [lidWoodLobe, lidHandleLobe])
    ],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 13. storyBox (0.60 m, parts: body + lid, fitMode: "exact", restAt: 0.20)

function buildStoryBoxRig(): ProceduralAssetRig {
  const lidAnchor: Vec3 = [0, 0.78, -0.4];

  // Royal-lavender storybook treasure chest with hollow interior floor strictly at `y = 0.200`
  const bunFootOrb = unitOrbSpec(8, 4);
  const floorPanelGeo = chamferBarSpec(1.14, 0.12, 0.82, 0.016);
  const frontBackWallGeo = chamferBarSpec(1.2, 0.7, 0.078, 0.018);
  const leftRightWallGeo = chamferBarSpec(0.078, 0.7, 0.76, 0.018);

  // Brass corner straps & front lock escutcheon
  const brassBandVGeo = chamferBarSpec(0.085, 0.72, 0.88, 0.012);
  const lockPlateGeo = chamferBarSpec(0.18, 0.19, 0.032, 0.008);
  const sideRingGeo = torusSpec(0.075, 0.016, 10, 6);

  // Warm star medallions (`warmGlow`, `emissiveIntensity: 0.35`, `practical: true` via craftMaterial)
  const starMedallionGeo = extrudeContourSpec({
    outer: starRing2D(0, 0, 0.095, 0.046, 5),
    depth: 0.026,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 1
  });

  const bodyWoodLobe = composeLobe({
    suffix: "treasureChest",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      // Bun feet (`centerY = 0.045, scaleY = 0.045 -> minY = 0.000` exact)
      part(bunFootOrb, "#8A6BC8", { position: [-0.52, 0.045, -0.35], scale: [0.075, 0.045, 0.075] }),
      part(bunFootOrb, "#8A6BC8", { position: [0.52, 0.045, -0.35], scale: [0.075, 0.045, 0.075] }),
      part(bunFootOrb, "#8A6BC8", { position: [-0.52, 0.045, 0.35], scale: [0.075, 0.045, 0.075] }),
      part(bunFootOrb, "#8A6BC8", { position: [0.52, 0.045, 0.35], scale: [0.075, 0.045, 0.075] }),
      // Floor top strictly at `0.14 + 0.06 = 0.200`!
      part(floorPanelGeo, "#6E52A8", { position: [0, 0.14, 0] }),
      part(frontBackWallGeo, "#AF92E6", { position: [0, 0.43, 0.39] }),
      part(frontBackWallGeo, "#AF92E6", { position: [0, 0.43, -0.39] }),
      part(leftRightWallGeo, "#A384DE", { position: [-0.56, 0.43, 0] }),
      part(leftRightWallGeo, "#A384DE", { position: [0.56, 0.43, 0] })
    ]
  });

  const bodyBrassLobe = composeLobe({
    suffix: "brassStraps",
    craft: "brushedMetal",
    parts: [
      part(brassBandVGeo, "#F2C94C", { position: [-0.46, 0.43, 0] }),
      part(brassBandVGeo, "#F2C94C", { position: [0.46, 0.43, 0] }),
      part(lockPlateGeo, "#FFD55A", { position: [0, 0.7, 0.432] }),
      part(sideRingGeo, "#F2C94C", {
        position: [-0.61, 0.46, 0],
        rotation: [0, Math.PI * 0.5, 0]
      }),
      part(sideRingGeo, "#F2C94C", {
        position: [0.61, 0.46, 0],
        rotation: [0, Math.PI * 0.5, 0]
      })
    ]
  });

  const bodyStarLobe = composeLobe({
    suffix: "starMedallions",
    craft: "warmGlow",
    emissive: "#FFD85E",
    emissiveIntensity: 0.35,
    parts: [
      part(starMedallionGeo, "#FFE37E", { position: [-0.24, 0.46, 0.435] }),
      part(starMedallionGeo, "#FFE37E", { position: [0.24, 0.46, 0.435], scale: 0.85 })
    ]
  });

  // Arched barrel-vault rear-hinged lid (`anchor: [0, 0.78, -0.40]`) reaching exact y = 1.000
  const vaultContour: ProceduralVec2[] = [[-0.43, 0.78], [0.43, 0.78]];
  for (let i = 0; i <= 10; i += 1) {
    const u = i / 10;
    const z = 0.43 - u * 0.86;
    const y = 0.78 + Math.sin(u * Math.PI) * 0.2;
    vaultContour.push([z, y]);
  }
  const rawVaultLid = extrudeContourSpec({
    outer: vaultContour,
    depth: 1.22,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 1,
    creaseAngle: 0.95
  });
  const vaultLidGeo = composeGeometry([
    {
      geometry: rawVaultLid,
      rotation: [0, -Math.PI * 0.5, 0]
    }
  ]);

  const rawLidStrap = extrudeContourSpec({
    outer: vaultContour.map(([z, y]): ProceduralVec2 => [z * 1.02, y === 0.78 ? 0.775 : y + 0.02]),
    depth: 0.09,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1,
    creaseAngle: 0.95
  });
  const lidStrapGeo = composeGeometry([
    {
      geometry: rawLidStrap,
      rotation: [0, -Math.PI * 0.5, 0]
    }
  ]);

  const lidWoodLobe = composeLobe({
    suffix: "vaultLid",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    hinge: lidAnchor,
    parts: [part(vaultLidGeo, "#B89CEB")]
  });
  const lidBrassLobe = composeLobe({
    suffix: "vaultStraps",
    craft: "brushedMetal",
    hinge: lidAnchor,
    parts: [
      part(lidStrapGeo, "#F2C94C", { position: [-0.46, 0, 0] }),
      part(lidStrapGeo, "#F2C94C", { position: [0.46, 0, 0] })
    ]
  });

  return finalizeProceduralRig(
    "storyBox",
    [
      makeSubPartRig("body", ORIGIN, [bodyWoodLobe, bodyBrassLobe, bodyStarLobe]),
      makeSubPartRig("lid", lidAnchor, [lidWoodLobe, lidBrassLobe])
    ],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 14. tree (2.40 m)

function buildTreeRig(): ProceduralAssetRig {
  // Gently curved warm cinnamon-bark trunk + 3 flared root buttresses + 2 forked upper boughs
  const trunkGeo = sculptCurvedLimb(
    [
      [0, 0.01, 0],
      [0.018, 0.2, 0.012],
      [-0.014, 0.4, -0.008],
      [0.006, 0.58, 0.006]
    ],
    (t) => 0.092 - 0.036 * t,
    { steps: 7, radialSegments: 9 }
  );

  const rootAngles: readonly number[] = [0.25, 2.35, 4.45];
  const barkParts: LobePartInput[] = [part(trunkGeo, "#9A6640")];
  for (const ang of rootAngles) {
    const rx = Math.sin(ang);
    const rz = Math.cos(ang);
    const rootGeo = sculptCurvedLimb(
      [
        [rx * 0.04, 0.14, rz * 0.04],
        [rx * 0.11, 0.055, rz * 0.11],
        [rx * 0.175, 0.014, rz * 0.175]
      ],
      (t) => 0.046 * (1 - 0.45 * t),
      { steps: 4, radialSegments: 6 }
    );
    barkParts.push(part(rootGeo, "#8D5B37"));
  }

  const leftBranchGeo = sculptCurvedLimb(
    [
      [-0.01, 0.45, 0],
      [-0.1, 0.55, 0.03],
      [-0.18, 0.64, 0.05]
    ],
    (t) => 0.048 * (1 - 0.38 * t),
    { steps: 5, radialSegments: 6 }
  );
  const rightBranchGeo = sculptCurvedLimb(
    [
      [0.01, 0.47, 0],
      [0.11, 0.56, -0.02],
      [0.18, 0.65, -0.04]
    ],
    (t) => 0.046 * (1 - 0.38 * t),
    { steps: 5, radialSegments: 6 }
  );
  barkParts.push(part(leftBranchGeo, "#9A6640"), part(rightBranchGeo, "#9A6640"));

  // Lush 9-puff multi-tone sage/emerald/meadow-green FBM canopy (`<= 950` canopy tris -> total tree `<= 1,650`)
  const canopyPuffs: readonly OrganicPuffItem[] = [
    { position: [0, 0.72, 0.02], scale: [0.46, 0.38, 0.44], colorHex: "#76CA6A" },
    { position: [-0.19, 0.64, 0.08], scale: [0.34, 0.28, 0.33], colorHex: "#66B95C" },
    { position: [0.2, 0.65, 0.06], scale: [0.33, 0.28, 0.32], colorHex: "#82D474" },
    { position: [-0.15, 0.66, -0.14], scale: [0.32, 0.27, 0.31], colorHex: "#5EAD55" },
    { position: [0.16, 0.66, -0.13], scale: [0.32, 0.27, 0.31], colorHex: "#6EC162" },
    { position: [0, 0.63, 0.18], scale: [0.31, 0.26, 0.29], colorHex: "#88DA7A" },
    { position: [-0.1, 0.82, 0.04], scale: [0.3, 0.25, 0.29], colorHex: "#84D676" },
    { position: [0.11, 0.81, -0.03], scale: [0.29, 0.24, 0.28], colorHex: "#74C868" },
    { position: [0, 0.89, 0.01], scale: [0.26, 0.22, 0.25], colorHex: "#92E084" }
  ];
  const canopy = sculptFbmOrganicPuffs(canopyPuffs, {
    puffSegments: 5,
    maxEdgeLength: 0.24,
    maxTriangles: 1200,
    amplitude: 0.015,
    seed: 409
  });

  // 5 pastel pink & cream blossom buds dotting the sunlit canopy
  const budOrb = unitOrbSpec(7, 4);
  const blossomParts: LobePartInput[] = [
    part(budOrb, "#FFA4BF", { position: [-0.21, 0.71, 0.2], scale: 0.032 }),
    part(budOrb, "#FFF4D4", { position: [0.19, 0.74, 0.18], scale: 0.029 }),
    part(budOrb, "#FF98B6", { position: [0.03, 0.85, 0.17], scale: 0.03 }),
    part(budOrb, "#FFEAA8", { position: [-0.14, 0.88, -0.08], scale: 0.028 }),
    part(budOrb, "#FFA8C3", { position: [0.22, 0.68, -0.16], scale: 0.03 })
  ];

  const barkLobe = composeLobe({
    suffix: "bark",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: barkParts
  });
  const canopyLobe = composeLobe({
    suffix: "canopy",
    craft: "felt",
    parts: [part(canopy.geometry, "#FFFFFF", { subShapes: canopy.subShapeCount })]
  });
  const blossomLobe = composeLobe({
    suffix: "blossoms",
    craft: "lacquer",
    parts: blossomParts
  });

  return finalizeProceduralRig("tree", [
    makeSubPartRig("body", ORIGIN, [barkLobe, canopyLobe, blossomLobe])
  ]);
}

// ---------------------------------------------------------------- 15. bush (0.80 m)

function buildBushRig(): ProceduralAssetRig {
  // 3 short woody base stems grounding the hedgerow shrub
  const stemCenterGeo = sculptCurvedLimb(
    [
      [0, 0.01, 0],
      [0, 0.22, 0.02]
    ],
    0.055,
    { steps: 5, radialSegments: 8 }
  );
  const stemLeftGeo = sculptCurvedLimb(
    [
      [-0.22, 0.01, 0.02],
      [-0.36, 0.2, 0.04]
    ],
    0.042,
    { steps: 5, radialSegments: 7 }
  );
  const stemRightGeo = sculptCurvedLimb(
    [
      [0.22, 0.01, -0.02],
      [0.36, 0.2, -0.03]
    ],
    0.042,
    { steps: 5, radialSegments: 7 }
  );

  // Dense 9-puff layered hedgerow shrub (`width ~ 1.5h, depth ~ 1.25h`)
  const shrubPuffs: readonly OrganicPuffItem[] = [
    { position: [0, 0.44, 0.02], scale: [0.76, 0.62, 0.68], colorHex: "#72C466" },
    { position: [-0.44, 0.35, 0.06], scale: [0.58, 0.52, 0.56], colorHex: "#65B75B" },
    { position: [0.44, 0.36, -0.04], scale: [0.58, 0.52, 0.56], colorHex: "#7DD070" },
    { position: [-0.22, 0.34, -0.26], scale: [0.54, 0.48, 0.5], colorHex: "#5EAD55" },
    { position: [0.24, 0.34, 0.26], scale: [0.54, 0.48, 0.5], colorHex: "#82D575" },
    { position: [-0.24, 0.68, 0.1], scale: [0.5, 0.44, 0.48], colorHex: "#84D777" },
    { position: [0.24, 0.66, 0.08], scale: [0.48, 0.42, 0.46], colorHex: "#74C768" },
    { position: [0, 0.72, -0.12], scale: [0.48, 0.42, 0.46], colorHex: "#6CB960" },
    { position: [0, 0.8, 0.06], scale: [0.44, 0.38, 0.42], colorHex: "#90DF82" }
  ];
  const foliage = sculptFbmOrganicPuffs(shrubPuffs, {
    puffSegments: 5,
    maxEdgeLength: 0.38,
    maxTriangles: 1200,
    amplitude: 0.016,
    seed: 521
  });

  // 6 glossy coral & sunny berry blossom buds
  const berryOrb = unitOrbSpec(8, 4);
  const berryParts: LobePartInput[] = [
    part(berryOrb, "#FF6E6B", { position: [-0.34, 0.56, 0.35], scale: 0.052 }),
    part(berryOrb, "#FFA4BA", { position: [0.3, 0.58, 0.36], scale: 0.048 }),
    part(berryOrb, "#FFE074", { position: [-0.08, 0.78, 0.28], scale: 0.046 }),
    part(berryOrb, "#FF7875", { position: [0.16, 0.84, 0.2], scale: 0.048 }),
    part(berryOrb, "#FFA4BA", { position: [-0.48, 0.44, -0.18], scale: 0.048 }),
    part(berryOrb, "#FF6E6B", { position: [0.46, 0.48, -0.2], scale: 0.05 })
  ];

  const foliageLobe = composeLobe({
    suffix: "shrubFoliage",
    craft: "felt",
    parts: [part(foliage.geometry, "#FFFFFF", { subShapes: foliage.subShapeCount })]
  });
  const stemsLobe = composeLobe({
    suffix: "shrubStems",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(stemCenterGeo, "#8E5E3B"),
      part(stemLeftGeo, "#865736"),
      part(stemRightGeo, "#865736")
    ]
  });
  const berriesLobe = composeLobe({
    suffix: "berries",
    craft: "lacquer",
    parts: berryParts
  });

  return finalizeProceduralRig("bush", [
    makeSubPartRig("body", ORIGIN, [foliageLobe, stemsLobe, berriesLobe])
  ]);
}

// ---------------------------------------------------------------- 16. flower (0.90 m, parts: body + petals)

function buildFlowerRig(): ProceduralAssetRig {
  const petalsAnchor: Vec3 = [0, 0.78, 0.02];

  // Gently curved meadow-green stem + 2 cupped sculpted leaves + sepal calyx
  const stemGeo = sculptCurvedLimb(
    [
      [0, 0.008, 0],
      [-0.018, 0.28, -0.01],
      [0.014, 0.54, 0.008],
      [0, 0.775, 0.02]
    ],
    (t) => 0.032 - 0.007 * t,
    { steps: 10, radialSegments: 10 }
  );
  const leftLeafGeo = sculptCurvedLimb(
    [
      [-0.015, 0.28, 0],
      [-0.12, 0.35, 0.03],
      [-0.2, 0.39, 0.05]
    ],
    (t) => 0.044 * Math.sin(Math.max(0.08, t) * Math.PI * 0.92),
    { steps: 7, radialSegments: 9, profileScaleX: 2.2, profileScaleY: 0.36 }
  );
  const rightLeafGeo = sculptCurvedLimb(
    [
      [0.015, 0.45, 0.005],
      [0.12, 0.52, 0.03],
      [0.2, 0.56, 0.04]
    ],
    (t) => 0.042 * Math.sin(Math.max(0.08, t) * Math.PI * 0.92),
    { steps: 7, radialSegments: 9, profileScaleX: 2.2, profileScaleY: 0.36 }
  );
  const calyxGeo = composeGeometry([
    {
      geometry: coneSpec(0.068, 0.075, 14, 0.014),
      rotation: [Math.PI, 0, 0]
    }
  ]);

  const bodyLobe = composeLobe({
    suffix: "stemLeaves",
    craft: "clay",
    parts: [
      part(stemGeo, "#5BB659"),
      part(leftLeafGeo, "#6AC866"),
      part(rightLeafGeo, "#6AC866"),
      part(calyxGeo, "#4FA64E", { position: [0, 0.748, 0.018] })
    ]
  });

  // Plump teardrop petal oriented along +Y (`y: 0 .. 0.19`) for radiating corolla
  const petalProfile: readonly ProceduralVec2[] = [
    [0, 0],
    [0.028, 0.02],
    [0.058, 0.085],
    [0.056, 0.145],
    [0.032, 0.182],
    [0, 0.195]
  ];
  const rawPetalGeo = sculptOrganicLathe(petalProfile, { segments: 10 });
  const flatPetalGeo = composeGeometry([
    {
      geometry: rawPetalGeo,
      scale: [1.08, 1, 0.42]
    }
  ]);

  // Build 8 radiating petals in head-local space, then tilt blossom face toward +Z viewer (`rx = 0.95`)
  const headTilt = 0.95;
  const corollaInputs: LobePartInput[] = [];
  const petalCount = 8;
  for (let i = 0; i < petalCount; i += 1) {
    const roll = (i / petalCount) * TAU;
    const onePetalTilted = composeGeometry([
      {
        geometry: flatPetalGeo,
        position: [0, 0.042, 0],
        rotation: [0.18, 0, 0]
      }
    ]);
    const spunPetal = composeGeometry([
      {
        geometry: onePetalTilted,
        rotation: [0, 0, roll]
      }
    ]);
    const facedPetal = composeGeometry([
      {
        geometry: spunPetal,
        rotation: [headTilt, 0, 0]
      }
    ]);
    corollaInputs.push(
      part(facedPetal, i % 2 === 0 ? "#F688B6" : "#FFA2C7", {
        position: petalsAnchor
      })
    );
  }

  const pollenOrb = unitOrbSpec(14, 7);
  const petalsFeltLobe = composeLobe({
    suffix: "corolla",
    craft: "felt",
    hinge: petalsAnchor,
    parts: corollaInputs
  });
  const pollenLobe = composeLobe({
    suffix: "pollenDome",
    craft: "ceramic",
    hinge: petalsAnchor,
    parts: [
      part(pollenOrb, "#FFD447", {
        position: [0, 0.79, 0.052],
        scale: [0.072, 0.072, 0.048],
        rotation: [headTilt - Math.PI * 0.5, 0, 0]
      }),
      part(pollenOrb, "#FFAE2B", {
        position: [0, 0.795, 0.078],
        scale: [0.038, 0.038, 0.025]
      })
    ]
  });

  return finalizeProceduralRig("flower", [
    makeSubPartRig("body", ORIGIN, [bodyLobe]),
    makeSubPartRig("petals", petalsAnchor, [petalsFeltLobe, pollenLobe])
  ]);
}

// ---------------------------------------------------------------- 17. flowerBud (0.80 m, parts: body + petals)

function buildFlowerBudRig(): ProceduralAssetRig {
  const petalsAnchor: Vec3 = [0, 0.76, 0];

  const stemGeo = sculptCurvedLimb(
    [
      [0, 0.008, 0],
      [0.014, 0.26, 0.008],
      [-0.01, 0.52, -0.006],
      [0, 0.76, 0]
    ],
    (t) => 0.032 - 0.006 * t,
    { steps: 9, radialSegments: 10 }
  );
  const leftLeafGeo = sculptCurvedLimb(
    [
      [-0.012, 0.28, 0],
      [-0.1, 0.36, 0.02],
      [-0.16, 0.41, 0.035]
    ],
    (t) => 0.04 * Math.sin(Math.max(0.08, t) * Math.PI * 0.92),
    { steps: 7, radialSegments: 8, profileScaleX: 2.1, profileScaleY: 0.36 }
  );
  const rightLeafGeo = sculptCurvedLimb(
    [
      [0.012, 0.44, 0],
      [0.1, 0.52, -0.015],
      [0.16, 0.57, -0.025]
    ],
    (t) => 0.04 * Math.sin(Math.max(0.08, t) * Math.PI * 0.92),
    { steps: 7, radialSegments: 8, profileScaleX: 2.1, profileScaleY: 0.36 }
  );

  // 4 cupped green sepal leaves cradling the bud base
  const sepalOrb = unitOrbSpec(8, 5);
  const bodyParts: LobePartInput[] = [
    part(stemGeo, "#5BB659"),
    part(leftLeafGeo, "#6AC866"),
    part(rightLeafGeo, "#6AC866")
  ];
  for (let s = 0; s < 4; s += 1) {
    const a = (s / 4) * TAU + Math.PI * 0.25;
    bodyParts.push(
      part(sepalOrb, "#4EA54D", {
        position: [Math.sin(a) * 0.055, 0.775, Math.cos(a) * 0.055],
        rotation: [Math.cos(a) * 0.42, 0, -Math.sin(a) * 0.42],
        scale: [0.036, 0.068, 0.022]
      })
    );
  }

  const bodyLobe = composeLobe({
    suffix: "budStem",
    craft: "clay",
    parts: bodyParts
  });

  // Cupped closed tulip-like crown of 6 overlapping rose-pink petals (`anchor: [0, 0.76, 0]`)
  const budPetalOrb = unitOrbSpec(10, 6);
  const budPetalParts: LobePartInput[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    const r = i % 2 === 0 ? 0.058 : 0.052;
    const tiltIn = i % 2 === 0 ? -0.22 : -0.28;
    const cupped = composeGeometry([
      {
        geometry: budPetalOrb,
        scale: [0.058, 0.125, 0.028],
        rotation: [tiltIn, 0, 0],
        position: [0, 0.88, r]
      }
    ]);
    const rotated = composeGeometry([
      {
        geometry: cupped,
        rotation: [0, a, 0]
      }
    ]);
    budPetalParts.push(part(rotated, i % 2 === 0 ? "#F482B0" : "#FFA3C7"));
  }

  const petalsFeltLobe = composeLobe({
    suffix: "tulipCrown",
    craft: "felt",
    hinge: petalsAnchor,
    parts: budPetalParts
  });
  const nectarCoreLobe = composeLobe({
    suffix: "nectarCore",
    craft: "ceramic",
    hinge: petalsAnchor,
    parts: [
      part(unitOrbSpec(12, 6), "#FFD54E", {
        position: [0, 0.865, 0],
        scale: [0.052, 0.075, 0.052]
      })
    ]
  });

  return finalizeProceduralRig("flowerBud", [
    makeSubPartRig("body", ORIGIN, [bodyLobe]),
    makeSubPartRig("petals", petalsAnchor, [petalsFeltLobe, nectarCoreLobe])
  ]);
}

// ---------------------------------------------------------------- 18. cloud (1.20 m)

function buildCloudRig(): ProceduralAssetRig {
  // Soft flat-bottomed 8-puff cumulus cluster (`width ~ 1.6h, depth ~ 0.9h`)
  const cumulusPuffs: readonly OrganicPuffItem[] = [
    { position: [0, 0.36, 0.02], scale: [0.82, 0.52, 0.62], colorHex: "#FFFDF9" },
    { position: [-0.52, 0.28, 0.03], scale: [0.56, 0.42, 0.5], colorHex: "#FAF7FF" },
    { position: [0.52, 0.3, -0.02], scale: [0.54, 0.44, 0.5], colorHex: "#FFFDF9" },
    { position: [-0.24, 0.62, 0.05], scale: [0.56, 0.5, 0.52], colorHex: "#FFFFFF" },
    { position: [0.22, 0.66, -0.01], scale: [0.58, 0.54, 0.52], colorHex: "#FFFFFF" },
    { position: [0, 0.74, 0.02], scale: [0.5, 0.48, 0.46], colorHex: "#FFFDFB" },
    { position: [-0.42, 0.46, -0.1], scale: [0.44, 0.38, 0.42], colorHex: "#F8F5FE" },
    { position: [0.4, 0.48, 0.1], scale: [0.44, 0.38, 0.42], colorHex: "#FFFDF9" }
  ];
  const cumulus = sculptFbmOrganicPuffs(cumulusPuffs, {
    puffSegments: 5,
    maxEdgeLength: 0.36,
    maxTriangles: 1200,
    amplitude: 0.012,
    seed: 613
  });

  // Subtle pearlescent warm-lavender/cream underside lining cushions flattening the cumulus base
  const liningOrb = unitOrbSpec(14, 7);
  const cumulusLobe = composeLobe({
    suffix: "cumulus",
    craft: "felt",
    parts: [part(cumulus.geometry, "#FFFFFF", { subShapes: cumulus.subShapeCount })]
  });
  const liningLobe = composeLobe({
    suffix: "pearlescentBase",
    craft: "clay",
    parts: [
      part(liningOrb, "#F3EFFC", { position: [0, 0.14, 0], scale: [0.62, 0.12, 0.38] }),
      part(liningOrb, "#F6F3FD", { position: [-0.42, 0.13, 0.02], scale: [0.34, 0.1, 0.28] }),
      part(liningOrb, "#F6F3FD", { position: [0.42, 0.13, -0.01], scale: [0.34, 0.1, 0.28] })
    ]
  });

  return finalizeProceduralRig("cloud", [
    makeSubPartRig("body", ORIGIN, [cumulusLobe, liningLobe])
  ]);
}

// ---------------------------------------------------------------- 19. stompStone (0.15 m, fitMode: "exact", restAt: 1.0, tintTarget: true)
// Wide chamfered circular musical garden stepping-stone (`width = 5.0h, depth = 5.0h`, flat top strictly at y = 1.000).

function buildStompStoneRig(): ProceduralAssetRig {
  // Lower stepped garden stone plinth (`y: 0.000 .. 0.84`) + recessed inner stone well (`top = 0.94`)
  const lowerPlinthGeo = cylinderSpec(2.36, 2.48, 0.84, 30, 0.08);
  const innerWellGeo = cylinderSpec(1.74, 1.78, 0.14, 24, 0);

  // Raised chamfered outer stone bezel ring (`r: 1.66 .. 2.24`, flat top strictly at y = 1.000!)
  const bezelProfile: readonly ProceduralVec2[] = [
    [1.64, 0.82],
    [2.24, 0.82],
    [2.26, 0.92],
    [2.16, 1.0],
    [1.72, 1.0],
    [1.64, 0.94],
    [1.64, 0.82]
  ];
  const outerBezelGeo = latheGeometry({ profile: bezelProfile, segments: 30, creaseAngle: 1.1 });

  // 4 soft garden rim pebbles around the footing (`minY >= 0.000`)
  const pebbleOrb = unitOrbSpec(7, 4);

  const stoneLobe = composeLobe({
    suffix: "stoneBezel",
    craft: "clay",
    baseColor: "#CDB8F2",
    tintTarget: true,
    parts: [
      part(lowerPlinthGeo, "#FFFFFF", { position: [0, 0.42, 0] }),
      part(innerWellGeo, "#F5F2FA", { position: [0, 0.87, 0] }),
      part(outerBezelGeo, "#FFFFFF"),
      part(pebbleOrb, "#F2EFF8", { position: [-2.24, 0.18, 0.62], scale: [0.22, 0.18, 0.19] }),
      part(pebbleOrb, "#F2EFF8", { position: [2.24, 0.17, -0.58], scale: [0.22, 0.17, 0.19] }),
      part(pebbleOrb, "#F2EFF8", { position: [0.55, 0.16, 2.24], scale: [0.22, 0.16, 0.19] }),
      part(pebbleOrb, "#F2EFF8", { position: [-0.6, 0.16, -2.24], scale: [0.22, 0.16, 0.19] })
    ]
  });

  // Inlaid cream `ceramic` eighth-note relief sitting cleanly inside the well (`y: 0.90 .. 1.000` exact!)
  // Flat top of notehead, stem, and flag sits strictly flush with `y = 1.000` (`centerY = 0.95, height = 0.10 -> maxY = 1.000`).
  const noteHeadGeo = cylinderSpec(0.46, 0.48, 0.1, 18, 0.015);
  const noteStemGeo = chamferBarSpec(0.19, 0.1, 1.48, 0.022);
  const noteFlagGeo = chamferBarSpec(0.64, 0.1, 0.22, 0.022);
  const accentDotGeo = cylinderSpec(0.14, 0.15, 0.09, 10, 0);

  const inlayLobe = composeLobe({
    suffix: "noteInlay",
    craft: "ceramic",
    parts: [
      part(noteHeadGeo, "#FFFDF6", {
        position: [-0.22, 0.95, 0.52],
        rotation: [0, -0.35, 0],
        scale: [1.18, 1, 0.86]
      }),
      part(noteStemGeo, "#FFFDF6", {
        position: [0.18, 0.95, -0.08]
      }),
      part(noteFlagGeo, "#FFFDF6", {
        position: [0.44, 0.95, -0.62],
        rotation: [0, -0.46, 0]
      }),
      part(accentDotGeo, "#FFE89E", { position: [-0.95, 0.945, -0.45] }),
      part(accentDotGeo, "#FFE89E", { position: [0.95, 0.945, 0.48] })
    ]
  });

  return finalizeProceduralRig(
    "stompStone",
    [makeSubPartRig("body", ORIGIN, [stoneLobe, inlayLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- exported 19-key dictionary

export const MUSIC_FURNITURE_NATURE_RIGS: Readonly<
  Record<MusicFurnitureNatureAssetKey, ProceduralAssetRig>
> = {
  drum: buildDrumRig(),
  shaker: buildShakerRig(),
  toyPiano: buildToyPianoRig(),
  mirror: buildMirrorRig(),
  bed: buildBedRig(),
  sink: buildSinkRig(),
  table: buildTableRig(),
  chair: buildChairRig(),
  cushion: buildCushionRig(),
  bench: buildBenchRig(),
  picnicBasket: buildPicnicBasketRig(),
  toyBox: buildToyBoxRig(),
  storyBox: buildStoryBoxRig(),
  tree: buildTreeRig(),
  bush: buildBushRig(),
  flower: buildFlowerRig(),
  flowerBud: buildFlowerBudRig(),
  cloud: buildCloudRig(),
  stompStone: buildStompStoneRig()
};
