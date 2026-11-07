import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const PLATFORM_TOP = 0.9;
const RING_R = 1.9; // radius of block centres
const RING_CY = 3.55; // ring centre height
const DISC_R = 1.65;

// ---------------------------------------------------------------------------
// Stone ring built from blocks
// ---------------------------------------------------------------------------
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const runesCyan: AuraTransformSpec[] = [];
const runesViolet: AuraTransformSpec[] = [];
const BLOCKS = 24;
for (let i = 0; i < BLOCKS; i += 1) {
  const a = (i / BLOCKS) * Math.PI * 2;
  const radial = range(0.55, 0.68);
  const depth = range(0.58, 0.7);
  const rr = RING_R + range(-0.03, 0.04);
  const cx = Math.cos(a) * rr;
  const cy = RING_CY + Math.sin(a) * rr;
  ringBlocks.push({
    position: [cx, cy, range(-0.03, 0.03)],
    rotation: [range(-0.03, 0.03), range(-0.04, 0.04), a + range(-0.03, 0.03)],
    scale: [radial, 0.57, depth]
  });
  ringColors.push(`hsl(${255 + Math.floor(rand() * 30)}, ${8 + Math.floor(rand() * 10)}%, ${30 + Math.floor(rand() * 16)}%)`);
  const target = i % 2 === 0 ? runesCyan : runesViolet;
  for (const side of [1, -1]) {
    const zf = side * (depth / 2 + 0.012);
    const piece = (dx: number, dy: number, sx: number, sy: number): void => {
      target.push({
        position: [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a), zf],
        rotation: [0, 0, a],
        scale: [sx, sy, 0.03]
      });
    };
    piece(0, 0, 0.3, 0.05);
    piece(0.08, 0, 0.05, 0.22);
    piece(-0.1, 0.1, 0.07, 0.05);
  }
}

// ---------------------------------------------------------------------------
// Pillars, rubble, platform
// ---------------------------------------------------------------------------
const shafts: AuraTransformSpec[] = [];
const shaftColors: string[] = [];
const slabs: AuraTransformSpec[] = [];
const slabColors: string[] = [];

const stoneColor = (l: number): string => `hsl(${250 + Math.floor(rand() * 30)}, ${6 + Math.floor(rand() * 8)}%, ${l + Math.floor(rand() * 8)}%)`;

const pillars: Array<{ x: number; z: number; h: number; broken: boolean }> = [
  { x: -5.4, z: -1.8, h: 5.2, broken: false },
  { x: 5.2, z: -2.4, h: 3.4, broken: true },
  { x: -3.9, z: 3.8, h: 1.9, broken: true },
  { x: 4.4, z: 3.6, h: 5.0, broken: false },
  { x: -7.6, z: -5.8, h: 3.8, broken: true },
  { x: 7.8, z: -6.2, h: 2.6, broken: true },
  { x: 0.2, z: -8.0, h: 4.4, broken: true }
];
for (const p of pillars) {
  const baseY = p.x * p.x + p.z * p.z < 30 ? PLATFORM_TOP : 0;
  const lean = p.broken ? range(-0.04, 0.04) : 0;
  slabs.push({ position: [p.x, baseY + 0.15, p.z], scale: [1.5, 0.3, 1.5], rotation: [0, range(-0.2, 0.2), 0] });
  slabColors.push(stoneColor(26));
  shafts.push({ position: [p.x, baseY + 0.3 + p.h / 2, p.z], scale: [0.95, p.h, 0.95], rotation: [lean, 0, lean] });
  shaftColors.push(stoneColor(32));
  if (!p.broken) {
    slabs.push({ position: [p.x, baseY + 0.3 + p.h + 0.15, p.z], scale: [1.35, 0.3, 1.35], rotation: [0, 0.2, 0] });
    slabColors.push(stoneColor(30));
  } else {
    // jagged broken top
    slabs.push({ position: [p.x + 0.12, baseY + 0.3 + p.h + 0.05, p.z - 0.05], scale: [0.55, 0.28, 0.5], rotation: [0.35, 0.6, 0.25] });
    slabColors.push(stoneColor(28));
    // fallen drum next to the base
    shafts.push({
      position: [p.x + range(1.0, 1.6) * (p.x > 0 ? 1 : -1), 0.42, p.z + range(0.6, 1.4)],
      scale: [0.95, range(0.7, 1.3), 0.95],
      rotation: [0, range(0, 3), Math.PI / 2]
    });
    shaftColors.push(stoneColor(28));
  }
}

const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 70; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = range(3.2, 10);
  const s = range(0.12, 0.55);
  const onPlatform = r < 3.6;
  rubble.push({
    position: [Math.cos(a) * r, (onPlatform ? PLATFORM_TOP : 0) + s * 0.3, Math.sin(a) * r],
    rotation: [range(0, 3), range(0, 3), range(0, 3)],
    scale: [s * range(0.8, 1.6), s * range(0.6, 1), s * range(0.8, 1.4)]
  });
  rubbleColors.push(stoneColor(22));
}

// Platform edge stones (weathered kerb around the top tier)
const kerb: AuraTransformSpec[] = [];
const kerbColors: string[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = (i / 28) * Math.PI * 2;
  kerb.push({ position: [Math.cos(a) * 3.55, PLATFORM_TOP + 0.08, Math.sin(a) * 3.55], rotation: [0, -a, 0], scale: [0.5, 0.2, 0.9] });
  kerbColors.push(stoneColor(30));
}

// ---------------------------------------------------------------------------
// Vortex disc (custom shader on a polar mesh in the XY plane)
// ---------------------------------------------------------------------------
function buildDisc(rings: number, segs: number, radius: number) {
  const vertexCount = (rings + 1) * (segs + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  for (let j = 0; j <= rings; j += 1) {
    for (let i = 0; i <= segs; i += 1) {
      const k = (j * (segs + 1) + i) * 3;
      const a = (i / segs) * Math.PI * 2;
      const r = (j / rings) * radius;
      positions[k] = Math.cos(a) * r;
      positions[k + 1] = Math.sin(a) * r;
      positions[k + 2] = 0;
      normals[k + 2] = 1;
      if (i < segs && j < rings) {
        const v = j * (segs + 1) + i;
        indices.push(v, v + 1, v + segs + 1, v + 1, v + segs + 2, v + segs + 1);
      }
    }
  }
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-radius, -radius, -0.01], max: [radius, radius, 0.01] }
  });
}

const vortexMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec2 vP;
out vec4 outColor;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec2 rot2(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  float t = portalClock;
  vec2 p = vP / ${DISC_R.toFixed(3)};
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float inv = 1.0 - r;

  vec2 q1 = rot2(p, 3.4 * inv - t * 0.85);
  vec2 q2 = rot2(p, -5.0 * inv * inv + t * 0.55);
  float n1 = vnoise(q1 * 3.4 + 4.0);
  float n2 = vnoise(q2 * 7.0 + 11.0);
  float arms = 0.5 + 0.5 * sin(5.0 * a + 9.0 * sqrt(r) - t * 2.6);
  float arms2 = 0.5 + 0.5 * sin(3.0 * a - 14.0 * r + t * 1.7);

  float band = clamp(0.5 * arms + 0.2 * arms2 + 0.55 * n1 + 0.3 * n2 - 0.15, 0.0, 1.0);

  vec3 deep = vec3(0.05, 0.015, 0.22);
  vec3 violet = vec3(0.42, 0.1, 1.1);
  vec3 cyan = vec3(0.1, 0.85, 1.25);

  vec3 col = mix(deep, violet, smoothstep(0.1, 0.5, band));
  col = mix(col, cyan, smoothstep(0.45, 0.95, band) * (0.35 + 0.65 * inv));
  col = mix(col, cyan * 1.1, inv * 0.3);

  float core = exp(-r * r * 15.0);
  col += vec3(0.85, 1.0, 1.0) * core * 3.2;
  col += cyan * exp(-r * 2.6) * 0.5;

  float rim = smoothstep(0.78, 0.98, r);
  col += mix(cyan, violet * 1.6, 0.45) * rim * 1.3;

  float pulse = 0.92 + 0.08 * sin(t * 1.5);
  outColor = vec4(col * pulse, 1.0);
}`
  },
  uniforms: { portalClock: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const stone = material.pbr({ color: "#ffffff", roughness: 0.92, metallic: 0.02 });
const runeCyanMat = material.emissive({ color: "#7fe8ff", emissive: "#38d8ff", emissiveIntensity: 3 });
const runeVioletMat = material.emissive({ color: "#c9a0ff", emissive: "#9a55ff", emissiveIntensity: 3 });

const SPIRAL_CAP = 200;
const MOTE_CAP = 90;
const hiddenPool = (n: number): AuraTransformSpec[] =>
  Array.from({ length: n }, () => ({ position: [0, -50, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

const stage = scene({ background: "#120c24" })
  .add(sky.gradient({ zenith: "#0d0a22", horizon: "#9a4a68", ground: "#0b0814", horizonGlow: 0.5 }))
  .add(environments.neutral({ intensity: 0.3, background: false }))
  .add(lights.hemisphere({ skyColor: "#4a3f8a", groundColor: "#160f22", intensity: 0.55 }))
  .add(lights.directional({ name: "dusk-sun", position: [-12, 5, -9], target: [0, 1.5, 0], intensity: 1.5, color: "#ff9068", shadow: true }))
  .add(lights.directional({ name: "dusk-fill", position: [8, 6, 10], target: [0, 1.5, 0], intensity: 0.4, color: "#6a7ae0" }))
  .add(lights.point({ name: "portal-front", position: [0, RING_CY, 2.4], intensity: 70, color: "#3fd8ff", distance: 16, decay: 2, shadow: false }).runtime({ id: "light-front", mutable: true }))
  .add(lights.point({ name: "portal-back", position: [0, RING_CY, -2.4], intensity: 70, color: "#9a50ff", distance: 16, decay: 2, shadow: false }).runtime({ id: "light-back", mutable: true }))
  .add(lights.point({ name: "portal-floor", position: [0, PLATFORM_TOP + 0.9, 1.2], intensity: 36, color: "#6fb4ff", distance: 10, decay: 2, shadow: false }).runtime({ id: "light-floor", mutable: true }))
  // ground and platform
  .add(primitives.plane({ name: "ground", size: [90, 1, 90], material: material.pbr({ color: "#1c1a26", roughness: 1 }) }))
  .add(primitives.cylinder({ name: "platform-low", size: [10, 0.5, 10], material: material.pbr({ color: "#4b4858", roughness: 0.95 }), params: { radialSegments: 40 } }).position(0, 0.25, 0))
  .add(primitives.cylinder({ name: "platform-top", size: [7.4, 0.4, 7.4], material: material.pbr({ color: "#5a566a", roughness: 0.9 }), params: { radialSegments: 40 } }).position(0, 0.7, 0))
  .add(instances.box({ name: "kerb", transforms: kerb, colors: kerbColors, material: stone }))
  // plinth and ring
  .add(primitives.box({ name: "plinth", size: [2.0, 0.5, 1.3], material: material.pbr({ color: "#494658", roughness: 0.9 }) }).position(0, PLATFORM_TOP + 0.25, 0))
  .add(instances.box({ name: "ring-blocks", transforms: ringBlocks, colors: ringColors, material: stone }))
  .add(instances.box({ name: "runes-cyan", transforms: runesCyan, material: runeCyanMat, castShadow: false }))
  .add(instances.box({ name: "runes-violet", transforms: runesViolet, material: runeVioletMat, castShadow: false }))
  .add(geometry.custom(buildDisc(14, 96, DISC_R), { name: "vortex", material: vortexMaterial }).runtime({ id: "vortex", mutable: true }).position(0, RING_CY, 0))
  // ruins
  .add(instances.cylinder({ name: "pillar-shafts", transforms: shafts, colors: shaftColors, material: stone, params: { radialSegments: 14 } }))
  .add(instances.box({ name: "pillar-slabs", transforms: slabs, colors: slabColors, material: stone }))
  .add(instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stone }))
  // particles (driven per frame)
  .add(
    instances
      .sphere({ name: "spiral-cyan", transforms: hiddenPool(SPIRAL_CAP), material: material.emissive({ color: "#9af0ff", emissive: "#40dcff", emissiveIntensity: 4 }), castShadow: false })
      .runtime({ id: "spiral-cyan", mutable: true })
  )
  .add(
    instances
      .sphere({ name: "spiral-violet", transforms: hiddenPool(SPIRAL_CAP), material: material.emissive({ color: "#d2b0ff", emissive: "#a060ff", emissiveIntensity: 4 }), castShadow: false })
      .runtime({ id: "spiral-violet", mutable: true })
  )
  .add(
    instances
      .sphere({ name: "motes", transforms: hiddenPool(MOTE_CAP), material: material.emissive({ color: "#e0fbff", emissive: "#a8f0ff", emissiveIntensity: 3.5 }), castShadow: false })
      .runtime({ id: "motes", mutable: true })
  )
  // atmosphere
  .add(effects.fog({ color: "#2a1a3c", density: 0.02 }))
  .add(effects.bloom({ intensity: 1.35, threshold: 0.55, radius: 0.75 }))
  .add(effects.vignette())
  .camera(camera.perspective({ position: [0, 3.0, 11.5], target: [0, 3.0, 0], fov: 42, near: 0.2, far: 160 }));

// ---------------------------------------------------------------------------
// Particle simulation
// ---------------------------------------------------------------------------
interface Pool {
  cap: number;
  alive: Uint8Array;
  age: Float32Array;
  life: Float32Array;
  a: Float32Array; // generic per-particle params
  b: Float32Array;
  c: Float32Array;
  d: Float32Array;
  e: Float32Array;
  size: Float32Array;
  matrices: Float32Array;
  acc: number;
  rate: number;
  count: number;
}
const makePool = (cap: number, rate: number): Pool => ({
  cap,
  alive: new Uint8Array(cap),
  age: new Float32Array(cap),
  life: new Float32Array(cap),
  a: new Float32Array(cap),
  b: new Float32Array(cap),
  c: new Float32Array(cap),
  d: new Float32Array(cap),
  e: new Float32Array(cap),
  size: new Float32Array(cap),
  matrices: new Float32Array(cap * 16),
  acc: 0,
  rate,
  count: 0
});

const cyanPool = makePool(SPIRAL_CAP, 36);
const violetPool = makePool(SPIRAL_CAP, 36);
const motePool = makePool(MOTE_CAP, 13);

const spawnSpiral = (p: Pool, i: number): void => {
  p.alive[i] = 1;
  p.age[i] = 0;
  p.life[i] = range(3.8, 6.2);
  p.a[i] = range(2.6, 4.4); // start radius
  p.b[i] = rand() * Math.PI * 2; // start angle
  p.c[i] = range(1.1, 2.0); // angular speed (rad/s)
  p.d[i] = (rand() < 0.5 ? -1 : 1) * range(0.8, 2.8); // z offset at start (front or back)
  p.size[i] = range(0.07, 0.15);
};
const spawnMote = (p: Pool, i: number): void => {
  p.alive[i] = 1;
  p.age[i] = 0;
  p.life[i] = range(4.5, 7.5);
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * 3.2;
  p.a[i] = Math.cos(a) * r; // x0
  p.b[i] = Math.sin(a) * r; // z0
  p.c[i] = range(0.45, 1.0); // rise speed
  p.d[i] = rand() * 6.28; // sway phase
  p.e[i] = range(0.1, 0.35); // sway amplitude
  p.size[i] = range(0.04, 0.09);
};

const writeMatrix = (m: Float32Array, n: number, x: number, y: number, z: number, s: number): void => {
  const o = n * 16;
  m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
};

const stepSpiral = (p: Pool, dt: number): void => {
  p.acc += p.rate * dt;
  for (let i = 0; i < p.cap && p.acc >= 1; i += 1) {
    if (!p.alive[i]) {
      spawnSpiral(p, i);
      p.acc -= 1;
    }
  }
  if (p.acc > 4) p.acc = 4;
  let n = 0;
  for (let i = 0; i < p.cap; i += 1) {
    if (!p.alive[i]) continue;
    p.age[i] += dt;
    const u = p.age[i] / p.life[i];
    if (u >= 1) {
      p.alive[i] = 0;
      continue;
    }
    const r0 = p.a[i];
    const r = r0 * Math.pow(1 - u, 1.35) + 0.04;
    const theta = p.b[i] + p.c[i] * p.age[i] + 3.2 * u * u * (p.c[i] > 0 ? 1 : -1);
    const x = Math.cos(theta) * r;
    const y = RING_CY + Math.sin(theta) * r;
    const z = p.d[i] * (r / r0) * (r / r0 + 0.15) / 1.15;
    const env = smooth(0, 0.1, u) * (1 - smooth(0.82, 1, u));
    writeMatrix(p.matrices, n, x, y, z, p.size[i] * (0.15 + 0.85 * env) * (1 + 0.5 * (1 - r / r0)));
    n += 1;
  }
  p.count = n;
};

const stepMotes = (p: Pool, dt: number): void => {
  p.acc += p.rate * dt;
  for (let i = 0; i < p.cap && p.acc >= 1; i += 1) {
    if (!p.alive[i]) {
      spawnMote(p, i);
      p.acc -= 1;
    }
  }
  if (p.acc > 4) p.acc = 4;
  let n = 0;
  for (let i = 0; i < p.cap; i += 1) {
    if (!p.alive[i]) continue;
    p.age[i] += dt;
    const u = p.age[i] / p.life[i];
    if (u >= 1) {
      p.alive[i] = 0;
      continue;
    }
    const age = p.age[i];
    const x = p.a[i] + Math.sin(age * 0.9 + p.d[i]) * p.e[i] + age * 0.05;
    const y = PLATFORM_TOP + 0.05 + age * p.c[i];
    const z = p.b[i] + Math.cos(age * 0.7 + p.d[i]) * p.e[i];
    const env = smooth(0, 0.12, u) * (1 - smooth(0.55, 1, u));
    writeMatrix(p.matrices, n, x, y, z, p.size[i] * env + 0.002);
    n += 1;
  }
  p.count = n;
};

// Pre-warm so the first frame already shows a populated scene.
for (let k = 0; k < 200; k += 1) {
  stepSpiral(cyanPool, 1 / 30);
  stepSpiral(violetPool, 1 / 30);
  stepMotes(motePool, 1 / 30);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
window.__TASK_STATE__ = { portalActive: true, particleCount: 0, time: 0 };

const app = createAuraApp("#app", { scene: stage });

const startMs = performance.now();
let lastMs = startMs;

app.onFrame(() => {
  const nowMs = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastMs) / 1000));
  lastMs = nowMs;
  const t = (nowMs - startMs) / 1000;

  // particles
  stepSpiral(cyanPool, dt);
  stepSpiral(violetPool, dt);
  stepMotes(motePool, dt);
  if (cyanPool.count > 0) app.nodes.require("spiral-cyan").setInstanceMatrices(cyanPool.matrices, cyanPool.count);
  if (violetPool.count > 0) app.nodes.require("spiral-violet").setInstanceMatrices(violetPool.matrices, violetPool.count);
  if (motePool.count > 0) app.nodes.require("motes").setInstanceMatrices(motePool.matrices, motePool.count);

  // vortex + pulsing coloured light on the stones
  app.nodes.require("vortex").setUniform?.("portalClock", t);
  const pulse = 0.78 + 0.22 * Math.sin(t * 1.1);
  const pulse2 = 0.78 + 0.22 * Math.sin(t * 1.1 + 2.1);
  app.nodes.require("light-front").setLight?.({ intensity: 70 * pulse });
  app.nodes.require("light-back").setLight?.({ intensity: 70 * pulse2 });
  app.nodes.require("light-floor").setLight?.({ intensity: 36 * (0.8 + 0.2 * Math.sin(t * 1.1 + 1)) });

  // gentle camera sway
  const az = 0.5 * Math.sin(t * 0.14);
  const dist = 11.5 + 0.8 * Math.sin(t * 0.09);
  app.camera?.setPose({
    position: [Math.sin(az) * dist, 3.0 + 0.45 * Math.sin(t * 0.21), Math.cos(az) * dist],
    target: [0, 3.0, 0]
  });

  window.__TASK_STATE__ = {
    portalActive: true,
    particleCount: cyanPool.count + violetPool.count + motePool.count,
    time: t
  };
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
}));
