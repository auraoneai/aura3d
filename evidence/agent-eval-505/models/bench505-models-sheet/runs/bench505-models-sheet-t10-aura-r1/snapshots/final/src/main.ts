import { camera, createAuraApp, effects, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
  }
}

type V3 = [number, number, number];

let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

let sc = scene({ background: "#bcd8ee" })
  .camera(camera.orbit({ position: [0, 15, 58], target: [0, 11, 0], fov: 40, near: 5, far: 700, autoRotate: 0.12 }))
  .add(sky.gradient({ zenith: "#4f8fd0", horizon: "#cfe4f2" }))
  .add(lights.hemisphere({ skyColor: "#cfe3f5", groundColor: "#6d7a66", intensity: 1.0 }))
  .add(lights.directional({ name: "key", position: [40, 60, 30], target: [0, 8, 0], intensity: 3.2, color: "#fff2dc", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-40, 20, -20], target: [0, 8, 0], intensity: 0.7, color: "#bcd4ff" }))
  .add(effects.fog({ color: "#cfe4f2", density: 0.0016 }));

let partCount = 0;
const add = (node: Parameters<typeof sc.add>[0]): void => {
  sc = sc.add(node);
  partCount += 1;
};

const pbr = (color: string, roughness = 0.8, metallic = 0) => material.pbr({ color, roughness, metallic });

// ---------- materials ----------
const white = pbr("#f4f1ea", 0.7);
const red = pbr("#c42a22", 0.65);
const stone = pbr("#8a8d90", 0.95);
const darkIron = pbr("#25292f", 0.5, 0.6);
const windowGlass = pbr("#1c2c3f", 0.15, 0.3);
const frameMat = pbr("#2b2f36", 0.6);
const doorMat = pbr("#5a3418", 0.75);
const glassMat = material.pbr({ color: "#bfe3f2", roughness: 0.05, opacity: 0.28 });
const lampMat = material.emissive({ color: "#ffe9a8", emissive: "#ffd36a", emissiveIntensity: 3 });
const warmWindow = material.emissive({ color: "#ffd88a", emissive: "#ffb84d", emissiveIntensity: 1.5 });

// ---------- sea and island ----------
add(primitives.plane({ name: "sea", size: [900, 1, 900], material: material.pbr({ color: "#2b79a8", roughness: 0.12 }), castShadow: false }));
add(primitives.cylinder({ name: "shallows", size: [44, 0.2, 44], material: pbr("#5fb0b8", 0.3), castShadow: false }).position(0, 0.05, 0));
add(primitives.cylinder({ name: "island-sand", size: [34, 0.7, 34], material: pbr("#cdbb8a", 1) }).position(0, 0.15, 0));
add(primitives.cylinder({ name: "island-grass", size: [30, 0.3, 30], material: pbr("#6f9150", 1), params: { radiusTop: 0.46, radiusBottom: 0.5 } }).position(0, 0.6, 0));
add(primitives.cylinder({ name: "rock-platform", size: [11, 1.6, 11], material: pbr("#7b7e82", 1), params: { radiusTop: 0.42, radiusBottom: 0.5 } }).position(0, 0.8, 0));

// irregular rocks
const rockShades = ["#6f7276", "#85888b", "#5f6367", "#979a9c", "#76706a"];
const rockAt = (name: string, ang: number, r: number, base: number, sx: number, sy: number, sz: number): void => {
  add(primitives.sphere({ name, size: [sx, sy, sz], material: pbr(rockShades[Math.floor(rand() * rockShades.length)]!, 1) })
    .position(Math.sin(ang) * r, base + sy * 0.25, Math.cos(ang) * r)
    .rotate(rand() * 0.6, rand() * 6.28, rand() * 0.6));
};
for (let i = 0; i < 12; i += 1) {
  const a = (i / 12) * Math.PI * 2 + rand() * 0.4;
  rockAt(`base-rock-${i}`, a, 4.6 + rand() * 1.8, 0.3, 2 + rand() * 2.2, 1.4 + rand() * 1.8, 2 + rand() * 2);
}
for (let i = 0; i < 10; i += 1) {
  const a = (i / 10) * Math.PI * 2 + rand() * 0.5;
  rockAt(`shore-rock-${i}`, a, 16 + rand() * 2.5, 0.0, 1.8 + rand() * 2.5, 1.0 + rand() * 1.6, 1.8 + rand() * 2.2);
}

// ---------- tower ----------
const Y0 = 1.6, H = 16, R0 = 3.0, R1 = 1.9, BANDS = 5;
const bandH = H / BANDS;
const R = (y: number): number => R0 - ((y - Y0) / H) * (R0 - R1);
for (let i = 0; i < BANDS; i += 1) {
  const yb = Y0 + i * bandH, yt = yb + bandH, rb = R(yb), rt = R(yt);
  add(primitives.cylinder({
    name: `band-${i}`,
    size: [rb * 2, bandH, rb * 2],
    material: i % 2 === 0 ? white : red,
    params: { radiusTop: 0.5 * (rt / rb), radiusBottom: 0.5, radialSegments: 48 }
  }).position(0, yb + bandH / 2, 0));
}
const TOP = Y0 + H; // 17.6

// polar placement on the tower surface (facing outward)
const onTower = (ang: number, y: number, extra: number): { p: V3; yaw: number } => {
  const r = R(y) + extra;
  return { p: [Math.sin(ang) * r, y, Math.cos(ang) * r], yaw: ang };
};

// door
{
  const ang = 0.8, y = Y0 + 0.95;
  const d = onTower(ang, y, 0.05);
  add(primitives.box({ name: "door-frame", size: [1.5, 2.2, 0.3], material: frameMat }).position(...onTower(ang, y + 0.1, 0.0).p).rotate(0, d.yaw, 0));
  add(primitives.box({ name: "door", size: [1.1, 1.9, 0.4], material: doorMat }).position(...d.p).rotate(0, d.yaw, 0));
  const k = onTower(ang - 0.12, y, 0.28);
  add(primitives.sphere({ name: "door-knob", size: 0.12, material: pbr("#d8b24a", 0.3, 0.9) }).position(...k.p));
  add(primitives.box({ name: "door-step", size: [1.8, 0.2, 1.0], material: stone }).position(...onTower(ang, Y0 + 0.05, 0.5).p).rotate(0, d.yaw, 0));
}

// spiralling windows
for (let i = 0; i < 6; i += 1) {
  const ang = 1.0 + i * 1.1, y = 4.6 + i * 2.2;
  const f = onTower(ang, y, 0.0), w = onTower(ang, y, 0.04);
  add(primitives.box({ name: `window-frame-${i}`, size: [0.72, 1.0, 0.16], material: frameMat }).position(...f.p).rotate(0, f.yaw, 0));
  add(primitives.box({ name: `window-${i}`, size: [0.5, 0.8, 0.16], material: windowGlass }).position(...w.p).rotate(0, w.yaw, 0));
}

// ---------- gallery ----------
add(primitives.cylinder({ name: "corbel", size: [6, 0.5, 6], material: darkIron, params: { radiusTop: 0.5, radiusBottom: 0.32 } }).position(0, TOP - 0.25, 0));
add(primitives.cylinder({ name: "gallery-deck", size: [6, 0.3, 6], material: darkIron }).position(0, TOP + 0.15, 0));
const RAIL_R = 2.8, POSTS = 16, RAIL_Y = TOP + 1.1;
for (let i = 0; i < POSTS; i += 1) {
  const a = (i / POSTS) * Math.PI * 2;
  add(primitives.cylinder({ name: `rail-post-${i}`, size: [0.1, 1.0, 0.1], material: darkIron, params: { radialSegments: 8 } })
    .position(Math.sin(a) * RAIL_R, TOP + 0.8, Math.cos(a) * RAIL_R));
  const m = a + Math.PI / POSTS;
  const len = 2 * RAIL_R * Math.sin(Math.PI / POSTS) + 0.05;
  const rr = RAIL_R * Math.cos(Math.PI / POSTS);
  add(primitives.box({ name: `rail-${i}`, size: [len, 0.09, 0.09], material: darkIron })
    .position(Math.sin(m) * rr, RAIL_Y, Math.cos(m) * rr).rotate(0, m, 0));
}

// ---------- lantern room ----------
const LB = TOP + 0.3; // 17.9
add(primitives.cylinder({ name: "lantern-base", size: [3.4, 0.4, 3.4], material: red }).position(0, LB + 0.2, 0));
const GL0 = LB + 0.4, GH = 2.2;
add(primitives.cylinder({ name: "lantern-glass", size: [3, GH, 3], material: glassMat, castShadow: false }).position(0, GL0 + GH / 2, 0));
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  add(primitives.box({ name: `mullion-${i}`, size: [0.1, GH, 0.1], material: darkIron }).position(Math.sin(a) * 1.5, GL0 + GH / 2, Math.cos(a) * 1.5));
}
add(primitives.cylinder({ name: "lantern-ring", size: [3.5, 0.25, 3.5], material: darkIron }).position(0, GL0 + GH + 0.12, 0));
add(primitives.cylinder({ name: "lamp-pedestal", size: [0.5, 1.0, 0.5], material: darkIron }).position(0, GL0 + 0.5, 0));
add(primitives.sphere({ name: "lamp", size: 0.95, material: lampMat, castShadow: false }).position(0, GL0 + 1.35, 0));
sc = sc.add(lights.point({ name: "lamp-light", position: [0, GL0 + 1.35, 0], intensity: 25, color: "#ffdc8a", distance: 40 }));

// roof and finial
const ROOF_Y = GL0 + GH + 0.25;
add(primitives.cone({ name: "roof", size: [3.9, 1.6, 3.9], material: red, params: { radialSegments: 48 } }).position(0, ROOF_Y + 0.8, 0));
add(primitives.sphere({ name: "finial-ball", size: 0.4, material: pbr("#d8b24a", 0.3, 0.9) }).position(0, ROOF_Y + 1.65, 0));
add(primitives.cylinder({ name: "finial-spike", size: [0.08, 0.7, 0.08], material: pbr("#d8b24a", 0.3, 0.9) }).position(0, ROOF_Y + 2.05, 0));

// ---------- keeper's cottage ----------
{
  const cx = 8.5, cz = 4.5, gy = 0.75;
  const W = 5, D = 3.6, WH = 2.6;
  add(primitives.box({ name: "cottage-walls", size: [W, WH, D], material: pbr("#ece3cf", 0.9) }).position(cx, gy + WH / 2, cz));
  add(primitives.box({ name: "cottage-plinth", size: [W + 0.2, 0.3, D + 0.2], material: stone }).position(cx, gy + 0.1, cz));
  add(primitives.cone({ name: "cottage-roof", size: [(W + 0.8) * Math.SQRT2, 1.9, (D + 0.8) * Math.SQRT2], material: pbr("#9a3b2a", 0.8), params: { radialSegments: 4 } })
    .position(cx, gy + WH + 0.95, cz).rotate(0, Math.PI / 4, 0));
  add(primitives.box({ name: "chimney", size: [0.7, 1.6, 0.7], material: pbr("#7a4a3a", 0.9) }).position(cx + 1.4, gy + WH + 1.3, cz - 0.4));
  const fz = cz + D / 2;
  add(primitives.box({ name: "cottage-door", size: [0.9, 1.7, 0.12], material: doorMat }).position(cx - 0.4, gy + 0.85, fz + 0.04));
  add(primitives.box({ name: "cottage-step", size: [1.3, 0.15, 0.6], material: stone }).position(cx - 0.4, gy + 0.07, fz + 0.4));
  add(primitives.box({ name: "cottage-window-a", size: [0.9, 0.8, 0.12], material: warmWindow }).position(cx - 1.7, gy + 1.5, fz + 0.04));
  add(primitives.box({ name: "cottage-window-b", size: [0.9, 0.8, 0.12], material: warmWindow }).position(cx + 1.2, gy + 1.5, fz + 0.04));
  add(primitives.box({ name: "cottage-window-side", size: [0.12, 0.8, 0.9], material: warmWindow }).position(cx - W / 2 - 0.02, gy + 1.5, cz));
}

// ---------- finish ----------
const app = createAuraApp("#app", { scene: sc });
await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
  window.__TASK_STATE__ = { ready: true, partCount, bandCount: BANDS };
});
