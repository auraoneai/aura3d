import { camera, createAuraApp, effects, geometry, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------- helpers ----------
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const hash2 = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash2(ix, iy), hash2(ix + 1, iy), fx), mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
};
const fbm = (x: number, y: number, oct: number): number => {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i += 1) {
    s += vnoise(x * f, y * f) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
};
let seed = 90210;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- world shape ----------
const trailX = (z: number): number => 7 * Math.sin(z * 0.045) + 3 * Math.sin(z * 0.11 + 1);
const trailDX = (z: number): number => 7 * 0.045 * Math.cos(z * 0.045) + 3 * 0.11 * Math.cos(z * 0.11 + 1);
const trailY = (z: number): number => -z * 0.18;

const CAB_Z = -52;
const CAB_X = trailX(CAB_Z) + 9;

const baseHeight = (x: number, z: number): number => {
  const dx = x - trailX(z), ad = Math.abs(dx);
  let h = trailY(z) + 0.5 * (Math.sqrt(dx * dx + 9) - 3);
  const n1 = fbm(x * 0.035 + 10, z * 0.035, 4);
  h += (n1 - 0.5) * 2 * (ad / (ad + 8)) * (4 + ad * 0.12);
  const rg = 1 - Math.abs(2 * fbm(x * 0.022 + 50, z * 0.022 + 20, 3) - 1);
  h += rg * rg * smoothstep(25, 90, ad) * 55;
  h += Math.pow(Math.max(0, -z - 170), 1.25) * 0.12;
  return h;
};
const CAB_Y = baseHeight(CAB_X, CAB_Z);
const height = (x: number, z: number): number => {
  const h = baseHeight(x, z);
  const d = Math.hypot(x - CAB_X, z - CAB_Z);
  const w = 1 - smoothstep(4.5, 8, d);
  return mix(h, CAB_Y, w);
};

// ---------- terrain mesh ----------
const NU = 140, NZ = 150, Z_START = 24, Z_END = -300, U_MAX = 150;
const vertCount = (NU + 1) * (NZ + 1);
const tPos = new Float32Array(vertCount * 3);
const tNor = new Float32Array(vertCount * 3);
const tCol = new Float32Array(vertCount * 4);
const tIdx: number[] = [];
let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
const rockRGB: V3 = [0.2, 0.21, 0.24];
for (let j = 0; j <= NZ; j += 1) {
  const z = Z_START + ((Z_END - Z_START) * j) / NZ;
  for (let i = 0; i <= NU; i += 1) {
    const s = (i / NU) * 2 - 1;
    const u = Math.sign(s) * Math.pow(Math.abs(s), 1.6) * U_MAX;
    const x = trailX(z) + u;
    const y = height(x, z);
    const e = 0.6;
    const nx = height(x - e, z) - height(x + e, z);
    const nz = height(x, z - e) - height(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    const ny = (2 * e) / l;
    const v = j * (NU + 1) + i;
    tPos.set([x, y, z], v * 3);
    tNor.set([nx / l, ny, nz / l], v * 3);
    // colour: white snow, blue-grey in steep or shaded places, dark rock on steep/noisy spots
    const ad = Math.abs(u);
    const shade = clamp((1 - ny) * 2.4 + (fbm(x * 0.07, z * 0.07, 3) - 0.5) * 0.5, 0, 1);
    const snow: V3 = [mix(0.95, 0.62, shade), mix(0.97, 0.70, shade), mix(1.0, 0.8, shade)];
    let rock = clamp((0.85 - ny) / 0.13, 0, 1);
    rock = Math.max(rock, smoothstep(0.66, 0.78, fbm(x * 0.12 + 5, z * 0.12 - 9, 3)) * smoothstep(12, 28, ad) * 0.9);
    const grain = 0.75 + 0.5 * vnoise(x * 0.9, z * 0.9);
    const trail = 1 - smoothstep(1.1, 2.1, ad);
    const base: V3 = [mix(snow[0], rockRGB[0] * grain, rock), mix(snow[1], rockRGB[1] * grain, rock), mix(snow[2], rockRGB[2] * grain, rock)];
    const tr: V3 = [0.66, 0.7, 0.76];
    tCol.set([mix(base[0], tr[0], trail * 0.85), mix(base[1], tr[1], trail * 0.85), mix(base[2], tr[2], trail * 0.85), 1], v * 4);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    if (i < NU && j < NZ) tIdx.push(v, v + NU + 1, v + 1, v + 1, v + NU + 1, v + NU + 2);
  }
}
const terrainGeo = geometry.define({
  positions: tPos,
  normals: tNor,
  colors: tCol,
  indices: tIdx,
  bounds: { min: [minX, minY, Z_END], max: [maxX, maxY, Z_START] }
});

// ---------- scene ----------
const FOG = "#c8cdd3";
const FOG_BASE = 0.0075;
const DURATION = 64;
const Z_WALK_START = 8, Z_WALK_END = -108;

const eyeAt = (z: number): V3 => [trailX(z), height(trailX(z), z) + 1.7, z];
const lookAt = (z: number): V3 => {
  const zz = z - 14;
  return [trailX(zz), height(trailX(zz), zz) + 2.1, zz];
};

let sc = scene({ background: FOG })
  .camera(camera.perspective({ position: eyeAt(Z_WALK_START), target: lookAt(Z_WALK_START), fov: 55, near: 0.3, far: 700 }))
  .add(lights.hemisphere({ skyColor: "#e4e9ef", groundColor: "#8f9bac", intensity: 1.15 }))
  .add(lights.directional({ position: [-40, 90, 30], target: [0, 0, -30], intensity: 0.9, color: "#f2f5fa" }))
  .add(effects.fog({ color: FOG, density: FOG_BASE }))
  .add(geometry.custom(terrainGeo, { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }), castShadow: false }));

// rock outcrops (dark boulders and jagged spires, each with a snow cap)
const rocks: AuraTransformSpec[] = [], rockColors: string[] = [];
const rockCaps: AuraTransformSpec[] = [];
const spires: AuraTransformSpec[] = [], spireColors: string[] = [];
const spireCaps: AuraTransformSpec[] = [];
const farFromCabin = (x: number, z: number): boolean => Math.hypot(x - CAB_X, z - CAB_Z) > 13;
for (let i = 0; i < 320; i += 1) {
  const z = 14 - rand() * 210;
  const side = rand() < 0.5 ? -1 : 1;
  const u = side * (7 + Math.pow(rand(), 1.4) * 80);
  const x = trailX(z) + u;
  if (!farFromCabin(x, z)) continue;
  const y = height(x, z);
  const s = 0.8 + rand() * 2.4;
  const yaw = rand() * 6.28;
  rocks.push({ position: [x, y + s * 0.2, z], rotation: [0, yaw, 0], scale: [s * 1.5, s * 0.95, s * 1.2] });
  rockColors.push(`hsl(${215 + Math.floor(rand() * 20)}, 8%, ${18 + Math.floor(rand() * 16)}%)`);
  rockCaps.push({ position: [x, y + s * 0.56, z], rotation: [0, yaw, 0], scale: [s * 1.25, s * 0.38, s * 1.0] });
}
for (let i = 0; i < 110; i += 1) {
  const z = 10 - rand() * 250;
  const side = rand() < 0.5 ? -1 : 1;
  const u = side * (14 + Math.pow(rand(), 1.2) * 100);
  const x = trailX(z) + u;
  if (!farFromCabin(x, z)) continue;
  const y = height(x, z);
  const s = 1.2 + rand() * 4.5;
  const yaw = rand() * 6.28;
  spires.push({ position: [x, y + s * 1.3, z], rotation: [0, yaw, 0], scale: [s * 2.1, s * 3.5, s * 2.1] });
  spireColors.push(`hsl(${215 + Math.floor(rand() * 20)}, 7%, ${16 + Math.floor(rand() * 14)}%)`);
  spireCaps.push({ position: [x, y + s * 2.6, z], rotation: [0, yaw, 0], scale: [s * 0.95, s * 1.4, s * 0.95] });
}
const whiteMat = material.pbr({ color: "#ffffff", roughness: 0.95 });
sc = sc
  .add(instances.sphere({ name: "boulders", transforms: rocks, colors: rockColors, material: whiteMat }))
  .add(instances.sphere({ name: "boulder-snow", transforms: rockCaps, material: material.pbr({ color: "#f4f8fc", roughness: 0.95 }) }))
  .add(instances.cone({ name: "spires", transforms: spires, colors: spireColors, material: whiteMat, params: { radialSegments: 5 } }))
  .add(instances.cone({ name: "spire-snow", transforms: spireCaps, material: material.pbr({ color: "#f4f8fc", roughness: 0.95 }), params: { radialSegments: 5 } }));

// trail marker poles
const poles: AuraTransformSpec[] = [], poleBars: AuraTransformSpec[] = [], poleCaps: AuraTransformSpec[] = [];
for (let k = 0; k < 18; k += 1) {
  const z = -3 - k * 6.2;
  const x = trailX(z) + 2.0;
  const y = height(x, z);
  const lean = (rand() - 0.5) * 0.08;
  poles.push({ position: [x, y + 1.15, z], rotation: [0, 0, lean], scale: [0.14, 2.5, 0.14] });
  poleBars.push({ position: [x, y + 2.0, z], rotation: [0, 0.3, lean], scale: [0.7, 0.08, 0.09] });
  poleCaps.push({ position: [x, y + 2.42, z], scale: [0.2, 0.09, 0.2] });
}
sc = sc
  .add(instances.cylinder({ name: "poles", transforms: poles, material: material.pbr({ color: "#5e4129", roughness: 0.9 }), params: { radialSegments: 6 } }))
  .add(instances.box({ name: "pole-bars", transforms: poleBars, material: material.pbr({ color: "#6b4a2d", roughness: 0.9 }) }))
  .add(instances.box({ name: "pole-snow", transforms: poleCaps, material: material.pbr({ color: "#f6f9fc", roughness: 0.95 }) }));

// cabin
const wood = material.pbr({ color: "#6e4a2b", roughness: 0.9 });
const darkWood = material.pbr({ color: "#3e2a1a", roughness: 0.9 });
const snowMat = material.pbr({ color: "#f6f9fc", roughness: 0.95 });
const warm = material.emissive({ color: "#ffb04a", emissive: "#ffb04a", emissiveIntensity: 2.6 });
const TILT = 0.38, HALF_SPAN = 2.4, SLAB_LEN = HALF_SPAN / Math.cos(TILT);
const roofSlab = (side: -1 | 1, name: string, mat: typeof snowMat, thick: number, lift: number, lenAdd: number, widthZ: number) => {
  const ridgeY = 3.2;
  const cxl = side * (HALF_SPAN / 2);
  const cyl = ridgeY - (HALF_SPAN / 2) * Math.tan(TILT) - thick / 2;
  // lift along the slab normal
  return primitives
    .box({ name, size: [SLAB_LEN + lenAdd, thick, widthZ], material: mat })
    .position(cxl + side * Math.sin(TILT) * lift, cyl + Math.cos(TILT) * lift, 0)
    .rotate(0, 0, -side * TILT);
};
const cabinKids = [
  primitives.box({ name: "cabin-walls", size: [3.6, 2.4, 5.0], material: wood }).position(0, 1.2, 0),
  primitives.box({ name: "cabin-drift", size: [4.0, 0.5, 5.4], material: snowMat }).position(0, 0.15, 0),
  primitives.box({ name: "cabin-gable-a", size: [2.9, 0.4, 4.9], material: wood }).position(0, 2.55, 0),
  primitives.box({ name: "cabin-gable-b", size: [1.8, 0.4, 4.9], material: wood }).position(0, 2.9, 0),
  roofSlab(-1, "roof-left", darkWood, 0.18, 0, 0.2, 5.7),
  roofSlab(1, "roof-right", darkWood, 0.18, 0, 0.2, 5.7),
  roofSlab(-1, "roof-snow-left", snowMat, 0.26, 0.2, 0.1, 5.8),
  roofSlab(1, "roof-snow-right", snowMat, 0.26, 0.2, 0.1, 5.8),
  primitives.box({ name: "roof-snow-ridge", size: [0.5, 0.2, 5.8], material: snowMat }).position(0, 3.42, 0),
  primitives.box({ name: "chimney", size: [0.55, 1.2, 0.55], material: material.pbr({ color: "#4a4744", roughness: 1 }) }).position(0.7, 3.3, 1.4),
  primitives.box({ name: "chimney-snow", size: [0.7, 0.14, 0.7], material: snowMat }).position(0.7, 3.95, 1.4),
  primitives.box({ name: "cabin-door", size: [0.1, 1.7, 0.9], material: darkWood }).position(-1.82, 0.95, 1.4),
  primitives.box({ name: "cabin-window-frame", size: [0.08, 0.86, 1.06], material: darkWood }).position(-1.82, 1.5, -0.9),
  primitives.box({ name: "cabin-window", size: [0.1, 0.7, 0.9], material: warm }).position(-1.85, 1.5, -0.9),
  primitives.box({ name: "door-step-snow", size: [0.8, 0.2, 1.5], material: snowMat }).position(-2.2, 0.2, 1.4)
];
const CAB_YAW = Math.atan2(-trailDX(CAB_Z), 1);
sc = sc.add(group("cabin", cabinKids, { position: [CAB_X, CAB_Y, CAB_Z], rotation: [0, CAB_YAW, 0] }));
{
  const lx = -3.4, lz = -0.9;
  const wx = CAB_X + lx * Math.cos(CAB_YAW) + lz * Math.sin(CAB_YAW);
  const wz = CAB_Z - lx * Math.sin(CAB_YAW) + lz * Math.cos(CAB_YAW);
  sc = sc.add(lights.point({ name: "cabin-glow", position: [wx, CAB_Y + 1.6, wz], color: "#ff9a3c", intensity: 14, distance: 16 }));
}

// snow flakes: two sizes, wind-driven streaks
const SMALL_MAX = 5200, LARGE_MAX = 1700;
const SMALL_BASE = 2600, LARGE_BASE = 900;
const BOX: V3 = [38, 15, 46];
const OFF: V3 = [-19, -3.2, -40];
type Flake = { p: V3; k: number; th: number };
const makeFlakes = (n: number): Flake[] =>
  Array.from({ length: n }, () => ({ p: [rand() * BOX[0], rand() * BOX[1], rand() * BOX[2]] as V3, k: rand(), th: (rand() - 0.5) * 0.18 }));
const smallFlakes = makeFlakes(SMALL_MAX), largeFlakes = makeFlakes(LARGE_MAX);
const WIND: V3 = [-0.82, -0.46, 0.34];
const STREAK_ANGLE = Math.atan2(-Math.abs(WIND[0]), Math.abs(WIND[1]));
const flakeMat = material.emissive({ color: "#ffffff", emissive: "#f4f7fb", emissiveIntensity: 0.9 });
const initFlakes = (fl: Flake[], w: number, l: number): AuraTransformSpec[] =>
  fl.map((f) => ({
    position: [eyeAt(Z_WALK_START)[0] + OFF[0] + f.p[0], eyeAt(Z_WALK_START)[1] + OFF[1] + f.p[1], eyeAt(Z_WALK_START)[2] + OFF[2] + f.p[2]] as V3,
    rotation: [0, 0, STREAK_ANGLE + f.th] as V3,
    scale: [w, l, w] as V3
  }));
sc = sc
  .add(instances.box({ name: "flakes-small", transforms: initFlakes(smallFlakes, 0.06, 0.5), material: flakeMat, castShadow: false, frustumCulled: false }).runtime({ id: "flakes-small", mutable: true }))
  .add(instances.box({ name: "flakes-large", transforms: initFlakes(largeFlakes, 0.15, 1.1), material: flakeMat, castShadow: false, frustumCulled: false }).runtime({ id: "flakes-large", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let time = 0;
let drift = 0;
const wrap = (v: number, size: number): number => ((v % size) + size) % size;

const gustAt = (t: number): number => smoothstep(0.45, 0.95, 0.5 + 0.5 * Math.sin(t * 0.5)) * (0.78 + 0.22 * Math.sin(t * 1.7 + 1));

const updateFlakes = (id: string, fl: Flake[], max: number, baseCount: number, w: number, l: number, g: number, cam: V3): void => {
  const active = Math.floor(baseCount + (max - baseCount) * g);
  const out: AuraTransformSpec[] = new Array<AuraTransformSpec>(max);
  const lw = w * (1 + 0.3 * g), ll = l * (1 + 0.7 * g);
  for (let i = 0; i < max; i += 1) {
    const f = fl[i]!;
    const spd = drift * (0.8 + 0.4 * f.k);
    const rx = wrap(f.p[0] + WIND[0] * spd - cam[0] - OFF[0], BOX[0]) + OFF[0];
    const ry = wrap(f.p[1] + WIND[1] * spd - cam[1] - OFF[1], BOX[1]) + OFF[1];
    const rz = wrap(f.p[2] + WIND[2] * spd - cam[2] - OFF[2], BOX[2]) + OFF[2];
    const on = i < active;
    out[i] = {
      position: [cam[0] + rx, cam[1] + ry, cam[2] + rz],
      rotation: [0, 0, STREAK_ANGLE + f.th],
      scale: on ? [lw, ll, lw] : [0, 0, 0]
    };
  }
  app.nodes.require(id).setInstances(out);
};

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  time += dt;
  const g = gustAt(time);
  drift += dt * (11 + 16 * g);

  // camera walk
  const t = time % DURATION;
  const z = mix(Z_WALK_START, Z_WALK_END, t / DURATION);
  const eye = eyeAt(z), look = lookAt(z);
  const swayAmt = 1 + 0.5 * g;
  const px = eye[0] + 0.05 * Math.sin(time * 1.7) * swayAmt;
  const py = eye[1] + (0.035 * Math.sin(time * 3.4) + 0.012 * Math.sin(time * 5.3)) * swayAmt;
  const tx = look[0] + 0.7 * Math.sin(time * 0.6);
  const ty = look[1] + 0.12 * Math.sin(time * 0.9 + 2);
  app.camera?.setPose({ position: [px, py, eye[2]], target: [tx, ty, look[2]], roll: 0.012 * Math.sin(time * 1.7) * swayAmt }, { cut: true });

  // snow
  const cam: V3 = [px, py, eye[2]];
  updateFlakes("flakes-small", smallFlakes, SMALL_MAX, SMALL_BASE, 0.06, 0.5, g, cam);
  updateFlakes("flakes-large", largeFlakes, LARGE_MAX, LARGE_BASE, 0.15, 1.1, g, cam);

  // fog: thicker in gusts, whiteout masks the loop reset
  const whiteout = Math.max(smoothstep(DURATION - 2.5, DURATION, t), 1 - smoothstep(0, 2.5, t));
  app.atmosphere?.setFog({ color: FOG, density: FOG_BASE * (1 + 0.45 * g) + whiteout * 0.03 });
});

await app.ready();
window.__EVAL_READY__ = true;
