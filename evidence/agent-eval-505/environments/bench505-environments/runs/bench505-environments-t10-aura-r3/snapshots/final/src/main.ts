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

// Desert canyon at dusk. Everything is procedural: one sheared heightfield mesh for the canyon,
// instanced boulders and dead shrubs, a gradient dusk sky, fog haze and a looping camera path.
// All terrain functions are periodic in z (period L), so the camera can loop without a visible seam.

type RGB = [number, number, number];

const L = 240; // loop length in metres
const Q = (Math.PI * 2) / L;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixC = (a: RGB, b: RGB, t: number): RGB => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---- canyon layout (u = lateral offset from the canyon centre line, z = along the canyon) ----
const xc = (z: number): number => 13 * Math.sin(Q * z + 0.4) + 5 * Math.sin(3 * Q * z + 1.7);
const xcSlope = (z: number): number => 13 * Q * Math.cos(Q * z + 0.4) + 15 * Q * Math.cos(3 * Q * z + 1.7);
const camU = (z: number): number => 2.2 * Math.sin(4 * Q * z + 1.0);
const halfW = (z: number): number => 10 + 2.5 * Math.sin(2 * Q * z + 0.9) + 1.5 * Math.sin(5 * Q * z);
const topH = (z: number, side: number): number =>
  26 + 6 * Math.sin(2 * Q * z + side * 1.1) + 4 * Math.sin(4 * Q * z + 2 + side * 0.7) + (side > 0 ? 3 : 0);
const nz = (u: number, z: number): number =>
  0.5 * Math.sin(0.23 * u + 7 * Q * z + 0.4) + 0.3 * Math.sin(0.51 * u - 13 * Q * z + 1.9) + 0.2 * Math.sin(0.97 * u + 31 * Q * z + 0.3);

const TIER = 4.2; // sandstone layer thickness in metres

const hf = (u: number, z: number): number => {
  const side = u >= 0 ? 1 : -1;
  const d = Math.abs(u);
  const n = nz(u, z);
  const rr = d - halfW(z) + 1.8 * n;

  // floor: dry river channel along 0.9 * camera sway, low levees, fine ripples
  const cu = u - 0.9 * camU(z);
  const channel = -0.75 * Math.exp(-(cu * cu) / (2 * 1.7 * 1.7));
  const levee = 0.18 * Math.exp(-Math.pow(Math.abs(cu) - 3.2, 2) / 2);
  const ripples = 0.1 * n + 0.04 * Math.sin(2.9 * u + 31 * Q * z);
  const floor = channel + levee + ripples;
  const base = floor + 0.4 * smooth(-5, 0, rr);
  if (rr <= 0) return base;

  // wall: steep face saturating into a mesa top, then terraced into layered ledges
  const raw = 0.4 + 0.3 * rr + 2.2 * Math.pow(rr, 0.85);
  const top = topH(z, side) + 1.5 * n;
  const s = raw / top;
  const f = s < 0.8 ? s : 0.8 + 0.2 * Math.tanh((s - 0.8) / 0.2);
  const yRaw = f * top;
  const q2 = yRaw / TIER + 0.2 * n;
  const tier = Math.floor(q2);
  const fr = q2 - tier;
  const yTerr = (tier + smooth(0.45, 0.9, fr)) * TIER - 0.2 * n * TIER;
  let y = mix(yRaw, yTerr, smooth(0.5, 4, rr));
  y += 0.7 * n * smooth(0.75, 1.0, f);
  return y + floor * (1 - smooth(0, 3, rr));
};

// ---- palette ----
const RED: RGB = [0.62, 0.3, 0.18];
const OCHRE: RGB = [0.78, 0.52, 0.3];
const UMBER: RGB = [0.42, 0.22, 0.16];
const BUFF: RGB = [0.84, 0.66, 0.46];
const ROSE: RGB = [0.64, 0.36, 0.33];
const DUST: RGB = [0.82, 0.65, 0.47];
const SAND: RGB = [0.8, 0.62, 0.43];
const SAND2: RGB = [0.72, 0.53, 0.38];
const GRAVEL: RGB = [0.58, 0.47, 0.4];

const shade = (u: number, z: number, y: number, ny: number): [number, number, number, number] => {
  const n = nz(u, z);
  const rr = Math.abs(u) - halfW(z) + 1.8 * n;
  const cu = u - 0.9 * camU(z);

  let fc = mixC(SAND, SAND2, smooth(-0.4, 0.6, n));
  fc = mixC(fc, GRAVEL, 0.75 * Math.exp(-(cu * cu) / (2 * 2.0 * 2.0)));
  const floorAo = 1 - 0.32 * smooth(-5, 0.3, rr);

  const s1 = 0.5 + 0.5 * Math.sin(y * 0.95 + 1.2 * n);
  const s2 = 0.5 + 0.5 * Math.sin(y * 0.41 + 1.0);
  const s3 = 0.5 + 0.5 * Math.sin(y * 2.1 + 0.7 * n + 2.0);
  const s4 = 0.5 + 0.5 * Math.sin(y * 0.23 + 3.0);
  let wc = mixC(RED, OCHRE, smooth(0.3, 0.7, s1));
  wc = mixC(wc, UMBER, 0.6 * smooth(0.6, 0.9, s2));
  wc = mixC(wc, BUFF, 0.55 * smooth(0.72, 0.95, s3));
  wc = mixC(wc, ROSE, 0.35 * smooth(0.55, 0.8, s4));
  wc = mixC(wc, DUST, 0.65 * smooth(0.78, 0.95, ny));
  const wallAo = 0.7 + 0.3 * smooth(0, 16, y);

  const w = smooth(-0.3, 1.2, rr);
  const c = mixC(fc, wc, w);
  const ao = mix(floorAo, wallAo, w) * (0.92 + 0.1 * n);
  return [c[0] * ao, c[1] * ao, c[2] * ao, 1];
};

// ---- terrain mesh ----
const Z0 = -30;
const Z1 = 500;
const DZ = 1.5;
const us: number[] = [];
for (let u = -80; u < 80; ) {
  us.push(u);
  const a = Math.abs(u);
  u += a < 30 ? 0.9 : a < 50 ? 2 : 3.5;
}
us.push(80);
const COLS = us.length;
const ROWS = Math.round((Z1 - Z0) / DZ) + 1;

const positions = new Float32Array(COLS * ROWS * 3);
const normals = new Float32Array(COLS * ROWS * 3);
const colors = new Float32Array(COLS * ROWS * 4);
const indices: number[] = [];
const E = 0.4;
let minY = 1e9;
let maxY = -1e9;
for (let j = 0; j < ROWS; j += 1) {
  const z = Z0 + j * DZ;
  const x0 = xc(z);
  const dx = xcSlope(z);
  for (let i = 0; i < COLS; i += 1) {
    const u = us[i] as number;
    const v = j * COLS + i;
    const h = hf(u, z);
    const hu = (hf(u + E, z) - hf(u - E, z)) / (2 * E);
    const hz = (hf(u, z + E) - hf(u, z - E)) / (2 * E);
    const gx = hu;
    const gz = hz - dx * hu;
    const len = Math.hypot(gx, 1, gz);
    positions.set([x0 + u, h, z], v * 3);
    normals.set([-gx / len, 1 / len, -gz / len], v * 3);
    colors.set(shade(u, z, h, 1 / len), v * 4);
    if (h < minY) minY = h;
    if (h > maxY) maxY = h;
    if (i < COLS - 1 && j < ROWS - 1) indices.push(v, v + COLS, v + 1, v + 1, v + COLS, v + COLS + 1);
  }
}

// ---- boulders and dead shrubs (periodic placement, copied one loop either side) ----
const rnd = mulberry32(20240611);
const OFFSETS = [-L, 0, L];
const inRange = (z: number): boolean => z >= Z0 + 5 && z <= Z1 - 5;

const sphereT: AuraTransformSpec[] = [];
const sphereC: string[] = [];
const blockT: AuraTransformSpec[] = [];
const blockC: string[] = [];
const ROCK_COLORS = ["#8c5a40", "#a56d49", "#7b5141", "#9d7a5b", "#6f4a3a", "#b07c55"];

let placed = 0;
for (let attempt = 0; attempt < 400 && placed < 46; attempt += 1) {
  const z0 = rnd() * L;
  const hw = halfW(z0);
  const kind = rnd();
  const base = kind < 0.68 ? 0.6 + rnd() * 1.0 : kind < 0.94 ? 1.6 + rnd() * 1.4 : 3 + rnd() * 1.8;
  const side = rnd() < 0.5 ? -1 : 1;
  const u = base > 1.5 ? side * (hw + rnd() * 2 - 0.6) : (rnd() * 2 - 1) * (hw + 0.5);
  if (Math.abs(u - camU(z0)) < 1.6 + base * 0.9) continue;
  placed += 1;
  const sx = base * (0.9 + rnd() * 0.4);
  const sy = base * (0.55 + rnd() * 0.35);
  const sz = base * (0.8 + rnd() * 0.4);
  const yaw = rnd() * Math.PI * 2;
  const tiltX = (rnd() - 0.5) * 0.35;
  const tiltZ = (rnd() - 0.5) * 0.35;
  const color = ROCK_COLORS[Math.floor(rnd() * ROCK_COLORS.length)] as string;
  const asBlock = rnd() < 0.45;
  for (const off of OFFSETS) {
    const z = z0 + off;
    if (!inRange(z)) continue;
    const t: AuraTransformSpec = {
      position: [xc(z) + u, hf(u, z) + sy * 0.25, z],
      scale: [sx, sy, sz],
      rotation: [tiltX, yaw, tiltZ]
    };
    if (asBlock) {
      blockT.push(t);
      blockC.push(color);
    } else {
      sphereT.push(t);
      sphereC.push(color);
    }
  }
}

const twigT: AuraTransformSpec[] = [];
const twigC: string[] = [];
const clumpT: AuraTransformSpec[] = [];
const clumpC: string[] = [];
const TWIG_COLORS = ["#5a4636", "#4a3a2e", "#6b5744", "#3f3228"];
let shrubs = 0;
for (let attempt = 0; attempt < 600 && shrubs < 70; attempt += 1) {
  const z0 = rnd() * L;
  const hw = halfW(z0);
  const u = (rnd() * 2 - 1) * (hw - 0.3);
  if (Math.abs(u - camU(z0)) < 1.8) continue;
  shrubs += 1;
  const s = 0.7 + rnd() * 0.9;
  const branches = 6 + Math.floor(rnd() * 4);
  const branchSpecs: { t: number; phi: number; len: number; color: string }[] = [];
  for (let b = 0; b < branches; b += 1) {
    branchSpecs.push({
      t: 0.3 + rnd() * 0.8,
      phi: rnd() * Math.PI * 2,
      len: (0.8 + rnd() * 0.8) * s,
      color: TWIG_COLORS[Math.floor(rnd() * TWIG_COLORS.length)] as string
    });
  }
  for (const off of OFFSETS) {
    const z = z0 + off;
    if (!inRange(z)) continue;
    const bx = xc(z) + u;
    const by = hf(u, z);
    clumpT.push({ position: [bx, by + 0.1 * s, z], scale: [0.5 * s, 0.26 * s, 0.5 * s] });
    clumpC.push("#3b2e26");
    for (const br of branchSpecs) {
      const dir: RGB = [Math.sin(br.t) * Math.sin(br.phi), Math.cos(br.t), Math.sin(br.t) * Math.cos(br.phi)];
      twigT.push({
        position: [bx + dir[0] * br.len * 0.5, by + 0.08 + dir[1] * br.len * 0.5, z + dir[2] * br.len * 0.5],
        scale: [0.07 * s, br.len, 0.07 * s],
        rotation: [br.t, br.phi, 0]
      });
      twigC.push(br.color);
    }
  }
}

// ---- lighting and sky ----
const SUN_ELEVATION = 13;
const SUN_AZIMUTH = 168;
const sunVec = (distance: number): [number, number, number] => {
  const e = (SUN_ELEVATION * Math.PI) / 180;
  const a = (SUN_AZIMUTH * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const rockMaterial = material.pbr({ color: "#ffffff", roughness: 0.95 });
const twigMaterial = material.pbr({ color: "#ffffff", roughness: 1 });

const camPos = (s: number): { z: number; x: number; y: number } => {
  const z = ((s % L) + L) % L;
  return { z, x: xc(z) + camU(z), y: 1.75 + 0.06 * Math.sin(s * 0.45) };
};

const start = camPos(0);
const startAhead = xc(18) + camU(18);

const app = createAuraApp("#app", {
  scene: scene({ background: "#c98a8f" })
    .add(
      sky.gradient({
        zenith: "#2c3490",
        horizon: "#f0905c",
        ground: "#6b3b3a",
        exponent: 1.8,
        horizonGlow: 0.45,
        sun: { elevationDeg: SUN_ELEVATION, azimuthDeg: SUN_AZIMUTH, intensity: 1, color: "#ffb070" },
        bands: [
          { elevationDeg: 2, widthDeg: 4, color: "#ff7a30", intensity: 0.5 },
          { elevationDeg: 10, widthDeg: 9, color: "#e0407c", intensity: 0.45 }
        ]
      })
    )
    .add(lights.hemisphere({ skyColor: "#5b55b8", groundColor: "#8a4a30", intensity: 0.9 }))
    .add(
      lights.directional({
        name: "sun",
        position: sunVec(80),
        target: [0, 0, 0],
        intensity: 3,
        color: "#ff9a52",
        shadow: { cascades: 3, maxDistance: 160, mapSize: 2048, filter: "pcf", fit: "camera" }
      })
    )
    .add(lights.directional({ name: "fill", position: [-sunVec(40)[0], 30, -sunVec(40)[2]], target: [0, 0, 0], intensity: 0.5, color: "#6a6fd8" }))
    .add(
      geometry.custom(
        geometry.define({
          positions,
          normals,
          colors,
          indices,
          bounds: { min: [-110, minY - 1, Z0], max: [110, maxY + 1, Z1] }
        }),
        { name: "canyon", material: material.pbr({ color: "#ffffff", roughness: 0.96 }), castShadow: true, receiveShadow: true }
      )
    )
    .add(instances.sphere({ name: "boulders-round", transforms: sphereT, colors: sphereC, material: rockMaterial }))
    .add(instances.roundedBox({ name: "boulders-blocks", transforms: blockT, colors: blockC, material: rockMaterial }))
    .add(instances.sphere({ name: "shrub-clumps", transforms: clumpT, colors: clumpC, material: twigMaterial }))
    .add(instances.cylinder({ name: "shrub-twigs", transforms: twigT, colors: twigC, material: twigMaterial, params: { radialSegments: 5 } }))
    .add(effects.fog({ color: "#c4849c", density: 0.01 }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.5 }))
    .camera(
      camera.perspective({
        position: [start.x, start.y, start.z],
        target: [startAhead, 4.2, 18],
        fov: 58,
        near: 0.2,
        far: 400
      })
    )
});

// ---- camera flythrough: loops every L / SPEED seconds, sways left and right ----
const SPEED = 5.5; // metres per second
const LOOK_AHEAD = 18;
const t0 = performance.now();
app.onFrame(() => {
  const s = ((performance.now() - t0) / 1000) * SPEED;
  const p = camPos(s);
  const zl = p.z + LOOK_AHEAD;
  const target: [number, number, number] = [xc(zl) + camU(zl), 4.2 + 0.4 * Math.sin(s * 0.2), zl];
  app.camera?.setPose({ position: [p.x, p.y, p.z], target, roll: 0.015 * Math.sin(s * 0.26) });
});

const flags = window as unknown as { __EVAL_READY__?: boolean };
void app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flags.__EVAL_READY__ = true;
    });
  });
});
