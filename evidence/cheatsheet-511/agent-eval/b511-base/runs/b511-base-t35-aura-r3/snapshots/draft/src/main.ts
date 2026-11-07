import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

type V3 = [number, number, number];

// ---- Custom crystal geometry: hexagonal-ish prism + pointed top, unshared vertices (flat shading), one colour per face.
interface CrystalSpec {
  base: V3;       // position of the crystal foot
  radius: number; // prism radius
  height: number; // prism body height
  tip: number;    // pointed top height
  sides: number;
  tiltX: number;
  tiltZ: number;
  yaw: number;
  hue: number;    // 0..360, face hues spread around this
}

const crystals: CrystalSpec[] = [
  { base: [0, 0, 0], radius: 0.5, height: 1.9, tip: 0.9, sides: 6, tiltX: 0.05, tiltZ: -0.04, yaw: 0.2, hue: 200 },
  { base: [0.85, 0, 0.25], radius: 0.34, height: 1.2, tip: 0.65, sides: 5, tiltX: -0.2, tiltZ: -0.42, yaw: 0.9, hue: 285 },
  { base: [-0.8, 0, 0.35], radius: 0.38, height: 1.45, tip: 0.7, sides: 6, tiltX: -0.12, tiltZ: 0.4, yaw: 0.5, hue: 165 },
  { base: [0.2, 0, -0.85], radius: 0.32, height: 1.0, tip: 0.6, sides: 5, tiltX: 0.45, tiltZ: -0.1, yaw: 1.4, hue: 320 },
  { base: [-0.35, 0, 0.95], radius: 0.28, height: 0.8, tip: 0.5, sides: 6, tiltX: -0.5, tiltZ: 0.15, yaw: 0.1, hue: 230 },
  { base: [1.3, 0, -0.55], radius: 0.24, height: 0.6, tip: 0.42, sides: 5, tiltX: 0.2, tiltZ: -0.65, yaw: 0.7, hue: 40 },
  { base: [-1.35, 0, -0.5], radius: 0.26, height: 0.75, tip: 0.45, sides: 6, tiltX: 0.25, tiltZ: 0.6, yaw: 1.1, hue: 190 }
];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const pos: number[] = [];
const nrm: number[] = [];
const col: number[] = [];
const idx: number[] = [];
let minB: V3 = [Infinity, Infinity, Infinity];
let maxB: V3 = [-Infinity, -Infinity, -Infinity];

function addTri(a: V3, b: V3, c: V3, centre: V3, color: [number, number, number]): void {
  const centroid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  let n = cross(sub(b, a), sub(c, a));
  let [p0, p1, p2] = [a, b, c];
  if (dot(n, sub(centroid, centre)) < 0) { // wind so the face normal points away from the crystal axis
    [p1, p2] = [p2, p1];
    n = cross(sub(p1, p0), sub(p2, p0));
  }
  const fn = norm(n);
  for (const p of [p0, p1, p2]) {
    idx.push(pos.length / 3);
    pos.push(p[0], p[1], p[2]);
    nrm.push(fn[0], fn[1], fn[2]);
    col.push(color[0], color[1], color[2], 1);
    for (let k = 0; k < 3; k += 1) {
      minB[k] = Math.min(minB[k] as number, p[k] as number);
      maxB[k] = Math.max(maxB[k] as number, p[k] as number);
    }
  }
}

crystals.forEach((c, ci) => {
  const cx = Math.cos(c.tiltX), sx = Math.sin(c.tiltX);
  const cz = Math.cos(c.tiltZ), sz = Math.sin(c.tiltZ);
  const place = (x: number, y: number, z: number): V3 => {
    // yaw (Y), then tilt about X, then tilt about Z, then translate to the foot.
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y2 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const x3 = x1 * cz - y2 * sz, y3 = x1 * sz + y2 * cz;
    return [c.base[0] + x3, c.base[1] + y3 - 0.02, c.base[2] + z2];
  };
  const centreAt = (y: number): V3 => place(0, y, 0);
  const n = c.sides;
  const ring = (y: number, r: number, i: number): V3 => {
    const a = (i / n) * Math.PI * 2;
    return place(Math.cos(a) * r, y, Math.sin(a) * r);
  };
  const apex = place(0, c.height + c.tip, 0);
  const bottom = centreAt(0);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const b0 = ring(0, c.radius, i), b1 = ring(0, c.radius, j);
    const t0 = ring(c.height, c.radius, i), t1 = ring(c.height, c.radius, j);
    const mid = centreAt(c.height * 0.5);
    // each side quad and each tip triangle gets its own colour
    const hueA = c.hue + (i / n) * 70 + ci * 9;
    const light = 0.38 + 0.2 * ((i * 5 + ci * 3) % n) / n;
    addTri(b0, b1, t1, mid, hsl(hueA % 360, 0.72, light));
    addTri(b0, t1, t0, mid, hsl((hueA + 14) % 360, 0.72, light + 0.05));
    addTri(t0, t1, apex, centreAt(c.height), hsl((hueA + 30) % 360, 0.8, light + 0.14));
    addTri(b0, b1, bottom, centreAt(-1), hsl(hueA % 360, 0.5, 0.2));
  }
});

const crystalGeometry = geometry.define({
  positions: new Float32Array(pos),
  normals: new Float32Array(nrm),
  colors: new Float32Array(col),
  indices: idx,
  bounds: { min: minB, max: maxB }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#06070d" })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(lights.hemisphere({ skyColor: "#2a3466", groundColor: "#0a0a14", intensity: 0.5 }))
    .add(lights.directional({ name: "key", position: [3, 6, 5], target: [0, 1, 0], intensity: 1.1, color: "#9db4ff" }))
    // rim lights from behind and the sides
    .add(lights.directional({ name: "rim-cyan", position: [-5, 3, -6], target: [0, 1, 0], intensity: 4.5, color: "#38e0ff" }))
    .add(lights.directional({ name: "rim-magenta", position: [6, 2.5, -5], target: [0, 1, 0], intensity: 4, color: "#ff4fd0" }))
    .add(lights.point({ name: "core-glow", position: [0, 1.2, 0.6], intensity: 6, color: "#8a6bff", distance: 7, decay: 2, shadow: false }))
    .add(primitives.cylinder({
      name: "pedestal",
      size: [4.2, 0.4, 4.2],
      position: [0, -0.22, 0],
      material: material.pbr({ color: "#1b1d2b", roughness: 0.35, metallic: 0.6 })
    }))
    .add(primitives.cylinder({
      name: "pedestal-top",
      size: [3.6, 0.06, 3.6],
      position: [0, 0.0, 0],
      material: material.pbr({ color: "#2b2f48", roughness: 0.2, metallic: 0.7 })
    }))
    .add(geometry.custom(crystalGeometry, {
      name: "crystals",
      material: material.pbr({ color: "#ffffff", roughness: 0.22, metallic: 0.1 }),
      castShadow: false
    }).runtime({ id: "crystals", mutable: true }))
    .add(effects.particles({
      name: "sparks-gold", position: [0, 0.1, 0], shape: "disc", shapeSize: 3.0, rate: 22, maxParticles: 160,
      lifetime: [3, 5.5], speed: [0.25, 0.65], size: [0.03, 0.07], gravity: 0, drag: 0.05,
      noise: { strength: 0.35, frequency: 0.8 }, blend: "additive", seed: 21, color: "#ffd88a", intensity: 2.2
    }))
    .add(effects.particles({
      name: "sparks-cyan", position: [0, 0.1, 0], shape: "disc", shapeSize: 3.4, rate: 16, maxParticles: 120,
      lifetime: [3.5, 6], speed: [0.2, 0.55], size: [0.025, 0.06], gravity: 0, drag: 0.05,
      noise: { strength: 0.4, frequency: 0.7 }, blend: "additive", seed: 33, color: "#8ff3ff", intensity: 2.4
    }))
    .add(effects.bloom({ intensity: 0.6, threshold: 0.7, radius: 0.5 }))
    .add(effects.vignette({}))
    .camera(camera.perspective({ position: [0, 2.3, 7.2], target: [0, 1.0, 0], fov: 40, near: 0.1, far: 60 }))
});

const start = performance.now();
app.onFrame(() => {
  const t = (performance.now() - start) / 1000;
  app.nodes.require("crystals").setRotation(0, t * 0.3, 0);
});

await app.ready();
requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
