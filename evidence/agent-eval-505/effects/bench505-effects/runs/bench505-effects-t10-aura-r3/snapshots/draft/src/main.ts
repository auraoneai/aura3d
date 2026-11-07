import { camera, createAuraApp, effects, geometry, material, primitives, scene } from "@aura3d/engine";
import {
  SHELL_COUNT,
  SHELL_FRAGMENT,
  SHELL_VERTEX,
  SILHOUETTE_FRAGMENT,
  SKY_FRAGMENT,
  SKY_VERTEX,
  WARM_FRAGMENT,
  WATER_FRAGMENT,
  WATER_VERTEX
} from "./shaders";

declare global {
  interface Window {
    __TASK_STATE__: { bursts: number; activeParticles: number };
    __EVAL_READY__?: boolean;
  }
}

window.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };

// ---------------------------------------------------------------------------------------------------------------
// Deterministic random numbers
// ---------------------------------------------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const geoRng = mulberry32(20240611);
const showRng = mulberry32(777);

// ---------------------------------------------------------------------------------------------------------------
// Shell geometry: one rocket ribbon, one flash quad and N spark ribbons, each duplicated as a water reflection.
// ---------------------------------------------------------------------------------------------------------------
const SPARKS = 380;
const SPARK_POINTS = 6;
const ROCKET_POINTS = 16;
const perCopy = ROCKET_POINTS * 2 + 4 + SPARKS * SPARK_POINTS * 2;
const totalVerts = perCopy * 2;

const positions = new Float32Array(totalVerts * 3);
const normals = new Float32Array(totalVerts * 3);
const uvs = new Float32Array(totalVerts * 2);
const rnd = new Float32Array(totalVerts * 4);
const info = new Float32Array(totalVerts * 4);
const indices: number[] = [];
const sparkLifeRnd = new Float32Array(SPARKS);

let vc = 0;
function putVertex(
  dir: readonly [number, number, number], u: number, w: number,
  r: readonly [number, number, number, number], kind: number, mirror: number, mix: number
): void {
  positions.set(dir, vc * 3);
  normals[vc * 3 + 1] = 1;
  uvs[vc * 2] = u;
  uvs[vc * 2 + 1] = w;
  rnd.set(r, vc * 4);
  info[vc * 4] = kind;
  info[vc * 4 + 1] = mirror;
  info[vc * 4 + 2] = mix;
  vc += 1;
}
function ribbonIndices(base: number, points: number): void {
  for (let j = 0; j < points - 1; j += 1) {
    const a = base + j * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

const sparkSpecs: Array<{ dir: [number, number, number]; rnd: [number, number, number, number]; mix: number }> = [];
for (let i = 0; i < SPARKS; i += 1) {
  const y = 1 - (2 * (i + 0.5)) / SPARKS;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * 2.399963229728653;
  let dx = Math.cos(phi) * r + (geoRng() - 0.5) * 0.05;
  let dy = y + (geoRng() - 0.5) * 0.05;
  let dz = Math.sin(phi) * r + (geoRng() - 0.5) * 0.05;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const outer = i % 10 < 7;
  const speed = outer ? 0.9 + 0.1 * geoRng() : 0.5 + 0.15 * geoRng();
  const life = geoRng();
  sparkLifeRnd[i] = life;
  sparkSpecs.push({ dir: [dx, dy, dz], rnd: [life, speed, geoRng(), geoRng()], mix: outer ? 0 : 1 });
}

for (const mirror of [0, 1]) {
  // rocket ribbon
  let base = vc;
  for (let j = 0; j < ROCKET_POINTS; j += 1) {
    for (const side of [-1, 1]) putVertex([0, 0, 0], j / (ROCKET_POINTS - 1), side, [0, 0, 0, 0], 0, mirror, 0);
  }
  ribbonIndices(base, ROCKET_POINTS);
  // burst flash quad
  base = vc;
  for (let j = 0; j < 2; j += 1) {
    for (const side of [-1, 1]) putVertex([0, 0, 0], j, side, [0, 0, 0, 0], 2, mirror, 0);
  }
  ribbonIndices(base, 2);
  // spark ribbons
  for (const sp of sparkSpecs) {
    base = vc;
    for (let j = 0; j < SPARK_POINTS; j += 1) {
      for (const side of [-1, 1]) putVertex(sp.dir, j / (SPARK_POINTS - 1), side, sp.rnd, 1, mirror, sp.mix);
    }
    ribbonIndices(base, SPARK_POINTS);
  }
}

const shellGeometry = geometry.define({
  positions,
  normals,
  uvs,
  indices,
  attributes: {
    pRnd: { itemSize: 4, data: rnd },
    pInfo: { itemSize: 4, data: info }
  },
  bounds: { min: [-700, -700, -700], max: [700, 700, 700] }
});

// ---------------------------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------------------------
type Vec4Uniform = { type: "vec4"; value: number[] };
const vec4 = (x = 0, y = 0, z = 0, w = 0): Vec4Uniform => ({ type: "vec4", value: [x, y, z, w] });

function lightUniforms(): Record<string, Vec4Uniform | { type: "f32"; value: number }> {
  const u: Record<string, Vec4Uniform | { type: "f32"; value: number }> = { uClock: { type: "f32", value: 0 } };
  for (let k = 0; k < SHELL_COUNT; k += 1) {
    u[`uP${k}`] = vec4(0, 0, 0, -100);
    u[`uC${k}`] = vec4(1, 1, 1, 1);
  }
  return u;
}

const skyMaterial = material.custom({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  uniforms: lightUniforms(),
  side: "double",
  depthWrite: false,
  fog: false
});
const waterMaterial = material.custom({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: lightUniforms(),
  side: "double",
  fog: false
});
const darkMaterial = material.custom({ glsl: { fragment: SILHOUETTE_FRAGMENT }, side: "double", fog: false });
const warmMaterial = material.custom({ glsl: { fragment: WARM_FRAGMENT }, side: "double", fog: false });

function shellMaterial() {
  return material.custom({
    glsl: { vertex: SHELL_VERTEX, fragment: SHELL_FRAGMENT },
    uniforms: {
      uClock: { type: "f32", value: 0 },
      uLaunch: vec4(0, 0, 0, -1000),
      uBurst: vec4(0, 30, -70, 1),
      uColA: vec4(1, 0.8, 0.3, 1),
      uColB: vec4(1, 0.5, 0.2, 1),
      uParams: vec4(2, 0.1, 25, 0.28),
      uRot: { type: "vec2", value: [0, 0] }
    },
    transparent: true,
    blending: "additive",
    depthWrite: false,
    depthTest: false,
    side: "double",
    fog: false
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Scene: sky dome, water, far shore silhouette, shells, bloom
// ---------------------------------------------------------------------------------------------------------------
const CAM_BASE = { x: 0, y: 2.6, z: 14 };
const CAM_TARGET = { x: 0, y: 10, z: -80 };

const stage = scene({ background: "#02030a" });

stage.add(
  primitives.sphere({ name: "sky", size: 1000, material: skyMaterial, castShadow: false, receiveShadow: false }).runtime({ id: "sky", mutable: true })
);
stage.add(
  primitives.plane({ name: "water", size: [700, 1, 360], material: waterMaterial, castShadow: false, receiveShadow: false })
    .position(0, 0, -120)
    .runtime({ id: "water", mutable: true })
);

const dark = (name: string, kind: "box" | "cyl" | "cone" | "sphere", size: [number, number, number], x: number, y: number, z: number, ry = 0, mat = darkMaterial) => {
  const opts = { name, size, material: mat, castShadow: false, receiveShadow: false };
  const node =
    kind === "box" ? primitives.box(opts)
    : kind === "cyl" ? primitives.cylinder(opts)
    : kind === "sphere" ? primitives.sphere(opts)
    : primitives.cone({ ...opts, params: { radialSegments: 4 } });
  stage.add(node.position(x, y, z).rotate(0, ry, 0));
};

// land mass with a slightly irregular shoreline
dark("land-main", "box", [700, 8, 220], 0, -3, -194);
dark("land-left", "box", [80, 8, 14], -52, -3, -80);
dark("land-right", "box", [54, 8, 10], 40, -3, -81);
dark("land-spit", "box", [20, 8, 8], 8, -3, -85);

// buildings along the shore: [x, width, height, depth, z]
const buildings: Array<[number, number, number, number, number]> = [
  [-62, 7, 6, 6, -93], [-54, 6, 8.5, 6, -95], [-46, 9, 5, 7, -92], [-38, 5, 7.5, 5, -96],
  [-14, 7, 6.5, 6, -94], [-6, 6, 9.5, 6, -97], [2, 8, 5.5, 6, -93], [11, 6, 7, 6, -96],
  [26, 8, 6, 6, -92], [35, 6, 9, 6, -95], [43, 9, 5, 6, -93], [53, 6, 7, 5, -96], [62, 7, 6, 6, -94]
];
const warmWindows: Array<[number, number, number]> = [];
buildings.forEach(([x, w, h, d, z], i) => {
  dark(`bld-${i}`, "box", [w, h, d], x, 1 + h / 2, z);
  if (i % 2 === 0) dark(`roof-${i}`, "cone", [w * 1.35, 2.6, d * 1.35], x, 1 + h + 1.3, z, Math.PI / 4);
  if (i % 3 !== 1) warmWindows.push([x - w * 0.22, 1 + h * 0.55, z + d / 2 + 0.05]);
  if (i % 3 === 0) warmWindows.push([x + w * 0.2, 1 + h * 0.35, z + d / 2 + 0.05]);
});
warmWindows.forEach(([x, y, z], i) => dark(`win-${i}`, "box", [0.8, 1.0, 0.2], x, y, z, 0, warmMaterial));

// lighthouse, crane and trees
dark("lighthouse", "cyl", [2.8, 15, 2.8], -28, 8.5, -97);
dark("lighthouse-lamp-room", "cyl", [3.6, 1.6, 3.6], -28, 16.8, -97);
dark("lighthouse-cap", "cone", [4.4, 2.4, 4.4], -28, 18.8, -97, Math.PI / 4);
dark("lighthouse-lamp", "sphere", [1.5, 1.5, 1.5], -28, 16.8, -97, 0, warmMaterial);
dark("crane-mast", "box", [1.0, 20, 1.0], 18, 11, -92);
dark("crane-jib", "box", [16, 0.8, 0.8], 12, 21, -92);
dark("crane-hook", "box", [0.2, 5, 0.2], 6, 18.4, -92);
for (let i = 0; i < 16; i += 1) {
  const tx = -70 + i * 9.3 + (geoRng() - 0.5) * 4;
  const th = 3 + geoRng() * 3;
  dark(`tree-${i}`, "cone", [3.2, th, 3.2], tx, 1 + th / 2, -88.5 - geoRng() * 2);
}

// pier running out into the harbor, with posts and a lamp
dark("pier-deck", "box", [3.2, 0.5, 28], -22, 1.1, -70);
for (let i = 0; i < 8; i += 1) {
  dark(`pier-post-a${i}`, "cyl", [0.5, 2.6, 0.5], -23.4, 0.1, -58.5 - i * 3.6);
  dark(`pier-post-b${i}`, "cyl", [0.5, 2.6, 0.5], -20.6, 0.1, -58.5 - i * 3.6);
}
dark("pier-lamp-pole", "cyl", [0.18, 3.4, 0.18], -22, 3.0, -56.8);
dark("pier-lamp", "sphere", [0.6, 0.6, 0.6], -22, 4.9, -56.8, 0, warmMaterial);

// boats
function boat(name: string, x: number, z: number, len: number, mast: number, ry: number, lantern: boolean): void {
  dark(`${name}-hull`, "box", [len, 1.1, len * 0.3], x, 0.2, z, ry);
  dark(`${name}-bow`, "cone", [len * 0.3, len * 0.28, len * 0.3], x + Math.cos(ry) * len * 0.5, 0.2, z - Math.sin(ry) * len * 0.5, ry - Math.PI / 2 + Math.PI / 4);
  dark(`${name}-cabin`, "box", [len * 0.28, 1.0, len * 0.2], x - Math.cos(ry) * len * 0.12, 1.2, z + Math.sin(ry) * len * 0.12, ry);
  dark(`${name}-mast`, "cyl", [0.14, mast, 0.14], x + Math.cos(ry) * len * 0.12, 0.7 + mast / 2, z - Math.sin(ry) * len * 0.12);
  if (lantern) dark(`${name}-lantern`, "sphere", [0.45, 0.45, 0.45], x + Math.cos(ry) * len * 0.12, 0.8 + mast, z - Math.sin(ry) * len * 0.12, 0, warmMaterial);
}
boat("boat-a", 12, -63, 9, 7, 0.08, true);
boat("boat-b", -6, -70, 7, 5.5, -0.12, false);
boat("boat-c", 30, -69, 8, 6.5, 0.05, true);
boat("boat-d", -40, -66, 6, 5, 0.2, false);
boat("boat-e", 24, -40, 10, 6, -0.06, false);
boat("boat-f", -32, -47, 7.5, 5, 0.1, true);

// shells
for (let k = 0; k < SHELL_COUNT; k += 1) {
  stage.add(
    geometry.custom(shellGeometry, { name: `shell-${k}`, material: shellMaterial(), castShadow: false, receiveShadow: false })
      .runtime({ id: `shell-${k}`, mutable: true })
  );
}

stage.add(effects.bloom({ intensity: 0.95, threshold: 0.7, radius: 0.65 }));
stage.camera(camera.perspective({ position: [CAM_BASE.x, CAM_BASE.y, CAM_BASE.z], target: [CAM_TARGET.x, CAM_TARGET.y, CAM_TARGET.z], fov: 46, near: 1, far: 1500 }));

const app = createAuraApp("#app", {
  scene: stage,
  output: { toneMapping: "none", exposure: 1 }
});

// ---------------------------------------------------------------------------------------------------------------
// Show director
// ---------------------------------------------------------------------------------------------------------------
type RGB = readonly [number, number, number];
const PALETTES: ReadonlyArray<{ a: RGB; b: RGB }> = [
  { a: [1.0, 0.78, 0.28], b: [1.0, 0.5, 0.15] }, // gold
  { a: [1.0, 0.16, 0.14], b: [1.0, 0.55, 0.4] }, // red
  { a: [0.2, 0.45, 1.0], b: [0.65, 0.85, 1.0] }, // blue
  { a: [0.25, 1.0, 0.4], b: [0.85, 1.0, 0.5] }, // green
  { a: [0.75, 0.3, 1.0], b: [1.0, 0.55, 0.85] }, // violet
  { a: [0.9, 0.95, 1.0], b: [1.0, 0.85, 0.6] } // silver
];

interface Shell {
  readonly id: string;
  readonly index: number;
  busyUntil: number;
  burstAt: number;
  life: number;
  counted: boolean;
  launched: boolean;
}
const shells: Shell[] = Array.from({ length: SHELL_COUNT }, (_, index) => ({
  id: `shell-${index}`, index, busyUntil: 0, burstAt: Infinity, life: 2, counted: false, launched: false
}));

type Handle = { setUniform?: (name: string, value: number | number[]) => unknown };
const handles = new Map<string, Handle>();
function uniform(id: string, name: string, value: number | number[]): void {
  handles.get(id)?.setUniform?.(name, value);
}

let clock = 0;
let bursts = 0;
let activeParticles = 0;
let nextLaunch = 0.15;
let lastPalette = -1;

function launch(shell: Shell): void {
  let pi = Math.floor(showRng() * PALETTES.length);
  if (pi === lastPalette) pi = (pi + 1 + Math.floor(showRng() * (PALETTES.length - 1))) % PALETTES.length;
  lastPalette = pi;
  const pal = PALETTES[pi]!;
  const streak = showRng() < 0.45;
  const lx = (showRng() * 2 - 1) * 40;
  const lz = -88 - showRng() * 2;
  const bx = Math.max(-42, Math.min(42, lx * 0.85 + (showRng() * 2 - 1) * 8));
  const by = 19 + showRng() * 11;
  const bz = -80 + showRng() * 18;
  const flight = shell.index === 0 && bursts === 0 ? 0.95 : 1.05 + showRng() * 0.6;
  const life = streak ? 2.4 : 1.8 + showRng() * 0.3;
  const trail = streak ? 0.5 : 0.07;
  const speed = (streak ? 22 : 25) * (0.88 + showRng() * 0.25);

  shell.burstAt = clock + flight;
  shell.life = life;
  shell.counted = false;
  shell.launched = true;
  shell.busyUntil = shell.burstAt + life + 0.15;

  const id = shell.id;
  uniform(id, "uLaunch", [lx, 1.2, lz, clock]);
  uniform(id, "uBurst", [bx, by, bz, flight]);
  uniform(id, "uColA", [pal.a[0], pal.a[1], pal.a[2], 1]);
  uniform(id, "uColB", [pal.b[0], pal.b[1], pal.b[2], 1]);
  uniform(id, "uParams", [life, trail, speed, 0.28]);
  uniform(id, "uRot", [(showRng() - 0.5) * 2.4, showRng() * Math.PI * 2]);

  for (const target of ["sky", "water"]) {
    uniform(target, `uP${shell.index}`, [bx, by, bz, shell.burstAt]);
    uniform(target, `uC${shell.index}`, [pal.a[0], pal.a[1], pal.a[2], 1]);
  }
}

function sparksAlive(shell: Shell): number {
  const age = clock - shell.burstAt;
  if (age < 0 || age >= shell.life) return 0;
  let n = 0;
  for (let i = 0; i < SPARKS; i += 1) {
    if (age < shell.life * (0.62 + 0.38 * sparkLifeRnd[i]!)) n += 1;
  }
  return n;
}

function stepShow(dt: number): void {
  clock += dt;
  if (clock >= nextLaunch) {
    const free = shells.find((s) => clock >= s.busyUntil);
    if (free) launch(free);
    const salvo = showRng() < 0.2;
    nextLaunch = clock + (salvo ? 0.15 + showRng() * 0.15 : 0.45 + Math.pow(showRng(), 1.5) * 2.2);
  }
  let active = 0;
  for (const s of shells) {
    if (!s.counted && s.launched && clock >= s.burstAt) {
      s.counted = true;
      bursts += 1;
    }
    active += sparksAlive(s);
  }
  activeParticles = active;
  window.__TASK_STATE__ = { bursts, activeParticles };
  for (const s of shells) uniform(s.id, "uClock", clock);
  uniform("sky", "uClock", clock);
  uniform("water", "uClock", clock);
}

let cameraDriftOk = true;
function drift(): void {
  if (!cameraDriftOk) return;
  try {
    const ctl = app.camera;
    if (!ctl) { cameraDriftOk = false; return; }
    const sway = Math.sin(clock * 0.09);
    ctl.setPose({
      position: [CAM_BASE.x + sway * 5, CAM_BASE.y + Math.sin(clock * 0.06) * 0.35, CAM_BASE.z],
      target: [CAM_TARGET.x + sway * 2, CAM_TARGET.y + Math.sin(clock * 0.05) * 0.8, CAM_TARGET.z]
    });
  } catch {
    cameraDriftOk = false;
  }
}

let frames = 0;
app.onFrame((frame) => {
  try {
    const raw = typeof frame.dt === "number" && Number.isFinite(frame.dt) ? frame.dt : 1 / 60;
    stepShow(Math.min(Math.max(raw, 0), 0.1));
    drift();
  } catch (error) {
    console.error(error);
  }
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});

void app.ready().then(() => {
  for (const id of ["sky", "water", ...shells.map((s) => s.id)]) {
    handles.set(id, app.nodes.require(id) as unknown as Handle);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
});
