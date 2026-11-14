// Tiko Procedural Hero Rig (PRD 09 B.8 / B3.7): gentle sea-green little turtle.
// Multi-craft storybook tactile sculpt:
//   - "clay" soft sage-green turtle skin (#6BC49C / #86D4B0 / #4BA37F)
//   - "wood" warm patterned amber-terracotta hexagonal scute shell (#D89B56 / #8A5A36)
//   - "felt" warm cream quilted belly plastron (#F3E6C8), cosy neckerchief & rosy cheek puffs
//   - "lacquer" 4-layer liquid-gloss cabochon eyes
// Zero external .glb files, zero unsafe type assertions, zero console calls, zero network APIs.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import type { ProceduralVec2, ProceduralVec3 } from "@aura3d/engine/procedural";
import type { SubPartId } from "../articulated-actors.js";
import type { Vec3 } from "../motion.js";
import {
  bezierProfilePoints,
  composeLobe,
  ensureOutwardNormals,
  extrudeContourSpec,
  finalizeProceduralRig,
  makeSubPartRig,
  part,
  sculptCurvedLimb,
  sculptOrganicLathe,
  type BuiltSubPart,
  type LobePartInput,
  type ProceduralAssetRig
} from "./rig-kit.js";

const TAU = Math.PI * 2;

/**
 * Analytic smooth ellipsoid / puff with shared pole fans (zero degenerate pole quads).
 */
function smoothPuffSpec(
  rx: number,
  ry: number,
  rz: number,
  uSegs = 12,
  rings = 6,
  topTaper = 0
): AuraCustomGeometrySpec {
  const seg = Math.max(5, uSegs);
  const rng = Math.max(3, rings);
  const positions: number[] = [0, -ry, 0];
  const normals: number[] = [0, -1, 0];
  const uvs: number[] = [0.5, 0];
  const indices: number[] = [];

  for (let r = 1; r < rng; r += 1) {
    const v = r / rng;
    const phi = (v - 0.5) * Math.PI;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const taper = 1 - topTaper * Math.max(0, sinPhi);
    const effRx = Math.max(1e-5, rx * taper);
    const effRz = Math.max(1e-5, rz * taper);
    const effRy = Math.max(1e-5, ry);

    for (let s = 0; s <= seg; s += 1) {
      const u = s / seg;
      const theta = u * TAU;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);
      const px = sinT * cosPhi * effRx;
      const py = sinPhi * effRy;
      const pz = cosT * cosPhi * effRz;
      positions.push(px, py, pz);

      const nx = (sinT * cosPhi) / effRx;
      const ny = sinPhi / effRy;
      const nz = (cosT * cosPhi) / effRz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nl, ny / nl, nz / nl);
      uvs.push(u, v);
    }
  }

  const northPole = positions.length / 3;
  positions.push(0, ry, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 1);

  const stride = seg + 1;
  for (let s = 0; s < seg; s += 1) {
    indices.push(0, 1 + s + 1, 1 + s);
  }
  for (let r = 0; r < rng - 2; r += 1) {
    const rowA = 1 + r * stride;
    const rowB = rowA + stride;
    for (let s = 0; s < seg; s += 1) {
      const a = rowA + s;
      const b = a + 1;
      const c = rowB + s;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const topRing = 1 + (rng - 2) * stride;
  for (let s = 0; s < seg; s += 1) {
    indices.push(northPole, topRing + s, topRing + s + 1);
  }

  return ensureOutwardNormals({
    kind: "aura-custom-geometry",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices)
  });
}

/**
 * Smooth +Z spherical cabochon dome cap for layered liquid-gloss eyes, plastron shield, and blushes.
 */
function cabochonCapSpec(
  rx: number,
  ry: number,
  rz: number,
  uSegs = 12,
  rings = 2
): AuraCustomGeometrySpec {
  const seg = Math.max(6, uSegs);
  const rng = Math.max(1, rings);
  const effRx = Math.max(1e-5, rx);
  const effRy = Math.max(1e-5, ry);
  const effRz = Math.max(1e-5, rz);
  const positions: number[] = [0, 0, effRz];
  const normals: number[] = [0, 0, 1];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];

  for (let r = 1; r <= rng; r += 1) {
    const t = r / rng;
    const alpha = t * Math.PI * 0.5;
    const sinA = Math.sin(alpha);
    const cosA = Math.cos(alpha);
    for (let s = 0; s <= seg; s += 1) {
      const u = s / seg;
      const theta = u * TAU;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      positions.push(cosT * sinA * effRx, sinT * sinA * effRy, cosA * effRz);
      const nx = (cosT * sinA) / effRx;
      const ny = (sinT * sinA) / effRy;
      const nz = cosA / effRz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nl, ny / nl, nz / nl);
      uvs.push(0.5 + 0.5 * t * cosT, 0.5 + 0.5 * t * sinT);
    }
  }

  const stride = seg + 1;
  for (let s = 0; s < seg; s += 1) {
    indices.push(0, 1 + s, 1 + s + 1);
  }
  for (let r = 0; r < rng - 1; r += 1) {
    const rowA = 1 + r * stride;
    const rowB = rowA + stride;
    for (let s = 0; s < seg; s += 1) {
      const a = rowA + s;
      const b = a + 1;
      const c = rowB + s;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return ensureOutwardNormals({
    kind: "aura-custom-geometry",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices)
  });
}

/**
 * Chamfered 6-sided hexagonal turtle scute tile extruded cleanly with rounded bevels.
 */
function hexScuteTileSpec(radiusX: number, radiusY: number, depth: number): AuraCustomGeometrySpec {
  const outer: ProceduralVec2[] = [];
  for (let i = 0; i < 6; i += 1) {
    const ang = (i / 6) * TAU + Math.PI / 6;
    outer.push([Math.cos(ang) * radiusX, Math.sin(ang) * radiusY]);
  }
  return ensureOutwardNormals(
    extrudeContourSpec({
      outer,
      depth,
      bevelSegments: 1,
      bevelThickness: depth * 0.28,
      bevelSize: Math.min(radiusX, radiusY) * 0.14
    })
  );
}

interface TikoEyePairBuilt {
  readonly headAccentParts: readonly LobePartInput[];
  readonly eyelidL: BuiltSubPart;
  readonly eyelidR: BuiltSubPart;
}

function buildTikoEyePair(parentPart: SubPartId, socketColor: string): TikoEyePairBuilt {
  const eyeX = 0.106;
  const eyeY = 0.715;
  const eyeZ = 0.238;
  const r = 0.056;
  const yawMag = 0.16;
  const pitch = -0.02;
  const browLift = 1.4;

  const scleraGeo = cabochonCapSpec(r, r * 1.03, r * 0.36, 18, 3);
  const limbalGeo = cabochonCapSpec(r * 0.85, r * 0.88, r * 0.3, 16, 3);
  const irisGeo = cabochonCapSpec(r * 0.77, r * 0.8, r * 0.28, 16, 3);
  const crescentGeo = cabochonCapSpec(r * 0.52, r * 0.36, r * 0.24, 12, 2);
  const pupilGeo = cabochonCapSpec(r * 0.5, r * 0.53, r * 0.24, 14, 3);
  const catchMainGeo = cabochonCapSpec(r * 0.25, r * 0.25, r * 0.14, 10, 2);
  const catchSubGeo = cabochonCapSpec(r * 0.12, r * 0.12, r * 0.1, 8, 2);

  const buildSide = (sign: -1 | 1): BuiltSubPart => {
    const cx = sign * eyeX;
    const cy = eyeY;
    const cz = eyeZ;
    const anchor: Vec3 = [cx, cy, cz];
    const yaw = sign * yawMag;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);

    const lashPts: ProceduralVec3[] = [
      [-r * 0.96 * sign, r * 0.14, r * 0.18],
      [-r * 0.38 * sign, r * 0.8, r * 0.31],
      [r * 0.38 * sign, r * 0.82, r * 0.31],
      [r * 0.98 * sign, r * 0.1, r * 0.16]
    ];
    const lashArc = sculptCurvedLimb(
      lashPts,
      (t) => r * (0.095 + 0.06 * Math.sin(t * Math.PI)),
      { steps: 7, radialSegments: 6 }
    );

    const eyeCabochon = composeLobe({
      suffix: "eyeCabochon",
      craft: "lacquer",
      parts: [
        part(scleraGeo, "#FFFDF9", { rotation: [pitch, yaw, 0] }),
        part(limbalGeo, "#2E4A36", {
          position: [sinY * r * 0.16, r * 0.02, cosY * r * 0.16],
          rotation: [pitch, yaw, 0]
        }),
        part(irisGeo, "#5A8A5E", {
          position: [sinY * r * 0.2, r * 0.01, cosY * r * 0.2],
          rotation: [pitch, yaw, 0]
        }),
        part(crescentGeo, "#B7D989", {
          position: [sinY * r * 0.24, -r * 0.18, cosY * r * 0.24],
          rotation: [pitch, yaw, 0]
        }),
        part(pupilGeo, "#151218", {
          position: [sinY * r * 0.28, r * 0.02, cosY * r * 0.28],
          rotation: [pitch, yaw, 0]
        }),
        part(catchMainGeo, "#FFFFFF", {
          position: [-r * 0.22 + sinY * r * 0.36, r * 0.26, cosY * r * 0.38]
        }),
        part(catchSubGeo, "#FFFFFF", {
          position: [r * 0.2 + sinY * r * 0.35, -r * 0.19, cosY * r * 0.37]
        }),
        part(lashArc, "#26382E", { rotation: [pitch, yaw, 0] })
      ]
    });

    return makeSubPartRig(sign < 0 ? "eyelidL" : "eyelidR", anchor, [eyeCabochon], parentPart);
  };

  const headAccentParts: LobePartInput[] = [];
  const socketRimGeo = cabochonCapSpec(r * 1.14, r * 1.16, r * 0.26, 12, 2);
  for (const sign of [-1, 1] as const) {
    const cx = sign * eyeX;
    const yaw = sign * yawMag;
    headAccentParts.push(
      part(socketRimGeo, socketColor, {
        position: [cx - Math.sin(yaw) * r * 0.12, eyeY, eyeZ - Math.cos(yaw) * r * 0.12],
        rotation: [pitch, yaw, 0]
      })
    );
    const browArc = sculptCurvedLimb(
      [
        [cx - sign * r * 0.62, eyeY + r * (browLift - 0.14), eyeZ + r * 0.02],
        [cx, eyeY + r * (browLift + 0.08), eyeZ + r * 0.1],
        [cx + sign * r * 0.68, eyeY + r * (browLift - 0.22), eyeZ - r * 0.04]
      ],
      (t) => r * (0.085 + 0.045 * Math.sin(t * Math.PI)),
      { steps: 5, radialSegments: 5 }
    );
    headAccentParts.push(part(browArc, "#367A5E"));
  }

  return {
    headAccentParts,
    eyelidL: buildSide(-1),
    eyelidR: buildSide(1)
  };
}

/**
 * Builds Tiko's articulated procedural turtle rig in normalized [0..1] unit-height space.
 * Sub-parts: `body`, `head`, `eyelidL`, `eyelidR`, `jaw`, `cheekPuff`, `armL`, `armR`, `footL`, `footR`, `tail`.
 */
export function buildTikoRig(): ProceduralAssetRig {
  const skinSage = "#6bc49c";
  const skinSoft = "#86d4b0";
  const skinDeep = "#4ba37f";
  const plastronCream = "#f3e6c8";
  const plastronSeam = "#dccaa3";
  const shellAmber = "#d89b56";
  const shellHoney = "#e4b06d";
  const shellUmber = "#8a5a36";
  const shellRim = "#b07640";
  const kerchiefCoral = "#f29e6d";
  const kerchiefGold = "#fad17a";
  const blushRose = "#f59cae";

  // ---------------- 1. BODY (quilted cream plastron + cosy neckerchief + patterned hexagonal carapace)
  const torsoProfile = bezierProfilePoints(
    [0, 0.09],
    [
      { cp1: [0.15, 0.09], cp2: [0.228, 0.15], to: [0.222, 0.27] },
      { cp1: [0.218, 0.37], cp2: [0.182, 0.46], to: [0.138, 0.52] },
      { cp1: [0.118, 0.548], cp2: [0.095, 0.562], to: [0, 0.57] }
    ],
    4
  );
  const torsoGeo = sculptOrganicLathe(torsoProfile, { segments: 22 });
  const hipCushionGeo = smoothPuffSpec(0.086, 0.072, 0.084, 8, 4);

  // Quilted warm-cream front plastron shield + horizontal stitch ribs.
  const plastronGeo = cabochonCapSpec(0.152, 0.192, 0.048, 20, 3);
  const makePlastronSeam = (y: number, halfW: number, zFront: number): AuraCustomGeometrySpec =>
    sculptCurvedLimb(
      [
        [-halfW, y, zFront - 0.024],
        [0, y - 0.006, zFront],
        [halfW, y, zFront - 0.024]
      ],
      0.0075,
      { steps: 5, radialSegments: 5 }
    );
  const plastronSeamTop = makePlastronSeam(0.375, 0.115, 0.214);
  const plastronSeamMid = makePlastronSeam(0.295, 0.132, 0.222);
  const plastronSeamLow = makePlastronSeam(0.215, 0.112, 0.21);

  // Soft felt explorer neckerchief around neck + 3 golden counting-dot buttons ("One... two... three!").
  const collarRingGeo = sculptCurvedLimb(
    [
      [0, 0.5, 0.145],
      [0.138, 0.505, 0.03],
      [0, 0.515, -0.105],
      [-0.138, 0.505, 0.03]
    ],
    0.026,
    { steps: 14, radialSegments: 7, closed: true }
  );
  const kerchiefTailL = sculptCurvedLimb(
    [
      [-0.018, 0.488, 0.155],
      [-0.052, 0.438, 0.188],
      [-0.068, 0.402, 0.196]
    ],
    (t) => 0.022 * (1 - 0.45 * t),
    { steps: 4, radialSegments: 6 }
  );
  const kerchiefTailR = sculptCurvedLimb(
    [
      [0.018, 0.488, 0.155],
      [0.052, 0.442, 0.188],
      [0.07, 0.408, 0.195]
    ],
    (t) => 0.022 * (1 - 0.45 * t),
    { steps: 4, radialSegments: 6 }
  );
  const countDotGeo = cabochonCapSpec(0.015, 0.015, 0.01, 8, 2);

  const bodyFeltLobe = composeLobe({
    suffix: "plastronAndCollar",
    craft: "felt",
    tintTarget: true,
    parts: [
      part(torsoGeo, skinSage, { scale: [1.02, 1, 0.92] }),
      part(hipCushionGeo, skinDeep, { position: [-0.128, 0.13, 0.015] }),
      part(hipCushionGeo, skinDeep, { position: [0.128, 0.13, 0.015] }),
      part(plastronGeo, plastronCream, { position: [0, 0.295, 0.172], rotation: [-0.05, 0, 0] }),
      part(plastronSeamTop, plastronSeam),
      part(plastronSeamMid, plastronSeam),
      part(plastronSeamLow, plastronSeam),
      part(collarRingGeo, kerchiefCoral),
      part(kerchiefTailL, kerchiefCoral),
      part(kerchiefTailR, kerchiefCoral),
      part(countDotGeo, kerchiefGold, { position: [-0.028, 0.486, 0.174] }),
      part(countDotGeo, kerchiefGold, { position: [0, 0.482, 0.179] }),
      part(countDotGeo, kerchiefGold, { position: [0.028, 0.486, 0.174] })
    ]
  });

  // Domed patterned hexagonal scute turtle carapace on Tiko's back (-Z).
  const shellDomeGeo = smoothPuffSpec(0.245, 0.258, 0.158, 20, 10);
  const centralScuteGeo = hexScuteTileSpec(0.068, 0.062, 0.026);
  const costalScuteGeo = hexScuteTileSpec(0.056, 0.054, 0.024);
  const marginalScallopGeo = smoothPuffSpec(0.048, 0.04, 0.036, 7, 4);

  const marginalAngles = [-2.55, -1.9, -1.25, -0.58, 0.58, 1.25, 1.9, 2.55];
  const marginalParts: LobePartInput[] = marginalAngles.map((ang) =>
    part(marginalScallopGeo, shellRim, {
      position: [
        Math.sin(ang) * 0.232,
        0.325 + Math.cos(ang) * 0.235,
        -0.085 - Math.abs(Math.sin(ang)) * 0.018
      ],
      rotation: [0, 0, -ang]
    })
  );

  const bodyShellLobe = composeLobe({
    suffix: "hexScuteCarapace",
    craft: "wood",
    parts: [
      part(shellDomeGeo, shellUmber, { position: [0, 0.328, -0.095], rotation: [-0.08, 0, 0] }),
      // 3 vertebral hexagonal scutes along spine
      part(centralScuteGeo, shellHoney, { position: [0, 0.452, -0.215], rotation: [0.42, Math.PI, 0] }),
      part(centralScuteGeo, shellAmber, { position: [0, 0.332, -0.248], rotation: [0.04, Math.PI, 0] }),
      part(centralScuteGeo, shellHoney, { position: [0, 0.212, -0.22], rotation: [-0.36, Math.PI, 0] }),
      // 4 lateral costal hexagonal scutes
      part(costalScuteGeo, shellAmber, { position: [-0.118, 0.392, -0.205], rotation: [0.22, Math.PI - 0.48, 0.18] }),
      part(costalScuteGeo, shellAmber, { position: [0.118, 0.392, -0.205], rotation: [0.22, Math.PI + 0.48, -0.18] }),
      part(costalScuteGeo, shellAmber, { position: [-0.122, 0.268, -0.205], rotation: [-0.2, Math.PI - 0.48, -0.18] }),
      part(costalScuteGeo, shellAmber, { position: [0.122, 0.268, -0.205], rotation: [-0.2, Math.PI + 0.48, 0.18] }),
      ...marginalParts
    ]
  });

  const bodyPart = makeSubPartRig("body", [0, 0, 0], [bodyFeltLobe, bodyShellLobe]);

  // ---------------- 2. HEAD (round friendly turtle head + wide snout + freckle scales + smile ridge)
  const headAnchor: Vec3 = [0, 0.515, 0.035];
  const headProfile = bezierProfilePoints(
    [0, 0.495],
    [
      { cp1: [0.145, 0.495], cp2: [0.255, 0.555], to: [0.248, 0.675] },
      { cp1: [0.242, 0.79], cp2: [0.21, 0.895], to: [0.132, 0.948] },
      { cp1: [0.08, 0.975], cp2: [0.035, 0.982], to: [0, 0.985] }
    ],
    4
  );
  const headShellGeo = sculptOrganicLathe(headProfile, { segments: 26 });
  const cheekSwellGeo = smoothPuffSpec(0.106, 0.082, 0.092, 12, 6);
  const snoutCushionGeo = smoothPuffSpec(0.122, 0.056, 0.088, 16, 8);
  const nostrilGeo = cabochonCapSpec(0.011, 0.009, 0.009, 8, 2);
  const crownScaleGeo = cabochonCapSpec(0.026, 0.022, 0.012, 10, 2);

  const smileRidgeArc = sculptCurvedLimb(
    [
      [-0.082, 0.608, 0.258],
      [-0.04, 0.594, 0.282],
      [0, 0.59, 0.29],
      [0.04, 0.594, 0.282],
      [0.082, 0.608, 0.258]
    ],
    0.0075,
    { steps: 7, radialSegments: 6 }
  );
  const mouthCavityGeo = cabochonCapSpec(0.054, 0.02, 0.015, 12, 2);

  const eyes = buildTikoEyePair("head", skinDeep);

  const headLobe = composeLobe({
    suffix: "turtleHead",
    craft: "clay",
    hinge: headAnchor,
    tintTarget: true,
    parts: [
      part(headShellGeo, skinSage, { position: [0, 0, 0.03], scale: [1.04, 1, 0.94] }),
      part(cheekSwellGeo, skinSage, { position: [-0.158, 0.635, 0.102] }),
      part(cheekSwellGeo, skinSage, { position: [0.158, 0.635, 0.102] }),
      part(snoutCushionGeo, skinSoft, { position: [0, 0.632, 0.212], rotation: [0.04, 0, 0] }),
      part(nostrilGeo, "#2F7356", { position: [-0.038, 0.648, 0.29] }),
      part(nostrilGeo, "#2F7356", { position: [0.038, 0.648, 0.29] }),
      part(crownScaleGeo, skinSoft, { position: [0, 0.875, 0.175], rotation: [-0.52, 0, 0] }),
      part(crownScaleGeo, shellHoney, { position: [-0.062, 0.858, 0.162], rotation: [-0.5, -0.28, 0] }),
      part(crownScaleGeo, shellHoney, { position: [0.062, 0.858, 0.162], rotation: [-0.5, 0.28, 0] }),
      part(mouthCavityGeo, "#6E233E", { position: [0, 0.576, 0.272] }),
      part(smileRidgeArc, "#2F7356"),
      ...eyes.headAccentParts
    ]
  });
  const headPart = makeSubPartRig("head", headAnchor, [headLobe], "body");

  // ---------------- 3. JAW (articulated lower jaw for timed viseme & RMS speech)
  const jawAnchor: Vec3 = [0, 0.584, 0.238];
  const lowerJawGeo = smoothPuffSpec(0.084, 0.028, 0.064, 12, 6);
  const lowerLipArc = sculptCurvedLimb(
    [
      [-0.072, 0.6, 0.262],
      [-0.036, 0.587, 0.286],
      [0, 0.584, 0.294],
      [0.036, 0.587, 0.286],
      [0.072, 0.6, 0.262]
    ],
    0.0068,
    { steps: 6, radialSegments: 6 }
  );
  const tongueGeo = cabochonCapSpec(0.034, 0.011, 0.014, 10, 2);
  const jawLobe = composeLobe({
    suffix: "smileJaw",
    craft: "clay",
    hinge: jawAnchor,
    parts: [
      part(lowerJawGeo, skinSoft, { position: [0, 0.568, 0.242] }),
      part(lowerLipArc, "#2F7356"),
      part(tongueGeo, "#F48B9E", { position: [0, 0.578, 0.274] })
    ]
  });
  const jawPart = makeSubPartRig("jaw", jawAnchor, [jawLobe], "head");

  // ---------------- 4. CHEEK PUFFS (warm rosy felt blushes)
  const cheekAnchor: Vec3 = [0, 0.642, 0.225];
  const cheekOvalGeo = cabochonCapSpec(0.04, 0.026, 0.015, 14, 2);
  const cheekLobe = composeLobe({
    suffix: "cheekBlush",
    craft: "felt",
    hinge: cheekAnchor,
    tintTarget: true,
    parts: [
      part(cheekOvalGeo, blushRose, { position: [-0.168, 0.64, 0.214], rotation: [0, -0.46, 0.08] }),
      part(cheekOvalGeo, blushRose, { position: [0.168, 0.64, 0.214], rotation: [0, 0.46, -0.08] })
    ]
  });
  const cheekPart = makeSubPartRig("cheekPuff", cheekAnchor, [cheekLobe], "head");

  // ---------------- 5. FRONT FLIPPER-ARMS (armL / armR)
  const buildTikoArm = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.2, 0.445, 0.03];
    const armSweep = sculptCurvedLimb(
      [
        [sign * 0.172, 0.455, 0.025],
        [sign * 0.248, 0.398, 0.042],
        [sign * 0.282, 0.318, 0.062],
        [sign * 0.274, 0.245, 0.076]
      ],
      (t) => 0.05 * (0.95 + 0.16 * Math.sin(t * Math.PI)),
      { steps: 6, radialSegments: 7, profileScaleX: 0.72, profileScaleY: 1.12 }
    );
    const fingerNubGeo = smoothPuffSpec(0.016, 0.022, 0.017, 6, 4);
    const wristScaleGeo = cabochonCapSpec(0.018, 0.016, 0.01, 8, 2);
    const armLobe = composeLobe({
      suffix: "turtleArm",
      craft: "clay",
      hinge: anchor,
      parts: [
        part(armSweep, skinSage),
        part(fingerNubGeo, skinSoft, { position: [sign * 0.258, 0.226, 0.092] }),
        part(fingerNubGeo, skinSoft, { position: [sign * 0.276, 0.22, 0.078] }),
        part(fingerNubGeo, skinSoft, { position: [sign * 0.286, 0.226, 0.06] }),
        part(wristScaleGeo, shellHoney, {
          position: [sign * 0.285, 0.322, 0.064],
          rotation: [0, sign * 1.2, 0]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "armL" : "armR", anchor, [armLobe], "body");
  };

  // ---------------- 6. STURDY HIND FEET (footL / footR planted cleanly at y = 0)
  const buildTikoFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.128, 0.115, 0.02];
    const ankleSweep = sculptCurvedLimb(
      [
        [sign * 0.125, 0.148, 0.015],
        [sign * 0.13, 0.085, 0.024],
        [sign * 0.134, 0.036, 0.036]
      ],
      (t) => 0.056 - 0.005 * t,
      { steps: 5, radialSegments: 7 }
    );
    const footPadGeo = smoothPuffSpec(0.07, 0.036, 0.092, 10, 5);
    const toeNubGeo = smoothPuffSpec(0.021, 0.017, 0.023, 6, 4);
    const footLobe = composeLobe({
      suffix: "turtleFoot",
      craft: "clay",
      hinge: anchor,
      parts: [
        part(ankleSweep, skinSage),
        part(footPadGeo, skinDeep, { position: [sign * 0.136, 0.036, 0.05] }),
        part(toeNubGeo, plastronCream, { position: [sign * 0.1, 0.022, 0.128] }),
        part(toeNubGeo, plastronCream, { position: [sign * 0.136, 0.022, 0.138] }),
        part(toeNubGeo, plastronCream, { position: [sign * 0.172, 0.022, 0.126] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [footLobe]);
  };

  // ---------------- 7. WAGGING TURTLE TAIL (tail)
  const tailAnchor: Vec3 = [0, 0.135, -0.155];
  const tailSweep = sculptCurvedLimb(
    [
      [0, 0.14, -0.145],
      [0, 0.118, -0.215],
      [0, 0.132, -0.272]
    ],
    (t) => 0.038 * (1 - 0.58 * t),
    { steps: 6, radialSegments: 7 }
  );
  const tailTipGeo = smoothPuffSpec(0.016, 0.016, 0.02, 6, 4);
  const tailLobe = composeLobe({
    suffix: "turtleTail",
    craft: "clay",
    hinge: tailAnchor,
    parts: [
      part(tailSweep, skinSage),
      part(tailTipGeo, skinSoft, { position: [0, 0.134, -0.278] })
    ]
  });
  const tailPart = makeSubPartRig("tail", tailAnchor, [tailLobe], "body");

  return finalizeProceduralRig("tiko", [
    bodyPart,
    headPart,
    eyes.eyelidL,
    eyes.eyelidR,
    jawPart,
    cheekPart,
    buildTikoArm(-1),
    buildTikoArm(1),
    buildTikoFoot(-1),
    buildTikoFoot(1),
    tailPart
  ]);
}
