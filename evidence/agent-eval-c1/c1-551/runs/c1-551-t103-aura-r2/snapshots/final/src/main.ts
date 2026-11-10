import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  lights,
  material,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

// ---------- deterministic helpers ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- canyon shape (periodic in z so the flythrough loops seamlessly) ----------
const PERIOD = 240; // metres per loop
const TAU = Math.PI * 2;
const ph = (z: number): number => (TAU * z) / PERIOD;

const centre = (z: number): number => 13 * Math.sin(ph(z) + 0.5) + 5 * Math.sin(ph(z) * 3 + 2.0) + 2 * Math.sin(ph(z) * 7 + 0.3);
const halfWidth = (z: number): number => 9.5 + 2.5 * Math.sin(ph(z) * 2 + 1) + 1.2 * Math.sin(ph(z) * 5 + 4);
const channel = (z: number): number => centre(z) + 3.2 * Math.sin(ph(z) * 6 + 1.1);

// sum of periodic-in-z sines used as cheap rocky noise
const rock = (x: number, z: number): number =>
  Math.sin(ph(z) * 5 + x * 0.21 + 1.3) * 0.5 +
  Math.sin(ph(z) * 11 - x * 0.37 + 0.4) * 0.28 +
  Math.sin(ph(z) * 23 + x * 0.83 + 2.2) * 0.14 +
  Math.sin(ph(z) * 41 - x * 1.7) * 0.07;

const STEP = 4.2;
const height = (x: number, z: number): number => {
  const d = x - centre(z);
  const hw = halfWidth(z);
  const n = rock(x, z);
  const t = Math.max(0, Math.abs(d) - hw + n * 2.6);
  const top = 30 + 6 * Math.sin(ph(z) * 3 + Math.sign(d) * 1.7) + 4 * Math.sin(ph(z) * 8 + Math.abs(d) * 0.07);
  const wall = top * (1 - Math.exp(-Math.pow(t / 6.5, 1.35)));
  const plateau = 0.06 * Math.max(0, t - 12) + 2.2 * n * smooth(0, 8, t);
  let h = wall + plateau;
  // sandstone ledges: flatten each layer a bit and keep the risers steep
  const u = h / STEP;
  const ledge = (Math.floor(u) + smooth(0.55, 0.95, u - Math.floor(u))) * STEP;
  h = h * 0.25 + ledge * 0.75;
  // floor: gentle undulation and a shallow dry riverbed
  const rd = Math.abs(x - channel(z));
  const bed = -0.55 * (1 - smooth(0.6, 3.2, rd));
  const floorNoise = 0.22 * n + 0.18 * Math.sin(ph(z) * 9 + x * 0.5);
  return h + (floorNoise + bed) * (1 - smooth(0, 6, t));
};

// ---------- terrain mesh ----------
const Z0 = -20;
const Z1 = 400;
const X_HALF = 62;
const CELL = 1.25;
const NX = Math.round((X_HALF * 2) / CELL);
const NZ = Math.round((Z1 - Z0) / CELL);
const vcount = (NX + 1) * (NZ + 1);
const positions = new Float32Array(vcount * 3);
const normals = new Float32Array(vcount * 3);
const colors = new Float32Array(vcount * 4);
const indices: number[] = [];

const hex = (s: string): [number, number, number] => [
  parseInt(s.slice(1, 3), 16) / 255,
  parseInt(s.slice(3, 5), 16) / 255,
  parseInt(s.slice(5, 7), 16) / 255
];
const STRATA = ["#c4561e", "#e0a060", "#8a3a22", "#eab879", "#b04a28", "#f0c890", "#6e3022", "#cf7a3a"].map(hex);
const SAND = hex("#e0a468");
const BEDCOL = hex("#e2cba4");

const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  a[0]! + (b[0]! - a[0]!) * t,
  a[1]! + (b[1]! - a[1]!) * t,
  a[2]! + (b[2]! - a[2]!) * t
];

let minY = 1e9;
let maxY = -1e9;
for (let j = 0; j <= NZ; j += 1) {
  for (let i = 0; i <= NX; i += 1) {
    const v = j * (NX + 1) + i;
    const x = -X_HALF + i * CELL;
    const z = Z0 + j * CELL;
    const h = height(x, z);
    minY = Math.min(minY, h);
    maxY = Math.max(maxY, h);
    positions.set([x, h, z], v * 3);
    const e = 0.5;
    const nx = height(x - e, z) - height(x + e, z);
    const nz = height(x, z - e) - height(x, z + e);
    const len = Math.hypot(nx, 2 * e, nz);
    normals.set([nx / len, (2 * e) / len, nz / len], v * 3);

    // colour: layered strata by height, sand on flats, pale riverbed
    const slope = clamp(Math.hypot(nx, nz) / (2 * e) / 2.2, 0, 1);
    const band = (h + rock(x * 0.6, z) * 1.3) / 2.2;
    const bi = Math.floor(band);
    const fr = band - bi;
    const c0 = STRATA[Math.floor(hash(bi) * STRATA.length)]!;
    const c1 = STRATA[Math.floor(hash(bi + 1) * STRATA.length)]!;
    let col = mix3(c0, c1, smooth(0.9, 1, fr));
    const shade = 0.9 + 0.12 * hash(Math.floor(h * 3) + Math.floor(z * 0.5)) + 0.05 * rock(x, z * 2);
    col = [col[0] * shade, col[1] * shade, col[2] * shade];
    col = mix3(SAND, col, smooth(0.15, 0.5, slope));
    const rd = Math.abs(x - channel(z));
    col = mix3(col, BEDCOL, (1 - smooth(1.2, 3.4, rd)) * (1 - smooth(0.2, 1.2, h)) * 0.8);
    colors.set([col[0] * 1.25, col[1] * 1.2, col[2] * 1.15, 1], v * 4);

    if (i < NX && j < NZ) indices.push(v, v + NX + 1, v + 1, v + 1, v + NX + 1, v + NX + 2);
  }
}

const terrainGeo = geometry.define({
  positions,
  normals,
  colors,
  indices,
  bounds: { min: [-X_HALF, minY, Z0], max: [X_HALF, maxY, Z1] }
});

// ---------- boulders and dead shrubs (generated per period, copied so the loop is seamless) ----------
const boulders: AuraTransformSpec[] = [];
const boulderColors: string[] = [];
const BOULDER_PAL = ["#8a5238", "#a46a46", "#74442f", "#b98056", "#6b4a3a"];
const branches: AuraTransformSpec[] = [];
const branchColors: string[] = [];
const BRANCH_PAL = ["#4a382b", "#5c4636", "#3d2f26", "#6a5342"];

const floorPoint = (z: number, lateral: number): [number, number] => {
  const x = centre(z) + lateral * halfWidth(z);
  return [x, height(x, z)];
};

for (let rep = 0; rep < 2; rep += 1) {
  seed = 777; // identical layout in every period
  const zOff = rep * PERIOD;
  for (let k = 0; k < 34; k += 1) {
    const z = rand() * PERIOD + zOff;
    const big = rand() < 0.25;
    const s = big ? 1.8 + rand() * 1.8 : 0.5 + rand() * 1.0;
    const lat = (rand() * 2 - 1) * (big ? 0.95 : 0.8);
    const yaw = rand() * TAU;
    const sx = s * (0.9 + rand() * 0.5);
    const sy = s * (0.55 + rand() * 0.4);
    const sz = s * (0.8 + rand() * 0.5);
    const ci = Math.floor(rand() * BOULDER_PAL.length);
    if (z > Z1 - 5) continue;
    const [x, y] = floorPoint(z, lat);
    boulders.push({ position: [x, y + sy * 0.28, z], scale: [sx, sy, sz], rotation: [0, yaw, 0] });
    boulderColors.push(BOULDER_PAL[ci]!);
  }
  for (let k = 0; k < 26; k += 1) {
    const zc = rand() * PERIOD + zOff;
    const lat = (rand() * 2 - 1) * 0.85;
    const [bx, by] = floorPoint(zc, lat);
    const nb = 7 + Math.floor(rand() * 5);
    const size = 0.7 + rand() * 0.8;
    for (let b = 0; b < nb; b += 1) {
      const theta = 0.15 + rand() * 0.75;
      const phi = rand() * TAU;
      const len = size * (0.8 + rand() * 0.9);
      const dx = Math.sin(theta) * Math.cos(phi);
      const dy = Math.cos(theta);
      const dz = Math.sin(theta) * Math.sin(phi);
      const ax = Math.sin(phi);
      const az = -Math.cos(phi);
      const sh = Math.sin(theta / 2);
      branches.push({
        position: [bx + (dx * len) / 2, by + (dy * len) / 2 - 0.05, zc + (dz * len) / 2],
        scale: [0.045 + rand() * 0.03, len, 0.045 + rand() * 0.03],
        quaternion: [ax * sh, 0, az * sh, Math.cos(theta / 2)]
      });
      branchColors.push(BRANCH_PAL[Math.floor(rand() * BRANCH_PAL.length)]!);
      // a short twig near the tip
      if (rand() < 0.7 && b < nb) {
        const t2 = clamp(theta + 0.5 + rand() * 0.6, 0, 1.4);
        const p2 = phi + (rand() - 0.5) * 1.6;
        const l2 = len * 0.45;
        const s2 = Math.sin(t2 / 2);
        const tx = bx + dx * len * 0.7;
        const ty = by + dy * len * 0.7;
        const tz = zc + dz * len * 0.7;
        branches.push({
          position: [tx + (Math.sin(t2) * Math.cos(p2) * l2) / 2, ty + (Math.cos(t2) * l2) / 2, tz + (Math.sin(t2) * Math.sin(p2) * l2) / 2],
          scale: [0.03, l2, 0.03],
          quaternion: [Math.sin(p2) * s2, 0, -Math.cos(p2) * s2, Math.cos(t2 / 2)]
        });
        branchColors.push(BRANCH_PAL[Math.floor(rand() * BRANCH_PAL.length)]!);
      }
    }
  }
}

// ---------- lighting ----------
const SUN_EL = 8;
const SUN_AZ = 160;
const sunVec = (dist: number): [number, number, number] => {
  const e = (SUN_EL * Math.PI) / 180;
  const a = (SUN_AZ * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, -Math.cos(a) * Math.cos(e) * dist];
};

const FOG = "#c27c98";
const eyeAt = (z: number): { pos: [number, number, number]; look: [number, number, number] } => {
  const lateral = 3.4 * Math.sin(ph(z) * 4 + 0.6);
  const x = centre(z) + lateral;
  const zl = z + 24;
  const xl = centre(zl) + 3.4 * Math.sin(ph(zl) * 4 + 0.6) * 0.6;
  const y = height(x, z) + 1.8;
  const yl = height(xl, zl) + 9;
  return { pos: [x, y, z], look: [xl, yl, zl] };
};
const start = eyeAt(0);

const app = createAuraApp("#app", {
  scene: scene({ background: FOG })
    .add(
      sky.gradient({
        zenith: "#10208f",
        horizon: "#e0709a",
        ground: "#5a3550",
        exponent: 1.5,
        horizonGlow: 1.2,
        sun: { elevationDeg: SUN_EL - 5, azimuthDeg: SUN_AZ, intensity: 1.4, color: "#ffb870", discSize: 1.4 },
        bands: [
          { elevationDeg: 1, widthDeg: 9, color: "#ff8a3a", intensity: 0.9 },
          { elevationDeg: 7, widthDeg: 14, color: "#c8307f", intensity: 0.5 }
        ]
      })
    )
    .add(lights.hemisphere({ skyColor: "#8f86c8", groundColor: "#b86a44", intensity: 0.85 }))
    .add(
      lights.directional({
        name: "sun",
        position: sunVec(160).map((v, i) => v + [0, 10, 120][i]!) as [number, number, number],
        target: [0, 10, 120],
        intensity: 4.2,
        color: "#ff9a55",
        shadow: true
      })
    )
    .add(
      geometry.custom(terrainGeo, {
        name: "canyon-terrain",
        material: material.pbr({ color: "#ffffff", roughness: 0.96, metallic: 0 })
      })
    )
    .add(
      instances.sphere({
        name: "boulders",
        transforms: boulders,
        colors: boulderColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.95 })
      })
    )
    .add(
      instances.cylinder({
        name: "dead-branches",
        transforms: branches,
        colors: branchColors,
        material: material.pbr({ color: "#ffffff", roughness: 1 }),
        params: { radialSegments: 5 }
      })
    )
    .add(effects.fog({ color: FOG, density: 0.0105, mode: "exp2", affectsBackground: false }))
    .camera(camera.perspective({ position: start.pos, target: start.look, fov: 58, near: 0.3, far: 700 })),
  resize: false
});

// ---------- flythrough ----------
const LOOP_SECONDS = 56;
let ready = false;
let flying = true;
let flightTime = 0;

const toggle = document.createElement("button");
toggle.id = "flight-toggle";
toggle.type = "button";
toggle.textContent = "Pause flythrough";
toggle.style.cssText = "display:block;margin:8px 0;padding:6px 12px;font:inherit;cursor:pointer;";
toggle.addEventListener("click", () => {
  flying = !flying;
  toggle.textContent = flying ? "Pause flythrough" : "Resume flythrough";
});
document.body.appendChild(toggle);

const taskState = { flying: true, cameraX: start.pos[0], cameraY: start.pos[1], cameraZ: start.pos[2] };
(window as unknown as { __TASK_STATE__?: typeof taskState }).__TASK_STATE__ = taskState;

app.onFrame((f) => {
  if (flying) flightTime += f.dt;
  const z = ((flightTime / LOOP_SECONDS) % 1) * PERIOD;
  const e = eyeAt(z);
  const bob = 0.05 * Math.sin(flightTime * 1.3);
  const cx = e.pos[0];
  const cy = e.pos[1] + bob;
  const cz = e.pos[2];
  app.camera?.setPose({ position: [cx, cy, cz], target: e.look, fov: 58, near: 0.3, far: 700 }, { cut: true });
  taskState.flying = flying;
  taskState.cameraX = cx;
  taskState.cameraY = cy;
  taskState.cameraZ = cz;
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});
void app.ready();
