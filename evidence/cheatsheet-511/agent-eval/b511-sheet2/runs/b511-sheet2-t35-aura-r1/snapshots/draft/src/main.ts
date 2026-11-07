import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

interface CrystalSpec {
  pos: V3;          // base centre on the pedestal
  sides: number;    // prism faces
  radius: number;   // base radius
  taper: number;    // top radius / base radius
  body: number;     // prism height
  tip: number;      // pointed top height
  tilt: [number, number]; // rotation about X and Z (radians)
  yaw: number;
  hue: number;      // 0..360
}

const CRYSTALS: CrystalSpec[] = [
  { pos: [0.0, -0.05, 0.0], sides: 6, radius: 0.5, taper: 0.85, body: 1.7, tip: 0.9, tilt: [0.04, -0.06], yaw: 0.3, hue: 200 },
  { pos: [0.85, -0.05, 0.25], sides: 5, radius: 0.34, taper: 0.8, body: 1.1, tip: 0.65, tilt: [-0.1, -0.32], yaw: 1.1, hue: 285 },
  { pos: [-0.8, -0.05, 0.3], sides: 6, radius: 0.38, taper: 0.9, body: 1.4, tip: 0.7, tilt: [0.12, 0.38], yaw: 0.7, hue: 160 },
  { pos: [0.2, -0.05, -0.85], sides: 7, radius: 0.36, taper: 0.8, body: 1.25, tip: 0.8, tilt: [-0.36, 0.08], yaw: 0.2, hue: 330 },
  { pos: [-0.35, -0.05, 0.95], sides: 5, radius: 0.28, taper: 0.75, body: 0.7, tip: 0.5, tilt: [0.46, -0.1], yaw: 2.0, hue: 40 },
  { pos: [1.35, -0.05, -0.6], sides: 6, radius: 0.24, taper: 0.8, body: 0.55, tip: 0.42, tilt: [-0.2, -0.62], yaw: 0.9, hue: 235 },
  { pos: [-1.35, -0.05, -0.45], sides: 5, radius: 0.22, taper: 0.8, body: 0.45, tip: 0.38, tilt: [-0.1, 0.7], yaw: 1.7, hue: 10 }
];

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const positions: number[] = [];
const normals: number[] = [];
const colors: number[] = [];
const indices: number[] = [];
const min: V3 = [Infinity, Infinity, Infinity];
const max: V3 = [-Infinity, -Infinity, -Infinity];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// One flat polygon (convex, fan triangulated) with its own vertices, face normal and colour.
const addFace = (pts: V3[], rgb: [number, number, number], inside: V3): void => {
  const centroid: V3 = [0, 0, 0];
  for (const p of pts) { centroid[0] += p[0] / pts.length; centroid[1] += p[1] / pts.length; centroid[2] += p[2] / pts.length; }
  let n = cross(sub(pts[1]!, pts[0]!), sub(pts[2]!, pts[0]!));
  const flip = dot(n, sub(centroid, inside)) < 0;
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  n = flip ? [-n[0] / len, -n[1] / len, -n[2] / len] : [n[0] / len, n[1] / len, n[2] / len];
  const base = positions.length / 3;
  for (const p of pts) {
    positions.push(p[0], p[1], p[2]);
    normals.push(n[0], n[1], n[2]);
    colors.push(rgb[0], rgb[1], rgb[2], 1);
    for (let i = 0; i < 3; i += 1) { min[i] = Math.min(min[i]!, p[i]!); max[i] = Math.max(max[i]!, p[i]!); }
  }
  for (let i = 1; i < pts.length - 1; i += 1) {
    if (flip) indices.push(base, base + i + 1, base + i);
    else indices.push(base, base + i, base + i + 1);
  }
};

const buildCrystal = (c: CrystalSpec): void => {
  const [tx, tz] = c.tilt;
  const cx = Math.cos(tx), sx = Math.sin(tx), cz = Math.cos(tz), sz = Math.sin(tz);
  const xf = (p: V3): V3 => {
    const x1 = p[0];
    const y1 = p[1] * cx - p[2] * sx;
    const z1 = p[1] * sx + p[2] * cx;
    return [x1 * cz - y1 * sz + c.pos[0], x1 * sz + y1 * cz + c.pos[1], z1 + c.pos[2]];
  };
  const ring = (r: number, y: number): V3[] =>
    Array.from({ length: c.sides }, (_, i) => {
      const a = c.yaw + (i / c.sides) * Math.PI * 2;
      return xf([Math.cos(a) * r, y, Math.sin(a) * r]);
    });
  const bottom = ring(c.radius, 0);
  const top = ring(c.radius * c.taper, c.body);
  const apex = xf([0, c.body + c.tip, 0]);
  const inside = xf([0, c.body * 0.5, 0]);
  for (let i = 0; i < c.sides; i += 1) {
    const j = (i + 1) % c.sides;
    const hue = c.hue + i * 17;
    addFace([bottom[i]!, bottom[j]!, top[j]!, top[i]!], hslToRgb(hue, 0.72, 0.34 + 0.09 * (i % 3)), inside);
    addFace([top[i]!, top[j]!, apex], hslToRgb(hue + 25, 0.8, 0.5 + 0.08 * (i % 2)), inside);
  }
  addFace([...bottom].reverse(), hslToRgb(c.hue, 0.5, 0.2), inside);
};

CRYSTALS.forEach(buildCrystal);

const crystalGeometry = geometry.define({
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  colors: new Float32Array(colors),
  indices,
  bounds: { min, max }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060c" })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(lights.hemisphere({ skyColor: "#2a3560", groundColor: "#0a0710", intensity: 0.35 }))
    .add(lights.directional({ name: "key", position: [3, 5, 6], target: [0, 1, 0], intensity: 0.9, color: "#aab6ff" }))
    // rim lights from behind, one cool and one warm
    .add(lights.directional({ name: "rimCool", position: [-4, 3, -6], target: [0, 1.2, 0], intensity: 4.5, color: "#5fd4ff" }))
    .add(lights.directional({ name: "rimWarm", position: [5, 2.5, -5], target: [0, 1.2, 0], intensity: 4, color: "#ff6ec7" }))
    .add(primitives.cylinder({ name: "pedestal", size: [5.2, 0.5, 5.2], material: material.pbr({ color: "#15161d", roughness: 0.35, metallic: 0.6 }) }).position(0, -0.3, 0))
    .add(primitives.cylinder({ name: "pedestalRim", size: [5.5, 0.12, 5.5], material: material.pbr({ color: "#2a2d3c", roughness: 0.3, metallic: 0.8 }) }).position(0, -0.58, 0))
    .add(
      geometry
        .custom(crystalGeometry, { name: "crystals", material: material.pbr({ color: "#ffffff", roughness: 0.25, metallic: 0.1 }) })
        .runtime({ id: "cluster", mutable: true })
    )
    // sparks rising from the pedestal around the cluster
    .add(effects.particles({
      name: "sparksRing", position: [0, 0.1, 0], shape: "disc", shapeSize: [2.3, 0.1, 2.3], rate: 40, maxParticles: 220,
      lifetime: [2.5, 4], speed: [0.35, 0.8], size: [0.03, 0.07], gravity: 0, drag: 0.05, wind: [0, 0.25, 0],
      noise: { strength: 0.35, frequency: 1.2, scroll: 0.4 }, sizeOverLife: [0.2, 1, 0.3], alphaOverLife: [0, 1, 0],
      blend: "additive", seed: 11, color: "#bfeaff", intensity: 2.5
    }))
    .add(effects.particles({
      name: "sparksCore", position: [0, 0.4, 0], shape: "cone", coneAngleDeg: 45, rate: 30, maxParticles: 160,
      lifetime: [2, 3.5], speed: [0.4, 0.9], size: [0.03, 0.06], gravity: 0, drag: 0.1,
      noise: { strength: 0.3, frequency: 1.5, scroll: 0.5 }, sizeOverLife: [0.2, 1, 0.3], alphaOverLife: [0, 1, 0],
      blend: "additive", seed: 23, color: "#ffd9f4", intensity: 2.5
    }))
    .add(effects.bloom({ intensity: 0.6, threshold: 0.7, radius: 0.5 }))
    .add(effects.vignette({}))
    .camera(camera.perspective({ position: [0, 2.7, 7.4], target: [0, 1.0, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("cluster").setRotation(0, f.time * 0.3, 0);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
