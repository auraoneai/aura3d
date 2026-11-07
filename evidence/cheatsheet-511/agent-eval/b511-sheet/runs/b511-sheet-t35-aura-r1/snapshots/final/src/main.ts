import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- Crystal geometry: flat-shaded hexagonal prisms with pointed tops ----------

const hueToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

interface CrystalSpec {
  x: number;
  z: number;
  height: number;
  radius: number;
  tip: number;
  tiltX: number;
  tiltZ: number;
  yaw: number;
  hue: number;
}

const SIDES = 6;
const CRYSTALS: CrystalSpec[] = [
  { x: 0.0, z: 0.0, height: 2.9, radius: 0.5, tip: 0.9, tiltX: 0.04, tiltZ: -0.06, yaw: 0.2, hue: 205 },
  { x: 0.95, z: 0.35, height: 2.0, radius: 0.36, tip: 0.7, tiltX: 0.12, tiltZ: -0.38, yaw: 0.7, hue: 285 },
  { x: -0.85, z: 0.3, height: 2.3, radius: 0.4, tip: 0.75, tiltX: -0.1, tiltZ: 0.34, yaw: 0.1, hue: 165 },
  { x: 0.2, z: -0.9, height: 1.7, radius: 0.32, tip: 0.6, tiltX: -0.42, tiltZ: -0.1, yaw: 0.5, hue: 330 },
  { x: -0.35, z: 0.95, height: 1.3, radius: 0.3, tip: 0.5, tiltX: 0.46, tiltZ: 0.12, yaw: 0.9, hue: 40 },
  { x: 1.5, z: -0.5, height: 1.0, radius: 0.24, tip: 0.45, tiltX: -0.2, tiltZ: -0.62, yaw: 0.3, hue: 245 },
  { x: -1.5, z: -0.35, height: 1.15, radius: 0.26, tip: 0.45, tiltX: -0.15, tiltZ: 0.58, yaw: 0.6, hue: 190 }
];

const pos: number[] = [];
const nor: number[] = [];
const col: number[] = [];
const idx: number[] = [];
const bmin: V3 = [Infinity, Infinity, Infinity];
const bmax: V3 = [-Infinity, -Infinity, -Infinity];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Adds one flat face (3 or 4 coplanar points) with its own normal and colour; winding is fixed to face away from `centre`. */
const addFace = (pts: V3[], centre: V3, rgb: [number, number, number]): void => {
  const p0 = pts[0]!;
  let n = norm(cross(sub(pts[1]!, p0), sub(pts[2]!, p0)));
  const mid: V3 = [0, 0, 0];
  for (const p of pts) {
    mid[0] += p[0] / pts.length;
    mid[1] += p[1] / pts.length;
    mid[2] += p[2] / pts.length;
  }
  const flip = dot(n, sub(mid, centre)) < 0;
  const ordered = flip ? [...pts].reverse() : pts;
  if (flip) n = [-n[0], -n[1], -n[2]];
  const base = pos.length / 3;
  for (const p of ordered) {
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0], n[1], n[2]);
    col.push(rgb[0], rgb[1], rgb[2], 1);
    for (let k = 0; k < 3; k += 1) {
      bmin[k] = Math.min(bmin[k]!, p[k]!);
      bmax[k] = Math.max(bmax[k]!, p[k]!);
    }
  }
  for (let i = 1; i < ordered.length - 1; i += 1) idx.push(base, base + i, base + i + 1);
};

for (const c of CRYSTALS) {
  const cx = Math.cos(c.tiltX), sx = Math.sin(c.tiltX), cz = Math.cos(c.tiltZ), sz = Math.sin(c.tiltZ);
  const place = (p: V3): V3 => {
    const x1 = p[0], y1 = p[1] * cx - p[2] * sx, z1 = p[1] * sx + p[2] * cx; // tilt about X
    return [x1 * cz - y1 * sz + c.x, x1 * sz + y1 * cz, z1 + c.z]; // tilt about Z, then move
  };
  const yBase = -0.2; // sunk into the pedestal so tilted bases never show
  const bottom: V3[] = [];
  const top: V3[] = [];
  for (let i = 0; i < SIDES; i += 1) {
    const a = c.yaw + (i / SIDES) * Math.PI * 2;
    // slight taper so the prism reads as a crystal rather than a pipe
    bottom.push(place([Math.cos(a) * c.radius, yBase, Math.sin(a) * c.radius]));
    top.push(place([Math.cos(a) * c.radius * 0.88, c.height, Math.sin(a) * c.radius * 0.88]));
  }
  const apex = place([0, c.height + c.tip, 0]);
  const centre = place([0, c.height * 0.5, 0]);
  for (let i = 0; i < SIDES; i += 1) {
    const j = (i + 1) % SIDES;
    const hue = c.hue + i * 17;
    addFace([bottom[i]!, bottom[j]!, top[j]!, top[i]!], centre, hueToRgb(hue, 0.7, 0.3 + 0.1 * ((i * 5) % 4)));
    addFace([top[i]!, top[j]!, apex], centre, hueToRgb(hue + 25, 0.8, 0.5 + 0.06 * ((i * 3) % 4)));
  }
}

const positions = new Float32Array(pos);
const crystalGeo = geometry.define({
  positions,
  normals: new Float32Array(nor),
  colors: new Float32Array(col),
  indices: idx,
  bounds: { min: bmin, max: bmax }
});

// ---------- Scene ----------

const SCENE_BG = "#05060c";

const app = createAuraApp("#app", {
  scene: scene({ background: SCENE_BG })
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(lights.hemisphere({ skyColor: "#1a2447", groundColor: "#07060c", intensity: 0.35 }))
    .add(lights.directional({ position: [3, 5, 6], target: [0, 1, 0], intensity: 0.7, color: "#aab8ff" }))
    // rim lights from behind and the sides
    .add(lights.point({ name: "rimCyan", position: [-3.2, 2.6, -3.2], intensity: 60, color: "#3fd8ff", distance: 14 }))
    .add(lights.point({ name: "rimMagenta", position: [3.4, 2.0, -3.0], intensity: 60, color: "#ff4fd0", distance: 14 }))
    .add(lights.point({ name: "underGlow", position: [0, 0.4, 1.6], intensity: 6, color: "#7a6bff", distance: 6 }))
    .add(effects.fog({ color: SCENE_BG, density: 0.03 }))
    .add(effects.bloom({ intensity: 0.55, threshold: 0.75, radius: 0.55 }))
    // pedestal (static) and ground disc
    .add(primitives.cylinder({ name: "ground", size: [9, 0.1, 9], material: material.pbr({ color: "#0c0e16", roughness: 0.85 }) }).position(0, -0.55, 0))
    .add(primitives.cylinder({ name: "pedestal", size: [4.2, 0.5, 4.2], material: material.pbr({ color: "#1b1f2d", roughness: 0.45, metallic: 0.5 }) }).position(0, -0.25, 0))
    .add(primitives.torus({ name: "pedestalRim", size: [4.25, 0.12, 4.25], material: material.emissive({ color: "#10131f", emissive: "#4a5cff", emissiveIntensity: 1.2 }) }).position(0, 0.0, 0))
    // rotating crystal cluster
    .add(geometry.custom(crystalGeo, {
      name: "crystals",
      material: material.pbr({ color: "#ffffff", roughness: 0.18, metallic: 0.15 })
    }).runtime({ id: "crystals", mutable: true }))
    // rising sparks
    .add(effects.particles({
      name: "sparks",
      position: [0, 0.1, 0],
      shape: "disc",
      shapeSize: 3.2,
      rate: 36,
      maxParticles: 260,
      prewarm: 4,
      lifetime: [3.5, 6],
      speed: [0.25, 0.6],
      size: [0.035, 0.08],
      gravity: -0.05,
      drag: 0.1,
      noise: 0.35,
      sizeOverLife: [0.2, 1, 1, 0.1],
      alphaOverLife: [0, 1, 0.8, 0],
      blend: "additive",
      intensity: 2.5,
      seed: 11,
      color: "#cfeaff"
    }))
    .add(effects.particles({
      name: "sparksWarm",
      position: [0, 0.1, 0],
      shape: "disc",
      shapeSize: 3.6,
      rate: 14,
      maxParticles: 120,
      prewarm: 4,
      lifetime: [4, 7],
      speed: [0.2, 0.45],
      size: [0.05, 0.1],
      gravity: -0.03,
      drag: 0.15,
      noise: 0.4,
      alphaOverLife: [0, 1, 0.7, 0],
      blend: "additive",
      intensity: 3,
      seed: 23,
      color: "#ffb86b"
    }))
    .camera(camera.perspective({ position: [0, 2.7, 8.2], target: [0, 1.3, 0], fov: 40 }))
});

app.onFrame((f) => {
  app.nodes.require("crystals").setRotation(0, f.time * 0.35, 0);
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
