import { camera, createAuraApp, effects, geometry, group, lights, material, primitives, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { ready: boolean; partCount: number; bandCount: number };
  }
}

type V3 = [number, number, number];
type N = Parameters<typeof group>[1][number];

const parts: N[] = [];
const P = (n: N): N => {
  parts.push(n);
  return n;
};
let uid = 0;
const nm = (s: string): string => `${s}-${uid++}`;

let seed = 4242;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// ---------- mesh helpers (non-indexed, winding fixed to agree with normals) ----------
type Vtx = { p: V3; n: V3 };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  tri(a: Vtx, b: Vtx, c: Vtx): void {
    const g = cross(sub(b.p, a.p), sub(c.p, a.p));
    const avg: V3 = [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]];
    const order = dot(g, avg) >= 0 ? [a, b, c] : [a, c, b];
    for (const v of order) {
      this.pos.push(...v.p);
      this.nor.push(...v.n);
    }
  }
  // flat-shaded convex-solid triangle: outward = away from `inside`
  flat(a: V3, b: V3, c: V3, inside: V3): void {
    let n = norm(cross(sub(b, a), sub(c, a)));
    const centre: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (dot(n, sub(centre, inside)) < 0) n = [-n[0], -n[1], -n[2]];
    this.tri({ p: a, n }, { p: b, n }, { p: c, n });
  }
  quad(a: V3, b: V3, c: V3, d: V3, inside: V3): void {
    this.flat(a, b, c, inside);
    this.flat(a, c, d, inside);
  }
  build(name: string, mat: ReturnType<typeof material.pbr>) {
    const positions = new Float32Array(this.pos);
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k]!, positions[i + k]!);
        max[k] = Math.max(max[k]!, positions[i + k]!);
      }
    }
    return geometry.custom(
      geometry.define({
        positions,
        normals: new Float32Array(this.nor),
        indices: Array.from({ length: positions.length / 3 }, (_, i) => i),
        bounds: { min, max }
      }),
      { name, material: mat }
    );
  }
}

// smooth tapered frustum (side wall) in world coordinates around the Y axis
const frustum = (name: string, y0: number, y1: number, r0: number, r1: number, mat: ReturnType<typeof material.pbr>) => {
  const mb = new MeshBuilder();
  const S = 48;
  const h = y1 - y0;
  const v = (i: number, top: boolean): Vtx => {
    const a = (i / S) * Math.PI * 2;
    const r = top ? r1 : r0;
    return {
      p: [Math.cos(a) * r, top ? y1 : y0, Math.sin(a) * r],
      n: norm([Math.cos(a) * h, r0 - r1, Math.sin(a) * h])
    };
  };
  for (let i = 0; i < S; i += 1) {
    mb.tri(v(i, false), v(i + 1, false), v(i, true));
    mb.tri(v(i + 1, false), v(i + 1, true), v(i, true));
  }
  return mb.build(name, mat);
};

// ---------- materials ----------
const white = material.pbr({ color: "#f3efe6", roughness: 0.7 });
const red = material.pbr({ color: "#c4262e", roughness: 0.65 });
const stone = material.pbr({ color: "#8d8f93", roughness: 0.95 });
const darkMetal = material.pbr({ color: "#2b2e36", metallic: 0.5, roughness: 0.5 });
const glass = material.pbr({ color: "#bfe6f2", roughness: 0.05, opacity: 0.28 });
const lampMat = material.emissive({ color: "#fff4c0", emissive: "#ffd36a", emissiveIntensity: 3 });
const winGlass = material.pbr({ color: "#1b2a3d", metallic: 0.2, roughness: 0.15 });
const doorMat = material.pbr({ color: "#5a3a22", roughness: 0.8 });
const roofMat = material.pbr({ color: "#7d2a22", roughness: 0.8 });
const copper = material.pbr({ color: "#3f8f7a", metallic: 0.4, roughness: 0.5 });
const brass = material.pbr({ color: "#d9b24a", metallic: 0.8, roughness: 0.3 });

// ---------- tower geometry ----------
const BASE_Y = 0.5; // top of the island
const BAND_H = 2.8;
const BANDS = 5;
const TOP_Y = BASE_Y + BAND_H * BANDS; // 14.5
const rAt = (y: number): number => 2.3 - 0.0643 * (y - BASE_Y);

let sc = scene({ background: "#a9cbe4" })
  .camera(camera.orbit({ position: [0, 11, 46], target: [0, 8.5, 0], fov: 40, near: 1, far: 900, autoRotate: 0.15 }))
  .add(sky.gradient({ zenith: "#4f8ccc", horizon: "#cfe3f0" }))
  .add(lights.hemisphere({ skyColor: "#cfe3f5", groundColor: "#6a7a6a", intensity: 0.9 }))
  .add(lights.directional({ name: "key", position: [40, 60, 30], target: [0, 6, 0], intensity: 3.2, color: "#fff1d6", shadow: true }))
  .add(lights.directional({ name: "fill", position: [-40, 20, -25], target: [0, 6, 0], intensity: 0.9, color: "#9fc0ff" }))
  .add(lights.point({ name: "lamp-light", position: [0, 15.8, 0], intensity: 20, distance: 14, color: "#ffd98a", shadow: false }))
  .add(effects.fog({ color: "#cfe3f0", density: 0.0028 }));

// sea and island
P(primitives.plane({ name: "sea", size: [1400, 1, 1400], material: material.pbr({ color: "#1f6a94", roughness: 0.25 }), castShadow: false }));
P(primitives.cylinder({ name: "island", size: [24, 1.2, 24], material: material.pbr({ color: "#6f8a4a", roughness: 1 }) }).position(0, -0.1, 0));
P(primitives.cylinder({ name: "island-rim", size: [26, 0.6, 26], material: material.pbr({ color: "#b9a77d", roughness: 1 }) }).position(0, -0.2, 0));

// rocks: inner ring around the tower, outer scatter on the shore
const rockMats = ["#6b6d70", "#7a7468", "#58595d", "#857f73", "#4f5054"].map((c) => material.pbr({ color: c, roughness: 0.95 }));
for (let i = 0; i < 9; i += 1) {
  const a = (i / 9) * Math.PI * 2 + rand() * 0.3;
  const r = 2.6 + rand() * 1.0;
  const s = 1.6 + rand() * 1.4;
  P(
    primitives
      .sphere({ name: nm("rock"), size: [s * (1 + rand() * 0.5), s * (0.7 + rand() * 0.4), s * (1 + rand() * 0.5)], material: rockMats[i % rockMats.length]! })
      .position(Math.cos(a) * r, BASE_Y + s * 0.15, Math.sin(a) * r)
      .rotate(rand() * 0.6, rand() * 6, rand() * 0.6)
  );
}
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + rand() * 0.5 + 0.2;
  const r = 10.5 + rand() * 2.5;
  const s = 1.5 + rand() * 2.2;
  P(
    primitives
      .sphere({ name: nm("shore-rock"), size: [s * (1 + rand() * 0.6), s * (0.6 + rand() * 0.5), s * (1 + rand() * 0.4)], material: rockMats[(i + 2) % rockMats.length]! })
      .position(Math.cos(a) * r, 0.1 + s * 0.1, Math.sin(a) * r)
      .rotate(rand() * 0.5, rand() * 6, rand() * 0.5)
  );
}

// tower bands
for (let b = 0; b < BANDS; b += 1) {
  const y0 = BASE_Y + b * BAND_H;
  const y1 = y0 + BAND_H;
  P(frustum(nm(`band-${b}`), y0, y1, rAt(y0), rAt(y1), b % 2 === 0 ? red : white));
}
// foundation plinth
P(primitives.cylinder({ name: "plinth", size: [5.2, 0.5, 5.2], material: stone }).position(0, BASE_Y + 0.15, 0));

// place a box flush on the tower wall at height y, polar angle a
const onWall = (y: number, a: number, off: number): { pos: V3; rotY: number } => {
  const r = rAt(y) + off;
  return { pos: [Math.cos(a) * r, y, Math.sin(a) * r], rotY: Math.PI / 2 - a };
};

// door
{
  const a = Math.PI / 2;
  const frame = onWall(1.9, a, 0.0);
  P(primitives.box({ name: "door-frame", size: [1.35, 2.3, 0.35], material: stone }).position(...frame.pos).rotate(0, frame.rotY, 0));
  const d = onWall(1.8, a, 0.17);
  P(primitives.box({ name: "door", size: [1.0, 1.9, 0.12], material: doorMat }).position(...d.pos).rotate(0, d.rotY, 0));
  const k = onWall(1.8, a + 0.07, 0.3);
  P(primitives.sphere({ name: "door-knob", size: 0.12, material: brass }).position(...k.pos));
  const step = onWall(0.7, a, 0.7);
  P(primitives.box({ name: "door-step", size: [1.8, 0.3, 0.9], material: stone }).position(...step.pos).rotate(0, step.rotY, 0));
}

// windows spiralling up the tower
const WINDOWS = 6;
for (let i = 0; i < WINDOWS; i += 1) {
  const y = 4.2 + i * 1.8;
  const a = Math.PI / 2 + 0.9 + i * 1.15;
  const f = onWall(y, a, 0.0);
  P(primitives.box({ name: nm("window-frame"), size: [0.62, 0.95, 0.3], material: stone }).position(...f.pos).rotate(0, f.rotY, 0));
  const g = onWall(y, a, 0.1);
  P(primitives.box({ name: nm("window"), size: [0.4, 0.72, 0.22], material: winGlass }).position(...g.pos).rotate(0, g.rotY, 0));
}

// gallery: corbel, floor, railing
P(frustum("corbel", TOP_Y - 0.35, TOP_Y, rAt(TOP_Y - 0.35) + 0.04, 2.15, darkMetal));
P(primitives.cylinder({ name: "gallery-floor", size: [4.5, 0.3, 4.5], material: darkMetal }).position(0, TOP_Y + 0.15, 0));
const GY = TOP_Y + 0.3;
const RAIL_N = 16;
const RR = 2.08;
for (let i = 0; i < RAIL_N; i += 1) {
  const a = (i / RAIL_N) * Math.PI * 2;
  P(primitives.cylinder({ name: nm("post"), size: [0.09, 1.0, 0.09], material: darkMetal }).position(Math.cos(a) * RR, GY + 0.5, Math.sin(a) * RR));
  const am = a + Math.PI / RAIL_N;
  const rm = RR * Math.cos(Math.PI / RAIL_N);
  const chord = 2 * RR * Math.sin(Math.PI / RAIL_N) + 0.04;
  P(primitives.box({ name: nm("rail-top"), size: [chord, 0.09, 0.1], material: darkMetal }).position(Math.cos(am) * rm, GY + 1.0, Math.sin(am) * rm).rotate(0, Math.PI / 2 - am, 0));
  P(primitives.box({ name: nm("rail-mid"), size: [chord, 0.05, 0.05], material: darkMetal }).position(Math.cos(am) * rm, GY + 0.5, Math.sin(am) * rm).rotate(0, Math.PI / 2 - am, 0));
}

// lantern room
const LH = 2.0;
const LR = 1.1;
P(primitives.cylinder({ name: "lamp-pedestal", size: [0.5, 0.7, 0.5], material: darkMetal }).position(0, GY + 0.35, 0));
P(primitives.sphere({ name: "lamp", size: 0.75, material: lampMat }).position(0, GY + 1.0, 0));
P(primitives.cylinder({ name: "lens-ring-low", size: [0.95, 0.08, 0.95], material: brass }).position(0, GY + 0.62, 0));
P(primitives.cylinder({ name: "lens-ring-high", size: [0.95, 0.08, 0.95], material: brass }).position(0, GY + 1.4, 0));
P(primitives.cylinder({ name: "lantern-glass", size: [LR * 2, LH, LR * 2], material: glass, castShadow: false }).position(0, GY + LH / 2, 0));
for (let i = 0; i < 8; i += 1) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  P(primitives.cylinder({ name: nm("mullion"), size: [0.08, LH, 0.08], material: darkMetal }).position(Math.cos(a) * LR, GY + LH / 2, Math.sin(a) * LR));
}
P(primitives.cylinder({ name: "lantern-base", size: [2.5, 0.15, 2.5], material: darkMetal }).position(0, GY + 0.07, 0));
P(primitives.cylinder({ name: "lantern-top-ring", size: [2.6, 0.22, 2.6], material: darkMetal }).position(0, GY + LH + 0.11, 0));

// roof and finial
const ROOF_Y = GY + LH + 0.22;
P(primitives.cone({ name: "roof", size: [2.9, 1.6, 2.9], material: copper }).position(0, ROOF_Y + 0.8, 0));
P(primitives.sphere({ name: "finial-ball", size: 0.34, material: brass }).position(0, ROOF_Y + 1.7, 0));
P(primitives.cylinder({ name: "finial-spike", size: [0.07, 0.7, 0.07], material: brass }).position(0, ROOF_Y + 2.1, 0));

// ---------- keeper's cottage ----------
{
  const x0 = 5.4, x1 = 9.4, z0 = 2.8, z1 = 5.8, wallTop = BASE_Y + 2.3;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P(primitives.box({ name: "cottage-body", size: [x1 - x0, 2.3, z1 - z0], material: material.pbr({ color: "#e8dcc2", roughness: 0.85 }) }).position(cx, BASE_Y + 1.15, cz));
  P(primitives.box({ name: "cottage-foundation", size: [x1 - x0 + 0.2, 0.3, z1 - z0 + 0.2], material: stone }).position(cx, BASE_Y + 0.1, cz));
  // gable roof prism
  const ox = 0.4, oz = 0.4, ridge = wallTop + 1.5, ey = wallTop - 0.05;
  const A0: V3 = [x0 - ox, ey, z0 - oz], B0: V3 = [x0 - ox, ey, z1 + oz], C0: V3 = [x0 - ox, ridge, cz];
  const A1: V3 = [x1 + ox, ey, z0 - oz], B1: V3 = [x1 + ox, ey, z1 + oz], C1: V3 = [x1 + ox, ridge, cz];
  const inside: V3 = [cx, ey + 0.5, cz];
  const mb = new MeshBuilder();
  mb.flat(A0, B0, C0, inside);
  mb.flat(A1, B1, C1, inside);
  mb.quad(A0, B0, B1, A1, inside);
  mb.quad(A0, C0, C1, A1, inside);
  mb.quad(B0, C0, C1, B1, inside);
  P(mb.build("cottage-roof", roofMat));
  P(primitives.box({ name: "chimney", size: [0.55, 1.4, 0.55], material: material.pbr({ color: "#7b4a3a", roughness: 0.95 }) }).position(x1 - 1.0, ridge - 0.1, cz - 0.5));
  // door on the face towards the tower
  P(primitives.box({ name: "cottage-door", size: [0.14, 1.5, 0.85], material: doorMat }).position(x0 - 0.02, BASE_Y + 0.85, cz + 0.2));
  // windows on the front (+z) face
  for (let i = 0; i < 2; i += 1) {
    const wx = x0 + 1.1 + i * 2.0;
    P(primitives.box({ name: nm("cottage-window-frame"), size: [0.95, 0.85, 0.12], material: white }).position(wx, BASE_Y + 1.35, z1 + 0.02));
    P(primitives.box({ name: nm("cottage-window"), size: [0.72, 0.62, 0.16], material: winGlass }).position(wx, BASE_Y + 1.35, z1 + 0.04));
  }
}

for (const n of parts) sc = sc.add(n);

const app = createAuraApp("#app", { scene: sc });
await app.ready();

window.__TASK_STATE__ = { ready: true, partCount: parts.length, bandCount: BANDS };
window.__EVAL_READY__ = true;
