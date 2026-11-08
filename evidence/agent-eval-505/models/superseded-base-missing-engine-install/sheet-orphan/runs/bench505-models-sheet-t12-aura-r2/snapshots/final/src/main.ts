import { camera, createAuraApp, effects, geometry, group, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; branchCount: number; foliageClumpCount: number; seed: number };
  }
}

type V3 = [number, number, number];

// ---------- seeded random ----------
const SEED = 20240611;
let rs = SEED >>> 0;
const rand = (): number => (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- vector helpers ----------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const perpFrame = (t: V3): [V3, V3] => {
  const ref: V3 = Math.abs(t[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const n = norm(sub(ref, mul(t, dot(ref, t))));
  return [n, cross(t, n)];
};

// ---------- tapered tube mesh along a path ----------
const tube = (name: string, pts: V3[], radii: number[], sides: number, mat: ReturnType<typeof material.pbr>) => {
  const rings = pts.length;
  const positions = new Float32Array(rings * sides * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  let n: V3 | null = null;
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < rings; i += 1) {
    const prev = pts[Math.max(0, i - 1)]!, next = pts[Math.min(rings - 1, i + 1)]!;
    const t = norm(sub(next, prev));
    if (n === null) n = perpFrame(t)[0];
    else n = norm(sub(n, mul(t, dot(n, t))));
    const b = cross(t, n);
    for (let k = 0; k < sides; k += 1) {
      const a = (k / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const dir: V3 = [n[0] * c + b[0] * s, n[1] * c + b[1] * s, n[2] * c + b[2] * s];
      const p = add(pts[i]!, mul(dir, radii[i]!));
      const v = (i * sides + k) * 3;
      positions.set(p, v);
      normals.set(dir, v);
      for (let q = 0; q < 3; q += 1) {
        min[q] = Math.min(min[q]!, p[q]!);
        max[q] = Math.max(max[q]!, p[q]!);
      }
    }
  }
  for (let i = 0; i < rings - 1; i += 1) {
    for (let k = 0; k < sides; k += 1) {
      const k2 = (k + 1) % sides;
      const a = i * sides + k, b = i * sides + k2, c = (i + 1) * sides + k, d = (i + 1) * sides + k2;
      indices.push(a, b, c, b, d, c);
    }
  }
  return geometry.custom(geometry.define({ positions, normals, indices, bounds: { min, max } }), { name, material: mat });
};

// ---------- scene ----------
const MOUND_R = 5, MOUND_H = 0.8;
const moundY = (r: number): number => (r >= MOUND_R ? -MOUND_H : -MOUND_H + MOUND_H * Math.sqrt(1 - (r / MOUND_R) ** 2));

let sc = scene({ background: "#a9cbe6" })
  .camera(camera.orbit({ position: [0, 6.5, 17.5], target: [0, 4.4, 0], fov: 45, near: 1, far: 300, autoRotate: 0.15 }))
  .add(sky.preetham({ sun: { elevationDeg: 55, azimuthDeg: 125, intensity: 1 } }))
  .add(lights.hemisphere({ skyColor: "#d6e6f5", groundColor: "#6b7c47", intensity: 1.0 }))
  .add(lights.directional({ name: "key", position: [9, 27, 7], target: [0, 1, 0], intensity: 3.2, shadow: true }))
  .add(effects.fog({ color: "#b9d3e8", density: 0.004 }))
  .add(primitives.plane({ name: "ground", size: [240, 1, 240], material: material.pbr({ color: "#5f8a3c", roughness: 1 }), castShadow: false }).position(0, -MOUND_H - 0.01, 0))
  .add(primitives.sphere({ name: "mound", size: [MOUND_R * 2, MOUND_H * 2, MOUND_R * 2], material: material.pbr({ color: "#6fa043", roughness: 1 }) }).position(0, 0, 0));
type SceneNode = Parameters<typeof sc.add>[0];
const put = (n: SceneNode): void => {
  sc = sc.add(n);
};

const bark = material.pbr({ color: "#6a4a33", roughness: 1 });
const barkDark = material.pbr({ color: "#4a3224", roughness: 1 });

// ---------- trunk ----------
const TRUNK_H = 5.2;
const trunkCenter = (s: number): V3 => [0.28 * Math.sin(s * 3), s * TRUNK_H, 0.2 * Math.sin(s * 2.2 + 1)];
const trunkRadius = (s: number): number => 0.62 - 0.32 * Math.pow(s, 0.8) + 0.4 * Math.exp(-s * 12);

interface Path { pts: V3[]; radii: number[] }
const sample = (p: Path, u: number): { pos: V3; tan: V3; r: number } => {
  const f = Math.min(Math.max(u, 0), 1) * (p.pts.length - 1);
  const i = Math.min(Math.floor(f), p.pts.length - 2), w = f - i;
  const a = p.pts[i]!, b = p.pts[i + 1]!;
  return { pos: add(mul(a, 1 - w), mul(b, w)), tan: norm(sub(b, a)), r: p.radii[i]! * (1 - w) + p.radii[i + 1]! * w };
};

let branchCount = 0;
const tips: V3[] = [];
const twigEnds: V3[] = [];

const trunkPath: Path = { pts: [], radii: [] };
for (let i = 0; i <= 16; i += 1) {
  const s = i / 16;
  trunkPath.pts.push(trunkCenter(s));
  trunkPath.radii.push(trunkRadius(s));
}
put(tube("trunk", trunkPath.pts, trunkPath.radii, 14, bark));
branchCount += 1;

// ---------- branches ----------
const limbPaths: Path[] = [];
const grow = (name: string, parent: Path, u: number, azimuth: number, phiDeg: number, length: number, level: 1 | 2 | 3): Path => {
  const sp = sample(parent, u);
  const [fn, fb] = perpFrame(sp.tan);
  const phi = (phiDeg * Math.PI) / 180;
  const h = add(mul(fn, Math.cos(azimuth)), mul(fb, Math.sin(azimuth)));
  let dir = norm(add(mul(sp.tan, Math.cos(phi)), mul(h, Math.sin(phi))));
  dir = norm([dir[0], dir[1] + (level === 1 ? 0.12 : 0.3), dir[2]]);
  const wob = norm(cross(dir, [range(-1, 1), range(-0.3, 0.3), range(-1, 1)]));
  const r0 = sp.r * (level === 1 ? 0.72 : 0.62), r1 = Math.max(0.018, r0 * 0.3);
  const steps = level === 3 ? 4 : 6;
  const start = sub(sp.pos, mul(dir, 0.1));
  const pts: V3[] = [], radii: number[] = [];
  const lift = level === 1 ? 0.22 : 0.3;
  for (let i = 0; i <= steps; i += 1) {
    const s = i / steps;
    let p = add(start, mul(dir, length * s));
    p = add(p, mul(wob, length * 0.14 * Math.sin(Math.PI * s)));
    p = add(p, [0, lift * length * s * s, 0]);
    pts.push(p);
    radii.push(i === 0 ? r0 : r0 + (r1 - r0) * Math.pow(s, 0.85));
  }
  const path: Path = { pts, radii };
  put(tube(name, pts, radii, level === 3 ? 6 : 8, level === 1 ? bark : barkDark));
  branchCount += 1;
  return path;
};

const GOLDEN = 2.399963;
const limbCount = 7;
for (let i = 0; i < limbCount; i += 1) {
  const top = i === limbCount - 1;
  const swing = i === 0;
  const u = top ? 1 : 0.5 + 0.4 * (i / (limbCount - 2));
  const az = swing ? -Math.PI / 2 + 0.4 : i * GOLDEN + range(-0.2, 0.2);
  const phi = top ? 10 : swing ? 68 : range(38, 62);
  const len = top ? 3.2 : swing ? 4.4 : range(3.0, 4.2) - (u - 0.5) * 2;
  const limb = grow(`limb-${i}`, trunkPath, u, az, phi, len, 1);
  limbPaths.push(limb);
  const us = [0.35, 0.68, 0.93];
  for (let j = 0; j < us.length; j += 1) {
    const mid = grow(`branch-${i}-${j}`, limb, us[j]!, range(0, Math.PI * 2), range(34, 56), len * range(0.4, 0.55), 2);
    for (let m = 0; m < 2; m += 1) {
      const tw = grow(`twig-${i}-${j}-${m}`, mid, m === 0 ? 0.55 : 0.97, range(0, Math.PI * 2) + m * Math.PI, range(28, 48), range(1.0, 1.5), 3);
      twigEnds.push(tw.pts[tw.pts.length - 1]!);
    }
    tips.push(mid.pts[mid.pts.length - 1]!);
  }
}

// ---------- surface roots ----------
const rootCount = 7;
for (let i = 0; i < rootCount; i += 1) {
  const a0 = (i / rootCount) * Math.PI * 2 + range(-0.25, 0.25), ph = range(0, 6);
  const len = range(2.0, 2.6);
  const pts: V3[] = [], radii: number[] = [];
  for (let k = 0; k <= 8; k += 1) {
    const s = k / 8, a = a0 + 0.25 * Math.sin(s * 4 + ph), d = 0.3 + len * Math.pow(s, 1.1);
    pts.push([Math.cos(a) * d, 0.8 * Math.pow(1 - s, 2) - 0.26 * s, Math.sin(a) * d]);
    radii.push(0.34 * (1 - s) + 0.05);
  }
  put(tube(`root-${i}`, pts, radii, 8, bark));
}

// ---------- trunk knot / hollow ----------
{
  const s = 0.22, c = trunkCenter(s), r = trunkRadius(s);
  const d = norm([0.15, 0, 1]);
  put(primitives.sphere({ name: "knot-lip", size: [0.78, 1.0, 0.4], material: barkDark }).position(c[0] + d[0] * r * 0.97, c[1], c[2] + d[2] * r * 0.97));
  put(primitives.sphere({ name: "hollow", size: [0.5, 0.7, 0.3], material: material.pbr({ color: "#140c07", roughness: 1 }) }).position(c[0] + d[0] * r * 1.08, c[1] - 0.02, c[2] + d[2] * r * 1.08));
}

// ---------- foliage clumps ----------
const palette = ["#4c8a37", "#6ba540", "#93b843", "#d3a52b", "#d97a26", "#b8481f"];
const leafMats = palette.map((color) => material.pbr({ color, roughness: 0.85 }));
const clumpSites: V3[] = twigEnds.concat(tips.filter((_, i) => i % 3 === 0));
let clumpCount = 0;
for (const site of clumpSites) {
  const size = range(1.0, 1.9);
  const kids: Parameters<typeof group>[1] = [
    primitives.sphere({ name: `leaf-main-${clumpCount}`, size: [size, size * 0.8, size], material: leafMats[Math.floor(rand() * leafMats.length)]! }),
    primitives.sphere({ name: `leaf-a-${clumpCount}`, size: size * 0.6, material: leafMats[Math.floor(rand() * leafMats.length)]! }).position(size * 0.4, size * 0.15, range(-0.3, 0.3) * size),
    primitives.sphere({ name: `leaf-b-${clumpCount}`, size: size * 0.55, material: leafMats[Math.floor(rand() * leafMats.length)]! }).position(-size * 0.35, size * 0.25, size * range(-0.4, 0.4))
  ];
  put(group(`clump-${clumpCount}`, kids, { position: [site[0], site[1] + size * 0.2, site[2]] }));
  clumpCount += 1;
}

// ---------- rope swing on limb 0 ----------
{
  const a = sample(limbPaths[0]!, 0.55).pos;
  const seatY = 0.95, len = a[1] - seatY;
  const rope = material.pbr({ color: "#c9b27c", roughness: 1 });
  for (const dx of [-0.22, 0.22]) {
    put(primitives.cylinder({ name: `rope-${dx}`, size: [0.04, len, 0.04], material: rope }).position(a[0] + dx, a[1] - len / 2, a[2]));
  }
  put(primitives.box({ name: "swing-seat", size: [0.62, 0.07, 0.24], material: material.pbr({ color: "#8a6238", roughness: 0.9 }) }).position(a[0], seatY, a[2]));
}

// ---------- mushrooms ----------
const mushrooms: Array<[number, number, number]> = [[2.1, 0.6, 1], [2.5, 1.0, 0.75], [1.9, 3.9, 0.9]];
mushrooms.forEach(([r, ang, sc2], i) => {
  const x = Math.cos(ang) * r, z = Math.sin(ang) * r, y = moundY(r);
  put(primitives.cylinder({ name: `mushroom-stem-${i}`, size: [0.09 * sc2, 0.26 * sc2, 0.09 * sc2], material: material.pbr({ color: "#efe6d2", roughness: 0.9 }) }).position(x, y + 0.12 * sc2, z));
  put(primitives.sphere({ name: `mushroom-cap-${i}`, size: [0.34 * sc2, 0.2 * sc2, 0.34 * sc2], material: material.pbr({ color: "#c0392b", roughness: 0.7 }) }).position(x, y + 0.27 * sc2, z));
});

// ---------- fallen leaves ----------
{
  const leaves: AuraTransformSpec[] = [];
  const colors: string[] = [];
  for (let i = 0; i < 45; i += 1) {
    const a = rand() * Math.PI * 2, r = 0.9 + 3.8 * Math.sqrt(rand());
    leaves.push({ position: [Math.cos(a) * r, moundY(r) + 0.015, Math.sin(a) * r], rotation: [0, rand() * 6.28, 0], scale: [0.22, 0.03, 0.14] });
    colors.push(palette[2 + Math.floor(rand() * 4)]!);
  }
  put(instances.sphere({ name: "fallen-leaves", transforms: leaves, colors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), castShadow: false }));
}

const app = createAuraApp("#app", { scene: sc });
await app.ready();
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
window.__TASK_STATE__ = { ready: true, branchCount, foliageClumpCount: clumpCount, seed: SEED };
window.__EVAL_READY__ = true;
