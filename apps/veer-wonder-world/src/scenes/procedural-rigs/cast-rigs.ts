// Hero Cast Sculpted Procedural Rigs (WP-3): Momo, Lulu, Sheru, GoGo, Lumi, and Peeko.
// Hand-crafted anatomical spline lathes, variable-taper spline sweeps, beveled contours,
// 4-layer liquid-gloss cabochon eyes, and tactile multi-craft lobes in unit-height [0..1] space.
// Zero network fetches, zero clocks, zero non-deterministic RNG, zero console calls, and zero unsafe casts.

import type { AuraCustomGeometrySpec } from "@aura3d/engine";
import type { ProceduralVec2, ProceduralVec3 } from "@aura3d/engine/procedural";
import type { SubPartId } from "../articulated-actors.js";
import type { Vec3 } from "../motion.js";
import {
  bezierProfilePoints,
  composeLobe,
  cylinderSpec,
  ensureOutwardNormals,
  extrudeContourSpec,
  finalizeProceduralRig,
  makeSubPartRig,
  part,
  sculptCurvedLimb,
  sculptOrganicLathe,
  torusSpec,
  type BuiltSubPart,
  type LobePartInput,
  type ProceduralAssetRig
} from "./rig-kit.js";

export const CAST_ASSET_KEYS = ["momo", "lulu", "sheru", "gogo", "lumi", "peeko"] as const;

export type CastAssetKey = (typeof CAST_ASSET_KEYS)[number];

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- compact smooth organic detail helpers

/**
 * Analytic smooth ellipsoid / teardrop with shared north/south pole fans (zero degenerate pole quads)
 * and exact `(uSegs, rings)` control for cushions, toe beans, nostrils, catchlights, cheeks, and buttons.
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
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // South pole (index 0)
  positions.push(0, -ry, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0);

  // Interior latitude rings (1 .. rng - 1)
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

  // North pole (last index)
  const northPole = positions.length / 3;
  positions.push(0, ry, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 1);

  const stride = seg + 1;
  // South cap fan (CCW from outside)
  for (let s = 0; s < seg; s += 1) {
    indices.push(0, 1 + s + 1, 1 + s);
  }
  // Middle quad bands
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
  // North cap fan
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
 * Smooth +Z spherical cabochon dome cap (zero unseen rear-hemisphere triangles)
 * for layered liquid-gloss eyes, tummy medallions, eye-patch masks, and cheek blushes.
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
 * Compact 28-triangle all-edge chamfered rectangular slab with smooth outward bevel normals
 * for painted sheet-metal locomotive running boards, chassis skirts, cab walls, and doors.
 */
function beveledSlabSpec(wx: number, wy: number, wz: number, bevel: number): AuraCustomGeometrySpec {
  const hx = Math.max(1e-4, wx * 0.5);
  const hy = Math.max(1e-4, wy * 0.5);
  const hz = Math.max(1e-4, wz * 0.5);
  const b = Math.min(bevel, hx * 0.4, hy * 0.4, hz * 0.4);
  const ix = hx - b;
  const iy = hy - b;
  const iz = hz - b;

  const rings: readonly (readonly [number, number, number])[] = [
    [ix, iy, -hz],
    [hx, hy, -iz],
    [hx, hy, iz],
    [ix, iy, hz]
  ];
  const corners: readonly (readonly [number, number])[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r < rings.length; r += 1) {
    const [rx, ry, pz] = rings[r]!;
    const v = r / 3;
    for (let c = 0; c < 4; c += 1) {
      const [sx, sy] = corners[c]!;
      const px = sx * rx;
      const py = sy * ry;
      positions.push(px, py, pz);
      const nx = px / hx;
      const ny = py / hy;
      const nz = pz / hz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nl, ny / nl, nz / nl);
      uvs.push(c / 3, v);
    }
  }

  const indices: number[] = [
    // -Z cap (viewed from -Z: 0, 3, 2, 1)
    0, 3, 2, 0, 2, 1
  ];
  for (let r = 0; r < 3; r += 1) {
    const rowA = r * 4;
    const rowB = rowA + 4;
    for (let c = 0; c < 4; c += 1) {
      const next = (c + 1) % 4;
      const a = rowA + c;
      const bIdx = rowA + next;
      const cIdx = rowB + c;
      const d = rowB + next;
      indices.push(a, bIdx, d, a, d, cIdx);
    }
  }
  // +Z cap (12, 13, 14, 15)
  indices.push(12, 13, 14, 12, 14, 15);

  return ensureOutwardNormals({
    kind: "aura-custom-geometry",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices)
  });
}

interface CastEyePairOptions {
  readonly eyeX: number;
  readonly eyeY: number;
  readonly eyeZ: number;
  readonly radius: number;
  readonly irisOuterColor: string;
  readonly irisColor: string;
  readonly irisCrescentColor: string;
  readonly pupilColor?: string;
  readonly scleraColor?: string;
  readonly lashColor: string;
  readonly browColor: string;
  readonly socketColor: string;
  readonly parentPart: SubPartId;
  readonly outwardYaw?: number;
  readonly pitch?: number;
  readonly browLift?: number;
}

interface CastEyePairBuilt {
  readonly headAccentParts: readonly LobePartInput[];
  readonly eyelidL: BuiltSubPart;
  readonly eyelidR: BuiltSubPart;
}

/**
 * Single-lobe (`lacquer`) 4-layer liquid-gloss cabochon eye + upper lash crease per side
 * so `eyelidL` and `eyelidR` stay 1 draw call each while blinking cleanly via `scaleY: 1 -> 0.1`.
 */
function buildCastEyePair(opts: CastEyePairOptions): CastEyePairBuilt {
  const r = opts.radius;
  const scleraColor = opts.scleraColor ?? "#FFFDF9";
  const pupilColor = opts.pupilColor ?? "#150E16";
  const yawMag = opts.outwardYaw ?? 0.15;
  const pitch = opts.pitch ?? -0.03;
  const browLift = opts.browLift ?? 1.42;

  const scleraGeo = cabochonCapSpec(r, r * 1.03, r * 0.36, 22, 3);
  const limbalGeo = cabochonCapSpec(r * 0.85, r * 0.88, r * 0.3, 20, 3);
  const irisGeo = cabochonCapSpec(r * 0.77, r * 0.8, r * 0.28, 20, 3);
  const crescentGeo = cabochonCapSpec(r * 0.52, r * 0.36, r * 0.24, 14, 2);
  const pupilGeo = cabochonCapSpec(r * 0.5, r * 0.53, r * 0.24, 18, 3);
  const catchMainGeo = cabochonCapSpec(r * 0.25, r * 0.25, r * 0.14, 12, 2);
  const catchSubGeo = cabochonCapSpec(r * 0.12, r * 0.12, r * 0.1, 10, 2);

  const buildSide = (sign: -1 | 1): BuiltSubPart => {
    const cx = sign * opts.eyeX;
    const cy = opts.eyeY;
    const cz = opts.eyeZ;
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
      (t) => r * (0.095 + 0.065 * Math.sin(t * Math.PI)),
      { steps: 8, radialSegments: 7 }
    );

    const eyeCabochon = composeLobe({
      suffix: "eyeCabochon",
      craft: "lacquer",
      parts: [
        part(scleraGeo, scleraColor, { rotation: [pitch, yaw, 0] }),
        part(limbalGeo, opts.irisOuterColor, {
          position: [sinY * r * 0.16, r * 0.02, cosY * r * 0.16],
          rotation: [pitch, yaw, 0]
        }),
        part(irisGeo, opts.irisColor, {
          position: [sinY * r * 0.2, r * 0.01, cosY * r * 0.2],
          rotation: [pitch, yaw, 0]
        }),
        part(crescentGeo, opts.irisCrescentColor, {
          position: [sinY * r * 0.24, -r * 0.18, cosY * r * 0.24],
          rotation: [pitch, yaw, 0]
        }),
        part(pupilGeo, pupilColor, {
          position: [sinY * r * 0.28, r * 0.02, cosY * r * 0.28],
          rotation: [pitch, yaw, 0]
        }),
        part(catchMainGeo, "#FFFFFF", {
          position: [-r * 0.22 + sinY * r * 0.36, r * 0.26, cosY * r * 0.38]
        }),
        part(catchSubGeo, "#FFFFFF", {
          position: [r * 0.2 + sinY * r * 0.35, -r * 0.19, cosY * r * 0.37]
        }),
        part(lashArc, opts.lashColor, { rotation: [pitch, yaw, 0] })
      ]
    });

    return makeSubPartRig(
      sign < 0 ? "eyelidL" : "eyelidR",
      anchor,
      [eyeCabochon],
      opts.parentPart
    );
  };

  const headAccentParts: LobePartInput[] = [];
  const socketRimGeo = cabochonCapSpec(r * 1.14, r * 1.16, r * 0.26, 12, 2);
  for (const sign of [-1, 1] as const) {
    const cx = sign * opts.eyeX;
    const cy = opts.eyeY;
    const cz = opts.eyeZ;
    const yaw = sign * yawMag;
    headAccentParts.push(
      part(socketRimGeo, opts.socketColor, {
        position: [cx - Math.sin(yaw) * r * 0.12, cy, cz - Math.cos(yaw) * r * 0.12],
        rotation: [pitch, yaw, 0]
      })
    );
    const browArc = sculptCurvedLimb(
      [
        [cx - sign * r * 0.62, cy + r * (browLift - 0.14), cz + r * 0.02],
        [cx, cy + r * (browLift + 0.08), cz + r * 0.1],
        [cx + sign * r * 0.68, cy + r * (browLift - 0.22), cz - r * 0.04]
      ],
      (t) => r * (0.085 + 0.045 * Math.sin(t * Math.PI)),
      { steps: 5, radialSegments: 5 }
    );
    headAccentParts.push(part(browArc, opts.browColor));
  }

  return {
    headAccentParts,
    eyelidL: buildSide(-1),
    eyelidR: buildSide(1)
  };
}

// ================================================================ 1. MOMO (h = 0.90m)

function buildMomoRig(): ProceduralAssetRig {
  const coat = "#B38CE8";
  const coatSoft = "#C29FF0";
  const coatDeep = "#9870D4";
  const cream = "#FCEBF3";
  const stitch = "#E2B2CE";
  const blush = "#F79EC0";

  // Plump pear/bean toddler torso (26 smooth radial segments) with cozy tummy swell and embedded neck collar.
  const torsoProfile = bezierProfilePoints(
    [0, 0.09],
    [
      { cp1: [0.16, 0.09], cp2: [0.245, 0.15], to: [0.238, 0.26] },
      { cp1: [0.232, 0.36], cp2: [0.195, 0.45], to: [0.155, 0.5] },
      { cp1: [0.138, 0.525], cp2: [0.125, 0.545], to: [0, 0.555] }
    ],
    3
  );
  const torsoGeo = sculptOrganicLathe(torsoProfile, { segments: 28 });

  // Back spine felt scallops (-Z turnaround silhouette charm).
  const backTuftGeo = smoothPuffSpec(0.032, 0.042, 0.046, 7, 4, 0.25);
  const hipSocketGeo = smoothPuffSpec(0.09, 0.075, 0.088, 7, 4);
  const bodyPlushLobe = composeLobe({
    suffix: "plushTorso",
    craft: "felt",
    tintTarget: true,
    parts: [
      part(torsoGeo, coat, { scale: [1.03, 1, 0.94] }),
      part(hipSocketGeo, coat, { position: [-0.135, 0.13, 0.01] }),
      part(hipSocketGeo, coat, { position: [0.135, 0.13, 0.01] }),
      part(backTuftGeo, coatSoft, { position: [0, 0.41, -0.195], rotation: [-0.28, 0, 0] }),
      part(backTuftGeo, coatDeep, { position: [0, 0.31, -0.22], rotation: [-0.15, 0, 0] }),
      part(backTuftGeo, coatSoft, { position: [0, 0.21, -0.21], rotation: [0.06, 0, 0] })
    ]
  });

  // Velvety cream-blush oval tummy medallion (felt craft so there are zero plastic hotspots or pokey rivets).
  const tummyPatchGeo = cabochonCapSpec(0.145, 0.162, 0.044, 28, 3);
  const bodyTrimLobe = composeLobe({
    suffix: "tummyMedallion",
    craft: "felt",
    parts: [part(tummyPatchGeo, cream, { position: [0, 0.285, 0.184], rotation: [-0.06, 0, 0] })]
  });
  const bodyPart = makeSubPartRig("body", [0, 0, 0], [bodyPlushLobe, bodyTrimLobe]);

  // Big ultra-smooth baby head (34 radial segments) + chubby lower cheek swells, plump bear-monster plush ears & crown curl.
  const headAnchor: Vec3 = [0, 0.48, 0.02];
  const headProfile = bezierProfilePoints(
    [0, 0.455],
    [
      { cp1: [0.16, 0.455], cp2: [0.295, 0.52], to: [0.285, 0.64] },
      { cp1: [0.278, 0.76], cp2: [0.255, 0.88], to: [0.165, 0.945] },
      { cp1: [0.105, 0.972], cp2: [0.045, 0.98], to: [0, 0.982] }
    ],
    4
  );
  const headShellGeo = sculptOrganicLathe(headProfile, { segments: 34 });
  const cheekSwellGeo = smoothPuffSpec(0.118, 0.095, 0.108, 16, 8);

  const sideEarOuterGeo = smoothPuffSpec(0.082, 0.088, 0.048, 16, 8);
  const sideEarInnerGeo = cabochonCapSpec(0.05, 0.055, 0.024, 16, 3);
  const crownCurlGeo = sculptCurvedLimb(
    [
      [0, 0.95, 0.02],
      [0.015, 0.985, 0.035],
      [0.048, 1.002, 0.025],
      [0.062, 0.986, 0.01]
    ],
    (t) => 0.034 * (1 - 0.55 * t),
    { steps: 6, radialSegments: 8 }
  );
  const crownCurlSubGeo = sculptCurvedLimb(
    [
      [-0.015, 0.955, 0.01],
      [-0.038, 0.988, 0.018],
      [-0.052, 0.978, 0.005]
    ],
    (t) => 0.024 * (1 - 0.5 * t),
    { steps: 5, radialSegments: 7 }
  );
  const buttonNoseGeo = smoothPuffSpec(0.024, 0.018, 0.018, 14, 7);
  const smileUpperArc = sculptCurvedLimb(
    [
      [-0.086, 0.594, 0.26],
      [-0.042, 0.581, 0.284],
      [0, 0.578, 0.292],
      [0.042, 0.581, 0.284],
      [0.086, 0.594, 0.26]
    ],
    0.0085,
    { steps: 8, radialSegments: 7 }
  );
  // Recessed warm-berry mouth cavity + two tiny rounded cream baby front teeth revealed when `jaw` opens.
  const momoMouthCavityGeo = cabochonCapSpec(0.056, 0.02, 0.014, 14, 3);
  const momoBabyToothGeo = cabochonCapSpec(0.013, 0.007, 0.006, 8, 2);

  const eyes = buildCastEyePair({
    eyeX: 0.112,
    eyeY: 0.69,
    eyeZ: 0.262,
    radius: 0.06,
    irisOuterColor: "#3D1F10",
    irisColor: "#7A4424",
    irisCrescentColor: "#C88236",
    lashColor: "#351F2E",
    browColor: "#6B478E",
    socketColor: coatDeep,
    parentPart: "head",
    outwardYaw: 0.15,
    pitch: -0.02
  });

  const headLobe = composeLobe({
    suffix: "plushHead",
    craft: "felt",
    hinge: headAnchor,
    tintTarget: true,
    parts: [
      part(headShellGeo, coat, { position: [0, 0, 0.02], scale: [1.03, 1, 0.93] }),
      part(cheekSwellGeo, coat, { position: [-0.175, 0.605, 0.095] }),
      part(cheekSwellGeo, coat, { position: [0.175, 0.605, 0.095] }),
      part(sideEarOuterGeo, coat, { position: [-0.228, 0.875, 0.015], rotation: [0.08, -0.16, 0.48] }),
      part(sideEarInnerGeo, cream, { position: [-0.232, 0.872, 0.046], rotation: [0.08, -0.16, 0.48] }),
      part(sideEarOuterGeo, coat, { position: [0.228, 0.875, 0.015], rotation: [0.08, 0.16, -0.48] }),
      part(sideEarInnerGeo, cream, { position: [0.232, 0.872, 0.046], rotation: [0.08, 0.16, -0.48] }),
      part(crownCurlGeo, coatSoft),
      part(crownCurlSubGeo, coat),
      part(buttonNoseGeo, blush, { position: [0, 0.632, 0.286] }),
      part(momoMouthCavityGeo, "#6E1F3E", { position: [0, 0.558, 0.275] }),
      part(momoBabyToothGeo, "#FFFDF8", { position: [-0.014, 0.571, 0.285] }),
      part(momoBabyToothGeo, "#FFFDF8", { position: [0.014, 0.571, 0.285] }),
      part(smileUpperArc, "#6D467E"),
      ...eyes.headAccentParts
    ]
  });
  const headPart = makeSubPartRig("head", headAnchor, [headLobe], "body");

  // Articulated lower plush lip/chin cushion + rosy tongue: closes flush at rest and parts cleanly when speaking/brushing.
  const jawAnchor: Vec3 = [0, 0.572, 0.248];
  const jawChinPuffGeo = cabochonCapSpec(0.068, 0.024, 0.022, 16, 3);
  const jawLowerLipArc = sculptCurvedLimb(
    [
      [-0.072, 0.584, 0.264],
      [-0.036, 0.574, 0.288],
      [0, 0.571, 0.295],
      [0.036, 0.574, 0.288],
      [0.072, 0.584, 0.264]
    ],
    0.007,
    { steps: 6, radialSegments: 6 }
  );
  const tongueGeo = cabochonCapSpec(0.035, 0.012, 0.014, 12, 2);
  const jawLobe = composeLobe({
    suffix: "smileJaw",
    craft: "clay",
    hinge: jawAnchor,
    parts: [
      part(jawChinPuffGeo, coat, { position: [0, 0.556, 0.274] }),
      part(jawLowerLipArc, "#6D467E"),
      part(tongueGeo, "#F68BA6", { position: [0, 0.568, 0.282] })
    ]
  });
  const jawPart = makeSubPartRig("jaw", jawAnchor, [jawLobe], "head");

  // Rosy cheek blushes (smooth plush ovals).
  const cheekAnchor: Vec3 = [0, 0.625, 0.24];
  const cheekOvalGeo = cabochonCapSpec(0.044, 0.028, 0.016, 18, 3);
  const cheekLobe = composeLobe({
    suffix: "cheekBlush",
    craft: "felt",
    hinge: cheekAnchor,
    parts: [
      part(cheekOvalGeo, blush, { position: [-0.184, 0.624, 0.222], rotation: [0, -0.45, 0.08] }),
      part(cheekOvalGeo, blush, { position: [0.184, 0.624, 0.222], rotation: [0, 0.45, -0.08] })
    ]
  });
  const cheekPart = makeSubPartRig("cheekPuff", cheekAnchor, [cheekLobe], "head");

  // Plump curved toddler arms with thumb + 3 mitten finger puffs (embedded into shoulders).
  const buildMomoArm = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.215, 0.455, 0.02];
    const armSweep = sculptCurvedLimb(
      [
        [sign * 0.18, 0.465, 0.015],
        [sign * 0.258, 0.405, 0.03],
        [sign * 0.296, 0.32, 0.052],
        [sign * 0.292, 0.245, 0.068]
      ],
      (t) => 0.052 * (0.94 + 0.14 * Math.sin(t * Math.PI)),
      { steps: 6, radialSegments: 7 }
    );
    const thumbGeo = smoothPuffSpec(0.019, 0.025, 0.019, 6, 3);
    const fingerGeo = smoothPuffSpec(0.016, 0.024, 0.017, 6, 3);
    const palmPadGeo = smoothPuffSpec(0.026, 0.024, 0.012, 6, 3);
    const armLobe = composeLobe({
      suffix: "plushArm",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(armSweep, coat),
        part(thumbGeo, coatSoft, {
          position: [sign * 0.262, 0.252, 0.092],
          rotation: [-0.35, 0, -sign * 0.45]
        }),
        part(fingerGeo, coatSoft, { position: [sign * 0.282, 0.222, 0.082] }),
        part(fingerGeo, coatSoft, { position: [sign * 0.298, 0.218, 0.068] }),
        part(fingerGeo, coatSoft, { position: [sign * 0.308, 0.224, 0.052] }),
        part(palmPadGeo, cream, { position: [sign * 0.278, 0.242, 0.062], rotation: [0, sign * 0.3, 0] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "armL" : "armR", anchor, [armLobe], "body");
  };

  // Stubby baby ankles + plump 3-toed feet with cream toe beans resting at y = 0.
  const buildMomoFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.135, 0.11, 0.015];
    const ankleGeo = sculptCurvedLimb(
      [
        [sign * 0.132, 0.145, 0.01],
        [sign * 0.136, 0.085, 0.018],
        [sign * 0.14, 0.038, 0.032]
      ],
      (t) => 0.058 - 0.006 * t,
      { steps: 5, radialSegments: 6 }
    );
    const footPadGeo = smoothPuffSpec(0.072, 0.038, 0.094, 9, 4);
    const toeBeanGeo = smoothPuffSpec(0.022, 0.018, 0.024, 6, 3);
    const footLobe = composeLobe({
      suffix: "plushFoot",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(ankleGeo, coat),
        part(footPadGeo, coatDeep, { position: [sign * 0.142, 0.038, 0.048] }),
        part(toeBeanGeo, cream, { position: [sign * 0.106, 0.024, 0.128] }),
        part(toeBeanGeo, cream, { position: [sign * 0.144, 0.024, 0.138] }),
        part(toeBeanGeo, cream, { position: [sign * 0.182, 0.024, 0.126] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [footLobe]);
  };

  return finalizeProceduralRig("momo", [
    bodyPart,
    headPart,
    buildMomoArm(-1),
    buildMomoArm(1),
    buildMomoFoot(-1),
    buildMomoFoot(1),
    eyes.eyelidL,
    eyes.eyelidR,
    jawPart,
    cheekPart
  ]);
}

// ================================================================ 2. LULU (h = 1.00m)

function buildLuluRig(): ProceduralAssetRig {
  const mint = "#82E0B5";
  const mintSoft = "#9BEAC6";
  const mintDeep = "#5AC294";
  const cream = "#F5FFF9";
  const coral = "#F4978E";

  // Plump pear-shaped baby dinosaur torso with clean smooth cream oval tummy patch + back plates.
  const dinoTorsoProfile = bezierProfilePoints(
    [0, 0.11],
    [
      { cp1: [0.15, 0.11], cp2: [0.235, 0.17], to: [0.228, 0.28] },
      { cp1: [0.22, 0.39], cp2: [0.18, 0.48], to: [0.142, 0.55] },
      { cp1: [0.125, 0.58], cp2: [0.11, 0.6], to: [0, 0.61] }
    ],
    3
  );
  const dinoTorsoGeo = sculptOrganicLathe(dinoTorsoProfile, { segments: 28 });

  const cleanTummyGeo = cabochonCapSpec(0.142, 0.178, 0.044, 26, 3);
  const dorsalPlateGeo = smoothPuffSpec(0.022, 0.046, 0.052, 7, 4, 0.32);
  const thighSocketGeo = smoothPuffSpec(0.095, 0.088, 0.092, 7, 4);

  const bodyLobe = composeLobe({
    suffix: "dinoTorso",
    craft: "clay",
    tintTarget: true,
    parts: [
      part(dinoTorsoGeo, mint, { scale: [1.04, 1, 0.96] }),
      part(cleanTummyGeo, cream, { position: [0, 0.315, 0.178], rotation: [-0.07, 0, 0] }),
      part(thighSocketGeo, mint, { position: [-0.145, 0.175, 0.015] }),
      part(thighSocketGeo, mint, { position: [0.145, 0.175, 0.015] }),
      part(dorsalPlateGeo, mintDeep, { position: [0, 0.49, -0.165], rotation: [-0.36, 0, 0] }),
      part(dorsalPlateGeo, coral, { position: [0, 0.4, -0.198], rotation: [-0.22, 0, 0] }),
      part(dorsalPlateGeo, mintDeep, { position: [0, 0.305, -0.215], rotation: [-0.08, 0, 0] })
    ]
  });
  const bodyPart = makeSubPartRig("body", [0, 0, 0], [bodyLobe]);

  // Friendly baby-dino head (34 radial segments) + wide chubby rounded baby muzzle + soft eye-patch masks + rounded crown fin!
  const headAnchor: Vec3 = [0, 0.545, 0.025];
  const craniumProfile = bezierProfilePoints(
    [0, 0.515],
    [
      { cp1: [0.14, 0.515], cp2: [0.24, 0.57], to: [0.232, 0.68] },
      { cp1: [0.226, 0.78], cp2: [0.195, 0.86], to: [0.12, 0.895] },
      { cp1: [0.07, 0.912], cp2: [0.03, 0.918], to: [0, 0.92] }
    ],
    4
  );
  const craniumGeo = sculptOrganicLathe(craniumProfile, { segments: 32 });
  const dinoCheekSwellGeo = smoothPuffSpec(0.105, 0.084, 0.094, 16, 8);

  // Chubby wide baby-dinosaur muzzle cushion + recessed berry mouth + cute baby-dino front teeth.
  const dinoMuzzleGeo = smoothPuffSpec(0.132, 0.062, 0.094, 22, 10);
  const nostrilGeo = cabochonCapSpec(0.012, 0.01, 0.01, 10, 2);
  const dinoSmileArc = sculptCurvedLimb(
    [
      [-0.084, 0.608, 0.278],
      [-0.042, 0.594, 0.298],
      [0, 0.59, 0.305],
      [0.042, 0.594, 0.298],
      [0.084, 0.608, 0.278]
    ],
    0.0075,
    { steps: 7, radialSegments: 6 }
  );
  const dinoMouthCavityGeo = cabochonCapSpec(0.062, 0.025, 0.018, 16, 3);
  const dinoToothGeo = smoothPuffSpec(0.014, 0.011, 0.008, 8, 4, 0.25);

  // Cute side cheek/ear nubs + rounded dorsal crown plates (clean mint eye sockets without oversized white halo!).
  const sideEarNubGeo = smoothPuffSpec(0.038, 0.054, 0.044, 12, 6);
  const sideScaleDotGeo = cabochonCapSpec(0.016, 0.014, 0.01, 10, 2);
  const topCrownPlateGeo = smoothPuffSpec(0.032, 0.064, 0.068, 14, 7, 0.22);
  const backCrownScallopGeo = smoothPuffSpec(0.024, 0.048, 0.052, 12, 6, 0.24);

  const eyes = buildCastEyePair({
    eyeX: 0.108,
    eyeY: 0.722,
    eyeZ: 0.228,
    radius: 0.054,
    irisOuterColor: "#143D2D",
    irisColor: "#216E51",
    irisCrescentColor: "#46B88A",
    lashColor: "#1B332A",
    browColor: "#3D8F6E",
    socketColor: mintDeep,
    parentPart: "head",
    outwardYaw: 0.18,
    pitch: -0.02,
    browLift: 1.44
  });

  const headLobe = composeLobe({
    suffix: "dinoHead",
    craft: "clay",
    hinge: headAnchor,
    tintTarget: true,
    parts: [
      part(craniumGeo, mint, { position: [0, 0, 0.025], scale: [1.05, 1, 0.96] }),
      part(dinoCheekSwellGeo, mint, { position: [-0.155, 0.645, 0.09] }),
      part(dinoCheekSwellGeo, mint, { position: [0.155, 0.645, 0.09] }),
      part(dinoMuzzleGeo, mintSoft, { position: [0, 0.638, 0.215], rotation: [0.04, 0, 0] }),
      part(nostrilGeo, "#2E7A5C", { position: [-0.046, 0.654, 0.298] }),
      part(nostrilGeo, "#2E7A5C", { position: [0.046, 0.654, 0.298] }),
      part(dinoSmileArc, "#2E7A5C"),
      part(dinoMouthCavityGeo, "#6E1F3E", { position: [0, 0.576, 0.285] }),
      part(dinoToothGeo, "#FFFDF8", { position: [-0.02, 0.585, 0.296] }),
      part(dinoToothGeo, "#FFFDF8", { position: [0.02, 0.585, 0.296] }),
      part(sideScaleDotGeo, mintSoft, { position: [-0.195, 0.725, 0.135], rotation: [0, -0.75, 0] }),
      part(sideScaleDotGeo, mintSoft, { position: [0.195, 0.725, 0.135], rotation: [0, 0.75, 0] }),
      part(sideEarNubGeo, mintDeep, { position: [-0.238, 0.675, 0.03] }),
      part(sideEarNubGeo, mintDeep, { position: [0.238, 0.675, 0.03] }),
      part(topCrownPlateGeo, mintDeep, { position: [0, 0.935, 0.02], rotation: [-0.08, 0, 0] }),
      part(backCrownScallopGeo, coral, { position: [0, 0.855, -0.115], rotation: [-0.45, 0, 0] }),
      part(backCrownScallopGeo, mintDeep, { position: [0, 0.745, -0.185], rotation: [-0.55, 0, 0] }),
      ...eyes.headAccentParts
    ]
  });
  const headPart = makeSubPartRig("head", headAnchor, [headLobe], "body");

  // Surface-proud lower dino jaw flush with muzzle front (`clay` craft) so speech opens cleanly.
  const jawAnchor: Vec3 = [0, 0.586, 0.245];
  const lowerJawGeo = smoothPuffSpec(0.094, 0.032, 0.072, 14, 7);
  const dinoLowerLipArc = sculptCurvedLimb(
    [
      [-0.078, 0.602, 0.278],
      [-0.04, 0.588, 0.3],
      [0, 0.584, 0.308],
      [0.04, 0.588, 0.3],
      [0.078, 0.602, 0.278]
    ],
    0.007,
    { steps: 7, radialSegments: 6 }
  );
  const dinoTongueGeo = smoothPuffSpec(0.046, 0.013, 0.042, 10, 5);
  const jawLobe = composeLobe({
    suffix: "dinoJaw",
    craft: "clay",
    hinge: jawAnchor,
    parts: [
      part(lowerJawGeo, cream, { position: [0, 0.57, 0.24] }),
      part(dinoLowerLipArc, "#2E7A5C"),
      part(dinoTongueGeo, "#F48792", { position: [0, 0.579, 0.264] })
    ]
  });
  const jawPart = makeSubPartRig("jaw", jawAnchor, [jawLobe], "head");

  // Rosy peach cheek puffs.
  const cheekAnchor: Vec3 = [0, 0.648, 0.205];
  const luluCheekGeo = cabochonCapSpec(0.038, 0.025, 0.016, 10, 2);
  const cheekLobe = composeLobe({
    suffix: "dinoCheeks",
    craft: "felt",
    hinge: cheekAnchor,
    parts: [
      part(luluCheekGeo, "#F7A69C", { position: [-0.172, 0.648, 0.188], rotation: [0, -0.48, 0] }),
      part(luluCheekGeo, "#F7A69C", { position: [0.172, 0.648, 0.188], rotation: [0, 0.48, 0] })
    ]
  });
  const cheekPart = makeSubPartRig("cheekPuff", cheekAnchor, [cheekLobe], "head");

  // Cozy relaxed baby-dino arms with thumb + 3 dino fingers (warm toddler curve, not stiff A-pose).
  const buildLuluArm = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.19, 0.47, 0.03];
    const armGeo = sculptCurvedLimb(
      [
        [sign * 0.165, 0.47, 0.025],
        [sign * 0.242, 0.405, 0.045],
        [sign * 0.278, 0.325, 0.072],
        [sign * 0.275, 0.265, 0.09]
      ],
      (t) => 0.048 * (0.96 - 0.1 * t),
      { steps: 6, radialSegments: 7 }
    );
    const dinoFingerGeo = smoothPuffSpec(0.015, 0.022, 0.015, 6, 3, 0.2);
    const armLobe = composeLobe({
      suffix: "dinoArm",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(armGeo, mint),
        part(dinoFingerGeo, mintSoft, {
          position: [sign * 0.252, 0.268, 0.112],
          rotation: [-0.4, 0, -sign * 0.4]
        }),
        part(dinoFingerGeo, mintSoft, { position: [sign * 0.27, 0.242, 0.102] }),
        part(dinoFingerGeo, mintSoft, { position: [sign * 0.286, 0.24, 0.088] }),
        part(dinoFingerGeo, mintSoft, { position: [sign * 0.292, 0.248, 0.072] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "armL" : "armR", anchor, [armLobe], "body");
  };

  // Sturdy dino legs + 3 rounded cream dino claws at y = 0.
  const buildLuluFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.15, 0.155, 0.015];
    const legSweepGeo = sculptCurvedLimb(
      [
        [sign * 0.145, 0.195, 0.01],
        [sign * 0.162, 0.115, 0.032],
        [sign * 0.155, 0.042, 0.025]
      ],
      (t) => 0.068 - 0.014 * t,
      { steps: 5, radialSegments: 7 }
    );
    const footSoleGeo = smoothPuffSpec(0.076, 0.038, 0.098, 9, 4);
    const clawGeo = smoothPuffSpec(0.018, 0.02, 0.028, 6, 3, 0.35);
    const footLobe = composeLobe({
      suffix: "dinoFoot",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(legSweepGeo, mint),
        part(footSoleGeo, mintDeep, { position: [sign * 0.156, 0.038, 0.05] }),
        part(clawGeo, cream, { position: [sign * 0.116, 0.02, 0.138], rotation: [0.1, -sign * 0.18, 0] }),
        part(clawGeo, cream, { position: [sign * 0.156, 0.02, 0.148], rotation: [0.1, 0, 0] }),
        part(clawGeo, cream, { position: [sign * 0.196, 0.02, 0.136], rotation: [0.1, sign * 0.18, 0] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [footLobe]);
  };

  // Upturned S-curved baby dino tail with coral & mint dorsal scallops.
  const tailAnchor: Vec3 = [0, 0.205, -0.15];
  const tailSweepGeo = sculptCurvedLimb(
    [
      [0, 0.215, -0.105],
      [0, 0.185, -0.235],
      [0, 0.225, -0.355],
      [0, 0.315, -0.445]
    ],
    (t) => 0.092 * Math.pow(1 - 0.72 * t, 0.85),
    { steps: 7, radialSegments: 7 }
  );
  const tailScallopGeo = smoothPuffSpec(0.018, 0.034, 0.038, 6, 3, 0.3);
  const tailLobe = composeLobe({
    suffix: "dinoTail",
    craft: "clay",
    hinge: tailAnchor,
    parts: [
      part(tailSweepGeo, mint),
      part(tailScallopGeo, coral, { position: [0, 0.248, -0.245], rotation: [0.22, 0, 0] }),
      part(tailScallopGeo, mintDeep, { position: [0, 0.278, -0.335], rotation: [0.52, 0, 0] }),
      part(tailScallopGeo, coral, { position: [0, 0.338, -0.405], rotation: [0.78, 0, 0] })
    ]
  });
  const tailPart = makeSubPartRig("tail", tailAnchor, [tailLobe], "body");

  return finalizeProceduralRig("lulu", [
    bodyPart,
    headPart,
    buildLuluArm(-1),
    buildLuluArm(1),
    buildLuluFoot(-1),
    buildLuluFoot(1),
    tailPart,
    eyes.eyelidL,
    eyes.eyelidR,
    jawPart,
    cheekPart
  ]);
}

// ================================================================ 3. SHERU (h = 0.70m)

function buildSheruRig(): ProceduralAssetRig {
  const biscuit = "#F0DCB4";
  const cream = "#FFF8EA";
  const caramel = "#D4AE76";
  const collarRed = "#E45B4B";
  const tagGold = "#F5CA48";

  // Chest-up Labrador puppy torso seamlessly connecting rump, chest, legs, and neck (zero gaps!).
  const bodyAnchor: Vec3 = [0, 0.28, -0.02];
  const puppySpineGeo = sculptCurvedLimb(
    [
      [0, 0.29, -0.29],
      [0, 0.31, -0.12],
      [0, 0.355, 0.08],
      [0, 0.445, 0.175],
      [0, 0.545, 0.195]
    ],
    (t) => {
      const chestSwell = 0.195 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.72 + 0.35);
      const neckTaper = t > 0.7 ? (t - 0.7) * 0.16 : 0;
      return Math.max(0.105, chestSwell - neckTaper);
    },
    { steps: 9, radialSegments: 11, profileScaleX: 0.96, profileScaleY: 1.04 }
  );

  const chestRuffGeo = smoothPuffSpec(0.145, 0.135, 0.095, 8, 4, 0.2);
  const saddlePatchGeo = smoothPuffSpec(0.165, 0.095, 0.185, 8, 4);
  const collarRingGeo = torusSpec(0.126, 0.024, 12, 5);
  const collarTagGeo = cylinderSpec(0.038, 0.038, 0.014, 10, 0);
  const tagLoopGeo = torusSpec(0.016, 0.006, 8, 4);

  const bodyLobe = composeLobe({
    suffix: "puppyBody",
    craft: "felt",
    hinge: bodyAnchor,
    tintTarget: true,
    parts: [
      part(puppySpineGeo, biscuit),
      part(chestRuffGeo, cream, { position: [0, 0.375, 0.185], rotation: [0.22, 0, 0] }),
      part(saddlePatchGeo, caramel, { position: [0, 0.395, -0.11], rotation: [0.18, 0, 0] }),
      part(collarRingGeo, collarRed, { position: [0, 0.485, 0.192], rotation: [1.22, 0, 0] }),
      part(tagLoopGeo, tagGold, { position: [0, 0.455, 0.308], rotation: [0, Math.PI * 0.5, 0] }),
      part(collarTagGeo, tagGold, { position: [0, 0.418, 0.316], rotation: [Math.PI * 0.5 - 0.15, 0, 0] })
    ]
  });
  const bodyPart = makeSubPartRig("body", bodyAnchor, [bodyLobe]);

  // Expressive rounded puppy head (26 radial segments) + fluffy 3-lock crown tuft + plump cream muzzle + glossy nose!
  const headAnchor: Vec3 = [0, 0.515, 0.195];
  const headProfile = bezierProfilePoints(
    [0, 0.49],
    [
      { cp1: [0.135, 0.49], cp2: [0.225, 0.555], to: [0.215, 0.675] },
      { cp1: [0.208, 0.79], cp2: [0.18, 0.875], to: [0.105, 0.91] },
      { cp1: [0.055, 0.926], cp2: [0.025, 0.93], to: [0, 0.932] }
    ],
    3
  );
  const puppyHeadGeo = sculptOrganicLathe(headProfile, { segments: 26 });
  const puppyCheekSwellGeo = smoothPuffSpec(0.095, 0.078, 0.088, 8, 4);

  // 3-lock fluffy puppy fur tuft sweeping playfully across the crown to y = 1.00 (matches sheru.webp!).
  const tuftCenterGeo = sculptCurvedLimb(
    [
      [-0.015, 0.9, 0.205],
      [0.012, 0.965, 0.215],
      [0.055, 1.002, 0.205]
    ],
    (t) => 0.036 * (1 - 0.62 * t),
    { steps: 5, radialSegments: 5 }
  );
  const tuftLeftGeo = sculptCurvedLimb(
    [
      [-0.045, 0.895, 0.195],
      [-0.03, 0.955, 0.205],
      [0.008, 0.985, 0.198]
    ],
    (t) => 0.028 * (1 - 0.6 * t),
    { steps: 5, radialSegments: 5 }
  );
  const tuftRightGeo = sculptCurvedLimb(
    [
      [0.025, 0.895, 0.195],
      [0.062, 0.945, 0.205],
      [0.098, 0.962, 0.192]
    ],
    (t) => 0.026 * (1 - 0.6 * t),
    { steps: 5, radialSegments: 5 }
  );

  // Plump double-whisker-pad cream muzzle + berry mouth cavity + snout bridge + glossy chocolate nose!
  const snoutBridgeGeo = smoothPuffSpec(0.088, 0.066, 0.095, 8, 4);
  const whiskerPadGeo = smoothPuffSpec(0.068, 0.048, 0.065, 8, 4);
  const puppyUpperLipArc = sculptCurvedLimb(
    [
      [-0.064, 0.6, 0.425],
      [0, 0.612, 0.454],
      [0.064, 0.6, 0.425]
    ],
    0.007,
    { steps: 6, radialSegments: 6 }
  );
  const puppyMouthCavityGeo = smoothPuffSpec(0.052, 0.022, 0.042, 12, 6);
  const noseGeo = smoothPuffSpec(0.038, 0.028, 0.028, 8, 4, 0.18);
  const noseShineGeo = cabochonCapSpec(0.011, 0.007, 0.008, 6, 1);

  const eyes = buildCastEyePair({
    eyeX: 0.098,
    eyeY: 0.71,
    eyeZ: 0.384,
    radius: 0.054,
    irisOuterColor: "#331B0E",
    irisColor: "#6B3D1E",
    irisCrescentColor: "#B37038",
    lashColor: "#2B1810",
    browColor: "#5C3A22",
    socketColor: caramel,
    parentPart: "head",
    outwardYaw: 0.18,
    pitch: -0.02,
    browLift: 1.48
  });

  const headLobe = composeLobe({
    suffix: "puppyHead",
    craft: "felt",
    hinge: headAnchor,
    tintTarget: true,
    parts: [
      part(puppyHeadGeo, biscuit, { position: [0, 0, 0.2], scale: [1.05, 1, 0.96] }),
      part(puppyCheekSwellGeo, biscuit, { position: [-0.148, 0.625, 0.265] }),
      part(puppyCheekSwellGeo, biscuit, { position: [0.148, 0.625, 0.265] }),
      part(tuftCenterGeo, cream),
      part(tuftLeftGeo, cream),
      part(tuftRightGeo, biscuit),
      part(snoutBridgeGeo, cream, { position: [0, 0.638, 0.365], rotation: [0.1, 0, 0] }),
      part(whiskerPadGeo, cream, { position: [-0.052, 0.624, 0.395] }),
      part(whiskerPadGeo, cream, { position: [0.052, 0.624, 0.395] }),
      part(puppyUpperLipArc, "#4A2B1D"),
      part(puppyMouthCavityGeo, "#6E2038", { position: [0, 0.588, 0.408] }),
      part(noseGeo, "#261612", { position: [0, 0.654, 0.456], rotation: [0.14, 0, 0] }),
      part(noseShineGeo, "#FFFFFF", { position: [-0.012, 0.666, 0.478] }),
      ...eyes.headAccentParts
    ]
  });
  const headPart = makeSubPartRig("head", headAnchor, [headLobe], "body");

  // Surface-proud lower puppy jaw + cocoa lip rim + soft pink tongue (`ceramic` craft).
  const jawAnchor: Vec3 = [0, 0.592, 0.355];
  const puppyJawGeo = smoothPuffSpec(0.068, 0.03, 0.086, 12, 6);
  const puppyLowerLipArc = sculptCurvedLimb(
    [
      [-0.058, 0.596, 0.422],
      [0, 0.588, 0.456],
      [0.058, 0.596, 0.422]
    ],
    0.0065,
    { steps: 6, radialSegments: 6 }
  );
  const puppyTongueGeo = sculptCurvedLimb(
    [
      [0, 0.588, 0.375],
      [0, 0.584, 0.415],
      [0, 0.578, 0.448]
    ],
    (t) => 0.034 * (1 - 0.22 * t),
    { steps: 5, radialSegments: 6, profileScaleX: 1.15, profileScaleY: 0.38 }
  );
  const jawLobe = composeLobe({
    suffix: "puppyJaw",
    craft: "ceramic",
    hinge: jawAnchor,
    parts: [
      part(puppyJawGeo, cream, { position: [0, 0.576, 0.374] }),
      part(puppyLowerLipArc, "#4A2B1D"),
      part(puppyTongueGeo, "#F48B9A")
    ]
  });
  const jawPart = makeSubPartRig("jaw", jawAnchor, [jawLobe], "head");

  // Wide, velvety-smooth rounded teardrop Labrador puppy ears (`felt` craft — zero polygon kinks!).
  const buildPuppyEar = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.185, 0.785, 0.195];
    const earFlapGeo = sculptCurvedLimb(
      [
        [sign * 0.16, 0.79, 0.195],
        [sign * 0.238, 0.76, 0.202],
        [sign * 0.282, 0.675, 0.212],
        [sign * 0.272, 0.592, 0.22]
      ],
      (t) => 0.058 + 0.038 * Math.sin(t * Math.PI),
      { steps: 8, radialSegments: 9, profileScaleX: 0.44, profileScaleY: 1.12, capFraction: 0.24 }
    );
    const innerEarGeo = smoothPuffSpec(0.02, 0.068, 0.044, 10, 5);
    const earLobe = composeLobe({
      suffix: "floppyEar",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(earFlapGeo, caramel),
        part(innerEarGeo, "#F2CFC0", {
          position: [sign * 0.255, 0.665, 0.214],
          rotation: [0, 0, -sign * 0.14]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "earL" : "earR", anchor, [earLobe], "head");
  };

  // 4 sculpted puppy legs (embedded deeply into chest/rump) with plump 4-toed cream paws at y = 0.
  const buildPuppyLeg = (
    partId: "legFL" | "legFR" | "legBL" | "legBR",
    sign: -1 | 1,
    isFront: boolean
  ): BuiltSubPart => {
    const zBase = isFront ? 0.155 : -0.205;
    const xBase = sign * (isFront ? 0.122 : 0.152);
    const anchor: Vec3 = [xBase, 0.305, zBase];
    const spine: readonly ProceduralVec3[] = isFront
      ? [
          [xBase * 0.92, 0.355, zBase - 0.01],
          [xBase, 0.205, zBase + 0.015],
          [xBase, 0.045, zBase + 0.032]
        ]
      : [
          [xBase * 0.88, 0.345, zBase + 0.02],
          [xBase * 1.06, 0.195, zBase - 0.02],
          [xBase * 1.02, 0.045, zBase + 0.025]
        ];
    const legGeo = sculptCurvedLimb(
      spine,
      (t) => (isFront ? 0.064 : 0.078) * (1 - 0.24 * t),
      { steps: 5, radialSegments: 7 }
    );
    const pawMainGeo = smoothPuffSpec(0.064, 0.038, 0.076, 7, 4);
    const pawToeGeo = smoothPuffSpec(0.016, 0.018, 0.022, 6, 3);
    const zPaw = zBase + 0.048;
    const xPaw = isFront ? xBase : xBase * 1.02;
    const legLobe = composeLobe({
      suffix: "puppyLeg",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(legGeo, biscuit),
        part(pawMainGeo, cream, { position: [xPaw, 0.036, zPaw] }),
        part(pawToeGeo, cream, { position: [xPaw - 0.038, 0.02, zPaw + 0.064] }),
        part(pawToeGeo, cream, { position: [xPaw - 0.013, 0.02, zPaw + 0.074] }),
        part(pawToeGeo, cream, { position: [xPaw + 0.013, 0.02, zPaw + 0.074] }),
        part(pawToeGeo, cream, { position: [xPaw + 0.038, 0.02, zPaw + 0.064] })
      ]
    });
    return makeSubPartRig(partId, anchor, [legLobe]);
  };

  // Cheerful upturned wagging puppy tail (`clay` craft).
  const tailAnchor: Vec3 = [0, 0.365, -0.295];
  const wagTailGeo = sculptCurvedLimb(
    [
      [0, 0.355, -0.255],
      [0, 0.415, -0.375],
      [0, 0.515, -0.455],
      [0, 0.595, -0.475]
    ],
    (t) => 0.048 * (0.95 + 0.18 * Math.sin(t * Math.PI) - 0.35 * t),
    { steps: 6, radialSegments: 6 }
  );
  const tailTipGeo = smoothPuffSpec(0.032, 0.042, 0.032, 6, 3, 0.3);
  const tailLobe = composeLobe({
    suffix: "wagTail",
    craft: "clay",
    hinge: tailAnchor,
    parts: [
      part(wagTailGeo, caramel),
      part(tailTipGeo, cream, { position: [0, 0.608, -0.478], rotation: [-0.25, 0, 0] })
    ]
  });
  const tailPart = makeSubPartRig("tail", tailAnchor, [tailLobe], "body");

  return finalizeProceduralRig("sheru", [
    bodyPart,
    headPart,
    buildPuppyEar(-1),
    buildPuppyEar(1),
    tailPart,
    buildPuppyLeg("legFL", -1, true),
    buildPuppyLeg("legFR", 1, true),
    buildPuppyLeg("legBL", -1, false),
    buildPuppyLeg("legBR", 1, false),
    eyes.eyelidL,
    eyes.eyelidR,
    jawPart
  ]);
}

// ================================================================ 4. GOGO (h = 0.90m, faces +Z!)

function buildGogoRig(): ProceduralAssetRig {
  const cherry = "#E83E35";
  const cherryDeep = "#C42B23";
  const brass = "#F4C844";
  const iron = "#252833";
  const steel = "#DCE2EC";
  const creamFace = "#FFF8EE";
  const windowTint = "#BBE0FA";

  // 28-segment perfectly round cylindrical boiler along Z + 28-segment smooth circular brass smokebox bezel!
  const boilerGeo = cylinderSpec(0.235, 0.235, 0.68, 28, 0);
  const boilerBandGeo = cylinderSpec(0.243, 0.243, 0.022, 20, 0);
  const smokeboxRimGeo = torusSpec(0.226, 0.024, 28, 7);
  const facePlateGeo = cabochonCapSpec(0.214, 0.214, 0.022, 24, 2);

  // Brass steam dome + safety whistle on boiler top.
  const domeProfile = bezierProfilePoints(
    [0, 0],
    [
      { cp1: [0.095, 0], cp2: [0.092, 0.05], to: [0.078, 0.11] },
      { cp1: [0.066, 0.155], cp2: [0.036, 0.175], to: [0, 0.178] }
    ],
    2
  );
  const steamDomeGeo = sculptOrganicLathe(domeProfile, { segments: 14 });
  const whistleGeo = cylinderSpec(0.018, 0.022, 0.075, 8, 0);

  // Running boards, chassis skirt, front buffer beam, twin brass buffers & cowcatcher pilot bars (+Z).
  const runningBoardGeo = beveledSlabSpec(0.68, 0.062, 1.08, 0.016);
  const chassisBlockGeo = beveledSlabSpec(0.46, 0.15, 0.92, 0.018);
  const bufferBeamGeo = beveledSlabSpec(0.68, 0.155, 0.11, 0.018);
  const centralBufferHeadGeo = cylinderSpec(0.046, 0.046, 0.026, 10, 0);
  const centralBufferStemGeo = cylinderSpec(0.024, 0.028, 0.044, 8, 0);
  const pilotBarGeo = cylinderSpec(0.014, 0.016, 0.155, 6, 0);
  const lampHousingGeo = cylinderSpec(0.038, 0.042, 0.056, 10, 0);
  const lampLensGeo = cabochonCapSpec(0.032, 0.032, 0.016, 8, 1);

  // Arched engineer cab at -Z (`z: -0.54 .. -0.14`) with overhanging curved roof reaching y = 1.00!
  const cabFrontWallGeo = beveledSlabSpec(0.64, 0.46, 0.055, 0.012);
  const cabRearBunkerGeo = beveledSlabSpec(0.64, 0.34, 0.14, 0.015);
  const cabPillarGeo = cylinderSpec(0.026, 0.028, 0.42, 7, 0);
  const cabWindowPaneGeo = cylinderSpec(0.074, 0.074, 0.016, 10, 0);
  const cabWindowRimGeo = torusSpec(0.076, 0.012, 10, 4);
  const coalPuffGeo = smoothPuffSpec(0.065, 0.042, 0.052, 6, 3);

  // Arched cab roof extruded in XY and spanning Z (`-0.55 .. -0.08`).
  const roofArchContour: readonly ProceduralVec2[] = [
    [-0.365, 0.885],
    [-0.25, 0.962],
    [0, 1.0],
    [0.25, 0.962],
    [0.365, 0.885],
    [0.305, 0.865],
    [0, 0.938],
    [-0.305, 0.865]
  ];
  const cabRoofGeo = extrudeContourSpec({
    outer: roofArchContour,
    depth: 0.47,
    bevelThickness: 0.012,
    bevelSize: 0.009,
    bevelSegments: 1
  });

  const buttonNoseGeo = smoothPuffSpec(0.038, 0.036, 0.032, 8, 4);
  const cheekRivetGeo = cabochonCapSpec(0.03, 0.022, 0.014, 8, 1);

  const eyes = buildCastEyePair({
    eyeX: 0.098,
    eyeY: 0.535,
    eyeZ: 0.526,
    radius: 0.056,
    irisOuterColor: "#1B2A44",
    irisColor: "#2D5B94",
    irisCrescentColor: "#63A3E8",
    lashColor: "#1D202B",
    browColor: "#232633",
    socketColor: steel,
    parentPart: "body",
    outwardYaw: 0.08,
    pitch: -0.01,
    browLift: 1.42
  });

  const bodyParts: LobePartInput[] = [
    // Boiler & brass rings
    part(boilerGeo, cherry, { position: [0, 0.495, 0.16], rotation: [Math.PI * 0.5, 0, 0] }),
    part(boilerBandGeo, brass, { position: [0, 0.495, 0.36], rotation: [Math.PI * 0.5, 0, 0] }),
    part(boilerBandGeo, brass, { position: [0, 0.495, 0.16], rotation: [Math.PI * 0.5, 0, 0] }),
    part(boilerBandGeo, brass, { position: [0, 0.495, -0.04], rotation: [Math.PI * 0.5, 0, 0] }),
    part(steamDomeGeo, brass, { position: [0, 0.71, 0.06] }),
    part(whistleGeo, brass, { position: [0.095, 0.755, -0.06] }),

    // Friendly +Z smokebox porcelain face + upper smile lip + recessed berry mouth & teeth
    part(smokeboxRimGeo, brass, { position: [0, 0.495, 0.5] }),
    part(facePlateGeo, creamFace, { position: [0, 0.495, 0.506] }),
    part(buttonNoseGeo, "#F2DAC0", { position: [0, 0.482, 0.534] }),
    part(cheekRivetGeo, "#FFACA3", { position: [-0.148, 0.456, 0.522] }),
    part(cheekRivetGeo, "#FFACA3", { position: [0.148, 0.456, 0.522] }),
    part(
      sculptCurvedLimb(
        [
          [-0.088, 0.438, 0.525],
          [-0.044, 0.426, 0.533],
          [0, 0.422, 0.536],
          [0.044, 0.426, 0.533],
          [0.088, 0.438, 0.525]
        ],
        0.008,
        { steps: 8, radialSegments: 7 }
      ),
      "#6E3B2E"
    ),
    part(cabochonCapSpec(0.066, 0.028, 0.012, 16, 3), "#681E32", { position: [0, 0.415, 0.522] }),
    part(cabochonCapSpec(0.042, 0.009, 0.008, 12, 2), "#FFFDF8", { position: [0, 0.425, 0.527] }),
    part(cabochonCapSpec(0.044, 0.014, 0.011, 12, 2), "#F28588", { position: [0, 0.404, 0.525] }),
    ...eyes.headAccentParts,

    // Running boards, front buffer beam, twin brass-faced railway buffers & headlamps
    part(runningBoardGeo, cherry, { position: [0, 0.255, 0] }),
    part(chassisBlockGeo, iron, { position: [0, 0.175, -0.01] }),
    part(bufferBeamGeo, cherry, { position: [0, 0.205, 0.525] }),
    part(centralBufferStemGeo, iron, { position: [-0.19, 0.205, 0.585], rotation: [Math.PI * 0.5, 0, 0] }),
    part(centralBufferHeadGeo, brass, { position: [-0.19, 0.205, 0.608], rotation: [Math.PI * 0.5, 0, 0] }),
    part(centralBufferStemGeo, iron, { position: [0.19, 0.205, 0.585], rotation: [Math.PI * 0.5, 0, 0] }),
    part(centralBufferHeadGeo, brass, { position: [0.19, 0.205, 0.608], rotation: [Math.PI * 0.5, 0, 0] }),
    part(lampHousingGeo, cherryDeep, { position: [-0.245, 0.305, 0.5], rotation: [Math.PI * 0.5, 0, 0] }),
    part(lampLensGeo, "#FFF3A8", { position: [-0.245, 0.305, 0.532] }),
    part(lampHousingGeo, cherryDeep, { position: [0.245, 0.305, 0.5], rotation: [Math.PI * 0.5, 0, 0] }),
    part(lampLensGeo, "#FFF3A8", { position: [0.245, 0.305, 0.532] }),

    // Engineer cab (-Z), arched roof, mullioned windows & coal bunker
    part(cabFrontWallGeo, cherry, { position: [0, 0.515, -0.155] }),
    part(cabRearBunkerGeo, cherryDeep, { position: [0, 0.455, -0.485] }),
    part(cabPillarGeo, cherry, { position: [-0.295, 0.68, -0.43] }),
    part(cabPillarGeo, cherry, { position: [0.295, 0.68, -0.43] }),
    part(cabPillarGeo, cherry, { position: [-0.295, 0.68, -0.16] }),
    part(cabPillarGeo, cherry, { position: [0.295, 0.68, -0.16] }),
    part(cabRoofGeo, cherry, { position: [0, 0, -0.315] }),
    part(cabWindowPaneGeo, windowTint, { position: [-0.155, 0.665, -0.125], rotation: [Math.PI * 0.5, 0, 0] }),
    part(cabWindowRimGeo, brass, { position: [-0.155, 0.665, -0.12] }),
    part(cabWindowPaneGeo, windowTint, { position: [0.155, 0.665, -0.125], rotation: [Math.PI * 0.5, 0, 0] }),
    part(cabWindowRimGeo, brass, { position: [0.155, 0.665, -0.12] }),
    part(coalPuffGeo, iron, { position: [-0.11, 0.635, -0.485] }),
    part(coalPuffGeo, "#323544", { position: [0, 0.65, -0.49] }),
    part(coalPuffGeo, iron, { position: [0.11, 0.635, -0.485] })
  ];

  // 5 angled cowcatcher pilot bars under front buffer beam (+Z) + rear coupler buffer (-Z).
  for (const px of [-0.18, -0.09, 0, 0.09, 0.18] as const) {
    bodyParts.push(
      part(pilotBarGeo, iron, {
        position: [px, 0.1, 0.565 - Math.abs(px) * 0.14],
        rotation: [-0.52, 0, px * 0.35]
      })
    );
  }
  bodyParts.push(part(centralBufferHeadGeo, iron, { position: [0, 0.2, -0.568], rotation: [Math.PI * 0.5, 0, 0] }));

  const bodyLobe = composeLobe({
    suffix: "locomotiveBody",
    craft: "carPaint",
    tintTarget: true,
    parts: bodyParts
  });
  const bodyPart = makeSubPartRig("body", [0, 0, 0], [bodyLobe]);

  // Classic flared locomotive smokestack (`brushedMetal` craft) embedded into boiler top!
  const chimneyAnchor: Vec3 = [0, 0.705, 0.335];
  const chimneyProfile = bezierProfilePoints(
    [0, 0.68],
    [
      { cp1: [0.092, 0.68], cp2: [0.072, 0.74], to: [0.066, 0.83] },
      { cp1: [0.064, 0.9], cp2: [0.128, 0.935], to: [0.124, 0.972] },
      { cp1: [0.118, 0.994], cp2: [0.068, 0.998], to: [0, 0.996] }
    ],
    2
  );
  const chimneyStackGeo = sculptOrganicLathe(chimneyProfile, { segments: 16 });
  const chimneyRimGeo = torusSpec(0.116, 0.018, 18, 6);
  const chimneyCollarGeo = torusSpec(0.076, 0.014, 16, 5);
  const chimneyLobe = composeLobe({
    suffix: "smokestack",
    craft: "brushedMetal",
    hinge: chimneyAnchor,
    parts: [
      part(chimneyStackGeo, cherry, { position: [0, 0, 0.335] }),
      part(chimneyCollarGeo, brass, { position: [0, 0.745, 0.335], rotation: [Math.PI * 0.5, 0, 0] }),
      part(chimneyRimGeo, iron, { position: [0, 0.968, 0.335], rotation: [Math.PI * 0.5, 0, 0] })
    ]
  });
  const chimneyPart = makeSubPartRig("chimney", chimneyAnchor, [chimneyLobe], "body");

  // Articulated lower smokebox chin & cocoa smile lip (`clay` craft — covers mouth interior at rest, parts cleanly when speaking).
  const jawAnchor: Vec3 = [0, 0.426, 0.495];
  const gogoChinCoverGeo = cabochonCapSpec(0.078, 0.033, 0.016, 16, 3);
  const smileLipGeo = sculptCurvedLimb(
    [
      [-0.086, 0.436, 0.526],
      [-0.044, 0.422, 0.537],
      [0, 0.418, 0.541],
      [0.044, 0.422, 0.537],
      [0.086, 0.436, 0.526]
    ],
    0.008,
    { steps: 8, radialSegments: 7 }
  );
  const jawLobe = composeLobe({
    suffix: "smokeboxSmile",
    craft: "clay",
    hinge: jawAnchor,
    parts: [
      part(gogoChinCoverGeo, creamFace, { position: [0, 0.412, 0.524] }),
      part(smileLipGeo, "#6E3B2E")
    ]
  });
  const jawPart = makeSubPartRig("jaw", jawAnchor, [jawLobe], "body");

  // Rear-hinged engineer cab doors so `cabDoorL: { rotation: [0, -1.25, 0] }` swings cleanly OUTWARD!
  const buildCabDoor = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.31, 0.49, -0.415];
    const doorPanelGeo = beveledSlabSpec(0.042, 0.36, 0.24, 0.008);
    const doorInsetGeo = cylinderSpec(0.065, 0.065, 0.048, 10, 0);
    const handrailGeo = cylinderSpec(0.009, 0.009, 0.22, 6, 0);
    const doorLobe = composeLobe({
      suffix: "cabDoor",
      craft: "carPaint",
      hinge: anchor,
      parts: [
        part(doorPanelGeo, cherry, { position: [sign * 0.31, 0.49, -0.295] }),
        part(doorInsetGeo, creamFace, {
          position: [sign * 0.314, 0.52, -0.295],
          rotation: [0, 0, Math.PI * 0.5]
        }),
        part(handrailGeo, brass, { position: [sign * 0.338, 0.52, -0.195] })
      ]
    });
    return makeSubPartRig(sign < 0 ? "cabDoorL" : "cabDoorR", anchor, [doorLobe], "body");
  };

  // 4 spoked flanged railway wheels (`radius = 0.16`, resting on y = 0) with brass crankpin!
  const flangedTireGeo = cylinderSpec(0.158, 0.158, 0.044, 18, 0.008);
  const hubGeo = cylinderSpec(0.048, 0.052, 0.054, 8, 0);
  const spokeCylGeo = cylinderSpec(0.012, 0.012, 0.245, 4, 0);
  const crankPinGeo = cylinderSpec(0.022, 0.022, 0.04, 6, 0);

  const buildTrainWheel = (
    partId: "wheelFL" | "wheelFR" | "wheelRL" | "wheelRR",
    sign: -1 | 1,
    zWheel: number
  ): BuiltSubPart => {
    const xWheel = sign * 0.285;
    const anchor: Vec3 = [xWheel, 0.16, zWheel];
    const rimRotZ = sign > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
    const wheelLobe = composeLobe({
      suffix: "spokedWheel",
      craft: "rubber",
      hinge: anchor,
      parts: [
        part(flangedTireGeo, iron, { position: [xWheel, 0.16, zWheel], rotation: [0, 0, rimRotZ] }),
        part(hubGeo, cherry, { position: [xWheel, 0.16, zWheel], rotation: [0, 0, Math.PI * 0.5] }),
        part(spokeCylGeo, steel, { position: [xWheel, 0.16, zWheel], rotation: [0, 0, 0] }),
        part(spokeCylGeo, steel, { position: [xWheel, 0.16, zWheel], rotation: [Math.PI / 3, 0, 0] }),
        part(spokeCylGeo, steel, { position: [xWheel, 0.16, zWheel], rotation: [(2 * Math.PI) / 3, 0, 0] }),
        part(crankPinGeo, brass, {
          position: [xWheel + sign * 0.028, 0.16 + 0.088, zWheel + 0.024],
          rotation: [0, 0, Math.PI * 0.5]
        })
      ]
    });
    return makeSubPartRig(partId, anchor, [wheelLobe]);
  };

  return finalizeProceduralRig("gogo", [
    bodyPart,
    chimneyPart,
    buildTrainWheel("wheelFL", -1, 0.305),
    buildTrainWheel("wheelFR", 1, 0.305),
    buildTrainWheel("wheelRL", -1, -0.295),
    buildTrainWheel("wheelRR", 1, -0.295),
    buildCabDoor(-1),
    buildCabDoor(1),
    eyes.eyelidL,
    eyes.eyelidR,
    jawPart
  ]);
}

// ================================================================ 5. LUMI (h = 0.65m)

function buildLumiRig(): ProceduralAssetRig {
  const starGold = "#FFE570";
  const butterCream = "#FFF7CC";
  const honeyGold = "#F5C442";
  const peachCheek = "#FFAE94";

  // Adorable chubby plush 5-pointed bedtime star sprite (Luma / Jellycat star cushion silhouette!).
  const bodyAnchor: Vec3 = [0, 0.505, 0];

  const starCenterPuffGeo = smoothPuffSpec(0.245, 0.245, 0.165, 22, 11);
  const faceCushionGeo = cabochonCapSpec(0.182, 0.168, 0.056, 26, 3);
  const noseButtonGeo = cabochonCapSpec(0.016, 0.013, 0.012, 10, 2);
  const lumiSmileArc = sculptCurvedLimb(
    [
      [-0.048, 0.468, 0.196],
      [0, 0.456, 0.206],
      [0.048, 0.468, 0.196]
    ],
    0.0075,
    { steps: 7, radialSegments: 6 }
  );
  const lumiMouthCavityGeo = cabochonCapSpec(0.042, 0.022, 0.012, 14, 3);
  const lumiTongueGeo = cabochonCapSpec(0.028, 0.012, 0.01, 12, 2);
  const handMittenGeo = smoothPuffSpec(0.042, 0.036, 0.036, 8, 4);
  const starBootieGeo = smoothPuffSpec(0.052, 0.036, 0.062, 8, 4);

  const eyes = buildCastEyePair({
    eyeX: 0.088,
    eyeY: 0.535,
    eyeZ: 0.184,
    radius: 0.052,
    irisOuterColor: "#24140A",
    irisColor: "#5C3518",
    irisCrescentColor: "#C8842E",
    lashColor: "#2B1A14",
    browColor: "#D89E2B",
    socketColor: butterCream,
    parentPart: "body",
    outwardYaw: 0.12,
    pitch: -0.02,
    browLift: 1.44
  });

  const bodyPlushLobe = composeLobe({
    suffix: "starBabyCore",
    craft: "felt",
    hinge: bodyAnchor,
    tintTarget: true,
    emissive: "#FFD95A",
    emissiveIntensity: 0.16,
    parts: [
      part(starCenterPuffGeo, starGold, { position: [0, 0.505, 0] }),
      part(faceCushionGeo, butterCream, { position: [0, 0.515, 0.138] }),
      part(noseButtonGeo, honeyGold, { position: [0, 0.494, 0.202] }),
      part(lumiSmileArc, "#6B3E1E"),
      part(lumiMouthCavityGeo, "#75203E", { position: [0, 0.446, 0.191] }),
      part(lumiTongueGeo, "#FF8DA1", { position: [0, 0.438, 0.195] }),
      part(handMittenGeo, butterCream, { position: [-0.255, 0.46, 0.082], rotation: [0, 0.25, 0.2] }),
      part(handMittenGeo, butterCream, { position: [0.255, 0.46, 0.082], rotation: [0, -0.25, -0.2] }),
      part(starBootieGeo, honeyGold, { position: [-0.225, 0.165, 0.042], rotation: [0, -0.22, 0] }),
      part(starBootieGeo, honeyGold, { position: [0.225, 0.165, 0.042], rotation: [0, 0.22, 0] }),
      ...eyes.headAccentParts
    ]
  });

  // Back filigree star medallion + quilted stitch beads on -Z for 360-degree turnaround detail (`clay` craft).
  const backMedallionGeo = cabochonCapSpec(0.135, 0.135, 0.036, 14, 2);
  const centerGemGeo = smoothPuffSpec(0.036, 0.036, 0.02, 8, 4);
  const quiltBeadGeo = smoothPuffSpec(0.015, 0.015, 0.012, 6, 3);
  const backFiligreeParts: LobePartInput[] = [
    part(backMedallionGeo, butterCream, { position: [0, 0.505, -0.148], rotation: [0, Math.PI, 0] }),
    part(centerGemGeo, honeyGold, { position: [0, 0.505, -0.184] })
  ];
  for (let b = 0; b < 8; b += 1) {
    const ba = (b / 8) * TAU;
    backFiligreeParts.push(
      part(quiltBeadGeo, honeyGold, {
        position: [Math.sin(ba) * 0.092, 0.505 + Math.cos(ba) * 0.092, -0.172]
      })
    );
  }
  const bodyFiligreeLobe = composeLobe({
    suffix: "starFiligree",
    craft: "clay",
    hinge: bodyAnchor,
    parts: backFiligreeParts
  });
  const bodyPart = makeSubPartRig("body", bodyAnchor, [bodyPlushLobe, bodyFiligreeLobe]);

  // Chubby, pillowed 5-pointed plush star rays (`petals`, `warmGlow` craft) with rounded chubby tips!
  const petalsAnchor: Vec3 = [0, 0.505, 0];
  const starRayProfile = bezierProfilePoints(
    [0, 0],
    [
      { cp1: [0.195, 0], cp2: [0.205, 0.08], to: [0.17, 0.175] },
      { cp1: [0.138, 0.26], cp2: [0.098, 0.335], to: [0.062, 0.368] },
      { cp1: [0.036, 0.388], cp2: [0.016, 0.394], to: [0, 0.396] }
    ],
    4
  );
  const starRayGeo = sculptOrganicLathe(starRayProfile, { segments: 20 });
  const rayTipPuffGeo = smoothPuffSpec(0.048, 0.048, 0.042, 12, 6);

  const petalParts: LobePartInput[] = [];
  const rayAngles: readonly number[] = [0, (TAU * 1) / 5, (TAU * 2) / 5, (TAU * 3) / 5, (TAU * 4) / 5];
  for (let i = 0; i < rayAngles.length; i += 1) {
    const ang = rayAngles[i]!;
    petalParts.push(
      part(starRayGeo, starGold, {
        position: [Math.sin(ang) * 0.085, 0.505 + Math.cos(ang) * 0.085, -0.008],
        rotation: [0, 0, -ang],
        scale: [1.1, 1.0, 0.68]
      }),
      part(rayTipPuffGeo, starGold, {
        position: [Math.sin(ang) * 0.435, 0.505 + Math.cos(ang) * 0.435, -0.006]
      })
    );
  }
  const petalsLobe = composeLobe({
    suffix: "starCrown",
    craft: "warmGlow",
    hinge: petalsAnchor,
    emissive: "#FFD84D",
    emissiveIntensity: 0.18,
    parts: petalParts
  });
  const petalsPart = makeSubPartRig("petals", petalsAnchor, [petalsLobe], "body");

  // Smooth warm peach cheek blushes (zero pokey dots).
  const cheekAnchor: Vec3 = [0, 0.482, 0.168];
  const lumiCheekGeo = cabochonCapSpec(0.038, 0.026, 0.015, 18, 3);
  const cheekLobe = composeLobe({
    suffix: "starCheeks",
    craft: "felt",
    hinge: cheekAnchor,
    parts: [
      part(lumiCheekGeo, peachCheek, { position: [-0.145, 0.482, 0.162], rotation: [0, -0.35, 0] }),
      part(lumiCheekGeo, peachCheek, { position: [0.145, 0.482, 0.162], rotation: [0, 0.35, 0] })
    ]
  });
  const cheekPart = makeSubPartRig("cheekPuff", cheekAnchor, [cheekLobe], "body");

  // Articulated lower star chin & smile lip (`felt` craft) so Lumi visibly sings & speaks!
  const lumiJawAnchor: Vec3 = [0, 0.456, 0.175];
  const lumiChinCoverGeo = cabochonCapSpec(0.05, 0.026, 0.016, 14, 3);
  const lumiLowerLipArc = sculptCurvedLimb(
    [
      [-0.044, 0.464, 0.197],
      [0, 0.45, 0.21],
      [0.044, 0.464, 0.197]
    ],
    0.007,
    { steps: 7, radialSegments: 6 }
  );
  const lumiJawLobe = composeLobe({
    suffix: "starJaw",
    craft: "felt",
    hinge: lumiJawAnchor,
    parts: [
      part(lumiChinCoverGeo, butterCream, { position: [0, 0.445, 0.193] }),
      part(lumiLowerLipArc, "#6B3E1E")
    ]
  });
  const lumiJawPart = makeSubPartRig("jaw", lumiJawAnchor, [lumiJawLobe], "body");

  return finalizeProceduralRig("lumi", [
    bodyPart,
    petalsPart,
    eyes.eyelidL,
    eyes.eyelidR,
    lumiJawPart,
    cheekPart
  ]);
}

// ================================================================ 6. PEEKO (h = 0.55m)

function buildPeekoRig(): ProceduralAssetRig {
  const chickYellow = "#FFE358";
  const chickGold = "#FFD234";
  const breastCream = "#FFF7C8";
  const beakOrange = "#FF8C3B";
  const beakDeep = "#EA7220";
  const cheekPeach = "#FFA680";

  // Round downy baby-chick belly + soft cream breast feather bib + 3-feather upturned tail fan!
  const bodyAnchor: Vec3 = [0, 0.12, 0];
  const chickBodyProfile = bezierProfilePoints(
    [0, 0.125],
    [
      { cp1: [0.165, 0.125], cp2: [0.285, 0.19], to: [0.282, 0.315] },
      { cp1: [0.278, 0.425], cp2: [0.225, 0.495], to: [0.168, 0.535] },
      { cp1: [0.142, 0.555], cp2: [0.11, 0.568], to: [0, 0.57] }
    ],
    3
  );
  const chickBodyGeo = sculptOrganicLathe(chickBodyProfile, { segments: 30 });

  const bibFeatherGeo = cabochonCapSpec(0.142, 0.138, 0.038, 26, 3);
  const collarFluffGeo = smoothPuffSpec(0.024, 0.015, 0.016, 10, 5);
  const tailPlumeCenterGeo = sculptCurvedLimb(
    [
      [0, 0.295, -0.235],
      [0, 0.345, -0.305],
      [0, 0.415, -0.345]
    ],
    (t) => 0.042 * (1 - 0.48 * t),
    { steps: 5, radialSegments: 6, profileScaleX: 0.95, profileScaleY: 0.55 }
  );
  const tailPlumeSideGeo = sculptCurvedLimb(
    [
      [0, 0, 0],
      [0, 0.04, -0.055],
      [0, 0.095, -0.088]
    ],
    (t) => 0.034 * (1 - 0.48 * t),
    { steps: 5, radialSegments: 5 }
  );

  const bodyLobe = composeLobe({
    suffix: "chickBody",
    craft: "felt",
    hinge: bodyAnchor,
    tintTarget: true,
    parts: [
      part(chickBodyGeo, chickYellow, { scale: [1.02, 1, 0.98] }),
      part(bibFeatherGeo, breastCream, { position: [0, 0.355, 0.252], rotation: [-0.14, 0, 0] }),
      part(collarFluffGeo, breastCream, { position: [-0.048, 0.478, 0.228], rotation: [0, -0.22, 0.16] }),
      part(collarFluffGeo, breastCream, { position: [0.048, 0.478, 0.228], rotation: [0, 0.22, -0.16] }),
      part(tailPlumeCenterGeo, chickGold),
      part(tailPlumeSideGeo, breastCream, { position: [-0.052, 0.285, -0.235], rotation: [0, -0.32, 0.18] }),
      part(tailPlumeSideGeo, breastCream, { position: [0.052, 0.285, -0.235], rotation: [0, 0.32, -0.18] })
    ]
  });
  const bodyPart = makeSubPartRig("body", bodyAnchor, [bodyLobe]);

  // Gumdrop / pear chick head (26 radial segments + chubby lower cheek swells, matching peeko.webp!).
  const headAnchor: Vec3 = [0, 0.495, 0.015];
  const chickHeadProfile = bezierProfilePoints(
    [0, 0.47],
    [
      { cp1: [0.16, 0.47], cp2: [0.275, 0.515], to: [0.258, 0.6] },
      { cp1: [0.24, 0.685], cp2: [0.205, 0.79], to: [0.148, 0.855] },
      { cp1: [0.095, 0.892], cp2: [0.042, 0.9], to: [0, 0.902] }
    ],
    3
  );
  const chickHeadGeo = sculptOrganicLathe(chickHeadProfile, { segments: 26 });
  const gumdropCheekSwellGeo = smoothPuffSpec(0.112, 0.088, 0.1, 8, 4);
  const chickCheekGeo = cabochonCapSpec(0.042, 0.028, 0.016, 10, 1);

  const eyes = buildCastEyePair({
    eyeX: 0.108,
    eyeY: 0.642,
    eyeZ: 0.228,
    radius: 0.055,
    irisOuterColor: "#24130B",
    irisColor: "#4D2B18",
    irisCrescentColor: "#9E5E32",
    lashColor: "#241410",
    browColor: "#3D2618",
    socketColor: chickGold,
    parentPart: "head",
    outwardYaw: 0.16,
    pitch: -0.02,
    browLift: 1.62
  });

  const headPlushLobe = composeLobe({
    suffix: "chickHead",
    craft: "felt",
    hinge: headAnchor,
    tintTarget: true,
    parts: [
      part(chickHeadGeo, chickYellow, { position: [0, 0, 0.015], scale: [1.06, 1, 0.94] }),
      part(gumdropCheekSwellGeo, chickYellow, { position: [-0.168, 0.565, 0.075] }),
      part(gumdropCheekSwellGeo, chickYellow, { position: [0.168, 0.565, 0.075] }),
      part(chickCheekGeo, cheekPeach, { position: [-0.185, 0.578, 0.198], rotation: [0, -0.45, 0] }),
      part(chickCheekGeo, cheekPeach, { position: [0.185, 0.578, 0.198], rotation: [0, 0.45, 0] }),
      ...eyes.headAccentParts
    ]
  });

  // Sculpted plump baby-chick bill (`lacquer` 2nd lobe on head — cute wide diamond bill, not narrow spike!).
  const upperBeakGeo = smoothPuffSpec(0.056, 0.034, 0.062, 16, 8, 0.22);
  const peekoMouthRoofGeo = smoothPuffSpec(0.042, 0.014, 0.046, 12, 5);
  const beakNostrilGeo = cabochonCapSpec(0.006, 0.005, 0.006, 8, 1);
  const upperBeakLobe = composeLobe({
    suffix: "upperBeak",
    craft: "lacquer",
    hinge: headAnchor,
    parts: [
      part(upperBeakGeo, beakOrange, { position: [0, 0.594, 0.246], rotation: [0.12, 0, 0] }),
      part(peekoMouthRoofGeo, "#721F3A", { position: [0, 0.578, 0.252] }),
      part(beakNostrilGeo, "#C95812", { position: [-0.018, 0.608, 0.292] }),
      part(beakNostrilGeo, "#C95812", { position: [0.018, 0.608, 0.292] })
    ]
  });
  const headPart = makeSubPartRig("head", headAnchor, [headPlushLobe, upperBeakLobe], "body");

  // Hinged lower tangerine beak + cute coral chick tongue (`lacquer` craft).
  const beakLowerAnchor: Vec3 = [0, 0.57, 0.228];
  const lowerBeakGeo = smoothPuffSpec(0.046, 0.024, 0.056, 14, 7, 0.18);
  const chickTongueGeo = smoothPuffSpec(0.026, 0.011, 0.03, 10, 5);
  const beakLowerLobe = composeLobe({
    suffix: "lowerBeak",
    craft: "lacquer",
    hinge: beakLowerAnchor,
    parts: [
      part(lowerBeakGeo, beakDeep, { position: [0, 0.568, 0.244], rotation: [-0.06, 0, 0] }),
      part(chickTongueGeo, "#FF7D8C", { position: [0, 0.579, 0.256] })
    ]
  });
  const beakLowerPart = makeSubPartRig("beakLower", beakLowerAnchor, [beakLowerLobe], "head");

  // 3-plume curved crown feather tuft reaching y = 1.00 (`clay` craft).
  const tuftAnchor: Vec3 = [0, 0.885, 0.015];
  const centerPlumeGeo = sculptCurvedLimb(
    [
      [0, 0.875, 0.015],
      [0.006, 0.945, 0.022],
      [0.022, 1.002, 0.012]
    ],
    (t) => 0.022 * (1 - 0.62 * t),
    { steps: 5, radialSegments: 5 }
  );
  const leftPlumeGeo = sculptCurvedLimb(
    [
      [-0.008, 0.878, 0.012],
      [-0.032, 0.935, 0.018],
      [-0.056, 0.972, 0.008]
    ],
    (t) => 0.018 * (1 - 0.62 * t),
    { steps: 5, radialSegments: 5 }
  );
  const rightPlumeGeo = sculptCurvedLimb(
    [
      [0.008, 0.878, 0.012],
      [0.038, 0.93, 0.018],
      [0.064, 0.962, 0.008]
    ],
    (t) => 0.018 * (1 - 0.62 * t),
    { steps: 5, radialSegments: 5 }
  );
  const tuftLobe = composeLobe({
    suffix: "crownTuft",
    craft: "clay",
    hinge: tuftAnchor,
    parts: [
      part(centerPlumeGeo, chickGold),
      part(leftPlumeGeo, chickYellow),
      part(rightPlumeGeo, breastCream)
    ]
  });
  const tuftPart = makeSubPartRig("tuft", tuftAnchor, [tuftLobe], "head");

  // Layered cupped feather-paddle wings hugging Peeko's plump sides (`felt` craft).
  const buildPeekoWing = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.245, 0.445, 0.01];
    const primaryWingGeo = sculptCurvedLimb(
      [
        [sign * 0.215, 0.455, 0.01],
        [sign * 0.295, 0.395, 0.02],
        [sign * 0.328, 0.315, 0.015],
        [sign * 0.308, 0.245, -0.005]
      ],
      (t) => 0.058 * (0.95 + 0.15 * Math.sin(t * Math.PI) - 0.32 * t),
      { steps: 6, radialSegments: 7, profileScaleX: 0.44, profileScaleY: 1.15 }
    );
    const tipFeatherGeo = smoothPuffSpec(0.016, 0.042, 0.026, 6, 3, 0.3);
    const wingLobe = composeLobe({
      suffix: "featherWing",
      craft: "felt",
      hinge: anchor,
      parts: [
        part(primaryWingGeo, chickYellow),
        part(tipFeatherGeo, chickGold, {
          position: [sign * 0.316, 0.268, 0.025],
          rotation: [0.2, 0, -sign * 0.18]
        }),
        part(tipFeatherGeo, breastCream, {
          position: [sign * 0.312, 0.252, -0.005],
          rotation: [0, 0, -sign * 0.15]
        }),
        part(tipFeatherGeo, chickGold, {
          position: [sign * 0.3, 0.262, -0.032],
          rotation: [-0.2, 0, -sign * 0.15]
        })
      ]
    });
    return makeSubPartRig(sign < 0 ? "wingL" : "wingR", anchor, [wingLobe], "body");
  };

  // Slender orange shanks + 3 wide spread toes resting cleanly at y = 0 (`ceramic` craft, matches peeko.webp!).
  const buildPeekoFoot = (sign: -1 | 1): BuiltSubPart => {
    const anchor: Vec3 = [sign * 0.105, 0.145, 0.01];
    const shankGeo = cylinderSpec(0.02, 0.022, 0.155, 8, 0);
    const ankleJointGeo = smoothPuffSpec(0.028, 0.022, 0.028, 6, 3);
    const buildToe = (endX: number, endZ: number): AuraCustomGeometrySpec =>
      sculptCurvedLimb(
        [
          [sign * 0.108, 0.022, 0.012],
          [endX * 0.5 + sign * 0.054, 0.019, endZ * 0.5 + 0.006],
          [endX, 0.015, endZ]
        ],
        (t) => 0.017 - 0.004 * t,
        { steps: 4, radialSegments: 5 }
      );
    const innerToeGeo = buildToe(sign * 0.052, 0.125);
    const midToeGeo = buildToe(sign * 0.118, 0.142);
    const outerToeGeo = buildToe(sign * 0.188, 0.118);
    const backToeGeo = buildToe(sign * 0.108, -0.048);

    const footLobe = composeLobe({
      suffix: "webbedFoot",
      craft: "ceramic",
      hinge: anchor,
      parts: [
        part(shankGeo, beakOrange, { position: [sign * 0.108, 0.095, 0.012] }),
        part(ankleJointGeo, beakDeep, { position: [sign * 0.108, 0.024, 0.012] }),
        part(innerToeGeo, beakOrange),
        part(midToeGeo, beakOrange),
        part(outerToeGeo, beakOrange),
        part(backToeGeo, beakDeep)
      ]
    });
    return makeSubPartRig(sign < 0 ? "footL" : "footR", anchor, [footLobe]);
  };

  return finalizeProceduralRig("peeko", [
    bodyPart,
    headPart,
    buildPeekoWing(-1),
    buildPeekoWing(1),
    tuftPart,
    buildPeekoFoot(-1),
    buildPeekoFoot(1),
    eyes.eyelidL,
    eyes.eyelidR,
    beakLowerPart
  ]);
}

// ================================================================ MEMOIZED REGISTRY

export const CAST_RIGS: Readonly<Record<CastAssetKey, ProceduralAssetRig>> = {
  momo: buildMomoRig(),
  lulu: buildLuluRig(),
  sheru: buildSheruRig(),
  gogo: buildGogoRig(),
  lumi: buildLumiRig(),
  peeko: buildPeekoRig()
};

export function getCastRig(key: CastAssetKey): ProceduralAssetRig {
  return CAST_RIGS[key];
}
