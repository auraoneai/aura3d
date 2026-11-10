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
  scene,
  surfaces,
  texture
} from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Procedural textures: metallic flake colour + flake micro-normal map
// ---------------------------------------------------------------------------
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEX = 256;
function flakeTextures() {
  const rand = rng(1234);
  const color = new Uint8Array(TEX * TEX * 4);
  const normal = new Uint8Array(TEX * TEX * 4);
  for (let i = 0; i < TEX * TEX; i += 1) {
    const flake = rand();
    // base candy red, with sparse brighter flakes
    let r = 255, g = 255, b = 255;
    const k = flake > 0.93 ? 1.0 : 0.82 + rand() * 0.12;
    r = Math.round(255 * k);
    g = Math.round(255 * (flake > 0.93 ? 0.85 + rand() * 0.15 : k));
    b = Math.round(255 * (flake > 0.93 ? 0.8 + rand() * 0.2 : k));
    color.set([r, g, b, 255], i * 4);
    // random flake facets: tilt the normal
    const tilt = flake > 0.7 ? 0.55 : 0.12;
    const nx = (rand() * 2 - 1) * tilt;
    const ny = (rand() * 2 - 1) * tilt;
    const nz = Math.sqrt(Math.max(0.0, 1 - nx * nx - ny * ny));
    normal.set([Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255), 255], i * 4);
  }
  const c = texture.data({ width: TEX, height: TEX, data: color, format: "rgba8", colorSpace: "srgb" });
  const n = texture.data({ width: TEX, height: TEX, data: normal, format: "rgba8", colorSpace: "linear" });
  for (const t of [c, n]) {
    t.wrapS = "repeat";
    t.wrapT = "repeat";
    t.repeat = [10, 5];
    t.minFilter = "linear-mipmap-linear";
    t.magFilter = "linear";
    t.generateMipmaps = true;
  }
  return { c, n };
}

// ---------------------------------------------------------------------------
// Lofted smooth bodies
// ---------------------------------------------------------------------------
type Section = (t: number, phi: number) => [number, number, number];

interface LoftOpts {
  readonly nU: number;
  readonly nV: number;
  readonly f: Section;
  readonly t0?: number; // -1..1 range start
  readonly t1?: number;
  readonly phi0?: number;
  readonly phi1?: number;
  readonly uvScale?: [number, number];
}

function loft(o: LoftOpts) {
  const t0 = o.t0 ?? -1, t1 = o.t1 ?? 1, p0 = o.phi0 ?? 0, p1 = o.phi1 ?? Math.PI * 2;
  const full = o.phi0 === undefined && o.phi1 === undefined;
  const nV = o.nV, nU = o.nU;
  const positions = new Float32Array((nU + 1) * (nV + 1) * 3);
  const uvs = new Float32Array((nU + 1) * (nV + 1) * 2);
  const indices: number[] = [];
  const min: [number, number, number] = [1e9, 1e9, 1e9];
  const max: [number, number, number] = [-1e9, -1e9, -1e9];
  const [su, sv] = o.uvScale ?? [1, 1];
  for (let j = 0; j <= nU; j += 1) {
    // cosine spacing refines the ends
    const a = j / nU;
    const eased = full && o.t0 === undefined ? (1 - Math.cos(Math.PI * a)) / 2 : a;
    const t = t0 + (t1 - t0) * eased;
    for (let i = 0; i <= nV; i += 1) {
      const phi = p0 + (p1 - p0) * (i / nV);
      const p = o.f(t, phi);
      const idx = j * (nV + 1) + i;
      positions.set(p, idx * 3);
      uvs.set([a * su, (i / nV) * sv], idx * 2);
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k]!, p[k]!);
        max[k] = Math.max(max[k]!, p[k]!);
      }
      if (i < nV && j < nU) {
        const v = idx;
        indices.push(v, v + nV + 1, v + 1, v + 1, v + nV + 1, v + nV + 2);
      }
    }
  }
  const normals = geometry.computeNormals({ positions, indices });
  return geometry.define({ positions, normals, indices, uvs, bounds: { min, max } });
}

const sp = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);

// Body: streamlined bean (superellipse cross-section, ellipsoid-ish length profile)
const BODY_L = 3.7;
const BODY_YC = 0.58;
function bodySection(grow = 1): Section {
  return (t, phi) => {
    const s = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.5)), 0.5);
    const W = 0.8 * s;
    const hood = 1 - 0.16 * t; // slightly taller tail than nose
    const Hu = 0.5 * Math.pow(s, 0.9) * hood;
    const Hl = 0.3 * s;
    const c = Math.cos(phi), sn = Math.sin(phi);
    const z = W * sp(c, 0.62) * grow;
    const y = (sn > 0 ? Hu : Hl) * sp(sn, 0.62) * grow;
    return [t * BODY_L * 0.5, BODY_YC + y, z];
  };
}

// Cabin: bubble canopy sitting on the body
const CAB_X = -0.25;
const CAB_L = 1.9;
const CAB_YC = 0.93;
function cabinSection(grow = 1): Section {
  return (t, phi) => {
    const s = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.2)), 0.55);
    const W = 0.6 * s;
    const Hu = 0.5 * Math.pow(s, 0.85);
    const Hl = 0.16 * s;
    const c = Math.cos(phi), sn = Math.sin(phi);
    const z = W * sp(c, 0.7) * grow;
    const y = (sn > 0 ? Hu : Hl) * sp(sn, 0.7) * grow;
    return [CAB_X + t * CAB_L * 0.5 + 0.08 * Math.max(0, sn) * t * 0, CAB_YC + y, z];
  };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const flakes = flakeTextures();

const paint = material.carPaint({
  name: "candy red paint",
  color: "#c20a1a",
  texture: flakes.c,
  normal: flakes.n,
  normalScale: 0.35,
  metallic: 0.55,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 2.2,
  doubleSided: true
});
const chrome = material.pbr({ name: "chrome", color: "#f2f4f8", metallic: 1, roughness: 0.04, envMapIntensity: 2.4, doubleSided: true });
const glass = material.pbr({ name: "dark glass", color: "#05070a", metallic: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 2.0, doubleSided: true });
const rubber = material.pbr({ name: "rubber", color: "#0b0b0d", metallic: 0, roughness: 0.85 });

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------
const bodyGeo = loft({ nU: 72, nV: 64, f: bodySection(), uvScale: [6, 3] });
const cabinGeo = loft({ nU: 40, nV: 48, f: cabinSection(), uvScale: [4, 2] });
const roofGeo = loft({ nU: 28, nV: 24, f: cabinSection(1.018), t0: -0.62, t1: 0.7, phi0: Math.PI / 2 - 0.85, phi1: Math.PI / 2 + 0.85, uvScale: [3, 1] });

function beltStrip(side: 1 | -1) {
  const phiC = side === 1 ? 0.5 : Math.PI - 0.5;
  return loft({ nU: 70, nV: 4, f: bodySection(1.012), t0: -0.8, t1: 0.82, phi0: phiC - 0.035, phi1: phiC + 0.035 });
}

function wheel(x: number, z: number, tag: string) {
  const side = z > 0 ? 1 : -1;
  return [
    primitives.cylinder({ name: `tire ${tag}`, size: [0.78, 0.3, 0.78], rotation: [Math.PI / 2, 0, 0], material: rubber }).position(x, 0.39, z),
    primitives.cylinder({ name: `rim ${tag}`, size: [0.46, 0.31, 0.46], rotation: [Math.PI / 2, 0, 0], material: chrome }).position(x, 0.39, z + side * 0.006),
    primitives.cylinder({ name: `hub ${tag}`, size: [0.16, 0.325, 0.16], rotation: [Math.PI / 2, 0, 0], material: rubber }).position(x, 0.39, z + side * 0.006)
  ];
}

function buildCar() {
  const parts = [
    geometryNode("body", bodyGeo, paint),
    geometryNode("cabin glass", cabinGeo, glass),
    geometryNode("roof panel", roofGeo, paint),
    geometryNode("belt chrome L", beltStrip(1), chrome),
    geometryNode("belt chrome R", beltStrip(-1), chrome),
    // chrome front and rear bumper bars
    primitives.torus({ name: "front chrome ring", size: [0.55, 0.55, 0.55], rotation: [0, Math.PI / 2, 0], material: chrome }).position(1.78, 0.58, 0).scale(0.15, 1, 1),
    ...wheel(1.15, 0.7, "FR"), ...wheel(1.15, -0.7, "FL"), ...wheel(-1.15, 0.7, "RR"), ...wheel(-1.15, -0.7, "RL")
  ];
  return parts;
}

function geometryNode(name: string, geo: ReturnType<typeof loft>, mat: ReturnType<typeof material.pbr>) {
  return geometry.custom(geo, { name, material: mat, castShadow: true, receiveShadow: false });
}

// ---------------------------------------------------------------------------
// Turntable
// ---------------------------------------------------------------------------
const PLAT_R = 3.0;
const PLAT_H = 0.16;

function buildPlatform() {
  const nodes = [
    primitives.cylinder({ name: "platform body", size: [PLAT_R * 2, PLAT_H, PLAT_R * 2], material: material.pbr({ color: "#15171c", metallic: 0.8, roughness: 0.3 }) }).position(0, PLAT_H / 2, 0),
    primitives.cylinder({ name: "platform edge chrome", size: [PLAT_R * 2 + 0.06, 0.03, PLAT_R * 2 + 0.06], material: chrome }).position(0, PLAT_H - 0.015, 0),
    primitives.torus({ name: "ring light", size: [PLAT_R * 2 - 0.5, 0.06, PLAT_R * 2 - 0.5], material: material.emissive({ color: "#9cc8ff", emissive: "#8fc0ff", emissiveIntensity: 2.2 }) }).position(0, PLAT_H + 0.005, 0)
  ];
  return nodes;
}

const TICKS = 36;
const ticks = Array.from({ length: TICKS }, (_, i) => {
  const a = (i / TICKS) * Math.PI * 2;
  const r = PLAT_R - 0.12;
  return primitives.box({ name: `tick ${i}`, size: [0.05, 0.012, i % 3 === 0 ? 0.24 : 0.12], rotation: [0, a, 0], material: material.pbr({ color: "#aab4c4", metallic: 0.9, roughness: 0.25 }) }).position(Math.sin(a) * r, PLAT_H + 0.004, Math.cos(a) * r);
});

// Car sits on top of the platform
const carGroup = group("car", buildCar()).position(0, PLAT_H, 0);
const turntable = group("turntable", [...buildPlatform(), ...ticks, carGroup]).runtime({ id: "turntable", mutable: true });

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const strip = (name: string, pos: [number, number, number], size: [number, number, number], color: string, intensity: number) =>
  primitives.box({ name, size, material: material.emissive({ color, emissive: color, emissiveIntensity: intensity }) }).position(...pos);

const stage = scene({ background: "#07080b" })
  .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
  .add(lights.directional({ name: "key", position: [3, 6, 4], target: [0, 0.5, 0], intensity: 1.4, color: "#fff2e6" }))
  .add(lights.directional({ name: "cool rim", position: [-4, 3, -5], target: [0, 0.6, 0], intensity: 2.2, color: "#9fc4ff" }))
  .add(primitives.plane({ name: "floor", size: [60, 1, 60], material: material.pbr({ color: "#0a0b0e", roughness: 0.6 }) }))
  .add(surfaces.mirror({ name: "turntable mirror", size: [4.0, 4.0], position: [0, PLAT_H + 0.002, 0], resolution: 512, tint: "#4a4d55" }))
  .add(turntable)
  .add(effects.bloom({ intensity: 0.35, threshold: 0.9, radius: 0.5 }))
  .camera(camera.perspective({ position: [4.6, 1.25, 6.6], target: [0, 0.65, 0], fov: 34 }));

void strip;

const app = createAuraApp("#app", { scene: stage });

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

const SPEED_DEG = 20;
let angleDeg = 0;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame((f) => {
  angleDeg += SPEED_DEG * f.dt;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
});

void app.ready();
