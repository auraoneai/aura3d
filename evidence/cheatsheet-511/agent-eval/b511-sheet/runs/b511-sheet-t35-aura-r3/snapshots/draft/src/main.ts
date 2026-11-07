import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];
type RGBA = [number, number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const hsl = (h: number, s: number, l: number): RGBA => {
  const hh = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + hh / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4), 1];
};

interface CrystalSpec {
  x: number;
  z: number;
  height: number; // prism body height
  tip: number; // pointed top height
  radius: number;
  sides: number;
  tiltX: number;
  tiltZ: number;
  twist: number;
  hue: number;
}

const CRYSTALS: CrystalSpec[] = [
  { x: 0.0, z: 0.0, height: 1.9, tip: 0.9, radius: 0.42, sides: 6, tiltX: 0.05, tiltZ: -0.08, twist: 0.2, hue: 190 },
  { x: 0.75, z: 0.25, height: 1.3, tip: 0.65, radius: 0.3, sides: 5, tiltX: -0.2, tiltZ: -0.42, twist: 0.7, hue: 265 },
  { x: -0.7, z: 0.2, height: 1.5, tip: 0.7, radius: 0.34, sides: 6, tiltX: 0.1, tiltZ: 0.4, twist: 0.1, hue: 310 },
  { x: 0.2, z: -0.75, height: 1.15, tip: 0.55, radius: 0.28, sides: 7, tiltX: 0.45, tiltZ: -0.1, twist: 0.5, hue: 215 },
  { x: -0.35, z: 0.8, height: 0.9, tip: 0.5, radius: 0.26, sides: 5, tiltX: -0.5, tiltZ: 0.2, twist: 0.9, hue: 335 },
  { x: 1.25, z: -0.5, height: 0.8, tip: 0.45, radius: 0.22, sides: 6, tiltX: 0.2, tiltZ: -0.7, twist: 0.3, hue: 160 },
  { x: -1.2, z: -0.45, height: 0.95, tip: 0.5, radius: 0.24, sides: 5, tiltX: 0.25, tiltZ: 0.65, twist: 0.6, hue: 245 }
];

const BASE_Y = 0.3;
const positions: number[] = [];
const normals: number[] = [];
const colors: number[] = [];

const addTri = (a: V3, b: V3, c: V3, centre: V3, color: RGBA, toWorld: (p: V3) => V3, rotate: (p: V3) => V3): void => {
  // Orient the triangle so its normal points away from the crystal centre (convex solid).
  let n = cross(sub(b, a), sub(c, a));
  const mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
  let p1 = b;
  let p2 = c;
  if (dot(n, sub(mid, centre)) < 0) {
    p1 = c;
    p2 = b;
    n = cross(sub(p1, a), sub(p2, a));
  }
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  const wn = rotate([n[0] / len, n[1] / len, n[2] / len]);
  for (const p of [a, p1, p2]) {
    positions.push(...toWorld(p));
    normals.push(...wn);
    colors.push(...color);
  }
};

CRYSTALS.forEach((c, ci) => {
  const cx = Math.cos(c.tiltX), sx = Math.sin(c.tiltX);
  const cz = Math.cos(c.tiltZ), sz = Math.sin(c.tiltZ);
  const rotate = (p: V3): V3 => {
    const y1 = p[1] * cx - p[2] * sx;
    const z1 = p[1] * sx + p[2] * cx;
    return [p[0] * cz - y1 * sz, p[0] * sz + y1 * cz, z1];
  };
  const toWorld = (p: V3): V3 => {
    const r = rotate(p);
    return [r[0] + c.x, r[1] + BASE_Y - 0.08, r[2] + c.z];
  };
  const top = c.height;
  const bottom: V3[] = [];
  const upper: V3[] = [];
  for (let i = 0; i < c.sides; i += 1) {
    const a = c.twist + (i / c.sides) * Math.PI * 2;
    bottom.push([Math.cos(a) * c.radius, 0, Math.sin(a) * c.radius]);
    upper.push([Math.cos(a) * c.radius * 0.88, top, Math.sin(a) * c.radius * 0.88]);
  }
  const apex: V3 = [0.04 * c.radius, top + c.tip, -0.03 * c.radius];
  const centre: V3 = [0, top * 0.5, 0];
  for (let i = 0; i < c.sides; i += 1) {
    const j = (i + 1) % c.sides;
    const b0 = bottom[i]!, b1 = bottom[j]!, u0 = upper[i]!, u1 = upper[j]!;
    const hueSide = c.hue + i * 14 + ci * 3;
    const sideColor = hsl(hueSide, 0.75, 0.38 + 0.14 * ((i * 5 + ci) % 4) / 3);
    const tipColor = hsl(hueSide + 28, 0.85, 0.5 + 0.08 * ((i + ci) % 3));
    addTri(b0, b1, u1, centre, sideColor, toWorld, rotate);
    addTri(b0, u1, u0, centre, sideColor, toWorld, rotate);
    addTri(u0, u1, apex, centre, tipColor, toWorld, rotate);
  }
  // Bottom cap (hidden against the pedestal, keeps the solid closed).
  const capColor = hsl(c.hue, 0.6, 0.2);
  for (let i = 1; i < c.sides - 1; i += 1) addTri(bottom[0]!, bottom[i]!, bottom[i + 1]!, centre, capColor, toWorld, rotate);
});

const crystalGeometry = geometry.define({
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  colors: new Float32Array(colors),
  indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
  bounds: { min: [-3, 0, -3], max: [3, 4, 3] }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060d" })
    .add(environments.neutral({ intensity: 0.18, background: false }))
    .add(lights.directional({ position: [3, 6, 4], target: [0, 1, 0], intensity: 0.9, color: "#9db4ff", shadow: true }))
    // Rim lights from behind and the sides.
    .add(lights.point({ position: [-3.5, 2.2, -3.2], intensity: 60, color: "#38e8ff", distance: 12 }))
    .add(lights.point({ position: [3.6, 1.8, -2.8], intensity: 55, color: "#ff4fd8", distance: 12 }))
    .add(lights.point({ position: [0, 4.5, -4], intensity: 40, color: "#8a6bff", distance: 12 }))
    .add(effects.fog({ color: "#05060d", density: 0.035 }))
    .add(effects.bloom({ intensity: 0.45, threshold: 0.75, radius: 0.5 }))
    // Pedestal.
    .add(primitives.cylinder({ name: "ground", size: [4.2, 0.2, 4.2], material: material.pbr({ color: "#151826", roughness: 0.55, metallic: 0.3 }) }).position(0, 0.1, 0))
    .add(primitives.cylinder({ name: "ground-rim", size: [4.5, 0.08, 4.5], material: material.pbr({ color: "#0c0e18", roughness: 0.7, metallic: 0.2 }) }).position(0, 0.04, 0))
    .add(geometry.custom(crystalGeometry, { name: "crystals", material: material.pbr({ color: "#ffffff", roughness: 0.22, metallic: 0.15 }) }).runtime({ id: "crystals", mutable: true }))
    .add(effects.particles({
      name: "sparks",
      position: [0, 0.35, 0],
      shape: "disc",
      shapeSize: [2.2, 0.1, 2.2],
      rate: 38,
      maxParticles: 260,
      lifetime: [3, 5],
      speed: [0.25, 0.6],
      size: [0.03, 0.075],
      gravity: [0, -0.02, 0],
      drag: 0.05,
      noise: { strength: 0.35, frequency: 0.9, scroll: 0.4 },
      blend: "additive",
      color: "#bfe9ff",
      colorOverLife: { stops: [{ t: 0, color: "#ffffff" }, { t: 0.5, color: "#8fd8ff" }, { t: 1, color: "#d070ff" }] },
      alphaOverLife: [0, 1, 0.9, 0],
      intensity: 2.5,
      prewarm: 4,
      seed: 11
    }))
    .camera(camera.perspective({ position: [0, 2.7, 8], target: [0, 1.2, 0], fov: 40 })),
});

let frames = 0;
app.onFrame((f) => {
  app.nodes.require("crystals").setRotation(0, f.time * 0.35, 0);
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});
await app.ready();
