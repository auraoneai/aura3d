import { camera, createAuraApp, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

type V3 = [number, number, number];
const SEED = 20240611;

// ---------- seeded RNG ----------
let rngState = SEED >>> 0;
const rand = (): number => (rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0) / 4294967296;
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- vector helpers ----------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

// ---------- terrain ----------
const MOUND_R = 9;
const MOUND_H = 1.4;
const moundY = (rho: number): number =>
  rho >= MOUND_R ? -MOUND_H : -MOUND_H + MOUND_H * Math.sqrt(1 - (rho / MOUND_R) ** 2);

// ---------- merged tube mesh (bark) ----------
const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const idx: number[] = [];
const bmin: V3 = [1e9, 1e9, 1e9];
const bmax: V3 = [-1e9, -1e9, -1e9];

function addTube(
  pts: V3[],
  radii: number[],
  sides: number,
  c0: V3,
  c1: V3,
  mulFn?: (t: number, theta: number) => number
): void {
  const base = pos.length / 3;
  let u: V3 | undefined;
  for (let i = 0; i < pts.length; i += 1) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const tg = norm(sub(next, prev));
    if (!u) {
      const a: V3 = Math.abs(tg[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      u = norm(cross(a, tg));
    } else {
      u = norm(sub(u, mul(tg, dot(u, tg))));
    }
    const v = cross(tg, u);
    const t = i / (pts.length - 1);
    const k = 1 - t;
    const color: V3 = [c0[0] * k + c1[0] * t, c0[1] * k + c1[1] * t, c0[2] * k + c1[2] * t];
    for (let s = 0; s < sides; s += 1) {
      const th = (s / sides) * Math.PI * 2;
      const rd = norm(add(mul(u, Math.cos(th)), mul(v, Math.sin(th))));
      const r = radii[i]! * (mulFn ? mulFn(t, th) : 1);
      const p = add(pts[i]!, mul(rd, r));
      pos.push(p[0], p[1], p[2]);
      nor.push(rd[0], rd[1], rd[2]);
      col.push(color[0], color[1], color[2], 1);
      for (let q = 0; q < 3; q += 1) {
        bmin[q] = Math.min(bmin[q]!, p[q]!);
        bmax[q] = Math.max(bmax[q]!, p[q]!);
      }
    }
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (let s = 0; s < sides; s += 1) {
      const s2 = (s + 1) % sides;
      const a = base + i * sides + s;
      const b = base + i * sides + s2;
      const c = base + (i + 1) * sides + s;
      const d = base + (i + 1) * sides + s2;
      idx.push(a, b, c, b, d, c);
    }
  }
}

// ---------- procedural tree ----------
interface Branch {
  pts: V3[];
  radii: number[];
  dirs: V3[];
  level: number;
}
const branches: Branch[] = [];
const clumpSpots: { p: V3; level: number }[] = [];

const BARK_DARK: V3 = [0.2, 0.12, 0.07];
const BARK_MID: V3 = [0.32, 0.21, 0.12];
const BARK_LIGHT: V3 = [0.42, 0.3, 0.19];

function childDir(d: V3, phi: number, spread: number, up: number): V3 {
  const a: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(a, d));
  const v = cross(d, u);
  const side = add(mul(u, Math.cos(phi)), mul(v, Math.sin(phi)));
  return norm(add(add(mul(d, 0.65), mul(side, spread)), [0, up, 0]));
}

function grow(start: V3, dir: V3, length: number, r0: number, r1: number, level: number, segs: number): Branch {
  const pts: V3[] = [start];
  const dirs: V3[] = [];
  const radii: number[] = [];
  let d = dir;
  let p = start;
  const jitter = level === 1 ? 0.22 : 0.3;
  const upBias = level === 1 ? 0.1 : 0.06;
  for (let i = 0; i <= segs; i += 1) {
    radii.push(r0 + (r1 - r0) * (i / segs));
    dirs.push(d);
    if (i === segs) break;
    d = norm(add(d, [range(-jitter, jitter), range(-jitter, jitter) + upBias, range(-jitter, jitter)]));
    p = add(p, mul(d, length / segs));
    pts.push(p);
  }
  const b: Branch = { pts, radii, dirs, level };
  branches.push(b);
  addTube(pts, radii, level === 1 ? 9 : 6, level === 1 ? BARK_MID : BARK_LIGHT, level === 1 ? BARK_LIGHT : BARK_LIGHT);
  return b;
}

// Trunk
const TRUNK_H = 6.2;
const TRUNK_SEGS = 14;
const trunkPts: V3[] = [];
const trunkRadii: number[] = [];
const trunkR = (t: number): number => 0.6 - 0.3 * t;
{
  const ph = rand() * 6;
  for (let i = 0; i <= TRUNK_SEGS; i += 1) {
    const t = i / TRUNK_SEGS;
    trunkPts.push([0.45 * Math.sin(t * 3 + ph) * t, -0.4 + (TRUNK_H + 0.4) * t, 0.35 * Math.sin(t * 2.4 + ph * 1.3) * t]);
    trunkRadii.push(trunkR(t));
  }
  const lobePhase = rand() * 6;
  addTube(trunkPts, trunkRadii, 14, BARK_DARK, BARK_MID, (t, th) => {
    const f = Math.exp(-t * 9);
    return 1 + 1.3 * Math.exp(-t * 10) + 0.28 * f * Math.cos(5 * th + lobePhase);
  });
}
const trunkBranch: Branch = {
  pts: trunkPts,
  radii: trunkRadii,
  dirs: trunkPts.map((_, i) => norm(sub(trunkPts[Math.min(i + 1, TRUNK_SEGS)]!, trunkPts[Math.max(i - 1, 0)]!))),
  level: 0
};
branches.push(trunkBranch);

// Surface roots
const ROOT_COUNT = 7;
for (let i = 0; i < ROOT_COUNT; i += 1) {
  const az = (i / ROOT_COUNT) * Math.PI * 2 + range(-0.25, 0.25);
  const reach = range(2.6, 3.8);
  const baseR = range(0.2, 0.3);
  const pts: V3[] = [];
  const radii: number[] = [];
  const wob = range(-0.5, 0.5);
  const N = 9;
  for (let s = 0; s <= N; s += 1) {
    const t = s / N;
    const rho = 0.25 + t * reach;
    const a = az + wob * t * t;
    const r = baseR * (1 - t) + 0.035 * t;
    const y = moundY(rho) + r * 0.3 + 0.55 * (1 - t) ** 3;
    pts.push([Math.cos(a) * rho, y, Math.sin(a) * rho]);
    radii.push(r);
  }
  addTube(pts, radii, 7, BARK_DARK, BARK_MID);
}

// Major limbs
const LIMB_COUNT = 8;
let swingLimb: Branch | undefined;
for (let i = 0; i < LIMB_COUNT; i += 1) {
  const tAttach = i === 0 ? 0.42 : i >= LIMB_COUNT - 2 ? 1 : 0.5 + (i / LIMB_COUNT) * 0.45;
  const k = Math.min(TRUNK_SEGS, Math.round(tAttach * TRUNK_SEGS));
  const start = trunkPts[k]!;
  const az = i === 0 ? 2.3 : i * 2.4 + range(-0.3, 0.3);
  const el = i === 0 ? 0.42 : i >= LIMB_COUNT - 2 ? range(1.1, 1.3) : range(0.5, 0.95);
  const dir: V3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
  const len = i === 0 ? 4.6 : range(3.2, 4.4);
  const limb = grow(start, dir, len, trunkR(tAttach) * 0.5, 0.07, 1, 8);
  if (i === 0) swingLimb = limb;
  clumpSpots.push({ p: add(limb.pts[limb.pts.length - 1]!, mul(limb.dirs[limb.dirs.length - 1]!, 0.35)), level: 1 });

  // Twigs
  const twigCount = 3;
  for (let j = 0; j < twigCount; j += 1) {
    const idxT = Math.round(range(0.4, 0.85) * (limb.pts.length - 1));
    const sp = limb.pts[idxT]!;
    const phi = j * 2.1 + range(0, 1) + i;
    const td = childDir(limb.dirs[idxT]!, phi, 0.9, 0.22);
    const twig = grow(sp, td, range(1.8, 2.8), limb.radii[idxT]! * 0.55, 0.035, 2, 5);
    clumpSpots.push({ p: add(twig.pts[twig.pts.length - 1]!, mul(twig.dirs[twig.dirs.length - 1]!, 0.3)), level: 2 });

    const subCount = 1 + Math.floor(rand() * 2);
    for (let m = 0; m < subCount; m += 1) {
      const idxS = Math.round(range(0.5, 0.9) * (twig.pts.length - 1));
      const sd = childDir(twig.dirs[idxS]!, m * 3 + range(0, 2), 0.9, 0.15);
      const sub3 = grow(twig.pts[idxS]!, sd, range(0.9, 1.5), twig.radii[idxS]! * 0.6, 0.015, 3, 4);
      clumpSpots.push({ p: add(sub3.pts[sub3.pts.length - 1]!, mul(sub3.dirs[sub3.dirs.length - 1]!, 0.2)), level: 3 });
    }
  }
}
const branchCount = branches.length;

// ---------- scene ----------
const barkMat = material.pbr({ color: "#ffffff", roughness: 0.95 });
const barkGeo = geometry.define({
  positions: new Float32Array(pos),
  normals: new Float32Array(nor),
  colors: new Float32Array(col),
  indices: idx,
  bounds: { min: bmin, max: bmax }
});

let sc = scene({ background: "#9cc4e4" })
  .camera(camera.orbit({ position: [0, 9, 27], target: [0, 5.2, 0], fov: 42, near: 1, far: 250, autoRotate: 0.15 }))
  .add(sky.gradient({ zenith: "#4f86c6", horizon: "#cfe4f2" }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#6b7a45", intensity: 1.0 }))
  .add(lights.directional({ name: "sun", position: [11, 17, 8], target: [0, 3, 0], intensity: 3.2, color: "#fff1d6", shadow: true }))
  .add(
    primitives.plane({
      name: "ground",
      size: [160, 1, 160],
      material: material.pbr({ color: "#5b8a3a", roughness: 1 })
    }).position(0, -MOUND_H + 0.15, 0)
  )
  .add(
    primitives.sphere({
      name: "mound",
      size: [MOUND_R * 2, MOUND_H * 2, MOUND_R * 2],
      material: material.pbr({ color: "#6fa545", roughness: 1 })
    }).position(0, -MOUND_H, 0)
  )
  .add(geometry.custom(barkGeo, { name: "tree-bark", material: barkMat }));

// Knot and hollow on trunk
{
  const k = 4;
  const c = trunkPts[k]!;
  const t = k / TRUNK_SEGS;
  const R = trunkR(t) * (1 + 1.3 * Math.exp(-t * 10));
  const phi = 0.7;
  const dir: V3 = [Math.sin(phi), 0, Math.cos(phi)];
  const knotC = add(c, mul(dir, R * 0.92));
  const hollowC = add(c, mul(dir, R * 1.04));
  sc = sc
    .add(
      primitives.sphere({ name: "knot", size: [0.75, 1.0, 0.5], material: material.pbr({ color: "#4a3320", roughness: 1 }) })
        .position(knotC[0], knotC[1] + 0.05, knotC[2])
        .rotate(0, phi, 0)
    )
    .add(
      primitives.sphere({ name: "hollow", size: [0.42, 0.62, 0.22], material: material.pbr({ color: "#080504", roughness: 1 }) })
        .position(hollowC[0], hollowC[1] + 0.05, hollowC[2])
        .rotate(0, phi, 0)
    );
}

// Foliage clumps
const palette = ["#b8321f", "#d9561f", "#ee8a22", "#f2b632", "#c5b83a", "#7f9a2c"];
const leafMats = palette.map((c) => material.pbr({ color: c, roughness: 0.85 }));
let clumpCount = 0;
for (const spot of clumpSpots) {
  const i = clumpCount;
  const size = spot.level === 1 ? range(1.6, 2.4) : spot.level === 2 ? range(1.3, 2.0) : range(0.95, 1.5);
  const ci = Math.floor(rand() * palette.length);
  sc = sc.add(
    primitives.sphere({ name: `clump-${i}`, size: [size, size * 0.82, size], material: leafMats[ci]! })
      .position(spot.p[0], spot.p[1], spot.p[2])
  );
  const so = size * 0.5;
  const sz = size * range(0.55, 0.75);
  sc = sc.add(
    primitives.sphere({ name: `clump-${i}-b`, size: [sz, sz * 0.85, sz], material: leafMats[(ci + 1 + Math.floor(rand() * 2)) % palette.length]! })
      .position(spot.p[0] + range(-so, so), spot.p[1] + range(-0.1, so * 0.8), spot.p[2] + range(-so, so))
  );
  clumpCount += 1;
}

// Rope swing hanging from the low limb
if (swingLimb) {
  const a = swingLimb.pts[Math.floor(swingLimb.pts.length * 0.62)]!;
  const seatY = Math.max(moundY(Math.hypot(a[0], a[2])) + 0.9, 0.5);
  const len = a[1] - seatY;
  const rope = material.pbr({ color: "#b79a6a", roughness: 0.9 });
  const yaw = 0.6;
  const off: V3 = [Math.cos(yaw) * 0.22, 0, -Math.sin(yaw) * 0.22];
  for (const sgn of [-1, 1]) {
    sc = sc.add(
      primitives.cylinder({ name: `rope-${sgn}`, size: [0.05, len, 0.05], material: rope })
        .position(a[0] + off[0] * sgn, seatY + len / 2, a[2] + off[2] * sgn)
    );
  }
  sc = sc.add(
    primitives.box({ name: "swing-seat", size: [0.62, 0.07, 0.2], material: material.pbr({ color: "#8a5a2b", roughness: 0.8 }) })
      .position(a[0], seatY, a[2])
      .rotate(0, yaw, 0)
  );
}

// Mushrooms
{
  const stem = material.pbr({ color: "#f1e8d6", roughness: 0.8 });
  const cap = material.pbr({ color: "#c8341f", roughness: 0.6 });
  const spots: [number, number, number][] = [[1.9, 1.4, 0.45], [2.2, 1.0, 0.3], [-1.6, 2.2, 0.38]];
  spots.forEach(([x, z, s], i) => {
    const y = moundY(Math.hypot(x, z));
    sc = sc
      .add(primitives.cylinder({ name: `mush-stem-${i}`, size: [0.14 * s * 2, 0.4 * s * 2, 0.14 * s * 2], material: stem }).position(x, y + 0.2 * s * 2, z))
      .add(primitives.sphere({ name: `mush-cap-${i}`, size: [0.5 * s * 2, 0.28 * s * 2, 0.5 * s * 2], material: cap }).position(x, y + 0.42 * s * 2, z));
  });
}

// Fallen leaves
for (let i = 0; i < 26; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = range(1.2, 6.5);
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = range(0.2, 0.34);
  sc = sc.add(
    primitives.sphere({ name: `leaf-${i}`, size: [s, 0.03, s * 0.6], material: leafMats[Math.floor(rand() * 5)]!, castShadow: false })
      .position(x, moundY(r) + 0.03, z)
      .rotate(0, rand() * 6.28, 0)
  );
}

const app = createAuraApp("#app", { scene: sc });
await app.ready();
window.__TASK_STATE__ = { ready: true, branchCount, foliageClumpCount: clumpCount, seed: SEED };
window.__EVAL_READY__ = true;
