// Group 5 procedural 3D rigs: play props, open-counter beveled letters, bakery & routine items (24 keys).
// Built 100% natively on @aura3d/engine, @aura3d/engine/procedural, and ./rig-kit.js.
// Zero network fetches, zero clocks, zero PRNG calls, zero debug logging, and zero unsafe casts.

import { geometry, type AuraCustomGeometrySpec } from "@aura3d/engine";
import {
  catmullRomCurve,
  composeGeometry,
  latheGeometry,
  sweepGeometry,
  type ProceduralVec2,
  type ProceduralVec3
} from "@aura3d/engine/procedural";
import {
  bezierProfilePoints,
  capsuleSpec,
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
  sculptOrganicLathe,
  torusSpec,
  type LobePartInput,
  type ProceduralAssetRig
} from "./rig-kit.js";

export type PlayFoodLetterAssetKey =
  | "ball"
  | "bubble"
  | "bubbleWand"
  | "balloon"
  | "toyBlock"
  | "letterB"
  | "letterBLower"
  | "letterA"
  | "letterALower"
  | "cookie"
  | "plate"
  | "apple"
  | "banana"
  | "cake"
  | "candleFlame"
  | "pastryCircle"
  | "pastrySquare"
  | "pastryTriangle"
  | "partyHat"
  | "hat"
  | "sponge"
  | "towel"
  | "toothbrush"
  | "sun";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;

// ---------------------------------------------------------------- compact deterministic sculpting helpers

/**
 * Compact smooth ellipsoid / cabochon / droplet with explicit (uSegs, vSegs) triangle budget.
 * Uses unit lathe + non-uniform vertex scaling + analytical smooth normals.
 */
function smoothDropSpec(
  rx: number,
  ry: number,
  rz: number,
  uSegs = 14,
  vSegs = 8
): AuraCustomGeometrySpec {
  const profile: ProceduralVec2[] = [];
  for (let i = 0; i <= vSegs; i += 1) {
    const a = -HALF_PI + (i / vSegs) * Math.PI;
    profile.push([Math.max(0, Math.cos(a)), Math.sin(a)]);
  }
  const unit = latheGeometry({
    profile,
    segments: Math.max(6, uSegs),
    creaseAngle: Math.PI
  });
  const scaled = composeGeometry([
    {
      geometry: unit,
      scale: [Math.max(1e-4, rx), Math.max(1e-4, ry), Math.max(1e-4, rz)]
    }
  ]);
  return ensureOutwardNormals({
    ...scaled,
    normals: geometry.computeNormals(scaled)
  });
}

interface CornerPoint2D {
  readonly x: number;
  readonly y: number;
  readonly r?: number;
}

/** Fillets a 2D polygon at each vertex with exact tangent circular arcs. */
function roundPolygon2D(
  corners: readonly CornerPoint2D[],
  arcSegs = 4
): ProceduralVec2[] {
  const n = corners.length;
  const out: ProceduralVec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = corners[(i + n - 1) % n]!;
    const cur = corners[i]!;
    const next = corners[(i + 1) % n]!;
    const rad = cur.r ?? 0;
    const v1x = prev.x - cur.x;
    const v1y = prev.y - cur.y;
    const v2x = next.x - cur.x;
    const v2y = next.y - cur.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (rad <= 1e-5 || l1 <= 1e-5 || l2 <= 1e-5) {
      out.push([cur.x, cur.y]);
      continue;
    }
    const u1x = v1x / l1;
    const u1y = v1y / l1;
    const u2x = v2x / l2;
    const u2y = v2y / l2;
    const cosAng = Math.max(-0.995, Math.min(0.995, u1x * u2x + u1y * u2y));
    const halfAng = Math.acos(cosAng) * 0.5;
    const tanHalf = Math.tan(halfAng);
    if (tanHalf <= 1e-4) {
      out.push([cur.x, cur.y]);
      continue;
    }
    const maxOffset = Math.min(l1, l2) * 0.46;
    const offset = Math.min(rad / tanHalf, maxOffset);
    const effR = offset * tanHalf;
    const pStart: ProceduralVec2 = [cur.x + u1x * offset, cur.y + u1y * offset];
    const pEnd: ProceduralVec2 = [cur.x + u2x * offset, cur.y + u2y * offset];

    const bx = u1x + u2x;
    const by = u1y + u2y;
    const bl = Math.hypot(bx, by);
    if (bl <= 1e-5 || arcSegs <= 1) {
      out.push(pStart, pEnd);
      continue;
    }
    const centerDist = effR / Math.max(1e-4, Math.sin(halfAng));
    const cx = cur.x + (bx / bl) * centerDist;
    const cy = cur.y + (by / bl) * centerDist;
    const a0 = Math.atan2(pStart[1] - cy, pStart[0] - cx);
    let da = Math.atan2(pEnd[1] - cy, pEnd[0] - cx) - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let s = 0; s <= arcSegs; s += 1) {
      const a = a0 + (s / arcSegs) * da;
      out.push([cx + Math.cos(a) * effR, cy + Math.sin(a) * effR]);
    }
  }
  return out;
}

/** Clean 2D ellipse contour in XY. */
function ellipseContour2D(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segs = 20
): ProceduralVec2[] {
  const pts: ProceduralVec2[] = [];
  for (let i = 0; i < segs; i += 1) {
    const a = (i / segs) * TAU;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// ---------------------------------------------------------------- 1. ball (0.35m, round: true, tintTarget: true)

function buildBallRig(): ProceduralAssetRig {
  const sphereProfile: ProceduralVec2[] = [];
  const rings = 10;
  for (let i = 0; i <= rings; i += 1) {
    const a = -HALF_PI + (i / rings) * Math.PI;
    sphereProfile.push([Math.max(0, Math.cos(a) * 0.492), 0.5 + Math.sin(a) * 0.492]);
  }
  const mainDome = sculptOrganicLathe(sphereProfile, { segments: 20 });
  const sideBoss = smoothDropSpec(0.018, 0.16, 0.16, 8, 4);

  const mainLobe = composeLobe({
    suffix: "panels",
    craft: "lacquer",
    baseColor: "#E4574B",
    tintTarget: true,
    parts: [
      part(mainDome, "#FFFFFF"),
      part(sideBoss, "#FFFFFF", { position: [-0.478, 0.5, 0] }),
      part(sideBoss, "#FFFFFF", { position: [0.478, 0.5, 0] })
    ]
  });

  const seamRing = torusSpec(0.49, 0.015, 18, 4);
  const polarCap = smoothDropSpec(0.072, 0.02, 0.072, 8, 3);
  const frontCap = smoothDropSpec(0.068, 0.068, 0.02, 8, 3);
  const stitchPip = smoothDropSpec(0.026, 0.014, 0.026, 6, 3);

  const seamLobe = composeLobe({
    suffix: "seams",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    parts: [
      // 3 orthogonal cream seam piping bands so rolling spin around every axis is unmistakably clear
      part(seamRing, "#FFF7EC", { position: [0, 0.5, 0] }),
      part(seamRing, "#FFF7EC", { position: [0, 0.5, 0], rotation: [HALF_PI, 0, 0] }),
      part(seamRing, "#FFF7EC", { position: [0, 0.5, 0], rotation: [0, HALF_PI, 0] }),
      // Polar & front/back stitched button caps
      part(polarCap, "#FFF7EC", { position: [0, 0.985, 0] }),
      part(polarCap, "#FFF7EC", { position: [0, 0.015, 0] }),
      part(frontCap, "#FFF7EC", { position: [0, 0.5, 0.486] }),
      part(frontCap, "#F6E7D0", { position: [0, 0.5, -0.486] }),
      part(stitchPip, "#F5C95D", { position: [0, 0.993, 0] })
    ]
  });

  return finalizeProceduralRig("ball", [
    makeSubPartRig("body", [0, 0, 0], [mainLobe, seamLobe])
  ]);
}

// ---------------------------------------------------------------- 2. bubble (0.50m, round: true)

function buildBubbleRig(): ProceduralAssetRig {
  const outerProfile: ProceduralVec2[] = [];
  const rings = 10;
  for (let i = 0; i <= rings; i += 1) {
    const a = -HALF_PI + (i / rings) * Math.PI;
    outerProfile.push([Math.max(0, Math.cos(a) * 0.5), 0.5 + Math.sin(a) * 0.5]);
  }
  const outerFilm = sculptOrganicLathe(outerProfile, { segments: 18 });

  const filmLobe = composeLobe({
    suffix: "film",
    craft: "soapBubble",
    baseColor: "#FFFFFF",
    castShadow: false,
    receiveShadow: false,
    parts: [part(outerFilm, "#FFFFFF")]
  });

  const mainCrescent = sculptCurvedLimb(
    [
      [-0.27, 0.66, 0.37],
      [-0.2, 0.77, 0.35],
      [-0.08, 0.84, 0.31]
    ],
    (t) => 0.022 * Math.sin(Math.max(0.08, t) * Math.PI) + 0.006,
    { steps: 7, radialSegments: 6, profileScaleY: 0.45 }
  );
  const lowerCrescent = sculptCurvedLimb(
    [
      [0.12, 0.2, -0.36],
      [0.22, 0.27, -0.34],
      [0.27, 0.36, -0.31]
    ],
    (t) => 0.015 * Math.sin(Math.max(0.08, t) * Math.PI) + 0.005,
    { steps: 6, radialSegments: 6, profileScaleY: 0.45 }
  );
  const pearlDot = smoothDropSpec(0.028, 0.028, 0.012, 8, 4);

  const specLobe = composeLobe({
    suffix: "catchlight",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    castShadow: false,
    receiveShadow: false,
    emissive: "#FFFFFF",
    emissiveIntensity: 0.26,
    parts: [
      part(mainCrescent, "#FFFFFF"),
      part(lowerCrescent, "#EEF8FF"),
      part(pearlDot, "#FFFFFF", { position: [-0.04, 0.86, 0.29] })
    ]
  });

  return finalizeProceduralRig("bubble", [
    makeSubPartRig("body", [0, 0, 0], [filmLobe, specLobe])
  ]);
}

// ---------------------------------------------------------------- 3. bubbleWand (0.50m)

function buildBubbleWandRig(): ProceduralAssetRig {
  const handleProfile = bezierProfilePoints(
    [0, 0.0],
    [
      { cp1: [0.046, 0.0], cp2: [0.056, 0.024], to: [0.05, 0.055] },
      { cp1: [0.044, 0.085], cp2: [0.028, 0.11], to: [0.032, 0.22] },
      { cp1: [0.036, 0.34], cp2: [0.038, 0.44], to: [0.03, 0.56] },
      { cp1: [0.024, 0.6], cp2: [0.022, 0.63], to: [0.022, 0.665] },
      { cp1: [0.012, 0.67], cp2: [0.004, 0.67], to: [0, 0.67] }
    ],
    4
  );
  const handleGeo = sculptOrganicLathe(handleProfile, { segments: 14 });
  const gripRing = torusSpec(0.036, 0.008, 12, 4);
  const starCollar = extrudeContourSpec({
    outer: roundPolygon2D(
      Array.from({ length: 10 }, (_, i) => {
        const a = HALF_PI + (i / 10) * TAU;
        const r = i % 2 === 0 ? 0.095 : 0.048;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.012 };
      }),
      1
    ),
    depth: 0.026,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 1
  });
  const eyeletLoop = torusSpec(0.156, 0.02, 18, 5);
  const loopPip = smoothDropSpec(0.022, 0.022, 0.018, 7, 3);

  const wandLobe = composeLobe({
    suffix: "wand",
    craft: "lacquer",
    baseColor: "#FFFFFF",
    parts: [
      part(handleGeo, "#C8A8F0"),
      part(gripRing, "#F6B8D2", { position: [0, 0.16, 0], rotation: [HALF_PI, 0, 0] }),
      part(gripRing, "#FFE07D", { position: [0, 0.28, 0], rotation: [HALF_PI, 0, 0] }),
      part(gripRing, "#F6B8D2", { position: [0, 0.4, 0], rotation: [HALF_PI, 0, 0] }),
      part(starCollar, "#FFE07D", { position: [0, 0.575, 0], rotation: [HALF_PI, 0, 0] }),
      part(eyeletLoop, "#C8A8F0", { position: [0, 0.824, 0] }),
      part(loopPip, "#FFE07D", { position: [0, 0.992, 0] }),
      part(loopPip, "#F6B8D2", { position: [-0.15, 0.9, 0] }),
      part(loopPip, "#F6B8D2", { position: [0.15, 0.9, 0] })
    ]
  });

  const innerFilm = latheGeometry({
    profile: [
      [0, -0.004],
      [0.142, -0.004],
      [0.142, 0.004],
      [0, 0.004]
    ],
    segments: 16,
    creaseAngle: 1.1
  });
  const filmLobe = composeLobe({
    suffix: "soapFilm",
    craft: "soapBubble",
    baseColor: "#FFFFFF",
    castShadow: false,
    receiveShadow: false,
    parts: [part(innerFilm, "#FFFFFF", { position: [0, 0.824, 0], rotation: [HALF_PI, 0, 0] })]
  });

  return finalizeProceduralRig("bubbleWand", [
    makeSubPartRig("body", [0, 0, 0], [wandLobe, filmLobe])
  ]);
}

// ---------------------------------------------------------------- 4. balloon (0.60m, tintTarget: true)

function buildBalloonRig(): ProceduralAssetRig {
  const pearProfile = bezierProfilePoints(
    [0, 0.3],
    [
      { cp1: [0.022, 0.3], cp2: [0.048, 0.33], to: [0.095, 0.39] },
      { cp1: [0.19, 0.47], cp2: [0.34, 0.57], to: [0.35, 0.72] },
      { cp1: [0.355, 0.86], cp2: [0.24, 0.985], to: [0.06, 0.998] },
      { cp1: [0.025, 1.0], cp2: [0.008, 1.0], to: [0, 1.0] }
    ],
    4
  );
  const latexBody = sculptOrganicLathe(pearProfile, { segments: 18 });
  const neckBead = torusSpec(0.032, 0.011, 10, 4);
  const neckRuffle = coneSpec(0.046, 0.042, 10, 0.014);

  const latexLobe = composeLobe({
    suffix: "latex",
    craft: "lacquer",
    baseColor: "#E4574B",
    tintTarget: true,
    parts: [
      part(latexBody, "#FFFFFF"),
      part(neckBead, "#FFFFFF", { position: [0, 0.295, 0], rotation: [HALF_PI, 0, 0] }),
      part(neckRuffle, "#FFFFFF", { position: [0, 0.274, 0], rotation: [Math.PI, 0, 0] })
    ]
  });

  const ribbonString = sculptCurvedLimb(
    [
      [0, 0.285, 0],
      [0.042, 0.21, 0.018],
      [-0.038, 0.125, -0.014],
      [0.03, 0.05, 0.012],
      [0, 0.006, 0]
    ],
    0.009,
    { steps: 12, radialSegments: 6 }
  );
  const bowLoop = torusSpec(0.032, 0.008, 10, 4);
  const knotBead = smoothDropSpec(0.018, 0.015, 0.018, 7, 3);

  const ribbonLobe = composeLobe({
    suffix: "ribbon",
    craft: "felt",
    baseColor: "#FFFFFF",
    parts: [
      part(ribbonString, "#FFF7EC"),
      part(knotBead, "#FFF7EC", { position: [0, 0.292, 0.018] }),
      part(bowLoop, "#FFF7EC", { position: [-0.034, 0.292, 0.016], rotation: [0, 0.2, 0.35] }),
      part(bowLoop, "#FFF7EC", { position: [0.034, 0.292, 0.016], rotation: [0, -0.2, -0.35] }),
      part(knotBead, "#F6E7D0", { position: [0, 0.008, 0] })
    ]
  });

  const catchMain = smoothDropSpec(0.055, 0.082, 0.016, 8, 4);
  const catchDot = smoothDropSpec(0.024, 0.024, 0.012, 6, 3);
  const shineLobe = composeLobe({
    suffix: "shine",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    parts: [
      part(catchMain, "#FFFFFF", {
        position: [-0.145, 0.8, 0.285],
        rotation: [-0.28, -0.42, 0.22]
      }),
      part(catchDot, "#FFFFFF", {
        position: [-0.085, 0.89, 0.235],
        rotation: [-0.38, -0.25, 0]
      })
    ]
  });

  return finalizeProceduralRig("balloon", [
    makeSubPartRig("body", [0, 0, 0], [latexLobe, ribbonLobe, shineLobe])
  ]);
}

// ---------------------------------------------------------------- 5. toyBlock (0.35m, fitMode: "exact", tintTarget: true)

function buildToyBlockRig(): ProceduralAssetRig {
  // Recessed inner cube whose 6 faces show through the open maple wood edge frames
  const innerPanels = roundedBoxSpec(0.9, 0.9, 0.9, 0.035, 2);
  const panelBoss = smoothDropSpec(0.018, 0.15, 0.15, 8, 4);

  const panelLobe = composeLobe({
    suffix: "panels",
    craft: "lacquer",
    baseColor: "#6CB4EE",
    tintTarget: true,
    parts: [
      part(innerPanels, "#FFFFFF", { position: [0, 0.5, 0] }),
      part(panelBoss, "#FFFFFF", { position: [-0.452, 0.5, 0] }),
      part(panelBoss, "#FFFFFF", { position: [0.452, 0.5, 0] })
    ]
  });

  // Single chamfered square frame face with open window hole (exact [-0.5..+0.5] span)
  const outerSq = roundPolygon2D(
    [
      { x: -0.5, y: -0.5, r: 0.045 },
      { x: 0.5, y: -0.5, r: 0.045 },
      { x: 0.5, y: 0.5, r: 0.045 },
      { x: -0.5, y: 0.5, r: 0.045 }
    ],
    1
  );
  const innerHole = roundPolygon2D(
    [
      { x: -0.365, y: -0.365, r: 0.035 },
      { x: 0.365, y: -0.365, r: 0.035 },
      { x: 0.365, y: 0.365, r: 0.035 },
      { x: -0.365, y: 0.365, r: 0.035 }
    ],
    1
  );
  const faceFrame = extrudeContourSpec({
    outer: outerSq,
    holes: [innerHole],
    depth: 0.064,
    bevelThickness: 0.012,
    bevelSize: 0.01,
    bevelSegments: 1
  });

  const starEmblem = extrudeContourSpec({
    outer: roundPolygon2D(
      Array.from({ length: 10 }, (_, i) => {
        const a = HALF_PI + (i / 10) * TAU;
        const r = i % 2 === 0 ? 0.2 : 0.098;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.018 };
      }),
      1
    ),
    depth: 0.036,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1
  });
  const dotEmblem = smoothDropSpec(0.068, 0.068, 0.022, 8, 3);

  const woodLobe = composeLobe({
    suffix: "mapleFrame",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    baseColor: "#FFFFFF",
    parts: [
      // 6 outer frame faces -> exact x,z in [-0.5, +0.5] and y in [0.0, 1.0]
      part(faceFrame, "#E5BE8A", { position: [0, 0.5, 0.468] }),
      part(faceFrame, "#E5BE8A", { position: [0, 0.5, -0.468] }),
      part(faceFrame, "#E5BE8A", { position: [-0.468, 0.5, 0], rotation: [0, HALF_PI, 0] }),
      part(faceFrame, "#E5BE8A", { position: [0.468, 0.5, 0], rotation: [0, -HALF_PI, 0] }),
      part(faceFrame, "#EAC696", { position: [0, 0.968, 0], rotation: [-HALF_PI, 0, 0] }),
      part(faceFrame, "#DCB37B", { position: [0, 0.032, 0], rotation: [HALF_PI, 0, 0] }),
      // Raised wooden relief star on front (+Z) and counting dots on back (-Z)
      part(starEmblem, "#F3D5A5", { position: [0, 0.5, 0.466] }),
      part(dotEmblem, "#F3D5A5", { position: [-0.14, 0.62, -0.468] }),
      part(dotEmblem, "#F3D5A5", { position: [0, 0.5, -0.468] }),
      part(dotEmblem, "#F3D5A5", { position: [0.14, 0.38, -0.468] })
    ]
  });

  return finalizeProceduralRig(
    "toyBlock",
    [makeSubPartRig("body", [0, 0, 0], [panelLobe, woodLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 6. letterB, letterBLower, letterA, letterALower

function dCounterHole2D(
  leftX: number,
  rightX: number,
  botY: number,
  topY: number
): ProceduralVec2[] {
  const midY = (botY + topY) * 0.5;
  const ry = (topY - botY) * 0.5;
  const straightRight = leftX + (rightX - leftX) * 0.42;
  const rx = rightX - straightRight;
  const pts: ProceduralVec2[] = [
    [leftX, topY - 0.02],
    [leftX + 0.02, topY],
    [straightRight, topY]
  ];
  const arcSteps = 8;
  for (let i = 1; i < arcSteps; i += 1) {
    const a = HALF_PI - (i / arcSteps) * Math.PI;
    pts.push([straightRight + Math.cos(a) * rx, midY + Math.sin(a) * ry]);
  }
  pts.push(
    [straightRight, botY],
    [leftX + 0.02, botY],
    [leftX, botY + 0.02]
  );
  return pts;
}

function buildLetterBRig(): ProceduralAssetRig {
  const outer = roundPolygon2D(
    [
      { x: -0.36, y: 0.0, r: 0.055 },
      { x: 0.14, y: 0.0, r: 0.04 },
      { x: 0.36, y: 0.11, r: 0.08 },
      { x: 0.36, y: 0.39, r: 0.08 },
      { x: 0.17, y: 0.52, r: 0.035 },
      { x: 0.32, y: 0.64, r: 0.075 },
      { x: 0.32, y: 0.89, r: 0.075 },
      { x: 0.11, y: 1.0, r: 0.04 },
      { x: -0.36, y: 1.0, r: 0.055 }
    ],
    2
  );
  const upperHole = dCounterHole2D(-0.17, 0.14, 0.59, 0.86);
  const lowerHole = dCounterHole2D(-0.17, 0.18, 0.14, 0.44);

  const bodyGeo = extrudeContourSpec({
    outer,
    holes: [upperHole, lowerHole],
    depth: 0.22,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2
  });
  const spineGrip = roundedBoxSpec(0.03, 0.16, 0.14, 0.01, 2);

  const mainLobe = composeLobe({
    suffix: "letterBody",
    craft: "lacquer",
    baseColor: "#3F7FD9",
    tintTarget: true,
    parts: [
      part(bodyGeo, "#FFFFFF"),
      part(spineGrip, "#FFFFFF", { position: [-0.355, 0.72, 0] }),
      part(spineGrip, "#FFFFFF", { position: [-0.355, 0.28, 0] })
    ]
  });

  const dowel = smoothDropSpec(0.032, 0.032, 0.016, 8, 4);
  const basePad = roundedBoxSpec(0.38, 0.022, 0.16, 0.008, 2);
  const accentLobe = composeLobe({
    suffix: "maplePins",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    baseColor: "#FFFFFF",
    parts: [
      part(dowel, "#E8C391", { position: [-0.26, 0.88, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.26, 0.52, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.26, 0.12, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.26, 0.88, -0.112] }),
      part(dowel, "#E8C391", { position: [-0.26, 0.52, -0.112] }),
      part(dowel, "#E8C391", { position: [-0.26, 0.12, -0.112] }),
      part(basePad, "#DFB67E", { position: [-0.08, 0.012, 0] })
    ]
  });

  return finalizeProceduralRig("letterB", [
    makeSubPartRig("body", [0, 0, 0], [mainLobe, accentLobe])
  ]);
}

function buildLetterBLowerRig(): ProceduralAssetRig {
  const outer = roundPolygon2D(
    [
      { x: -0.33, y: 0.0, r: 0.055 },
      { x: 0.12, y: 0.0, r: 0.06 },
      { x: 0.34, y: 0.14, r: 0.085 },
      { x: 0.34, y: 0.49, r: 0.085 },
      { x: 0.12, y: 0.63, r: 0.06 },
      { x: -0.12, y: 0.58, r: 0.025 },
      { x: -0.12, y: 1.0, r: 0.085 },
      { x: -0.33, y: 1.0, r: 0.085 }
    ],
    2
  );
  const bowlHole = ellipseContour2D(0.045, 0.315, 0.135, 0.16, 14);

  const bodyGeo = extrudeContourSpec({
    outer,
    holes: [bowlHole],
    depth: 0.22,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2
  });
  const stemCrown = smoothDropSpec(0.09, 0.03, 0.08, 10, 4);

  const mainLobe = composeLobe({
    suffix: "letterBody",
    craft: "lacquer",
    baseColor: "#3F7FD9",
    tintTarget: true,
    parts: [
      part(bodyGeo, "#FFFFFF"),
      part(stemCrown, "#FFFFFF", { position: [-0.225, 0.985, 0] })
    ]
  });

  const dowel = smoothDropSpec(0.032, 0.032, 0.016, 8, 4);
  const basePad = roundedBoxSpec(0.36, 0.022, 0.16, 0.008, 2);
  const accentLobe = composeLobe({
    suffix: "maplePins",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    baseColor: "#FFFFFF",
    parts: [
      part(dowel, "#E8C391", { position: [-0.225, 0.86, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.225, 0.48, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.225, 0.12, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.225, 0.86, -0.112] }),
      part(dowel, "#E8C391", { position: [-0.225, 0.48, -0.112] }),
      part(dowel, "#E8C391", { position: [-0.225, 0.12, -0.112] }),
      part(basePad, "#DFB67E", { position: [-0.06, 0.012, 0] })
    ]
  });

  return finalizeProceduralRig("letterBLower", [
    makeSubPartRig("body", [0, 0, 0], [mainLobe, accentLobe])
  ]);
}

function buildLetterARig(): ProceduralAssetRig {
  const outer = roundPolygon2D(
    [
      { x: -0.4, y: 0.0, r: 0.045 },
      { x: -0.19, y: 0.0, r: 0.035 },
      { x: -0.115, y: 0.24, r: 0.025 },
      { x: 0.115, y: 0.24, r: 0.025 },
      { x: 0.19, y: 0.0, r: 0.035 },
      { x: 0.4, y: 0.0, r: 0.045 },
      { x: 0.1, y: 1.0, r: 0.055 },
      { x: -0.1, y: 1.0, r: 0.055 }
    ],
    2
  );
  const triHole = roundPolygon2D(
    [
      { x: -0.105, y: 0.41, r: 0.022 },
      { x: 0.105, y: 0.41, r: 0.022 },
      { x: 0.0, y: 0.77, r: 0.024 }
    ],
    2
  );

  const bodyGeo = extrudeContourSpec({
    outer,
    holes: [triHole],
    depth: 0.22,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2
  });
  const crossbarRib = roundedBoxSpec(0.24, 0.05, 0.23, 0.012, 2);

  const mainLobe = composeLobe({
    suffix: "letterBody",
    craft: "lacquer",
    baseColor: "#E4574B",
    tintTarget: true,
    parts: [
      part(bodyGeo, "#FFFFFF"),
      part(crossbarRib, "#FFFFFF", { position: [0, 0.325, 0] })
    ]
  });

  const dowel = smoothDropSpec(0.032, 0.032, 0.016, 8, 4);
  const footShoe = roundedBoxSpec(0.16, 0.022, 0.16, 0.008, 2);
  const accentLobe = composeLobe({
    suffix: "maplePins",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    baseColor: "#FFFFFF",
    parts: [
      part(dowel, "#E8C391", { position: [0, 0.9, 0.112] }),
      part(dowel, "#E8C391", { position: [-0.27, 0.1, 0.112] }),
      part(dowel, "#E8C391", { position: [0.27, 0.1, 0.112] }),
      part(dowel, "#E8C391", { position: [0, 0.9, -0.112] }),
      part(dowel, "#E8C391", { position: [-0.27, 0.1, -0.112] }),
      part(dowel, "#E8C391", { position: [0.27, 0.1, -0.112] }),
      part(footShoe, "#DFB67E", { position: [-0.29, 0.012, 0] }),
      part(footShoe, "#DFB67E", { position: [0.29, 0.012, 0] })
    ]
  });

  return finalizeProceduralRig("letterA", [
    makeSubPartRig("body", [0, 0, 0], [mainLobe, accentLobe])
  ]);
}

function buildLetterALowerRig(): ProceduralAssetRig {
  // Single-storey toddler-book lowercase 'a': plump round bowl + right vertical stem
  const outer = roundPolygon2D(
    [
      { x: -0.14, y: 0.0, r: 0.07 },
      { x: 0.18, y: 0.04, r: 0.03 },
      { x: 0.21, y: 0.0, r: 0.045 },
      { x: 0.44, y: 0.0, r: 0.065 },
      { x: 0.44, y: 1.0, r: 0.085 },
      { x: 0.21, y: 1.0, r: 0.085 },
      { x: 0.18, y: 0.92, r: 0.03 },
      { x: -0.14, y: 0.96, r: 0.08 },
      { x: -0.44, y: 0.74, r: 0.1 },
      { x: -0.44, y: 0.24, r: 0.1 }
    ],
    2
  );
  const bowlHole = ellipseContour2D(-0.08, 0.48, 0.175, 0.23, 14);

  const bodyGeo = extrudeContourSpec({
    outer,
    holes: [bowlHole],
    depth: 0.22,
    bevelThickness: 0.018,
    bevelSize: 0.014,
    bevelSegments: 2
  });
  const stemCap = smoothDropSpec(0.095, 0.03, 0.085, 10, 4);

  const mainLobe = composeLobe({
    suffix: "letterBody",
    craft: "lacquer",
    baseColor: "#E4574B",
    tintTarget: true,
    parts: [
      part(bodyGeo, "#FFFFFF"),
      part(stemCap, "#FFFFFF", { position: [0.325, 0.985, 0] })
    ]
  });

  const dowel = smoothDropSpec(0.035, 0.035, 0.016, 8, 4);
  const basePad = roundedBoxSpec(0.2, 0.024, 0.16, 0.008, 2);
  const accentLobe = composeLobe({
    suffix: "maplePins",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    baseColor: "#FFFFFF",
    parts: [
      part(dowel, "#E8C391", { position: [0.325, 0.84, 0.112] }),
      part(dowel, "#E8C391", { position: [0.325, 0.5, 0.112] }),
      part(dowel, "#E8C391", { position: [0.325, 0.14, 0.112] }),
      part(dowel, "#E8C391", { position: [0.325, 0.84, -0.112] }),
      part(dowel, "#E8C391", { position: [0.325, 0.5, -0.112] }),
      part(dowel, "#E8C391", { position: [0.325, 0.14, -0.112] }),
      part(basePad, "#DFB67E", { position: [0.32, 0.012, 0] })
    ]
  });

  return finalizeProceduralRig("letterALower", [
    makeSubPartRig("body", [0, 0, 0], [mainLobe, accentLobe])
  ]);
}

// ---------------------------------------------------------------- 7. cookie (0.18m, width: 2.3h)

function buildCookieRig(): ProceduralAssetRig {
  // 12-scallop fluted biscuit rim contour rotated flat into XZ (width ~2.3h -> radius ~1.15)
  const flutes = 12;
  const scallopCorners: CornerPoint2D[] = [];
  for (let i = 0; i < flutes * 2; i += 1) {
    const a = (i / (flutes * 2)) * TAU;
    const r = i % 2 === 0 ? 1.15 : 1.05;
    scallopCorners.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.08 });
  }
  const biscuitRim = extrudeContourSpec({
    outer: roundPolygon2D(scallopCorners, 2),
    depth: 0.52,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 1
  });

  // Domed golden-baked center crumb cushion
  const crumbProfile: ProceduralVec2[] = [
    [0, 0.02],
    [0.92, 0.02],
    [1.06, 0.22],
    [1.04, 0.52],
    [0.84, 0.72],
    [0.44, 0.82],
    [0, 0.85]
  ];
  const crumbDome = sculptOrganicLathe(crumbProfile, { segments: 24 });

  const doughLobe = composeLobe({
    suffix: "biscuit",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(biscuitRim, "#D69B4E", { position: [0, 0.28, 0], rotation: [-HALF_PI, 0, 0] }),
      part(crumbDome, "#DFAA62")
    ]
  });

  // 9 rich dark-chocolate kiss chips nestled into the baked top
  const chipGeo = coneSpec(0.145, 0.26, 8, 0.032);
  const chipCoords: readonly { readonly pos: ProceduralVec3; readonly rot: ProceduralVec3; readonly col: string }[] = [
    { pos: [0.02, 0.87, 0.04], rot: [0.06, 0.2, -0.05], col: "#4A2C1A" },
    { pos: [-0.46, 0.81, 0.28], rot: [0.12, 0.5, 0.14], col: "#3E2314" },
    { pos: [0.48, 0.8, 0.24], rot: [0.1, -0.4, -0.15], col: "#4A2C1A" },
    { pos: [-0.34, 0.82, -0.42], rot: [-0.14, 0.8, 0.1], col: "#4A2C1A" },
    { pos: [0.38, 0.81, -0.38], rot: [-0.12, -0.6, -0.12], col: "#3E2314" },
    { pos: [0.0, 0.77, 0.68], rot: [0.22, 0.0, 0.04], col: "#4A2C1A" },
    { pos: [-0.72, 0.74, -0.06], rot: [-0.04, 0.3, 0.22], col: "#3E2314" },
    { pos: [0.72, 0.74, -0.04], rot: [0.04, -0.3, -0.22], col: "#4A2C1A" },
    { pos: [0.04, 0.76, -0.68], rot: [-0.22, 0.1, -0.04], col: "#4A2C1A" }
  ];

  const chipLobe = composeLobe({
    suffix: "chocChips",
    craft: "lacquer",
    baseColor: "#FFFFFF",
    parts: chipCoords.map((c) => part(chipGeo, c.col, { position: c.pos, rotation: c.rot }))
  });

  return finalizeProceduralRig("cookie", [
    makeSubPartRig("body", [0, 0, 0], [doughLobe, chipLobe])
  ]);
}

// ---------------------------------------------------------------- 8. plate (0.08m, fitMode: "exact", restAt: 1.0, tintTarget: true)

function buildPlateRig(): ProceduralAssetRig {
  // Wide glazed stoneware dish: width 5.0h (radius 2.50), foot ring at y = 0.0, raised rim at exact y = 1.0
  const dishProfile: ProceduralVec2[] = [
    [0, 0.08],
    [1.34, 0.06],
    [1.42, 0.0],
    [1.56, 0.0],
    [1.86, 0.24],
    [2.44, 0.76],
    [2.5, 0.92],
    [2.4, 1.0],
    [2.24, 0.97],
    [1.86, 0.72],
    [1.46, 0.28],
    [0, 0.22]
  ];
  const dishGeo = sculptOrganicLathe(dishProfile, { segments: 22, creaseAngle: 1.35 });
  const outerBead = torusSpec(2.46, 0.036, 18, 4);

  const mainLobe = composeLobe({
    suffix: "stoneware",
    craft: "ceramic",
    baseColor: "#BFE0F2",
    tintTarget: true,
    parts: [
      part(dishGeo, "#FFFFFF"),
      part(outerBead, "#FFFFFF", { position: [0, 0.9, 0], rotation: [HALF_PI, 0, 0] })
    ]
  });

  const innerStripe = torusSpec(1.52, 0.026, 16, 4);
  const rimStripe = torusSpec(2.28, 0.026, 18, 4);
  const footRing = torusSpec(1.49, 0.025, 16, 4);
  const rimPip = smoothDropSpec(0.06, 0.018, 0.06, 8, 3);

  const trimLobe = composeLobe({
    suffix: "pinstripes",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    parts: [
      part(innerStripe, "#FFFDF8", { position: [0, 0.3, 0], rotation: [HALF_PI, 0, 0] }),
      part(rimStripe, "#F4D37E", { position: [0, 0.965, 0], rotation: [HALF_PI, 0, 0] }),
      part(footRing, "#EAE0D0", { position: [0, 0.026, 0], rotation: [HALF_PI, 0, 0] }),
      part(rimPip, "#FFFDF8", { position: [0, 0.955, 2.15] }),
      part(rimPip, "#FFFDF8", { position: [0, 0.955, -2.15] }),
      part(rimPip, "#FFFDF8", { position: [2.15, 0.955, 0] }),
      part(rimPip, "#FFFDF8", { position: [-2.15, 0.955, 0] })
    ]
  });

  return finalizeProceduralRig(
    "plate",
    [makeSubPartRig("body", [0, 0, 0], [mainLobe, trimLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 9. apple (0.25m)

function buildAppleRig(): ProceduralAssetRig {
  // Orchard ruby apple with bottom calyx dimple (y=0.04) and sunken top stem basin (y=0.70 inside r=0.18 shoulder)
  const appleProfile: ProceduralVec2[] = [
    [0, 0.045],
    [0.08, 0.015],
    [0.19, 0.0],
    [0.36, 0.08],
    [0.47, 0.25],
    [0.5, 0.48],
    [0.45, 0.68],
    [0.31, 0.8],
    [0.17, 0.82],
    [0.08, 0.76],
    [0.03, 0.71],
    [0, 0.7]
  ];
  const appleBody = sculptOrganicLathe(appleProfile, { segments: 26 });
  const cheekBlush = smoothDropSpec(0.14, 0.16, 0.03, 10, 5);
  const appleShine = smoothDropSpec(0.055, 0.095, 0.016, 8, 4);

  const skinLobe = composeLobe({
    suffix: "appleSkin",
    craft: "lacquer",
    baseColor: "#FFFFFF",
    parts: [
      part(appleBody, "#E44248"),
      part(cheekBlush, "#F56E5C", { position: [0.22, 0.5, 0.41], rotation: [0, 0.45, 0] }),
      part(appleShine, "#FFF7EC", { position: [-0.18, 0.64, 0.41], rotation: [-0.25, -0.38, 0.18] })
    ]
  });

  const twigStem = sculptCurvedLimb(
    [
      [0, 0.69, 0],
      [0.015, 0.84, 0.01],
      [0.065, 0.985, 0.02]
    ],
    (t) => 0.034 - 0.008 * t,
    { steps: 10, radialSegments: 8 }
  );
  const leafContour = roundPolygon2D(
    [
      { x: 0.0, y: 0.0, r: 0.01 },
      { x: 0.11, y: 0.075, r: 0.04 },
      { x: 0.26, y: 0.015, r: 0.018 },
      { x: 0.12, y: -0.065, r: 0.04 }
    ],
    2
  );
  const leafBlade = extrudeContourSpec({
    outer: leafContour,
    depth: 0.022,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 1
  });
  const leafVein = sculptCurvedLimb(
    [
      [0.01, 0.0, 0.013],
      [0.12, 0.006, 0.015],
      [0.23, 0.012, 0.013]
    ],
    0.009,
    { steps: 6, radialSegments: 6 }
  );
  const calyxCrown = coneSpec(0.065, 0.03, 8, 0.02);

  const foliageLobe = composeLobe({
    suffix: "stemAndLeaves",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(twigStem, "#6E472B"),
      part(calyxCrown, "#4D311E", { position: [0, 0.02, 0] }),
      part(leafBlade, "#4FB85E", {
        position: [0.035, 0.89, 0.015],
        rotation: [0.42, -0.25, 0.34]
      }),
      part(leafVein, "#8CE07E", {
        position: [0.035, 0.89, 0.015],
        rotation: [0.42, -0.25, 0.34]
      }),
      part(leafBlade, "#62C96B", {
        position: [-0.015, 0.85, -0.01],
        rotation: [-0.38, 2.7, -0.26],
        scale: 0.82
      }),
      part(leafVein, "#9BE88B", {
        position: [-0.015, 0.85, -0.01],
        rotation: [-0.38, 2.7, -0.26],
        scale: 0.82
      })
    ]
  });

  return finalizeProceduralRig("apple", [
    makeSubPartRig("body", [0, 0, 0], [skinLobe, foliageLobe])
  ]);
}

// ---------------------------------------------------------------- 10. banana (0.25m)

function buildBananaRig(): ProceduralAssetRig {
  // Smooth 5-ribbed cross-section swept along a golden crescent curve
  const ribSegs = 15;
  const bananaProfile: ProceduralVec2[] = [];
  for (let i = 0; i < ribSegs; i += 1) {
    const a = (i / ribSegs) * TAU;
    const rib = 1 + 0.095 * Math.cos(5 * a);
    bananaProfile.push([Math.cos(a) * rib, Math.sin(a) * rib * 0.92]);
  }

  const spinePts: ProceduralVec3[] = [
    [-0.48, 0.28, 0],
    [-0.28, 0.085, 0.015],
    [0.02, 0.065, 0.02],
    [0.29, 0.25, 0.01],
    [0.42, 0.62, 0],
    [0.37, 0.88, 0]
  ];
  const bananaBody = sweepGeometry({
    path: catmullRomCurve(spinePts),
    steps: 20,
    profile: bananaProfile,
    radius: (t) => {
      const taperStart = t < 0.14 ? Math.sin((t / 0.14) * HALF_PI) : 1;
      const taperEnd = t > 0.84 ? 0.34 + 0.66 * Math.sin(((1 - t) / 0.16) * HALF_PI) : 1;
      const swell = 0.86 + 0.2 * Math.sin(t * Math.PI);
      return 0.145 * swell * taperStart * taperEnd;
    },
    creaseAngle: 0.95,
    caps: true
  });

  const greenNeck = sculptCurvedLimb(
    [
      [0.38, 0.82, 0],
      [0.355, 0.91, 0]
    ],
    0.048,
    { steps: 6, radialSegments: 8 }
  );
  const bellyHighlight = sculptCurvedLimb(
    [
      [-0.26, 0.16, 0.12],
      [0.02, 0.14, 0.13],
      [0.26, 0.32, 0.11]
    ],
    0.022,
    { steps: 8, radialSegments: 6 }
  );

  const peelLobe = composeLobe({
    suffix: "peel",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(bananaBody, "#FFE052"),
      part(greenNeck, "#C9CE54"),
      part(bellyHighlight, "#FFF08A")
    ]
  });

  const woodyStem = sculptCurvedLimb(
    [
      [0.355, 0.9, 0],
      [0.32, 0.985, 0]
    ],
    0.036,
    { steps: 6, radialSegments: 8 }
  );
  const stemCutCap = smoothDropSpec(0.038, 0.016, 0.038, 8, 4);
  const blossomNib = coneSpec(0.045, 0.065, 8, 0.012);
  const sugarFreckle = smoothDropSpec(0.018, 0.018, 0.01, 6, 4);

  const stemLobe = composeLobe({
    suffix: "stemAndTip",
    craft: "wood",
    baseColor: "#FFFFFF",
    parts: [
      part(woodyStem, "#7A5233"),
      part(stemCutCap, "#A37952", { position: [0.316, 0.992, 0], rotation: [0, 0, 0.32] }),
      part(blossomNib, "#4A2E1B", { position: [-0.495, 0.295, 0], rotation: [0, 0, 0.85] }),
      part(sugarFreckle, "#D99B26", { position: [-0.08, 0.14, 0.155] }),
      part(sugarFreckle, "#D99B26", { position: [0.14, 0.24, 0.15] }),
      part(sugarFreckle, "#D99B26", { position: [0.28, 0.44, -0.14] })
    ]
  });

  return finalizeProceduralRig("banana", [
    makeSubPartRig("body", [0, 0, 0], [peelLobe, stemLobe])
  ]);
}

// ---------------------------------------------------------------- 11. cake (0.38m, fitMode: "exact", restAt: 1.0)

function buildCakeRig(): ProceduralAssetRig {
  // Cake board resting on exact y = 0.0 + fluffy two-layer vanilla sponge (y: 0.035..0.55)
  const boardGeo = latheGeometry({
    profile: [
      [0, 0.0],
      [0.675, 0.0],
      [0.68, 0.038],
      [0, 0.038]
    ],
    segments: 18,
    creaseAngle: 1.1
  });
  const spongeGeo = latheGeometry({
    profile: [
      [0, 0.036],
      [0.61, 0.036],
      [0.625, 0.26],
      [0.6, 0.29],
      [0.625, 0.32],
      [0.615, 0.545],
      [0, 0.545]
    ],
    segments: 20,
    creaseAngle: 1.25
  });
  // Tiny dark candle wick centered at [0, y, 0] ending STRICTLY at [0, 1.0, 0]!
  const wickGeo = latheGeometry({
    profile: [
      [0, 0.945],
      [0.011, 0.945],
      [0.009, 0.992],
      [0.004, 0.999],
      [0, 1.0]
    ],
    segments: 8,
    creaseAngle: Math.PI
  });

  const spongeLobe = composeLobe({
    suffix: "spongeAndWick",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(boardGeo, "#FFF8EE"),
      part(spongeGeo, "#F4CE86"),
      part(wickGeo, "#2D211E")
    ]
  });

  // Scalloped strawberry-pink icing crown + 8 piped rosettes + central wax candle (y: 0.56..0.96)
  const dripCount = 12;
  const icingCorners: CornerPoint2D[] = [];
  for (let i = 0; i < dripCount * 2; i += 1) {
    const a = (i / (dripCount * 2)) * TAU;
    const r = i % 2 === 0 ? 0.65 : 0.605;
    icingCorners.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.045 });
  }
  const icingCrown = extrudeContourSpec({
    outer: roundPolygon2D(icingCorners, 1),
    depth: 0.12,
    bevelThickness: 0.028,
    bevelSize: 0.024,
    bevelSegments: 1
  });
  const icingTopCap = latheGeometry({
    profile: [
      [0, 0.54],
      [0.61, 0.54],
      [0.58, 0.575],
      [0, 0.58]
    ],
    segments: 18,
    creaseAngle: Math.PI
  });
  const rosetteGeo = latheGeometry({
    profile: [
      [0, -0.02],
      [0.068, -0.01],
      [0.042, 0.028],
      [0, 0.05]
    ],
    segments: 7,
    creaseAngle: 1.2
  });
  const candleWax = latheGeometry({
    profile: [
      [0, 0.56],
      [0.048, 0.56],
      [0.045, 0.952],
      [0.024, 0.96],
      [0, 0.955]
    ],
    segments: 10,
    creaseAngle: 1.2
  });

  const icingParts: LobePartInput[] = [
    part(icingCrown, "#F79AC0", { position: [0, 0.51, 0], rotation: [-HALF_PI, 0, 0] }),
    part(icingTopCap, "#F9B0CE"),
    part(candleWax, "#FFFDF9")
  ];
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * TAU;
    icingParts.push(
      part(rosetteGeo, k % 2 === 0 ? "#FFF6FA" : "#FFE4EE", {
        position: [Math.cos(a) * 0.48, 0.58, Math.sin(a) * 0.48]
      })
    );
  }
  const icingLobe = composeLobe({
    suffix: "icingAndCandle",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    parts: icingParts
  });

  // Jam filling stripe + 8 rainbow sugar sprinkles + 2 candy candle stripes
  const jamStripe = torusSpec(0.612, 0.018, 16, 4);
  const candleStripe = torusSpec(0.047, 0.009, 10, 4);
  const sprinkleGeo = latheGeometry({
    profile: [
      [0, -0.032],
      [0.014, -0.024],
      [0.014, 0.024],
      [0, 0.032]
    ],
    segments: 5,
    creaseAngle: Math.PI
  });
  const sprinkleColors = ["#FFE066", "#6CB4EE", "#7ED6AE", "#FF7B89"] as const;

  const glossParts: LobePartInput[] = [
    part(jamStripe, "#E44D64", { position: [0, 0.29, 0], rotation: [HALF_PI, 0, 0] }),
    part(candleStripe, "#5FA8E8", { position: [0, 0.68, 0], rotation: [1.35, 0, 0] }),
    part(candleStripe, "#F77E9E", { position: [0, 0.82, 0], rotation: [1.35, 0, 0] })
  ];
  for (let s = 0; s < 8; s += 1) {
    const a = ((s + 0.5) / 8) * TAU;
    const col = sprinkleColors[s % sprinkleColors.length]!;
    glossParts.push(
      part(sprinkleGeo, col, {
        position: [Math.cos(a) * 0.27, 0.584, Math.sin(a) * 0.27],
        rotation: [HALF_PI, a * 1.7, 0.4]
      })
    );
  }
  const glossLobe = composeLobe({
    suffix: "sprinkles",
    craft: "lacquer",
    baseColor: "#FFFFFF",
    parts: glossParts
  });

  return finalizeProceduralRig(
    "cake",
    [makeSubPartRig("body", [0, 0, 0], [spongeLobe, icingLobe, glossLobe])],
    { fitMode: "exact" }
  );
}

// ---------------------------------------------------------------- 12. candleFlame (0.07m)

function buildCandleFlameRig(): ProceduralAssetRig {
  const outerProfile = bezierProfilePoints(
    [0, 0.03],
    [
      { cp1: [0.14, 0.03], cp2: [0.26, 0.14], to: [0.25, 0.34] },
      { cp1: [0.24, 0.56], cp2: [0.11, 0.82], to: [0.022, 0.98] },
      { cp1: [0.008, 0.996], cp2: [0.002, 1.0], to: [0, 1.0] }
    ],
    4
  );
  const outerFlame = sculptOrganicLathe(outerProfile, { segments: 14 });
  const baseGlowCup = smoothDropSpec(0.18, 0.12, 0.18, 10, 4);

  const amberLobe = composeLobe({
    suffix: "outerFlame",
    craft: "warmGlow",
    baseColor: "#FFAE2B",
    emissive: "#FFAE2B",
    emissiveIntensity: 1.35,
    castShadow: false,
    receiveShadow: false,
    parts: [
      part(outerFlame, "#FFAE2B"),
      part(baseGlowCup, "#FF9424", { position: [0, 0.12, 0] })
    ]
  });

  // Inner white-gold core tongues sculpted proud on +Z and -Z so steady inner radiance is visible 360°
  const coreTongue = smoothDropSpec(0.13, 0.24, 0.14, 10, 4);
  const coreLobe = composeLobe({
    suffix: "innerCore",
    craft: "warmGlow",
    baseColor: "#FFF7CE",
    emissive: "#FFF7CE",
    emissiveIntensity: 1.45,
    castShadow: false,
    receiveShadow: false,
    parts: [
      part(coreTongue, "#FFF7CE", { position: [0, 0.34, 0.1] }),
      part(coreTongue, "#FFF7CE", { position: [0, 0.34, -0.1] })
    ]
  });

  return finalizeProceduralRig("candleFlame", [
    makeSubPartRig("body", [0, 0, 0], [amberLobe, coreLobe])
  ]);
}

// ---------------------------------------------------------------- 13. pastryCircle, pastrySquare, pastryTriangle (0.08m, tintTarget: true)

function buildTartGarnishLobes(
  outerShellCorners: readonly CornerPoint2D[],
  glazeCorners: readonly CornerPoint2D[],
  pipPositions: readonly ProceduralVec3[]
): readonly [ReturnType<typeof composeLobe>, ReturnType<typeof composeLobe>, ReturnType<typeof composeLobe>] {
  const glazeBlanket = extrudeContourSpec({
    outer: roundPolygon2D(glazeCorners, 2),
    depth: 0.28,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 1
  });
  const glazeSwirl = smoothDropSpec(0.18, 0.08, 0.18, 8, 4);

  const glazeLobe = composeLobe({
    suffix: "glaze",
    craft: "lacquer",
    baseColor: "#F6A6C1",
    tintTarget: true,
    parts: [
      part(glazeBlanket, "#FFFFFF", { position: [0, 0.56, 0], rotation: [-HALF_PI, 0, 0] }),
      ...pipPositions.map((pos) => part(glazeSwirl, "#FFFFFF", { position: pos }))
    ]
  });

  const tartBase = extrudeContourSpec({
    outer: roundPolygon2D(outerShellCorners, 2),
    depth: 0.5,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 1
  });
  const tartFoot = extrudeContourSpec({
    outer: roundPolygon2D(glazeCorners, 1),
    depth: 0.14,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 1
  });

  const crustLobe = composeLobe({
    suffix: "tartCrust",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(tartBase, "#E5B168", { position: [0, 0.3, 0], rotation: [-HALF_PI, 0, 0] }),
      part(tartFoot, "#D69A4C", { position: [0, 0.1, 0], rotation: [-HALF_PI, 0, 0] })
    ]
  });

  const creamDollop = coneSpec(0.42, 0.22, 10, 0.08);
  const berryTopper = smoothDropSpec(0.22, 0.16, 0.22, 10, 5);
  const mintLeaf = smoothDropSpec(0.18, 0.045, 0.09, 8, 4);

  const garnishLobe = composeLobe({
    suffix: "garnish",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    parts: [
      part(creamDollop, "#FFFDF8", { position: [0, 0.72, 0] }),
      part(berryTopper, "#DF3C4A", { position: [0, 0.84, 0] }),
      part(mintLeaf, "#68C777", { position: [0.22, 0.78, 0.08], rotation: [0.15, -0.35, -0.25] })
    ]
  });

  return [glazeLobe, crustLobe, garnishLobe];
}

function buildPastryCircleRig(): ProceduralAssetRig {
  // Fluted circular tart shell (width ~3.75h -> radius ~1.875)
  const flutes = 14;
  const outerCorners: CornerPoint2D[] = [];
  for (let i = 0; i < flutes * 2; i += 1) {
    const a = (i / (flutes * 2)) * TAU;
    const r = i % 2 === 0 ? 1.875 : 1.74;
    outerCorners.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.12 });
  }
  const glazeCorners: CornerPoint2D[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * TAU;
    glazeCorners.push({ x: Math.cos(a) * 1.48, y: Math.sin(a) * 1.48, r: 0.16 });
  }
  const lobes = buildTartGarnishLobes(outerCorners, glazeCorners, [
    [0, 0.68, 1.08],
    [-0.94, 0.68, -0.54],
    [0.94, 0.68, -0.54]
  ]);
  return finalizeProceduralRig("pastryCircle", [makeSubPartRig("body", [0, 0, 0], lobes)]);
}

function buildPastrySquareRig(): ProceduralAssetRig {
  // Chamfered scalloped square tart shell (width ~3.75h -> half-span 1.86)
  const outerCorners: CornerPoint2D[] = [
    { x: -1.86, y: -1.86, r: 0.34 },
    { x: 0.0, y: -1.92, r: 0.25 },
    { x: 1.86, y: -1.86, r: 0.34 },
    { x: 1.92, y: 0.0, r: 0.25 },
    { x: 1.86, y: 1.86, r: 0.34 },
    { x: 0.0, y: 1.92, r: 0.25 },
    { x: -1.86, y: 1.86, r: 0.34 },
    { x: -1.92, y: 0.0, r: 0.25 }
  ];
  const glazeCorners: CornerPoint2D[] = [
    { x: -1.46, y: -1.46, r: 0.28 },
    { x: 1.46, y: -1.46, r: 0.28 },
    { x: 1.46, y: 1.46, r: 0.28 },
    { x: -1.46, y: 1.46, r: 0.28 }
  ];
  const lobes = buildTartGarnishLobes(outerCorners, glazeCorners, [
    [-0.96, 0.68, -0.96],
    [0.96, 0.68, -0.96],
    [-0.96, 0.68, 0.96],
    [0.96, 0.68, 0.96]
  ]);
  return finalizeProceduralRig("pastrySquare", [makeSubPartRig("body", [0, 0, 0], lobes)]);
}

function buildPastryTriangleRig(): ProceduralAssetRig {
  // Chamfered triangular tart shell (width ~3.9h, depth ~3.5h)
  const outerCorners: CornerPoint2D[] = [
    { x: 0.0, y: 2.12, r: 0.34 },
    { x: -2.26, y: -1.66, r: 0.34 },
    { x: 2.26, y: -1.66, r: 0.34 }
  ];
  const glazeCorners: CornerPoint2D[] = [
    { x: 0.0, y: 1.62, r: 0.28 },
    { x: -1.72, y: -1.28, r: 0.28 },
    { x: 1.72, y: -1.28, r: 0.28 }
  ];
  const lobes = buildTartGarnishLobes(outerCorners, glazeCorners, [
    [0, 0.68, -0.95],
    [-0.86, 0.68, 0.56],
    [0.86, 0.68, 0.56]
  ]);
  return finalizeProceduralRig("pastryTriangle", [makeSubPartRig("body", [0, 0, 0], lobes)]);
}

// ---------------------------------------------------------------- 14. partyHat (0.30m, tintTarget: true)

function buildPartyHatRig(): ProceduralAssetRig {
  const coneProfile: ProceduralVec2[] = [
    [0, 0.04],
    [0.34, 0.04],
    [0.245, 0.33],
    [0.145, 0.62],
    [0.048, 0.88],
    [0, 0.89]
  ];
  const coneBody = sculptOrganicLathe(coneProfile, { segments: 22 });
  const midSeam = torusSpec(0.195, 0.012, 16, 5);

  const coneLobe = composeLobe({
    suffix: "cone",
    craft: "felt",
    baseColor: "#4FA3E0",
    tintTarget: true,
    parts: [
      part(coneBody, "#FFFFFF"),
      part(midSeam, "#FFFFFF", { position: [0, 0.46, 0], rotation: [HALF_PI, 0, 0] })
    ]
  });

  // Scalloped brim ruffle + fluffy multi-tuft yarn pom-pom at y = 1.0
  const ruffleFlutes = 12;
  const ruffleCorners: CornerPoint2D[] = [];
  for (let i = 0; i < ruffleFlutes * 2; i += 1) {
    const a = (i / (ruffleFlutes * 2)) * TAU;
    const r = i % 2 === 0 ? 0.375 : 0.325;
    ruffleCorners.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: 0.025 });
  }
  const brimRuffle = extrudeContourSpec({
    outer: roundPolygon2D(ruffleCorners, 1),
    depth: 0.075,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 1
  });
  const pomCore = smoothDropSpec(0.105, 0.095, 0.105, 12, 6);
  const pomTuft = smoothDropSpec(0.065, 0.065, 0.065, 8, 4);

  const trimLobe = composeLobe({
    suffix: "ruffleAndPom",
    craft: "felt",
    baseColor: "#FFFFFF",
    parts: [
      part(brimRuffle, "#FFD859", { position: [0, 0.04, 0], rotation: [-HALF_PI, 0, 0] }),
      part(pomCore, "#FFE066", { position: [0, 0.905, 0] }),
      part(pomTuft, "#FFF5C4", { position: [0, 0.94, 0] }),
      part(pomTuft, "#FFD24C", { position: [-0.045, 0.9, 0.04] }),
      part(pomTuft, "#FFF5C4", { position: [0.045, 0.9, -0.04] })
    ]
  });

  // 6 raised pastel polka-dot medallions spiraled around the cone slope
  const dotGeo = smoothDropSpec(0.048, 0.048, 0.02, 8, 4);
  const dotColors = ["#FFF6DA", "#F7B4CE", "#A7E4C2"] as const;
  const dotParts: LobePartInput[] = [];
  for (let d = 0; d < 6; d += 1) {
    const fracY = 0.22 + (d % 3) * 0.21;
    const coneR = 0.34 * (1 - (fracY - 0.04) / 0.88);
    const ang = (d / 6) * TAU + 0.35;
    dotParts.push(
      part(dotGeo, dotColors[d % dotColors.length]!, {
        position: [Math.sin(ang) * coneR, fracY, Math.cos(ang) * coneR],
        rotation: [-0.34, ang, 0]
      })
    );
  }
  const dotsLobe = composeLobe({
    suffix: "polkaDots",
    craft: "ceramic",
    baseColor: "#FFFFFF",
    parts: dotParts
  });

  return finalizeProceduralRig("partyHat", [
    makeSubPartRig("body", [0, 0, 0], [coneLobe, trimLobe, dotsLobe])
  ]);
}

// ---------------------------------------------------------------- 15. hat (0.20m, width: 2.2h, tintTarget: true)

function buildHatRig(): ProceduralAssetRig {
  // Wide-brim sun hat: rounded crown + gently waved floppy brim (radius ~1.10 -> width 2.2h)
  const hatProfile: ProceduralVec2[] = [
    [0, 0.16],
    [0.52, 0.18],
    [0.62, 0.14],
    [1.06, 0.06],
    [1.1, 0.1],
    [1.04, 0.16],
    [0.58, 0.25],
    [0.54, 0.62],
    [0.44, 0.88],
    [0.2, 0.98],
    [0, 1.0]
  ];
  const wavyHat = sculptOrganicLathe(hatProfile, {
    segments: 18,
    modulate: (theta, _v, baseR) => {
      const brimFactor = Math.max(0, (baseR - 0.58) / 0.52);
      return {
        dy: Math.sin(theta * 3) * 0.055 * brimFactor
      };
    }
  });
  const crownButton = smoothDropSpec(0.08, 0.035, 0.08, 8, 4);

  const feltLobe = composeLobe({
    suffix: "sunHat",
    craft: "felt",
    baseColor: "#E4574B",
    tintTarget: true,
    parts: [
      part(wavyHat, "#FFFFFF"),
      part(crownButton, "#FFFFFF", { position: [0, 0.99, 0] })
    ]
  });

  // Contrast cream grosgrain ribbon band + bow loops + tails
  const ribbonBand = torusSpec(0.575, 0.05, 20, 5);
  const bowLoop = smoothDropSpec(0.16, 0.095, 0.055, 8, 4);
  const bowKnot = smoothDropSpec(0.065, 0.075, 0.055, 8, 4);
  const bowTail = smoothDropSpec(0.06, 0.16, 0.03, 8, 4);
  const goldPin = smoothDropSpec(0.032, 0.032, 0.02, 8, 4);

  const ribbonLobe = composeLobe({
    suffix: "grosgrainRibbon",
    craft: "felt",
    baseColor: "#FFFFFF",
    parts: [
      part(ribbonBand, "#FFF7EC", { position: [0, 0.29, 0], rotation: [HALF_PI, 0, 0] }),
      part(bowKnot, "#FFF7EC", { position: [0.38, 0.31, 0.45], rotation: [0, 0.72, 0] }),
      part(bowLoop, "#FFF7EC", { position: [0.27, 0.34, 0.53], rotation: [0.1, 0.55, 0.22] }),
      part(bowLoop, "#FFF7EC", { position: [0.48, 0.34, 0.35], rotation: [-0.1, 0.9, -0.22] }),
      part(bowTail, "#F6E9D5", { position: [0.33, 0.21, 0.55], rotation: [0.65, 0.6, -0.25] }),
      part(bowTail, "#F6E9D5", { position: [0.49, 0.21, 0.41], rotation: [0.65, 0.85, 0.25] }),
      part(goldPin, "#F4CE6A", { position: [0.4, 0.31, 0.48], rotation: [0, 0.72, 0] })
    ]
  });

  return finalizeProceduralRig("hat", [
    makeSubPartRig("body", [0, 0, 0], [feltLobe, ribbonLobe])
  ]);
}

// ---------------------------------------------------------------- 16. sponge (0.15m, width: 2.0h, depth: 1.4h, tintTarget: true)

function buildSpongeRig(): ProceduralAssetRig {
  // Waisted figure-8 cellulose sponge contour (x in [-1.0, +1.0], y in [-0.7, +0.7]) rotated flat into XZ
  const figure8Corners: CornerPoint2D[] = [
    { x: 0.0, y: 0.48, r: 0.18 },
    { x: -0.56, y: 0.7, r: 0.24 },
    { x: -1.0, y: 0.38, r: 0.22 },
    { x: -1.0, y: -0.38, r: 0.22 },
    { x: -0.56, y: -0.7, r: 0.24 },
    { x: 0.0, y: -0.48, r: 0.18 },
    { x: 0.56, y: -0.7, r: 0.24 },
    { x: 1.0, y: -0.38, r: 0.22 },
    { x: 1.0, y: 0.38, r: 0.22 },
    { x: 0.56, y: 0.7, r: 0.24 }
  ];
  const spongeBody = extrudeContourSpec({
    outer: roundPolygon2D(figure8Corners, 2),
    depth: 0.94,
    bevelThickness: 0.14,
    bevelSize: 0.11,
    bevelSegments: 2
  });
  const waistBand = extrudeContourSpec({
    outer: roundPolygon2D(figure8Corners, 1),
    depth: 0.18,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 1
  });

  const bodyLobe = composeLobe({
    suffix: "cellulose",
    craft: "felt",
    baseColor: "#F7E26B",
    tintTarget: true,
    parts: [
      part(spongeBody, "#FFFFFF", { position: [0, 0.5, 0], rotation: [-HALF_PI, 0, 0] }),
      part(waistBand, "#FFFFFF", { position: [0, 0.5, 0], rotation: [-HALF_PI, 0, 0], scale: [1.015, 1.015, 1] })
    ]
  });

  // 8 subtle darker honey-ochre pore dimples across top and sides
  const poreGeo = smoothDropSpec(0.12, 0.032, 0.1, 8, 4);
  const sidePore = smoothDropSpec(0.09, 0.09, 0.03, 8, 4);
  const poreLobe = composeLobe({
    suffix: "pores",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(poreGeo, "#D4AE3E", { position: [-0.52, 0.965, 0.22] }),
      part(poreGeo, "#C89F32", { position: [-0.36, 0.965, -0.24] }),
      part(poreGeo, "#D4AE3E", { position: [0.48, 0.965, -0.2] }),
      part(poreGeo, "#C89F32", { position: [0.38, 0.965, 0.26] }),
      part(poreGeo, "#D4AE3E", { position: [0.0, 0.965, 0.04], scale: 0.85 }),
      part(poreGeo, "#C89F32", { position: [-0.66, 0.965, -0.02], scale: 0.78 }),
      part(sidePore, "#C89F32", { position: [-0.48, 0.5, 0.67], rotation: [0, -0.18, 0] }),
      part(sidePore, "#D4AE3E", { position: [0.48, 0.5, 0.67], rotation: [0, 0.18, 0] })
    ]
  });

  return finalizeProceduralRig("sponge", [
    makeSubPartRig("body", [0, 0, 0], [bodyLobe, poreLobe])
  ]);
}

// ---------------------------------------------------------------- 17. towel (0.12m, width: 3.0h, depth: 2.2h, tintTarget: true)

function buildTowelRig(): ProceduralAssetRig {
  // Double-folded plush terry-cloth stack with rolled front fold edges
  const lowerFold = roundedBoxSpec(2.94, 0.48, 2.08, 0.14, 2);
  const upperFold = roundedBoxSpec(2.84, 0.48, 1.96, 0.14, 2);
  const lowerRoll = capsuleSpec(0.24, 2.48, 12, 4);
  const upperRoll = capsuleSpec(0.23, 2.38, 12, 4);

  const plushLobe = composeLobe({
    suffix: "terryStack",
    craft: "felt",
    craftTexture: "quiltedStitch",
    baseColor: "#A8DDB5",
    tintTarget: true,
    parts: [
      part(lowerFold, "#FFFFFF", { position: [0, 0.24, -0.04] }),
      part(upperFold, "#FFFFFF", { position: [0.02, 0.74, -0.08] }),
      part(lowerRoll, "#FFFFFF", { position: [0, 0.25, 0.92], rotation: [0, 0, HALF_PI] }),
      part(upperRoll, "#FFFFFF", { position: [0.02, 0.75, 0.86], rotation: [0, 0, HALF_PI] })
    ]
  });

  // Contrast woven jacquard border stripes + corner care tag
  const topStripeMain = roundedBoxSpec(2.86, 0.045, 0.22, 0.015, 2);
  const topStripeThin = roundedBoxSpec(2.86, 0.04, 0.09, 0.012, 2);
  const rollBand = torusSpec(0.238, 0.022, 14, 5);
  const careTag = roundedBoxSpec(0.28, 0.03, 0.18, 0.008, 2);

  const borderLobe = composeLobe({
    suffix: "wovenBorder",
    craft: "felt",
    baseColor: "#FFFFFF",
    parts: [
      part(topStripeMain, "#FFF8EE", { position: [0.02, 0.975, 0.56] }),
      part(topStripeThin, "#F2CE74", { position: [0.02, 0.978, 0.34] }),
      part(rollBand, "#FFF8EE", { position: [-0.95, 0.75, 0.86], rotation: [0, HALF_PI, 0] }),
      part(rollBand, "#FFF8EE", { position: [0.99, 0.75, 0.86], rotation: [0, HALF_PI, 0] }),
      part(rollBand, "#FFF8EE", { position: [-1.02, 0.25, 0.92], rotation: [0, HALF_PI, 0] }),
      part(careTag, "#FFFDF9", { position: [1.34, 0.5, 0.45], rotation: [0, 0.12, -0.18] })
    ]
  });

  return finalizeProceduralRig("towel", [
    makeSubPartRig("body", [0, 0, 0], [plushLobe, borderLobe])
  ]);
}

// ---------------------------------------------------------------- 18. toothbrush (0.40m)

function buildToothbrushRig(): ProceduralAssetRig {
  const standFoot = cylinderSpec(0.062, 0.082, 0.045, 14, 0.008);
  const curvedHandle = sculptCurvedLimb(
    [
      [0, 0.025, 0],
      [0, 0.26, 0.035],
      [0, 0.54, -0.028],
      [0, 0.76, 0.008]
    ],
    (t) => 0.052 - 0.014 * t + 0.008 * Math.sin(t * Math.PI),
    { steps: 14, radialSegments: 10 }
  );
  const headPaddle = roundedBoxSpec(0.11, 0.23, 0.052, 0.02, 2);
  const pasteAqua = sculptCurvedLimb(
    [
      [0, 0.81, 0.125],
      [0.016, 0.89, 0.142],
      [-0.012, 0.96, 0.132],
      [0.006, 0.995, 0.105]
    ],
    (t) => 0.032 * Math.sin(Math.max(0.15, 1 - t * 0.65) * HALF_PI),
    { steps: 10, radialSegments: 8 }
  );

  const handleLobe = composeLobe({
    suffix: "mintHandle",
    craft: "lacquer",
    baseColor: "#FFFFFF",
    parts: [
      part(standFoot, "#56BE95", { position: [0, 0.022, 0] }),
      part(curvedHandle, "#7ED6AE"),
      part(headPaddle, "#7ED6AE", { position: [0, 0.885, 0.018], rotation: [-0.06, 0, 0] }),
      part(pasteAqua, "#45C8D6")
    ]
  });

  // Cushioned rubber thumb grip + 3 raised tactile ribs
  const thumbPad = smoothDropSpec(0.048, 0.11, 0.024, 10, 5);
  const gripRib = torusSpec(0.052, 0.009, 12, 5);
  const gripLobe = composeLobe({
    suffix: "thumbGrip",
    craft: "rubber",
    baseColor: "#FFFFFF",
    parts: [
      part(thumbPad, "#47AD86", { position: [0, 0.4, 0.022] }),
      part(gripRib, "#FFFDF8", { position: [0, 0.35, 0.014], rotation: [HALF_PI, 0, 0] }),
      part(gripRib, "#FFFDF8", { position: [0, 0.4, 0.008], rotation: [HALF_PI, 0, 0] }),
      part(gripRib, "#FFFDF8", { position: [0, 0.45, 0.0], rotation: [HALF_PI, 0, 0] })
    ]
  });

  // 6 neat rows of rounded white bristles + white toothpaste swirl stripe
  const bristleRow = extrudeContourSpec({
    outer: roundPolygon2D(
      [
        { x: -0.044, y: -0.012, r: 0.005 },
        { x: 0.044, y: -0.012, r: 0.005 },
        { x: 0.044, y: 0.012, r: 0.005 },
        { x: -0.044, y: 0.012, r: 0.005 }
      ],
      1
    ),
    depth: 0.075,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1
  });
  const pasteWhite = sculptCurvedLimb(
    [
      [-0.01, 0.82, 0.132],
      [0.02, 0.895, 0.148],
      [-0.006, 0.962, 0.138]
    ],
    0.016,
    { steps: 8, radialSegments: 6 }
  );

  const bristleParts: LobePartInput[] = [part(pasteWhite, "#FFFDF9")];
  for (let r = 0; r < 6; r += 1) {
    const ry = 0.795 + r * 0.034;
    bristleParts.push(
      part(bristleRow, r % 2 === 0 ? "#FFFFFF" : "#F0FAF7", {
        position: [0, ry, 0.074]
      })
    );
  }
  const bristleLobe = composeLobe({
    suffix: "bristles",
    craft: "felt",
    baseColor: "#FFFFFF",
    parts: bristleParts
  });

  return finalizeProceduralRig("toothbrush", [
    makeSubPartRig("body", [0, 0, 0], [handleLobe, gripLobe, bristleLobe])
  ]);
}

// ---------------------------------------------------------------- 19. sun (0.80m)

function buildSunRig(): ProceduralAssetRig {
  // Plump pillowed golden sun cushion + 12 alternating long/short rounded corona rays (y: 0..1)
  const sunCushion = smoothDropSpec(0.295, 0.295, 0.145, 20, 10);
  const longRay = latheGeometry({
    profile: [
      [0, -0.085],
      [0.062, -0.055],
      [0.036, 0.045],
      [0.012, 0.082],
      [0, 0.09]
    ],
    segments: 7,
    creaseAngle: 1.25
  });
  const shortRay = latheGeometry({
    profile: [
      [0, -0.065],
      [0.05, -0.04],
      [0.028, 0.035],
      [0, 0.068]
    ],
    segments: 7,
    creaseAngle: 1.25
  });

  const glowParts: LobePartInput[] = [part(sunCushion, "#FFD046", { position: [0, 0.5, 0] })];
  for (let k = 0; k < 12; k += 1) {
    const a = HALF_PI + (k / 12) * TAU;
    const isLong = k % 2 === 0;
    const dist = isLong ? 0.41 : 0.375;
    glowParts.push(
      part(isLong ? longRay : shortRay, isLong ? "#FFBE3B" : "#FFE06B", {
        position: [Math.cos(a) * dist, 0.5 + Math.sin(a) * dist, 0],
        rotation: [0, 0, a - HALF_PI]
      })
    );
  }

  const sunGlowLobe = composeLobe({
    suffix: "coronaGlow",
    craft: "warmGlow",
    baseColor: "#FFD046",
    emissive: "#FFD046",
    emissiveIntensity: 0.32,
    parts: glowParts
  });

  const innerHalo = torusSpec(0.305, 0.028, 20, 6);
  const sunMedallion = smoothDropSpec(0.18, 0.18, 0.025, 12, 5);
  const rimLobe = composeLobe({
    suffix: "sunRelief",
    craft: "clay",
    baseColor: "#FFFFFF",
    parts: [
      part(innerHalo, "#FFE684", { position: [0, 0.5, 0] }),
      part(sunMedallion, "#FFE891", { position: [0, 0.5, 0.138] }),
      part(sunMedallion, "#FFE891", { position: [0, 0.5, -0.138] })
    ]
  });

  return finalizeProceduralRig("sun", [
    makeSubPartRig("body", [0, 0, 0], [sunGlowLobe, rimLobe])
  ]);
}

// ---------------------------------------------------------------- exported 24-rig catalog

export const PLAY_FOOD_LETTER_RIGS: Readonly<Record<PlayFoodLetterAssetKey, ProceduralAssetRig>> = {
  ball: buildBallRig(),
  bubble: buildBubbleRig(),
  bubbleWand: buildBubbleWandRig(),
  balloon: buildBalloonRig(),
  toyBlock: buildToyBlockRig(),
  letterB: buildLetterBRig(),
  letterBLower: buildLetterBLowerRig(),
  letterA: buildLetterARig(),
  letterALower: buildLetterALowerRig(),
  cookie: buildCookieRig(),
  plate: buildPlateRig(),
  apple: buildAppleRig(),
  banana: buildBananaRig(),
  cake: buildCakeRig(),
  candleFlame: buildCandleFlameRig(),
  pastryCircle: buildPastryCircleRig(),
  pastrySquare: buildPastrySquareRig(),
  pastryTriangle: buildPastryTriangleRig(),
  partyHat: buildPartyHatRig(),
  hat: buildHatRig(),
  sponge: buildSpongeRig(),
  towel: buildTowelRig(),
  toothbrush: buildToothbrushRig(),
  sun: buildSunRig()
};
