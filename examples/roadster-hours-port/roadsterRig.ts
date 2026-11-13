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

function addBox(b: Builder, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
  const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
  addQuad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
  addQuad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
  addQuad(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
  addQuad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  addQuad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  addQuad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
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

/** Smooth-shaded ellipsoid / dome for helmets, headlamps and bullet mirrors. */
function addEllipsoid(b: Builder, c: V3, r: V3, uSegs = 14, vSegs = 10, hemiOnly = false): void {
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

const STATIONS: readonly RoadsterStation[] = (() => {
  const out: RoadsterStation[] = [];
  for (let i = 0; i < KEY_STATIONS.length - 1; i++) {
    const a = KEY_STATIONS[i]!, b = KEY_STATIONS[i + 1]!;
    out.push(a);
    out.push(lerpStation(a, b, 0.5));
  }
  out.push(KEY_STATIONS[KEY_STATIONS.length - 1]!);
  return out;
})();

/** Cross-section profile from -X to +X (19 points across, smooth sculpted pontoon fenders & side coves, strictly symmetrical). */
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
  const halfPts: readonly [number, number][] = [
    [0.0, centerY],
    [0.16, centerY * 0.72 + innerRimY * 0.28],
    [0.32, innerRimY],
    [rimW, valleyY],
    [(rimW + s.shoulderW) * 0.5, (valleyY + fenderCrest) * 0.52 - lampPocket * 0.7],
    [s.shoulderW, fenderCrest - lampPocket],
    [(s.shoulderW + s.halfW) * 0.5, fenderCrest * 0.84 + skirtY * 0.16],
    [s.halfW - coveIn * 0.45, (fenderCrest + skirtY) * 0.55],
    [s.halfW - coveIn, skirtY + 0.055],
    [s.halfW * 0.78, -0.41 + s.wellCut * 0.14]
  ];
  const full: V3[] = [];
  for (let i = halfPts.length - 1; i >= 1; i--) full.push([-halfPts[i]![0], halfPts[i]![1], z]);
  for (let i = 0; i < halfPts.length; i++) full.push([halfPts[i]![0], halfPts[i]![1], z]);
  return full;
}

function buildBodyMesh(): RoadsterMesh {
  const rows = STATIONS.length;
  const rings = STATIONS.map(stationRing);
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
      // +X cross +Z = -Y, so +Z cross +X = +Y (outward top normal!)
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
  // Close nose & Kammback tail panels + flat aerodynamic undertray
  const frontRing = rings[0]!, rearRing = rings[rows - 1]!;
  const fCenter = builder.positions.length / 3;
  builder.positions.push(0, -0.19, STATIONS[0]!.z - 0.03);
  builder.normals.push(0, 0, -1);
  builder.uvs.push(0.5, 0.5);
  for (let c = 0; c < cols; c++) {
    const p = frontRing[c]!;
    builder.positions.push(p[0], p[1], p[2]);
    builder.normals.push(0, 0.08, -0.996);
    builder.uvs.push(c / (cols - 1), 0);
  }
  for (let c = 0; c < cols - 1; c++) builder.indices.push(fCenter, fCenter + 1 + c + 1, fCenter + 1 + c);

  const rCenter = builder.positions.length / 3;
  builder.positions.push(0, -0.03, STATIONS[rows - 1]!.z + 0.02);
  builder.normals.push(0, 0, 1);
  builder.uvs.push(0.5, 0.5);
  for (let c = 0; c < cols; c++) {
    const p = rearRing[c]!;
    builder.positions.push(p[0], p[1], p[2]);
    builder.normals.push(0, 0.05, 0.998);
    builder.uvs.push(c / (cols - 1), 1);
  }
  for (let c = 0; c < cols - 1; c++) builder.indices.push(rCenter, rCenter + 1 + c, rCenter + 1 + c + 1);

  // Hood air-intake bulge lip & sculpted twin aerodynamic Le Mans headrest fairings behind roll hoops
  addBox(builder, 0, 0.225, -1.28, 0.20, 0.022, 0.34);
  for (const sx of [-1, 1] as const) {
    addTube(builder, [sx * 0.36, 0.255, 0.58], [sx * 0.36, 0.23, 1.36], 0.118, 0.028, 12, true);
  }
  addBox(builder, 0, -0.04, 2.19, 0.24, 0.085, 0.02);
  // Underbody belly pan & rear aerodynamic diffuser strakes
  addBox(builder, 0, -0.40, 0.0, 0.68, 0.03, 1.92);
  for (const fx of [-0.46, -0.24, 0, 0.24, 0.46]) {
    addBox(builder, fx, -0.34, 2.04, 0.018, 0.075, 0.24);
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
  // Contour-hugging twin ivory lacquer GT endurance stripes across the sculpted hood & Kammback rear decklid
  const addStripeRun = (sFrom: number, sTo: number): void => {
    for (let i = sFrom; i < sTo; i++) {
      const s0 = STATIONS[i]!, s1 = STATIONS[i + 1]!;
      const y0 = surfaceCenterYAtZ(s0) + 0.006, y1 = surfaceCenterYAtZ(s1) + 0.006;
      for (const sx of [-1, 1] as const) {
        const inX = sx * 0.045, outX = sx * 0.215;
        if (sx > 0) {
          addQuad(b, [inX, y0, s0.z], [inX, y1 - 0.002, s1.z], [outX, y1 - 0.008, s1.z], [outX, y0 - 0.008, s0.z]);
        } else {
          addQuad(b, [outX, y0 - 0.008, s0.z], [outX, y1 - 0.008, s1.z], [inX, y1 - 0.002, s1.z], [inX, y0, s0.z]);
        }
      }
    }
  };
  addStripeRun(1, 10); // Nose & power-dome hood up to windscreen cowl
  addStripeRun(17, STATIONS.length - 1); // Rear coaming decklid out to Kammback ducktail
  // Crisp ivory rear touring license plate & enameled nose roundel badge
  addBox(b, 0, -0.04, 2.222, 0.19, 0.062, 0.008);
  addEllipsoid(b, [0, -0.01, -2.18], [0.048, 0.022, 0.032], 10, 6);
  return toRoadsterMesh(b);
}

function buildChromeMesh(): RoadsterMesh {
  const b = newBuilder();
  // Crisp classic split front chrome bumpers + vertical overrider guards
  for (const sx of [-1, 1] as const) {
    addTube(b, [sx * 0.26, -0.22, -2.25], [sx * 0.72, -0.22, -2.16], 0.028, 0.026, 10, true);
    addTube(b, [sx * 0.72, -0.22, -2.16], [sx * 0.86, -0.22, -1.98], 0.026, 0.022, 8, true);
    addBox(b, sx * 0.48, -0.20, -2.24, 0.026, 0.068, 0.032);
    // Sleek low-slung twin classic GT chrome roll hoops curving behind driver & passenger headrests
    const hoopSegs = 10;
    for (let h = 0; h < hoopSegs; h++) {
      const a0 = (h / hoopSegs) * Math.PI, a1 = ((h + 1) / hoopSegs) * Math.PI;
      const cx = sx * 0.36, rx = 0.135, baseY = 0.16, ry = 0.195;
      const p0: V3 = [cx - Math.cos(a0) * rx, baseY + Math.sin(a0) * ry, 0.56 - Math.sin(a0) * 0.025];
      const p1: V3 = [cx - Math.cos(a1) * rx, baseY + Math.sin(a1) * ry, 0.56 - Math.sin(a1) * 0.025];
      addTube(b, p0, p1, 0.019, 0.019, 8, false);
    }
    // Rearward diagonal brace strut anchoring each roll hoop into the rear deck bulkhead
    addTube(b, [sx * 0.36, 0.34, 0.545], [sx * 0.36, 0.18, 0.78], 0.014, 0.013, 8, true);
  }
  // Classic oval GT front grille bezel + horizontal & vertical egg-crate chrome slats
  const gZ = -2.23, gY = -0.18, gW = 0.44, gH = 0.105;
  const gSegs = 20;
  for (let i = 0; i < gSegs; i++) {
    const a0 = (i / gSegs) * Math.PI * 2, a1 = ((i + 1) / gSegs) * Math.PI * 2;
    addTube(b, [Math.cos(a0) * gW, gY + Math.sin(a0) * gH, gZ], [Math.cos(a1) * gW, gY + Math.sin(a1) * gH, gZ], 0.018, 0.018, 8, false);
  }
  for (const dy of [-0.045, 0, 0.045]) {
    addTube(b, [-gW * 0.88, gY + dy, gZ + 0.01], [gW * 0.88, gY + dy, gZ + 0.01], 0.009, 0.009, 6, false);
  }
  for (const dx of [-0.26, -0.13, 0, 0.13, 0.26]) {
    addTube(b, [dx, gY - gH * 0.82, gZ + 0.012], [dx, gY + gH * 0.82, gZ + 0.012], 0.007, 0.007, 6, false);
  }
  // Twin sculpted side-exhaust pipes + Scaglietti side-cove chrome strakes + quad rear tailpipe tips
  for (const sx of [-1, 1] as const) {
    addTube(b, [sx * 0.94, -0.36, -0.78], [sx * 0.94, -0.36, 0.82], 0.036, 0.038, 10, true);
    addTube(b, [sx * 0.91, -0.08, -0.76], [sx * 0.87, -0.06, -0.18], 0.011, 0.008, 6, true);
    addTube(b, [sx * 0.50, -0.24, 2.13], [sx * 0.50, -0.24, 2.30], 0.042, 0.048, 14, true);
    addTube(b, [sx * 0.38, -0.24, 2.13], [sx * 0.38, -0.24, 2.29], 0.038, 0.044, 14, true);
    // Bullet torpedo fender racing mirrors
    addEllipsoid(b, [sx * 0.86, 0.25, -0.56], [0.055, 0.048, 0.115], 10, 8);
    addTube(b, [sx * 0.82, 0.16, -0.55], [sx * 0.86, 0.24, -0.56], 0.014, 0.012, 6, false);
    // Wrap-around split classic rear chrome bumpers + overrider guards, recessed deep-dish headlamp buckets & quad taillamp bezels
    addTube(b, [sx * 0.28, -0.13, 2.245], [sx * 0.78, -0.13, 2.195], 0.031, 0.029, 12, true);
    addTube(b, [sx * 0.78, -0.13, 2.195], [sx * 0.91, -0.13, 1.98], 0.029, 0.024, 10, true);
    addBox(b, sx * 0.42, -0.11, 2.24, 0.026, 0.068, 0.032);
    addTube(b, [sx * 0.68, 0.02, -2.145], [sx * 0.68, 0.02, -2.02], 0.118, 0.138, 18, false);
    for (const xOff of [0.64, 0.47]) {
      addTube(b, [sx * xOff, 0.09, 2.175], [sx * xOff, 0.09, 2.228], 0.076, 0.072, 16, false);
    }
  }
  // Chrome rear license-plate surround, decklid script bar & Le Mans quick-fill cap
  addBox(b, 0, -0.04, 2.216, 0.205, 0.074, 0.008);
  addTube(b, [-0.22, 0.14, 2.19], [0.22, 0.14, 2.19], 0.008, 0.008, 6, true);
  // Raked wrap-around chrome windscreen frame (curved cowl rail, curved top header rail, center tie-rod & side A-pillars)
  const wSegs = 8;
  for (let i = 0; i < wSegs; i++) {
    const t0 = i / wSegs - 0.5, t1 = (i + 1) / wSegs - 0.5;
    const c0 = 1 - 4 * t0 * t0, c1 = 1 - 4 * t1 * t1;
    addTube(
      b,
      [t0 * 1.56 * 0.87, 0.375 + c0 * 0.04, -0.26 - c0 * 0.08],
      [t1 * 1.56 * 0.87, 0.375 + c1 * 0.04, -0.26 - c1 * 0.08],
      0.014,
      0.014,
      8,
      false
    );
    addTube(
      b,
      [t0 * 1.56, 0.14 + c0 * 0.08, -0.50 - c0 * 0.16],
      [t1 * 1.56, 0.14 + c1 * 0.08, -0.50 - c1 * 0.16],
      0.013,
      0.013,
      6,
      false
    );
  }
  addTube(b, [0, 0.22, -0.66], [0, 0.415, -0.34], 0.009, 0.009, 6, false);
  addTube(b, [-0.78, 0.14, -0.50], [-0.679, 0.375, -0.26], 0.016, 0.014, 8, true);
  addTube(b, [0.78, 0.14, -0.50], [0.679, 0.375, -0.26], 0.016, 0.014, 8, true);
  // Central chrome rear-view mirror mounted on windscreen tie-rod + Le Mans fuel filler cap
  addBox(b, 0, 0.375, -0.32, 0.068, 0.022, 0.012);
  addTube(b, [0.58, 0.24, 1.02], [0.58, 0.27, 1.02], 0.055, 0.052, 12, true);
  // Driver's polished aviator sunglasses brow bridge & temple arms
  addTube(b, [-0.435, 0.312, 0.182], [-0.285, 0.312, 0.182], 0.0055, 0.0055, 6, false);
  addTube(b, [-0.445, 0.308, 0.19], [-0.45, 0.304, 0.29], 0.0045, 0.004, 5, false);
  addTube(b, [-0.275, 0.308, 0.19], [-0.27, 0.304, 0.29], 0.0045, 0.004, 5, false);
  // 3 drilled aluminum steering-wheel spokes + column hub + gated shifter stalk
  const swX = -0.36, swY = 0.16, swZ = -0.24;
  addTube(b, [swX, 0.08, -0.42], [swX, swY, swZ], 0.02, 0.018, 8, true);
  for (const ang of [-0.35, Math.PI + 0.35, -Math.PI * 0.5]) {
    addTube(
      b,
      [swX, swY, swZ],
      [swX + Math.cos(ang) * 0.128, swY + Math.sin(ang) * 0.128 * 0.92, swZ - Math.sin(ang) * 0.128 * 0.38],
      0.009,
      0.008,
      6,
      false
    );
  }
  addTube(b, [0, -0.02, 0.02], [0, 0.1, -0.02], 0.009, 0.007, 6, true);
  return toRoadsterMesh(b);
}

/** Quilted saddle-tan Italian leather bucket seats, side bolsters, driver head/neck/gloved hands & coastal scarf. */
function buildSeatsMesh(): RoadsterMesh {
  const b = newBuilder();
  for (const sx of [-1, 1] as const) {
    const cx = sx * 0.36;
    // Seat base + 4 quilted horizontal cushion pleats + sculpted thigh bolsters
    addBox(b, cx, -0.17, 0.2, 0.19, 0.042, 0.22);
    for (let p = 0; p < 4; p++) {
      addBox(b, cx, -0.122, 0.04 + p * 0.095, 0.145, 0.018, 0.038);
    }
    for (const bx of [-0.175, 0.175]) {
      addBox(b, cx + bx, -0.11, 0.19, 0.032, 0.045, 0.21);
      addBox(b, cx + bx * 0.95, 0.07, 0.42, 0.034, 0.19, 0.055);
    }
    // Contoured pleated seat backrest + sculpted leather headrest cushion
    addBox(b, cx, 0.06, 0.45, 0.185, 0.19, 0.045);
    for (let r = 0; r < 4; r++) {
      addBox(b, cx, -0.07 + r * 0.075, 0.405, 0.135, 0.03, 0.018);
    }
    addEllipsoid(b, [cx, 0.23, 0.47], [0.115, 0.062, 0.048], 12, 8);
  }
  // Driver's sun-warmed head, neck & tan leather string-back driving gloves gripping the steering wheel (`x = -0.36`)
  addTube(b, [-0.36, 0.19, 0.28], [-0.36, 0.255, 0.27], 0.046, 0.042, 10, false);
  addEllipsoid(b, [-0.36, 0.295, 0.265], [0.092, 0.104, 0.098], 14, 10);
  addEllipsoid(b, [-0.485, 0.195, -0.25], [0.028, 0.024, 0.032], 8, 6);
  addEllipsoid(b, [-0.235, 0.195, -0.25], [0.028, 0.024, 0.032], 8, 6);
  // Tan leather door-top armrests, inner door cards, rear cockpit coaming bolster & center console pad
  for (const sx of [-1, 1] as const) {
    addBox(b, sx * 0.72, 0.09, 0.12, 0.048, 0.032, 0.38);
    addBox(b, sx * 0.67, -0.04, 0.12, 0.026, 0.12, 0.36);
  }
  addBox(b, 0, 0.145, 0.565, 0.66, 0.032, 0.055);
  addBox(b, 0, -0.02, 0.14, 0.095, 0.028, 0.42);
  return toRoadsterMesh(b);
}

/** Hand-turned mahogany wood steering wheel rim, gearshift knob & driver's windswept chestnut hair locks. */
function buildWoodMesh(): RoadsterMesh {
  const b = newBuilder();
  const swX = -0.36, swY = 0.16, swZ = -0.24;
  const swSegs = 20, swR = 0.138;
  for (let i = 0; i < swSegs; i++) {
    const a0 = (i / swSegs) * Math.PI * 2, a1 = ((i + 1) / swSegs) * Math.PI * 2;
    const p0: V3 = [swX + Math.cos(a0) * swR, swY + Math.sin(a0) * swR * 0.92, swZ - Math.sin(a0) * swR * 0.38];
    const p1: V3 = [swX + Math.cos(a1) * swR, swY + Math.sin(a1) * swR * 0.92, swZ - Math.sin(a1) * swR * 0.38];
    addTube(b, p0, p1, 0.015, 0.015, 8, false);
  }
  // Turned mahogany shift knob on center tunnel + dashboard trim strip
  addEllipsoid(b, [0, 0.115, -0.025], [0.024, 0.026, 0.024], 10, 8);
  addBox(b, 0.22, 0.09, -0.305, 0.26, 0.032, 0.012);
  // Driver's windswept chestnut hair crown & streaming coastal slipstream locks (`z: 0.23 -> 0.43`)
  addEllipsoid(b, [-0.36, 0.335, 0.278], [0.098, 0.078, 0.108], 14, 8);
  for (const [dx, dy, dzEnd, r0] of [
    [-0.065, 0.33, 0.435, 0.034],
    [-0.022, 0.348, 0.45, 0.038],
    [0.024, 0.345, 0.445, 0.036],
    [0.066, 0.326, 0.425, 0.032],
    [0.0, 0.295, 0.43, 0.036]
  ] as const) {
    addTube(b, [-0.36 + dx * 0.75, dy, 0.26], [-0.36 + dx * 1.15, dy - 0.012, dzEnd], r0, 0.008, 8, true);
  }
  return toRoadsterMesh(b);
}

function buildCockpitMesh(): RoadsterMesh {
  const b = newBuilder();
  // Dark recessed cabin floor tub, carpeted transmission tunnel & rear bulkhead
  addBox(b, 0, -0.24, 0.10, 0.62, 0.04, 0.52);
  addBox(b, 0, -0.12, 0.10, 0.11, 0.10, 0.50);
  addBox(b, 0, 0.02, 0.58, 0.64, 0.22, 0.05);
  // Sculpted dashboard cowl + twin driver binnacle gauge pods
  addBox(b, 0, 0.08, -0.44, 0.64, 0.11, 0.14);
  for (const gx of [-0.43, -0.29]) {
    addTube(b, [gx, 0.16, -0.46], [gx, 0.16, -0.34], 0.048, 0.046, 12, true);
  }
  // Driver tailored charcoal racing jacket torso, shoulders & articulated arms reaching to steering wheel
  addEllipsoid(b, [-0.36, 0.04, 0.28], [0.16, 0.175, 0.118], 12, 8);
  addTube(b, [-0.50, 0.14, 0.24], [-0.51, 0.165, 0.0], 0.042, 0.036, 8, true);
  addTube(b, [-0.51, 0.165, 0.0], [-0.485, 0.192, -0.24], 0.035, 0.028, 8, true);
  addTube(b, [-0.22, 0.14, 0.24], [-0.21, 0.165, 0.0], 0.042, 0.036, 8, true);
  addTube(b, [-0.21, 0.165, 0.0], [-0.235, 0.192, -0.24], 0.035, 0.028, 8, true);
  // Driver's dark wraparound aviator/wayfarer sunglasses lenses (`z = 0.178`, facing `-Z`)
  addEllipsoid(b, [-0.402, 0.304, 0.178], [0.038, 0.024, 0.016], 10, 6);
  addEllipsoid(b, [-0.318, 0.304, 0.178], [0.038, 0.024, 0.016], 10, 6);
  // Dark recessed front grille mesh backing, Kammback rear tail fascia & deep wheel-well arch liners
  addBox(b, 0, -0.18, -2.21, 0.41, 0.09, 0.015);
  addBox(b, 0, 0.08, 2.185, 0.74, 0.095, 0.018);
  for (const sx of [-1, 1] as const) {
    addEllipsoid(b, [sx * 0.68, 0.02, -2.06], [0.116, 0.116, 0.06], 12, 8);
    for (const wz of [ROADSTER_FRONT_Z, ROADSTER_REAR_Z]) {
      addTube(b, [sx * 0.68, -0.24, wz], [sx * 0.95, -0.24, wz], ROADSTER_WHEEL_RADIUS * 1.08, ROADSTER_WHEEL_RADIUS * 1.08, 14, true);
    }
  }
  return toRoadsterMesh(b);
}

function buildGlassMesh(): RoadsterMesh {
  const b = newBuilder();
  // Raked wrap-around speedster windscreen (5 curved panels, double-faced via thin front/back shell)
  const panels = 6;
  for (let i = 0; i < panels; i++) {
    const t0 = i / panels - 0.5, t1 = (i + 1) / panels - 0.5;
    const x0 = t0 * 1.56, x1 = t1 * 1.56;
    const curve0 = (1 - 4 * t0 * t0), curve1 = (1 - 4 * t1 * t1);
    const bZ0 = -0.50 - curve0 * 0.16, bZ1 = -0.50 - curve1 * 0.16;
    const tZ0 = -0.26 - curve0 * 0.08, tZ1 = -0.26 - curve1 * 0.08;
    const bY0 = 0.14 + curve0 * 0.08, bY1 = 0.14 + curve1 * 0.08;
    const tY0 = 0.37 + curve0 * 0.04, tY1 = 0.37 + curve1 * 0.04;
    const tx0 = x0 * 0.87, tx1 = x1 * 0.87;
    addQuad(b, [x0, bY0, bZ0], [x1, bY1, bZ1], [tx1, tY1, tZ1], [tx0, tY0, tZ0]);
    addQuad(b, [tx0, tY0, tZ0 + 0.006], [tx1, tY1, tZ1 + 0.006], [x1, bY1, bZ1 + 0.006], [x0, bY0, bZ0 + 0.006]);
  }
  return toRoadsterMesh(b);
}

function buildHeadlampsMesh(): RoadsterMesh {
  const b = newBuilder();
  for (const sx of [-1, 1] as const) {
    addEllipsoid(b, [sx * 0.68, 0.02, -2.12], [0.108, 0.108, 0.055], 14, 8);
    // Amber/warm fog driving lamps flanking the oval grille
    addEllipsoid(b, [sx * 0.49, -0.17, -2.21], [0.052, 0.052, 0.03], 10, 6);
  }
  return toRoadsterMesh(b);
}

function buildTaillampsMesh(): RoadsterMesh {
  const b = newBuilder();
  // Quad circular ruby-red GT brake / afterburner lenses
  for (const sx of [-1, 1] as const) {
    for (const xOff of [0.64, 0.47]) {
      addTube(b, [sx * xOff, 0.09, 2.18], [sx * xOff, 0.09, 2.23], 0.068, 0.062, 14, true);
    }
  }
  return toRoadsterMesh(b);
}

/** Smooth rounded-shoulder radial tire centred at `(0, 0, 0)` with axle along X. */
function buildWheelTireMesh(): RoadsterMesh {
  const b = newBuilder();
  const rOuter = ROADSTER_WHEEL_RADIUS;
  const rRim = rOuter * 0.60;
  const hw = ROADSTER_WHEEL_WIDTH * 0.5;
  // Cross-section around the tire carcass (inner bead -> sidewall -> rounded shoulder -> tread -> outer shoulder -> sidewall -> bead)
  const profile: readonly [number, number][] = [
    [-hw * 0.82, rRim],
    [-hw, rRim + (rOuter - rRim) * 0.48],
    [-hw * 0.92, rOuter * 0.95],
    [-hw * 0.45, rOuter],
    [hw * 0.45, rOuter],
    [hw * 0.92, rOuter * 0.95],
    [hw, rRim + (rOuter - rRim) * 0.48],
    [hw * 0.82, rRim]
  ];
  const segs = 24;
  const rows = profile.length;
  const base = b.positions.length / 3;
  for (let r = 0; r < rows; r++) {
    const [x, rad] = profile[r]!;
    const prev = profile[Math.max(0, r - 1)]!, next = profile[Math.min(rows - 1, r + 1)]!;
    const tx = next[0] - prev[0], tr = next[1] - prev[1];
    // Outward normal in (x, rad) plane: (+tr, -tx) -> Wait: from -hw to +hw, rad goes up then down; (+tr, -tx) at top (tx>0, tr=0) gives (0, -1), so outward is (-tr, tx)!
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

/** Deep-dish chrome rim, 18 crossed Borrani wire spokes & 3-ear knock-off spinner (`outSign` = `-1` left wheel, `+1` right wheel; positive determinant!). */
function buildWheelRimMesh(outSign: -1 | 1): RoadsterMesh {
  const b = newBuilder();
  const rRim = ROADSTER_WHEEL_RADIUS * 0.62;
  const hw = ROADSTER_WHEEL_WIDTH * 0.42;
  // Stepped deep-dish outer rim lip, rolled bead flange & recessed inner barrel
  addTube(b, [outSign * hw * 0.56, 0, 0], [outSign * hw * 0.98, 0, 0], rRim * 0.93, rRim * 1.01, 24, false);
  addTube(b, [-hw * outSign * 0.85, 0, 0], [outSign * hw * 0.56, 0, 0], rRim * 0.84, rRim * 0.89, 20, true);
  // Central splined hub + twin spoke flanges + 3-ear Borrani knock-off spinner
  addTube(b, [outSign * hw * 0.10, 0, 0], [outSign * hw * 1.06, 0, 0], 0.068, 0.038, 16, true);
  addTube(b, [outSign * hw * 0.68, 0, 0], [outSign * hw * 0.78, 0, 0], 0.078, 0.072, 14, true);
  for (let e = 0; e < 3; e++) {
    const ea = (e / 3) * Math.PI * 2;
    addTube(
      b,
      [outSign * hw * 0.93, 0, 0],
      [outSign * hw * 1.01, Math.cos(ea) * 0.094, Math.sin(ea) * 0.094],
      0.016,
      0.008,
      6,
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
    addTube(b, [hubX, Math.cos(th) * 0.058, Math.sin(th) * 0.058], [rimX, y, z], 0.009, 0.0075, 6, false);
  }
  return toRoadsterMesh(b);
}

/** Ventilated machined-steel brake rotor disc & caliper centered on wheel axle. */
function buildWheelRotorMesh(): RoadsterMesh {
  const b = newBuilder();
  const rRotor = ROADSTER_WHEEL_RADIUS * 0.46;
  addTube(b, [-0.018, 0, 0], [0.018, 0, 0], rRotor, rRotor, 18, true);
  addBox(b, 0, rRotor * 0.62, -rRotor * 0.36, 0.036, 0.052, 0.065);
  return toRoadsterMesh(b);
}

export interface RoadsterRigGeometries {
  readonly body: RoadsterMesh;
  readonly stripes: RoadsterMesh;
  readonly chrome: RoadsterMesh;
  readonly seats: RoadsterMesh;
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
