import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { bursts: number; activeParticles: number };
  }
}

// ---------- deterministic random ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- palette ----------
interface Tint { css: string; rgb: [number, number, number] }
const PALETTE: Tint[] = [
  { css: "#ffb82e", rgb: [1.0, 0.72, 0.18] }, // gold
  { css: "#ff2a1f", rgb: [1.0, 0.12, 0.1] }, // red
  { css: "#3369ff", rgb: [0.2, 0.42, 1.0] }, // blue
  { css: "#26ff66", rgb: [0.15, 1.0, 0.4] }, // green
  { css: "#cc40ff", rgb: [0.8, 0.25, 1.0] }, // violet
  { css: "#ffd999", rgb: [1.0, 0.85, 0.6] } // warm white: rockets and their trails
];
const WARM = 5;
const lin = (c: number): number => Math.pow(c, 2.2);

// ---------- scene ----------
const SIL = material.pbr({ color: "#1a1f2b", roughness: 0.9, metallic: 0 });
const ROOF = material.pbr({ color: "#141822", roughness: 0.9, metallic: 0 });

let sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: [0, 6, 70], target: [0, 20, -20], fov: 50, near: 0.5, far: 800 }))
  .add(sky.gradient({ zenith: "#01020a", horizon: "#0a1630" }))
  .add(environments.neutral({ intensity: 0.1, background: false }))
  .add(lights.hemisphere({ skyColor: "#0b1533", groundColor: "#020308", intensity: 0.7 }))
  .add(effects.bloom({ intensity: 1.1, threshold: 0.75, radius: 0.6 }));

// Stars on a dome around the camera.
{
  const stars: AuraTransformSpec[] = [];
  for (let i = 0; i < 420; i += 1) {
    const az = range(-1.1, 1.1), el = range(0.1, 1.15), r = 330;
    const s = range(0.8, 2.1);
    stars.push({
      position: [Math.sin(az) * Math.cos(el) * r, 6 + Math.sin(el) * r, 70 - Math.cos(az) * Math.cos(el) * r],
      scale: [s, s, s]
    });
  }
  sc = sc.add(instances.sphere({
    name: "stars",
    transforms: stars,
    material: material.emissive({ color: "#cfe0ff", emissive: "#cfe0ff", emissiveIntensity: 2.2 }),
    params: { widthSegments: 4, heightSegments: 3 },
    castShadow: false
  }));
}

// Water with burst reflections.
const NSLOT = 4;
const slotUniforms: Record<string, { type: "vec4"; value: number[] }> = {};
for (let i = 0; i < NSLOT; i += 1) {
  slotUniforms[`bp${i}`] = { type: "vec4", value: [0, 0, 0, 0] };
  slotUniforms[`bc${i}`] = { type: "vec4", value: [0, 0, 0, 1] };
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 burstLight(vec4 bp, vec4 bc, vec3 P, vec3 n, vec3 v) {
  if (bp.w < 0.002) return vec3(0.0);
  vec3 L = bp.xyz - P; float dist = length(L); vec3 d = L / dist;
  vec3 r = reflect(-v, n);
  float c = max(dot(r, d), 0.0);
  float s = pow(c, 900.0) * 2.0 + pow(c, 120.0) * 0.9 + pow(c, 14.0) * 0.1;
  float att = 1.0 / (1.0 + dist * dist * 0.00012);
  vec2 h = bp.xz - P.xz;
  float wash = exp(-dot(h, h) / 3600.0) * 0.03;
  return bc.rgb * bp.w * (s * att + wash);
}
void main() {
  vec3 P = vW;
  vec3 v = normalize(cameraPosition - P);
  vec2 q = P.xz;
  float nx = (vnoise(q * vec2(0.8, 0.5) + vec2(clk * 0.25, 0.0)) - 0.5) * 0.10 + (vnoise(q * 2.3 - vec2(0.0, clk * 0.4)) - 0.5) * 0.06;
  float nz = (vnoise(q * vec2(0.6, 0.9) + vec2(0.0, clk * 0.3)) - 0.5) * 0.10 + (vnoise(q * 2.7 + vec2(clk * 0.5, 0.0)) - 0.5) * 0.06;
  vec3 n = normalize(vec3(nx, 1.0, nz));
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  vec3 col = vec3(0.003, 0.008, 0.016) + vec3(0.012, 0.024, 0.05) * fres;
  col += burstLight(bp0, bc0, P, n, v) + burstLight(bp1, bc1, P, n, v) + burstLight(bp2, bc2, P, n, v) + burstLight(bp3, bc3, P, n, v);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, ...slotUniforms }
});
sc = sc.add(primitives.plane({ name: "water", size: [1400, 1, 1400], material: water, castShadow: false }).runtime({ id: "water", mutable: true }));

// Shoreline, hills, buildings, pier, boats (all dark silhouettes).
sc = sc.add(primitives.box({ name: "land", size: [700, 2.5, 22], material: SIL, castShadow: false }).position(0, 1.25, -54));
{
  const hills: AuraTransformSpec[] = [];
  for (let i = 0; i < 9; i += 1) {
    const w = range(90, 160), h = range(10, 22);
    hills.push({ position: [-300 + i * 75 + range(-20, 20), 0, range(-110, -90)], scale: [w, h * 2, range(40, 60)] });
  }
  sc = sc.add(instances.sphere({ name: "hills", transforms: hills, material: SIL, castShadow: false }));

  const bodies: AuraTransformSpec[] = [], roofs: AuraTransformSpec[] = [], windows: AuraTransformSpec[] = [];
  for (let i = 0; i < 18; i += 1) {
    const x = -78 + i * 8.6 + range(-2, 2), z = range(-58, -48), s = range(3.4, 6.2), h = range(3, 6.5);
    if (Math.abs(x + 34) < 5) continue; // keep the pier root clear
    bodies.push({ position: [x, 2.5 + h / 2, z], scale: [s, h, s] });
    if (rand() < 0.75) roofs.push({ position: [x, 2.5 + h + s * 0.3, z], rotation: [0, Math.PI / 4, 0], scale: [s * 1.5, s * 0.6, s * 1.5] });
    if (rand() < 0.55) windows.push({ position: [x + range(-s / 4, s / 4), 2.5 + h * 0.55, z + s / 2 + 0.03], scale: [0.7, 0.8, 0.06] });
  }
  sc = sc.add(instances.box({ name: "houses", transforms: bodies, material: SIL, castShadow: false }))
    .add(instances.cone({ name: "roofs", transforms: roofs, material: ROOF, params: { radialSegments: 4 }, castShadow: false }))
    .add(instances.box({ name: "windows", transforms: windows, material: material.emissive({ color: "#ffcf7a", emissive: "#ffb64a", emissiveIntensity: 1.3 }), castShadow: false }));

  const posts: AuraTransformSpec[] = [];
  for (let k = 0; k < 8; k += 1) for (const sx of [-1.3, 1.3]) posts.push({ position: [-34 + sx, 0.6, -42 + k * 3.8], scale: [0.35, 2.4, 0.35] });
  sc = sc.add(primitives.box({ name: "pier", size: [3.4, 0.4, 30], material: SIL, castShadow: false }).position(-34, 1.5, -29))
    .add(instances.cylinder({ name: "pier-posts", transforms: posts, material: SIL, params: { radialSegments: 5 }, castShadow: false }))
    .add(primitives.cylinder({ name: "lamp-post", size: [0.15, 3, 0.15], material: SIL, castShadow: false }).position(-34, 3.2, -15.5))
    .add(primitives.sphere({ name: "lamp", size: 0.55, material: material.emissive({ color: "#ffd9a0", emissive: "#ffb45c", emissiveIntensity: 3 }), castShadow: false }).position(-34, 4.9, -15.5));
}

let boatId = 0;
const addBoat = (x: number, z: number, s: number, yaw: number): void => {
  const id = boatId++;
  const c = Math.cos(yaw), si = Math.sin(yaw);
  const at = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * c + lz * si, ly, z - lx * si + lz * c];
  sc = sc.add(primitives.capsule({ name: `hull${id}`, size: [1.9 * s, 6 * s, 1.1 * s], material: SIL, castShadow: false }).rotate(Math.PI / 2, yaw, 0).position(...at(0, 0.25 * s, 0)))
    .add(primitives.box({ name: `cabin${id}`, size: [1.3 * s, 0.9 * s, 1.9 * s], material: SIL, castShadow: false }).rotate(0, yaw, 0).position(...at(0, 0.95 * s, -0.6 * s)))
    .add(primitives.cylinder({ name: `mast${id}`, size: [0.1 * s, 6.5 * s, 0.1 * s], material: SIL, castShadow: false }).position(...at(0, 3.4 * s, 0.9 * s)));
};
addBoat(-16, 12, 1.6, 0.35);
addBoat(23, 22, 1.7, -0.5);
addBoat(11, -24, 1.0, 0.2);
addBoat(-6, -34, 0.9, -0.3);
addBoat(34, -33, 1.1, 0.5);

// ---------- particle pools (instanced emissive spheres, one node per colour) ----------
const CAP = 1500;
const corners: Array<[number, number, number]> = [];
for (const x of [-120, 120]) for (const y of [-5, 90]) for (const z of [-120, 30]) corners.push([x, y, z]);
PALETTE.forEach((tint, i) => {
  const placeholders: AuraTransformSpec[] = [];
  for (let k = 0; k < CAP; k += 1) placeholders.push({ position: corners[k % corners.length]!, scale: [0.01, 0.01, 0.01] });
  sc = sc.add(instances.sphere({
    name: `pool${i}`,
    transforms: placeholders,
    material: material.emissive({ color: tint.css, emissive: tint.css, emissiveIntensity: i === WARM ? 3.6 : 3.2 }),
    params: { widthSegments: 6, heightSegments: 4 },
    castShadow: false
  }).runtime({ id: `pool${i}`, mutable: true }));
});

// Burst light slots: glow halo (lights the sky), point light (lights the shore), water uniforms.
for (let i = 0; i < NSLOT; i += 1) {
  const glow = material.custom({
    glsl: {
      vertex: `out vec3 vN; out vec3 vW;
void main() {
  vN = mat3(modelMatrix) * normal;
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
      fragment: `in vec3 vN; in vec3 vW; out vec4 outColor;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float d = clamp(dot(normalize(vN), v), 0.0, 1.0);
  outColor = vec4(glowColor.rgb * glowColor.a * pow(d, 2.2), 1.0);
}`
    },
    uniforms: { glowColor: { type: "vec4", value: [0, 0, 0, 0] } },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    fog: false
  });
  sc = sc.add(primitives.sphere({ name: `glow${i}`, size: 55, material: glow, castShadow: false }).position(0, -200, 0).runtime({ id: `glow${i}`, mutable: true }))
    .add(lights.point({ name: `blight${i}`, position: [0, 30, -50], intensity: 0.001, color: "#ffffff", distance: 160, decay: 2, shadow: false }).runtime({ id: `blight${i}`, mutable: true }));
}

const app = createAuraApp("#app", { scene: sc });

// ---------- simulation ----------
interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size: number;
  kind: 0 | 1 | 2; // spark, trail dot, rocket
  drag: number; grav: number;
  trailEvery: number; trailT: number;
  phase: number;
  // rocket only
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; tint: number;
}
const pools: Particle[][] = PALETTE.map(() => []);
const mats = PALETTE.map(() => new Float32Array(CAP * 16));
for (const m of mats) for (let i = 0; i < CAP; i += 1) { m[i * 16 + 15] = 1; }
const scratch = new Float32Array(16);
scratch[0] = scratch[5] = scratch[10] = 0.001; scratch[15] = 1; scratch[13] = -200;

const mk = (x: number, y: number, z: number, kind: 0 | 1 | 2, life: number, size: number): Particle => ({
  x, y, z, vx: 0, vy: 0, vz: 0, age: 0, life, size, kind, drag: 0, grav: 0, trailEvery: 0, trailT: 0, phase: rand() * 6.28,
  x0: x, y0: y, z0: z, x1: x, y1: y, z1: z, tint: 0
});
const spawn = (pool: number, p: Particle): void => { const a = pools[pool]!; if (a.length < CAP) a.push(p); };

interface Slot { x: number; y: number; z: number; t: number; tint: number; on: boolean }
const slots: Slot[] = Array.from({ length: NSLOT }, () => ({ x: 0, y: 0, z: 0, t: 0, tint: 0, on: false }));
let slotCursor = 0;
let burstCount = 0;
const state = { bursts: 0, activeParticles: 0 };
window.__TASK_STATE__ = state;

let bag: number[] = [0, 1, 2];
let lastTint = -1;
const nextTint = (): number => {
  if (bag.length === 0) {
    bag = [0, 1, 2, 3, 4];
    for (let i = bag.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j]!, bag[i]!]; }
    if (bag[0] === lastTint) bag.push(bag.shift()!);
  }
  lastTint = bag.shift()!;
  return lastTint;
};

const shell = (cx: number, cy: number, cz: number, tint: number, radius: number, count: number, trailing: boolean, life: number): void => {
  const k = trailing ? 1.4 : 1.8;
  const v0 = (radius * k) / (1 - Math.exp(-k * life * 0.95));
  for (let i = 0; i < count; i += 1) {
    const zc = rand() * 2 - 1, ph = rand() * 6.2832, rr = Math.sqrt(1 - zc * zc);
    const sp = v0 * (0.9 + 0.1 * rand());
    const p = mk(cx, cy, cz, 0, life * range(0.8, 1.05), range(0.7, 1.0));
    p.vx = rr * Math.cos(ph) * sp; p.vy = zc * sp; p.vz = rr * Math.sin(ph) * sp;
    p.drag = k; p.grav = trailing ? 8 : 6;
    if (trailing && i % 3 === 0) { p.trailEvery = 0.05; p.trailT = rand() * 0.05; }
    spawn(tint, p);
  }
};

const explode = (x: number, y: number, z: number, tint: number): void => {
  const trailing = rand() < 0.5;
  const radius = range(16, 24);
  shell(x, y, z, tint, radius, 170, trailing, trailing ? 2.3 : 1.8);
  if (rand() < 0.35) shell(x, y, z, (tint + 1 + Math.floor(rand() * 4)) % 5, radius * 0.5, 55, false, 1.5);
  burstCount += 1;
  const s = slots[slotCursor]!;
  slotCursor = (slotCursor + 1) % NSLOT;
  s.x = x; s.y = y; s.z = z; s.t = 0; s.tint = tint; s.on = true;
};

const launch = (): void => {
  const x0 = range(-48, 48), z0 = -range(50, 58), y0 = 2.6;
  const r = mk(x0, y0, z0, 2, range(0.95, 1.25), 1.1);
  r.x1 = x0 + range(-6, 6); r.y1 = range(30, 50); r.z1 = z0 - range(0, 6);
  r.tint = nextTint();
  r.trailEvery = 0.016;
  spawn(WARM, r);
};

let nextLaunch = 0.4;
let clk = 0;

const burstEnvelope = (t: number): number => Math.exp(-t / 0.9) * (1 + 1.8 * Math.exp(-t / 0.15));

const update = (dt: number): void => {
  nextLaunch -= dt;
  if (nextLaunch <= 0) {
    launch();
    nextLaunch = rand() < 0.2 ? range(0.15, 0.4) : range(0.6, 2.2);
  }
  for (let pi = 0; pi < pools.length; pi += 1) {
    const arr = pools[pi]!;
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      const p = arr[i]!;
      p.age += dt;
      let dead = false;
      if (p.kind === 2) {
        const u = Math.min(p.age / p.life, 1);
        const e = 1 - (1 - u) * (1 - u);
        p.x = p.x0 + (p.x1 - p.x0) * u;
        p.y = p.y0 + (p.y1 - p.y0) * e;
        p.z = p.z0 + (p.z1 - p.z0) * u;
        p.size = 1.0;
        p.trailT -= dt;
        while (p.trailT <= 0) {
          p.trailT += p.trailEvery;
          const d = mk(p.x + range(-0.15, 0.15), p.y + range(-0.15, 0.15), p.z, 1, range(0.4, 0.6), 0.6);
          spawn(WARM, d);
        }
        if (u >= 1) { explode(p.x, p.y, p.z, p.tint); dead = true; }
      } else if (p.kind === 0) {
        if (p.age >= p.life) dead = true;
        else {
          const dr = Math.exp(-p.drag * dt);
          p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          if (p.trailEvery > 0) {
            p.trailT -= dt;
            while (p.trailT <= 0) {
              p.trailT += p.trailEvery;
              const f = 1 - p.age / p.life;
              spawn(pi, mk(p.x, p.y, p.z, 1, range(0.35, 0.55), 0.55 * Math.max(f, 0.3)));
            }
          }
        }
      } else {
        if (p.age >= p.life) dead = true;
        else p.y -= 1.2 * dt;
      }
      if (dead) { arr[i] = arr[arr.length - 1]!; arr.pop(); }
    }
  }
  for (const s of slots) { if (s.on) { s.t += dt; if (s.t > 3.2) s.on = false; } }
};

const particleSize = (p: Particle): number => {
  const f = Math.max(0, 1 - p.age / p.life);
  if (p.kind === 0) {
    const flick = f < 0.35 ? 0.65 + 0.35 * Math.sin(p.age * 45 + p.phase) : 1;
    return p.size * Math.pow(f, 0.55) * flick;
  }
  if (p.kind === 1) return p.size * Math.pow(f, 1.2);
  return p.size;
};

interface Handle {
  setInstanceMatrices(m: Float32Array, count: number, rgba?: Float32Array): unknown;
  setPosition(x: number, y: number, z: number): unknown;
  setUniform?(name: string, v: number | Float32Array | number[]): unknown;
  setLight?(patch: { intensity?: number; color?: string }): unknown;
}
let poolH: Handle[] | undefined;
let waterH: Handle | undefined;
let glowH: Handle[] = [];
let lightH: Handle[] = [];

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  if (!poolH) {
    poolH = PALETTE.map((_, i) => app.nodes.require(`pool${i}`) as unknown as Handle);
    waterH = app.nodes.require("water") as unknown as Handle;
    glowH = slots.map((_, i) => app.nodes.require(`glow${i}`) as unknown as Handle);
    lightH = slots.map((_, i) => app.nodes.require(`blight${i}`) as unknown as Handle);
  }
  clk += dt;
  update(dt);

  let active = 0;
  for (let pi = 0; pi < pools.length; pi += 1) {
    const arr = pools[pi]!, m = mats[pi]!;
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!, s = Math.max(particleSize(p), 0.02), o = i * 16;
      m[o] = s; m[o + 5] = s; m[o + 10] = s;
      m[o + 12] = p.x; m[o + 13] = p.y; m[o + 14] = p.z;
    }
    active += arr.length;
    if (arr.length === 0) poolH[pi]!.setInstanceMatrices(scratch, 1);
    else poolH[pi]!.setInstanceMatrices(m, arr.length);
  }
  state.bursts = burstCount;
  state.activeParticles = active;

  waterH!.setUniform?.("clk", clk);
  for (let i = 0; i < NSLOT; i += 1) {
    const s = slots[i]!, e = s.on ? burstEnvelope(s.t) : 0, rgb = PALETTE[s.tint]!.rgb;
    waterH!.setUniform?.(`bp${i}`, new Float32Array([s.x, s.y, s.z, e]));
    waterH!.setUniform?.(`bc${i}`, new Float32Array([lin(rgb[0]), lin(rgb[1]), lin(rgb[2]), 1]));
    glowH[i]!.setPosition(s.x, s.on ? s.y : -200, s.z);
    glowH[i]!.setUniform?.("glowColor", new Float32Array([lin(rgb[0]), lin(rgb[1]), lin(rgb[2]), 0.09 * e]));
    lightH[i]!.setPosition(s.x, s.y, s.z + 12);
    lightH[i]!.setLight?.({ intensity: Math.max(0.001, 4000 * e), color: PALETTE[s.tint]!.css });
  }
});

await app.ready();
requestAnimationFrame(() => { window.__EVAL_READY__ = true; });
