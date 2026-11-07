import {
  camera,
  createAuraApp,
  effects,
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
    __EVAL_READY__?: boolean;
  }
}

// ---------- seeded random + periodic noise (canyon is a closed loop) ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth 0..1 noise, periodic in theta with `cells` cells per revolution. */
const pnoise = (theta: number, cells: number, salt: number): number => {
  const x = (theta / (Math.PI * 2)) * cells;
  const i0 = Math.floor(x);
  const f = x - i0;
  const u = f * f * (3 - 2 * f);
  const a = hash((((i0 % cells) + cells) % cells) + salt * 101);
  const b = hash((((i0 + 1) % cells) + cells) % cells + salt * 101);
  return a * (1 - u) + b * u;
};

// ---------- canyon centreline (closed winding loop) ----------
const TAU = Math.PI * 2;
const R = 130;
const centre = (th: number): [number, number] => {
  const r = R + 9 * Math.sin(4 * th) + 4 * Math.sin(7 * th + 0.8);
  return [r * Math.cos(th), r * Math.sin(th)];
};
interface Frame { x: number; z: number; tx: number; tz: number; nx: number; nz: number; yaw: number }
const frame = (th: number): Frame => {
  const e = 0.002;
  const [x, z] = centre(th);
  const [x1, z1] = centre(th + e);
  const [x0, z0] = centre(th - e);
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
  const tx = dx / l, tz = dz / l;
  return { x, z, tx, tz, nx: -tz, nz: tx, yaw: Math.atan2(tx, tz) };
};
const halfWidth = (th: number): number => 15 + 3 * Math.sin(5 * th + 0.7) + 2 * Math.sin(9 * th);
const meander = (th: number): number => 3.2 * Math.sin(6 * th + 0.4) + 1.2 * Math.sin(17 * th);

// ---------- canyon walls: stacked sandstone strata ----------
const SEG = 220;
const layerH = [6, 5, 7, 5, 8, 6, 7];
const layerHsl: Array<[number, number, number]> = [
  [12, 48, 30], [22, 56, 44], [9, 46, 35], [28, 52, 52], [15, 55, 40], [24, 50, 48], [11, 44, 34]
];
const wallT: AuraTransformSpec[] = [];
const wallC: string[] = [];
for (let i = 0; i < SEG; i += 1) {
  const th = (i / SEG) * TAU;
  const fr = frame(th);
  const [nx2, nz2] = centre(th + TAU / SEG);
  const len = Math.hypot(nx2 - fr.x, nz2 - fr.z) * 1.35 + 1.2;
  for (const side of [-1, 1]) {
    const salt = side > 0 ? 3 : 7;
    const layers = Math.max(5, Math.min(7, 5 + Math.round(2.4 * pnoise(th, 22, salt) - 0.2)));
    const hw = halfWidth(th) + (rand() - 0.5) * 1.2;
    const jit = (rand() - 0.5) * 8;
    let y = 0;
    for (let k = 0; k < layers; k += 1) {
      const h = layerH[k]! * (0.92 + 0.16 * pnoise(th, 40, salt + k));
      const setback = k * 0.7 + (k % 3 === 2 ? 2.4 : 0) + 2.2 * pnoise(th, 30, salt * 10 + k) + rand() * 0.8;
      const T = 44;
      const off = side * (hw + setback + T / 2);
      wallT.push({
        position: [fr.x + fr.nx * off, y + h / 2, fr.z + fr.nz * off],
        rotation: [0, fr.yaw, 0],
        scale: [T, h + 0.05, len]
      });
      const [hh, ss, ll] = layerHsl[k]!;
      wallC.push(`hsl(${hh + Math.round(rand() * 4)}, ${ss}%, ${Math.round(ll + jit + (rand() - 0.5) * 5)}%)`);
      y += h;
    }
  }
}

// ---------- riverbed strip, pebbles ----------
const bedT: AuraTransformSpec[] = [];
const bedC: string[] = [];
const BED = 420;
for (let i = 0; i < BED; i += 1) {
  const th = (i / BED) * TAU;
  const fr = frame(th);
  const [nx2, nz2] = centre(th + TAU / BED);
  const len = Math.hypot(nx2 - fr.x, nz2 - fr.z) * 1.3 + 0.6;
  const m = meander(th);
  const w = 6 + 1.6 * Math.sin(11 * th) + rand() * 0.6;
  bedT.push({
    position: [fr.x + fr.nx * m, 0.08, fr.z + fr.nz * m],
    rotation: [0, fr.yaw, 0],
    scale: [w, 0.3, len]
  });
  bedC.push(`hsl(34, ${26 + Math.round(rand() * 6)}%, ${58 + Math.round(rand() * 6)}%)`);
}

const pebT: AuraTransformSpec[] = [];
const pebC: string[] = [];
for (let i = 0; i < 420; i += 1) {
  const th = rand() * TAU;
  const fr = frame(th);
  const l = meander(th) + (rand() - 0.5) * 6;
  const s = range(0.15, 0.55);
  pebT.push({
    position: [fr.x + fr.nx * l, 0.2 + s * 0.2, fr.z + fr.nz * l],
    rotation: [rand() * 3, rand() * 3, 0],
    scale: [s * 1.3, s * 0.7, s]
  });
  pebC.push(`hsl(${25 + Math.round(rand() * 15)}, 18%, ${38 + Math.round(rand() * 25)}%)`);
}

// ---------- boulders ----------
const rockT: AuraTransformSpec[] = [];
const rockC: string[] = [];
const addRock = (th: number, lat: number, size: number): void => {
  const fr = frame(th);
  rockT.push({
    position: [fr.x + fr.nx * lat, size * 0.3, fr.z + fr.nz * lat],
    rotation: [rand() * 0.5, rand() * 6, rand() * 0.5],
    scale: [size * range(1.0, 1.5), size * range(0.7, 1.0), size * range(1.0, 1.4)]
  });
  rockC.push(`hsl(${14 + Math.round(rand() * 14)}, ${28 + Math.round(rand() * 14)}%, ${28 + Math.round(rand() * 16)}%)`);
};
for (let i = 0; i < 70; i += 1) {
  const th = rand() * TAU;
  const side = rand() < 0.5 ? -1 : 1;
  const hw = halfWidth(th);
  const big = rand() < 0.35;
  addRock(th, side * range(6.5, hw - 1), big ? range(2.2, 3.8) : range(0.8, 1.8));
}
for (let i = 0; i < 40; i += 1) addRock(rand() * TAU, range(-3, 3) + (rand() < 0.5 ? 4.8 : -4.8), range(0.35, 0.8));
for (let i = 0; i < 260; i += 1) {
  const th = rand() * TAU;
  const side = rand() < 0.5 ? -1 : 1;
  addRock(th, side * (halfWidth(th) + range(-0.5, 2.5)), range(1.2, 4.2));
}

// ---------- dead shrubs: bundles of bare, tilted twigs ----------
const twigT: AuraTransformSpec[] = [];
const twigC: string[] = [];
for (let i = 0; i < 46; i += 1) {
  const th = rand() * TAU;
  const fr = frame(th);
  const side = rand() < 0.5 ? -1 : 1;
  const lat = side * range(6, halfWidth(th) - 1.5);
  const bx = fr.x + fr.nx * lat, bz = fr.z + fr.nz * lat;
  const scale = range(0.8, 1.5);
  for (let b = 0; b < 9; b += 1) {
    const rx = range(-0.9, 0.9), rz = range(-0.9, 0.9);
    const len = range(1.2, 2.4) * scale;
    // branch axis after rotation (XYZ Euler) so the base sits on the ground
    const ax = -Math.sin(rz), ay = Math.cos(rz) * Math.cos(rx), az = Math.cos(rz) * Math.sin(rx);
    twigT.push({
      position: [bx + (ax * len) / 2, (ay * len) / 2, bz + (az * len) / 2],
      rotation: [rx, 0, rz],
      scale: [0.07 * scale, len, 0.07 * scale]
    });
    twigC.push(`hsl(${30 + Math.round(rand() * 10)}, 18%, ${20 + Math.round(rand() * 14)}%)`);
  }
}

// ---------- light / sky ----------
const SUN_EL = 11, SUN_AZ = 215;
const sunDir = (d: number): [number, number, number] => {
  const E = (SUN_EL * Math.PI) / 180, A = (SUN_AZ * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const FOG = "#c0668a";

const white = material.pbr({ color: "#ffffff", roughness: 0.95 });

// ---------- camera path ----------
const PERIOD = 110; // seconds per lap
const camAt = (t: number): { pos: [number, number, number]; target: [number, number, number] } => {
  const th = (t / PERIOD) * TAU;
  const drift = (a: number): number => 3.0 * Math.sin(5 * a) + 0.8 * Math.sin(13 * a + 1);
  const f = frame(th);
  const d = drift(th);
  const ahead = th + 0.14;
  const fa = frame(ahead);
  const da = drift(ahead) * 0.5;
  const bob = 0.12 * Math.sin(th * 21);
  return {
    pos: [f.x + f.nx * d, 2.4 + bob, f.z + f.nz * d],
    target: [fa.x + fa.nx * da, 5.5, fa.z + fa.nz * da]
  };
};
const c0 = camAt(0);

let sc = scene({ background: "#c0668a" })
  .camera(camera.perspective({ position: c0.pos, target: c0.target, fov: 62, near: 0.3, far: 700 }))
  .add(sky.gradient({
    zenith: "#262a72",
    horizon: "#d4668c",
    ground: "#7a3a52",
    exponent: 0.55,
    horizonGlow: 0.7,
    sun: { elevationDeg: SUN_EL, azimuthDeg: SUN_AZ, intensity: 1.2, color: "#ffa054", discSize: 1.6 },
    bands: [{ elevationDeg: 4, widthDeg: 16, color: "#ff8a3d", intensity: 0.7 }]
  }))
  .add(lights.hemisphere({ skyColor: "#7676c8", groundColor: "#b0603c", intensity: 0.95 }))
  .add(lights.directional({
    name: "sun",
    position: sunDir(150),
    target: [0, 0, 0],
    intensity: 4,
    color: "#ff9048",
    shadow: { cascades: 3, maxDistance: 260, mapSize: 2048, filter: "pcf", softness: 2, fit: "camera" }
  }))
  .add(lights.directional({ name: "fill", position: [-sunDir(100)[0], 60, -sunDir(100)[2]], target: [0, 0, 0], intensity: 0.7, color: "#8a70d0" }))
  .add(effects.fog({ color: FOG, density: 0.0058 }))
  .add(primitives.plane({
    name: "floor",
    size: [480, 1, 480],
    material: material.pbr({ color: "#b98350", roughness: 1 })
  }))
  .add(instances.box({ name: "walls", transforms: wallT, colors: wallC, material: white }))
  .add(instances.box({ name: "riverbed", transforms: bedT, colors: bedC, material: white, castShadow: false }))
  .add(instances.sphere({ name: "pebbles", transforms: pebT, colors: pebC, material: white }))
  .add(instances.sphere({ name: "boulders", transforms: rockT, colors: rockC, material: white }))
  .add(instances.cylinder({ name: "twigs", transforms: twigT, colors: twigC, material: white, params: { radialSegments: 5 } }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += Math.min(f.dt, 0.1);
  const c = camAt(t);
  app.camera?.setPose({ position: c.pos, target: c.target });
});

await app.ready();
await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
window.__EVAL_READY__ = true;
