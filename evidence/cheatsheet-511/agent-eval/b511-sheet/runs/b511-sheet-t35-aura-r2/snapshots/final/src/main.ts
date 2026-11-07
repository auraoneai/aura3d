import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  group,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// Seeded generator so the layout is identical on every run.
let seed = 20240535;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const hsl = (h: number, s: number, l: number): string => {
  const hh = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): string => {
    const k = (n + hh / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface CrystalSpec {
  sides: number;
  radius: number;
  shaft: number;
  tip: number;
  hue: number;
  twist: number;
}

// Faceted prism with a pointed top. Non-indexed triangles with one normal and
// one colour per face give flat shading with a distinct colour on every facet.
const crystalGeometry = (spec: CrystalSpec) => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: string[] = [];
  const centre: V3 = [0, (spec.shaft + spec.tip) / 2, 0];
  const topRadius = spec.radius * 0.82;
  let face = 0;

  const tri = (p0: V3, p1: V3, p2: V3, color: string): void => {
    let b = p1;
    let c = p2;
    let n = cross(sub(b, p0), sub(c, p0));
    const mid: V3 = [
      (p0[0] + p1[0] + p2[0]) / 3,
      (p0[1] + p1[1] + p2[1]) / 3,
      (p0[2] + p1[2] + p2[2]) / 3
    ];
    if (dot(n, sub(mid, centre)) < 0) {
      b = p2;
      c = p1;
      n = [-n[0], -n[1], -n[2]];
    }
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    for (const p of [p0, b, c]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0] / len, n[1] / len, n[2] / len);
      colors.push(color);
    }
  };

  const ring = (r: number, y: number, i: number): V3 => {
    const a = spec.twist + (i / spec.sides) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const apex: V3 = [0, spec.shaft + spec.tip, 0];

  for (let i = 0; i < spec.sides; i += 1) {
    const j = (i + 1) % spec.sides;
    const b0 = ring(spec.radius, 0, i);
    const b1 = ring(spec.radius, 0, j);
    const t0 = ring(topRadius, spec.shaft, i);
    const t1 = ring(topRadius, spec.shaft, j);
    const sideColor = hsl(spec.hue + face * 17, 0.8, 0.36 + (face % 3) * 0.1);
    face += 1;
    tri(b0, b1, t1, sideColor);
    tri(b0, t1, t0, sideColor);
    const roofColor = hsl(spec.hue + 40 + face * 17, 0.85, 0.5 + (face % 2) * 0.12);
    face += 1;
    tri(t0, t1, apex, roofColor);
  }

  const pos = new Float32Array(positions);
  return geometry.define({
    positions: pos,
    normals: new Float32Array(normals),
    colors,
    indices: Array.from({ length: pos.length / 3 }, (_, i) => i),
    bounds: geometry.computeBounds({ positions: pos })
  });
};

const crystalMaterial = material.pbr({ color: "#ffffff", metallic: 0.15, roughness: 0.25 });

interface Placement {
  x: number;
  z: number;
  height: number;
  tilt: number;
  azimuth: number;
  radius: number;
  hue: number;
  sides: number;
}

const placements: Placement[] = [
  { x: 0, z: 0, height: 3.1, tilt: 0.05, azimuth: 0.5, radius: 0.42, hue: 200, sides: 6 },
  { x: 0.75, z: 0.2, height: 2.2, tilt: 0.3, azimuth: 0.2, radius: 0.3, hue: 280, sides: 5 },
  { x: -0.7, z: 0.35, height: 2.5, tilt: 0.34, azimuth: 2.9, radius: 0.34, hue: 320, sides: 6 },
  { x: 0.2, z: -0.8, height: 1.9, tilt: 0.38, azimuth: -1.5, radius: 0.28, hue: 170, sides: 5 },
  { x: -0.35, z: 0.95, height: 1.4, tilt: 0.45, azimuth: 1.7, radius: 0.24, hue: 240, sides: 6 },
  { x: 1.15, z: -0.55, height: 1.2, tilt: 0.5, azimuth: -0.5, radius: 0.22, hue: 20, sides: 5 },
  { x: -1.2, z: -0.4, height: 1.5, tilt: 0.42, azimuth: 3.6, radius: 0.25, hue: 140, sides: 6 }
];

const crystals = placements.map((p, i) => {
  const shaft = p.height * 0.7;
  const spec: CrystalSpec = {
    sides: p.sides,
    radius: p.radius,
    shaft,
    tip: p.height - shaft + 0.1 + rand() * 0.15,
    hue: p.hue,
    twist: rand() * Math.PI
  };
  // Tilt the crystal away from the cluster centre (small-angle axis mapping).
  const out = Math.atan2(p.z, p.x);
  const tx = Math.sin(out) * p.tilt;
  const tz = -Math.cos(out) * p.tilt;
  return geometry
    .custom(crystalGeometry(spec), { name: `crystal-${i}`, material: crystalMaterial })
    .position(p.x, -0.2, p.z)
    .rotate(tx, p.azimuth, tz);
});

const cluster = group("cluster", crystals).runtime({ id: "cluster", mutable: true });

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060c" })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    // Key light: dim and warm from the front-left.
    .add(lights.directional({ position: [-5, 4, 6], target: [0, 1, 0], intensity: 0.9, color: "#ffd9b0" }))
    // Rim lights from behind, one cyan and one magenta.
    .add(lights.directional({ position: [-4, 3.5, -6], target: [0, 1.2, 0], intensity: 5, color: "#3fd8ff" }))
    .add(lights.directional({ position: [5, 3, -5], target: [0, 1.2, 0], intensity: 4.5, color: "#ff4fd8" }))
    .add(lights.point({ position: [0, 0.6, 2.5], intensity: 6, color: "#6a6cff", distance: 9 }))
    .add(
      primitives.cylinder({
        name: "pedestal",
        size: [4.6, 0.3, 4.6],
        material: material.pbr({ color: "#1a1c26", metallic: 0.5, roughness: 0.35 })
      }).position(0, -0.15, 0)
    )
    .add(
      primitives.cylinder({
        name: "pedestal-rim",
        size: [4.9, 0.12, 4.9],
        material: material.pbr({ color: "#0e0f16", metallic: 0.7, roughness: 0.4 })
      }).position(0, -0.36, 0)
    )
    .add(cluster)
    .add(
      effects.particles({
        name: "sparks",
        position: [0, 0.1, 0],
        shape: "disc",
        shapeSize: 3.2,
        rate: 28,
        maxParticles: 180,
        lifetime: [3.5, 5.5],
        speed: [0.15, 0.45],
        size: [0.04, 0.1],
        gravity: -0.35,
        drag: 0.2,
        noise: 0.25,
        blend: "additive",
        seed: 11,
        color: "#bfe9ff",
        intensity: 2.5,
        prewarm: 4
      })
    )
    .add(effects.bloom({ intensity: 0.55, threshold: 0.75, radius: 0.5 }))
    .camera(camera.perspective({ position: [0, 2.7, 7.4], target: [0, 1.15, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("cluster").setRotation(0, f.time * 0.35, 0);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
