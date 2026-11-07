import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- colour helpers ----------
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const hh = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + hh / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};

// Small deterministic RNG so every load builds the same cluster.
let seed = 7;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ---------- crystal geometry ----------
interface CrystalSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  shaft: number;
  tip: number;
  sides: number;
  tiltX: number;
  tiltZ: number;
  hue: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const buildCrystal = (c: CrystalSpec) => {
  const baseY = -0.15; // sink the root into the pedestal so tilted crystals never float
  const n = c.sides;
  const twist = rand() * Math.PI;
  const place = (p: V3): V3 => {
    // rotate about X, then Z, then translate
    const cx = Math.cos(c.tiltX), sx = Math.sin(c.tiltX);
    const y1 = p[1] * cx - p[2] * sx;
    const z1 = p[1] * sx + p[2] * cx;
    const cz = Math.cos(c.tiltZ), sz = Math.sin(c.tiltZ);
    const x2 = p[0] * cz - y1 * sz;
    const y2 = p[0] * sz + y1 * cz;
    return [x2 + c.x, y2 + 0.3 + 0.15, z1 + c.z];
  };
  const base: V3[] = [];
  const top: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = twist + (i / n) * Math.PI * 2;
    const jitter = 0.85 + rand() * 0.3;
    base.push(place([Math.cos(a) * c.radius * jitter, baseY, Math.sin(a) * c.radius * jitter]));
    top.push(place([Math.cos(a) * c.radius * jitter * 0.88, baseY + c.shaft, Math.sin(a) * c.radius * jitter * 0.88]));
  }
  const apex = place([0.05 * c.radius, baseY + c.shaft + c.tip, -0.04 * c.radius]);
  const centre = place([0, baseY + c.shaft * 0.5, 0]);
  const baseCentre = place([0, baseY, 0]);

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let faceNo = 0;
  const face = (verts: V3[]): void => {
    // orient outward relative to the crystal centre, then flat-shade with one colour
    let [p0, p1, p2] = [verts[0], verts[1], verts[2]];
    let nrm = cross(sub(p1, p0), sub(p2, p0));
    const mid: V3 = [0, 0, 0];
    for (const v of verts) { mid[0] += v[0] / verts.length; mid[1] += v[1] / verts.length; mid[2] += v[2] / verts.length; }
    const flip = dot(nrm, sub(mid, centre)) < 0;
    const ordered = flip ? [...verts].reverse() : verts;
    [p0, p1, p2] = [ordered[0], ordered[1], ordered[2]];
    nrm = cross(sub(p1, p0), sub(p2, p0));
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    const nn: V3 = [nrm[0] / len, nrm[1] / len, nrm[2] / len];
    const hue = c.hue + (faceNo * 47) % 120 - 40 + rand() * 20;
    const [r, g, b] = hslToRgb(hue, 0.78, 0.42 + ((faceNo * 13) % 5) * 0.06);
    faceNo += 1;
    const start = pos.length / 3;
    for (const v of ordered) {
      pos.push(v[0], v[1], v[2]);
      nor.push(nn[0], nn[1], nn[2]);
      col.push(r, g, b, 1);
    }
    for (let k = 1; k < ordered.length - 1; k += 1) idx.push(start, start + k, start + k + 1);
  };
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    face([base[i], base[j], top[j], top[i]]); // side
  }
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    face([top[i], top[j], apex]); // pointed top
  }
  void baseCentre;

  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
  }
  return geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: idx,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
  });
};

const crystals: CrystalSpec[] = [
  { id: "crystal-0", x: 0.0, z: 0.0, radius: 0.55, shaft: 2.2, tip: 1.1, sides: 6, tiltX: 0.04, tiltZ: -0.06, hue: 275 },
  { id: "crystal-1", x: 0.85, z: 0.25, radius: 0.38, shaft: 1.4, tip: 0.8, sides: 6, tiltX: -0.15, tiltZ: -0.38, hue: 195 },
  { id: "crystal-2", x: -0.8, z: 0.2, radius: 0.42, shaft: 1.7, tip: 0.9, sides: 5, tiltX: 0.12, tiltZ: 0.42, hue: 320 },
  { id: "crystal-3", x: 0.2, z: -0.85, radius: 0.34, shaft: 1.2, tip: 0.7, sides: 6, tiltX: -0.45, tiltZ: -0.1, hue: 230 },
  { id: "crystal-4", x: -0.25, z: 0.9, radius: 0.32, shaft: 0.95, tip: 0.65, sides: 5, tiltX: 0.5, tiltZ: 0.12, hue: 160 },
  { id: "crystal-5", x: 1.35, z: -0.55, radius: 0.24, shaft: 0.7, tip: 0.5, sides: 6, tiltX: -0.3, tiltZ: -0.7, hue: 350 },
  { id: "crystal-6", x: -1.4, z: -0.5, radius: 0.26, shaft: 0.8, tip: 0.55, sides: 5, tiltX: -0.2, tiltZ: 0.75, hue: 210 }
];

const crystalMaterial = material.pbr({ color: "#ffffff", roughness: 0.22, metallic: 0.15 });

let stage = scene({ background: "#05060c" })
  .add(sky.gradient({ zenith: "#03040a", horizon: "#140d26", ground: "#05060c", horizonGlow: 0.35 }))
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.directional({ name: "key", position: [4, 6, 6], target: [0, 1, 0], intensity: 0.7, color: "#9db4ff", shadow: true }))
  .add(lights.directional({ name: "rim-magenta", position: [-5, 3.5, -6], target: [0, 1.4, 0], intensity: 4.2, color: "#ff3fd0" }))
  .add(lights.directional({ name: "rim-cyan", position: [6, 3, -5], target: [0, 1.4, 0], intensity: 4.2, color: "#2fe0ff" }))
  .add(lights.point({ name: "core", position: [0, 1.2, 0], intensity: 6, color: "#8a5cff", distance: 7, decay: 2, shadow: false }))
  .add(primitives.cylinder({ name: "pedestal", size: [5, 0.3, 5], material: material.pbr({ color: "#15161e", roughness: 0.4, metallic: 0.6 }) }).position(0, 0.15, 0))
  .add(primitives.cylinder({ name: "pedestal-rim", size: [5.2, 0.08, 5.2], material: material.pbr({ color: "#2b2d3d", roughness: 0.3, metallic: 0.9 }) }).position(0, 0.04, 0));

for (const c of crystals) {
  stage = stage.add(geometry.custom(buildCrystal(c), { name: c.id, material: crystalMaterial }).runtime({ id: c.id, mutable: true }));
}

// Sparks: several slow additive emitters around the cluster, drifting upward.
const sparkRing = 5;
for (let i = 0; i < sparkRing; i += 1) {
  const a = (i / sparkRing) * Math.PI * 2;
  stage = stage.add(
    effects.particles({
      name: `sparks-${i}`,
      position: [Math.cos(a) * 1.7, 0.5, Math.sin(a) * 1.7],
      rate: 9,
      maxParticles: 60,
      lifetime: [2.2, 4],
      speed: [0.3, 0.8],
      size: [0.04, 0.1],
      gravity: 0,
      drag: 0.1,
      sprite: "spark-streak",
      blend: "additive",
      seed: 21 + i,
      color: i % 2 === 0 ? "#ffd9ff" : "#9ff3ff"
    })
  );
}
stage = stage.add(
  effects.particles({
    name: "sparks-core",
    position: [0, 0.8, 0],
    rate: 14,
    maxParticles: 90,
    lifetime: [2.5, 4.5],
    speed: [0.4, 1],
    size: [0.04, 0.09],
    gravity: 0,
    drag: 0.1,
    sprite: "spark-streak",
    blend: "additive",
    seed: 40,
    color: "#ffffff"
  })
);

stage = stage
  .add(effects.bloom({ intensity: 0.6, threshold: 0.7, radius: 0.5 }))
  .add(effects.vignette({}))
  .camera(camera.perspective({ position: [5.2, 3.3, 7.2], target: [0, 1.4, 0], fov: 38, near: 0.1, far: 80 }));

const app = createAuraApp("#app", { scene: stage });

let angle = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.35; // slow turn of the whole cluster about the pedestal axis
  for (const c of crystals) app.nodes.require(c.id).setRotation(0, angle, 0);
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
