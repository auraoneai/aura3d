import {
  camera, createAuraApp, effects, environments, geometry, instances, lights, material, primitives, scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { bursts: number; activeParticles: number };
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- constants
const CAM: V3 = [0, 5, 40];
const SKY_Z = -190;
const SLOTS = 6; // flash slots shared by the sky and water shaders
const LIGHTS = 3; // real point lights
const POOL_CAP = 900;

const PALETTE = [
  { css: "#ffb030", rgb: [1.0, 0.62, 0.16] as V3 }, // gold
  { css: "#ff2418", rgb: [1.0, 0.1, 0.07] as V3 }, // red
  { css: "#3d6dff", rgb: [0.2, 0.38, 1.0] as V3 }, // blue
  { css: "#30ff80", rgb: [0.12, 1.0, 0.45] as V3 }, // green
  { css: "#c050ff", rgb: [0.72, 0.28, 1.0] as V3 }, // violet
  { css: "#ffe2b0", rgb: [1.0, 0.86, 0.6] as V3 } // warm white (rockets, trails)
];
const ROCKET_POOL = 5;

// ---------------------------------------------------------------- seeded layout
let seed = 424242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------------------------------------------------------------- shaders
const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

const slotUniforms = (names: string[]): Record<string, { type: "f32"; value: number }> => {
  const u: Record<string, { type: "f32"; value: number }> = { clk: { type: "f32", value: 0 } };
  for (let i = 0; i < SLOTS; i += 1) for (const n of names) u[`f${i}${n}`] = { type: "f32", value: 0 };
  return u;
};

const skyGlow = Array.from({ length: SLOTS }, (_, i) =>
  `{ vec2 d = vPos.xy - vec2(f${i}x, f${i}y); float d2 = dot(d, d);
    glow += vec3(f${i}r, f${i}g, f${i}b) * f${i}i * (0.11 * exp(-d2 / 3600.0) + 0.035 * exp(-d2 / 22000.0)); }`
).join("\n");

const skyMat = material.custom({
  glsl: {
    vertex: `out vec3 vPos;
void main() { vPos = position; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`,
    fragment: `in vec3 vPos; out vec4 outColor;
${NOISE}
vec3 stars(vec2 p, float cell, float thr) {
  vec2 q = p / cell; vec2 id = floor(q); vec2 f = fract(q);
  float h = hash(id);
  if (h < thr) return vec3(0.0);
  vec2 o = vec2(hash(id + 17.3), hash(id + 41.7)) * 0.6 + 0.2;
  float b = smoothstep(0.17, 0.0, length(f - o));
  float k = (h - thr) / (1.0 - thr);
  float tw = 0.72 + 0.28 * sin(clk * (1.0 + 3.0 * k) + h * 60.0);
  vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.86, 0.7), hash(id + 5.0));
  return tint * b * (0.3 + 0.7 * k) * tw;
}
void main() {
  float y = vPos.y;
  float h = clamp(y / 230.0, 0.0, 1.0);
  vec3 col = mix(vec3(0.018, 0.030, 0.066), vec3(0.0012, 0.0024, 0.008), pow(h, 0.5));
  col += vec3(0.004, 0.006, 0.013) * vnoise(vPos.xy * 0.011 + 3.0) * vnoise(vPos.xy * 0.027);
  float fade = smoothstep(3.0, 50.0, y);
  col += (stars(vPos.xy, 3.0, 0.93) + stars(vPos.xy + 11.0, 7.0, 0.9) * 0.8) * fade;
  vec3 glow = vec3(0.0);
${skyGlow}
  col += glow;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: slotUniforms(["x", "y", "i", "r", "g", "b"])
});

const waterGlow = Array.from({ length: SLOTS }, (_, i) =>
  `{ vec3 B = vec3(f${i}x, f${i}y, f${i}z); vec3 d = B - vPos; float al = dot(d, r);
    if (al > 0.0) { float dist = length(d - r * al); float R = 9.0 + 0.07 * al;
      float g = exp(-(dist * dist) / (R * R));
      col += vec3(f${i}r, f${i}g, f${i}b) * f${i}i * g * glit * (0.3 + 0.7 * fres) * 1.5; }
    vec2 dg = vPos.xz - B.xz; col += vec3(f${i}r, f${i}g, f${i}b) * f${i}i * 0.012 * exp(-dot(dg, dg) / 5000.0); }`
).join("\n");

const WATER_X0 = -230, WATER_X1 = 230, WATER_Z0 = -190, WATER_Z1 = 70;

const waterMat = material.custom({
  glsl: {
    vertex: `out vec3 vPos;
void main() { vPos = position; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`,
    fragment: `in vec3 vPos; out vec4 outColor;
${NOISE}
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec2 p = vPos.xz;
  float a1 = vnoise(vec2(p.x * 0.20, p.y * 0.14) + vec2(clk * 0.15, clk * 0.30));
  float a2 = vnoise(vec2(p.x * 0.55, p.y * 0.22) + vec2(-clk * 0.20, clk * 0.45) + 9.0);
  float b1 = vnoise(vec2(p.x * 0.35, p.y * 0.10) + vec2(clk * 0.30, -clk * 0.20) + 21.0);
  vec3 n = normalize(vec3((a1 - 0.5) * 0.10 + (a2 - 0.5) * 0.06, 1.0, (b1 - 0.5) * 0.09 + (a2 - 0.5) * 0.05));
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  r = normalize(vec3(r.x, max(r.y, 0.01), r.z));
  vec3 skyc = mix(vec3(0.018, 0.030, 0.066), vec3(0.004, 0.008, 0.02), clamp(r.y * 3.0, 0.0, 1.0));
  vec3 col = vec3(0.0015, 0.0045, 0.011) + skyc * fres * 0.9;
  float glit = 0.3 + 0.9 * smoothstep(0.3, 0.8, vnoise(vec2(p.x * 1.4, p.y * 0.16) + vec2(clk * 0.2, clk * 0.5)));
${waterGlow}
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: slotUniforms(["x", "y", "z", "i", "r", "g", "b"])
});

// ---------------------------------------------------------------- custom geometry
const WN = 40;
const waterPositions = new Float32Array((WN + 1) ** 2 * 3);
const waterNormals = new Float32Array(waterPositions.length);
const waterIndices: number[] = [];
for (let j = 0; j <= WN; j += 1) {
  for (let i = 0; i <= WN; i += 1) {
    const v = j * (WN + 1) + i;
    waterPositions.set([WATER_X0 + (i / WN) * (WATER_X1 - WATER_X0), 0, WATER_Z0 + (j / WN) * (WATER_Z1 - WATER_Z0)], v * 3);
    waterNormals[v * 3 + 1] = 1;
    if (i < WN && j < WN) waterIndices.push(v, v + WN + 1, v + 1, v + 1, v + WN + 1, v + WN + 2);
  }
}

const SW = 320, SY0 = -5, SY1 = 340;
const skyGeo = geometry.define({
  positions: new Float32Array([-SW, SY0, SKY_Z, SW, SY0, SKY_Z, SW, SY1, SKY_Z, -SW, SY1, SKY_Z]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2],
  bounds: { min: [-SW, SY0, SKY_Z - 1], max: [SW, SY1, SKY_Z + 1] }
});

// ---------------------------------------------------------------- static scene
const dark = material.pbr({ color: "#05070b", roughness: 1 });
const darker = material.pbr({ color: "#030407", roughness: 1 });
const warm = material.emissive({ color: "#ffb86a", emissive: "#ffa23c", emissiveIntensity: 1.8 });

let sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: CAM, target: [0, 14, -100], fov: 50, near: 0.5, far: 600 }))
  .add(environments.neutral({ intensity: 0.05, background: false }))
  .add(lights.directional({ name: "moon", position: [-40, 60, 30], target: [0, 0, -100], intensity: 0.12, color: "#5b78c8" }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.55, radius: 0.7 }))
  .add(geometry.custom(skyGeo, { name: "sky", material: skyMat, castShadow: false }).runtime({ id: "sky", mutable: true }))
  .add(
    geometry.custom(
      geometry.define({
        positions: waterPositions, normals: waterNormals, indices: waterIndices,
        bounds: { min: [WATER_X0, -1, WATER_Z0], max: [WATER_X1, 1, WATER_Z1] }
      }),
      { name: "water", material: waterMat, castShadow: false }
    ).runtime({ id: "water", mutable: true })
  );

// land: a long low slab with rounded hills at both ends
const land: AuraTransformSpec[] = [];
for (let x = -230; x < 230; x += 20) {
  const front = -88 + Math.sin(x * 0.07) * 2.5 - rand() * 2;
  const depth = front - SKY_Z + 4;
  land.push({ position: [x + 10, 1.5, front - depth / 2], scale: [20.5, 3, depth] });
}
sc = sc.add(instances.box({ name: "land", transforms: land, material: dark }));
sc = sc.add(instances.sphere({
  name: "hills",
  transforms: [
    { position: [-150, 2, -130], scale: [110, 20, 70] },
    { position: [165, 2, -135], scale: [120, 24, 70] },
    { position: [-20, 1, -170], scale: [140, 12, 40] }
  ],
  material: darker
}));

// buildings with a few warm windows
const bodies: AuraTransformSpec[] = [], roofs: AuraTransformSpec[] = [], windows: AuraTransformSpec[] = [];
let bx = -88;
while (bx < 92) {
  const w = 5 + rand() * 5, h = 4 + rand() * 5, d = 6 + rand() * 2;
  const z = -96 - rand() * 3;
  if (!(bx > 12 && bx < 40)) { // keep the pier approach clear
    bodies.push({ position: [bx, 2.5 + h / 2, z], scale: [w, h, d] });
    if (rand() < 0.75) roofs.push({ position: [bx, 2.5 + h + 1.2, z], rotation: [0, Math.PI / 4, 0], scale: [w * 1.3, 2.6, d * 1.3] });
    const cols = Math.max(1, Math.floor(w / 2.4));
    for (let c = 0; c < cols; c += 1) {
      if (rand() < 0.45) continue;
      windows.push({ position: [bx - w / 2 + (c + 0.5) * (w / cols), 2.5 + 1.6 + rand() * (h - 3), z + d / 2 + 0.05], scale: [0.7, 0.8, 0.1] });
    }
  }
  bx += w + 1.5 + rand() * 6;
}
sc = sc.add(instances.box({ name: "buildings", transforms: bodies, material: dark }))
  .add(instances.cone({ name: "roofs", transforms: roofs, material: darker, params: { radialSegments: 4 } }))
  .add(instances.box({ name: "windows", transforms: windows, material: warm }));

// lighthouse
sc = sc.add(primitives.cylinder({ name: "lighthouse", size: [3.2, 24, 3.2], material: dark }).position(-108, 14, -102))
  .add(primitives.cylinder({ name: "lighthouse-top", size: [4.4, 1.2, 4.4], material: darker }).position(-108, 26.6, -102))
  .add(primitives.sphere({ name: "lighthouse-lamp", size: 2, material: material.emissive({ color: "#ffd9a0", emissive: "#ffc060", emissiveIntensity: 2.6 }) }).position(-108, 28, -102));

// pier with posts and lamps
const posts: AuraTransformSpec[] = [];
for (let z = -86; z <= -50; z += 6) {
  posts.push({ position: [20.2, 0, z], scale: [0.5, 2.4, 0.5] }, { position: [23.8, 0, z], scale: [0.5, 2.4, 0.5] });
}
sc = sc.add(primitives.box({ name: "pier", size: [4.4, 0.5, 40], material: dark }).position(22, 1.2, -69))
  .add(instances.cylinder({ name: "pier-posts", transforms: posts, material: darker, params: { radialSegments: 6 } }))
  .add(instances.cylinder({ name: "pier-lamp-posts", transforms: [{ position: [20.2, 2.8, -52], scale: [0.2, 3, 0.2] }, { position: [23.8, 2.8, -66], scale: [0.2, 3, 0.2] }], material: darker, params: { radialSegments: 6 } }))
  .add(instances.sphere({ name: "pier-lamps", transforms: [{ position: [20.2, 4.5, -52], scale: [0.7, 0.7, 0.7] }, { position: [23.8, 4.5, -66], scale: [0.7, 0.7, 0.7] }], material: warm }));

// boats
const hulls: AuraTransformSpec[] = [], cabins: AuraTransformSpec[] = [], masts: AuraTransformSpec[] = [], boatLamps: AuraTransformSpec[] = [];
const boatSpots: Array<[number, number, number]> = [[-38, -62, 0.1], [-56, -76, -0.15], [46, -58, 0.2], [62, -74, -0.1], [-14, -80, 0.05]];
for (const [x, z, a] of boatSpots) {
  hulls.push({ position: [x, 0.15, z], rotation: [0, a, Math.PI / 2], scale: [2.0, 8, 3] });
  cabins.push({ position: [x - Math.cos(a) * 0.8, 1.5, z + Math.sin(a) * 0.8], rotation: [0, a, 0], scale: [2.6, 1.4, 1.8] });
  masts.push({ position: [x + Math.cos(a) * 1.5, 3.4, z - Math.sin(a) * 1.5], scale: [0.14, 6, 0.14] });
  boatLamps.push({ position: [x + Math.cos(a) * 1.5, 6.5, z - Math.sin(a) * 1.5], scale: [0.4, 0.4, 0.4] });
}
sc = sc.add(instances.cylinder({ name: "hulls", transforms: hulls, material: dark, params: { radialSegments: 10 } }))
  .add(instances.box({ name: "cabins", transforms: cabins, material: darker }))
  .add(instances.cylinder({ name: "masts", transforms: masts, material: darker, params: { radialSegments: 5 } }))
  .add(instances.sphere({ name: "boat-lamps", transforms: boatLamps, material: warm }));

// light pool for spark flashes
for (let i = 0; i < LIGHTS; i += 1) {
  sc = sc.add(
    lights.point({ name: `flash${i}`, position: [0, 40, -110], intensity: 0, color: "#ffffff", distance: 320, decay: 2, shadow: false })
      .runtime({ id: `flash${i}`, mutable: true })
  );
}

// spark pools, one instanced emissive mesh per colour
const HIDDEN_A: AuraTransformSpec = { position: [-200, 0, -190], scale: [0.001, 0.001, 0.001] };
const HIDDEN_B: AuraTransformSpec = { position: [200, 130, -20], scale: [0.001, 0.001, 0.001] };
PALETTE.forEach((c, i) => {
  sc = sc.add(
    instances.sphere({
      name: `sparks${i}`,
      transforms: [HIDDEN_A, HIDDEN_B],
      material: material.emissive({ color: c.css, emissive: c.css, emissiveIntensity: 3.2 }),
      castShadow: false,
      params: { widthSegments: 6, heightSegments: 4 }
    }).runtime({ id: `sparks${i}`, mutable: true })
  );
});

// ---------------------------------------------------------------- simulation
interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size: number;
  pool: number; kind: 0 | 1 | 2; // spark, trail dot, rocket
  drag: number; grav: number;
  period: number; dotT: number; // trail emission (0 = none)
  shell?: Shell;
}
interface Shell {
  pool: number; pool2: number; n: number; speed: number; life: [number, number];
  drag: number; grav: number; trailFrac: number; dotPeriod: number;
}
interface Flash { x: number; y: number; z: number; t: number; pool: number; on: boolean }

const particles: Particle[] = [];
const poolCount = PALETTE.map(() => 0);
const flashes: Flash[] = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, z: 0, t: 99, pool: 0, on: false }));
let burstTotal = 0, bag: number[] = [];

const pickColor = (): number => {
  if (bag.length === 0) {
    bag = [0, 1, 2, 3, 4];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
  }
  return bag.pop()!;
};

const emit = (p: Particle): void => {
  if (poolCount[p.pool]! >= POOL_CAP) return;
  poolCount[p.pool] = poolCount[p.pool]! + 1;
  particles.push(p);
};

const launch = (): void => {
  const color = pickColor();
  const r = Math.random();
  let shell: Shell;
  if (color === 0 && r < 0.55) {
    shell = { pool: 0, pool2: 0, n: 90, speed: 30, life: [2.4, 3.0], drag: 1.5, grav: 10, trailFrac: 0.6, dotPeriod: 0.07 };
  } else if (r < 0.4) {
    shell = { pool: color, pool2: color, n: 110, speed: 36, life: [1.9, 2.5], drag: 1.7, grav: 7, trailFrac: 0.35, dotPeriod: 0.07 };
  } else {
    const two = Math.random() < 0.3;
    shell = { pool: color, pool2: two ? (color + 1 + Math.floor(Math.random() * 4)) % 5 : color, n: 150, speed: 38, life: [1.7, 2.3], drag: 1.7, grav: 7, trailFrac: 0, dotPeriod: 0.07 };
  }
  const H = 38 + Math.random() * 28, T = 1.3 + Math.random() * 0.6, g = 8;
  const x0 = -62 + Math.random() * 124, z0 = -90.5 + Math.random() * 1.5, y0 = 3.4;
  const xb = x0 + (Math.random() - 0.5) * 20, zb = -104 - Math.random() * 20;
  emit({
    x: x0, y: y0, z: z0,
    vx: (xb - x0) / T, vy: (H - y0 + 0.5 * g * T * T) / T, vz: (zb - z0) / T,
    age: 0, life: T, size: 1.5, pool: ROCKET_POOL, kind: 2, drag: 0, grav: g, period: 0.02, dotT: 0, shell
  });
};

const burst = (rk: Particle): void => {
  const s = rk.shell!;
  burstTotal += 1;
  // flash slot: reuse inactive or oldest
  let slot = flashes[0]!;
  for (const f of flashes) if (!f.on || f.t > slot.t) slot = f;
  slot.x = rk.x; slot.y = rk.y; slot.z = rk.z; slot.t = 0; slot.pool = s.pool; slot.on = true;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const tilt = Math.random() * 6.28;
  for (let i = 0; i < s.n; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / s.n, rr = Math.sqrt(1 - y * y), phi = i * ga + tilt;
    const dx = Math.cos(phi) * rr, dz = Math.sin(phi) * rr;
    const sp = s.speed * (0.94 + Math.random() * 0.06);
    const trail = Math.random() < s.trailFrac;
    emit({
      x: rk.x, y: rk.y, z: rk.z, vx: dx * sp, vy: y * sp, vz: dz * sp,
      age: 0, life: s.life[0] + Math.random() * (s.life[1] - s.life[0]),
      size: 1.15 + Math.random() * 0.4, pool: i % 2 === 0 ? s.pool : s.pool2, kind: 0,
      drag: s.drag, grav: s.grav, period: trail ? s.dotPeriod : 0, dotT: Math.random() * s.dotPeriod
    });
  }
};

const app = createAuraApp("#app", { scene: sc });

window.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };

let clk = 0, nextLaunch = 0.25, extraLaunch = 1.1;
const flashI = (f: Flash): number => (f.on ? Math.min(1, f.t / 0.05) * Math.exp(-f.t * 1.35) : 0);
const rgbOf = (pool: number): V3 => PALETTE[pool]!.rgb;

app.onFrame((fr: { dt: number }) => {
  const dt = Math.min(Math.max(fr.dt, 0), 0.05);
  clk += dt;

  // launch schedule (irregular)
  if (clk >= nextLaunch) {
    launch();
    nextLaunch = clk + 0.55 + Math.random() * 1.9;
  }
  if (clk >= extraLaunch) {
    if (Math.random() < 0.5) launch();
    extraLaunch = clk + 3 + Math.random() * 4;
  }

  // integrate particles
  const born: Particle[] = [];
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i]!;
    p.age += dt;
    let dead = p.age >= p.life;
    if (!dead || p.kind === 2) {
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy *= k; p.vz *= k;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    if (p.kind === 2 && p.age < p.life) {
      p.dotT -= dt;
      while (p.dotT <= 0) {
        p.dotT += p.period;
        born.push({
          x: p.x + (Math.random() - 0.5) * 0.3, y: p.y, z: p.z + (Math.random() - 0.5) * 0.3,
          vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 2, vz: (Math.random() - 0.5) * 1.5,
          age: 0, life: 0.45 + Math.random() * 0.2, size: 0.9, pool: ROCKET_POOL, kind: 1, drag: 0, grav: 0, period: 0, dotT: 0
        });
      }
    } else if (p.kind === 0 && p.period > 0 && !dead) {
      p.dotT -= dt;
      while (p.dotT <= 0) {
        p.dotT += p.period;
        born.push({
          x: p.x, y: p.y, z: p.z, vx: 0, vy: -0.8, vz: 0,
          age: 0, life: 0.55, size: p.size * 0.85, pool: p.pool, kind: 1, drag: 0, grav: 0, period: 0, dotT: 0
        });
      }
    }
    if (dead) {
      poolCount[p.pool] = poolCount[p.pool]! - 1;
      particles[i] = particles[particles.length - 1]!;
      particles.pop();
      if (p.kind === 2) burst(p);
    }
  }
  for (const b of born) emit(b);

  // flashes
  for (const f of flashes) {
    if (f.on) {
      f.t += dt;
      if (f.t > 4.5) f.on = false;
    }
  }

  // push instance pools
  const lists: AuraTransformSpec[][] = PALETTE.map(() => [HIDDEN_A, HIDDEN_B]);
  for (const p of particles) {
    const u = p.age / p.life;
    let s: number;
    if (p.kind === 2) s = p.size;
    else if (p.kind === 1) s = p.size * Math.max(0, 1 - u);
    else {
      s = p.size * Math.pow(Math.max(0, 1 - u), 0.55);
      if (u > 0.65 && Math.random() < 0.18) s *= 0.3;
    }
    if (s < 0.02) continue;
    lists[p.pool]!.push({ position: [p.x, p.y, p.z], scale: [s, s, s] });
  }
  PALETTE.forEach((_, i) => app.nodes.require(`sparks${i}`).setInstances?.(lists[i]!));

  // shader uniforms
  const sky = app.nodes.require("sky"), water = app.nodes.require("water");
  sky.setUniform?.("clk", clk);
  water.setUniform?.("clk", clk);
  const order = flashes.map((f, idx) => ({ f, idx, i: flashI(f) })).sort((a, b) => b.i - a.i);
  flashes.forEach((f, i) => {
    const I = flashI(f);
    const [r, g, b] = rgbOf(f.pool);
    const k = (CAM[2] - SKY_Z) / (CAM[2] - f.z);
    sky.setUniform?.(`f${i}x`, f.x * k);
    sky.setUniform?.(`f${i}y`, CAM[1] + (f.y - CAM[1]) * k);
    sky.setUniform?.(`f${i}i`, I);
    sky.setUniform?.(`f${i}r`, r); sky.setUniform?.(`f${i}g`, g); sky.setUniform?.(`f${i}b`, b);
    water.setUniform?.(`f${i}x`, f.x);
    water.setUniform?.(`f${i}y`, f.y);
    water.setUniform?.(`f${i}z`, f.z);
    water.setUniform?.(`f${i}i`, I);
    water.setUniform?.(`f${i}r`, r); water.setUniform?.(`f${i}g`, g); water.setUniform?.(`f${i}b`, b);
  });
  for (let i = 0; i < LIGHTS; i += 1) {
    const o = order[i]!;
    const node = app.nodes.require(`flash${i}`);
    node.setPosition(o.f.x, o.f.y - 5, o.f.z + 10);
    node.setLight?.({ intensity: o.i * 2400, color: PALETTE[o.f.pool]!.css });
  }

  window.__TASK_STATE__ = { bursts: burstTotal, activeParticles: particles.length };
});

await app.ready();
window.__EVAL_READY__ = true;
