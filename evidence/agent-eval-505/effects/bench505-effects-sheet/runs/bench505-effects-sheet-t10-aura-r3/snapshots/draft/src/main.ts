import {
  camera, createAuraApp, effects, instances, lights, material, primitives, scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { bursts: number; activeParticles: number };
  }
}

// ---------- seeded random ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- spark colour pools ----------
const POOLS = [
  { name: "gold", hex: "#ffb02e" },
  { name: "red", hex: "#ff2430" },
  { name: "blue", hex: "#3d7dff" },
  { name: "green", hex: "#38ff80" },
  { name: "white", hex: "#fff1d8" },
  { name: "violet", hex: "#c24dff" }
] as const;
const GOLD = 0, WHITE = 4;
const CAP = 2600;
const MAXP = 7000;

// ---------- static scenery ----------
const SHORE_TOP = 2.5;
const boxes: AuraTransformSpec[] = [];
const roofs: AuraTransformSpec[] = [];
const posts: AuraTransformSpec[] = [];
const windows: AuraTransformSpec[] = [];

// buildings on the shore: x, width, height, depth, z
const buildings: Array<[number, number, number, number, number]> = [
  [-78, 9, 6, 7, -92], [-66, 7, 9, 6, -95], [-55, 10, 5, 7, -90], [-30, 6, 7, 6, -93],
  [-18, 12, 4.5, 8, -91], [22, 8, 6.5, 7, -92], [34, 6, 10, 6, -96], [46, 11, 5, 7, -90],
  [62, 8, 7.5, 7, -94], [76, 9, 5.5, 7, -91]
];
for (const [x, w, h, d, z] of buildings) {
  boxes.push({ position: [x, SHORE_TOP + h / 2, z], scale: [w, h, d] });
  roofs.push({ position: [x, SHORE_TOP + h + 1.6, z], rotation: [0, Math.PI / 4, 0], scale: [w * 1.45, 3.2, d * 1.45] });
  const cols = Math.max(1, Math.floor(w / 3)), rows = Math.max(1, Math.floor(h / 3.2));
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (rand() < 0.45) continue;
    windows.push({
      position: [x + (c - (cols - 1) / 2) * 2.6, SHORE_TOP + 2 + r * 3, z + d / 2 + 0.05],
      scale: [0.8, 0.9, 0.1]
    });
  }
}
// low hills and a harbour wall behind the buildings
for (const [x, w, h] of [[-60, 90, 7], [10, 120, 9], [80, 80, 6]] as const) {
  boxes.push({ position: [x, SHORE_TOP + h / 2 - 1, -118], scale: [w, h, 16] });
}
boxes.push({ position: [0, SHORE_TOP - 0.3, -82.5], scale: [500, 0.8, 1.2] });
// pier with posts
boxes.push({ position: [-38, 1.3, -62], scale: [4, 0.5, 40] });
for (let i = 0; i < 9; i += 1) {
  for (const sx of [-1.7, 1.7]) posts.push({ position: [-38 + sx, 0.4, -80 + i * 4.5], scale: [0.35, 2.2, 0.35] });
}
boxes.push({ position: [-38, 2.3, -43], scale: [2.4, 2, 2.4] }); // pier hut
roofs.push({ position: [-38, 4.2, -43], rotation: [0, Math.PI / 4, 0], scale: [3.9, 1.8, 3.9] });
// boats: hull, cabin, mast
const boats: Array<[number, number, number]> = [[26, -58, 0.2], [44, -48, -0.15], [-8, -66, 0.1], [-62, -52, -0.25], [64, -68, 0.3]];
for (const [x, z, yaw] of boats) {
  boxes.push({ position: [x, 0.35, z], rotation: [0, yaw, 0], scale: [8, 1.5, 2.6] });
  boxes.push({ position: [x - 1.2, 1.9, z], rotation: [0, yaw, 0], scale: [2.6, 1.3, 1.8] });
  posts.push({ position: [x + 1.6, 3.5, z], rotation: [0, yaw, 0], scale: [0.18, 6, 0.18] });
}

const silhouette = material.pbr({ color: "#04060a", roughness: 0.95, metallic: 0 });
const warm = material.emissive({ color: "#ffc070", emissive: "#ffa640", emissiveIntensity: 2.2 });

// stars on a far dome
const stars: AuraTransformSpec[] = [];
for (let i = 0; i < 520; i += 1) {
  const az = range(-0.95, 0.95), el = range(0.1, 1.15), R = 320;
  const s = 0.7 + Math.pow(rand(), 3) * 1.6;
  stars.push({
    position: [Math.sin(az) * Math.cos(el) * R, 4 + Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R - 60],
    scale: [s, s, s]
  });
}

// pre-spread initial instances so spark nodes start with sky-sized bounds
const initial = (mirror: boolean): AuraTransformSpec[] =>
  Array.from({ length: CAP }, (_, i) => ({
    position: [((i % 50) - 25) * 3, (mirror ? -1 : 1) * (5 + (i % 13) * 4), -80] as [number, number, number],
    scale: [0.001, 0.001, 0.001] as [number, number, number]
  }));

let sc = scene({ background: "#010208" })
  .camera(camera.perspective({ position: [0, 5, 58], target: [0, 24, -80], fov: 50, near: 1, far: 700 }))
  .add(lights.hemisphere({ skyColor: "#1a2650", groundColor: "#04060b", intensity: 0.22 }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.65, radius: 0.7 }))
  .add(primitives.plane({
    name: "water", size: [600, 1, 175],
    material: material.pbr({ color: "#06131e", metallic: 0.2, roughness: 0.14, opacity: 0.6 }),
    castShadow: false
  }).position(0, 0, -3))
  .add(primitives.box({ name: "shore", size: [520, 5, 62], material: silhouette }).position(0, 0, -113))
  .add(instances.box({ name: "sil-boxes", transforms: boxes, material: silhouette }))
  .add(instances.cone({ name: "sil-roofs", transforms: roofs, material: silhouette, params: { radialSegments: 4 } }))
  .add(instances.cylinder({ name: "sil-posts", transforms: posts, material: silhouette, params: { radialSegments: 6 } }))
  .add(instances.box({ name: "windows", transforms: windows, material: warm }))
  .add(instances.sphere({
    name: "stars", transforms: stars, params: { widthSegments: 5, heightSegments: 3 },
    material: material.emissive({ color: "#cfdcff", emissive: "#bcd0ff", emissiveIntensity: 2.6 })
  }));

for (let k = 0; k < POOLS.length; k += 1) {
  const hex = POOLS[k]!.hex;
  sc = sc
    .add(instances.sphere({
      name: `spark-${k}`, transforms: initial(false), params: { widthSegments: 6, heightSegments: 4 },
      material: material.emissive({ color: hex, emissive: hex, emissiveIntensity: 4 })
    }).runtime({ id: `spark-${k}`, mutable: true }))
    .add(instances.sphere({
      name: `refl-${k}`, transforms: initial(true), params: { widthSegments: 5, heightSegments: 3 },
      material: material.emissive({ color: hex, emissive: hex, emissiveIntensity: 5 })
    }).runtime({ id: `refl-${k}`, mutable: true }));
}

// four reusable burst lights that light the water, shore and boats
const NLIGHTS = 4;
for (let i = 0; i < NLIGHTS; i += 1) {
  sc = sc.add(lights.point({
    name: `burst-light-${i}`, position: [0, 40, -80], intensity: 0, color: "#ffffff",
    distance: 220, decay: 2, shadow: false
  }).runtime({ id: `burst-light-${i}`, mutable: true }));
}

// ---------- particle simulation ----------
const X = new Float32Array(MAXP), Y = new Float32Array(MAXP), Z = new Float32Array(MAXP);
const VX = new Float32Array(MAXP), VY = new Float32Array(MAXP), VZ = new Float32Array(MAXP);
const AGE = new Float32Array(MAXP), LIFE = new Float32Array(MAXP), SIZE = new Float32Array(MAXP);
const DRAG = new Float32Array(MAXP), GRAV = new Float32Array(MAXP);
const TRAIL = new Float32Array(MAXP), TRAILT = new Float32Array(MAXP);
const POOL = new Uint8Array(MAXP), ALIVE = new Uint8Array(MAXP), SPARK = new Uint8Array(MAXP);
let cursor = 0, active = 0, bursts = 0;

const spawn = (
  pool: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
  life: number, size: number, drag: number, grav: number, trail: number, spark: number
): void => {
  for (let n = 0; n < MAXP; n += 1) {
    const i = (cursor + n) % MAXP;
    if (ALIVE[i]) continue;
    cursor = (i + 1) % MAXP;
    ALIVE[i] = 1; active += 1;
    POOL[i] = pool; SPARK[i] = spark;
    X[i] = x; Y[i] = y; Z[i] = z; VX[i] = vx; VY[i] = vy; VZ[i] = vz;
    AGE[i] = 0; LIFE[i] = life; SIZE[i] = size; DRAG[i] = drag; GRAV[i] = grav;
    TRAIL[i] = trail; TRAILT[i] = rand() * trail;
    return;
  }
};

const lightPeak = new Float32Array(NLIGHTS), lightAge = new Float32Array(NLIGHTS).fill(99);
let lightCursor = 0;

const explode = (x: number, y: number, z: number, pool: number, alt: number, streak: boolean): void => {
  bursts += 1;
  const n = Math.floor(range(120, 170));
  const speed = range(22, 30), willow = streak && rand() < 0.5;
  for (let i = 0; i < n; i += 1) {
    const cz = rand() * 2 - 1, phi = rand() * Math.PI * 2, r = Math.sqrt(1 - cz * cz);
    const inner = alt >= 0 && i % 3 === 0;
    const sp = speed * (inner ? 0.55 : 1) * range(0.93, 1);
    spawn(
      inner ? alt : pool, x, y, z, Math.cos(phi) * r * sp, cz * sp, Math.sin(phi) * r * sp,
      willow ? range(2.0, 2.6) : range(1.5, 2.3), range(1.0, 1.4), willow ? 1.5 : 1.35, willow ? -4.5 : -7,
      streak && i % 2 === 0 ? 0.045 : 0, 1
    );
  }
  spawn(WHITE, x, y, z, 0, 0, 0, 0.2, 9, 0, 0, 0, 0); // flash
  const li = lightCursor; lightCursor = (lightCursor + 1) % NLIGHTS;
  lightPeak[li] = 1700; lightAge[li] = 0;
  const node = app.nodes.require(`burst-light-${li}`);
  node.setPosition(x, y - 4, z + 20);
  node.setLight?.({ color: POOLS[pool]!.hex, intensity: lightPeak[li]! });
};

interface Rocket { x0: number; xb: number; yb: number; z0: number; zb: number; t: number; dur: number; pool: number; alt: number; streak: boolean }
const rockets: Rocket[] = [];
let bag: number[] = [];
let launched = 0;
const nextPool = (): number => {
  if (launched < 3) return [GOLD, 1, 2][launched]!;
  if (bag.length === 0) {
    bag = [0, 1, 2, 3, 5, 0, 1, 2, 3, 4];
    for (let i = bag.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j]!, bag[i]!]; }
  }
  return bag.pop()!;
};
const launch = (): void => {
  const pool = nextPool();
  let alt = -1;
  if (launched >= 3 && rand() < 0.35) { alt = Math.floor(rand() * POOLS.length); if (alt === pool) alt = -1; }
  const x0 = range(-45, 45), z0 = range(-86, -80);
  rockets.push({
    x0, z0, xb: x0 + range(-10, 10), zb: range(-100, -66), yb: range(38, 62),
    t: 0, dur: range(0.9, 1.3), pool, alt, streak: launched === 1 || rand() < 0.5
  });
  launched += 1;
};

// ---------- app ----------
const app = createAuraApp("#app", { scene: sc });

const mats = POOLS.map(() => new Float32Array(CAP * 16));
const rmats = POOLS.map(() => new Float32Array(CAP * 16));
const counts = new Int32Array(POOLS.length);

let timeToLaunch = 0.25;
let clock = 0;
let firstFrame = true;

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  clock += dt;

  // launches at irregular intervals
  timeToLaunch -= dt;
  if (timeToLaunch <= 0) {
    launch();
    if (rand() < 0.2) launch();
    timeToLaunch = rand() < 0.2 ? range(0.2, 0.5) : range(0.7, 2.2);
  }

  // rockets
  for (let i = rockets.length - 1; i >= 0; i -= 1) {
    const r = rockets[i]!;
    r.t += dt;
    const u = Math.min(1, r.t / r.dur), e = 1 - (1 - u) * (1 - u);
    const x = r.x0 + (r.xb - r.x0) * e, y = 3 + (r.yb - 3) * e, z = r.z0 + (r.zb - r.z0) * e;
    spawn(WHITE, x, y, z, 0, 0, 0, 0.07, 1.5, 0, 0, 0, 0);
    for (let k = 0; k < 3; k += 1) {
      spawn(GOLD, x + range(-0.2, 0.2), y - k * 0.5, z, range(-1.5, 1.5), range(-6, -2), range(-1.5, 1.5), range(0.4, 0.8), range(0.6, 0.9), 0.5, -2, 0, 0);
    }
    if (u >= 1) {
      explode(x, y, z, r.pool, r.alt, r.streak);
      rockets.splice(i, 1);
    }
  }

  // particles
  counts.fill(0);
  for (let i = 0; i < MAXP; i += 1) {
    if (!ALIVE[i]) continue;
    const age = AGE[i]! + dt;
    if (age >= LIFE[i]!) { ALIVE[i] = 0; active -= 1; continue; }
    AGE[i] = age;
    const f2 = Math.exp(-DRAG[i]! * dt);
    VX[i] = VX[i]! * f2; VZ[i] = VZ[i]! * f2;
    VY[i] = VY[i]! * f2 + GRAV[i]! * dt;
    X[i] = X[i]! + VX[i]! * dt; Y[i] = Y[i]! + VY[i]! * dt; Z[i] = Z[i]! + VZ[i]! * dt;
    const y = Y[i]!;
    if (SPARK[i] && y < 0.2) { ALIVE[i] = 0; active -= 1; continue; }

    const trail = TRAIL[i]!;
    if (trail > 0) {
      TRAILT[i] = TRAILT[i]! - dt;
      if (TRAILT[i]! <= 0) {
        TRAILT[i] = trail;
        spawn(POOL[i]!, X[i]!, y, Z[i]!, 0, 0, 0, range(0.45, 0.75), SIZE[i]! * 0.6, 0, -1.5, 0, 0);
      }
    }

    const t = age / LIFE[i]!;
    let s = SIZE[i]! * Math.pow(1 - t, 0.7);
    if (SPARK[i] && t > 0.55) s *= 0.7 + 0.3 * Math.sin(age * 55 + i * 1.7);
    const p = POOL[i]!;
    const c = counts[p]!;
    if (c >= CAP) continue;
    counts[p] = c + 1;
    let o = c * 16;
    const m = mats[p]!;
    m[o] = s; m[o + 5] = s; m[o + 10] = s; m[o + 12] = X[i]!; m[o + 13] = y; m[o + 14] = Z[i]!; m[o + 15] = 1;
    const rm = rmats[p]!;
    const wob = 1 + 0.35 * Math.sin(clock * 9 + i * 0.9);
    o = c * 16;
    rm[o] = s * 1.5 * wob; rm[o + 5] = s * 0.7; rm[o + 10] = s;
    rm[o + 12] = X[i]! + Math.sin(clock * 3 + i) * 0.4; rm[o + 13] = -y * 0.9; rm[o + 14] = Z[i]!; rm[o + 15] = 1;
  }

  for (let k = 0; k < POOLS.length; k += 1) {
    const n = counts[k]!;
    if (n === 0) {
      // keep one invisible instance so the node always has a valid draw
      const m = mats[k]!, rm = rmats[k]!;
      m.fill(0, 0, 16); rm.fill(0, 0, 16);
      m[15] = 1; rm[15] = 1;
      app.nodes.require(`spark-${k}`).setInstanceMatrices(m, 1);
      app.nodes.require(`refl-${k}`).setInstanceMatrices(rm, 1);
    } else {
      app.nodes.require(`spark-${k}`).setInstanceMatrices(mats[k]!, n);
      app.nodes.require(`refl-${k}`).setInstanceMatrices(rmats[k]!, n);
    }
  }

  // burst lights decay
  for (let i = 0; i < NLIGHTS; i += 1) {
    if (lightAge[i]! > 6) continue;
    lightAge[i] = lightAge[i]! + dt;
    const v = lightPeak[i]! * Math.exp(-lightAge[i]! * 1.7);
    app.nodes.require(`burst-light-${i}`).setLight?.({ intensity: v < 1 ? 0 : v });
  }

  window.__TASK_STATE__ = { bursts, activeParticles: active };
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
});

window.__TASK_STATE__ = { bursts: 0, activeParticles: 0 };
void app.ready().then(() => {
  for (let k = 0; k < POOLS.length; k += 1) {
    app.nodes.require(`spark-${k}`).frustumCulled = false;
    app.nodes.require(`refl-${k}`).frustumCulled = false;
  }
  window.__EVAL_READY__ = true;
});
