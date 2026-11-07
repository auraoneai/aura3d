import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { bursts: number; activeParticles: number };
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- random
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------------------------------------------------------------- palette
interface Tint { css: string; rgb: V3 }
const PAL: Tint[] = [
  { css: "#ffb02e", rgb: [1.0, 0.55, 0.08] }, // gold
  { css: "#ff1f35", rgb: [1.0, 0.05, 0.07] }, // red
  { css: "#2f6bff", rgb: [0.1, 0.28, 1.0] }, // blue
  { css: "#2dff8a", rgb: [0.08, 1.0, 0.35] }, // green
  { css: "#b44dff", rgb: [0.55, 0.15, 1.0] }, // violet
  { css: "#cfe4ff", rgb: [0.7, 0.85, 1.0] } // silver
];

// ---------------------------------------------------------------- shared shader pieces
const SLOTS = 6;
const noiseGlsl = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const slotArrays = `
  vec3 BP[6] = vec3[6](bp0, bp1, bp2, bp3, bp4, bp5);
  vec3 BC[6] = vec3[6](bc0, bc1, bc2, bc3, bc4, bc5);
`;
const vertexWorld = `out vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;
const shaderUniforms = (): Record<string, { type: "f32" | "vec3"; value: unknown }> => {
  const u: Record<string, { type: "f32" | "vec3"; value: unknown }> = { clk: { type: "f32", value: 0 } };
  for (let i = 0; i < SLOTS; i += 1) {
    u[`bp${i}`] = { type: "vec3", value: [0, -400, 0] };
    u[`bc${i}`] = { type: "vec3", value: [0, 0, 0] };
  }
  return u;
};

const domeMaterial = material.custom({
  glsl: {
    vertex: vertexWorld,
    fragment: `in vec3 vPos; out vec4 outColor;
${noiseGlsl}
float stars(vec3 d) {
  float az = atan(d.x, -d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec2 g = vec2(az, el) * 70.0;
  vec2 id = floor(g), f = fract(g);
  float h = hash(id);
  if (h < 0.9) return 0.0;
  vec2 c = vec2(hash(id + 7.3), hash(id + 19.1)) * 0.6 + 0.2;
  float b = smoothstep(0.17, 0.0, length(f - c));
  float tw = 0.75 + 0.25 * sin(clk * (1.0 + h * 3.0) + h * 40.0);
  return b * (0.3 + (h - 0.9) * 18.0) * tw;
}
void main() {
${slotArrays}
  vec3 d = normalize(vPos - cameraPosition);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(vec3(0.026, 0.042, 0.08), vec3(0.002, 0.005, 0.015), pow(h, 0.45));
  col += vec3(0.02, 0.011, 0.01) * exp(-h * 18.0);
  col += vec3(0.7, 0.82, 1.0) * stars(d) * 0.8 * smoothstep(0.01, 0.12, d.y);
  for (int i = 0; i < 6; i++) {
    vec3 bd = normalize(BP[i] - cameraPosition);
    float c = max(dot(d, bd), 0.0);
    col += BC[i] * (0.10 * pow(c, 60.0) + 0.035 * pow(c, 10.0) + 0.012 * pow(c, 3.0));
  }
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: shaderUniforms(),
  side: "back",
  depthWrite: false,
  fog: false
});

const waterMaterial = material.custom({
  glsl: {
    vertex: vertexWorld,
    fragment: `in vec3 vPos; out vec4 outColor;
${noiseGlsl}
void main() {
${slotArrays}
  vec3 V = normalize(cameraPosition - vPos);
  vec2 p = vPos.xz;
  float t = clk;
  float n1 = vnoise(vec2(p.x * 0.30 + t * 0.04, p.y * 1.3 - t * 0.22));
  float n2 = vnoise(vec2(p.x * 0.80 - t * 0.07, p.y * 3.2 + t * 0.35));
  float n3 = vnoise(vec2(p.x * 0.12, p.y * 0.12 + t * 0.03));
  vec3 N = normalize(vec3((n2 - 0.5) * 0.02 + (n3 - 0.5) * 0.015, 1.0, (n1 - 0.5) * 0.05 + (n2 - 0.5) * 0.035));
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  float fres = 0.03 + 0.97 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  float sh = 0.55 + 0.9 * n2;
  vec3 col = vec3(0.0015, 0.005, 0.011);
  vec3 sky = mix(vec3(0.026, 0.042, 0.08), vec3(0.003, 0.006, 0.015), clamp(R.y * 2.0, 0.0, 1.0));
  col += sky * fres;
  for (int i = 0; i < 6; i++) {
    vec3 dv = BP[i] - vPos;
    float dist = length(dv);
    float c = max(dot(R, dv / dist), 0.0);
    float g = pow(c, 180.0) + 0.25 * pow(c, 30.0) + 0.04 * pow(c, 6.0);
    col += BC[i] * g * fres * sh * 1.2;
    col += BC[i] * 0.05 / (1.0 + dist * dist / 1500.0);
  }
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: shaderUniforms(),
  fog: false,
  castShadow: false
});

// ---------------------------------------------------------------- scene
const DARK = (hex: string) => material.pbr({ color: hex, roughness: 0.95, metallic: 0 });
const ANCHORS: AuraTransformSpec[] = [
  { position: [-180, -3, -150], scale: [0.01, 0.01, 0.01] },
  { position: [180, 95, -60], scale: [0.01, 0.01, 0.01] }
];

let sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: [0, 5, 30], target: [0, 20, -70], fov: 50, near: 0.5, far: 700 }))
  .add(environments.neutral({ intensity: 0.06, background: false }))
  .add(lights.hemisphere({ skyColor: "#1a2a55", groundColor: "#05070c", intensity: 0.22 }))
  .add(primitives.sphere({ name: "sky-dome", size: 900, material: domeMaterial, castShadow: false }).runtime({ id: "dome", mutable: true }))
  .add(primitives.plane({ name: "harbor-water", size: [600, 1, 600], material: waterMaterial, castShadow: false }).position(0, 0, -100).runtime({ id: "water", mutable: true }))
  .add(primitives.box({ name: "shore", size: [500, 6, 178], material: DARK("#080b12") }).position(0, 0, -161));

// distant hills
const hills: AuraTransformSpec[] = [];
for (let i = 0; i < 9; i += 1) {
  hills.push({ position: [-230 + i * 58 + range(-12, 12), 2, -175 + range(-10, 10)], scale: [range(70, 110), range(14, 24), range(40, 60)] });
}
sc = sc.add(instances.sphere({ name: "hills", transforms: hills, material: DARK("#060911"), params: { widthSegments: 16, heightSegments: 8 } }));

// shoreline rocks
const rocks: AuraTransformSpec[] = [];
for (let i = 0; i < 40; i += 1) {
  const s = range(1.2, 3.2);
  rocks.push({ position: [-120 + i * 6 + range(-2, 2), 1.4, -72 + range(-1, 1.5)], rotation: [0, range(0, 6), 0], scale: [s * 1.6, s * 0.8, s] });
}
sc = sc.add(instances.sphere({ name: "shore-rocks", transforms: rocks, material: DARK("#0a0d15"), params: { widthSegments: 8, heightSegments: 5 } }));

// buildings
const bodies: AuraTransformSpec[] = [], roofs: AuraTransformSpec[] = [], windows: AuraTransformSpec[] = [];
const bodyColors: string[] = [];
const buildingXs = [-92, -76, -63, -50, -34, -22, -8, 6, 20, 52, 66, 79, 95];
for (const bx of buildingXs) {
  const w = range(5, 9), h = range(3.5, 7.5), d = range(5, 8), bz = -80 - range(0, 14);
  bodies.push({ position: [bx, 3 + h / 2, bz], scale: [w, h, d] });
  bodyColors.push(`hsl(${215 + Math.floor(range(0, 20))}, 25%, ${5 + Math.floor(range(0, 3))}%)`);
  if (rand() < 0.75) {
    roofs.push({ position: [bx, 3 + h + 1.4, bz], rotation: [0, Math.PI / 4, 0], scale: [w * 1.05, 2.8, d * 1.05] });
  }
  const nWin = Math.floor(range(0, 4));
  for (let k = 0; k < nWin; k += 1) {
    windows.push({ position: [bx + range(-w / 2 + 0.8, w / 2 - 0.8), 3 + range(1.2, h - 0.8), bz + d / 2 + 0.03], scale: [0.5, 0.65, 0.06] });
  }
}
sc = sc
  .add(instances.box({ name: "buildings", transforms: bodies, colors: bodyColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }))
  .add(instances.cone({ name: "roofs", transforms: roofs, material: DARK("#05070c"), params: { radialSegments: 4 } }))
  .add(instances.box({ name: "windows", transforms: windows, material: material.emissive({ color: "#ffb860", emissive: "#ff9d3c", emissiveIntensity: 1.3 }) }));

// pier with posts and a lamp
const posts: AuraTransformSpec[] = [];
for (let z = -72; z <= -40; z += 4) {
  posts.push({ position: [32.8, 0.3, z], scale: [0.35, 2.4, 0.35] });
  posts.push({ position: [35.2, 0.3, z], scale: [0.35, 2.4, 0.35] });
}
sc = sc
  .add(primitives.box({ name: "pier-deck", size: [3.6, 0.4, 34], material: DARK("#07090f") }).position(34, 1.3, -55))
  .add(instances.cylinder({ name: "pier-posts", transforms: posts, material: DARK("#06080d"), params: { radialSegments: 6 } }))
  .add(primitives.cylinder({ name: "lamp-pole", size: [0.16, 3.2, 0.16], material: DARK("#06080d") }).position(34, 3.1, -39))
  .add(primitives.sphere({ name: "lamp", size: 0.55, material: material.emissive({ color: "#ffd9a0", emissive: "#ffb85c", emissiveIntensity: 2.2 }) }).position(34, 4.8, -39));

// boats
const hulls: AuraTransformSpec[] = [], cabins: AuraTransformSpec[] = [], masts: AuraTransformSpec[] = [];
const boatSpots: Array<[number, number, number]> = [[-38, -48, 0.15], [-18, -38, -0.3], [-60, -62, 0.4], [14, -52, 0.05], [58, -46, -0.2], [74, -60, 0.3], [-5, -64, -0.1]];
for (const [bx, bz, ry] of boatSpots) {
  hulls.push({ position: [bx, 0.15, bz], rotation: [0, ry, 0], scale: [5.5, 1.3, 1.9] });
  cabins.push({ position: [bx + Math.cos(ry) * 0.6, 1.2, bz - Math.sin(ry) * 0.6], rotation: [0, ry, 0], scale: [1.8, 1.0, 1.3] });
  masts.push({ position: [bx - Math.cos(ry) * 1.2, 3.0, bz + Math.sin(ry) * 1.2], scale: [0.14, 5.4, 0.14] });
}
sc = sc
  .add(instances.box({ name: "hulls", transforms: hulls, material: DARK("#06080d") }))
  .add(instances.box({ name: "cabins", transforms: cabins, material: DARK("#080b12") }))
  .add(instances.cylinder({ name: "masts", transforms: masts, material: DARK("#05070b"), params: { radialSegments: 5 } }));

// spark pools: one instanced node per colour and brightness
for (let ci = 0; ci < PAL.length; ci += 1) {
  const tint = PAL[ci]!;
  sc = sc
    .add(instances.sphere({
      name: `spark-hot-${ci}`, transforms: ANCHORS, params: { widthSegments: 6, heightSegments: 4 }, castShadow: false,
      material: material.emissive({ color: tint.css, emissive: tint.css, emissiveIntensity: 3.4 })
    }).runtime({ id: `hot${ci}`, mutable: true }))
    .add(instances.sphere({
      name: `spark-dim-${ci}`, transforms: ANCHORS, params: { widthSegments: 6, heightSegments: 4 }, castShadow: false,
      material: material.emissive({ color: tint.css, emissive: tint.css, emissiveIntensity: 1.0 })
    }).runtime({ id: `dim${ci}`, mutable: true }));
}

// burst lights on the shoreline
const PLIGHTS = 3;
for (let i = 0; i < PLIGHTS; i += 1) {
  sc = sc.add(lights.point({ name: `burst-light-${i}`, position: [0, 40, -100], intensity: 0.001, color: "#ffffff", distance: 220, decay: 2, shadow: false }).runtime({ id: `bl${i}`, mutable: true }));
}
sc = sc.add(effects.bloom({ intensity: 1.15, threshold: 0.55, radius: 0.6 }));

const app = createAuraApp("#app", { scene: sc });

// ---------------------------------------------------------------- simulation
interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; ci: number; size: number; drag: number; grav: number;
  kind: 0 | 1; trail: boolean; trailT: number; hotUntil: number;
}
interface Rocket {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  t: number; dur: number; ci: number; px: number; py: number; pz: number;
}
interface Flash { x: number; y: number; z: number; ci: number; age: number }

const parts: Particle[] = [];
const rockets: Rocket[] = [];
const flashes: Flash[] = [];
let bursts = 0;
let colorCursor = Math.floor(rand() * PAL.length);
let lastX = 0;

const spawnTrail = (x: number, y: number, z: number, ci: number, size: number, life: number): void => {
  parts.push({ x, y, z, vx: range(-0.4, 0.4), vy: range(-0.5, 0.2), vz: range(-0.4, 0.4), age: 0, life, ci, size, drag: 0, grav: 1.5, kind: 1, trail: false, trailT: 0, hotUntil: 0.35 });
};

const shell = (x: number, y: number, z: number, ci: number, count: number, speed: number, drag: number, grav: number, lifeMin: number, lifeMax: number, trailFrac: number): void => {
  for (let i = 0; i < count; i += 1) {
    const u = rand() * 2 - 1, phi = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const sp = speed * range(0.93, 1.03);
    parts.push({
      x, y, z, vx: Math.cos(phi) * r * sp, vy: u * sp, vz: Math.sin(phi) * r * sp,
      age: 0, life: range(lifeMin, lifeMax), ci, size: range(0.55, 0.85), drag, grav,
      kind: 0, trail: rand() < trailFrac, trailT: rand() * 0.07, hotUntil: 0.5
    });
  }
};

const explode = (x: number, y: number, z: number, ci: number): void => {
  bursts += 1;
  const roll = rand();
  const willow = ci === 0 && roll < 0.7;
  if (willow) {
    shell(x, y, z, 0, 130, 25, 1.9, 6.5, 2.6, 3.2, 0.7);
  } else if (roll < 0.35) {
    // double shell: outer colour plus a contrasting core
    shell(x, y, z, ci, 190, 30, 1.5, 7, 1.8, 2.4, 0.0);
    shell(x, y, z, (ci + 2) % PAL.length, 90, 17, 1.5, 7, 1.6, 2.1, 0.0);
  } else if (roll < 0.65) {
    shell(x, y, z, ci, 150, 31, 1.6, 7, 2.0, 2.7, 0.55);
  } else {
    shell(x, y, z, ci, 260, 30, 1.5, 7.5, 1.7, 2.3, 0.0);
  }
  flashes.push({ x, y, z, ci, age: 0 });
  if (flashes.length > SLOTS) flashes.shift();
};

const launch = (): void => {
  let x0 = range(-58, 58);
  for (let tries = 0; tries < 6 && Math.abs(x0 - lastX) < 28; tries += 1) x0 = range(-58, 58);
  lastX = x0;
  const ci = colorCursor % PAL.length;
  colorCursor += 1 + (rand() < 0.3 ? 1 : 0);
  const H = range(34, 56);
  const z0 = range(-76, -88);
  rockets.push({
    x0, y0: 3.2, z0, x1: x0 + range(-9, 9), y1: H, z1: z0 - range(2, 22),
    t: 0, dur: 1.1 + ((H - 34) / 22) * 0.5 + rand() * 0.2, ci, px: x0, py: 3.2, pz: z0
  });
};

let time = 0;
let nextLaunch = 0.15;
let clk = 0;

const spec = (x: number, y: number, z: number, s: number): AuraTransformSpec => ({ position: [x, y, z], scale: [s, s, s] });
const hotLists: AuraTransformSpec[][] = PAL.map(() => [...ANCHORS]);
const dimLists: AuraTransformSpec[][] = PAL.map(() => [...ANCHORS]);

app.onFrame((f) => {
  const dt = Math.min(Math.max(f.dt, 0), 0.05);
  time += dt;
  clk += dt;

  if (time >= nextLaunch) {
    launch();
    nextLaunch = time + 0.5 + rand() * 2.1;
    if (rand() < 0.25) nextLaunch = time + 0.2 + rand() * 0.25;
  }

  for (let ci = 0; ci < PAL.length; ci += 1) {
    hotLists[ci]!.length = ANCHORS.length;
    dimLists[ci]!.length = ANCHORS.length;
  }

  // rockets
  for (let i = rockets.length - 1; i >= 0; i -= 1) {
    const r = rockets[i]!;
    r.t += dt;
    const s = Math.min(r.t / r.dur, 1);
    const e = 1 - (1 - s) * (1 - s);
    const x = r.x0 + (r.x1 - r.x0) * s, y = r.y0 + (r.y1 - r.y0) * e, z = r.z0 + (r.z1 - r.z0) * s;
    const dist = Math.hypot(x - r.px, y - r.py, z - r.pz);
    const steps = Math.max(1, Math.ceil(dist / 0.6));
    for (let k = 1; k <= steps; k += 1) {
      const q = k / steps;
      spawnTrail(r.px + (x - r.px) * q + range(-0.1, 0.1), r.py + (y - r.py) * q, r.pz + (z - r.pz) * q + range(-0.1, 0.1), 0, range(0.4, 0.6), range(0.35, 0.6));
    }
    r.px = x; r.py = y; r.pz = z;
    if (s >= 1) {
      explode(x, y, z, r.ci);
      rockets.splice(i, 1);
    } else {
      hotLists[0]!.push(spec(x, y, z, 1.0));
    }
  }

  // particles
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i]!;
    p.age += dt;
    if (p.age >= p.life) {
      parts[i] = parts[parts.length - 1]!;
      parts.pop();
      continue;
    }
    if (p.drag > 0) {
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
    }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.trail) {
      p.trailT -= dt;
      if (p.trailT <= 0) {
        p.trailT = 0.07;
        spawnTrail(p.x, p.y, p.z, p.ci, p.size * 0.8, range(0.4, 0.6));
      }
    }
  }
  for (const p of parts) {
    const u = p.age / p.life;
    if (u < p.hotUntil) {
      hotLists[p.ci]!.push(spec(p.x, p.y, p.z, p.size * (1 - 0.2 * u)));
    } else {
      const k = 1 - (u - p.hotUntil) / (1 - p.hotUntil);
      dimLists[p.ci]!.push(spec(p.x, p.y, p.z, Math.max(0.03, p.size * 0.85 * k)));
    }
  }
  for (let ci = 0; ci < PAL.length; ci += 1) {
    app.nodes.require(`hot${ci}`).setInstances?.(hotLists[ci]!);
    app.nodes.require(`dim${ci}`).setInstances?.(dimLists[ci]!);
  }

  // lights from active bursts
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    flashes[i]!.age += dt;
    if (flashes[i]!.age > 4.5) flashes.splice(i, 1);
  }
  const water = app.nodes.require("water"), dome = app.nodes.require("dome");
  water.setUniform?.("clk", clk);
  dome.setUniform?.("clk", clk);
  for (let i = 0; i < SLOTS; i += 1) {
    const fl = flashes[i];
    let pos: V3 = [0, -400, 0], col: V3 = [0, 0, 0];
    if (fl) {
      const inten = Math.min(fl.age / 0.05, 1) * (0.25 + 1.5 * Math.exp(-fl.age * 1.8)) * Math.max(0, 1 - fl.age / 4.5);
      const c = PAL[fl.ci]!.rgb;
      pos = [fl.x, fl.y, fl.z];
      col = [c[0] * inten, c[1] * inten, c[2] * inten];
    }
    water.setUniform?.(`bp${i}`, pos);
    water.setUniform?.(`bc${i}`, col);
    dome.setUniform?.(`bp${i}`, pos);
    dome.setUniform?.(`bc${i}`, col);
  }
  for (let i = 0; i < PLIGHTS; i += 1) {
    const fl = flashes[flashes.length - 1 - i];
    const node = app.nodes.require(`bl${i}`);
    if (fl) {
      const inten = Math.min(fl.age / 0.05, 1) * (0.2 + 1.6 * Math.exp(-fl.age * 2.2)) * Math.max(0, 1 - fl.age / 4.5);
      node.setPosition(fl.x, fl.y, fl.z);
      node.setLight?.({ intensity: 1800 * inten + 0.001, color: PAL[fl.ci]!.css });
    } else {
      node.setLight?.({ intensity: 0.001 });
    }
  }

  window.__TASK_STATE__ = { bursts, activeParticles: parts.length };
});

window.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };
await app.ready();
window.__EVAL_READY__ = true;
