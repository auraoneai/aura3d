/**
 * WP-25 Hero Rig: Sculpted, strictly symmetrical open-top classic coastal grand-touring roadster.
 *
 * Replaces the lumpy single-mesh merged blob with separated PBR material groups and 4 independent
 * wheel/knuckle assemblies that spin with road speed and front-steer up to +-24 degrees:
 *   - `body`      : Metallic crimson GT coachwork (`material.carPaint`), sculpted pontoon fenders, hood bulge, side coves & ducktail
 *   - `stripes`   : Twin white lacquer racing stripes (`material.clearcoat`) hugging the hood & rear deck
 *   - `chrome`    : Twin hoop rollbars, oval slatted front grille, side exhaust pipes, bullet mirrors & split rear bumperettes (`material.brushedMetal`)
 *   - `cockpit`   : Recessed dark leather tub, twin bucket seats, dash cowl, steering wheel & driver silhouette (`material.fabric`)
 *   - `glass`     : Raked wrap-around speedster windscreen (`material.studioGlass`)
 *   - `headlamps` : Twin round classic endurance headlamps (`material.glowingEmissive`)
 *   - `taillamps` : Quad circular ruby-red brake/afterburner lenses (`material.glowingEmissive`)
 *   - `wheelTire` / `wheelRim` : Rounded-shoulder radial tire (`material.blackRubber`) + deep-dish wire-spoke chrome rim (`material.brushedMetal`)
 *
 * Local coordinate convention matches `world.ts`:
 *   +X = right, +Y = up (origin at chassis centre `playerHeight / 2` above road contact), -Z = forward, +Z = rear.
 */

import {
  bevelBoxMesh,
  catmullRomSpline3,
  latheMesh,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptDrapedGarmentMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  sminPoly,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type RawMesh,
  type V2,
  type V4
} from "../../apps/showcase-port-shared/proceduralKernel";

export interface RoadsterMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

interface Builder {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

type V3 = readonly [number, number, number];

const newBuilder = (): Builder => ({ positions: [], normals: [], uvs: [], indices: [] });

function toRoadsterMesh(b: Builder): RoadsterMesh {
  return {
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    uvs: Float32Array.from(b.uvs),
    indices: Uint32Array.from(b.indices)
  };
}

/** Appends a `RawMesh` directly into `Builder`, preserving exact vertex normals (including `analyticNormals: true` SDF gradients). */
function appendRawMesh(b: Builder, raw: RawMesh): void {
  const vBase = b.positions.length / 3;
  const vCount = Math.floor(raw.positions.length / 3);
  for (let i = 0; i < vCount; i++) {
    const p3 = i * 3;
    const u2 = i * 2;
    b.positions.push(raw.positions[p3]!, raw.positions[p3 + 1]!, raw.positions[p3 + 2]!);
    b.normals.push(raw.normals[p3] ?? 0, raw.normals[p3 + 1] ?? 1, raw.normals[p3 + 2] ?? 0);
    b.uvs.push(raw.uvs[u2] ?? 0, raw.uvs[u2 + 1] ?? 0);
  }
  for (let i = 0; i < raw.indices.length; i++) {
    b.indices.push(vBase + raw.indices[i]!);
  }
}

function norm3(x: number, y: number, z: number): V3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function addQuad(b: Builder, p0: V3, p1: V3, p2: V3, p3: V3, uvScale = 1): void {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
  const n = norm3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  const base = b.positions.length / 3;
  const pts = [p0, p1, p2, p3] as const;
  const uvs = [[0, 0], [uvScale, 0], [uvScale, uvScale], [0, uvScale]] as const;
  for (let i = 0; i < 4; i++) {
    b.positions.push(pts[i]![0], pts[i]![1], pts[i]![2]);
    b.normals.push(n[0], n[1], n[2]);
    b.uvs.push(uvs[i]![0], uvs[i]![1]);
  }
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Appends a smooth-subdivided rounded box instead of sharp 6-face `addBox` slabs. */
function addSmoothBevelBox(
  b: Builder,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  subdiv = 1
): void {
  const bevel = Math.max(0.003, Math.min(hx, hy, hz) * 0.34);
  const base = bevelBoxMesh(hx * 2, hy * 2, hz * 2, bevel);
  const smoothed = subdiv > 0 ? subdivideSmoothMesh(base, subdiv, 0.44) : base;
  appendRawMesh(b, transformMesh(smoothed, { pos: [cx, cy, cz] }));
}

/** Smooth-shaded cylinder/frustum along an arbitrary axis `a -> c`. */
function addTube(b: Builder, a: V3, c: V3, r0: number, r1: number, segs: number, caps = true): void {
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const ax: V3 = [dx / len, dy / len, dz / len];
  const ref: V3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const ux = ref[1] * ax[2] - ref[2] * ax[1], uy = ref[2] * ax[0] - ref[0] * ax[2], uz = ref[0] * ax[1] - ref[1] * ax[0];
  const u = norm3(ux, uy, uz);
  const v = norm3(ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]);
  const base = b.positions.length / 3;
  const slope = (r0 - r1) / len;
  for (let ring = 0; ring <= 1; ring++) {
    const p = ring === 0 ? a : c;
    const r = ring === 0 ? r0 : r1;
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const rx = u[0] * cs + v[0] * sn, ry = u[1] * cs + v[1] * sn, rz = u[2] * cs + v[2] * sn;
      const n = norm3(rx + ax[0] * slope, ry + ax[1] * slope, rz + ax[2] * slope);
      b.positions.push(p[0] + rx * r, p[1] + ry * r, p[2] + rz * r);
      b.normals.push(n[0], n[1], n[2]);
      b.uvs.push(s / segs, ring);
    }
  }
  const stride = segs + 1;
  for (let s = 0; s < segs; s++) {
    const i0 = base + s, i1 = i0 + 1, i2 = i0 + stride, i3 = i2 + 1;
    b.indices.push(i0, i2, i1, i1, i2, i3);
  }
  if (caps) {
    for (const [endP, r, sign] of [[a, r0, -1], [c, r1, 1]] as const) {
      if (r <= 1e-4) continue;
      const centerIdx = b.positions.length / 3;
      b.positions.push(endP[0], endP[1], endP[2]);
      b.normals.push(ax[0] * sign, ax[1] * sign, ax[2] * sign);
      b.uvs.push(0.5, 0.5);
      for (let s = 0; s <= segs; s++) {
        const th = (s / segs) * Math.PI * 2;
        const cs = Math.cos(th), sn = Math.sin(th);
        const rx = u[0] * cs + v[0] * sn, ry = u[1] * cs + v[1] * sn, rz = u[2] * cs + v[2] * sn;
        b.positions.push(endP[0] + rx * r, endP[1] + ry * r, endP[2] + rz * r);
        b.normals.push(ax[0] * sign, ax[1] * sign, ax[2] * sign);
        b.uvs.push(0.5 + cs * 0.5, 0.5 + sn * 0.5);
      }
      for (let s = 0; s < segs; s++) {
        const p0 = centerIdx + 1 + s, p1 = p0 + 1;
        if (sign > 0) b.indices.push(centerIdx, p0, p1);
        else b.indices.push(centerIdx, p1, p0);
      }
    }
  }
}

/** Smooth-shaded high-density ellipsoid / dome (`uSegs = 28, vSegs = 18` default). */
function addEllipsoid(b: Builder, c: V3, r: V3, uSegs = 28, vSegs = 18, hemiOnly = false): void {
  const base = b.positions.length / 3;
  for (let iv = 0; iv <= vSegs; iv++) {
    const phi = (iv / vSegs) * (hemiOnly ? Math.PI * 0.5 : Math.PI);
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let iu = 0; iu <= uSegs; iu++) {
      const th = (iu / uSegs) * Math.PI * 2;
      const ct = Math.cos(th), st = Math.sin(th);
      const nx = sp * ct, ny = cp, nz = sp * st;
      b.positions.push(c[0] + nx * r[0], c[1] + ny * r[1], c[2] + nz * r[2]);
      const n = norm3(nx / (r[0] || 1), ny / (r[1] || 1), nz / (r[2] || 1));
      b.normals.push(n[0], n[1], n[2]);
      b.uvs.push(iu / uSegs, iv / vSegs);
    }
  }
  const stride = uSegs + 1;
  for (let iv = 0; iv < vSegs; iv++) {
    for (let iu = 0; iu < uSegs; iu++) {
      const a = base + iv * stride + iu, d = a + stride;
      b.indices.push(a, d, a + 1, a + 1, d, d + 1);
    }
  }
}

/* ---- Roadster proportions in world metres ---- */
export const ROADSTER_HALF_W = 0.99;
export const ROADSTER_HEIGHT = 1.24;
export const ROADSTER_HALF_H = ROADSTER_HEIGHT * 0.5; // chassis origin sits at +0.62 m above road contact
export const ROADSTER_HALF_L = 2.22;
export const ROADSTER_WHEEL_RADIUS = 0.355;
export const ROADSTER_WHEEL_WIDTH = 0.29;
export const ROADSTER_TRACK_X = 0.87;
export const ROADSTER_FRONT_Z = -1.36;
export const ROADSTER_REAR_Z = 1.34;

export interface RoadsterStation {
  readonly z: number;
  readonly halfW: number;
  readonly skirtY: number;
  readonly beltY: number;
  readonly shoulderW: number;
  readonly crownY: number;
  readonly wellCut: number;
  readonly cockpitCut: number;
}

const KEY_STATIONS: readonly RoadsterStation[] = [
  // Classic pinched oval GT nose -> voluptuous front pontoon fenders -> long power-dome hood -> open speedster cockpit -> muscular rear haunches -> Kammback ducktail
  { z: -2.22, halfW: 0.56, skirtY: -0.25, beltY: -0.09, shoulderW: 0.42, crownY: -0.06, wellCut: 0.0, cockpitCut: 0.0 },
  { z: -2.06, halfW: 0.84, skirtY: -0.31, beltY: 0.03, shoulderW: 0.70, crownY: 0.04, wellCut: 0.0, cockpitCut: 0.0 },
  { z: -1.74, halfW: 0.97, skirtY: -0.34, beltY: 0.14, shoulderW: 0.84, crownY: 0.12, wellCut: 0.58, cockpitCut: 0.0 },
  { z: -1.36, halfW: 1.01, skirtY: -0.19, beltY: 0.20, shoulderW: 0.88, crownY: 0.17, wellCut: 1.0, cockpitCut: 0.0 },
  { z: -0.96, halfW: 0.96, skirtY: -0.35, beltY: 0.15, shoulderW: 0.83, crownY: 0.20, wellCut: 0.42, cockpitCut: 0.0 },
  { z: -0.58, halfW: 0.92, skirtY: -0.39, beltY: 0.14, shoulderW: 0.79, crownY: 0.22, wellCut: 0.0, cockpitCut: 0.0 },
  { z: -0.34, halfW: 0.91, skirtY: -0.40, beltY: 0.12, shoulderW: 0.78, crownY: 0.18, wellCut: 0.0, cockpitCut: 0.90 },
  { z: 0.10, halfW: 0.91, skirtY: -0.40, beltY: 0.10, shoulderW: 0.77, crownY: 0.14, wellCut: 0.0, cockpitCut: 1.0 },
  { z: 0.56, halfW: 0.95, skirtY: -0.39, beltY: 0.16, shoulderW: 0.82, crownY: 0.19, wellCut: 0.0, cockpitCut: 0.86 },
  { z: 0.86, halfW: 1.02, skirtY: -0.34, beltY: 0.24, shoulderW: 0.88, crownY: 0.24, wellCut: 0.44, cockpitCut: 0.0 },
  { z: 1.34, halfW: 1.05, skirtY: -0.18, beltY: 0.30, shoulderW: 0.92, crownY: 0.26, wellCut: 1.0, cockpitCut: 0.0 },
  { z: 1.74, halfW: 1.00, skirtY: -0.30, beltY: 0.26, shoulderW: 0.87, crownY: 0.26, wellCut: 0.48, cockpitCut: 0.0 },
  { z: 2.04, halfW: 0.91, skirtY: -0.27, beltY: 0.24, shoulderW: 0.78, crownY: 0.31, wellCut: 0.0, cockpitCut: 0.0 },
  { z: 2.20, halfW: 0.81, skirtY: -0.22, beltY: 0.16, shoulderW: 0.70, crownY: 0.21, wellCut: 0.0, cockpitCut: 0.0 }
];

function lerpStation(a: RoadsterStation, b: RoadsterStation, t: number): RoadsterStation {
  const s = t * t * (3 - 2 * t);
  const mix = (u: number, v: number): number => u + (v - u) * s;
  return {
    z: a.z + (b.z - a.z) * t,
    halfW: mix(a.halfW, b.halfW),
    skirtY: mix(a.skirtY, b.skirtY),
    beltY: mix(a.beltY, b.beltY),
    shoulderW: mix(a.shoulderW, b.shoulderW),
    crownY: mix(a.crownY, b.crownY),
    wellCut: mix(a.wellCut, b.wellCut),
    cockpitCut: a.cockpitCut > 0 && b.cockpitCut > 0 ? mix(a.cockpitCut, b.cockpitCut) : (t < 0.5 ? a.cockpitCut : b.cockpitCut)
  };
}

/** 40 smooth longitudinal stations across `z = -2.22..+2.20` (3 subdivisions per key span). */
const STATIONS: readonly RoadsterStation[] = (() => {
  const out: RoadsterStation[] = [];
  for (let i = 0; i < KEY_STATIONS.length - 1; i++) {
    const a = KEY_STATIONS[i]!, b = KEY_STATIONS[i + 1]!;
    out.push(a);
    out.push(lerpStation(a, b, 1 / 3));
    out.push(lerpStation(a, b, 2 / 3));
  }
  out.push(KEY_STATIONS[KEY_STATIONS.length - 1]!);
  return out;
})();

/** Smooth Catmull-Rom 2D interpolation of half-section control points (`37` compound-curved points across `-X..+X`). */
function stationRing(s: RoadsterStation): V3[] {
  const z = s.z;
  const skirtY = s.skirtY + s.wellCut * 0.16;
  // Scaglietti-style side air-extractor cove behind the front wheels (`z in [-0.95, 0.45]`)
  const sideCove = z > -0.95 && z < 0.45 ? Math.sin(((z + 0.95) / 1.4) * Math.PI) * 0.055 : 0;
  const coveIn = (1 - s.wellCut) * 0.035 + sideCove;
  // Pontoon fender crest rises smoothly over both axles so fenders frame a sculpted central valley
  const fenderCrest = s.beltY + s.wellCut * 0.068 + 0.024;
  // Recessed circular headlamp pocket carved into the nose of each front fender (`z < -1.96`)
  const lampPocket = z < -1.96 ? Math.max(0, 1 - Math.abs(z + 2.08) / 0.14) * 0.045 : 0;
  const hoodBulge = z < -0.52 && z > -1.96 ? 0.048 * Math.sin(((z + 1.96) / 1.44) * Math.PI) : 0;
  const centerY = s.cockpitCut > 0 ? s.crownY - 0.35 * s.cockpitCut : s.crownY + hoodBulge;
  const innerRimY = s.cockpitCut > 0 ? s.crownY - 0.32 * s.cockpitCut : s.crownY + hoodBulge * 0.62;
  const valleyY = s.cockpitCut > 0 ? s.beltY + 0.015 : s.crownY * 0.93 - 0.014;
  const rimW = 0.54;
  const ctrlHalf: readonly V3[] = [
    [0.0, centerY, z],
    [0.16, centerY * 0.72 + innerRimY * 0.28, z],
    [0.32, innerRimY, z],
    [rimW, valleyY, z],
    [(rimW + s.shoulderW) * 0.5, (valleyY + fenderCrest) * 0.52 - lampPocket * 0.7, z],
    [s.shoulderW, fenderCrest - lampPocket, z],
    [(s.shoulderW + s.halfW) * 0.5, fenderCrest * 0.84 + skirtY * 0.16, z],
    [s.halfW - coveIn * 0.45, (fenderCrest + skirtY) * 0.55, z],
    [s.halfW - coveIn, skirtY + 0.055, z],
    [s.halfW * 0.78, -0.41 + s.wellCut * 0.14, z]
  ];
  const smoothHalf = catmullRomSpline3(ctrlHalf, 2); // 19 smooth half-points -> 37 points across
  const full: V3[] = [];
  for (let i = smoothHalf.length - 1; i >= 1; i--) {
    full.push([-smoothHalf[i]![0], smoothHalf[i]![1], z]);
  }
  for (let i = 0; i < smoothHalf.length; i++) {
    full.push([smoothHalf[i]![0], smoothHalf[i]![1], z]);
  }
  return full;
}

function buildBodyMesh(): RoadsterMesh {
  // Add smooth rounded nose & Kammback tail closure rings instead of flat single-vertex fans
  const baseRings = STATIONS.map(stationRing);
  const front0 = baseRings[0]!;
  const rear0 = baseRings[baseRings.length - 1]!;
  const scaleRingToward = (ring: readonly V3[], cx: number, cy: number, z: number, xyScale: number): V3[] =>
    ring.map((p): V3 => [cx + (p[0] - cx) * xyScale, cy + (p[1] - cy) * xyScale, z]);

  const noseTipRingA = scaleRingToward(front0, 0, -0.185, STATIONS[0]!.z - 0.042, 0.42);
  const noseTipRingB = scaleRingToward(front0, 0, -0.175, STATIONS[0]!.z - 0.022, 0.78);
  const tailCapRingA = scaleRingToward(rear0, 0, -0.025, STATIONS[STATIONS.length - 1]!.z + 0.020, 0.82);
  const tailCapRingB = scaleRingToward(rear0, 0, -0.035, STATIONS[STATIONS.length - 1]!.z + 0.036, 0.44);

  const rings: V3[][] = [noseTipRingA, noseTipRingB, ...baseRings, tailCapRingA, tailCapRingB];
  const rows = rings.length;
  const cols = rings[0]!.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = rings[r]![c]!;
      positions.push(p[0], p[1], p[2]);
      uvs.push(c / (cols - 1), r / (rows - 1));
    }
  }
  // Smooth vertex normals across the lofted coachwork
  const normals = new Array<number>(positions.length).fill(0);
  const at = (r: number, c: number): V3 => {
    const i = (r * cols + c) * 3;
    return [positions[i]!, positions[i + 1]!, positions[i + 2]!];
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pL = at(r, Math.max(0, c - 1)), pR = at(r, Math.min(cols - 1, c + 1));
      const pF = at(Math.max(0, r - 1), c), pB = at(Math.min(rows - 1, r + 1), c);
      const dx: V3 = [pR[0] - pL[0], pR[1] - pL[1], pR[2] - pL[2]];
      const dz: V3 = [pB[0] - pF[0], pB[1] - pF[1], pB[2] - pF[2]];
      const n = norm3(dz[1] * dx[2] - dz[2] * dx[1], dz[2] * dx[0] - dz[0] * dx[2], dz[0] * dx[1] - dz[1] * dx[0]);
      const i = (r * cols + c) * 3;
      normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const builder: Builder = { positions, normals, uvs, indices };
  // Seal tiny nose & tail center apertures cleanly
  const fCenter = builder.positions.length / 3;
  builder.positions.push(0, -0.188, STATIONS[0]!.z - 0.048);
  builder.normals.push(0, 0, -1);
  builder.uvs.push(0.5, 0.5);
  for (let c = 0; c < cols; c++) {
    const p = noseTipRingA[c]!;
    builder.positions.push(p[0], p[1], p[2]);
    builder.normals.push(0, 0.05, -0.998);
    builder.uvs.push(c / (cols - 1), 0);
  }
  for (let c = 0; c < cols - 1; c++) builder.indices.push(fCenter, fCenter + 1 + c + 1, fCenter + 1 + c);

  const rCenter = builder.positions.length / 3;
  builder.positions.push(0, -0.038, STATIONS[STATIONS.length - 1]!.z + 0.040);
  builder.normals.push(0, 0, 1);
  builder.uvs.push(0.5, 0.5);
  for (let c = 0; c < cols; c++) {
    const p = tailCapRingB[c]!;
    builder.positions.push(p[0], p[1], p[2]);
    builder.normals.push(0, 0.04, 0.999);
    builder.uvs.push(c / (cols - 1), 1);
  }
  for (let c = 0; c < cols - 1; c++) builder.indices.push(rCenter, rCenter + 1 + c, rCenter + 1 + c + 1);

  // Smooth studio-sculpted Ferrari-style hood air-intake cowling & twin Pininfarina aerodynamic headrest fairings
  appendRawMesh(
    builder,
    transformMesh(
      taubinSmoothMesh(
        sculptStreamlinedHullMesh(0.72, 0.36, 0.068, {
          noseSharpness: 0.45,
          tailTaper: 0.52,
          canopyBulge: 0.24,
          undersideFlat: 0.65,
          stations: 18,
          ringPoints: 28
        }),
        3
      ),
      { pos: [0, 0.215, -1.28], rot: [0, Math.PI, 0] }
    )
  );
  const headrestFairing = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.82, 0.235, 0.165, {
      noseSharpness: 0.42,
      tailTaper: 0.72,
      canopyBulge: 0.28,
      undersideFlat: 0.55,
      stations: 18,
      ringPoints: 28
    }),
    3
  );
  for (const sx of [-1, 1] as const) {
    appendRawMesh(
      builder,
      transformMesh(headrestFairing, { pos: [sx * 0.36, 0.228, 0.96], rot: [0.03, Math.PI, 0] })
    );
  }
  addSmoothBevelBox(builder, 0, -0.04, 2.19, 0.24, 0.085, 0.02, 1);
  // Underbody belly pan & rear aerodynamic diffuser strakes
  addSmoothBevelBox(builder, 0, -0.40, 0.0, 0.68, 0.03, 1.92, 0);
  // Strakes stay tucked under the tail (z <= 2.12, y <= -0.33) so they never hang past the ducktail as loose fins
  for (const fx of [-0.46, -0.24, 0, 0.24, 0.46]) {
    addSmoothBevelBox(builder, fx, -0.385, 1.96, 0.018, 0.045, 0.16, 1);
  }
  return toRoadsterMesh(builder);
}

function surfaceCenterYAtZ(s: RoadsterStation): number {
  const z = s.z;
  const hoodBulge = z < -0.52 && z > -1.96 ? 0.048 * Math.sin(((z + 1.96) / 1.44) * Math.PI) : 0;
  return s.cockpitCut > 0 ? s.crownY - 0.35 * s.cockpitCut : s.crownY + hoodBulge;
}

function buildStripesMesh(): RoadsterMesh {
  const b = newBuilder();
  // Contour-hugging twin ivory lacquer GT endurance stripes across the 40 smooth stations
  // Stripe height follows the real lofted ring at each x (3 columns per stripe) so the curved deck never pokes through
  const ringYAt = (st: RoadsterStation, x: number): number => {
    const ring = stationRing(st);
    const ax = Math.abs(x);
    const mid = (ring.length - 1) / 2;
    for (let i = mid; i < ring.length - 1; i++) {
      const p0 = ring[i]!, p1 = ring[i + 1]!;
      if (ax >= p0[0] && ax <= p1[0]) return p0[1] + (p1[1] - p0[1]) * ((ax - p0[0]) / (p1[0] - p0[0] || 1));
    }
    return surfaceCenterYAtZ(st);
  };
  const addStripeRun = (zMin: number, zMax: number): void => {
    const indicesInRange: number[] = [];
    for (let i = 0; i < STATIONS.length; i++) {
      const z = STATIONS[i]!.z;
      if (z >= zMin - 1e-4 && z <= zMax + 1e-4) indicesInRange.push(i);
    }
    const cols = 3;
    for (let k = 0; k < indicesInRange.length - 1; k++) {
      const s0 = STATIONS[indicesInRange[k]!]!, s1 = STATIONS[indicesInRange[k + 1]!]!;
      for (const sx of [-1, 1] as const) {
        for (let c = 0; c < cols; c++) {
          const xa = sx * (0.045 + (0.17 * c) / cols), xb = sx * (0.045 + (0.17 * (c + 1)) / cols);
          const pa0: V3 = [xa, ringYAt(s0, xa) + 0.006, s0.z], pa1: V3 = [xa, ringYAt(s1, xa) + 0.006, s1.z];
          const pb0: V3 = [xb, ringYAt(s0, xb) + 0.006, s0.z], pb1: V3 = [xb, ringYAt(s1, xb) + 0.006, s1.z];
          if (sx > 0) addQuad(b, pa0, pa1, pb1, pb0);
          else addQuad(b, pb0, pb1, pa1, pa0);
        }
      }
    }
  };
  addStripeRun(-2.16, -0.58); // Nose & power-dome hood up to windscreen cowl
  addStripeRun(0.86, 2.20); // Rear coaming decklid out to Kammback ducktail
  // Crisp ivory rear touring license plate & smooth enameled nose roundel badge
  addSmoothBevelBox(b, 0, -0.04, 2.228, 0.19, 0.062, 0.008, 1);
  addEllipsoid(b, [0, -0.01, -2.185], [0.048, 0.022, 0.032], 28, 18);
  return toRoadsterMesh(b);
}

function buildChromeMesh(): RoadsterMesh {
  const b = newBuilder();
  // Sculpted streamlined torpedo mirror shell (`28` ring points x `16` stations)
  const bulletMirrorShell = taubinSmoothMesh(
    sculptStreamlinedHullMesh(0.23, 0.108, 0.096, {
      noseSharpness: 0.64,
      tailTaper: 0.28,
      canopyBulge: 0.18,
      undersideFlat: 0.12,
      stations: 16,
      ringPoints: 28
    }),
    3
  );

  for (const sx of [-1, 1] as const) {
    // Smooth curved split front chrome bumpers + sculpted overrider guards
    const frontBumperSpline = catmullRomSpline3(
      [
        [sx * 0.26, -0.22, -2.255],
        [sx * 0.54, -0.22, -2.21],
        [sx * 0.74, -0.22, -2.14],
        [sx * 0.87, -0.22, -1.98]
      ],
      6
    );
    appendRawMesh(b, tubeSweepMesh(frontBumperSpline.map((p): V4 => [p[0], p[1], p[2], 0.027]), 20, true));
    addSmoothBevelBox(b, sx * 0.48, -0.20, -2.24, 0.026, 0.068, 0.032, 1);

    // Sleek low-slung twin classic GT chrome roll hoops (`24` arch steps x `18` radial segs)
    const hoopPts: V4[] = [];
    const hoopSteps = 24;
    for (let h = 0; h <= hoopSteps; h++) {
      const a = (h / hoopSteps) * Math.PI;
      const cx = sx * 0.36, rx = 0.135, baseY = 0.16, ry = 0.195;
      hoopPts.push([cx - Math.cos(a) * rx, baseY + Math.sin(a) * ry, 0.56 - Math.sin(a) * 0.025, 0.019]);
    }
    appendRawMesh(b, tubeSweepMesh(hoopPts, 18, true));
    addTube(b, [sx * 0.36, 0.34, 0.545], [sx * 0.36, 0.18, 0.78], 0.014, 0.013, 16, true);
  }

  // Classic oval GT front grille bezel (`36` perimeter steps x `16` radial segs) + chrome egg-crate slats
  const gZ = -2.235, gY = -0.18, gW = 0.44, gH = 0.105;
  const gPts: V4[] = [];
  const gSegs = 36;
  for (let i = 0; i <= gSegs; i++) {
    const a = (i / gSegs) * Math.PI * 2;
    gPts.push([Math.cos(a) * gW, gY + Math.sin(a) * gH, gZ, 0.018]);
  }
  appendRawMesh(b, tubeSweepMesh(gPts, 16, false));
  for (const dy of [-0.045, 0, 0.045]) {
    addTube(b, [-gW * 0.88, gY + dy, gZ + 0.01], [gW * 0.88, gY + dy, gZ + 0.01], 0.009, 0.009, 12, false);
  }
  for (const dx of [-0.26, -0.13, 0, 0.13, 0.26]) {
    addTube(b, [dx, gY - gH * 0.82, gZ + 0.012], [dx, gY + gH * 0.82, gZ + 0.012], 0.007, 0.007, 12, false);
  }

  // Twin sculpted side-exhaust pipes + Scaglietti side-cove strakes + quad rear tailpipes + bullet mirrors + bezels
  for (const sx of [-1, 1] as const) {
    addTube(b, [sx * 0.94, -0.36, -0.78], [sx * 0.94, -0.36, 0.82], 0.036, 0.038, 28, true);
    addTube(b, [sx * 0.91, -0.08, -0.76], [sx * 0.87, -0.06, -0.18], 0.011, 0.008, 14, true);
    addTube(b, [sx * 0.50, -0.24, 2.13], [sx * 0.50, -0.24, 2.30], 0.042, 0.048, 28, true);
    addTube(b, [sx * 0.38, -0.24, 2.13], [sx * 0.38, -0.24, 2.29], 0.038, 0.044, 28, true);

    // Streamlined bullet torpedo fender racing mirrors
    appendRawMesh(b, transformMesh(bulletMirrorShell, { pos: [sx * 0.86, 0.25, -0.56], rot: [0, Math.PI, 0] }));
    addTube(b, [sx * 0.82, 0.16, -0.55], [sx * 0.86, 0.24, -0.56], 0.014, 0.012, 16, false);

    // Wrap-around split classic rear chrome bumpers + overriders + 32-seg headlamp & quad taillamp bezels
    const rearBumperSpline = catmullRomSpline3(
      [
        [sx * 0.28, -0.13, 2.25],
        [sx * 0.58, -0.13, 2.22],
        [sx * 0.79, -0.13, 2.18],
        [sx * 0.91, -0.13, 1.98]
      ],
      6
    );
    appendRawMesh(b, tubeSweepMesh(rearBumperSpline.map((p): V4 => [p[0], p[1], p[2], 0.029]), 20, true));
    addSmoothBevelBox(b, sx * 0.42, -0.11, 2.24, 0.026, 0.068, 0.032, 1);
    addTube(b, [sx * 0.68, 0.02, -2.145], [sx * 0.68, 0.02, -2.02], 0.118, 0.138, 32, false);
    for (const xOff of [0.64, 0.47]) {
      addTube(b, [sx * xOff, 0.09, 2.175], [sx * xOff, 0.09, 2.232], 0.076, 0.072, 32, false);
    }
  }

  // Chrome rear license-plate surround, decklid script bar & Le Mans quick-fill cap
  addSmoothBevelBox(b, 0, -0.04, 2.222, 0.205, 0.074, 0.008, 1);
  addTube(b, [-0.22, 0.14, 2.195], [0.22, 0.14, 2.195], 0.008, 0.008, 14, true);

  // Raked wrap-around chrome windscreen frame (`28` smooth arch steps x `16` radial segs)
  const wSegs = 28;
  const topRailPts: V4[] = [];
  const botRailPts: V4[] = [];
  for (let i = 0; i <= wSegs; i++) {
    const t = i / wSegs - 0.5;
    const c = 1 - 4 * t * t;
    topRailPts.push([t * 1.56 * 0.87, 0.375 + c * 0.04, -0.26 - c * 0.08, 0.014]);
    botRailPts.push([t * 1.56, 0.14 + c * 0.08, -0.50 - c * 0.16, 0.013]);
  }
  appendRawMesh(b, tubeSweepMesh(topRailPts, 16, true));
  appendRawMesh(b, tubeSweepMesh(botRailPts, 16, true));
  addTube(b, [0, 0.22, -0.66], [0, 0.415, -0.34], 0.009, 0.009, 14, false);
  addTube(b, [-0.78, 0.14, -0.50], [-0.679, 0.375, -0.26], 0.016, 0.014, 16, true);
  addTube(b, [0.78, 0.14, -0.50], [0.679, 0.375, -0.26], 0.016, 0.014, 16, true);

  // Central chrome rear-view mirror mounted on windscreen tie-rod + 28-seg Le Mans fuel filler cap
  addSmoothBevelBox(b, 0, 0.375, -0.32, 0.068, 0.022, 0.012, 1);
  addTube(b, [0.58, 0.24, 1.02], [0.58, 0.27, 1.02], 0.055, 0.052, 28, true);

  // Driver's polished aviator sunglasses brow bridge & temple arms
  addTube(b, [-0.435, 0.312, 0.182], [-0.285, 0.312, 0.182], 0.0055, 0.0055, 12, false);
  addTube(b, [-0.445, 0.308, 0.19], [-0.45, 0.304, 0.29], 0.0045, 0.004, 12, false);
  addTube(b, [-0.275, 0.308, 0.19], [-0.27, 0.304, 0.29], 0.0045, 0.004, 12, false);

  // 3 drilled aluminum steering-wheel spokes + column hub + gated shifter stalk
  const swX = -0.36, swY = 0.16, swZ = -0.24;
  addTube(b, [swX, 0.08, -0.42], [swX, swY, swZ], 0.02, 0.018, 18, true);
  for (const ang of [-0.35, Math.PI + 0.35, -Math.PI * 0.5]) {
    addTube(
      b,
      [swX, swY, swZ],
      [swX + Math.cos(ang) * 0.128, swY + Math.sin(ang) * 0.128 * 0.92, swZ - Math.sin(ang) * 0.128 * 0.38],
      0.009,
      0.008,
      14,
      false
    );
  }
  addTube(b, [0, -0.02, 0.02], [0, 0.1, -0.02], 0.009, 0.007, 16, true);
  return toRoadsterMesh(b);
}

/** Studio-sculpted SDF tan leather string-back driving glove (`[24, 24, 24]`, exact `analyticNormals: true` preserved). */
const getDrivingGloveSdfMesh = (() => {
  let cached: RawMesh | null = null;
  return (): RawMesh => {
    if (cached) return cached;
    cached = sculptOrganicSdfMesh({
      boundsMin: [-0.048, -0.042, -0.058],
      boundsMax: [0.048, 0.042, 0.068],
      resolution: [22, 20, 22],
      evaluate: (x, y, z) => {
        const p: V3 = [x, y, z];
        const palm = sdfEllipsoid(p, [0, 0, 0], [0.028, 0.024, 0.032]);
        const fingers = sdfEllipsoid(p, [0, -0.006, -0.022], [0.025, 0.020, 0.022]);
        const cuff = sdfTaperedCapsule(p, [0, -0.004, 0.014], [0, -0.008, 0.048], 0.025, 0.023);
        return sminPoly(sminPoly(palm, fingers, 0.014), cuff, 0.014);
      }
    });
    return cached;
  };
})();

/** Quilted saddle-tan Italian leather bucket seats, sculpted bolsters, door cards & SDF leather driving gloves. */
function buildSeatsMesh(): RoadsterMesh {
  const b = newBuilder();
  for (const sx of [-1, 1] as const) {
    const cx = sx * 0.36;
    // Contoured seat base + 4 quilted horizontal cushion pleats + sculpted thigh & backrest bolsters
    addSmoothBevelBox(b, cx, -0.17, 0.2, 0.19, 0.042, 0.22, 1);
    for (let p = 0; p < 4; p++) {
      addSmoothBevelBox(b, cx, -0.122, 0.04 + p * 0.095, 0.145, 0.018, 0.038, 1);
    }
    for (const bx of [-0.175, 0.175]) {
      addSmoothBevelBox(b, cx + bx, -0.11, 0.19, 0.032, 0.045, 0.21, 1);
      addSmoothBevelBox(b, cx + bx * 0.95, 0.07, 0.42, 0.034, 0.19, 0.055, 1);
    }
    // Contoured pleated seat backrest + sculpted leather headrest cushion
    addSmoothBevelBox(b, cx, 0.06, 0.45, 0.185, 0.19, 0.045, 1);
    for (let r = 0; r < 4; r++) {
      addSmoothBevelBox(b, cx, -0.07 + r * 0.075, 0.405, 0.135, 0.03, 0.018, 1);
    }
    addEllipsoid(b, [cx, 0.23, 0.47], [0.115, 0.062, 0.048], 28, 18);
  }
  // Studio-sculpted SDF tan leather string-back driving gloves gripping the steering wheel (`analyticNormals: true` preserved!)
  const gloveSdf = getDrivingGloveSdfMesh();
  appendRawMesh(b, transformMesh(gloveSdf, { pos: [-0.485, 0.195, -0.25], rot: [0.22, -0.14, 0] }));
  appendRawMesh(b, transformMesh(gloveSdf, { pos: [-0.235, 0.195, -0.25], rot: [0.22, 0.14, 0] }));

  // Tan leather door-top armrests, inner door cards, rear cockpit coaming bolster & center console pad
  for (const sx of [-1, 1] as const) {
    addSmoothBevelBox(b, sx * 0.72, 0.09, 0.12, 0.048, 0.032, 0.38, 1);
    addSmoothBevelBox(b, sx * 0.67, -0.04, 0.12, 0.026, 0.12, 0.36, 1);
  }
  addSmoothBevelBox(b, 0, 0.145, 0.565, 0.66, 0.032, 0.055, 1);
  addSmoothBevelBox(b, 0, -0.02, 0.14, 0.095, 0.028, 0.42, 1);
  return toRoadsterMesh(b);
}

/** Studio-sculpted driver head & neck (`palette.driverSkin`, `clearcoat: 0`). */
function buildDriverSkinMesh(): RoadsterMesh {
  const b = newBuilder();
  // Smooth anatomical neck rising from racing jacket collar
  appendRawMesh(
    b,
    sculptAnatomicalLimbMesh(
      [
        { pos: [-0.36, 0.175, 0.282], rx: 0.048, rz: 0.050 },
        { pos: [-0.36, 0.225, 0.275], rx: 0.043, rz: 0.045 },
        { pos: [-0.36, 0.268, 0.268], rx: 0.041, rz: 0.043 }
      ],
      { ringPoints: 28, capEnds: true }
    )
  );
  // Studio-sculpted stylized head (`rot: [0, Math.PI, 0]` points nose/brow forward `-Z`)
  const head = taubinSmoothMesh(
    sculptStylizedHeadMesh(0.096, {
      jawTaper: 0.24,
      cheekFullness: 0.20,
      noseBridge: 0.20,
      browRidge: 0.18,
      subdivisions: 2,
      seed: 22
    }),
    3
  );
  appendRawMesh(b, transformMesh(head, { pos: [-0.36, 0.296, 0.265], rot: [0.04, Math.PI, 0] }));
  return toRoadsterMesh(b);
}

/** Studio-sculpted windswept chestnut hair mantle & 7 curved locks (`palette.driverHair`, `clearcoat: 0` — zero wood lacquer!). */
function buildDriverHairMesh(): RoadsterMesh {
  const b = newBuilder();
  const crownSdf = sculptOrganicSdfMesh({
    boundsMin: [-0.135, -0.085, -0.115],
    boundsMax: [0.135, 0.115, 0.145],
    resolution: [22, 20, 22],
    evaluate: (x, y, z) => {
      const p: V3 = [x, y, z];
      const cap = sdfEllipsoid(p, [0, 0.012, 0.012], [0.100, 0.082, 0.108]);
      const sideSweepL = sdfEllipsoid(p, [-0.058, -0.004, 0.025], [0.052, 0.058, 0.078]);
      const sideSweepR = sdfEllipsoid(p, [0.058, -0.004, 0.025], [0.052, 0.058, 0.078]);
      const faceCut = sdfEllipsoid(p, [0, -0.042, -0.042], [0.086, 0.082, 0.084]);
      const merged = sminPoly(sminPoly(cap, sideSweepL, 0.024), sideSweepR, 0.024);
      return Math.max(merged, -faceCut);
    }
  });
  appendRawMesh(b, transformMesh(crownSdf, { pos: [-0.36, 0.326, 0.272] }));

  // 7 compound-curved windswept locks streaming cleanly into the coastal slipstream (`z: 0.25 -> 0.45`)
  const locks: readonly { root: V3; mid: V3; tip: V3; w: number }[] = [
    { root: [-0.415, 0.332, 0.265], mid: [-0.432, 0.338, 0.355], tip: [-0.438, 0.316, 0.440], w: 0.064 },
    { root: [-0.392, 0.350, 0.262], mid: [-0.402, 0.358, 0.360], tip: [-0.406, 0.334, 0.455], w: 0.070 },
    { root: [-0.368, 0.358, 0.260], mid: [-0.370, 0.366, 0.368], tip: [-0.372, 0.342, 0.462], w: 0.074 },
    { root: [-0.342, 0.355, 0.262], mid: [-0.338, 0.362, 0.362], tip: [-0.334, 0.338, 0.456], w: 0.072 },
    { root: [-0.316, 0.342, 0.265], mid: [-0.304, 0.348, 0.355], tip: [-0.296, 0.324, 0.442], w: 0.066 },
    { root: [-0.388, 0.302, 0.300], mid: [-0.398, 0.300, 0.375], tip: [-0.402, 0.284, 0.442], w: 0.062 },
    { root: [-0.332, 0.302, 0.300], mid: [-0.322, 0.300, 0.375], tip: [-0.318, 0.284, 0.442], w: 0.062 }
  ];
  for (const l of locks) {
    appendRawMesh(
      b,
      sculptCurvedHairLockMesh({
        root: l.root,
        mid: l.mid,
        tip: l.tip,
        width: l.w,
        thickness: l.w * 0.68,
        radialSegments: 20,
        segments: 14
      })
    );
  }
  return toRoadsterMesh(b);
}

/** Hand-turned Nardi-style mahogany wood steering wheel rim, lathed gearshift knob & dashboard wood fascia. */
function buildWoodMesh(): RoadsterMesh {
  const b = newBuilder();
  const swX = -0.36, swY = 0.16, swZ = -0.24;
  const swSegs = 36, swR = 0.138;
  const rimPts: V4[] = [];
  for (let i = 0; i <= swSegs; i++) {
    const a = (i / swSegs) * Math.PI * 2;
    rimPts.push([swX + Math.cos(a) * swR, swY + Math.sin(a) * swR * 0.92, swZ - Math.sin(a) * swR * 0.38, 0.015]);
  }
  appendRawMesh(b, tubeSweepMesh(rimPts, 18, false));

  // Turned mahogany shift knob (`28`-seg lathe) on center tunnel + sculpted dashboard trim fascia
  const knobProfile: V2[] = [
    [0.008, -0.026],
    [0.016, -0.014],
    [0.025, 0.002],
    [0.024, 0.016],
    [0.015, 0.024],
    [0.0, 0.027]
  ];
  appendRawMesh(b, transformMesh(latheMesh(knobProfile, 28, false), { pos: [0, 0.115, -0.025], rot: [-0.22, 0, 0] }));
  addSmoothBevelBox(b, 0.22, 0.09, -0.305, 0.26, 0.032, 0.012, 1);
  return toRoadsterMesh(b);
}

function buildCockpitMesh(): RoadsterMesh {
  const b = newBuilder();
  // Dark recessed cabin floor tub, carpeted transmission tunnel & rear bulkhead
  addSmoothBevelBox(b, 0, -0.24, 0.10, 0.62, 0.04, 0.52, 0);
  addSmoothBevelBox(b, 0, -0.12, 0.10, 0.11, 0.10, 0.50, 1);
  addSmoothBevelBox(b, 0, 0.02, 0.58, 0.64, 0.22, 0.05, 1);
  // Sculpted dashboard cowl + twin 28-seg driver binnacle gauge pods
  addSmoothBevelBox(b, 0, 0.08, -0.44, 0.64, 0.11, 0.14, 1);
  for (const gx of [-0.43, -0.29]) {
    addTube(b, [gx, 0.16, -0.46], [gx, 0.16, -0.34], 0.048, 0.046, 28, true);
  }
  // Driver tailored charcoal racing jacket torso (`sculptDrapedGarmentMesh`, 28 radial pts) & articulated arms (`sculptHumanoidLimbMesh`, 28 radial pts)
  appendRawMesh(
    b,
    transformMesh(
      sculptDrapedGarmentMesh(
        [
          { y: -0.125, rx: 0.146, rz: 0.112, folds: 6, foldAmp: 0.032, superellipseN: 2.15 },
          { y: 0.025, rx: 0.156, rz: 0.110, z: -0.008, folds: 5, foldAmp: 0.024, superellipseN: 2.12 },
          { y: 0.148, rx: 0.168, rz: 0.108, z: -0.014, superellipseN: 2.08 },
          { y: 0.195, rx: 0.088, rz: 0.084, z: -0.018, superellipseN: 2.0 }
        ],
        { ringPoints: 28, capEnds: true, smoothPasses: 3 }
      ),
      { pos: [-0.36, 0, 0.28], rot: [0.08, 0, 0] }
    )
  );
  for (const side of [-1, 1] as const) {
    const shX = -0.36 + side * 0.145;
    const elX = -0.36 + side * 0.155;
    const wrX = -0.36 + side * 0.125;
    appendRawMesh(
      b,
      sculptHumanoidLimbMesh(
        [
          [shX, 0.142, 0.25, 0.046],
          [elX, 0.162, 0.01, 0.039],
          [wrX, 0.192, -0.22, 0.030]
        ],
        28,
        0.08
      )
    );
  }
  // Driver's dark wraparound aviator/wayfarer sunglasses lenses (`24x16`, facing `-Z`)
  addEllipsoid(b, [-0.402, 0.304, 0.174], [0.038, 0.024, 0.016], 24, 16);
  addEllipsoid(b, [-0.318, 0.304, 0.174], [0.038, 0.024, 0.016], 24, 16);
  // Dark recessed front grille mesh backing, Kammback rear tail fascia & deep 28-seg wheel-well arch liners
  addSmoothBevelBox(b, 0, -0.18, -2.21, 0.41, 0.09, 0.015, 0);
  addSmoothBevelBox(b, 0, 0.08, 2.185, 0.74, 0.095, 0.018, 1);
  for (const sx of [-1, 1] as const) {
    addEllipsoid(b, [sx * 0.68, 0.02, -2.06], [0.116, 0.116, 0.06], 28, 18);
    for (const wz of [ROADSTER_FRONT_Z, ROADSTER_REAR_Z]) {
      addTube(b, [sx * 0.68, -0.24, wz], [sx * 0.95, -0.24, wz], ROADSTER_WHEEL_RADIUS * 1.08, ROADSTER_WHEEL_RADIUS * 1.08, 28, true);
    }
  }
  return toRoadsterMesh(b);
}

function buildGlassMesh(): RoadsterMesh {
  const b = newBuilder();
  // Smooth compound-curved wrap-around speedster windscreen (`28` arch columns with continuous analytic vertex normals!)
  const cols = 28;
  const sampleArch = (u: number, v: number, zOffset: number): V3 => {
    const t = u - 0.5;
    const curve = 1 - 4 * t * t;
    const bx = t * 1.56;
    const tx = bx * 0.87;
    const bY = 0.14 + curve * 0.08;
    const tY = 0.37 + curve * 0.04;
    const bZ = -0.50 - curve * 0.16 + zOffset;
    const tZ = -0.26 - curve * 0.08 + zOffset;
    return [bx + (tx - bx) * v, bY + (tY - bY) * v, bZ + (tZ - bZ) * v];
  };
  const addShellFace = (zOffset: number, flip: boolean): void => {
    const base = b.positions.length / 3;
    for (let r = 0; r <= 2; r++) {
      const v = r / 2;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols;
        const p = sampleArch(u, v, zOffset);
        const pL = sampleArch(Math.max(0, u - 0.01), v, zOffset);
        const pR = sampleArch(Math.min(1, u + 0.01), v, zOffset);
        const pD = sampleArch(u, Math.max(0, v - 0.02), zOffset);
        const pU = sampleArch(u, Math.min(1, v + 0.02), zOffset);
        const du: V3 = [pR[0] - pL[0], pR[1] - pL[1], pR[2] - pL[2]];
        const dv: V3 = [pU[0] - pD[0], pU[1] - pD[1], pU[2] - pD[2]];
        // du (+X) cross dv (+Y/+Z) points toward -Z/+Y (forward-up outward normal)
        const sign = flip ? -1 : 1;
        const n = norm3(
          (du[1] * dv[2] - du[2] * dv[1]) * sign,
          (du[2] * dv[0] - du[0] * dv[2]) * sign,
          (du[0] * dv[1] - du[1] * dv[0]) * sign
        );
        b.positions.push(p[0], p[1], p[2]);
        b.normals.push(n[0], n[1], n[2]);
        b.uvs.push(u, v);
      }
    }
    const stride = cols + 1;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const a = base + r * stride + c, d = a + stride;
        if (!flip) b.indices.push(a, a + 1, d + 1, a, d + 1, d);
        else b.indices.push(a, d + 1, a + 1, a, d, d + 1);
      }
    }
  };
  addShellFace(0, false);
  addShellFace(0.006, true);
  return toRoadsterMesh(b);
}

function buildHeadlampsMesh(): RoadsterMesh {
  const b = newBuilder();
  for (const sx of [-1, 1] as const) {
    addEllipsoid(b, [sx * 0.68, 0.02, -2.12], [0.108, 0.108, 0.055], 32, 20);
    // Amber/warm fog driving lamps flanking the oval grille
    addEllipsoid(b, [sx * 0.49, -0.17, -2.21], [0.052, 0.052, 0.03], 28, 16);
  }
  return toRoadsterMesh(b);
}

function buildTaillampsMesh(): RoadsterMesh {
  const b = newBuilder();
  // Quad circular ruby-red GT brake / afterburner lenses (`32` radial segs)
  for (const sx of [-1, 1] as const) {
    for (const xOff of [0.64, 0.47]) {
      addTube(b, [sx * xOff, 0.09, 2.18], [sx * xOff, 0.09, 2.235], 0.068, 0.062, 32, true);
    }
  }
  return toRoadsterMesh(b);
}

/** Smooth rounded-shoulder vintage radial tire centred at `(0, 0, 0)` with axle along X (`36` radial segs x `15` smooth profile stations). */
function buildWheelTireMesh(): RoadsterMesh {
  const b = newBuilder();
  const rOuter = ROADSTER_WHEEL_RADIUS;
  const rRim = rOuter * 0.60;
  const hw = ROADSTER_WHEEL_WIDTH * 0.5;
  const ctrlProfile: readonly V3[] = [
    [-hw * 0.82, rRim, 0],
    [-hw * 0.96, rRim + (rOuter - rRim) * 0.28, 0],
    [-hw, rRim + (rOuter - rRim) * 0.56, 0],
    [-hw * 0.90, rOuter * 0.94, 0],
    [-hw * 0.52, rOuter * 0.995, 0],
    [0, rOuter, 0],
    [hw * 0.52, rOuter * 0.995, 0],
    [hw * 0.90, rOuter * 0.94, 0],
    [hw, rRim + (rOuter - rRim) * 0.56, 0],
    [hw * 0.96, rRim + (rOuter - rRim) * 0.28, 0],
    [hw * 0.82, rRim, 0]
  ];
  const smoothProfile = catmullRomSpline3(ctrlProfile, 2);
  const segs = 36;
  const rows = smoothProfile.length;
  const base = b.positions.length / 3;
  for (let r = 0; r < rows; r++) {
    const [x, rad] = smoothProfile[r]!;
    const prev = smoothProfile[Math.max(0, r - 1)]!, next = smoothProfile[Math.min(rows - 1, r + 1)]!;
    const tx = next[0] - prev[0], tr = next[1] - prev[1];
    const nx2 = -tr, nr2 = tx;
    for (let s = 0; s <= segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      b.positions.push(x, cs * rad, sn * rad);
      const n = norm3(nx2, cs * nr2, sn * nr2);
      b.normals.push(n[0], n[1], n[2]);
      b.uvs.push(s / segs, r / (rows - 1));
    }
  }
  const stride = segs + 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = base + r * stride + s, d = a + stride;
      b.indices.push(a, a + 1, d, a + 1, d + 1, d);
    }
  }
  return toRoadsterMesh(b);
}

/** Deep-dish chrome rim (`32` radial segs), 18 crossed Borrani wire spokes & 3-ear knock-off spinner (`outSign` = `-1` left, `+1` right). */
function buildWheelRimMesh(outSign: -1 | 1): RoadsterMesh {
  const b = newBuilder();
  const rRim = ROADSTER_WHEEL_RADIUS * 0.62;
  const hw = ROADSTER_WHEEL_WIDTH * 0.42;
  // Stepped deep-dish outer rim lip, rolled bead flange & recessed inner barrel
  addTube(b, [outSign * hw * 0.56, 0, 0], [outSign * hw * 0.98, 0, 0], rRim * 0.93, rRim * 1.01, 32, false);
  addTube(b, [-hw * outSign * 0.85, 0, 0], [outSign * hw * 0.56, 0, 0], rRim * 0.84, rRim * 0.89, 32, true);
  // Central splined hub + twin spoke flanges + 3-ear Borrani knock-off spinner
  addTube(b, [outSign * hw * 0.10, 0, 0], [outSign * hw * 1.06, 0, 0], 0.068, 0.038, 28, true);
  addTube(b, [outSign * hw * 0.68, 0, 0], [outSign * hw * 0.78, 0, 0], 0.078, 0.072, 28, true);
  for (let e = 0; e < 3; e++) {
    const ea = (e / 3) * Math.PI * 2;
    addTube(
      b,
      [outSign * hw * 0.93, 0, 0],
      [outSign * hw * 1.01, Math.cos(ea) * 0.094, Math.sin(ea) * 0.094],
      0.016,
      0.008,
      14,
      true
    );
  }
  // 18 finely laced crossed wire spokes from inner/outer hub flanges to rim bead
  const spokes = 18;
  for (let i = 0; i < spokes; i++) {
    const th = (i / spokes) * Math.PI * 2;
    const tang = th + ((i & 1) === 0 ? 0.28 : -0.28);
    const y = Math.cos(tang) * (rRim * 0.93), z = Math.sin(tang) * (rRim * 0.93);
    const hubX = outSign * hw * ((i & 1) === 0 ? 0.74 : 0.20);
    const rimX = outSign * hw * ((i & 1) === 0 ? 0.90 : 0.60);
    addTube(b, [hubX, Math.cos(th) * 0.058, Math.sin(th) * 0.058], [rimX, y, z], 0.009, 0.0075, 12, false);
  }
  return toRoadsterMesh(b);
}

/** Ventilated machined-steel brake rotor disc (`32` radial segs) & smooth-beveled caliper centered on wheel axle. */
function buildWheelRotorMesh(): RoadsterMesh {
  const b = newBuilder();
  const rRotor = ROADSTER_WHEEL_RADIUS * 0.46;
  addTube(b, [-0.018, 0, 0], [0.018, 0, 0], rRotor, rRotor, 32, true);
  addSmoothBevelBox(b, 0, rRotor * 0.62, -rRotor * 0.36, 0.036, 0.052, 0.065, 1);
  return toRoadsterMesh(b);
}

export interface RoadsterRigGeometries {
  readonly body: RoadsterMesh;
  readonly stripes: RoadsterMesh;
  readonly chrome: RoadsterMesh;
  readonly seats: RoadsterMesh;
  readonly driverSkin: RoadsterMesh;
  readonly driverHair: RoadsterMesh;
  readonly wood: RoadsterMesh;
  readonly cockpit: RoadsterMesh;
  readonly glass: RoadsterMesh;
  readonly headlamps: RoadsterMesh;
  readonly taillamps: RoadsterMesh;
  readonly wheelTire: RoadsterMesh;
  readonly wheelRimLeft: RoadsterMesh;
  readonly wheelRimRight: RoadsterMesh;
  readonly wheelRotor: RoadsterMesh;
}

let cachedRig: RoadsterRigGeometries | null = null;

export function getRoadsterRigGeometries(): RoadsterRigGeometries {
  if (!cachedRig) {
    cachedRig = {
      body: buildBodyMesh(),
      stripes: buildStripesMesh(),
      chrome: buildChromeMesh(),
      seats: buildSeatsMesh(),
      driverSkin: buildDriverSkinMesh(),
      driverHair: buildDriverHairMesh(),
      wood: buildWoodMesh(),
      cockpit: buildCockpitMesh(),
      glass: buildGlassMesh(),
      headlamps: buildHeadlampsMesh(),
      taillamps: buildTaillampsMesh(),
      wheelTire: buildWheelTireMesh(),
      wheelRimLeft: buildWheelRimMesh(-1),
      wheelRimRight: buildWheelRimMesh(1),
      wheelRotor: buildWheelRotorMesh()
    };
  }
  return cachedRig;
}

/* ---- Exact "ZYX" Quaternion / Euler composition matching Aura3D `node.setRotation([rx, ry, rz])` (`R = Rz * Ry * Rx`) ---- */

export type Quat = readonly [number, number, number, number]; // [x, y, z, w]

/**
 * Exact intrinsic `"ZYX"` quaternion composition (`R = Rz(rz) * Ry(ry) * Rx(rx)`, `q = qz * qy * qx`),
 * matching `@aura3d/scene` `node.setRotation([rx, ry, rz])`.
 */
export function quaternionFromEulerZYX(rx: number, ry: number, rz: number): Quat {
  const cx = Math.cos(rx * 0.5), sx = Math.sin(rx * 0.5);
  const cy = Math.cos(ry * 0.5), sy = Math.sin(ry * 0.5);
  const cz = Math.cos(rz * 0.5), sz = Math.sin(rz * 0.5);
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy *cz,
    cx * cy * cz + sx * sy * sz
  ];
}

export function quatMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

export function quatRotateVec(q: Quat, v: V3): [number, number, number] {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx)
  ];
}

/**
 * Exact intrinsic `"ZYX"` Euler extraction (`R = Rz(rz) * Ry(ry) * Rx(rx)`) from unit quaternion `q = [x, y, z, w]`:
 * `m20 = -sin(ry)`, `cy = hypot(m00, m10) = cos(ry)`, `ry = atan2(-m20, cy)`,
 * `rx = atan2(m21, m22)`, `rz = atan2(m10, m00)` with gimbal-lock fallback when `cy <= 1e-7`.
 */
export function quaternionToEulerZYX(q: Quat): [number, number, number] {
  const [x, y, z, w] = q;
  const m00 = 1 - 2 * (y * y + z * z);
  const m01 = 2 * (x * y - z * w);
  const m10 = 2 * (x * y + z * w);
  const m11 = 1 - 2 * (x * x + z * z);
  const m20 = 2 * (x * z - y * w);
  const m21 = 2 * (y * z + x * w);
  const m22 = 1 - 2 * (x * x + y * y);
  const cy = Math.hypot(m00, m10);
  const ry = Math.atan2(-m20, cy);
  if (cy > 1e-7) {
    return [Math.atan2(m21, m22), ry, Math.atan2(m10, m00)];
  }
  return [0, ry, Math.atan2(-m01, m11)];
}

/**
 * Composeschassis local pitch & bank inside world heading yaw (`R_world = Ry(yaw) * Rz(roll) * Rx(pitch)`)
 * and returns `"ZYX"` Euler angles `[rx, ry, rz]` for `node.setRotation`.
 */
export function composeChassisEuler(pitch: number, yaw: number, roll: number): [number, number, number] {
  const qYaw = quaternionFromEulerZYX(0, yaw, 0);
  const qBankPitch = quatMul(quaternionFromEulerZYX(0, 0, roll), quaternionFromEulerZYX(pitch, 0, 0));
  return quaternionToEulerZYX(quatMul(qYaw, qBankPitch));
}

/**
 * Composes `"ZYX"` Euler angles `[rx, ry, rz]` for a wheel with world heading `yaw`, axle spin `roll` (around hub `+X`),
 * steering `steer` (around `+Y`), and `camber` (around `+Z`): `R_world = Ry(yaw) * Ry(steer) * Rz(camber) * Rx(roll)`.
 */
export function composeWheelEuler(yaw: number, roll: number, steer = 0, camber = 0): [number, number, number] {
  const qYawSteer = quaternionFromEulerZYX(0, yaw + steer, 0);
  const qCamberSpin = quatMul(quaternionFromEulerZYX(0, 0, camber), quaternionFromEulerZYX(roll, 0, 0));
  return quaternionToEulerZYX(quatMul(qYawSteer, qCamberSpin));
}

/**
 * Computes world position, spinning wheel `"ZYX"` Euler rotation, and non-spinning knuckle `"ZYX"` Euler rotation
 * given chassis pose `[pitch, yaw, roll]`, wheel local offset, steering yaw (around chassis +Y), rolling spin
 * (forward `-Z` travel -> `-spinAngle` around hub axle `+X`), and optional camber (around knuckle `+Z`).
 */
export function computeWheelWorldPose(
  carPos: V3,
  chassisEuler: V3,
  localOffset: V3,
  steerYaw: number,
  spinAngle: number,
  camber = 0
): {
  readonly position: [number, number, number];
  readonly rotation: [number, number, number];
  readonly knuckleRotation: [number, number, number];
} {
  const qChassis = quatMul(
    quaternionFromEulerZYX(0, chassisEuler[1], 0),
    quatMul(quaternionFromEulerZYX(0, 0, chassisEuler[2]), quaternionFromEulerZYX(chassisEuler[0], 0, 0))
  );
  const off = quatRotateVec(qChassis, localOffset);
  const qKnuckle = quatMul(
    qChassis,
    quatMul(quaternionFromEulerZYX(0, steerYaw, 0), quaternionFromEulerZYX(0, 0, camber))
  );
  const qSpin = quaternionFromEulerZYX(-spinAngle, 0, 0);
  const qWorld = quatMul(qKnuckle, qSpin);
  return {
    position: [carPos[0] + off[0], carPos[1] + off[1], carPos[2] + off[2]],
    rotation: quaternionToEulerZYX(qWorld),
    knuckleRotation: quaternionToEulerZYX(qKnuckle)
  };
}
