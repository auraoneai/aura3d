import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

type V3 = [number, number, number];

const SIDES = 6;

interface CrystalSpec {
  x: number; z: number;     // base position on the pedestal
  height: number;           // total height including the tip
  radius: number;           // prism radius
  lean: number;             // tilt angle in radians
  leanDir: number;          // direction of the lean around Y
  yaw: number;              // twist around the crystal's own axis
  hue: number;              // base hue 0..1
}

const SPECS: CrystalSpec[] = [
  { x: 0.0, z: 0.0, height: 2.3, radius: 0.4, lean: 0.06, leanDir: 0.8, yaw: 0.1, hue: 0.52 },
  { x: 0.62, z: 0.2, height: 1.6, radius: 0.27, lean: 0.34, leanDir: 0.3, yaw: 0.5, hue: 0.76 },
  { x: -0.55, z: 0.35, height: 1.9, radius: 0.3, lean: 0.3, leanDir: 2.7, yaw: 0.2, hue: 0.88 },
  { x: 0.1, z: -0.6, height: 1.45, radius: 0.25, lean: 0.4, leanDir: -1.6, yaw: 0.9, hue: 0.6 },
  { x: -0.25, z: 0.72, height: 1.1, radius: 0.22, lean: 0.52, leanDir: 1.7, yaw: 0.4, hue: 0.47 },
  { x: 0.82, z: -0.45, height: 1.0, radius: 0.2, lean: 0.6, leanDir: -0.6, yaw: 0.7, hue: 0.82 },
  { x: -0.85, z: -0.3, height: 1.25, radius: 0.22, lean: 0.55, leanDir: 3.5, yaw: 0.3, hue: 0.68 },
  { x: 0.4, z: 0.78, height: 0.7, radius: 0.15, lean: 0.7, leanDir: 0.9, yaw: 1.1, hue: 0.9 },
];

function hsv(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 1) + 1) % 1 * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

const positions: number[] = [];
const normals: number[] = [];
const colors: number[] = [];
const indices: number[] = [];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** One flat-shaded triangle with its own vertices, a single colour and an outward-facing normal. */
function tri(a: V3, b: V3, c: V3, center: V3, color: V3): void {
  let n = cross(sub(b, a), sub(c, a));
  const mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  if (dot(n, sub(mid, center)) < 0) { const tmp = b; b = c; c = tmp; n = [-n[0], -n[1], -n[2]]; }
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const base = positions.length / 3;
  for (const p of [a, b, c]) {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0] / len, n[1] / len, n[2] / len);
    colors.push(color[0], color[1], color[2], 1);
  }
  indices.push(base, base + 1, base + 2);
}

function addCrystal(s: CrystalSpec): void {
  // Tilt about X and Z so the axis leans toward leanDir.
  const dx = Math.cos(s.leanDir), dz = Math.sin(s.leanDir);
  const rx = s.lean * dz, rz = -s.lean * dx;
  const cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
  const place = (lx: number, ly: number, lz: number): V3 => {
    const y1 = ly * cx - lz * sx, z1 = ly * sx + lz * cx;
    const x2 = lx * cz - y1 * sz, y2 = lx * sz + y1 * cz;
    return [x2 + s.x, y2 - 0.04, z1 + s.z];
  };
  const shaft = s.height * 0.68;
  const ring = (y: number, r: number): V3[] => Array.from({ length: SIDES }, (_, k) => {
    const a = s.yaw + (k / SIDES) * Math.PI * 2;
    // Slightly uneven radius so the prism does not look machined.
    const rr = r * (1 + 0.12 * Math.sin(k * 2.3 + s.hue * 9));
    return place(Math.cos(a) * rr, y, Math.sin(a) * rr);
  });
  const bottom = ring(0, s.radius);
  const top = ring(shaft, s.radius * 0.92);
  const apex = place(0, s.height, 0);
  const bottomCenter = place(0, 0, 0);
  const center = place(0, s.height * 0.45, 0);
  for (let k = 0; k < SIDES; k += 1) {
    const k2 = (k + 1) % SIDES;
    const sideColor = hsv(s.hue + 0.035 * k, 0.7, 0.42 + 0.1 * ((k * 2) % 5));
    const tipColor = hsv(s.hue + 0.035 * k + 0.05, 0.45, 0.72 + 0.06 * (k % 3));
    // Side quad split into two triangles of the same colour.
    tri(bottom[k]!, bottom[k2]!, top[k2]!, center, sideColor);
    tri(bottom[k]!, top[k2]!, top[k]!, center, sideColor);
    tri(top[k]!, top[k2]!, apex, center, tipColor);
    tri(bottom[k]!, bottom[k2]!, bottomCenter, center, hsv(s.hue, 0.8, 0.2));
  }
}

for (const spec of SPECS) addCrystal(spec);

const posArr = new Float32Array(positions);
const min: V3 = [Infinity, Infinity, Infinity];
const max: V3 = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < posArr.length; i += 3) {
  for (let a = 0; a < 3; a += 1) {
    min[a] = Math.min(min[a]!, posArr[i + a]!);
    max[a] = Math.max(max[a]!, posArr[i + a]!);
  }
}

const crystalGeo = geometry.define({
  positions: posArr,
  normals: new Float32Array(normals),
  colors: new Float32Array(colors),
  indices,
  bounds: { min, max },
});

const PEDESTAL_TOP = 0.3;

const app = createAuraApp("#app", {
  scene: scene({ background: "#04050b" })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(lights.ambient({ intensity: 0.05, color: "#6070a0" }))
    // Dim key from the front so faces stay readable.
    .add(lights.directional({ name: "key", position: [2.5, 3.5, 6], target: [0, 1, 0], intensity: 0.9, color: "#8c9bd0" }))
    // Rim lights from behind and the sides.
    .add(lights.directional({ name: "rimCyan", position: [-5, 3, -5], target: [0, 1, 0], intensity: 4, color: "#3fe0ff" }))
    .add(lights.directional({ name: "rimMagenta", position: [5.5, 2.5, -4], target: [0, 1, 0], intensity: 3.5, color: "#ff4fd8" }))
    .add(lights.point({ name: "core", position: [0, 1.0, 0.2], intensity: 5, distance: 6, color: "#8a6bff" }))
    .add(primitives.cylinder({
      name: "pedestalBase",
      size: [3.6, 0.2, 3.6],
      material: material.pbr({ color: "#15171f", roughness: 0.5, metallic: 0.5 }),
    }).position(0, 0.1, 0))
    .add(primitives.cylinder({
      name: "pedestalTop",
      size: [3.0, 0.14, 3.0],
      material: material.pbr({ color: "#232734", roughness: 0.28, metallic: 0.6 }),
    }).position(0, 0.23, 0))
    .add(geometry.custom(crystalGeo, {
      name: "crystals",
      material: material.pbr({ color: "#ffffff", roughness: 0.22, metallic: 0.1 }),
    }).position(0, PEDESTAL_TOP, 0).runtime({ id: "crystals", mutable: true }))
    .add(effects.particles({
      name: "sparks",
      position: [0, 0.5, 0],
      shape: "disc",
      shapeSize: 2.6,
      rate: 36,
      maxParticles: 160,
      lifetime: [2.5, 4],
      speed: [0.1, 0.35],
      size: [0.03, 0.07],
      gravity: -0.35,
      drag: 0.2,
      noise: 0.4,
      blend: "additive",
      seed: 11,
      color: "#bfeaff",
      intensity: 2.2,
    }))
    .add(effects.bloom({ intensity: 0.55, threshold: 0.7, radius: 0.5 }))
    .camera(camera.perspective({ position: [0, 2.7, 7.4], target: [0, 1.15, 0], fov: 38 })),
});

app.onFrame((f) => {
  app.nodes.require("crystals").setRotation(0, f.time * 0.35, 0);
});

await app.ready();
requestAnimationFrame(() => {
  (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
});
