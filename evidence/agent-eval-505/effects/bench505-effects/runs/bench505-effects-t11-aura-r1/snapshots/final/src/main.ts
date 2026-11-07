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

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const PORTAL_Y = 3.1; // height of the portal centre
const RING_R = 2.3; // centre radius of the ring blocks
const PLATFORM_TOP = 0.6;

// Palette: cyan + violet energy against dusk indigo stone.
const CYAN = "#38e8ff";
const VIOLET = "#9a4dff";

// ---------------------------------------------------------------------------------------------
// Portal ring (stone blocks, rune strokes, glowing inner rim)
// ---------------------------------------------------------------------------------------------
const BLOCKS = 22;
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const runesCyan: AuraTransformSpec[] = [];
const runesViolet: AuraTransformSpec[] = [];

for (let i = 0; i < BLOCKS; i += 1) {
  const a = (i / BLOCKS) * Math.PI * 2;
  const len = ((Math.PI * 2 * RING_R) / BLOCKS) * range(1.0, 1.05);
  const thick = range(0.54, 0.64);
  const depth = range(0.46, 0.58);
  const rr = RING_R + range(-0.02, 0.04);
  const cx = Math.cos(a) * rr;
  const cy = PORTAL_Y + Math.sin(a) * rr;
  ringBlocks.push({ position: [cx, cy, 0], rotation: [0, 0, a - Math.PI / 2], scale: [len, thick, depth] });
  ringColors.push(`hsl(${255 + Math.floor(range(-12, 18))}, ${Math.floor(range(6, 14))}%, ${Math.floor(range(24, 36))}%)`);

  // Rune strokes on the front and back faces.
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const tx = Math.sin(a);
  const ty = -Math.cos(a);
  const target = i % 2 === 0 ? runesCyan : runesViolet;
  for (const side of [1, -1]) {
    const z = side * (depth / 2 + 0.012);
    const stroke = (dr: number, dt: number, sx: number, sy: number, extraRot: number): void => {
      target.push({
        position: [cx + nx * dr + tx * dt, cy + ny * dr + ty * dt, z],
        rotation: [0, 0, a - Math.PI / 2 + extraRot],
        scale: [sx, sy, 0.03]
      });
    };
    stroke(0, 0, 0.05, 0.3, 0);
    stroke(0.07, 0, 0.2, 0.05, 0);
    stroke(-0.06, 0.07, 0.05, 0.16, 0.6);
  }
}

// Bright rim lining the aperture: this is what the bloom grabs.
const RIM_SEGMENTS = 56;
const rimSegments: AuraTransformSpec[] = [];
for (let i = 0; i < RIM_SEGMENTS; i += 1) {
  const a = (i / RIM_SEGMENTS) * Math.PI * 2;
  const rr = 2.02;
  rimSegments.push({
    position: [Math.cos(a) * rr, PORTAL_Y + Math.sin(a) * rr, 0],
    rotation: [0, 0, a - Math.PI / 2],
    scale: [((Math.PI * 2 * rr) / RIM_SEGMENTS) * 1.08, 0.06, 0.5]
  });
}

// ---------------------------------------------------------------------------------------------
// Platform runes
// ---------------------------------------------------------------------------------------------
const floorRunes: AuraTransformSpec[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = (i / 28) * Math.PI * 2;
  floorRunes.push({
    position: [Math.cos(a) * 2.95, PLATFORM_TOP + 0.006, Math.sin(a) * 2.95],
    rotation: [0, -a - Math.PI / 2, 0],
    scale: [i % 2 === 0 ? 0.3 : 0.14, 0.02, 0.06]
  });
}
const floorLine: AuraTransformSpec[] = [];
for (let i = 0; i < 72; i += 1) {
  const a = (i / 72) * Math.PI * 2;
  floorLine.push({
    position: [Math.cos(a) * 3.2, PLATFORM_TOP + 0.005, Math.sin(a) * 3.2],
    rotation: [0, -a - Math.PI / 2, 0],
    scale: [0.3, 0.014, 0.035]
  });
}

// ---------------------------------------------------------------------------------------------
// Ruined pillars, fallen columns, rubble
// ---------------------------------------------------------------------------------------------
interface PillarSpec { x: number; z: number; h: number; lean: number; cap: boolean }
const pillarSpecs: PillarSpec[] = [
  { x: -5.6, z: -1.0, h: 4.6, lean: 0.0, cap: true },
  { x: 5.4, z: -2.4, h: 3.3, lean: 0.03, cap: false },
  { x: -3.7, z: -5.3, h: 5.6, lean: -0.02, cap: true },
  { x: 3.3, z: -5.9, h: 2.2, lean: 0.05, cap: false },
  { x: -7.0, z: 2.8, h: 1.5, lean: 0.0, cap: false },
  { x: 7.0, z: 2.3, h: 2.8, lean: -0.03, cap: false },
  { x: 0.4, z: -8.2, h: 4.2, lean: 0.0, cap: true },
  { x: 7.6, z: -5.6, h: 1.8, lean: 0.04, cap: false },
  { x: -8.6, z: -4.6, h: 3.4, lean: 0.02, cap: false }
];
const pillarShafts: AuraTransformSpec[] = [];
const pillarColors: string[] = [];
const pillarBlocks: AuraTransformSpec[] = [];
const pillarBlockColors: string[] = [];
for (const p of pillarSpecs) {
  const base = 0.38;
  pillarBlocks.push({ position: [p.x, base / 2, p.z], rotation: [0, range(-0.3, 0.3), 0], scale: [1.4, base, 1.4] });
  pillarBlockColors.push(`hsl(262, 8%, ${Math.floor(range(22, 30))}%)`);
  pillarShafts.push({ position: [p.x, base + p.h / 2, p.z], rotation: [0, 0, p.lean], scale: [0.92, p.h, 0.92] });
  pillarColors.push(`hsl(${258 + Math.floor(range(-8, 12))}, ${Math.floor(range(7, 13))}%, ${Math.floor(range(28, 38))}%)`);
  if (p.cap) {
    pillarBlocks.push({ position: [p.x + Math.sin(p.lean) * p.h, base + p.h + 0.16, p.z], rotation: [0, range(-0.2, 0.2), p.lean], scale: [1.3, 0.32, 1.3] });
    pillarBlockColors.push(`hsl(262, 8%, ${Math.floor(range(26, 34))}%)`);
  } else {
    // Broken chunk lying at the foot of a snapped column.
    pillarBlocks.push({
      position: [p.x + range(0.9, 1.3), 0.25, p.z + range(-0.8, 0.8)],
      rotation: [range(-0.4, 0.4), range(0, 3), range(-0.5, 0.5)],
      scale: [range(0.6, 0.9), range(0.4, 0.6), range(0.5, 0.8)]
    });
    pillarBlockColors.push(`hsl(260, 8%, ${Math.floor(range(24, 32))}%)`);
  }
}
// Fallen columns (foreground, to give the orbit some depth).
const fallen: AuraTransformSpec[] = [
  { position: [-3.4, 0.42, 5.8], rotation: [0, 0.35, Math.PI / 2], scale: [0.84, 3.2, 0.84] },
  { position: [4.6, 0.38, 5.2], rotation: [0, -0.55, Math.PI / 2], scale: [0.76, 1.8, 0.76] },
  { position: [-1.0, 0.36, -7.0], rotation: [0, 1.2, Math.PI / 2], scale: [0.72, 2.2, 0.72] }
];
const fallenColors = ["hsl(262, 9%, 30%)", "hsl(258, 8%, 27%)", "hsl(266, 8%, 31%)"];

const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 46; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = range(4.9, 12);
  const s = range(0.18, 0.6);
  rubble.push({
    position: [Math.cos(a) * r, s * 0.35, Math.sin(a) * r],
    rotation: [range(-0.5, 0.5), range(0, 6.28), range(-0.5, 0.5)],
    scale: [s * range(0.8, 1.6), s * range(0.6, 1.0), s * range(0.8, 1.4)]
  });
  rubbleColors.push(`hsl(${255 + Math.floor(range(-6, 14))}, ${Math.floor(range(6, 12))}%, ${Math.floor(range(20, 32))}%)`);
}

// ---------------------------------------------------------------------------------------------
// Custom geometry and shaders
// ---------------------------------------------------------------------------------------------
const DISC_R = 2.03;

function discGeometry(radius: number, sectors: number, rings: number) {
  const vertexCount = 1 + sectors * rings;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) normals[v * 3 + 2] = 1;
  const indices: number[] = [];
  const at = (k: number, j: number): number => 1 + (k - 1) * sectors + (j % sectors);
  for (let k = 1; k <= rings; k += 1) {
    for (let j = 0; j < sectors; j += 1) {
      const a = (j / sectors) * Math.PI * 2;
      const r = (k / rings) * radius;
      const o = at(k, j) * 3;
      positions[o] = Math.cos(a) * r;
      positions[o + 1] = Math.sin(a) * r;
    }
  }
  for (let j = 0; j < sectors; j += 1) indices.push(0, at(1, j), at(1, j + 1));
  for (let k = 1; k < rings; k += 1) {
    for (let j = 0; j < sectors; j += 1) {
      const a = at(k, j);
      const b = at(k, j + 1);
      const c = at(k + 1, j);
      const d = at(k + 1, j + 1);
      indices.push(a, c, b, b, c, d);
    }
  }
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-radius, -radius, -0.01], max: [radius, radius, 0.01] }
  });
}

const portalMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vPos = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    s += amp * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amp *= 0.5;
  }
  return s;
}

void main() {
  vec2 p = vPos.xy / ${DISC_R.toFixed(3)};
  float r = clamp(length(p), 0.0, 1.0);
  float a = atan(p.y, p.x + 0.00001);
  float t = portalClock;

  float ang = a + t * 0.55 + 3.6 * (1.0 - r);
  float arms = 0.5 + 0.5 * sin(3.0 * ang + 6.0 * log(r + 0.08) - t * 1.2);
  vec2 q = r * vec2(cos(ang), sin(ang));
  float n1 = fbm(q * 3.2 + vec2(t * 0.12, -t * 0.09));
  float n2 = fbm(q * 6.5 - vec2(t * 0.2, t * 0.15));
  float energy = arms * 0.6 + n1 * 0.75 + n2 * 0.25;
  float bands = smoothstep(0.35, 1.05, energy);

  vec3 cyan = vec3(0.10, 0.85, 1.0);
  vec3 violet = vec3(0.58, 0.20, 1.0);
  float h = 0.5 + 0.5 * sin(ang * 2.0 + n1 * 4.0 - t * 0.6);
  vec3 col = mix(violet, cyan, h) * (0.16 + 1.55 * bands);

  float fil = pow(max(0.0, sin(ang * 7.0 + log(r + 0.05) * 9.0 - t * 2.0)), 12.0) * (1.0 - r * 0.6);
  col += vec3(0.7, 0.95, 1.0) * fil * 0.85;

  float core = exp(-r * r * 22.0);
  col += vec3(0.92, 0.98, 1.0) * core * 2.8;
  col += mix(cyan, vec3(1.0), 0.5) * exp(-r * 4.5) * 0.75;

  float rim = smoothstep(0.82, 1.0, r);
  col += vec3(0.3, 0.8, 1.0) * rim * 0.9;

  col *= portalPulse;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {
    portalClock: { type: "f32", value: 0 },
    portalPulse: { type: "f32", value: 1 }
  },
  side: "double",
  fog: false
});

const haloMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vN;
out vec3 vW;
void main() {
  vN = mat3(modelMatrix) * normal;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vN;
in vec3 vW;
out vec4 outColor;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = clamp(dot(normalize(vN), V), 0.0, 1.0);
  float glow = pow(f, 2.6);
  vec3 col = mix(vec3(0.45, 0.2, 1.0), vec3(0.15, 0.85, 1.0), 0.35 + 0.65 * f);
  float k = glow * 0.5 * haloPulse;
  outColor = vec4(col * k, 1.0);
}`
  },
  uniforms: {
    haloPulse: { type: "f32", value: 1 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "front",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------------------------------------------------------------------------------------------
// Particle pools (CPU simulated, drawn as instanced emissive spheres)
// ---------------------------------------------------------------------------------------------
type Pool = "cyan" | "violet" | "motes";

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  size: number;
  // spiral
  r0: number;
  th0: number;
  omega: number;
  z0: number;
  // mote
  x0: number;
  z1: number;
  vy: number;
  phase: number;
}

const POOL_CAP: Record<Pool, number> = { cyan: 72, violet: 72, motes: 64 };
const POOL_RATE: Record<Pool, number> = { cyan: 15, violet: 15, motes: 10 };

function makePool(cap: number): Particle[] {
  return Array.from({ length: cap }, () => ({
    alive: false, age: 0, life: 1, size: 0.05, r0: 3, th0: 0, omega: 1, z0: 0, x0: 0, z1: 0, vy: 0.5, phase: 0
  }));
}

const pools: Record<Pool, Particle[]> = {
  cyan: makePool(POOL_CAP.cyan),
  violet: makePool(POOL_CAP.violet),
  motes: makePool(POOL_CAP.motes)
};
const spawnAcc: Record<Pool, number> = { cyan: 0, violet: 0, motes: 0 };

function spawn(kind: Pool, p: Particle): void {
  p.alive = true;
  p.age = 0;
  p.phase = rand() * 6.283;
  if (kind === "motes") {
    const r = 3.3 * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    p.x0 = Math.cos(a) * r;
    p.z1 = Math.sin(a) * r;
    p.vy = range(0.35, 0.8);
    p.life = range(4.5, 7.5);
    p.size = range(0.035, 0.08);
  } else {
    p.r0 = range(2.5, 4.3);
    p.th0 = rand() * Math.PI * 2;
    p.omega = range(0.9, 1.6) * (kind === "cyan" ? 1 : 0.85);
    p.z0 = (rand() < 0.5 ? -1 : 1) * range(0.6, 1.8);
    p.life = range(3.0, 5.2);
    p.size = range(0.045, 0.1);
  }
}

const HIDDEN: AuraTransformSpec = { position: [0, -40, 0], scale: [0.0001, 0.0001, 0.0001] };

/** Advances one particle and returns its transform (hidden transform when dead). */
function stepParticle(kind: Pool, p: Particle, dt: number, time: number): AuraTransformSpec {
  if (!p.alive) return HIDDEN;
  p.age += dt;
  if (p.age >= p.life) {
    p.alive = false;
    return HIDDEN;
  }
  const u = p.age / p.life;
  let x: number;
  let y: number;
  let z: number;
  let s: number;
  if (kind === "motes") {
    x = p.x0 + Math.sin(p.age * 0.9 + p.phase) * 0.28;
    z = p.z1 + Math.cos(p.age * 0.7 + p.phase) * 0.28;
    y = PLATFORM_TOP + 0.05 + p.age * p.vy;
    s = p.size * smoothstep(0, 0.15, u) * (1 - smoothstep(0.55, 1, u));
  } else {
    const k = Math.pow(1 - u, 1.4);
    const r = 0.15 + (p.r0 - 0.15) * k;
    const th = p.th0 + p.omega * p.age * (1 + 1.5 * u);
    x = Math.cos(th) * r;
    y = PORTAL_Y + Math.sin(th) * r * 0.92;
    z = p.z0 * Math.pow(1 - u, 0.8);
    const twinkle = 0.85 + 0.15 * Math.sin(time * 9 + p.phase * 3);
    s = p.size * smoothstep(0, 0.12, u) * (1 - smoothstep(0.88, 1, u) * 0.85) * twinkle * smoothstep(0.55, 1.0, y);
  }
  s = Math.max(s, 0.0001);
  return { position: [x, y, z], scale: [s, s, s] };
}

function initialTransforms(cap: number): AuraTransformSpec[] {
  // Spread over the region the particles travel through so any bounds derived from them cover it.
  return Array.from({ length: cap }, (_, i) => ({
    position: [((i * 7) % 11) - 5, 0.6 + ((i * 5) % 9) * 0.7, ((i * 3) % 9) - 4] as [number, number, number],
    scale: [0.0001, 0.0001, 0.0001] as [number, number, number]
  }));
}

const sphereParams = { widthSegments: 8, heightSegments: 6 };

// ---------------------------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------------------------
const stone = (roughness = 0.95) => material.pbr({ color: "#ffffff", roughness, metallic: 0 });

let stage = scene({ background: "#0a0816" })
  .add(sky.gradient({ zenith: "#080a22", horizon: "#6b3a78", ground: "#0e0b18", exponent: 0.7, horizonGlow: 0.6, captureEnvironment: false }))
  .add(environments.neutral({ intensity: 0.28, background: false }))
  .add(lights.hemisphere({ name: "dusk-hemi", skyColor: "#3b3474", groundColor: "#150f22", intensity: 0.6 }))
  .add(lights.directional({ name: "dusk-rim", position: [-9, 7, -11], target: [0, 1.5, 0], intensity: 1.1, color: "#c27ad8", shadow: true }))
  .add(lights.directional({ name: "dusk-fill", position: [8, 5, 9], target: [0, 1.5, 0], intensity: 0.45, color: "#4a63c8" }))
  .add(lights.point({ name: "portal-front", position: [0, PORTAL_Y + 0.1, 2.6], intensity: 40, color: "#35e0ff", distance: 16, decay: 2, shadow: false }).runtime({ id: "light-front", mutable: true }))
  .add(lights.point({ name: "portal-back", position: [0, PORTAL_Y + 0.1, -2.6], intensity: 34, color: "#9b55ff", distance: 16, decay: 2, shadow: false }).runtime({ id: "light-back", mutable: true }))
  .add(lights.point({ name: "portal-floor", position: [0, 1.1, 1.8], intensity: 14, color: "#6a8cff", distance: 9, decay: 2, shadow: false }).runtime({ id: "light-floor", mutable: true }))
  // Ground and platform
  .add(primitives.plane({ name: "ground", size: [90, 1, 90], material: material.pbr({ color: "#1d1829", roughness: 1 }) }))
  .add(primitives.cylinder({ name: "platform-base", size: [9.2, 0.3, 9.2], params: { radialSegments: 20 }, material: material.pbr({ color: "#3a3646", roughness: 0.95 }) }).position(0, 0.15, 0))
  .add(primitives.cylinder({ name: "platform-mid", size: [7.8, 0.2, 7.8], params: { radialSegments: 20 }, material: material.pbr({ color: "#454152", roughness: 0.92 }) }).position(0, 0.4, 0))
  .add(primitives.cylinder({ name: "platform-top", size: [6.6, 0.1, 6.6], params: { radialSegments: 20 }, material: material.pbr({ color: "#4f4a5e", roughness: 0.88 }) }).position(0, 0.55, 0))
  .add(instances.box({ name: "floor-runes", transforms: floorRunes, material: material.emissive({ color: "#2a1a55", emissive: VIOLET, emissiveIntensity: 2.4 }), castShadow: false, receiveShadow: false }))
  .add(instances.box({ name: "floor-line", transforms: floorLine, material: material.emissive({ color: "#10304a", emissive: CYAN, emissiveIntensity: 1.8 }), castShadow: false, receiveShadow: false }))
  // Portal ring
  .add(primitives.box({ name: "plinth", size: [3.3, 0.45, 1.15], material: material.pbr({ color: "#3d394a", roughness: 0.95 }) }).position(0, PLATFORM_TOP + 0.225, 0))
  .add(instances.box({ name: "ring-blocks", transforms: ringBlocks, colors: ringColors, material: stone(0.92) }))
  .add(instances.box({ name: "ring-runes-cyan", transforms: runesCyan, material: material.emissive({ color: "#0b2f3c", emissive: CYAN, emissiveIntensity: 3 }), castShadow: false, receiveShadow: false }))
  .add(instances.box({ name: "ring-runes-violet", transforms: runesViolet, material: material.emissive({ color: "#241040", emissive: VIOLET, emissiveIntensity: 3 }), castShadow: false, receiveShadow: false }))
  .add(instances.box({ name: "ring-rim", transforms: rimSegments, material: material.emissive({ color: "#bff4ff", emissive: "#7fe9ff", emissiveIntensity: 3.6 }), castShadow: false, receiveShadow: false }))
  // The energy disc and its glow
  .add(geometry.custom(discGeometry(DISC_R, 96, 28), { name: "portal-disc", material: portalMaterial, castShadow: false, receiveShadow: false }).position(0, PORTAL_Y, 0).runtime({ id: "portal-disc", mutable: true }))
  .add(primitives.sphere({ name: "portal-halo", size: 9.4, material: haloMaterial, castShadow: false, receiveShadow: false }).position(0, PORTAL_Y, 0).runtime({ id: "portal-halo", mutable: true }))
  // Ruins
  .add(instances.cylinder({ name: "pillar-shafts", transforms: pillarShafts, colors: pillarColors, material: stone(0.93), params: { radialSegments: 10 } }))
  .add(instances.box({ name: "pillar-blocks", transforms: pillarBlocks, colors: pillarBlockColors, material: stone(0.95) }))
  .add(instances.cylinder({ name: "fallen-columns", transforms: fallen, colors: fallenColors, material: stone(0.93), params: { radialSegments: 10 } }))
  .add(instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stone(1) }))
  // Particles
  .add(instances.sphere({ name: "spiral-cyan", transforms: initialTransforms(POOL_CAP.cyan), params: sphereParams, castShadow: false, receiveShadow: false, material: material.emissive({ color: "#c8fbff", emissive: CYAN, emissiveIntensity: 4 }) }).runtime({ id: "pool-cyan", mutable: true }))
  .add(instances.sphere({ name: "spiral-violet", transforms: initialTransforms(POOL_CAP.violet), params: sphereParams, castShadow: false, receiveShadow: false, material: material.emissive({ color: "#e4d0ff", emissive: "#a860ff", emissiveIntensity: 4 }) }).runtime({ id: "pool-violet", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: initialTransforms(POOL_CAP.motes), params: sphereParams, castShadow: false, receiveShadow: false, material: material.emissive({ color: "#f1e8ff", emissive: "#b9a0ff", emissiveIntensity: 3.4 }) }).runtime({ id: "pool-motes", mutable: true }))
  // Atmosphere and post
  .add(effects.fog({ color: "#241a3c", density: 0.032 }))
  .add(effects.bloom({ intensity: 1.35, threshold: 0.55, radius: 0.85 }))
  .add(effects.colorGrade({ contrast: 1.12, saturation: 1.1 }))
  .add(effects.vignette())
  .camera(camera.orbit({ position: [0, 3.0, 10.8], target: [0, 2.6, 0], fov: 42, near: 0.2, far: 140, autoRotate: 0.07 }));

const app = createAuraApp("#app", { scene: stage });

// ---------------------------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------------------------
const poolKinds: Pool[] = ["cyan", "violet", "motes"];
const poolIds: Record<Pool, string> = { cyan: "pool-cyan", violet: "pool-violet", motes: "pool-motes" };

function simulate(dt: number, time: number): Record<Pool, AuraTransformSpec[]> {
  const out = { cyan: [], violet: [], motes: [] } as Record<Pool, AuraTransformSpec[]>;
  for (const kind of poolKinds) {
    const pool = pools[kind];
    spawnAcc[kind] += POOL_RATE[kind] * dt;
    while (spawnAcc[kind] >= 1) {
      spawnAcc[kind] -= 1;
      const free = pool.find((p) => !p.alive);
      if (free) spawn(kind, free);
    }
    out[kind] = pool.map((p) => stepParticle(kind, p, dt, time));
  }
  return out;
}

function liveCount(): number {
  let n = 0;
  for (const kind of poolKinds) for (const p of pools[kind]) if (p.alive) n += 1;
  return n;
}

// Pre-warm so the first frame already shows a populated swirl.
for (let i = 0; i < 120; i += 1) simulate(1 / 20, i / 20);

const state = { portalActive: true, particleCount: liveCount(), time: 0 };
window.__TASK_STATE__ = state;

const startMs = performance.now();
let lastMs = startMs;

app.onFrame(() => {
  const nowMs = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastMs) / 1000));
  lastMs = nowMs;
  const t = (nowMs - startMs) / 1000;

  // Slow pulse (about 6 s period) with a faint faster flutter.
  const pulse = 1 + 0.22 * Math.sin(t * 1.05) + 0.06 * Math.sin(t * 2.7 + 1.3);

  const disc = app.nodes.require("portal-disc");
  disc.setUniform?.("portalClock", t);
  disc.setUniform?.("portalPulse", 0.92 + 0.2 * (pulse - 1) / 0.28 * 0.5 + 0.08);
  app.nodes.require("portal-halo").setUniform?.("haloPulse", pulse);

  app.nodes.require("light-front").setLight?.({ intensity: 40 * pulse });
  app.nodes.require("light-back").setLight?.({ intensity: 34 * (2 - pulse) * 0.5 + 34 * 0.5 * pulse });
  app.nodes.require("light-floor").setLight?.({ intensity: 14 * pulse });

  const transforms = simulate(dt, t);
  for (const kind of poolKinds) app.nodes.require(poolIds[kind]).setInstances(transforms[kind]);

  state.particleCount = liveCount();
  state.time = t;
  window.__TASK_STATE__ = state;
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
