import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  interactions,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

// ---------------------------------------------------------------------------
// Seeded RNG: the same SEED always produces the same tree.
// ---------------------------------------------------------------------------
const SEED = 20241107;
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const range = (lo: number, hi: number): number => lo + (hi - lo) * rand();

// ---------------------------------------------------------------------------
// Small vector helpers
// ---------------------------------------------------------------------------
type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type RGB = [number, number, number];
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------------------------------------------------------------------------
// Mesh builder (positions, normals, per-vertex colour, indices)
// ---------------------------------------------------------------------------
class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  min: V3 = [Infinity, Infinity, Infinity];
  max: V3 = [-Infinity, -Infinity, -Infinity];

  vertex(p: V3, n: V3, c: RGB): number {
    for (let k = 0; k < 3; k += 1) {
      this.min[k] = Math.min(this.min[k] ?? 0, p[k] ?? 0);
      this.max[k] = Math.max(this.max[k] ?? 0, p[k] ?? 0);
    }
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2], 1);
    return this.pos.length / 3 - 1;
  }

  // Tapered tube along a polyline: one ring per point with its own radius.
  tube(points: V3[], radii: number[], colorAt: (i: number) => RGB, sides: number): void {
    const n = points.length;
    const tangents: V3[] = points.map((_, i) => {
      const a = points[Math.max(0, i - 1)] as V3;
      const b = points[Math.min(n - 1, i + 1)] as V3;
      return norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    });
    const t0 = tangents[0] as V3;
    const ref: V3 = Math.abs(t0[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let nrm = norm(add(ref, scl(t0, -dot(ref, t0))));
    const base = this.pos.length / 3;
    for (let i = 0; i < n; i += 1) {
      const t = tangents[i] as V3;
      nrm = norm(add(nrm, scl(t, -dot(nrm, t))));
      const bin = cross(t, nrm);
      const p = points[i] as V3;
      const r = radii[i] ?? 0.02;
      const c = colorAt(i);
      for (let k = 0; k < sides; k += 1) {
        const a = (k / sides) * Math.PI * 2;
        const d = add(scl(nrm, Math.cos(a)), scl(bin, Math.sin(a)));
        this.vertex(add(p, scl(d, r)), d, c);
      }
    }
    const last = points[n - 1] as V3;
    const lastT = tangents[n - 1] as V3;
    const apex = this.vertex(add(last, scl(lastT, (radii[n - 1] ?? 0.02) * 0.6)), lastT, colorAt(n - 1));
    for (let i = 0; i < n - 1; i += 1) {
      for (let k = 0; k < sides; k += 1) {
        const k2 = (k + 1) % sides;
        const a = base + i * sides + k;
        const b = base + (i + 1) * sides + k;
        const c = base + i * sides + k2;
        const d = base + (i + 1) * sides + k2;
        this.idx.push(a, c, b, c, d, b);
      }
    }
    for (let k = 0; k < sides; k += 1) {
      const k2 = (k + 1) % sides;
      this.idx.push(base + (n - 1) * sides + k, base + (n - 1) * sides + k2, apex);
    }
  }
}

// ---------------------------------------------------------------------------
// Ground: a small grassy mound (polar grid) on a wide meadow plane
// ---------------------------------------------------------------------------
const MOUND_R = 9;
const MOUND_H = 1.0;
const ground = (x: number, z: number): number => {
  const r = Math.hypot(x, z);
  if (r >= MOUND_R) return 0;
  const u = 1 - (r / MOUND_R) ** 2;
  const bumps = 0.09 * Math.sin(x * 0.85 + 1) * Math.cos(z * 0.7 + 0.4) * (1 - r / MOUND_R);
  return MOUND_H * u * u + bumps;
};
const Y0 = ground(0, 0);

function buildMound(): ReturnType<typeof geometry.define> {
  const rings = 28;
  const sectors = 72;
  const mb = new MeshBuilder();
  const centre = hex("#8c9136");
  const edge = hex("#5f8030");
  const dirt = hex("#5a4a2b");
  for (let ri = 0; ri <= rings; ri += 1) {
    const r = (ri / rings) * MOUND_R;
    for (let si = 0; si <= sectors; si += 1) {
      const th = (si / sectors) * Math.PI * 2;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      const e = 0.05;
      const nx = ground(x - e, z) - ground(x + e, z);
      const nz = ground(x, z - e) - ground(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      const noise = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4);
      let c = mixRgb(centre, edge, clamp01(r / MOUND_R));
      c = mixRgb(c, [c[0] * 0.82, c[1] * 0.9, c[2] * 0.7], noise * 0.6);
      c = mixRgb(c, dirt, clamp01(1 - r / 1.9) * 0.9);
      mb.vertex([x, ground(x, z), z], [nx / l, (2 * e) / l, nz / l], c);
    }
  }
  const row = sectors + 1;
  for (let ri = 0; ri < rings; ri += 1) {
    for (let si = 0; si < sectors; si += 1) {
      const v = ri * row + si;
      mb.idx.push(v, v + 1, v + row, v + 1, v + row + 1, v + row);
    }
  }
  return geometry.define({
    positions: new Float32Array(mb.pos),
    normals: new Float32Array(mb.nor),
    colors: new Float32Array(mb.col),
    indices: mb.idx,
    bounds: { min: [-MOUND_R, -0.2, -MOUND_R], max: [MOUND_R, MOUND_H + 0.5, MOUND_R] }
  });
}

// ---------------------------------------------------------------------------
// Procedural branch layout (trunk -> limbs -> secondary branches -> twigs)
// ---------------------------------------------------------------------------
interface Branch {
  level: number;
  points: V3[];
  radii: number[];
}
interface Sample {
  p: V3;
  tan: V3;
  r: number;
}
const branches: Branch[] = [];

function sampleBranch(b: Branch, t: number): Sample {
  const n = b.points.length;
  const f = clamp01(t) * (n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  const u = f - i;
  const p0 = b.points[i] as V3;
  const p1 = b.points[i + 1] as V3;
  return {
    p: [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u), lerp(p0[2], p1[2], u)],
    tan: norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]),
    r: lerp(b.radii[i] ?? 0.02, b.radii[i + 1] ?? 0.02, u)
  };
}

function grow(start: V3, dir: V3, length: number, r0: number, r1: number, level: number, segs: number, bend: number, tropism: number, flare = 0): Branch {
  const points: V3[] = [start];
  const radii: number[] = [];
  let d = norm(dir);
  let p = start;
  const step = length / segs;
  for (let i = 0; i < segs; i += 1) {
    d = norm([d[0] + (rand() - 0.5) * bend, d[1] + (rand() - 0.5) * bend + tropism, d[2] + (rand() - 0.5) * bend]);
    p = add(p, scl(d, step));
    points.push(p);
  }
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    radii.push(lerp(r0, r1, Math.pow(t, 0.9)) + flare * Math.exp(-t * 11));
  }
  const b: Branch = { level, points, radii };
  branches.push(b);
  return b;
}

// Direction at angle alpha from tangent t, rotated by phi around it.
function fanDir(t: V3, alpha: number, phi: number): V3 {
  const ref: V3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(t, ref));
  const v = cross(t, u);
  const side = add(scl(u, Math.cos(phi)), scl(v, Math.sin(phi)));
  return norm(add(scl(t, Math.cos(alpha)), scl(side, Math.sin(alpha))));
}

interface Clump {
  centre: V3;
  radius: number;
}
const clumps: Clump[] = [];
const addClump = (b: Branch, radius: number): void => {
  const end = sampleBranch(b, 1);
  clumps.push({ centre: add(add(end.p, scl(end.tan, radius * 0.35)), [0, -radius * 0.25, 0]), radius });
};

const TRUNK_LEN = 3.9;
const trunk = grow([0, Y0 - 0.35, 0], [0.04, 1, 0.03], TRUNK_LEN + 0.35, 0.62, 0.4, 0, 12, 0.07, 0.0, 0.5);

const LIMBS = 7;
const limbs: Branch[] = [];
for (let i = 0; i < LIMBS; i += 1) {
  const u = i / (LIMBS - 1);
  const phi = i * 2.39996 + range(-0.25, 0.25);
  const theta = i === LIMBS - 1 ? 0.3 : range(0.85, 1.3);
  const dir: V3 = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
  const s = sampleBranch(trunk, 0.52 + 0.46 * u);
  const length = i === LIMBS - 1 ? 2.7 : range(3.0, 3.6) - 0.7 * u;
  const limb = grow(s.p, dir, length, s.r * 0.62, s.r * 0.2, 1, 6, 0.28, 0.07);
  limbs.push(limb);
}
for (const limb of limbs) {
  [0.38, 0.64, 0.9].forEach((t, j) => {
    const s = sampleBranch(limb, t);
    const dir = fanDir(s.tan, range(0.6, 1.1), range(0, Math.PI * 2) + j * 2.1);
    const b2 = grow(s.p, dir, range(1.6, 2.1) - 0.2 * j, s.r * 0.66, s.r * 0.22, 2, 5, 0.3, 0.04);
    [0.45, 0.75, 1.0].forEach((t2, k) => {
      const s2 = sampleBranch(b2, t2);
      const dir2 = k === 2 ? fanDir(s2.tan, 0.25, range(0, 6.28)) : fanDir(s2.tan, range(0.6, 1.0), range(0, Math.PI * 2) + k * 2.4);
      const twig = grow(s2.p, dir2, range(0.9, 1.35), s2.r * 0.62, 0.014, 3, 4, 0.35, 0.0);
      addClump(twig, range(0.7, 1.25));
    });
  });
  addClump(limb, range(1.1, 1.5));
}
addClump(trunk, 1.4);

const branchCount = branches.length;
const foliageClumpCount = clumps.length;

// ---------------------------------------------------------------------------
// Bark mesh: trunk, limbs, twigs, plus surface roots following the mound
// ---------------------------------------------------------------------------
const barkPalette: RGB[] = [hex("#5a3f2c"), hex("#684a34"), hex("#785a3d"), hex("#8a6c48")];
const bark = new MeshBuilder();
for (const b of branches) {
  const base = barkPalette[b.level] as RGB;
  const jitter = range(-0.04, 0.04);
  const dark = hex("#33241a");
  bark.tube(
    b.points,
    b.radii,
    (i) => {
      const t = i / (b.points.length - 1);
      let c: RGB = [base[0] + jitter, base[1] + jitter, base[2] + jitter];
      if (b.level === 0) c = mixRgb(dark, c, clamp01(Math.pow(t, 0.45) + 0.2)); // darker, mossy flare
      return c;
    },
    b.level === 3 ? 5 : b.level === 2 ? 6 : 9
  );
}

const ROOTS = 7;
for (let i = 0; i < ROOTS; i += 1) {
  const th = (i / ROOTS) * Math.PI * 2 + range(-0.2, 0.2);
  const len = range(2.5, 3.5);
  const phase = range(0, 6);
  const N = 9;
  const pts: V3[] = [];
  const rad: number[] = [];
  for (let k = 0; k < N; k += 1) {
    const f = k / (N - 1);
    const d = 0.3 + f * len;
    const wob = Math.sin(f * 4 + phase) * 0.3 * f;
    const x = Math.cos(th) * d - Math.sin(th) * wob;
    const z = Math.sin(th) * d + Math.cos(th) * wob;
    const r = 0.42 * Math.pow(1 - f, 1.1) + 0.05;
    const y = ground(x, z) + r * 0.45 + 0.85 * Math.exp(-d * 1.7) - Math.pow(f, 3) * r * 1.3;
    pts.push([x, y, z]);
    rad.push(r);
  }
  bark.tube(pts, rad, (k) => mixRgb(hex("#3d2c1f"), hex("#5e4430"), k / (N - 1)), 8);
}

// ---------------------------------------------------------------------------
// Foliage: lobes per clump, autumn palette that warms with height
// ---------------------------------------------------------------------------
const leafTransforms: AuraTransformSpec[] = [];
const leafColors: string[] = [];
for (const c of clumps) {
  const hFrac = clamp01((c.centre[1] - 3.5) / 6);
  const green = rand() < 0.14;
  const hue = green ? range(78, 98) : 6 + 44 * hFrac + range(-9, 9);
  const sat = green ? range(48, 60) : range(68, 86);
  const light = green ? range(30, 38) : range(38, 52);
  const lobes = 4;
  for (let k = 0; k < lobes; k += 1) {
    const centre = k === 0;
    const off: V3 = centre ? [0, 0, 0] : [range(-1, 1) * c.radius * 0.6, range(-0.6, 0.7) * c.radius * 0.5, range(-1, 1) * c.radius * 0.6];
    const d = centre ? c.radius * 2 : c.radius * range(1.1, 1.5);
    leafTransforms.push({
      position: [c.centre[0] + off[0], c.centre[1] + off[1], c.centre[2] + off[2]],
      rotation: [0, range(0, 6.28), 0],
      scale: [d, d * 0.82, d]
    });
    leafColors.push(`hsl(${(hue + range(-5, 5)).toFixed(1)}, ${sat.toFixed(0)}%, ${(light + range(-5, 6)).toFixed(0)}%)`);
  }
}

// ---------------------------------------------------------------------------
// Ground details: fallen leaves, mushrooms, trunk hollow and knot, rope swing
// ---------------------------------------------------------------------------
const fallenLeaves: AuraTransformSpec[] = [];
const fallenColors: string[] = [];
for (let i = 0; i < 70; i += 1) {
  const a = range(0, Math.PI * 2);
  const r = 1.6 + 6.2 * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = range(0.7, 1.3);
  fallenLeaves.push({
    position: [x, ground(x, z) + 0.03, z],
    rotation: [range(-0.15, 0.15), range(0, 6.28), range(-0.15, 0.15)],
    scale: [0.26 * s, 0.015, 0.17 * s]
  });
  fallenColors.push(`hsl(${range(6, 48).toFixed(0)}, ${range(70, 88).toFixed(0)}%, ${range(36, 52).toFixed(0)}%)`);
}

const stems: AuraTransformSpec[] = [];
const caps: AuraTransformSpec[] = [];
const capColors: string[] = [];
const mushroomSpots: Array<[number, number, number, string]> = [
  [2.3, 0.35, 0.34, "#c7392b"],
  [2.65, 0.05, 0.22, "#c7392b"],
  [2.45, 0.62, 0.18, "#d9843a"],
  [-1.9, 2.6, 0.3, "#c7392b"],
  [-2.2, 2.85, 0.2, "#d9843a"]
];
for (const [mx, mz, s, color] of mushroomSpots) {
  const gy = ground(mx, mz);
  stems.push({ position: [mx, gy + s * 0.6, mz], scale: [s * 0.42, s * 1.3, s * 0.42] });
  caps.push({ position: [mx, gy + s * 1.3, mz], scale: [s * 1.35, s * 0.7, s * 1.35] });
  capColors.push(color);
}

// Trunk hollow and knot (facing +z, toward the starting camera).
const trunkAt = (t: number): Sample => sampleBranch(trunk, t);
const hollowBase = trunkAt(0.24);
const hollowPos: V3 = [hollowBase.p[0], hollowBase.p[1], hollowBase.p[2] + hollowBase.r * 0.93];
const knotBase = trunkAt(0.58);
const knotAngle = -0.9;
const knotPos: V3 = [knotBase.p[0] + Math.sin(knotAngle) * knotBase.r * 0.95, knotBase.p[1], knotBase.p[2] + Math.cos(knotAngle) * knotBase.r * 0.95];

// Rope swing from the lowest limb.
const swingLimb = limbs[0] as Branch;
const sw = sampleBranch(swingLimb, 0.62);
const side = norm(cross(sw.tan, [0, 1, 0]));
const seatY = ground(sw.p[0], sw.p[2]) + 0.95;
const ropeLen = Math.max(1.2, sw.p[1] - seatY);
const ropeMat = material.pbr({ color: "#c9a96a", roughness: 0.95 });
const seatYaw = Math.atan2(-side[2], side[0]);

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const sunElevation = 55;
const sunAzimuth = 100;
const sunRad = (d: number): number => (d * Math.PI) / 180;
const sunPos: V3 = [
  Math.sin(sunRad(sunAzimuth)) * Math.cos(sunRad(sunElevation)) * 32,
  Math.sin(sunRad(sunElevation)) * 32,
  -Math.cos(sunRad(sunAzimuth)) * Math.cos(sunRad(sunElevation)) * 32
];

const barkGeometry = geometry.define({
  positions: new Float32Array(bark.pos),
  normals: new Float32Array(bark.nor),
  colors: new Float32Array(bark.col),
  indices: bark.idx,
  bounds: { min: bark.min, max: bark.max }
});

const white = material.pbr({ color: "#ffffff", roughness: 0.9 });

const app = createAuraApp("#app", {
  resize: false,
  scene: scene({ background: "#9ec3e6" })
    .add(sky.preetham({ sun: { elevationDeg: sunElevation, azimuthDeg: sunAzimuth, intensity: 1 } }))
    .add(lights.hemisphere({ skyColor: "#cfe0f4", groundColor: "#6a5a30", intensity: 0.75 }))
    .add(lights.directional({ name: "key", position: sunPos, target: [0, 3, 0], intensity: 3.6, color: "#ffe6bf", shadow: true }))
    .add(primitives.plane({ name: "meadow", size: [220, 1, 220], material: material.pbr({ color: "#5f8030", roughness: 1 }), castShadow: false }).position(0, -0.02, 0))
    .add(geometry.custom(buildMound(), { name: "mound", material: white }))
    .add(geometry.custom(barkGeometry, { name: "tree-bark", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
    .add(instances.sphere({ name: "leaf-clumps", transforms: leafTransforms, colors: leafColors, material: material.pbr({ color: "#ffffff", roughness: 0.85 }) }))
    .add(instances.box({ name: "fallen-leaves", transforms: fallenLeaves, colors: fallenColors, material: white, castShadow: false }))
    .add(instances.cylinder({ name: "mushroom-stems", transforms: stems, material: material.pbr({ color: "#efe3c8", roughness: 0.8 }), params: { radialSegments: 8 } }))
    .add(instances.sphere({ name: "mushroom-caps", transforms: caps, colors: capColors, material: white }))
    .add(primitives.sphere({ name: "hollow-rim", size: [0.95, 1.2, 0.5], material: material.pbr({ color: "#4a3323", roughness: 1 }) }).position(hollowPos[0], hollowPos[1], hollowPos[2] - 0.04))
    .add(primitives.sphere({ name: "hollow", size: [0.62, 0.86, 0.4], material: material.pbr({ color: "#120b07", roughness: 1 }) }).position(hollowPos[0], hollowPos[1] - 0.02, hollowPos[2] + 0.06))
    .add(primitives.sphere({ name: "trunk-knot", size: [0.5, 0.42, 0.4], material: material.pbr({ color: "#4a3323", roughness: 1 }) }).position(knotPos[0], knotPos[1], knotPos[2]))
    .add(primitives.cylinder({ name: "rope-a", size: [0.045, ropeLen, 0.045], material: ropeMat }).position(sw.p[0] + side[0] * 0.3, sw.p[1] - ropeLen / 2 + 0.05, sw.p[2] + side[2] * 0.3))
    .add(primitives.cylinder({ name: "rope-b", size: [0.045, ropeLen, 0.045], material: ropeMat }).position(sw.p[0] - side[0] * 0.3, sw.p[1] - ropeLen / 2 + 0.05, sw.p[2] - side[2] * 0.3))
    .add(primitives.box({ name: "swing-seat", size: [0.8, 0.07, 0.26], material: material.pbr({ color: "#8a5a2e", roughness: 0.85 }) }).position(sw.p[0], sw.p[1] - ropeLen + 0.03, sw.p[2]).rotate(0, seatYaw, 0))
    .add(primitives.sphere({ name: "focus", size: 0.06, material: material.pbr({ color: "#5a3f2c", roughness: 1 }) }).position(0, 5, 0))
    .add(effects.fog({ color: "#cfdceb", density: 0.0025 }))
    .add(interactions.orbit({ target: "focus", autoRotate: true }))
    .camera(camera.orbit({ position: [0, 7.5, 23], target: [0, 5, 0], fov: 40 }))
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
    window.__TASK_STATE__ = { ready: true, branchCount, foliageClumpCount, seed: SEED };
  });
});
