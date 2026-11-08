import { camera, createAuraApp, effects, environments, group, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; wheelCount: number; spokeCount: number; plankCount: number };
  }
}

// ---------- helpers ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

const hsl = (h: number, s: number, l: number): string => {
  const sn = s / 100, ln = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number): number => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
};

type V3 = [number, number, number];
type Part = ReturnType<typeof primitives.box>;

const matCache = new Map<string, ReturnType<typeof material.pbr>>();
const mat = (color: string, roughness = 0.85, metallic = 0): ReturnType<typeof material.pbr> => {
  const key = `${color}|${roughness}|${metallic}`;
  let m = matCache.get(key);
  if (!m) {
    m = material.pbr({ color, roughness, metallic });
    matCache.set(key, m);
  }
  return m;
};
const wood = (): ReturnType<typeof material.pbr> => mat(hsl(range(25, 35), range(32, 46), range(27, 40)), 0.9);
const IRON = "#4b4e57";
const iron = (): ReturnType<typeof material.pbr> => mat(IRON, 0.5, 0.65);

let uid = 0;
const box = (size: V3, pos: V3, m: ReturnType<typeof material.pbr>, rot: V3 = [0, 0, 0]): Part =>
  primitives.box({ name: `box${uid++}`, size, material: m }).position(...pos).rotate(...rot);
const cyl = (size: V3, pos: V3, m: ReturnType<typeof material.pbr>, rot: V3 = [0, 0, 0]): Part =>
  primitives.cylinder({ name: `cyl${uid++}`, size, material: m }).position(...pos).rotate(...rot);
const sph = (size: V3, pos: V3, m: ReturnType<typeof material.pbr>, rot: V3 = [0, 0, 0]): Part =>
  primitives.sphere({ name: `sph${uid++}`, size, material: m }).position(...pos).rotate(...rot);

const parts: Part[] = [];

// ---------- dimensions ----------
const AXLE_Y = 0.56;
const FLOOR_Y = 0.8; // centre of floor planks
const FLOOR_TOP = 0.825;
const HALF_L = 0.9; // bed half length (x)
const HALF_W = 0.66; // bed half width (z)

// ---------- bed: floor planks ----------
let plankCount = 0;
const PLANKS = 8;
for (let i = 0; i < PLANKS; i += 1) {
  const w = 1.32 / PLANKS;
  const len = 1.78 + range(-0.05, 0.05);
  const th = 0.05 + range(-0.004, 0.006);
  parts.push(box([len, th, w - 0.008], [range(-0.02, 0.02), FLOOR_Y + range(-0.004, 0.004), -HALF_W + w * (i + 0.5)], wood(), [0, range(-0.015, 0.015), range(-0.006, 0.006)]));
  plankCount += 1;
}
// under-floor battens
for (const bx of [-0.6, 0.6]) parts.push(box([0.08, 0.04, 1.42], [bx, 0.745, 0], wood()));

// side wall boards (2 per side), end boards (1 per end)
for (const s of [-1, 1]) {
  for (let j = 0; j < 2; j += 1) {
    parts.push(box([1.84 + range(-0.04, 0.04), 0.15, 0.035], [range(-0.02, 0.02), 0.91 + j * 0.16, s * HALF_W], wood(), [0, 0, range(-0.01, 0.01)]));
    plankCount += 1;
  }
  parts.push(box([0.035, 0.15, 1.3 + range(-0.02, 0.02)], [s * HALF_L, 0.91, 0], wood(), [range(-0.01, 0.01), 0, 0]));
  plankCount += 1;
}

// corner posts
const postH = 0.68;
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  parts.push(box([0.08, postH, 0.08], [sx * HALF_L, FLOOR_TOP + postH / 2 - 0.03, sz * HALF_W], wood(), [0, 0, range(-0.01, 0.01)]));
  parts.push(sph([0.07, 0.07, 0.07], [sx * HALF_L, FLOOR_TOP + postH - 0.03, sz * HALF_W], wood()));
}
// cross rails: 2 per side (all four sides)
for (const s of [-1, 1]) {
  for (const ry of [1.22, 1.4]) {
    parts.push(box([1.84, 0.06, 0.04], [0, ry, s * HALF_W], wood(), [0, 0, range(-0.008, 0.008)]));
  }
  for (const ry of [1.08, 1.3]) {
    parts.push(box([0.04, 0.06, 1.3], [s * HALF_L, ry, 0], wood(), [range(-0.008, 0.008), 0, 0]));
  }
}

// iron straps and bolts on the long sides
for (const s of [-1, 1]) {
  for (const sx of [-0.62, 0, 0.62]) {
    parts.push(box([0.05, 0.4, 0.012], [sx, 1.0, s * (HALF_W + 0.026)], iron()));
    for (const by of [0.88, 1.12]) parts.push(cyl([0.03, 0.02, 0.03], [sx, by, s * (HALF_W + 0.04)], iron(), [Math.PI / 2, 0, 0]));
  }
  // bolts at post tops
  for (const sx of [-1, 1]) {
    parts.push(cyl([0.032, 0.02, 0.032], [sx * HALF_L, 1.2, s * (HALF_W + 0.042)], iron(), [Math.PI / 2, 0, 0]));
    parts.push(cyl([0.032, 0.02, 0.032], [sx * HALF_L, 0.95, s * (HALF_W + 0.042)], iron(), [Math.PI / 2, 0, 0]));
  }
}
// iron strap across the floor underside
for (const bx of [-0.6, 0.6]) parts.push(box([0.05, 0.015, 1.46], [bx, 0.718, 0], iron()));

// ---------- chassis: push handles, cross bar, axle, prop legs ----------
const slope = 0.04;
const handleY = (x: number): number => 0.66 + (0.9 - x) * slope;
for (const s of [-1, 1]) {
  // x from 1.1 to -1.9 -> centre -0.4
  parts.push(box([3.0, 0.07, 0.09], [-0.4, handleY(-0.4), s * 0.5], wood(), [0, 0, -Math.atan(slope)]));
  // rounded grip end
  parts.push(sph([0.1, 0.1, 0.1], [-1.9, handleY(-1.9), s * 0.5], wood()));
  parts.push(cyl([0.075, 0.28, 0.075], [-1.7, handleY(-1.7) + 0.045, s * 0.5], wood(), [0, 0, Math.PI / 2 - Math.atan(slope)]));
  // front prop leg
  parts.push(box([0.07, 0.64, 0.07], [1.03, 0.32, s * 0.5], wood(), [0, 0, 0.06]));
  parts.push(box([0.12, 0.04, 0.12], [1.01, 0.02, s * 0.5], wood()));
  parts.push(box([0.05, 0.1, 0.1], [1.02, 0.55, s * 0.5], iron()));
}
parts.push(box([0.07, 0.07, 1.0], [1.03, 0.3, 0], wood())); // prop cross brace
parts.push(box([0.08, 0.08, 1.14], [-1.15, handleY(-1.15) - 0.01, 0], wood())); // handle cross bar
parts.push(box([0.08, 0.08, 1.14], [1.0, 0.64, 0], wood())); // front cross bar
// axle
parts.push(cyl([0.08, 2.14, 0.08], [0, AXLE_Y, 0], wood(), [Math.PI / 2, 0, 0]));
// axle brackets (iron) and linchpins
for (const s of [-1, 1]) {
  parts.push(box([0.14, 0.05, 0.12], [0, 0.66, s * 0.5], iron()));
  parts.push(cyl([0.03, 0.06, 0.03], [0, AXLE_Y, s * 1.04], iron(), [Math.PI / 2, 0, 0]));
}

// ---------- wheels ----------
const SPOKES = 10;
const FELLOES = 10;
const RIM_R = 0.5;
const wheelGroup = (id: string, z: number): ReturnType<typeof group> => {
  const kids: Part[] = [];
  // hub + iron bands
  kids.push(cyl([0.2, 0.28, 0.2], [0, 0, 0], wood(), [Math.PI / 2, 0, 0]));
  kids.push(cyl([0.15, 0.2, 0.15], [0, 0, 0], wood(), [Math.PI / 2, 0, 0]));
  for (const dz of [-0.11, 0.11]) kids.push(cyl([0.225, 0.04, 0.225], [0, 0, dz], iron(), [Math.PI / 2, 0, 0]));
  kids.push(cyl([0.12, 0.03, 0.12], [0, 0, Math.sign(z) * 0.145], iron(), [Math.PI / 2, 0, 0]));
  // spokes
  for (let i = 0; i < SPOKES; i += 1) {
    const a = (i / SPOKES) * Math.PI * 2;
    kids.push(box([0.4, 0.05, 0.045], [Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0], wood(), [0, 0, a]));
  }
  // felloes (rim segments) and iron tyre segments
  const chord = 2 * RIM_R * Math.tan(Math.PI / FELLOES);
  for (let i = 0; i < FELLOES; i += 1) {
    const a = ((i + 0.5) / FELLOES) * Math.PI * 2;
    const p: V3 = [Math.cos(a) * RIM_R, Math.sin(a) * RIM_R, 0];
    kids.push(box([chord * 1.02, 0.07, 0.11], p, wood(), [0, 0, a + Math.PI / 2]));
    kids.push(box([chord * 1.03, 0.022, 0.135], [Math.cos(a) * (RIM_R + 0.045), Math.sin(a) * (RIM_R + 0.045), 0], iron(), [0, 0, a + Math.PI / 2]));
    // nails on tyre
    kids.push(sph([0.03, 0.03, 0.03], [Math.cos(a) * (RIM_R + 0.058), Math.sin(a) * (RIM_R + 0.058), 0.04], iron()));
  }
  return group(id, kids, { position: [0, AXLE_Y, z] }).runtime({ id, mutable: true });
};

// ---------- cargo ----------
const burlap = (): ReturnType<typeof material.pbr> => mat(hsl(range(36, 44), range(32, 42), range(50, 62)), 1);
const cargo: Part[] = [];
const sack = (x: number, z: number, s: number, ry: number, baseY = FLOOR_TOP): void => {
  const m = burlap();
  cargo.push(sph([0.46 * s, 0.5 * s, 0.4 * s], [x, baseY + 0.23 * s, z], m, [0, ry, 0]));
  cargo.push(sph([0.36 * s, 0.3 * s, 0.34 * s], [x + 0.02, baseY + 0.43 * s, z], m, [0, ry, 0.1]));
  cargo.push(cyl([0.1 * s, 0.1 * s, 0.1 * s], [x + 0.02, baseY + 0.55 * s, z], m, [0, ry, 0.15]));
  cargo.push(cyl([0.115 * s, 0.025, 0.115 * s], [x + 0.02, baseY + 0.5 * s, z], mat("#5b4128", 0.9), [0, ry, 0.15]));
};
const barrel = (x: number, z: number, r: number, h: number, baseY: number): void => {
  const m = wood();
  const d = r * 2;
  cargo.push(cyl([d, h * 0.5, d], [x, baseY + h / 2, z], m));
  cargo.push(cyl([d * 0.9, h * 0.26, d * 0.9], [x, baseY + h * 0.13, z], m));
  cargo.push(cyl([d * 0.9, h * 0.26, d * 0.9], [x, baseY + h * 0.87, z], m));
  cargo.push(cyl([d * 0.84, 0.012, d * 0.84], [x, baseY + h + 0.003, z], mat("#6b4a2a", 0.9)));
  for (const f of [0.1, 0.3, 0.7, 0.9]) {
    const hr = f === 0.3 || f === 0.7 ? d * 1.015 : d * 0.915;
    cargo.push(cyl([hr, 0.03, hr], [x, baseY + h * f, z], iron()));
  }
};
const crate = (x: number, z: number, sx: number, sy: number, sz: number, ry: number, baseY: number): void => {
  const m = wood();
  const cy = baseY + sy / 2;
  cargo.push(box([sx, sy, sz], [x, cy, z], m, [0, ry, 0]));
  const bat = mat(hsl(range(22, 30), 35, 22), 0.9);
  const c = Math.cos(ry), s = Math.sin(ry);
  // edge battens on four vertical corners and top/bottom frames (rotated with the crate)
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) {
    const lx = ex * sx * 0.5, lz = ez * sz * 0.5;
    cargo.push(box([0.045, sy + 0.01, 0.045], [x + lx * c + lz * s, cy, z - lx * s + lz * c], bat, [0, ry, 0]));
  }
  for (const ey of [-1, 1]) {
    const yy = cy + ey * (sy * 0.5 - 0.02);
    for (const ez of [-1, 1]) {
      const lz = ez * sz * 0.5;
      cargo.push(box([sx + 0.01, 0.04, 0.03], [x + lz * s, yy, z + lz * c], bat, [0, ry, 0]));
    }
    for (const ex of [-1, 1]) {
      const lx = ex * sx * 0.5;
      cargo.push(box([0.03, 0.04, sz + 0.01], [x + lx * c, yy, z - lx * s], bat, [0, ry, 0]));
    }
  }
};

barrel(-0.55, -0.33, 0.22, 0.52, FLOOR_TOP);
barrel(-0.55, 0.32, 0.2, 0.46, FLOOR_TOP);
sack(-0.05, -0.28, 1.0, 0.4);
sack(-0.08, 0.34, 0.95, -0.3);
sack(0.28, 0.3, 0.9, 0.9);
crate(0.52, -0.3, 0.42, 0.38, 0.42, 0.12, FLOOR_TOP);
crate(0.5, -0.3, 0.3, 0.26, 0.3, -0.35, FLOOR_TOP + 0.38);
crate(0.64, 0.32, 0.3, 0.3, 0.34, 0.2, FLOOR_TOP);
// a sack lashed on top of the load
sack(-0.35, 0.0, 0.85, 1.4);
// ground props: sack and barrel by the prop leg
sack(1.65, 0.75, 0.9, 0.5, 0);
{
  const m = wood();
  const r = 0.2, h = 0.46;
  const bx = 1.55, bz = -0.8;
  cargo.push(cyl([r * 2, h * 0.5, r * 2], [bx, h / 2, bz], m));
  cargo.push(cyl([r * 1.8, h * 0.26, r * 1.8], [bx, h * 0.13, bz], m));
  cargo.push(cyl([r * 1.8, h * 0.26, r * 1.8], [bx, h * 0.87, bz], m));
  for (const f of [0.1, 0.3, 0.7, 0.9]) {
    const hr = f === 0.3 || f === 0.7 ? r * 2.03 : r * 1.83;
    cargo.push(cyl([hr, 0.03, hr], [bx, h * f, bz], iron()));
  }
  cargo.push(cyl([r * 1.7, 0.012, r * 1.7], [bx, h + 0.003, bz], mat("#6b4a2a", 0.9)));
}

// ---------- ground and stones ----------
const dirtPatches: Part[] = [];
const patchCols = ["#7a5a3a", "#94724a", "#6e5034", "#85663f", "#a08052"];
for (let i = 0; i < 14; i += 1) {
  const a = range(0, Math.PI * 2), r = range(2, 11);
  const d = range(1.5, 4);
  dirtPatches.push(
    primitives
      .cylinder({ name: `patch${i}`, size: [d, 0.01, d * range(0.6, 1)], material: mat(patchCols[i % patchCols.length]!, 1), castShadow: false })
      .position(Math.cos(a) * r, 0.006 + i * 0.0003, Math.sin(a) * r)
      .rotate(0, range(0, 3), 0)
  );
}
const stones: AuraTransformSpec[] = [];
const stoneColors: string[] = [];
let tries = 0;
while (stones.length < 22 && tries < 500) {
  tries += 1;
  const a = range(0, Math.PI * 2), r = range(1.5, 9);
  const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8;
  if (x > -2.4 && x < 2.1 && Math.abs(z) < 1.45) continue; // keep the cart footprint clear
  const s = range(0.12, 0.42) * (rand() < 0.2 ? 1.8 : 1);
  stones.push({ position: [x, s * 0.22, z], rotation: [range(-0.3, 0.3), range(0, 6), range(-0.3, 0.3)], scale: [s * range(0.9, 1.4), s * range(0.55, 0.8), s * range(0.8, 1.2)] });
  stoneColors.push(hsl(range(25, 40), range(4, 12), range(38, 62)));
}

// ---------- scene ----------
let sc = scene({ background: "#d9c8a4" })
  .camera(camera.orbit({ position: [4.6, 2.7, 5.6], target: [-0.25, 0.75, 0], fov: 40, near: 0.1, far: 200, autoRotate: 0.22 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffe9c4", groundColor: "#7b5a3a", intensity: 0.8 }))
  .add(
    lights.directional({
      name: "sun",
      position: [6, 8, 4],
      target: [0, 0.5, 0],
      intensity: 3.2,
      color: "#ffdcaa",
      shadow: { mapSize: 2048, filter: "pcf", softness: 2, bias: 0.0005, normalBias: 0.02 }
    })
  )
  .add(effects.fog({ color: "#d9c8a4", density: 0.014 }))
  .add(primitives.plane({ name: "ground", size: [160, 1, 160], material: mat("#8a6a45", 1) }));

for (const p of dirtPatches) sc = sc.add(p);
sc = sc.add(instances.sphere({ name: "stones", transforms: stones, colors: stoneColors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));
for (const p of parts) sc = sc.add(p);
for (const p of cargo) sc = sc.add(p);
sc = sc.add(wheelGroup("wheel-l", -0.85)).add(wheelGroup("wheel-r", 0.85));

const app = createAuraApp("#app", { scene: sc });
let wheelAngle = 0;
app.onFrame((f) => {
  wheelAngle += f.dt * 0.6;
  app.nodes.require("wheel-l").setRotation(0, 0, -wheelAngle);
  app.nodes.require("wheel-r").setRotation(0, 0, -wheelAngle + 0.2);
});
await app.ready();

window.__EVAL_READY__ = true;
window.__TASK_STATE__ = { ready: true, wheelCount: 2, spokeCount: SPOKES * 2, plankCount };
