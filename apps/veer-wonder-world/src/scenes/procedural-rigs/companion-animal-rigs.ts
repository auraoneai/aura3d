// Companion & Farm/Garden Animal Procedural Rigs (WP-4):
// teddy, robot, cow, sheep, duck, horse, bird, butterfly.
// Sculpted 100% natively on @aura3d/engine/procedural + ./rig-kit.js in unit-height [0..1] space (+Z forward).
// Zero network fetches, zero clocks, zero non-deterministic RNG, zero console calls, and zero unsafe casts.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import type { ProceduralVec2, ProceduralVec3 } from "@aura3d/engine/procedural";
import type { SubPartId } from "../articulated-actors.js";
import type { Vec3 } from "../motion.js";
import {
  bezierProfilePoints,
  composeLobe,
  cylinderSpec,
  discSpec,
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
  type BuiltSubPart,
  type LobePartInput,
  type OrganicPuffItem,
  type ProceduralAssetRig
} from "./rig-kit.js";

export const COMPANION_ANIMAL_KEYS = [
  "teddy",
  "robot",
  "cow",
  "sheep",
  "duck",
  "horse",
  "bird",
  "butterfly"
] as const;

export type CompanionAnimalAssetKey = (typeof COMPANION_ANIMAL_KEYS)[number];

const TAU = Math.PI * 2;
const ORIGIN: Vec3 = [0, 0, 0];

function smoothPuffSpec(
  rx: number,
  ry: number,
  rz: number,
  uSegs = 12,
  rings = 6,
  topTaper = 0
): AuraCustomGeometrySpec {
  const seg = Math.max(6, uSegs);
  const rng = Math.max(3, rings);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  positions.push(0, -ry, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0);

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
      positions.push(sinT * cosPhi * effRx, sinPhi * effRy, cosT * cosPhi * effRz);
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

function chamferedBoxSpec(w: number, h: number, d: number, bevel = 0.012): AuraCustomGeometrySpec {
  const hw = Math.max(0.004, w * 0.5);
  const hh = Math.max(0.004, h * 0.5);
  const b = Math.min(bevel, w * 0.22, h * 0.22, d * 0.3);
  return extrudeContourSpec({
    outer: [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh]
    ],
    depth: Math.max(0.004, d),
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 1
  });
}

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

function buildCompactEyes(opts: {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly radius: number;
  readonly irisColor: string;
  readonly lashColor: string;
  readonly browColor: string;
  readonly parentPart: SubPartId;
  readonly outwardYaw?: number;
}): {
  readonly browParts: readonly LobePartInput[];
  readonly eyelidL: BuiltSubPart;
  readonly eyelidR: BuiltSubPart;
} {
  const r = opts.radius;
  const yawMag = opts.outwardYaw ?? 0.22;
  const sclera = cabochonCapSpec(r, r * 1.05, r * 0.42, 12, 2);
  const iris = cabochonCapSpec(r * 0.76, r * 0.8, r * 0.28, 12, 2);
  const pupil = cabochonCapSpec(r * 0.48, r * 0.52, r * 0.22, 10, 2);
  const catchMain = cabochonCapSpec(r * 0.25, r * 0.25, r * 0.14, 8, 2);
  const catchSub = cabochonCapSpec(r * 0.12, r * 0.12, r * 0.1, 6, 2);

  const makeSide = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * opts.eyeX, opts.eyeY, opts.eyeZ];
    const yaw = sign * yawMag;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const lash = sculptCurvedLimb(
      [
        [-r * 0.94 * sign, r * 0.16, r * 0.12],
        [0, r * 0.92, r * 0.26],
        [r * 0.96 * sign, r * 0.12, r * 0.1]
      ],
      (t) => r * (0.1 + 0.05 * Math.sin(t * Math.PI)),
      { steps: 4, radialSegments: 5 }
    );
    const lobe = composeLobe({
      suffix: "eyeGloss",
      craft: "lacquer",
      parts: [
        part(sclera, "#FFFDF9", {
          position: [-sinY * r * 0.08, 0, -cosY * r * 0.08],
          rotation: [-0.03, yaw, 0]
        }),
        part(iris, opts.irisColor, {
          position: [sinY * r * 0.14, -r * 0.01, cosY * r * 0.14],
          rotation: [-0.03, yaw, 0]
        }),
        part(pupil, "#171018", {
          position: [sinY * r * 0.25, 0, cosY * r * 0.25],
          rotation: [-0.03, yaw, 0]
        }),
        part(catchMain, "#FFFFFF", {
          position: [-r * 0.2 + sinY * r * 0.36, r * 0.24, cosY * r * 0.37],
          rotation: [-0.03, yaw, 0]
        }),
        part(catchSub, "#FFFFFF", {
          position: [r * 0.18 + sinY * r * 0.35, -r * 0.19, cosY * r * 0.36],
          rotation: [-0.03, yaw, 0]
        }),
        part(lash, opts.lashColor, { rotation: [-0.03, yaw, 0] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "eyelidL" : "eyelidR", anchor, [lobe], opts.parentPart);
  };

  const browParts: LobePartInput[] = [];
  for (const sign of [-1, 1] as const) {
    const brow = sculptCurvedLimb(
      [
        [sign * (opts.eyeX - r * 0.55), opts.eyeY + r * 1.28, opts.eyeZ + r * 0.04],
        [sign * opts.eyeX, opts.eyeY + r * 1.48, opts.eyeZ + r * 0.1],
        [sign * (opts.eyeX + r * 0.58), opts.eyeY + r * 1.2, opts.eyeZ - r * 0.02]
      ],
      r * 0.11,
      { steps: 4, radialSegments: 5 }
    );
    browParts.push(part(brow, opts.browColor));
  }

  return { browParts, eyelidL: makeSide(-1), eyelidR: makeSide(1) };
}

// ---------------------------------------------------------------- 1. TEDDY (0.55m)

function buildTeddyRig(): ProceduralAssetRig {
  const torso = sculptOrganicLathe(
    [
      [0.0, 0.08],
      [0.19, 0.08],
      [0.24, 0.2],
      [0.23, 0.36],
      [0.18, 0.48],
      [0.12, 0.55],
      [0.0, 0.56]
    ],
    { segments: 20 }
  );
  const headBase = sculptOrganicLathe(
    [
      [0.0, 0.53],
      [0.15, 0.54],
      [0.22, 0.65],
      [0.21, 0.8],
      [0.14, 0.9],
      [0.0, 0.92]
    ],
    { segments: 20 }
  );
  const eyes = buildCompactEyes({
    eyeX: 0.082,
    eyeY: 0.74,
    eyeZ: 0.185,
    radius: 0.038,
    irisColor: "#4A2C1B",
    lashColor: "#331D12",
    browColor: "#6B4229",
    parentPart: "head",
    outwardYaw: 0.16
  });

  const bodyFelt = composeLobe({
    suffix: "teddyBodyFelt",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(torso, "#B87C4C", { scale: [1, 1, 0.9] }),
      part(smoothPuffSpec(0.145, 0.165, 0.055, 14, 7), "#F6E7D0", { position: [0, 0.29, 0.185] }),
      part(smoothPuffSpec(0.055, 0.055, 0.05, 10, 5), "#9E653B", { position: [0, 0.18, -0.215] }),
      // Ribbon bow tie at collar
      part(smoothPuffSpec(0.032, 0.026, 0.024, 8, 4), "#E45A52", { position: [0, 0.51, 0.155] }),
      part(smoothPuffSpec(0.068, 0.042, 0.02, 10, 5), "#E45A52", {
        position: [-0.062, 0.515, 0.148],
        rotation: [0, 0.18, 0.24]
      }),
      part(smoothPuffSpec(0.068, 0.042, 0.02, 10, 5), "#E45A52", {
        position: [0.062, 0.515, 0.148],
        rotation: [0, -0.18, -0.24]
      }),
      // Stitched vertical belly seam ticks
      part(smoothPuffSpec(0.008, 0.038, 0.008, 6, 3), "#D8BE9C", { position: [0, 0.34, 0.238] }),
      part(smoothPuffSpec(0.008, 0.038, 0.008, 6, 3), "#D8BE9C", { position: [0, 0.24, 0.236] })
    ]
  });

  const bodyWoodButton = composeLobe({
    suffix: "teddyWoodButton",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [
      part(discSpec(0.024, 14, 0.01), "#8A542E", { position: [0, 0.39, 0.232] })
    ]
  });

  const headAnchor: Vec3 = [0, 0.54, 0];
  const headFelt = composeLobe({
    suffix: "teddyHeadFelt",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: headAnchor,
    parts: [
      part(headBase, "#B87C4C", { scale: [1, 1, 0.92] }),
      part(smoothPuffSpec(0.095, 0.072, 0.075, 12, 6), "#F6E7D0", { position: [0, 0.675, 0.19] }),
      part(smoothPuffSpec(0.042, 0.028, 0.02, 8, 4), "#F2A6A0", { position: [-0.125, 0.68, 0.155] }),
      part(smoothPuffSpec(0.042, 0.028, 0.02, 8, 4), "#F2A6A0", { position: [0.125, 0.68, 0.155] }),
      part(
        sculptCurvedLimb(
          [
            [-0.042, 0.635, 0.245],
            [0, 0.618, 0.255],
            [0.042, 0.635, 0.245]
          ],
          0.008,
          { steps: 6, radialSegments: 6 }
        ),
        "#5A3622"
      ),
      ...eyes.browParts
    ]
  });
  const headGloss = composeLobe({
    suffix: "teddyNoseGloss",
    craft: "lacquer",
    hinge: headAnchor,
    parts: [
      part(smoothPuffSpec(0.034, 0.025, 0.026, 10, 5), "#3A2218", { position: [0, 0.698, 0.258] }),
      part(smoothPuffSpec(0.01, 0.007, 0.008, 6, 3), "#FFFFFF", { position: [-0.01, 0.706, 0.28] })
    ]
  });

  const makeEar = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.155, 0.865, -0.01];
    const lobe = composeLobe({
      suffix: "teddyEar",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(smoothPuffSpec(0.076, 0.078, 0.042, 12, 6), "#AD7142", {
          position: [sign * 0.175, 0.92, -0.01],
          rotation: [0, -sign * 0.18, -sign * 0.28]
        }),
        part(smoothPuffSpec(0.046, 0.048, 0.024, 10, 5), "#F6E7D0", {
          position: [sign * 0.175, 0.918, 0.018],
          rotation: [0, -sign * 0.18, -sign * 0.28]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "earL" : "earR", anchor, [lobe], "head");
  };

  const makeArm = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.185, 0.455, 0.02];
    const limb = sculptCurvedLimb(
      [
        [sign * 0.185, 0.455, 0.02],
        [sign * 0.255, 0.365, 0.065],
        [sign * 0.245, 0.255, 0.115]
      ],
      (t) => 0.056 + 0.012 * Math.sin(t * Math.PI),
      { steps: 8, radialSegments: 10 }
    );
    const lobe = composeLobe({
      suffix: "teddyArm",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(limb, "#B87C4C"),
        part(smoothPuffSpec(0.042, 0.04, 0.036, 8, 4), "#F6E7D0", {
          position: [sign * 0.242, 0.254, 0.118]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "armL" : "armR", anchor, [lobe], "body");
  };

  const makeFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.115, 0.11, 0.03];
    const leg = sculptCurvedLimb(
      [
        [sign * 0.115, 0.14, 0.01],
        [sign * 0.125, 0.065, 0.055],
        [sign * 0.125, 0.048, 0.125]
      ],
      0.068,
      { steps: 6, radialSegments: 10 }
    );
    const lobe = composeLobe({
      suffix: "teddyFoot",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(leg, "#AD7142"),
        part(smoothPuffSpec(0.068, 0.05, 0.072, 8, 4), "#AD7142", {
          position: [sign * 0.125, 0.048, 0.118]
        }),
        part(smoothPuffSpec(0.046, 0.038, 0.028, 8, 4), "#F6E7D0", {
          position: [sign * 0.125, 0.046, 0.168]
        }),
        part(smoothPuffSpec(0.015, 0.015, 0.015, 6, 3), "#E5C9A8", {
          position: [sign * 0.102, 0.072, 0.172]
        }),
        part(smoothPuffSpec(0.015, 0.015, 0.015, 6, 3), "#E5C9A8", {
          position: [sign * 0.125, 0.078, 0.176]
        }),
        part(smoothPuffSpec(0.015, 0.015, 0.015, 6, 3), "#E5C9A8", {
          position: [sign * 0.148, 0.072, 0.172]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [lobe]);
  };

  return finalizeProceduralRig("teddy", [
    makeSubPartRig("body", ORIGIN, [bodyFelt, bodyWoodButton]),
    makeSubPartRig("head", headAnchor, [headFelt, headGloss], "body"),
    makeEar(-1),
    makeEar(1),
    makeArm(-1),
    makeArm(1),
    makeFoot(-1),
    makeFoot(1),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- 2. ROBOT (0.80m)

function buildRobotRig(): ProceduralAssetRig {
  const chassis = chamferedBoxSpec(0.36, 0.34, 0.26, 0.048);
  const pelvis = chamferedBoxSpec(0.28, 0.09, 0.21, 0.024);
  const headShell = chamferedBoxSpec(0.34, 0.25, 0.25, 0.048);
  const visorFrame = chamferedBoxSpec(0.27, 0.13, 0.04, 0.018);
  const backpack = chamferedBoxSpec(0.22, 0.21, 0.08, 0.022);

  const eyes = buildCompactEyes({
    eyeX: 0.072,
    eyeY: 0.72,
    eyeZ: 0.14,
    radius: 0.035,
    irisColor: "#3BA9FF",
    lashColor: "#26384F",
    browColor: "#3D5878",
    parentPart: "head",
    outwardYaw: 0.08
  });

  const bodyEnamel = composeLobe({
    suffix: "robotChassis",
    craft: "carPaint",
    parts: [
      part(chassis, "#7EC4F2", { position: [0, 0.35, 0] }),
      part(pelvis, "#5FA8DC", { position: [0, 0.155, 0] }),
      part(backpack, "#5FA8DC", { position: [0, 0.36, -0.14] }),
      part(chamferedBoxSpec(0.24, 0.18, 0.03, 0.016), "#F6FAFE", { position: [0, 0.36, 0.132] }),
      // Tactile arcade buttons below dial
      part(cylinderSpec(0.022, 0.022, 0.022, 10, 0.005), "#F0645A", {
        position: [-0.065, 0.295, 0.148],
        rotation: [Math.PI * 0.5, 0, 0]
      }),
      part(cylinderSpec(0.022, 0.022, 0.022, 10, 0.005), "#54C98E", {
        position: [0.0, 0.295, 0.148],
        rotation: [Math.PI * 0.5, 0, 0]
      }),
      part(cylinderSpec(0.022, 0.022, 0.022, 10, 0.005), "#F7C844", {
        position: [0.065, 0.295, 0.148],
        rotation: [Math.PI * 0.5, 0, 0]
      })
    ]
  });

  const bodyDial = composeLobe({
    suffix: "robotDial",
    craft: "ceramic",
    craftTexture: "clockAndGaugeDial",
    parts: [part(discSpec(0.056, 16, 0.014), "#FFFDF7", { position: [0, 0.395, 0.15] })]
  });

  const bodyMetal = composeLobe({
    suffix: "robotMetal",
    craft: "carPaint",
    parts: [
      part(torusSpec(0.058, 0.009, 10, 5), "#C8D2E0", { position: [0, 0.395, 0.152] }),
      part(cylinderSpec(0.052, 0.058, 0.095, 12, 0.008), "#B8C4D4", { position: [0, 0.548, 0] }),
      part(torusSpec(0.056, 0.012, 10, 5), "#96A5B8", {
        position: [0, 0.548, 0],
        rotation: [Math.PI * 0.5, 0, 0]
      }),
      // Wind-up key socketed snugly into backpack for strong front/back asymmetry
      part(cylinderSpec(0.018, 0.018, 0.07, 8, 0.004), "#E5B94C", {
        position: [0, 0.36, -0.19],
        rotation: [Math.PI * 0.5, 0, 0]
      }),
      part(torusSpec(0.036, 0.01, 10, 5), "#E5B94C", { position: [-0.034, 0.36, -0.222] }),
      part(torusSpec(0.036, 0.01, 10, 5), "#E5B94C", { position: [0.034, 0.36, -0.222] })
    ]
  });

  const headAnchor: Vec3 = [0, 0.565, 0];
  const headEnamel = composeLobe({
    suffix: "robotHeadShell",
    craft: "carPaint",
    hinge: headAnchor,
    parts: [
      part(headShell, "#F4F8FC", { position: [0, 0.7, 0] }),
      part(visorFrame, "#28394F", { position: [0, 0.717, 0.118] }),
      // Side ear domes & antenna stem socketed flush against headShell
      part(cylinderSpec(0.048, 0.054, 0.038, 12, 0.008), "#7EC4F2", {
        position: [-0.172, 0.7, 0],
        rotation: [0, 0, Math.PI * 0.5]
      }),
      part(cylinderSpec(0.048, 0.054, 0.038, 12, 0.008), "#7EC4F2", {
        position: [0.172, 0.7, 0],
        rotation: [0, 0, Math.PI * 0.5]
      }),
      part(cylinderSpec(0.015, 0.024, 0.105, 10, 0.004), "#B8C4D4", { position: [0, 0.872, 0] }),
      part(torusSpec(0.028, 0.009, 10, 5), "#7EC4F2", {
        position: [0, 0.832, 0],
        rotation: [Math.PI * 0.5, 0, 0]
      }),
      ...eyes.browParts
    ]
  });

  const headBeacon = composeLobe({
    suffix: "robotAntennaGlow",
    craft: "warmGlow",
    hinge: headAnchor,
    baseColor: "#FFB938",
    emissive: "#FFB938",
    emissiveIntensity: 0.42,
    parts: [part(smoothPuffSpec(0.042, 0.042, 0.042, 10, 5), "#FFD066", { position: [0, 0.945, 0] })]
  });

  const jawAnchor: Vec3 = [0, 0.625, 0.112];
  const jawLobe = composeLobe({
    suffix: "robotSpeakerJaw",
    craft: "carPaint",
    hinge: jawAnchor,
    parts: [
      part(chamferedBoxSpec(0.17, 0.048, 0.044, 0.01), "#DCE5F0", { position: [0, 0.618, 0.116] }),
      part(chamferedBoxSpec(0.12, 0.012, 0.014, 0.003), "#3D5570", { position: [0, 0.622, 0.136] }),
      part(chamferedBoxSpec(0.1, 0.01, 0.014, 0.003), "#3D5570", { position: [0, 0.606, 0.136] })
    ]
  });

  const makeArm = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.18, 0.455, 0];
    const tube = sculptCurvedLimb(
      [
        [sign * 0.18, 0.455, 0],
        [sign * 0.238, 0.355, 0.035],
        [sign * 0.23, 0.245, 0.085]
      ],
      0.036,
      { steps: 5, radialSegments: 8 }
    );
    const lobe = composeLobe({
      suffix: "robotArm",
      craft: "carPaint",
      hinge: anchor,
      parts: [
        part(smoothPuffSpec(0.05, 0.05, 0.05, 8, 4), "#7EC4F2", { position: [sign * 0.18, 0.455, 0] }),
        part(tube, "#C2CEDE"),
        part(torusSpec(0.036, 0.013, 9, 6, Math.PI * 1.45), "#F4A63A", {
          position: [sign * 0.228, 0.22, 0.102],
          rotation: [0.35, 0, -Math.PI * 0.72]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "armL" : "armR", anchor, [lobe], "body");
  };

  const makeFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.095, 0.12, 0];
    const lobe = composeLobe({
      suffix: "robotFoot",
      craft: "carPaint",
      hinge: anchor,
      parts: [
        part(cylinderSpec(0.036, 0.04, 0.09, 8, 0.006), "#B8C4D4", { position: [sign * 0.095, 0.095, 0] }),
        part(chamferedBoxSpec(0.105, 0.062, 0.155, 0.018), "#5FA8DC", {
          position: [sign * 0.095, 0.031, 0.022]
        }),
        part(chamferedBoxSpec(0.11, 0.02, 0.16, 0.006), "#3A495C", {
          position: [sign * 0.095, 0.01, 0.022]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [lobe]);
  };

  return finalizeProceduralRig("robot", [
    makeSubPartRig("body", ORIGIN, [bodyEnamel, bodyDial, bodyMetal]),
    makeSubPartRig("head", headAnchor, [headEnamel, headBeacon], "body"),
    makeSubPartRig("jaw", jawAnchor, [jawLobe], "head"),
    makeArm(-1),
    makeArm(1),
    makeFoot(-1),
    makeFoot(1),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- shared quadruped leg helper

function makeQuadrupedHoofLeg(opts: {
  readonly partId: "legFL" | "legFR" | "legBL" | "legBR";
  readonly x: number;
  readonly z: number;
  readonly hipY: number;
  readonly upperColor: string;
  readonly stockingColor?: string;
  readonly hoofColor: string;
  readonly radius: number;
}): BuiltSubPart {
  const anchor: Vec3 = [opts.x, opts.hipY, opts.z];
  const kneeZ = opts.z + (opts.z > 0 ? 0.015 : -0.02);
  const upper = sculptCurvedLimb(
    [
      [opts.x, opts.hipY + 0.02, opts.z],
      [opts.x, opts.hipY * 0.56, kneeZ],
      [opts.x, opts.hipY * 0.24, opts.z]
    ],
    (t) => opts.radius * (1.18 - 0.3 * t),
    { steps: 4, radialSegments: 7 }
  );
  const parts: LobePartInput[] = [part(upper, opts.upperColor)];
  if (opts.stockingColor) {
    parts.push(
      part(
        cylinderSpec(opts.radius * 0.88, opts.radius * 0.92, opts.hipY * 0.28, 7, 0.006),
        opts.stockingColor,
        { position: [opts.x, opts.hipY * 0.18, opts.z] }
      )
    );
  }
  parts.push(
    part(cylinderSpec(opts.radius * 0.9, opts.radius * 1.04, 0.062, 7, 0.01), opts.hoofColor, {
      position: [opts.x, 0.031, opts.z + 0.008]
    })
  );
  const feltLobe = composeLobe({
    suffix: `${opts.partId}Coat`,
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: anchor,
    parts
  });
  return makeSubPartRig(opts.partId, anchor, [feltLobe]);
}

// ---------------------------------------------------------------- 3. COW (0.90m)

function buildCowRig(): ProceduralAssetRig {
  const barrel = sculptCurvedLimb(
    [
      [0, 0.45, -0.34],
      [0, 0.46, -0.05],
      [0, 0.49, 0.24],
      [0, 0.58, 0.36]
    ],
    (t) => 0.215 + 0.028 * Math.sin(t * Math.PI) - 0.045 * Math.pow(t, 2.2),
    { steps: 8, radialSegments: 14 }
  );
  const headAnchor: Vec3 = [0, 0.62, 0.36];
  const eyes = buildCompactEyes({
    eyeX: 0.095,
    eyeY: 0.735,
    eyeZ: 0.564,
    radius: 0.036,
    irisColor: "#4C3120",
    lashColor: "#2C2228",
    browColor: "#3A363D",
    parentPart: "head",
    outwardYaw: 0.26
  });

  const bodyFelt = composeLobe({
    suffix: "cowBodyCoat",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(barrel, "#FAF6EE"),
      // Saddle & flank charcoal dairy patches
      part(smoothPuffSpec(0.165, 0.125, 0.185, 10, 5), "#34353D", {
        position: [0.095, 0.535, -0.02],
        rotation: [0.08, 0.18, -0.22]
      }),
      part(smoothPuffSpec(0.145, 0.115, 0.155, 10, 5), "#34353D", {
        position: [-0.11, 0.495, -0.21],
        rotation: [-0.1, -0.2, 0.24]
      }),
      part(smoothPuffSpec(0.11, 0.095, 0.12, 8, 4), "#34353D", {
        position: [-0.085, 0.54, 0.14],
        rotation: [0.12, -0.1, 0.18]
      }),
      // Soft pink udder underneath
      part(smoothPuffSpec(0.085, 0.055, 0.095, 8, 4), "#F6B8C4", { position: [0, 0.255, -0.14] }),
      // Red stitched collar strap snugly hugging neck crease
      part(torusSpec(0.145, 0.02, 14, 6), "#D94E47", {
        position: [0, 0.565, 0.345],
        rotation: [1.08, 0, 0]
      })
    ]
  });

  const bodyBell = composeLobe({
    suffix: "cowBell",
    craft: "carPaint",
    parts: [
      part(cylinderSpec(0.028, 0.044, 0.068, 14, 0.008), "#F0C348", { position: [0, 0.405, 0.415] }),
      part(smoothPuffSpec(0.014, 0.014, 0.014, 8, 4), "#BA8A20", { position: [0, 0.368, 0.415] })
    ]
  });

  const headFelt = composeLobe({
    suffix: "cowHeadFelt",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: headAnchor,
    parts: [
      part(smoothPuffSpec(0.15, 0.155, 0.165, 14, 7), "#FAF6EE", { position: [0, 0.715, 0.44] }),
      part(smoothPuffSpec(0.078, 0.065, 0.08, 10, 5), "#34353D", {
        position: [0.068, 0.785, 0.445],
        rotation: [0, 0, -0.25]
      }),
      // Wide rosy velvet muzzle + nostrils
      part(smoothPuffSpec(0.135, 0.092, 0.095, 14, 7), "#F7B3C0", { position: [0, 0.642, 0.568] }),
      part(smoothPuffSpec(0.022, 0.016, 0.016, 8, 4), "#8C4A58", {
        position: [-0.052, 0.658, 0.65],
        rotation: [0, -0.2, 0.25]
      }),
      part(smoothPuffSpec(0.022, 0.016, 0.016, 8, 4), "#8C4A58", {
        position: [0.052, 0.658, 0.65],
        rotation: [0, 0.2, -0.25]
      }),
      ...eyes.browParts
    ]
  });

  const headHorns = composeLobe({
    suffix: "cowHorns",
    craft: "ceramic",
    hinge: headAnchor,
    parts: ([-1, 1] as const).map((sign) =>
      part(
        sculptCurvedLimb(
          [
            [sign * 0.095, 0.835, 0.41],
            [sign * 0.155, 0.905, 0.425],
            [sign * 0.135, 0.968, 0.455]
          ],
          (t) => 0.032 * (1 - 0.68 * t),
          { steps: 6, radialSegments: 9 }
        ),
        "#F3E5C8"
      )
    )
  });

  const jawAnchor: Vec3 = [0, 0.59, 0.52];
  const jawLobe = composeLobe({
    suffix: "cowJaw",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: jawAnchor,
    parts: [
      part(smoothPuffSpec(0.098, 0.038, 0.078, 10, 5), "#F4A4B4", { position: [0, 0.578, 0.555] }),
      part(smoothPuffSpec(0.052, 0.016, 0.048, 8, 4), "#E8768C", { position: [0, 0.596, 0.565] })
    ]
  });

  const makeEar = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.135, 0.765, 0.405];
    const lobe = composeLobe({
      suffix: "cowEar",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(smoothPuffSpec(0.085, 0.042, 0.035, 10, 5), sign > 0 ? "#34353D" : "#FAF6EE", {
          position: [sign * 0.205, 0.752, 0.405],
          rotation: [0, -sign * 0.15, -sign * 0.22]
        }),
        part(smoothPuffSpec(0.056, 0.025, 0.02, 8, 4), "#F7B3C0", {
          position: [sign * 0.205, 0.748, 0.422],
          rotation: [0, -sign * 0.15, -sign * 0.22]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "earL" : "earR", anchor, [lobe], "head");
  };

  const tailAnchor: Vec3 = [0, 0.52, -0.44];
  const tailLobe = composeLobe({
    suffix: "cowTail",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: tailAnchor,
    parts: [
      part(
        sculptCurvedLimb(
          [
            [0, 0.52, -0.44],
            [0, 0.39, -0.53],
            [0, 0.25, -0.55]
          ],
          (t) => 0.022 - 0.006 * t,
          { steps: 6, radialSegments: 8 }
        ),
        "#FAF6EE"
      ),
      part(smoothPuffSpec(0.038, 0.062, 0.038, 10, 5, 0.35), "#34353D", { position: [0, 0.215, -0.555] })
    ]
  });

  return finalizeProceduralRig("cow", [
    makeSubPartRig("body", ORIGIN, [bodyFelt, bodyBell]),
    makeSubPartRig("head", headAnchor, [headFelt, headHorns], "body"),
    makeSubPartRig("jaw", jawAnchor, [jawLobe], "head"),
    makeEar(-1),
    makeEar(1),
    makeSubPartRig("tail", tailAnchor, [tailLobe], "body"),
    makeQuadrupedHoofLeg({ partId: "legFL", x: -0.115, z: 0.21, hipY: 0.31, upperColor: "#FAF6EE", hoofColor: "#3A353D", radius: 0.052 }),
    makeQuadrupedHoofLeg({ partId: "legFR", x: 0.115, z: 0.21, hipY: 0.31, upperColor: "#FAF6EE", hoofColor: "#3A353D", radius: 0.052 }),
    makeQuadrupedHoofLeg({ partId: "legBL", x: -0.12, z: -0.25, hipY: 0.31, upperColor: "#FAF6EE", hoofColor: "#3A353D", radius: 0.055 }),
    makeQuadrupedHoofLeg({ partId: "legBR", x: 0.12, z: -0.25, hipY: 0.31, upperColor: "#FAF6EE", hoofColor: "#3A353D", radius: 0.055 }),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- 4. SHEEP (0.70m)

function buildSheepRig(): ProceduralAssetRig {
  const woolPuffSpecs: readonly OrganicPuffItem[] = [
    { position: [0, 0.48, -0.02], scale: [0.46, 0.4, 0.62], colorHex: "#FFFDF7" },
    { position: [0, 0.61, 0.04], scale: [0.3, 0.24, 0.34], colorHex: "#FFFDF9" },
    { position: [0, 0.59, -0.16], scale: [0.28, 0.22, 0.3], colorHex: "#FAF5EB" },
    { position: [-0.16, 0.52, 0.08], scale: [0.25, 0.25, 0.27], colorHex: "#FFFDF7" },
    { position: [0.16, 0.52, 0.08], scale: [0.25, 0.25, 0.27], colorHex: "#FFFDF7" },
    { position: [-0.18, 0.48, -0.1], scale: [0.27, 0.25, 0.28], colorHex: "#FAF4EA" },
    { position: [0.18, 0.48, -0.1], scale: [0.27, 0.25, 0.28], colorHex: "#FAF4EA" },
    { position: [-0.14, 0.45, -0.26], scale: [0.24, 0.23, 0.25], colorHex: "#FFFDF7" },
    { position: [0.14, 0.45, -0.26], scale: [0.24, 0.23, 0.25], colorHex: "#FFFDF7" },
    { position: [0, 0.54, 0.22], scale: [0.3, 0.27, 0.27], colorHex: "#FFFDF9" },
    { position: [-0.12, 0.39, 0.18], scale: [0.21, 0.2, 0.23], colorHex: "#F7EFE2" },
    { position: [0.12, 0.39, 0.18], scale: [0.21, 0.2, 0.23], colorHex: "#F7EFE2" },
    { position: [0, 0.46, -0.33], scale: [0.27, 0.25, 0.24], colorHex: "#FAF5EB" }
  ];
  const fleece = sculptFbmOrganicPuffs(woolPuffSpecs, {
    seed: 909,
    amplitude: 0.014,
    frequency: 3.4,
    puffSegments: 4
  });

  const headAnchor: Vec3 = [0, 0.58, 0.31];
  const eyes = buildCompactEyes({
    eyeX: 0.082,
    eyeY: 0.678,
    eyeZ: 0.528,
    radius: 0.034,
    irisColor: "#5C4028",
    lashColor: "#241E22",
    browColor: "#FFFDF7",
    parentPart: "head",
    outwardYaw: 0.24
  });

  const bodyWool = composeLobe({
    suffix: "sheepFleece",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      {
        geometry: fleece.geometry,
        subShapes: 18
      },
      // Sky-blue ribbon collar snugly hugging neck under front fleece
      part(torusSpec(0.122, 0.018, 12, 6), "#7AB8E8", {
        position: [0, 0.555, 0.345],
        rotation: [1.12, 0, 0]
      })
    ]
  });

  const bodyCharm = composeLobe({
    suffix: "sheepCollarTag",
    craft: "wood",
    craftTexture: "woodGrainPlank",
    parts: [part(discSpec(0.024, 12, 0.01), "#D99B58", { position: [0, 0.435, 0.415] })]
  });

  const headVelvet = composeLobe({
    suffix: "sheepFace",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: headAnchor,
    parts: [
      part(smoothPuffSpec(0.128, 0.135, 0.155, 10, 5), "#4A4348", { position: [0, 0.65, 0.415] }),
      part(smoothPuffSpec(0.095, 0.075, 0.085, 8, 4), "#5A5157", { position: [0, 0.605, 0.515] }),
      part(smoothPuffSpec(0.032, 0.02, 0.018, 6, 3), "#F29EB0", { position: [-0.095, 0.625, 0.485] }),
      part(smoothPuffSpec(0.032, 0.02, 0.018, 6, 3), "#F29EB0", { position: [0.095, 0.625, 0.485] }),
      part(smoothPuffSpec(0.024, 0.016, 0.018, 6, 3), "#F5B0BE", { position: [0, 0.625, 0.592] }),
      // Fluffy crown wool cap on top of head
      part(smoothPuffSpec(0.115, 0.082, 0.11, 8, 4), "#FFFDF9", { position: [0, 0.79, 0.405] }),
      part(smoothPuffSpec(0.078, 0.062, 0.078, 7, 3), "#FAF4EA", { position: [-0.068, 0.775, 0.425] }),
      part(smoothPuffSpec(0.078, 0.062, 0.078, 7, 3), "#FAF4EA", { position: [0.068, 0.775, 0.425] }),
      ...eyes.browParts
    ]
  });

  const jawAnchor: Vec3 = [0, 0.568, 0.475];
  const jawLobe = composeLobe({
    suffix: "sheepJaw",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: jawAnchor,
    parts: [
      part(smoothPuffSpec(0.072, 0.032, 0.068, 10, 5), "#4A4348", { position: [0, 0.558, 0.505] }),
      part(smoothPuffSpec(0.042, 0.014, 0.042, 8, 4), "#F298AA", { position: [0, 0.572, 0.515] })
    ]
  });

  const makeEar = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.115, 0.705, 0.395];
    const lobe = composeLobe({
      suffix: "sheepEar",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(smoothPuffSpec(0.082, 0.038, 0.034, 10, 5), "#4A4348", {
          position: [sign * 0.185, 0.682, 0.395],
          rotation: [0, -sign * 0.12, -sign * 0.34]
        }),
        part(smoothPuffSpec(0.052, 0.022, 0.02, 8, 4), "#E8A6B4", {
          position: [sign * 0.185, 0.678, 0.41],
          rotation: [0, -sign * 0.12, -sign * 0.34]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "earL" : "earR", anchor, [lobe], "head");
  };

  const tailAnchor: Vec3 = [0, 0.48, -0.42];
  const tailLobe = composeLobe({
    suffix: "sheepTail",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: tailAnchor,
    parts: [
      part(smoothPuffSpec(0.068, 0.068, 0.075, 10, 5), "#FFFDF7", { position: [0, 0.465, -0.465] }),
      part(smoothPuffSpec(0.048, 0.048, 0.052, 8, 4), "#FAF4EA", { position: [0, 0.435, -0.51] })
    ]
  });

  return finalizeProceduralRig("sheep", [
    makeSubPartRig("body", ORIGIN, [bodyWool, bodyCharm]),
    makeSubPartRig("head", headAnchor, [headVelvet], "body"),
    makeSubPartRig("jaw", jawAnchor, [jawLobe], "head"),
    makeEar(-1),
    makeEar(1),
    makeSubPartRig("tail", tailAnchor, [tailLobe], "body"),
    makeQuadrupedHoofLeg({ partId: "legFL", x: -0.105, z: 0.18, hipY: 0.28, upperColor: "#4A4348", hoofColor: "#2B262B", radius: 0.044 }),
    makeQuadrupedHoofLeg({ partId: "legFR", x: 0.105, z: 0.18, hipY: 0.28, upperColor: "#4A4348", hoofColor: "#2B262B", radius: 0.044 }),
    makeQuadrupedHoofLeg({ partId: "legBL", x: -0.11, z: -0.21, hipY: 0.28, upperColor: "#4A4348", hoofColor: "#2B262B", radius: 0.046 }),
    makeQuadrupedHoofLeg({ partId: "legBR", x: 0.11, z: -0.21, hipY: 0.28, upperColor: "#4A4348", hoofColor: "#2B262B", radius: 0.046 }),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- 5. DUCK (0.45m)

function buildDuckRig(): ProceduralAssetRig {
  const hull = sculptCurvedLimb(
    [
      [0, 0.36, -0.32],
      [0, 0.28, -0.1],
      [0, 0.31, 0.145],
      [0, 0.585, 0.205]
    ],
    (t) => 0.145 + 0.082 * Math.sin(t * Math.PI) - 0.042 * Math.pow(t, 2.2),
    { steps: 10, radialSegments: 16 }
  );
  const headAnchor: Vec3 = [0, 0.52, 0.18];
  const eyes = buildCompactEyes({
    eyeX: 0.084,
    eyeY: 0.725,
    eyeZ: 0.33,
    radius: 0.04,
    irisColor: "#2C4B78",
    lashColor: "#3D2A1A",
    browColor: "#E8A61C",
    parentPart: "head",
    outwardYaw: 0.26
  });

  const bodyFelt = composeLobe({
    suffix: "duckBody",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(hull, "#FFE055"),
      part(smoothPuffSpec(0.155, 0.115, 0.125, 12, 6), "#FFF5BA", { position: [0, 0.335, 0.205] }),
      part(smoothPuffSpec(0.11, 0.085, 0.12, 10, 5), "#FFF5BA", { position: [0, 0.205, 0.02] }),
      // Sailor neckerchief ribbon for extra storybook charm
      part(torusSpec(0.132, 0.018, 16, 8), "#4FA3E8", {
        position: [0, 0.485, 0.195],
        rotation: [1.15, 0, 0]
      })
    ]
  });

  const headFelt = composeLobe({
    suffix: "duckHead",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: headAnchor,
    parts: [
      part(smoothPuffSpec(0.155, 0.16, 0.158, 14, 7), "#FFE055", { position: [0, 0.695, 0.2] }),
      part(smoothPuffSpec(0.036, 0.024, 0.02, 8, 4), "#FFA38C", { position: [-0.11, 0.665, 0.295] }),
      part(smoothPuffSpec(0.036, 0.024, 0.02, 8, 4), "#FFA38C", { position: [0.11, 0.665, 0.295] }),
      // Cute 2-curl head tuft
      part(
        sculptCurvedLimb(
          [
            [0, 0.84, 0.19],
            [0.015, 0.91, 0.175],
            [-0.01, 0.955, 0.145]
          ],
          (t) => 0.032 * (1 - 0.6 * t),
          { steps: 6, radialSegments: 8 }
        ),
        "#FFD438"
      ),
      ...eyes.browParts
    ]
  });

  const headBillUpper = composeLobe({
    suffix: "duckBillUpper",
    craft: "clay",
    hinge: headAnchor,
    parts: [
      part(smoothPuffSpec(0.098, 0.038, 0.105, 12, 6), "#FF9436", { position: [0, 0.662, 0.365] }),
      part(smoothPuffSpec(0.012, 0.008, 0.012, 6, 3), "#C45B16", { position: [-0.032, 0.686, 0.395] }),
      part(smoothPuffSpec(0.012, 0.008, 0.012, 6, 3), "#C45B16", { position: [0.032, 0.686, 0.395] })
    ]
  });

  const beakLowerAnchor: Vec3 = [0, 0.635, 0.31];
  const beakLowerLobe = composeLobe({
    suffix: "duckBillLower",
    craft: "clay",
    hinge: beakLowerAnchor,
    parts: [
      part(smoothPuffSpec(0.084, 0.026, 0.092, 10, 5), "#F58225", { position: [0, 0.628, 0.355] }),
      part(smoothPuffSpec(0.048, 0.012, 0.055, 8, 4), "#FF9E9E", { position: [0, 0.642, 0.35] })
    ]
  });

  const makeWing = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.175, 0.39, 0.04];
    const lobe = composeLobe({
      suffix: "duckWing",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(smoothPuffSpec(0.045, 0.095, 0.165, 12, 6), "#FAD33C", {
          position: [sign * 0.195, 0.365, -0.02],
          rotation: [0.16, sign * 0.12, -sign * 0.18]
        }),
        part(smoothPuffSpec(0.028, 0.048, 0.095, 8, 4), "#FFF2B0", {
          position: [sign * 0.212, 0.34, -0.08],
          rotation: [0.22, sign * 0.14, -sign * 0.2]
        }),
        part(smoothPuffSpec(0.025, 0.038, 0.075, 8, 4), "#FFF2B0", {
          position: [sign * 0.208, 0.385, -0.1],
          rotation: [0.18, sign * 0.14, -sign * 0.18]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "wingL" : "wingR", anchor, [lobe], "body");
  };

  const tailAnchor: Vec3 = [0, 0.38, -0.32];
  const tailLobe = composeLobe({
    suffix: "duckTail",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: tailAnchor,
    parts: [
      part(
        sculptCurvedLimb(
          [
            [0, 0.38, -0.32],
            [0, 0.44, -0.41],
            [0, 0.51, -0.43]
          ],
          (t) => 0.068 * (1 - 0.58 * t),
          { steps: 6, radialSegments: 8 }
        ),
        "#FFE055"
      ),
      part(smoothPuffSpec(0.055, 0.035, 0.065, 8, 4), "#FFF5BA", {
        position: [-0.045, 0.425, -0.385],
        rotation: [0.35, -0.25, 0]
      }),
      part(smoothPuffSpec(0.055, 0.035, 0.065, 8, 4), "#FFF5BA", {
        position: [0.045, 0.425, -0.385],
        rotation: [0.35, 0.25, 0]
      })
    ]
  });

  const makeWebFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.092, 0.16, 0.02];
    const webOuter: readonly ProceduralVec2[] = [
      [-0.028, -0.05],
      [0.028, -0.05],
      [0.072, 0.065],
      [0.026, 0.048],
      [0.0, 0.078],
      [-0.026, 0.048],
      [-0.072, 0.065]
    ];
    const webPaddle = extrudeContourSpec({ outer: webOuter, depth: 0.024, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
    const lobe = composeLobe({
      suffix: "duckFoot",
      craft: "clay",
      hinge: anchor,
      parts: [
        part(cylinderSpec(0.024, 0.028, 0.14, 10, 0.004), "#FF9436", { position: [sign * 0.092, 0.09, 0.02] }),
        part(webPaddle, "#FF9436", {
          position: [sign * 0.092, 0.014, 0.055],
          rotation: [Math.PI * 0.5, sign * 0.1, 0]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [lobe]);
  };

  return finalizeProceduralRig("duck", [
    makeSubPartRig("body", ORIGIN, [bodyFelt]),
    makeSubPartRig("head", headAnchor, [headFelt, headBillUpper], "body"),
    makeSubPartRig("beakLower", beakLowerAnchor, [beakLowerLobe], "head"),
    makeWing(-1),
    makeWing(1),
    makeSubPartRig("tail", tailAnchor, [tailLobe], "body"),
    makeWebFoot(-1),
    makeWebFoot(1),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- 6. HORSE (1.00m)

function buildHorseRig(): ProceduralAssetRig {
  const torso = sculptCurvedLimb(
    [
      [0, 0.48, -0.32],
      [0, 0.48, -0.05],
      [0, 0.51, 0.2],
      [0, 0.66, 0.3],
      [0, 0.78, 0.34]
    ],
    (t) => (t < 0.55 ? 0.175 + 0.02 * Math.sin(t * Math.PI) : 0.165 - 0.055 * (t - 0.55)),
    { steps: 9, radialSegments: 14 }
  );
  const headAnchor: Vec3 = [0, 0.76, 0.34];
  const eyes = buildCompactEyes({
    eyeX: 0.078,
    eyeY: 0.834,
    eyeZ: 0.474,
    radius: 0.032,
    irisColor: "#462A18",
    lashColor: "#24160E",
    browColor: "#5A3620",
    parentPart: "head",
    outwardYaw: 0.32
  });

  const bodyFelt = composeLobe({
    suffix: "horseCoat",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(torso, "#C58956"),
      part(smoothPuffSpec(0.145, 0.135, 0.155, 10, 5), "#BA7E4C", { position: [0, 0.495, -0.26] }),
      // Cozy quilted sky-blue saddle blanket + gold trim + leather stirrup straps
      part(chamferedBoxSpec(0.41, 0.15, 0.26, 0.032), "#5CA4DC", { position: [0, 0.612, -0.04] }),
      part(chamferedBoxSpec(0.42, 0.028, 0.27, 0.008), "#F7D458", { position: [0, 0.536, -0.04] }),
      part(chamferedBoxSpec(0.022, 0.11, 0.024, 0.004), "#7A4426", { position: [-0.202, 0.485, -0.04] }),
      part(chamferedBoxSpec(0.022, 0.11, 0.024, 0.004), "#7A4426", { position: [0.202, 0.485, -0.04] }),
      // Scalloped dark-cocoa neck mane puffs
      part(smoothPuffSpec(0.045, 0.068, 0.072, 8, 4), "#54331F", { position: [0, 0.76, 0.24] }),
      part(smoothPuffSpec(0.045, 0.068, 0.072, 8, 4), "#54331F", { position: [0, 0.695, 0.19] }),
      part(smoothPuffSpec(0.042, 0.062, 0.068, 8, 4), "#54331F", { position: [0, 0.635, 0.14] })
    ]
  });

  const bodyStirrups = composeLobe({
    suffix: "horseStirrups",
    craft: "carPaint",
    parts: [
      part(torusSpec(0.024, 0.006, 9, 5), "#E5B94C", { position: [-0.205, 0.425, -0.04], rotation: [0, Math.PI * 0.5, 0] }),
      part(torusSpec(0.024, 0.006, 9, 5), "#E5B94C", { position: [0.205, 0.425, -0.04], rotation: [0, Math.PI * 0.5, 0] })
    ]
  });

  const headFelt = composeLobe({
    suffix: "horseHead",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: headAnchor,
    parts: [
      part(
        sculptCurvedLimb(
          [
            [0, 0.835, 0.365],
            [0, 0.805, 0.465],
            [0, 0.755, 0.565]
          ],
          (t) => 0.118 - 0.034 * t,
          { steps: 7, radialSegments: 14 }
        ),
        "#C58956"
      ),
      // Cream forehead diamond blaze & soft velvet muzzle
      part(smoothPuffSpec(0.034, 0.075, 0.024, 8, 4), "#FCF6EA", {
        position: [0, 0.845, 0.485],
        rotation: [0.42, 0, 0]
      }),
      part(smoothPuffSpec(0.082, 0.068, 0.075, 12, 6), "#EAD7BF", { position: [0, 0.745, 0.575] }),
      part(smoothPuffSpec(0.018, 0.014, 0.014, 6, 3), "#5C3A28", { position: [-0.042, 0.762, 0.638] }),
      part(smoothPuffSpec(0.018, 0.014, 0.014, 6, 3), "#5C3A28", { position: [0.042, 0.762, 0.638] }),
      // Forelock mane tuft between ears
      part(
        sculptCurvedLimb(
          [
            [0, 0.915, 0.37],
            [0.012, 0.925, 0.435],
            [0.018, 0.885, 0.485]
          ],
          (t) => 0.042 * (1 - 0.55 * t),
          { steps: 6, radialSegments: 8 }
        ),
        "#54331F"
      ),
      // Friendly bridle strap
      part(torusSpec(0.082, 0.011, 14, 6), "#8A4A2A", {
        position: [0, 0.768, 0.535],
        rotation: [0.45, 0, 0]
      }),
      ...eyes.browParts
    ]
  });

  const jawAnchor: Vec3 = [0, 0.715, 0.51];
  const jawLobe = composeLobe({
    suffix: "horseJaw",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: jawAnchor,
    parts: [
      part(smoothPuffSpec(0.064, 0.028, 0.068, 10, 5), "#E2CCB2", { position: [0, 0.702, 0.555] }),
      part(smoothPuffSpec(0.038, 0.012, 0.042, 8, 4), "#E58B98", { position: [0, 0.716, 0.56] })
    ]
  });

  const makeEar = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.068, 0.9, 0.355];
    const lobe = composeLobe({
      suffix: "horseEar",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(
          sculptCurvedLimb(
            [
              [sign * 0.068, 0.9, 0.355],
              [sign * 0.088, 0.955, 0.365],
              [sign * 0.078, 0.995, 0.378]
            ],
            (t) => 0.034 * (1 - 0.62 * t),
            { steps: 5, radialSegments: 8 }
          ),
          "#B57947"
        ),
        part(smoothPuffSpec(0.016, 0.034, 0.01, 6, 3), "#F4C2C2", {
          position: [sign * 0.078, 0.945, 0.382]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "earL" : "earR", anchor, [lobe], "head");
  };

  const tailAnchor: Vec3 = [0, 0.54, -0.39];
  const tailLobe = composeLobe({
    suffix: "horseTail",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: tailAnchor,
    parts: [
      part(
        sculptCurvedLimb(
          [
            [0, 0.54, -0.39],
            [0, 0.47, -0.5],
            [0, 0.31, -0.54],
            [0, 0.18, -0.5]
          ],
          (t) => 0.038 + 0.036 * Math.sin(t * Math.PI) * (1 - 0.35 * t),
          { steps: 6, radialSegments: 9 }
        ),
        "#54331F"
      ),
      part(smoothPuffSpec(0.042, 0.085, 0.045, 8, 4), "#684028", { position: [0.018, 0.36, -0.52] })
    ]
  });

  return finalizeProceduralRig("horse", [
    makeSubPartRig("body", ORIGIN, [bodyFelt, bodyStirrups]),
    makeSubPartRig("head", headAnchor, [headFelt], "body"),
    makeSubPartRig("jaw", jawAnchor, [jawLobe], "head"),
    makeEar(-1),
    makeEar(1),
    makeSubPartRig("tail", tailAnchor, [tailLobe], "body"),
    makeQuadrupedHoofLeg({ partId: "legFL", x: -0.095, z: 0.19, hipY: 0.34, upperColor: "#C58956", stockingColor: "#FCF6EA", hoofColor: "#33251E", radius: 0.045 }),
    makeQuadrupedHoofLeg({ partId: "legFR", x: 0.095, z: 0.19, hipY: 0.34, upperColor: "#C58956", stockingColor: "#FCF6EA", hoofColor: "#33251E", radius: 0.045 }),
    makeQuadrupedHoofLeg({ partId: "legBL", x: -0.1, z: -0.23, hipY: 0.34, upperColor: "#C58956", stockingColor: "#FCF6EA", hoofColor: "#33251E", radius: 0.048 }),
    makeQuadrupedHoofLeg({ partId: "legBR", x: 0.1, z: -0.23, hipY: 0.34, upperColor: "#C58956", stockingColor: "#FCF6EA", hoofColor: "#33251E", radius: 0.048 }),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- 7. BIRD (0.30m)

function buildBirdRig(): ProceduralAssetRig {
  const bodyCore = sculptOrganicLathe(
    [
      [0.0, 0.14],
      [0.18, 0.16],
      [0.26, 0.3],
      [0.25, 0.5],
      [0.18, 0.64],
      [0.0, 0.66]
    ],
    { segments: 18 }
  );
  const headAnchor: Vec3 = [0, 0.58, 0.08];
  const eyes = buildCompactEyes({
    eyeX: 0.098,
    eyeY: 0.748,
    eyeZ: 0.292,
    radius: 0.042,
    irisColor: "#243F6B",
    lashColor: "#1B2E4B",
    browColor: "#357EC4",
    parentPart: "head",
    outwardYaw: 0.28
  });

  const bodyFelt = composeLobe({
    suffix: "birdBody",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(bodyCore, "#52A8EE", { scale: [1, 1, 1.12] }),
      part(smoothPuffSpec(0.182, 0.192, 0.128, 14, 7), "#FFF6E6", { position: [0, 0.38, 0.188] }),
      // Delicate orange feet claws tucked at base (y = 0)
      part(cylinderSpec(0.016, 0.018, 0.14, 7, 0.003), "#FF9438", { position: [-0.075, 0.08, 0.03] }),
      part(cylinderSpec(0.016, 0.018, 0.14, 7, 0.003), "#FF9438", { position: [0.075, 0.08, 0.03] }),
      part(smoothPuffSpec(0.036, 0.018, 0.058, 7, 3), "#FF9438", { position: [-0.075, 0.018, 0.065] }),
      part(smoothPuffSpec(0.036, 0.018, 0.058, 7, 3), "#FF9438", { position: [0.075, 0.018, 0.065] })
    ]
  });

  const headFelt = composeLobe({
    suffix: "birdHead",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: headAnchor,
    parts: [
      part(smoothPuffSpec(0.195, 0.195, 0.2, 12, 6), "#52A8EE", { position: [0, 0.735, 0.12] }),
      part(smoothPuffSpec(0.045, 0.028, 0.022, 8, 4), "#FFA59C", { position: [-0.135, 0.695, 0.245] }),
      part(smoothPuffSpec(0.045, 0.028, 0.022, 8, 4), "#FFA59C", { position: [0.135, 0.695, 0.245] }),
      // Crown feather crest
      part(
        sculptCurvedLimb(
          [
            [0, 0.905, 0.11],
            [0, 0.968, 0.075],
            [0, 1.0, 0.02]
          ],
          (t) => 0.038 * (1 - 0.6 * t),
          { steps: 5, radialSegments: 8 }
        ),
        "#388AD4"
      ),
      ...eyes.browParts
    ]
  });

  const headBeak = composeLobe({
    suffix: "birdBeakUpper",
    craft: "clay",
    hinge: headAnchor,
    parts: [
      part(
        sculptCurvedLimb(
          [
            [0, 0.715, 0.295],
            [0, 0.705, 0.365],
            [0, 0.69, 0.425]
          ],
          (t) => 0.056 * (1 - 0.8 * t),
          { steps: 5, radialSegments: 9 }
        ),
        "#FF9B38"
      )
    ]
  });

  const beakLowerAnchor: Vec3 = [0, 0.675, 0.285];
  const beakLowerLobe = composeLobe({
    suffix: "birdBeakLower",
    craft: "clay",
    hinge: beakLowerAnchor,
    parts: [
      part(
        sculptCurvedLimb(
          [
            [0, 0.672, 0.29],
            [0, 0.668, 0.345],
            [0, 0.675, 0.395]
          ],
          (t) => 0.044 * (1 - 0.78 * t),
          { steps: 5, radialSegments: 8 }
        ),
        "#F08324"
      )
    ]
  });

  const makeWing = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.215, 0.48, 0.03];
    const lobe = composeLobe({
      suffix: "birdWing",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(smoothPuffSpec(0.052, 0.135, 0.205, 12, 6), "#3B8ED8", {
          position: [sign * 0.245, 0.435, -0.03],
          rotation: [0.22, sign * 0.16, -sign * 0.24]
        }),
        part(smoothPuffSpec(0.032, 0.062, 0.125, 8, 4), "#BCE0FF", {
          position: [sign * 0.265, 0.395, -0.11],
          rotation: [0.28, sign * 0.18, -sign * 0.26]
        }),
        part(smoothPuffSpec(0.028, 0.052, 0.105, 8, 4), "#BCE0FF", {
          position: [sign * 0.26, 0.455, -0.13],
          rotation: [0.2, sign * 0.18, -sign * 0.22]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "wingL" : "wingR", anchor, [lobe], "body");
  };

  const tailAnchor: Vec3 = [0, 0.36, -0.26];
  const tailLobe = composeLobe({
    suffix: "birdTail",
    craft: "felt",
    craftTexture: "feltBoucle",
    hinge: tailAnchor,
    parts: [
      part(smoothPuffSpec(0.065, 0.028, 0.155, 10, 5), "#3B8ED8", {
        position: [0, 0.42, -0.37],
        rotation: [0.42, 0, 0]
      }),
      part(smoothPuffSpec(0.055, 0.024, 0.135, 8, 4), "#7EC2FA", {
        position: [-0.058, 0.41, -0.355],
        rotation: [0.38, -0.26, 0]
      }),
      part(smoothPuffSpec(0.055, 0.024, 0.135, 8, 4), "#7EC2FA", {
        position: [0.058, 0.41, -0.355],
        rotation: [0.38, 0.26, 0]
      })
    ]
  });

  return finalizeProceduralRig("bird", [
    makeSubPartRig("body", ORIGIN, [bodyFelt]),
    makeSubPartRig("head", headAnchor, [headFelt, headBeak], "body"),
    makeSubPartRig("beakLower", beakLowerAnchor, [beakLowerLobe], "head"),
    makeWing(-1),
    makeWing(1),
    makeSubPartRig("tail", tailAnchor, [tailLobe], "body"),
    eyes.eyelidL,
    eyes.eyelidR
  ]);
}

// ---------------------------------------------------------------- 8. BUTTERFLY (0.30m)

function buildButterflyRig(): ProceduralAssetRig {
  const abdomen = sculptCurvedLimb(
    [
      [0, 0.12, -0.14],
      [0, 0.3, -0.06],
      [0, 0.52, 0.03],
      [0, 0.68, 0.09]
    ],
    (t) => 0.055 + 0.032 * Math.sin(t * Math.PI),
    { steps: 8, radialSegments: 12 }
  );

  const bodyVelvet = composeLobe({
    suffix: "butterflyBody",
    craft: "felt",
    craftTexture: "feltBoucle",
    parts: [
      part(abdomen, "#5A446E"),
      part(smoothPuffSpec(0.095, 0.095, 0.098, 12, 6), "#6A5082", { position: [0, 0.74, 0.125] }),
      part(smoothPuffSpec(0.075, 0.042, 0.075, 10, 5), "#FFF2CC", { position: [0, 0.62, 0.075] }),
      // Curled antennae with marigold tips
      part(
        sculptCurvedLimb(
          [
            [-0.038, 0.815, 0.145],
            [-0.085, 0.915, 0.185],
            [-0.125, 0.965, 0.155]
          ],
          0.012,
          { steps: 6, radialSegments: 7 }
        ),
        "#463358"
      ),
      part(
        sculptCurvedLimb(
          [
            [0.038, 0.815, 0.145],
            [0.085, 0.915, 0.185],
            [0.125, 0.965, 0.155]
          ],
          0.012,
          { steps: 6, radialSegments: 7 }
        ),
        "#463358"
      ),
      part(smoothPuffSpec(0.026, 0.026, 0.026, 8, 4), "#FFD24A", { position: [-0.128, 0.97, 0.152] }),
      part(smoothPuffSpec(0.026, 0.026, 0.026, 8, 4), "#FFD24A", { position: [0.128, 0.97, 0.152] }),
      // Friendly smile arc
      part(smoothPuffSpec(0.022, 0.014, 0.014, 6, 3), "#FFA4B8", { position: [-0.062, 0.715, 0.205] }),
      part(smoothPuffSpec(0.022, 0.014, 0.014, 6, 3), "#FFA4B8", { position: [0.062, 0.715, 0.205] })
    ]
  });

  const bodyEyes = composeLobe({
    suffix: "butterflyEyes",
    craft: "lacquer",
    parts: [
      part(smoothPuffSpec(0.032, 0.034, 0.026, 10, 5), "#1D1426", { position: [-0.048, 0.758, 0.205] }),
      part(smoothPuffSpec(0.032, 0.034, 0.026, 10, 5), "#1D1426", { position: [0.048, 0.758, 0.205] }),
      part(smoothPuffSpec(0.011, 0.011, 0.01, 6, 3), "#FFFFFF", { position: [-0.056, 0.768, 0.228] }),
      part(smoothPuffSpec(0.011, 0.011, 0.01, 6, 3), "#FFFFFF", { position: [0.04, 0.768, 0.228] })
    ]
  });

  const makeButterflyWing = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.065, 0.54, 0.02];
    const rawForeContour = bezierProfilePoints(
      [0, -0.02],
      [
        { cp1: [0.1, 0.14], cp2: [0.28, 0.31], to: [0.46, 0.31] },
        { cp1: [0.6, 0.31], cp2: [0.64, 0.14], to: [0.55, 0.02] },
        { cp1: [0.48, -0.06], cp2: [0.24, -0.07], to: [0.04, -0.03] }
      ],
      4
    );
    const rawHindContour = bezierProfilePoints(
      [0, -0.04],
      [
        { cp1: [0.22, -0.03], cp2: [0.44, -0.08], to: [0.44, -0.21] },
        { cp1: [0.44, -0.33], cp2: [0.28, -0.39], to: [0.14, -0.32] },
        { cp1: [0.06, -0.27], cp2: [0.02, -0.14], to: [0.02, -0.06] }
      ],
      4
    );
    const foreContour: readonly ProceduralVec2[] =
      sign < 0 ? rawForeContour.map(([x, y]): ProceduralVec2 => [-x, y]).reverse() : rawForeContour;
    const hindContour: readonly ProceduralVec2[] =
      sign < 0 ? rawHindContour.map(([x, y]): ProceduralVec2 => [-x, y]).reverse() : rawHindContour;
    const foreWing = extrudeContourSpec({ outer: foreContour, depth: 0.026, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1 });
    const hindWing = extrudeContourSpec({ outer: hindContour, depth: 0.024, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });

    const lobe = composeLobe({
      suffix: "butterflyWing",
      craft: "felt",
      craftTexture: "feltBoucle",
      hinge: anchor,
      parts: [
        part(foreWing, "#FF82B2", {
          position: [sign * 0.065, 0.56, 0.02],
          rotation: [0.06, -sign * 0.1, 0]
        }),
        part(hindWing, "#FF9EC4", {
          position: [sign * 0.065, 0.52, 0.008],
          rotation: [0.08, -sign * 0.12, 0]
        }),
        // Marigold & cream scalloped wing eye-spots spanning through the wing slab so BOTH +Z and -Z show them!
        part(smoothPuffSpec(0.095, 0.078, 0.034, 12, 6), "#FFD24A", {
          position: [sign * 0.42, 0.69, 0.055],
          rotation: [0.06, -sign * 0.1, 0]
        }),
        part(smoothPuffSpec(0.048, 0.038, 0.04, 10, 5), "#FFFDF7", {
          position: [sign * 0.435, 0.708, 0.056],
          rotation: [0.06, -sign * 0.1, 0]
        }),
        part(smoothPuffSpec(0.068, 0.062, 0.032, 12, 6), "#FFD24A", {
          position: [sign * 0.31, 0.34, 0.038],
          rotation: [0.08, -sign * 0.12, 0]
        }),
        part(smoothPuffSpec(0.032, 0.03, 0.038, 10, 5), "#7EC8FA", {
          position: [sign * 0.32, 0.34, 0.039],
          rotation: [0.08, -sign * 0.12, 0]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "wingL" : "wingR", anchor, [lobe], "body");
  };

  return finalizeProceduralRig("butterfly", [
    makeSubPartRig("body", ORIGIN, [bodyVelvet, bodyEyes]),
    makeButterflyWing(-1),
    makeButterflyWing(1)
  ]);
}

// ---------------------------------------------------------------- exported Group 2 map

export const COMPANION_ANIMAL_RIGS: Readonly<Record<CompanionAnimalAssetKey, ProceduralAssetRig>> = {
  teddy: buildTeddyRig(),
  robot: buildRobotRig(),
  cow: buildCowRig(),
  sheep: buildSheepRig(),
  duck: buildDuckRig(),
  horse: buildHorseRig(),
  bird: buildBirdRig(),
  butterfly: buildButterflyRig()
};
