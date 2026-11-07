import { camera, createAuraApp, effects, environments, geometry, group, lights, material, primitives, scene } from "@aura3d/engine";

type V3 = [number, number, number];

// Deterministic pseudo-random so the cluster looks the same on every load.
let seed = 7;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface CrystalSpec {
  readonly sides: number;
  readonly radius: number;
  readonly height: number; // prism body height
  readonly tip: number; // pointed top height
  readonly hue: number;
}

// A faceted prism with a pointed top. Every face owns its vertices (flat normal) and one colour.
function crystal(spec: CrystalSpec) {
  const { sides, radius, height, tip, hue } = spec;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const centre: V3 = [0, (height + tip) * 0.45, 0];
  let faceIndex = 0;

  const face = (pts: V3[]): void => {
    const centroid: V3 = [0, 0, 0];
    for (const p of pts) { centroid[0] += p[0] / pts.length; centroid[1] += p[1] / pts.length; centroid[2] += p[2] / pts.length; }
    let ordered = pts;
    let n = cross(sub(ordered[1]!, ordered[0]!), sub(ordered[2]!, ordered[0]!));
    if (dot(n, sub(centroid, centre)) < 0) { ordered = [...pts].reverse(); n = cross(sub(ordered[1]!, ordered[0]!), sub(ordered[2]!, ordered[0]!)); }
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn: V3 = [n[0] / len, n[1] / len, n[2] / len];
    // distinct colour per face: hue walks around the wheel, lightness varies
    const [r, g, b] = hslToRgb(((hue + faceIndex * 0.071) % 1 + 1) % 1, 0.78, 0.4 + 0.22 * ((faceIndex * 0.37) % 1));
    faceIndex += 1;
    const base = positions.length / 3;
    for (const p of ordered) { positions.push(p[0], p[1], p[2]); normals.push(nn[0], nn[1], nn[2]); colors.push(r, g, b, 1); }
    for (let i = 1; i < ordered.length - 1; i += 1) indices.push(base, base + i, base + i + 1);
  };

  const ring = (y: number, rad: number): V3[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return [Math.cos(a) * rad, y, Math.sin(a) * rad] as V3;
    });
  const bottom = ring(0, radius);
  const top = ring(height, radius * 0.92);
  const apex: V3 = [radius * 0.08, height + tip, -radius * 0.05];
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    face([bottom[i]!, bottom[j]!, top[j]!, top[i]!]); // side facet
    face([top[i]!, top[j]!, apex]); // pointed-top facet
  }
  face(bottom);

  const extent = radius + 0.01;
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices,
    bounds: { min: [-extent, 0, -extent], max: [extent, height + tip, extent] }
  });
}

const crystalMaterial = material.pbr({ color: "#ffffff", roughness: 0.22, metallic: 0.15 });

interface Placement { readonly x: number; readonly z: number; readonly tiltX: number; readonly tiltZ: number; readonly spec: CrystalSpec }
const placements: Placement[] = [
  { x: 0, z: 0, tiltX: 0.04, tiltZ: -0.05, spec: { sides: 6, radius: 0.46, height: 1.9, tip: 0.85, hue: 0.55 } },
  { x: 0.8, z: 0.25, tiltX: 0.1, tiltZ: -0.42, spec: { sides: 5, radius: 0.32, height: 1.25, tip: 0.65, hue: 0.78 } },
  { x: -0.75, z: 0.3, tiltX: -0.08, tiltZ: 0.38, spec: { sides: 6, radius: 0.34, height: 1.45, tip: 0.7, hue: 0.92 } },
  { x: 0.15, z: -0.8, tiltX: -0.4, tiltZ: 0.1, spec: { sides: 4, radius: 0.28, height: 1.05, tip: 0.55, hue: 0.08 } },
  { x: -0.25, z: 0.85, tiltX: 0.42, tiltZ: -0.06, spec: { sides: 5, radius: 0.26, height: 0.85, tip: 0.5, hue: 0.33 } },
  { x: 1.2, z: -0.55, tiltX: -0.25, tiltZ: -0.65, spec: { sides: 6, radius: 0.2, height: 0.7, tip: 0.4, hue: 0.62 } },
  { x: -1.2, z: -0.45, tiltX: -0.2, tiltZ: 0.7, spec: { sides: 5, radius: 0.2, height: 0.62, tip: 0.38, hue: 0.15 } }
];

const crystals = placements.map((p, i) =>
  geometry.custom(crystal(p.spec), { name: `crystal-${i}`, material: crystalMaterial })
    .position(p.x, 0.16, p.z)
    .rotate(p.tiltX, i * 0.9, p.tiltZ)
);

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060c" })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(lights.hemisphere({ skyColor: "#2a2f5c", groundColor: "#0a0710", intensity: 0.35 }))
    .add(lights.directional({ name: "key", position: [3, 5, 5], target: [0, 1, 0], intensity: 0.9, color: "#9db4ff", shadow: true }))
    .add(lights.directional({ name: "rim-cyan", position: [-5, 3.5, -4.5], target: [0, 1.2, 0], intensity: 3.6, color: "#4fe6ff" }))
    .add(lights.directional({ name: "rim-magenta", position: [5, 2.5, -4.5], target: [0, 1.2, 0], intensity: 3.2, color: "#ff4fd8" }))
    .add(lights.point({ name: "core-glow", position: [0, 1.0, 0], intensity: 10, color: "#8a6bff", distance: 8, decay: 2 }))
    .add(primitives.cylinder({ name: "ground", size: [9, 0.1, 9], material: material.pbr({ color: "#0b0d16", roughness: 0.9 }), castShadow: false }).position(0, -0.05, 0))
    .add(primitives.cylinder({ name: "pedestal", size: [3.8, 0.22, 3.8], material: material.pbr({ color: "#161a2a", metallic: 0.7, roughness: 0.35 }) }).position(0, 0.05, 0))
    .add(primitives.cylinder({ name: "pedestal-rim", size: [3.95, 0.05, 3.95], material: material.pbr({ color: "#39d8ff", metallic: 0.9, roughness: 0.25 }), castShadow: false }).position(0, 0.0, 0))
    .add(group("cluster", crystals).runtime({ id: "cluster", mutable: true }))
    .add(effects.particles({
      name: "sparks", position: [0, 0.3, 0], shape: "disc", shapeSize: 3.2, rate: 34, maxParticles: 200,
      lifetime: [2.6, 4.6], speed: [0.25, 0.7], size: [0.03, 0.075], gravity: -0.12, drag: 0.1,
      noise: 0.35, sprite: "spark-streak", blend: "additive", seed: 21, color: "#bfe9ff", intensity: 2.2,
      prewarm: 4
    }))
    .add(effects.bloom({ intensity: 0.55, threshold: 0.8, radius: 0.5 }))
    .add(effects.vignette({}))
    .camera(camera.perspective({ position: [0, 2.6, 7.2], target: [0, 1.15, 0], fov: 38, near: 0.1, far: 60 }))
});

let angle = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.35;
  app.nodes.require("cluster").setRotation(0, angle, 0);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));

declare global {
  interface Window { __EVAL_READY__?: boolean }
}
