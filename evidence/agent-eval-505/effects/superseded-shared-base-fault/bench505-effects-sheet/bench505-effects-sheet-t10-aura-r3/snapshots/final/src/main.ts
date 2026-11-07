import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { bursts: number; activeParticles: number };
  }
}

type V3 = [number, number, number];

// ---------- deterministic-ish random helpers ----------
let seed = 20240607;
const srand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- scene constants ----------
const SHORE_Z = -44;
const G = 7.5; // gravity for sparks

const SPARK_COLORS = [
  { name: "gold", css: "#ffb02e", flash: "#ffb347" },
  { name: "red", css: "#ff2638", flash: "#ff4455" },
  { name: "blue", css: "#3d7dff", flash: "#4f8bff" },
  { name: "green", css: "#2dff7a", flash: "#47ff8c" },
  { name: "violet", css: "#c44dff", flash: "#cf6bff" }
] as const;
const ROCKET_CSS = "#ffd9a0";

// ---------- static scene ----------
let sc = scene({ background: "#020309" })
  .camera(camera.perspective({ position: [0, 4, 50], target: [0, 18, -45], fov: 50, near: 1, far: 420 }))
  .add(sky.gradient({ zenith: "#01020a", horizon: "#0b1736", exponent: 0.6 }))
  .add(lights.hemisphere({ name: "ambient-glow", skyColor: "#1a2a5a", groundColor: "#05070c", intensity: 0.22 }).runtime({ id: "hemi", mutable: true }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.55, radius: 0.7 }));

// water: dark, glossy, translucent so mirrored sparks show through
sc = sc.add(
  primitives.plane({
    name: "water",
    size: [420, 1, 300],
    material: material.pbr({ color: "#04101e", roughness: 0.12, metallic: 0.0, opacity: 0.72 }),
    castShadow: false,
    receiveShadow: false
  }).position(0, 0, 40)
);
// under-water backing so the translucent surface never shows a void
sc = sc.add(
  primitives.plane({ name: "deep", size: [420, 1, 300], material: material.pbr({ color: "#02060e", roughness: 1 }), castShadow: false }).position(0, -0.6, 40)
);

const dark = material.pbr({ color: "#05070b", roughness: 1 });
const warmWin = material.emissive({ color: "#ffcf80", emissive: "#ffa840", emissiveIntensity: 1.6 });

// land strip + hills
sc = sc.add(primitives.box({ name: "land", size: [420, 3, 120], material: dark, castShadow: false }).position(0, 1.5, SHORE_Z - 60));
const hills: AuraTransformSpec[] = [];
for (let i = 0; i < 7; i += 1) {
  const x = -150 + i * 50 + (srand() - 0.5) * 20;
  hills.push({ position: [x, 3, -125], scale: [80 + srand() * 40, 14 + srand() * 14, 36] });
}
sc = sc.add(instances.sphere({ name: "hills", transforms: hills, material: dark, castShadow: false }));

// small buildings on the shore
const bodies: AuraTransformSpec[] = [];
const roofs: AuraTransformSpec[] = [];
const windows: AuraTransformSpec[] = [];
{
  let x = -70;
  while (x < 70) {
    const w = 3 + srand() * 3.5;
    const h = 2.5 + srand() * 4.5;
    const z = SHORE_Z - 4 - srand() * 6;
    if (Math.abs(x) > 6 || srand() < 0.5) {
      bodies.push({ position: [x, 3 + h / 2, z], scale: [w, h, w] });
      if (srand() < 0.7) {
        const rh = 1.5 + srand() * 1.5;
        roofs.push({ position: [x, 3 + h + rh / 2, z], rotation: [0, Math.PI / 4, 0], scale: [w * 1.42, rh, w * 1.42] });
      }
      if (srand() < 0.6) windows.push({ position: [x + (srand() - 0.5) * w * 0.5, 3 + h * (0.35 + srand() * 0.35), z + w / 2 + 0.02], scale: [0.55, 0.7, 0.05] });
    }
    x += w + 1 + srand() * 7;
  }
}
sc = sc
  .add(instances.box({ name: "bldg", transforms: bodies, material: dark, castShadow: false }))
  .add(instances.cone({ name: "roofs", transforms: roofs, material: dark, params: { radialSegments: 4 }, castShadow: false }))
  .add(instances.box({ name: "bldg-windows", transforms: windows, material: warmWin, castShadow: false }));

// pier with posts and a lamp
{
  const posts: AuraTransformSpec[] = [];
  for (let i = 0; i < 7; i += 1) {
    posts.push({ position: [20.9, 0, SHORE_Z + 3 + i * 3.4], scale: [0.35, 3, 0.35] });
    posts.push({ position: [24.1, 0, SHORE_Z + 3 + i * 3.4], scale: [0.35, 3, 0.35] });
  }
  sc = sc
    .add(primitives.box({ name: "pier", size: [3.8, 0.35, 24], material: dark, castShadow: false }).position(22.5, 1.1, SHORE_Z + 11.5))
    .add(instances.cylinder({ name: "pier-posts", transforms: posts, material: dark, params: { radialSegments: 6 }, castShadow: false }))
    .add(primitives.sphere({ name: "pier-lamp", size: 0.55, material: warmWin }).position(22.5, 2.6, SHORE_Z + 22.5))
    .add(primitives.cylinder({ name: "pier-lamp-pole", size: [0.14, 1.6, 0.14], material: dark }).position(22.5, 1.9, SHORE_Z + 22.5));
}

// boats
{
  const hulls: AuraTransformSpec[] = [];
  const masts: AuraTransformSpec[] = [];
  const cabins: AuraTransformSpec[] = [];
  const spots: Array<[number, number, number, number]> = [
    [-26, -30, 0.3, 1.0], [-14, -22, -0.2, 0.8], [-38, -36, 0.1, 1.2], [8, -33, 0.5, 0.9], [-4, -16, -0.4, 0.7], [34, -26, 0.2, 1.0]
  ];
  for (const [x, z, yaw, s] of spots) {
    hulls.push({ position: [x, 0.15, z], rotation: [0, yaw, 0], scale: [5.5 * s, 1.2 * s, 1.9 * s] });
    cabins.push({ position: [x - Math.cos(yaw) * 0.8 * s, 1.1 * s, z + Math.sin(yaw) * 0.8 * s], rotation: [0, yaw, 0], scale: [1.8 * s, 1.1 * s, 1.3 * s] });
    masts.push({ position: [x + Math.cos(yaw) * 0.9 * s, 3 * s, z - Math.sin(yaw) * 0.9 * s], scale: [0.14 * s, 5.2 * s, 0.14 * s] });
  }
  sc = sc
    .add(instances.box({ name: "hulls", transforms: hulls, material: dark, castShadow: false }))
    .add(instances.box({ name: "cabins", transforms: cabins, material: dark, castShadow: false }))
    .add(instances.cylinder({ name: "masts", transforms: masts, material: dark, params: { radialSegments: 5 }, castShadow: false }));
}

// stars: tiny emissive spheres on a far dome in front of the camera
{
  const stars: AuraTransformSpec[] = [];
  const camPos: V3 = [0, 4, 50];
  for (let i = 0; i < 520; i += 1) {
    const az = (srand() - 0.5) * 2.3; // radians from -z axis
    const el = (0.1 + srand() * 0.95) * 0.9;
    const R = 300;
    const s = 0.35 + Math.pow(srand(), 3) * 1.0;
    stars.push({
      position: [camPos[0] + Math.sin(az) * Math.cos(el) * R, camPos[1] + Math.sin(el) * R, camPos[2] - Math.cos(az) * Math.cos(el) * R],
      scale: [s * 1.6, s * 1.6, s * 1.6]
    });
  }
  sc = sc.add(
    instances.sphere({
      name: "stars",
      transforms: stars,
      material: material.emissive({ color: "#dfe8ff", emissive: "#cfdcff", emissiveIntensity: 3 }),
      params: { widthSegments: 4, heightSegments: 3 },
      castShadow: false
    })
  );
}

// ---------- spark pools (one instanced emissive node per colour, plus a mirrored reflection node) ----------
const CAP = 1100;
const PARK: AuraTransformSpec = { position: [0, -200, 0], scale: [0.001, 0.001, 0.001] };
const ANCHOR_A: AuraTransformSpec = { position: [-110, 90, -170], scale: [0.001, 0.001, 0.001] };
const ANCHOR_B: AuraTransformSpec = { position: [110, -40, 60], scale: [0.001, 0.001, 0.001] };
const initial = (): AuraTransformSpec[] => Array.from({ length: CAP }, (_, i) => (i === 0 ? ANCHOR_A : i === 1 ? ANCHOR_B : PARK));

interface Spark {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size: number;
  trail: number; drag: number;
}
interface Pool {
  id: string;
  sparks: Spark[];
  main: AuraTransformSpec[];
  mirror: AuraTransformSpec[];
  dirty: boolean;
}

const pools: Pool[] = [];
const makePool = (id: string, css: string, intensity: number): Pool => {
  const mat = material.emissive({ color: css, emissive: css, emissiveIntensity: intensity });
  const mirrorMat = material.emissive({ color: css, emissive: css, emissiveIntensity: intensity * 0.8 });
  const params = { widthSegments: 6, heightSegments: 4 };
  sc = sc
    .add(instances.sphere({ name: `sp-${id}`, transforms: initial(), material: mat, params, castShadow: false, receiveShadow: false }).runtime({ id: `sp-${id}`, mutable: true }))
    .add(instances.sphere({ name: `rf-${id}`, transforms: initial(), material: mirrorMat, params, castShadow: false, receiveShadow: false }).runtime({ id: `rf-${id}`, mutable: true }));
  const pool: Pool = { id, sparks: [], main: [], mirror: [], dirty: true };
  pools.push(pool);
  return pool;
};
const colorPools = SPARK_COLORS.map((c) => makePool(c.name, c.css, 5));
const rocketPool = makePool("rocket", ROCKET_CSS, 4);

// burst glow: translucent emissive sphere per colour that blooms the surrounding sky
const flashes = SPARK_COLORS.map((c, i) => {
  const id = `flash-${i}`;
  sc = sc.add(
    instances.sphere({
      name: id,
      transforms: [PARK, ANCHOR_A, ANCHOR_B],
      material: material.emissive({ color: c.flash, emissive: c.flash, emissiveIntensity: 1.2, opacity: 0.09 }),
      castShadow: false,
      receiveShadow: false
    }).runtime({ id, mutable: true })
  );
  return { id, active: false, age: 0, x: 0, y: 0, z: 0, size: 30 };
});

// burst point lights (light the water, shoreline and boats)
const LIGHTS = 4;
const burstLights = Array.from({ length: LIGHTS }, (_, i) => {
  const id = `blight-${i}`;
  sc = sc.add(
    lights.point({ name: id, position: [0, 30, -45], intensity: 0, color: "#ffffff", distance: 220, decay: 1, shadow: false }).runtime({ id, mutable: true })
  );
  return { id, age: 99, color: "#ffffff" };
});
let lightCursor = 0;

// ---------- simulation state ----------
interface Rocket {
  x0: number; z0: number; drift: number; H: number; T: number; age: number;
  colorIndex: number; streak: boolean; size: number;
}
const rockets: Rocket[] = [];
let bursts = 0;
let launchTimer = 0.4;
let bag: number[] = [];
const nextColor = (): number => {
  if (bag.length === 0) {
    bag = SPARK_COLORS.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(srand() * (i + 1));
      const t = bag[i]!;
      bag[i] = bag[j]!;
      bag[j] = t;
    }
  }
  return bag.pop()!;
};

const launch = (): void => {
  rockets.push({
    x0: -34 + srand() * 68,
    z0: SHORE_Z - 1 - srand() * 4,
    drift: (srand() - 0.5) * 10,
    H: 30 + srand() * 14,
    T: 1.1 + srand() * 0.5,
    age: 0,
    colorIndex: nextColor(),
    streak: srand() < 0.45,
    size: 0.85 + srand() * 0.35
  });
};

const explode = (r: Rocket, x: number, y: number, z: number): void => {
  const pool = colorPools[r.colorIndex]!;
  const count = r.streak ? 85 : 130;
  const base = (15 + srand() * 7) * r.size;
  for (let i = 0; i < count; i += 1) {
    const u = srand() * 2 - 1;
    const phi = srand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const sp = base * (0.93 + srand() * 0.07);
    pool.sparks.push({
      x, y, z,
      vx: s * Math.cos(phi) * sp,
      vy: u * sp,
      vz: s * Math.sin(phi) * sp,
      age: 0,
      life: (r.streak ? 2.2 : 1.6) + srand() * 0.7,
      size: 0.55 + srand() * 0.25,
      trail: r.streak ? 4 : 0,
      drag: r.streak ? 1.25 : 1.5
    });
  }
  bursts += 1;
  const slot = lightCursor % LIGHTS;
  lightCursor += 1;
  const L = burstLights[slot]!;
  L.age = 0;
  L.color = SPARK_COLORS[r.colorIndex]!.flash;
  lightPos[slot] = [x, y, z];
  const fl = flashes[r.colorIndex]!;
  fl.active = true; fl.age = 0; fl.x = x; fl.y = y; fl.z = z; fl.size = 30 * r.size;
};
const lightPos: V3[] = Array.from({ length: LIGHTS }, () => [0, 30, -45] as V3);

// ---------- app ----------
window.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };
const app = createAuraApp("#app", { scene: sc });

const emit = (pool: Pool, x: number, y: number, z: number, s: number, t: number): void => {
  if (pool.main.length >= CAP) return;
  pool.main.push({ position: [x, y, z], scale: [s, s, s] });
  if (y > 0.2) {
    const wob = Math.sin(t * 5 + y * 0.7 + x * 0.3) * 0.25 + Math.sin(t * 9.3 + y * 1.3) * 0.12;
    pool.mirror.push({ position: [x + wob, -y, z], scale: [s * 0.85, s * 0.35, s * 0.85] });
  } else {
    pool.mirror.push(PARK);
  }
};

const rocketPos = (r: Rocket, age: number): V3 => {
  const p = Math.min(Math.max(age / r.T, 0), 1);
  return [r.x0 + r.drift * p, 3 + r.H * (1 - (1 - p) * (1 - p)), r.z0];
};

let time = 0;
app.onFrame((f: { dt: number }) => {
  const dt = Math.min(f.dt, 0.05);
  time += dt;

  // launches at irregular intervals
  launchTimer -= dt;
  if (launchTimer <= 0) {
    launch();
    if (srand() < 0.18) launch();
    launchTimer = 0.35 + Math.pow(srand(), 1.6) * 1.9;
  }

  for (const p of pools) { p.main = [ANCHOR_A, ANCHOR_B]; p.mirror = [ANCHOR_A, ANCHOR_B]; }

  // rockets
  for (let i = rockets.length - 1; i >= 0; i -= 1) {
    const r = rockets[i]!;
    r.age += dt;
    const [x, y, z] = rocketPos(r, r.age);
    if (r.age >= r.T) {
      explode(r, x, y, z);
      rockets.splice(i, 1);
      continue;
    }
    emit(rocketPool, x, y, z, 0.9, time);
    for (let j = 1; j <= 9; j += 1) {
      const [gx, gy, gz] = rocketPos(r, r.age - j * 0.035);
      emit(rocketPool, gx, gy, gz, 0.75 * (1 - j / 10), time);
    }
    // falling embers
    for (let k = 0; k < 2; k += 1) {
      rocketPool.sparks.push({
        x, y, z, vx: (srand() - 0.5) * 3, vy: -2 - srand() * 3, vz: (srand() - 0.5) * 3,
        age: 0, life: 0.35 + srand() * 0.4, size: 0.3 + srand() * 0.2, trail: 0, drag: 1
      });
    }
  }

  // sparks
  let active = 0;
  const all = [...colorPools, rocketPool];
  for (const pool of all) {
    const isRocket = pool === rocketPool;
    const list = pool.sparks;
    let w = 0;
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i]!;
      s.age += dt;
      if (s.age >= s.life) continue;
      const k = Math.exp(-s.drag * dt);
      s.vx *= k; s.vz *= k; s.vy = s.vy * k - G * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.y < 0.25) continue;
      list[w] = s; w += 1;
      if (!isRocket) active += 1;
      const t = s.age / s.life;
      let size = s.size * Math.pow(1 - t, 0.6) * (s.age < 0.08 ? 1.5 : 1);
      if (t > 0.65 && srand() < 0.22) size *= 0.3; // twinkle as it dies
      emit(pool, s.x, s.y, s.z, size, time);
      for (let j = 1; j <= s.trail; j += 1) {
        const lag = 0.05 * j;
        emit(pool, s.x - s.vx * lag, s.y - s.vy * lag - 0.5 * G * lag * lag, s.z - s.vz * lag, size * (1 - j / (s.trail + 1)) * 0.85, time);
      }
    }
    list.length = w;
  }

  // write instance buffers
  for (const pool of all) {
    const used = pool.main.length;
    if (used <= 2 && !pool.dirty) continue;
    pool.dirty = used > 2;
    while (pool.main.length < CAP) pool.main.push(PARK);
    while (pool.mirror.length < CAP) pool.mirror.push(PARK);
    app.nodes.require(`sp-${pool.id}`).setInstances?.(pool.main);
    app.nodes.require(`rf-${pool.id}`).setInstances?.(pool.mirror);
  }

  // burst lights and sky glow
  let glow = 0;
  let gr = 0, gg = 0, gb = 0;
  for (let i = 0; i < LIGHTS; i += 1) {
    const L = burstLights[i]!;
    L.age += dt;
    const e = Math.pow(Math.max(0, 1 - L.age / 2.0), 2) * (L.age < 0.08 ? L.age / 0.08 : 1);
    const node = app.nodes.require(L.id);
    const pos = lightPos[i]!;
    node.setPosition(pos[0], pos[1], pos[2]);
    node.setLight?.({ intensity: 70 * e, color: L.color });
    glow += e;
    const c = hexToRgb(L.color);
    gr += c[0] * e; gg += c[1] * e; gb += c[2] * e;
  }
  const norm = Math.max(glow, 1e-4);
  const hemiColor = `rgb(${Math.round((gr / norm) * 255)}, ${Math.round((gg / norm) * 255)}, ${Math.round((gb / norm) * 255)})`;
  app.nodes.require("hemi").setLight?.({ intensity: 0.22 + Math.min(glow, 1.5) * 0.35, color: glow > 0.02 ? hemiColor : "#1a2a5a" });

  for (const fl of flashes) {
    const node = app.nodes.require(fl.id);
    if (!fl.active) continue;
    fl.age += dt;
    const t = fl.age;
    if (t > 0.5) {
      fl.active = false;
      node.setInstances?.([PARK, ANCHOR_A, ANCHOR_B]);
      continue;
    }
    const s = Math.max(0.001, (4 + (fl.size - 4) * (1 - Math.exp(-t * 7))) * Math.pow(Math.max(0, 1 - t / 0.5), 0.7));
    node.setInstances?.([{ position: [fl.x, fl.y, fl.z], scale: [s, s, s] }, ANCHOR_A, ANCHOR_B]);
  }

  window.__TASK_STATE__ = { bursts, activeParticles: active };
});

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

await app.ready();
window.__EVAL_READY__ = true;
