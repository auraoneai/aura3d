import { camera, createAuraApp, effects, environments, geometry, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { materials: string[]; cameraAzimuthDeg: number };
  }
}

type V3 = [number, number, number];
type P2 = [number, number];

window.__TASK_STATE__ = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: 0 };

/* ------------------------------------------------------------------ */
/* Procedural marble: warped-stripe veins from layered value noise      */
/* ------------------------------------------------------------------ */
const hash3 = (x: number, y: number, z: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const vnoise = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi);
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz
  );
};
const fbm = (x: number, y: number, z: number, oct = 4): number => {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i += 1) {
    sum += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 5.7);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
};
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => smooth(clamp01((v - a) / (b - a)));

const marbleColor = (x: number, y: number, z: number): [number, number, number] => {
  const s = 1.25;
  const q1 = fbm(x * s, y * s, z * s);
  const q2 = fbm(x * s + 7.1, y * s + 3.3, z * s + 1.7);
  const q3 = fbm(x * s - 4.2, y * s + 8.8, z * s + 6.4);
  const warp = fbm(x * 0.9 + q1 * 2.4, y * 0.9 + q2 * 2.4, z * 0.9 + q3 * 2.4);
  const t1 = x * 1.1 + y * 0.7 + z * 0.45 + warp * 3.4;
  const vein1 = Math.pow(1 - Math.abs(Math.sin(t1 * 2.3)), 9);
  const mask = smoothstep(0.3, 0.62, fbm(x * 0.8 + 5.0, y * 0.8 - 2.0, z * 0.8 + 1.0, 3));
  const t2 = -x * 0.6 + y * 1.3 - z * 0.8 + fbm(x * 2.7 + q2, y * 2.7, z * 2.7 + q1) * 2.2;
  const vein2 = Math.pow(1 - Math.abs(Math.sin(t2 * 3.7)), 16) * 0.55;
  const cloud = fbm(x * 2.1 + 11, y * 2.1, z * 2.1 - 3, 3);
  const grain = fbm(x * 14, y * 14, z * 14, 2);
  const vein = clamp01(vein1 * (0.3 + 0.7 * mask) + vein2 * mask);
  const base = 0.93 - cloud * 0.08 - grain * 0.03;
  const g = lerp(base, 0.4, vein * 0.82);
  return [g * 1.0, g * 0.985, g * 0.955 + vein * 0.02];
};

/* Tessellated boxes (top and four sides) with a marble colour per vertex. */
const mPos: number[] = [], mNor: number[] = [], mCol: number[] = [], mIdx: number[] = [];
const mMin: V3 = [1e9, 1e9, 1e9], mMax: V3 = [-1e9, -1e9, -1e9];
const DENSITY = 56;
const marbleBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void => {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces: Array<{ o: V3; u: V3; v: V3; n: V3 }> = [
    { o: [cx - hx, cy + hy, cz - hz], u: [0, 0, sz], v: [sx, 0, 0], n: [0, 1, 0] },
    { o: [cx + hx, cy - hy, cz - hz], u: [0, sy, 0], v: [0, 0, sz], n: [1, 0, 0] },
    { o: [cx - hx, cy - hy, cz - hz], u: [0, 0, sz], v: [0, sy, 0], n: [-1, 0, 0] },
    { o: [cx - hx, cy - hy, cz + hz], u: [sx, 0, 0], v: [0, sy, 0], n: [0, 0, 1] },
    { o: [cx - hx, cy - hy, cz - hz], u: [0, sy, 0], v: [sx, 0, 0], n: [0, 0, -1] }
  ];
  for (const f of faces) {
    const lu = Math.hypot(...f.u), lv = Math.hypot(...f.v);
    const nu = Math.max(2, Math.round(lu * DENSITY)), nv = Math.max(2, Math.round(lv * DENSITY));
    const base = mPos.length / 3;
    for (let j = 0; j <= nv; j += 1) {
      for (let i = 0; i <= nu; i += 1) {
        const a = i / nu, b = j / nv;
        const x = f.o[0] + f.u[0] * a + f.v[0] * b;
        const y = f.o[1] + f.u[1] * a + f.v[1] * b;
        const z = f.o[2] + f.u[2] * a + f.v[2] * b;
        mPos.push(x, y, z);
        mNor.push(f.n[0], f.n[1], f.n[2]);
        const [r, g, bl] = marbleColor(x, y, z);
        mCol.push(r, g, bl, 1);
        mMin[0] = Math.min(mMin[0], x); mMin[1] = Math.min(mMin[1], y); mMin[2] = Math.min(mMin[2], z);
        mMax[0] = Math.max(mMax[0], x); mMax[1] = Math.max(mMax[1], y); mMax[2] = Math.max(mMax[2], z);
      }
    }
    for (let j = 0; j < nv; j += 1) {
      for (let i = 0; i < nu; i += 1) {
        const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
        mIdx.push(a, b, c, b, d, c);
      }
    }
  }
};

// Stepped pedestal: two steps, shaft, cap. Top surface at y = 1.39.
marbleBox(0, 0.08, 0, 1.9, 0.16, 1.9);
marbleBox(0, 0.24, 0, 1.6, 0.16, 1.6);
marbleBox(0, 0.795, 0, 1.25, 0.95, 1.25);
marbleBox(0, 1.33, 0, 1.45, 0.12, 1.45);

const marbleGeometry = geometry.define({
  positions: new Float32Array(mPos),
  normals: new Float32Array(mNor),
  colors: new Float32Array(mCol),
  indices: mIdx,
  bounds: { min: mMin, max: mMax }
});

/* ------------------------------------------------------------------ */
/* Lathe and tube builders                                              */
/* ------------------------------------------------------------------ */
const chaikin = (pts: P2[], iterations: number): P2[] => {
  let cur = pts;
  for (let k = 0; k < iterations; k += 1) {
    const out: P2[] = [cur[0]!];
    for (let i = 0; i < cur.length - 1; i += 1) {
      const a = cur[i]!, b = cur[i + 1]!;
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    out.push(cur[cur.length - 1]!);
    cur = out;
  }
  return cur;
};

const profileNormals = (pts: P2[]): P2[] =>
  pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    return [ty / l, -tx / l] as P2;
  });

/** Revolve a (radius, y) profile around the Y axis. */
const lathe = (profile: P2[], iterations: number, segments: number) => {
  const pts = chaikin(profile, iterations);
  const nrm = profileNormals(pts);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  let maxR = 0, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i += 1) {
    const [r, y] = pts[i]!, [nr, ny] = nrm[i]!;
    maxR = Math.max(maxR, r); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    for (let j = 0; j <= segments; j += 1) {
      const th = (j / segments) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      positions.push(r * c, y, r * s);
      normals.push(nr * c, ny, nr * s);
    }
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * (segments + 1) + j, b = a + segments + 1, c = a + 1, d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    bounds: { min: [-maxR, minY, -maxR], max: [maxR, maxY, maxR] }
  });
};

/** Sweep a circle along a planar (x, y) curve lying in z = 0. `flip` rotates 180 degrees about Y. */
const tube = (path: P2[], iterations: number, radiusAt: (s: number) => number, flip: boolean, sides: number) => {
  const pts = chaikin(path, iterations);
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const sg = flip ? -1 : 1;
  let maxX = 0, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    const nx = ty / l, ny = -tx / l; // in-plane normal, bz = (0,0,1)
    const rad = radiusAt(i / (pts.length - 1));
    const [px, py] = pts[i]!;
    for (let j = 0; j <= sides; j += 1) {
      const ph = (j / sides) * Math.PI * 2, c = Math.cos(ph), s = Math.sin(ph);
      const dx = c * nx, dy = c * ny, dz = s;
      positions.push(sg * (px + rad * dx), py + rad * dy, sg * rad * dz);
      normals.push(sg * dx, dy, sg * dz);
      maxX = Math.max(maxX, Math.abs(px) + rad);
      minY = Math.min(minY, py - rad); maxY = Math.max(maxY, py + rad);
    }
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * (sides + 1) + j, b = a + sides + 1, c = a + 1, d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    bounds: { min: [-maxX, minY, -0.1], max: [maxX, maxY, 0.1] }
  });
};

/* ------------------------------------------------------------------ */
/* Trophy profiles                                                      */
/* ------------------------------------------------------------------ */
const outerCtrl: P2[] = [
  [0, 1.55], [0.27, 1.55], [0.27, 1.6], [0.22, 1.64], [0.13, 1.7], [0.08, 1.78], [0.052, 1.9], [0.05, 2.0],
  [0.07, 2.04], [0.1, 2.1], [0.1, 2.15], [0.07, 2.21], [0.05, 2.26], [0.05, 2.34], [0.08, 2.4], [0.16, 2.46],
  [0.26, 2.55], [0.32, 2.68], [0.35, 2.82], [0.355, 2.98], [0.35, 3.1]
];
const lipAndInner: P2[] = [
  [0.352, 3.19], [0.34, 3.215], [0.325, 3.195], [0.315, 3.12], [0.29, 2.98], [0.26, 2.8], [0.2, 2.66], [0.1, 2.59], [0, 2.57]
];
const cupProfile = outerCtrl.concat(lipAndInner);
const outerSmooth = chaikin(outerCtrl, 3);
const cupRadiusAt = (y: number): number => {
  for (let i = 0; i < outerSmooth.length - 1; i += 1) {
    const a = outerSmooth[i]!, b = outerSmooth[i + 1]!;
    if (a[1] <= y && b[1] >= y && b[1] > a[1] && a[1] > 2.5) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
  }
  return 0.34;
};
const bandRadius = (y0: number, y1: number): P2[] => {
  const R0 = cupRadiusAt(y0), R1 = cupRadiusAt(y1), H = y1 - y0;
  const R = (k: number): number => lerp(R0, R1, k);
  const ys = (k: number): number => y0 + H * k;
  // outward bead, recessed engraved channel, outward bead
  return [
    [R(0) - 0.012, ys(0)], [R(0.02) + 0.012, ys(0.02)], [R(0.2) + 0.013, ys(0.2)], [R(0.28) + 0.004, ys(0.28)],
    [R(0.72) + 0.004, ys(0.72)], [R(0.8) + 0.013, ys(0.8)], [R(0.98) + 0.012, ys(0.98)], [R(1) - 0.012, ys(1)]
  ];
};
const stemRing: P2[] = [[0.045, 2.285], [0.062, 2.285], [0.066, 2.295], [0.062, 2.305], [0.045, 2.305]];
const footBand: P2[] = [[0.255, 1.585], [0.278, 1.585], [0.28, 1.595], [0.278, 1.61], [0.25, 1.61]];
const handleCtrl: P2[] = [[0.28, 3.02], [0.46, 3.1], [0.62, 3.02], [0.68, 2.84], [0.64, 2.66], [0.52, 2.54], [0.36, 2.48], [0.15, 2.47]];
const handleRadius = (s: number): number => 0.03 * (0.72 + 0.28 * Math.sin(Math.PI * s));

/* ------------------------------------------------------------------ */
/* Materials                                                            */
/* ------------------------------------------------------------------ */
const marble = material.pbr({ color: "#ffffff", metallic: 0, roughness: 0.16 });
const gold = material.pbr({ color: "#ffc65a", metallic: 1, roughness: 0.1 });
const goldEngraved = material.pbr({ color: "#a8761f", metallic: 1, roughness: 0.42 });
const darkstone = material.pbr({ color: "#09090b", metallic: 0, roughness: 0.1 });
const floorMat = material.pbr({ color: "#2b1d15", metallic: 0, roughness: 0.3 });
const wallMat = material.pbr({ color: "#4a3629", metallic: 0, roughness: 0.85 });
const frameMat = material.pbr({ color: "#120c08", metallic: 0, roughness: 0.6 });
const warmWin = material.emissive({ color: "#ffe0ae", emissive: "#ffc77a", emissiveIntensity: 5 });
const coolWin = material.emissive({ color: "#d4e4ff", emissive: "#a8c8ff", emissiveIntensity: 4 });
const lampMat = material.emissive({ color: "#fff0cf", emissive: "#ffd28a", emissiveIntensity: 7 });

/* ------------------------------------------------------------------ */
/* Stage (everything that rotates against the fixed camera)             */
/* ------------------------------------------------------------------ */
const WALL_X = 6.85, WALL_BACK = -4.5, WALL_FRONT = 8, CEIL = 6.6;
let nameId = 0;
const nm = (p: string): string => `${p}-${nameId++}`;
const slab = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat = wallMat, shadow = false) =>
  primitives.box({ name: nm("slab"), size: [sx, sy, sz], material: mat, castShadow: shadow }).position(cx, cy, cz);

type StageChild = NonNullable<Parameters<typeof group>[1]>[number];
const stageNodes: StageChild[] = [
  // room shell
  slab(0, -0.3, 1.75, 14.6, 0.6, 13.1, floorMat),
  slab(0, CEIL + 0.3, 1.75, 14.6, 0.6, 13.1),
  slab(0, 3.3, WALL_BACK - 0.3, 14.6, 7.2, 0.6),
  slab(0, 3.3, WALL_FRONT + 0.3, 14.6, 7.2, 0.6),
  slab(-WALL_X - 0.3, 3.3, 1.75, 0.6, 7.2, 13.1),
  slab(WALL_X + 0.3, 3.3, 1.75, 0.6, 7.2, 13.1),
  // skirting
  slab(0, 0.12, WALL_BACK + 0.04, 13.7, 0.24, 0.08, frameMat),
  slab(-WALL_X + 0.04, 0.12, 1.75, 0.08, 0.24, 12.5, frameMat),
  slab(WALL_X - 0.04, 0.12, 1.75, 0.08, 0.24, 12.5, frameMat),
  // pedestal
  geometry.custom(marbleGeometry, { name: "pedestal", material: marble }),
  // trophy base: black polished stone with a gold plate
  primitives.box({ name: "base-lower", size: [0.66, 0.12, 0.66], material: darkstone }).position(0, 1.45, 0),
  primitives.box({ name: "base-upper", size: [0.54, 0.04, 0.54], material: darkstone }).position(0, 1.53, 0),
  primitives.box({ name: "base-plate", size: [0.36, 0.07, 0.012], material: gold }).position(0, 1.45, 0.333),
  // trophy: cup on a stem, engraved band, two handles
  geometry.custom(lathe(cupProfile, 3, 96), { name: "cup", material: gold }),
  geometry.custom(lathe(bandRadius(2.66, 2.8), 2, 96), { name: "cup-band", material: goldEngraved }),
  geometry.custom(lathe(stemRing, 2, 48), { name: "stem-ring", material: goldEngraved }),
  geometry.custom(lathe(footBand, 2, 64), { name: "foot-band", material: goldEngraved }),
  geometry.custom(tube(handleCtrl, 3, handleRadius, false, 20), { name: "handle-r", material: gold }),
  geometry.custom(tube(handleCtrl, 3, handleRadius, true, 20), { name: "handle-l", material: gold })
];

// Windows and lamps: emissive panes with dark mullions, so the gold has something to reflect.
const windowX = (side: 1 | -1, y: number, z: number, w: number, h: number, mat = warmWin) => {
  const x = side * (WALL_X - 0.03);
  stageNodes.push(
    primitives.box({ name: nm("win"), size: [0.06, h, w], material: mat, castShadow: false }).position(x, y, z),
    slab(x - side * 0.01, y, z, 0.08, h + 0.16, 0.08, frameMat),
    slab(x - side * 0.01, y + h * 0.18, z, 0.08, 0.07, w + 0.16, frameMat),
    slab(x - side * 0.01, y, z + w / 2 + 0.04, 0.08, h + 0.16, 0.08, frameMat),
    slab(x - side * 0.01, y, z - w / 2 - 0.04, 0.08, h + 0.16, 0.08, frameMat)
  );
};
const windowZ = (wallZ: number, dir: 1 | -1, x: number, y: number, w: number, h: number, mat = warmWin) => {
  const z = wallZ + dir * 0.03;
  stageNodes.push(
    primitives.box({ name: nm("win"), size: [w, h, 0.06], material: mat, castShadow: false }).position(x, y, z),
    slab(x, y, z + dir * 0.01, 0.08, h + 0.16, 0.08, frameMat),
    slab(x, y + h * 0.18, z + dir * 0.01, w + 0.16, 0.07, 0.08, frameMat),
    slab(x + w / 2 + 0.04, y, z + dir * 0.01, 0.08, h + 0.16, 0.08, frameMat),
    slab(x - w / 2 - 0.04, y, z + dir * 0.01, 0.08, h + 0.16, 0.08, frameMat)
  );
};
windowX(-1, 3.4, -2.6, 1.3, 3.0);
windowX(-1, 3.4, 1.0, 1.3, 3.0);
windowX(-1, 3.4, 4.6, 1.3, 3.0, coolWin);
windowX(1, 3.4, -1.8, 1.3, 3.0);
windowX(1, 3.4, 2.6, 1.3, 3.0);
windowZ(WALL_FRONT, -1, -3.2, 3.4, 1.4, 3.0);
windowZ(WALL_FRONT, -1, 3.2, 3.4, 1.4, 3.0, coolWin);
windowZ(WALL_BACK, 1, -4.4, 3.2, 1.1, 2.6);
windowZ(WALL_BACK, 1, 4.4, 3.2, 1.1, 2.6);
for (const [lx, ly, lz] of [[-2.6, 5.4, 3.0], [2.9, 5.2, -1.2], [0.4, 5.6, 6.2]] as V3[]) {
  stageNodes.push(
    primitives.sphere({ name: nm("lamp"), size: 0.36, material: lampMat, castShadow: false }).position(lx, ly, lz),
    primitives.cylinder({ name: nm("cord"), size: [0.015, CEIL - ly, 0.015], material: frameMat, castShadow: false }).position(lx, (CEIL + ly) / 2, lz)
  );
}

/* ------------------------------------------------------------------ */
/* Lights (positions are driven per frame so they orbit with the stage) */
/* ------------------------------------------------------------------ */
const FOCUS: V3 = [0, 1.7, 0];
const keyBase: V3 = [1.4, 5.6, 4.6];
const fillBase: V3 = [-4.5, 2.6, 4.5];
const rimBase: V3 = [1.6, 3.6, -3.8];

const sc = scene({ background: "#0a0705" })
  .add(environments.capture({ name: "room-env", position: [0, 3.6, 0], resolution: 256, update: "once", include: "all", intensity: 1.1, background: false }))
  .add(lights.hemisphere({ name: "ambient", skyColor: "#ffcf9a", groundColor: "#2a1a10", intensity: 0.22 }))
  .add(lights.spot({ name: "key", position: keyBase, target: FOCUS, angle: 0.42, penumbra: 0.75, distance: 24, decay: 2, intensity: 60, color: "#ffd9a6", shadow: true }).runtime({ id: "key", mutable: true }))
  .add(lights.directional({ name: "fill", position: fillBase, target: FOCUS, intensity: 0.45, color: "#8aa6ff" }).runtime({ id: "fill", mutable: true }))
  .add(lights.directional({ name: "rim", position: rimBase, target: FOCUS, intensity: 0.9, color: "#ffe6c4" }).runtime({ id: "rim", mutable: true }))
  .add(group("stage", stageNodes).runtime({ id: "stage", mutable: true }))
  .add(effects.bloom({ intensity: 0.35, threshold: 0.9, radius: 0.5 }))
  .camera(camera.perspective({ position: [0, 2.15, 5.6], target: [0, 1.72, 0], fov: 38, near: 0.1, far: 60 }));

const app = createAuraApp("#app", { scene: sc });

/* ------------------------------------------------------------------ */
/* Camera orbit: +-15 degrees. The camera stays fixed and the stage     */
/* (room, pedestal, trophy, lights) is rotated by the opposite angle.   */
/* ------------------------------------------------------------------ */
const AMPLITUDE_DEG = 15, PERIOD = 24;
const rotY = (p: V3, phi: number): V3 => [
  p[0] * Math.cos(phi) + p[2] * Math.sin(phi),
  p[1],
  -p[0] * Math.sin(phi) + p[2] * Math.cos(phi)
];
let t = 0;
const apply = (): void => {
  const az = AMPLITUDE_DEG * Math.sin((t / PERIOD) * Math.PI * 2);
  const phi = (-az * Math.PI) / 180;
  app.nodes.require("stage").setRotation(0, phi, 0);
  const k = rotY(keyBase, phi), f = rotY(fillBase, phi), r = rotY(rimBase, phi);
  app.nodes.require("key").setPosition(k[0], k[1], k[2]);
  app.nodes.require("fill").setPosition(f[0], f[1], f[2]);
  app.nodes.require("rim").setPosition(r[0], r[1], r[2]);
  window.__TASK_STATE__ = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: az };
};
app.onFrame((frame: { dt: number }) => {
  t += frame.dt;
  apply();
});

await app.ready();
apply();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
