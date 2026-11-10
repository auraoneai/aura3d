import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

// ---------------------------------------------------------------- terrain
// Everything is periodic in z (period P) so the flythrough loops seamlessly:
// the camera wraps from z = P back to z = 0 over identical terrain.
const P = 160;
const W = (Math.PI * 2) / P;
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const centerX = (z: number): number => 7 * Math.sin(W * z) + 3.5 * Math.sin(2 * W * z + 1.3);
const halfWidth = (z: number): number => 13 + 3.5 * Math.sin(3 * W * z + 0.7);

const noise = (x: number, z: number): number =>
  0.5 * Math.sin(0.21 * x + 2 * W * z + 0.4) +
  0.3 * Math.sin(0.47 * x - 5 * W * z + 1.9) +
  0.2 * Math.sin(0.93 * x + 9 * W * z + 4.1) +
  0.12 * Math.sin(1.7 * x - 13 * W * z + 0.3);

const STEP = 3.2;
const height = (x: number, z: number): number => {
  const d = x - centerX(z);
  const ad = Math.abs(d);
  const t = Math.max(0, ad - halfWidth(z));
  const rightSide = d > 0 ? 1 : 0;
  const top = (rightSide ? 19 : 24) + 3 * Math.sin(2 * W * z + rightSide * 2.1);
  // riverbed: shallow channel with low ripples
  const bed = -0.7 * Math.exp(-((d / 3.2) * (d / 3.2))) + 0.12 * Math.sin(0.9 * x + 3 * W * z) + 0.35 * smooth(0, 3, t) * 1.5;
  const raw = top * smooth(0, 8.5, t) + 0.14 * t;
  // layered ledges: quantise the height with soft risers
  const q = raw / STEP;
  const fl = Math.floor(q);
  const ledge = (fl + smooth(0.6, 1, q - fl)) * STEP;
  const wall = lerp(raw, ledge, 0.75 * smooth(0.4, 4, t));
  const rough = noise(x, z) * (0.25 + 1.9 * smooth(0, 10, t));
  return bed + wall + rough;
};

// sandstone strata palette (sRGB-ish 0..1)
const PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0.72, 0.36, 0.22],
  [0.82, 0.55, 0.34],
  [0.62, 0.28, 0.2],
  [0.88, 0.68, 0.46],
  [0.55, 0.3, 0.26],
  [0.78, 0.45, 0.3],
  [0.68, 0.42, 0.36]
];
const SAND: readonly [number, number, number] = [0.62, 0.42, 0.27];
const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const X_HALF = 78;
const Z_MIN = -30;
const Z_MAX = P + 170;
const DX = 0.75;
const DZ = 0.85;
const NX = Math.round((X_HALF * 2) / DX);
const NZ = Math.round((Z_MAX - Z_MIN) / DZ);

const buildTerrain = () => {
  const count = (NX + 1) * (NZ + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const indices: number[] = [];
  let maxH = 0;
  let minH = 0;
  for (let j = 0; j <= NZ; j += 1) {
    const z = Z_MIN + j * DZ;
    const cx = centerX(z);
    for (let i = 0; i <= NX; i += 1) {
      const x = cx + (i / NX - 0.5) * 2 * X_HALF;
      const v = j * (NX + 1) + i;
      const h = height(x, z);
      maxH = Math.max(maxH, h);
      minH = Math.min(minH, h);
      positions.set([x, h, z], v * 3);
      const e = 0.3;
      const gx = height(x - e, z) - height(x + e, z);
      const gz = height(x, z - e) - height(x, z + e);
      const len = Math.hypot(gx, 2 * e, gz);
      const ny = (2 * e) / len;
      normals.set([gx / len, ny, gz / len], v * 3);

      const t = Math.max(0, Math.abs(x - cx) - halfWidth(z));
      const layer = h * 0.62 + 0.9 * noise(x * 0.5, z * 0.5);
      const id = Math.floor(layer);
      const edge = layer - id;
      const a = PALETTE[Math.floor(hash(id) * PALETTE.length)]!;
      const b = PALETTE[Math.floor(hash(id + 1) * PALETTE.length)]!;
      const mixAB = smooth(0.8, 1, edge);
      const shade = 0.92 + 0.16 * hash(id * 3.1);
      let r = lerp(a[0], b[0], mixAB) * shade;
      let g = lerp(a[1], b[1], mixAB) * shade;
      let bl = lerp(a[2], b[2], mixAB) * shade;
      // flat surfaces (ledges, floor) collect pale sand
      const dust = Math.max(smooth(0.8, 0.96, ny) * 0.65, 1 - smooth(0, 3, t));
      r = lerp(r, SAND[0] * (0.95 + 0.1 * noise(x, z)), dust);
      g = lerp(g, SAND[1] * (0.95 + 0.1 * noise(x, z)), dust);
      bl = lerp(bl, SAND[2] * (0.95 + 0.1 * noise(x, z)), dust);
      // darker near the canyon bottom (poor ambient)
      const ao = 0.7 + 0.3 * smooth(-1, 9, h);
      colors.set([r * ao, g * ao, bl * ao, 1], v * 4);
      if (i < NX && j < NZ) indices.push(v, v + NX + 1, v + 1, v + 1, v + NX + 1, v + NX + 2);
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices,
    bounds: { min: [-200, minH, Z_MIN], max: [200, maxH, Z_MAX] }
  });
};

// ---------------------------------------------------------------- props
let seed = 20240611;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const copies = [-1, 0, 1, 2];

const boulderTransforms: AuraTransformSpec[] = [];
const boulderColors: string[] = [];
const BOULDER_COLS = ["#8a5a45", "#a06a4a", "#704a40", "#b07c58", "#7d5848"];
for (let n = 0; n < 34; n += 1) {
  const z = rnd() * P;
  const side = rnd() < 0.5 ? -1 : 1;
  const off = (rnd() * 2 - 1) * (halfWidth(z) * 0.8) + side * (rnd() < 0.35 ? halfWidth(z) * 0.5 : 0);
  const big = rnd() < 0.2;
  const s = big ? 2.2 + rnd() * 2.2 : 0.5 + rnd() * 1.4;
  const x = centerX(z) + off;
  const rot: [number, number, number] = [rnd() * 0.6, rnd() * 6.28, rnd() * 0.6];
  const sc: [number, number, number] = [s * (0.9 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (0.9 + rnd() * 0.5)];
  const col = BOULDER_COLS[Math.floor(rnd() * BOULDER_COLS.length)]!;
  for (const k of copies) {
    const zz = z + k * P;
    if (zz < Z_MIN + 2 || zz > Z_MAX - 2) continue;
    boulderTransforms.push({ position: [x, height(x, z) + sc[1] * 0.18, zz], rotation: rot, scale: sc });
    boulderColors.push(col);
  }
}

const twigTransforms: AuraTransformSpec[] = [];
const twigColors: string[] = [];
const TWIG_COLS = ["#4a3a30", "#5a4636", "#3d312a", "#6a5441"];
const twig = (base: [number, number, number], tiltX: number, tiltZ: number, len: number, w: number, col: string, zOff: number) => {
  // Euler ZYX applied to +Y: (-sin(tz)cos(tx), cos(tz)cos(tx), sin(tx))
  const dx = -Math.sin(tiltZ) * Math.cos(tiltX);
  const dy = Math.cos(tiltZ) * Math.cos(tiltX);
  const dz = Math.sin(tiltX);
  twigTransforms.push({
    position: [base[0] + (dx * len) / 2, base[1] + (dy * len) / 2, base[2] + zOff + (dz * len) / 2],
    rotation: [tiltX, 0, tiltZ],
    scale: [w, len, w]
  });
  twigColors.push(col);
  return [base[0] + dx * len, base[1] + dy * len, base[2] + zOff + dz * len] as [number, number, number];
};
for (let n = 0; n < 30; n += 1) {
  const z = rnd() * P;
  const x = centerX(z) + (rnd() * 2 - 1) * (halfWidth(z) + 2);
  const base: [number, number, number] = [x, height(x, z) - 0.05, z];
  const sz = 0.6 + rnd() * 0.8;
  const col = TWIG_COLS[Math.floor(rnd() * TWIG_COLS.length)]!;
  for (const k of copies) {
    const zz = z + k * P;
    if (zz < Z_MIN + 2 || zz > Z_MAX - 2) continue;
    const kb: [number, number, number] = [base[0], base[1], base[2]];
    // re-seed per copy so every copy of a shrub is identical
    const saved = seed;
    seed = (Math.floor(z * 1000) + n * 7919) >>> 0;
    const branches = 7 + Math.floor(rnd() * 4);
    for (let b = 0; b < branches; b += 1) {
      const tx = (rnd() - 0.5) * 1.3;
      const tz = (rnd() - 0.5) * 1.3;
      const len = sz * (0.7 + rnd() * 0.7);
      const tip = twig(kb, tx, tz, len, 0.035, col, k * P);
      for (let s = 0; s < 2; s += 1) {
        twig(tip, tx + (rnd() - 0.5) * 1.8, tz + (rnd() - 0.5) * 1.8, len * 0.5, 0.02, col, 0);
      }
    }
    seed = saved;
  }
}

// ---------------------------------------------------------------- scene
const SUN_DIR: [number, number, number] = [0.72, 0.1, 0.69];
const sunAt = (target: [number, number, number], dist: number): [number, number, number] => [
  target[0] + SUN_DIR[0] * dist,
  target[1] + SUN_DIR[1] * dist,
  target[2] + SUN_DIR[2] * dist
];

const SPEED = 3.2; // metres per second
const LOOP_SECONDS = P / SPEED;

const poseAt = (time: number) => {
  const z = (time * SPEED) % P;
  const phase = (time / LOOP_SECONDS) * Math.PI * 2;
  const drift = 2.6 * Math.sin(phase * 3) + 1.2 * Math.sin(phase * 5 + 1);
  const x = centerX(z) + drift;
  const y = height(x, z) + 1.75;
  const la = 16;
  const zt = z + la;
  const xt = centerX(zt) + drift * 0.3 + 0.8 * Math.sin(phase * 4 + 0.5);
  const yt = height(xt, zt) * 0.5 + y * 0.5 - 0.3;
  return {
    position: [x, y, z] as [number, number, number],
    target: [xt, yt + 4.2, zt] as [number, number, number]
  };
};
const first = poseAt(0);

const app = createAuraApp("#app", {
  scene: scene({ background: "#3a2f5e" })
    .add(
      sky.gradient({
        zenith: "#2a2f7a",
        horizon: "#f08a5d",
        ground: "#6b3a4a",
        exponent: 1.2,
        horizonGlow: 1,
        sun: { elevationDeg: 7, azimuthDeg: 45, intensity: 1.2, color: "#ffb070", discSize: 1.4 },
        bands: [
          { elevationDeg: 6, widthDeg: 10, color: "#e0488e", intensity: 0.7 },
          { elevationDeg: 18, widthDeg: 14, color: "#8a4aa8", intensity: 0.45 }
        ],
        clouds: { coverage: 0.25, speed: 0.01, color: "#ff9a7a" }
      })
    )
    .add(environments.neutral({ intensity: 0.15, background: false }))
    .add(lights.hemisphere({ skyColor: "#5a58b0", groundColor: "#b05a38", intensity: 0.35 }))
    .add(
      lights
        .directional({
          name: "sun",
          position: sunAt(first.position, 120),
          target: first.position,
          intensity: 2.2,
          color: "#ff9a55",
          shadow: true
        })
        .runtime({ id: "sun", mutable: true })
    )
    .add(
      geometry.custom(buildTerrain(), {
        name: "canyon",
        material: material.pbr({ color: "#ffffff", roughness: 0.95 })
      })
    )
    .add(
      instances
        .sphere({
          name: "boulders",
          transforms: boulderTransforms,
          colors: boulderColors,
          material: material.pbr({ color: "#ffffff", roughness: 0.92 })
        })
    )
    .add(
      instances
        .cylinder({
          name: "twigs",
          transforms: twigTransforms,
          colors: twigColors,
          material: material.pbr({ color: "#ffffff", roughness: 0.95 })
        })
    )
    .add(effects.fog({ color: "#b8708f", density: 0.0065, affectsBackground: false }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.6 }))
    .camera(camera.perspective({ position: first.position, target: first.target, fov: 62, near: 0.2, far: 420 }))
});

let ready = false;
app.onFrame((f) => {
  const p = poseAt(f.time);
  app.camera?.setPose({ position: p.position, target: p.target, fov: 62 }, { cut: true });
  const sun = app.nodes.get?.("sun");
  if (sun) {
    const tgt: [number, number, number] = [p.position[0], 0, p.position[2] + 20];
    sun.setPosition(...sunAt(tgt, 120));
  }
  if (!ready) {
    ready = true;
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});
void app.ready();
