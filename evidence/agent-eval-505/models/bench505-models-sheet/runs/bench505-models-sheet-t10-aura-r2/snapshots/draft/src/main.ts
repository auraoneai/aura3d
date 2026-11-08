import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
  }
}

const HORIZON = "#d3e4f0";
let sc = scene({ background: HORIZON })
  .camera(camera.orbit({ position: [0, 23, 68], target: [0, 16, 0], fov: 45, near: 1, far: 900, autoRotate: 0.12 }))
  .add(sky.gradient({ zenith: "#4f8fd0", horizon: HORIZON }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#d6e6f5", groundColor: "#6b7a5a", intensity: 0.9 }))
  .add(lights.directional({ name: "key", position: [45, 70, 35], target: [0, 12, 0], intensity: 3.2, color: "#fff1d6", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-40, 25, -30], target: [0, 12, 0], intensity: 0.9, color: "#a9c4ee" }))
  .add(lights.point({ name: "lamp-light", position: [0, 28.3, 0], intensity: 25, distance: 30, decay: 2, color: "#ffd98a" }))
  .add(effects.fog({ color: HORIZON, density: 0.0022 }))
  .add(effects.bloom({ intensity: 0.35, threshold: 0.9, radius: 0.5 }));

let partCount = 0;
const add = (node: Parameters<typeof sc.add>[0]): void => {
  sc = sc.add(node);
  partCount += 1;
};
let uid = 0;
const nm = (base: string): string => `${base}-${uid++}`;

let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- frustum (tapered / elliptical, optionally flat shaded) geometry ----------
interface FrustumOpts {
  rbx: number; rbz: number; rtx: number; rtz: number; h: number;
  segs: number; start?: number; flat?: boolean;
}
const frustum = (name: string, mat: ReturnType<typeof material.pbr>, o: FrustumOpts) => {
  const { rbx, rbz, rtx, rtz, h, segs } = o;
  const start = o.start ?? 0;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const normalAt = (a: number): [number, number, number] => {
    const hx = (rtx - rbx) * Math.cos(a), hy = h, hz = (rtz - rbz) * Math.sin(a);
    const ax = -((rbx + rtx) / 2) * Math.sin(a), az = ((rbz + rtz) / 2) * Math.cos(a);
    const n: [number, number, number] = [hy * az, hz * ax - hx * az, -hy * ax];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  for (let i = 0; i < segs; i += 1) {
    const a0 = start + (i / segs) * Math.PI * 2, a1 = start + ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const base = pos.length / 3;
    const verts: [number, number, number, number][] = [
      [rbx * Math.cos(a0), 0, rbz * Math.sin(a0), a0],
      [rtx * Math.cos(a0), h, rtz * Math.sin(a0), a0],
      [rbx * Math.cos(a1), 0, rbz * Math.sin(a1), a1],
      [rtx * Math.cos(a1), h, rtz * Math.sin(a1), a1]
    ];
    for (const v of verts) {
      pos.push(v[0], v[1], v[2]);
      nor.push(...normalAt(o.flat ? am : v[3]));
    }
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }
  const mx = Math.max(rbx, rtx), mz = Math.max(rbz, rtz);
  return geometry.custom(
    geometry.define({
      positions: new Float32Array(pos),
      normals: new Float32Array(nor),
      indices: idx,
      bounds: { min: [-mx, 0, -mz], max: [mx, h, mz] }
    }),
    { name, material: mat }
  );
};

// ---------- materials ----------
const M = (color: string, roughness = 0.85, extra: Record<string, unknown> = {}) =>
  material.pbr({ color, roughness, doubleSided: true, ...extra });
const matWhite = M("#f4f1ea", 0.7);
const matRed = M("#c4302b", 0.65);
const matDark = M("#2b2f36", 0.6);
const matStone = M("#8d8a84", 0.95);
const matWood = M("#5a3820", 0.8);
const matGlassWin = M("#1f3347", 0.2, { emissive: "#ffcf70", emissiveIntensity: 0.25 });
const matGold = M("#d9b13b", 0.4, { metallic: 0.3 });

// ---------- sea and island ----------
add(primitives.plane({ name: "sea", size: [900, 1, 900], material: material.pbr({ color: "#1c6a94", roughness: 0.12 }), castShadow: false }));
add(primitives.cylinder({
  name: "foam", size: [40, 0.1, 40], castShadow: false,
  material: material.pbr({ color: "#ffffff", roughness: 0.9, opacity: 0.35, alphaMode: "blend" })
}).position(0, 0.06, 0));
add(primitives.cylinder({ name: "ground", size: [25, 3, 25], material: M("#6f8a4a", 1) }).position(0, 1.5, 0));

const rockColors = ["#6e6b66", "#7d7a74", "#5f5d59", "#86827b", "#74706b"];
const rock = (x: number, baseY: number, z: number, wMin: number, wMax: number, hMin: number, hMax: number): void => {
  const rb = range(wMin, wMax);
  const k = range(0.4, 0.7);
  add(
    frustum(nm("rock"), M(rockColors[Math.floor(rand() * rockColors.length)]!, 0.95), {
      rbx: rb * range(0.8, 1.2), rbz: rb * range(0.8, 1.2),
      rtx: rb * k, rtz: rb * k * range(0.7, 1.2),
      h: range(hMin, hMax), segs: 6 + Math.floor(rand() * 2), start: rand() * 6, flat: true
    })
      .position(x, baseY, z)
      .rotate(range(-0.12, 0.12), rand() * 6, range(-0.12, 0.12))
  );
};
for (let i = 0; i < 13; i += 1) {
  const a = (i / 13) * Math.PI * 2 + range(-0.15, 0.15), r = range(12.2, 15.2);
  rock(Math.cos(a) * r, -0.6, Math.sin(a) * r, 1.8, 3.4, 3.2, 5.6);
}
for (let i = 0; i < 4; i += 1) {
  const a = (i / 4) * Math.PI * 2 + 0.6, r = range(5.2, 6.8);
  rock(Math.cos(a) * r, 2.5, Math.sin(a) * r, 1.0, 1.6, 1.4, 2.2);
}
rock(18, -0.6, -6, 1.4, 2.0, 1.6, 2.6);
rock(-17, -0.6, 9, 1.2, 1.8, 1.4, 2.2);

// ---------- tower ----------
const Y0 = 4, H = 22, RB = 3.2, RT = 2.2, BANDS = 7;
const radiusAt = (y: number): number => RB - (RB - RT) * ((y - Y0) / H);
add(primitives.cylinder({ name: "plinth", size: [8, 1.4, 8], material: matStone }).position(0, 3.3, 0));
const bandH = H / BANDS;
for (let i = 0; i < BANDS; i += 1) {
  const y0 = Y0 + i * bandH;
  add(frustum(`band-${i}`, i % 2 === 0 ? matRed : matWhite, {
    rbx: radiusAt(y0), rbz: radiusAt(y0), rtx: radiusAt(y0 + bandH), rtz: radiusAt(y0 + bandH),
    h: bandH, segs: 32
  }).position(0, y0, 0));
}

// door (faces +z)
{
  const y = Y0 + 1.3, r = radiusAt(y);
  add(primitives.box({ name: "door", size: [1.5, 2.6, 0.5], material: matWood }).position(0, y, r));
  add(primitives.box({ name: "door-lintel", size: [2.0, 0.28, 0.6], material: matStone }).position(0, Y0 + 2.75, radiusAt(Y0 + 2.75)));
  add(primitives.sphere({ name: "door-knob", size: 0.18, material: matGold }).position(0.5, y, r + 0.27));
}

// windows spiralling up
for (let i = 0; i < 6; i += 1) {
  const t = 0.17 + i * 0.135, y = Y0 + t * H, r = radiusAt(y), a = Math.PI / 2 + (i + 1) * 1.15;
  add(primitives.box({ name: `window-${i}`, size: [0.7, 1.1, 0.5], material: matGlassWin })
    .position(Math.cos(a) * r, y, Math.sin(a) * r)
    .rotate(0, Math.PI / 2 - a, 0));
}

// ---------- gallery ----------
const GY = Y0 + H; // 26
add(frustum("corbel", matDark, { rbx: 2.2, rbz: 2.2, rtx: 3.6, rtz: 3.6, h: 0.8, segs: 32 }).position(0, GY - 0.8, 0));
add(primitives.cylinder({ name: "gallery-floor", size: [7.4, 0.4, 7.4], material: matDark }).position(0, GY + 0.2, 0));
const POSTS = 16;
for (let i = 0; i < POSTS; i += 1) {
  const a = (i / POSTS) * Math.PI * 2, R = 3.5;
  add(primitives.cylinder({ name: `post-${i}`, size: [0.14, 1.1, 0.14], material: matDark })
    .position(Math.cos(a) * R, GY + 0.95, Math.sin(a) * R));
  const am = a + Math.PI / POSTS;
  add(primitives.box({ name: `rail-${i}`, size: [1.45, 0.1, 0.12], material: matDark })
    .position(Math.cos(am) * R * Math.cos(Math.PI / POSTS), GY + 1.5, Math.sin(am) * R * Math.cos(Math.PI / POSTS))
    .rotate(0, -am - Math.PI / 2, 0));
}

// ---------- lantern room ----------
add(primitives.cylinder({ name: "lantern-base", size: [5.0, 0.3, 5.0], material: matDark }).position(0, GY + 0.55, 0));
add(primitives.cylinder({
  name: "lantern-glass", size: [4.4, 2.7, 4.4], castShadow: false,
  material: material.pbr({ color: "#bfe6f2", roughness: 0.05, opacity: 0.28, alphaMode: "blend", doubleSided: true })
}).position(0, GY + 2.05, 0));
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  add(primitives.box({ name: `mullion-${i}`, size: [0.16, 2.7, 0.16], material: matDark })
    .position(Math.cos(a) * 2.25, GY + 2.05, Math.sin(a) * 2.25));
}
add(primitives.cylinder({ name: "lamp-pedestal", size: [0.8, 1.2, 0.8], material: matDark }).position(0, GY + 1.3, 0));
add(primitives.sphere({
  name: "lamp", size: 1.3, castShadow: false,
  material: material.emissive({ color: "#ffe9a8", emissive: "#ffd36a", emissiveIntensity: 4, roughness: 0.3 })
}).position(0, GY + 2.3, 0));
add(primitives.cylinder({ name: "lantern-ring", size: [5.2, 0.3, 5.2], material: matDark }).position(0, GY + 3.55, 0));

// roof and finial
add(frustum("roof", matRed, { rbx: 3.1, rbz: 3.1, rtx: 0.15, rtz: 0.15, h: 2.4, segs: 32 }).position(0, GY + 3.7, 0));
add(primitives.cylinder({ name: "finial-spike", size: [0.1, 1.1, 0.1], material: matGold }).position(0, GY + 6.5, 0));
add(primitives.sphere({ name: "finial-ball", size: 0.55, material: matGold }).position(0, GY + 6.2, 0));

// ---------- keeper's cottage ----------
{
  const cx = 7.5, cz = 4, gy = 3;
  const matCream = M("#e8dcc0", 0.9);
  const matRoof = M("#8a3b2c", 0.8);
  add(primitives.box({ name: "cottage-walls", size: [5, 2.8, 4], material: matCream }).position(cx, gy + 1.4, cz));
  add(frustum("cottage-roof", matRoof, {
    rbx: 3.0 / Math.SQRT1_2, rbz: 2.5 / Math.SQRT1_2, rtx: 1.2 / Math.SQRT1_2, rtz: 0.03,
    h: 1.5, segs: 4, start: Math.PI / 4, flat: true
  }).position(cx, gy + 2.8, cz));
  add(primitives.box({ name: "cottage-door", size: [0.95, 1.8, 0.2], material: matWood }).position(cx, gy + 0.9, cz + 2.02));
  add(primitives.box({ name: "cottage-window-l", size: [0.9, 0.9, 0.2], material: matGlassWin }).position(cx - 1.6, gy + 1.6, cz + 2.02));
  add(primitives.box({ name: "cottage-window-r", size: [0.9, 0.9, 0.2], material: matGlassWin }).position(cx + 1.6, gy + 1.6, cz + 2.02));
  add(primitives.box({ name: "cottage-chimney", size: [0.7, 1.8, 0.7], material: matStone }).position(cx + 1.3, gy + 4.3, cz - 0.4));
}

const app = createAuraApp("#app", { scene: sc });
await app.ready();
window.__EVAL_READY__ = true;
window.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
