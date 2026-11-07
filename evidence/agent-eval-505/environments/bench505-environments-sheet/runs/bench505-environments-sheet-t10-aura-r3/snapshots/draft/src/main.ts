import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
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

type V3 = [number, number, number];

// ---------- canyon shape (periodic in z so the flythrough can loop) ----------
const L = 240; // period along z
const W = (Math.PI * 2) / L;
const FOG = "#c58a8e";
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const center = (z: number): number => 12 * Math.sin(W * z + 0.5) + 4.5 * Math.sin(2 * W * z + 2.0);
const halfWidth = (z: number, side: number): number => 8.5 + 2.6 * Math.sin(3 * W * z + (side ? 1 : 3));
const noise = (x: number, z: number): number =>
  Math.sin(0.17 * x + 6 * W * z + 1.3) * 0.5 + Math.sin(-0.31 * x + 11 * W * z + 4.1) * 0.3 + Math.sin(0.53 * x + 17 * W * z + 2.2) * 0.2;
const TERRACE = 5.5;

const heightAt = (x: number, z: number): number => {
  const dx = x - center(z);
  const side = dx < 0 ? 0 : 1;
  const n = noise(x, z);
  const s = Math.max(0, Math.abs(dx) - halfWidth(z, side) + n * 2.2);
  const top = 40 + 9 * Math.sin(2 * W * z + side * 2) + 4 * n;
  const hb = top * (1 - Math.exp(-s / 9));
  const t = hb / TERRACE;
  const fl = Math.floor(t);
  const hs = (fl + smooth(0.7, 1, t - fl)) * TERRACE + n * 1.2 * (hb / top);
  const ripple = 0.22 * noise(x * 2.3, z) * (1 - smooth(0, 4, s));
  const riverC = center(z) + 2.5 * Math.sin(5 * W * z);
  const channel = -0.35 * (1 - smooth(1.5, 4.5, Math.abs(x - riverC)));
  return hs + ripple + channel * (1 - smooth(0, 2, s));
};

// ---------- terrain mesh: flat shaded, strata colours ----------
const hex = (h: string): V3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const strata: V3[] = ["#c0663a", "#a24d2e", "#d68a52", "#8b4128", "#e0a06c", "#b65a36", "#74392a", "#cf7a48"].map(hex);
const sand = hex("#d2a876");
const riverSand = hex("#c9b08c");
const dust = hex("#dcae7c");
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const X0 = -80, X1 = 80, DX = 1.6;
const Z_HI = 60, Z_LO = -700, DZ = 2.4;
const NX = Math.round((X1 - X0) / DX);
const NZ = Math.round((Z_HI - Z_LO) / DZ);
const CHUNK = 48; // rows of cells per mesh chunk (keeps vertex count under 65k)

const terrainMat = material.pbr({ color: "#ffffff", roughness: 0.95 });
let sc = scene({ background: FOG })
  .camera(
    camera.follow({
      targetNode: "rig",
      targetOffset: [0, 5, -30],
      offset: [0, -4.5, 30],
      offsetMode: "target-yaw",
      fov: 55,
      near: 0.4,
      far: 520
    })
  )
  .add(sky.gradient({
    zenith: "#2b2f7a",
    horizon: "#f08a5c",
    ground: "#8a4e50",
    exponent: 0.55,
    horizonGlow: 0.9,
    sun: { elevationDeg: 10, azimuthDeg: 25, intensity: 1.2, color: "#ffb070", discSize: 1.5 },
    bands: [{ elevationDeg: 4, widthDeg: 14, color: "#d8409a", intensity: 0.5 }]
  }))
  .add(environments.neutral({ intensity: 0.3, background: false }))
  .add(lights.hemisphere({ skyColor: "#7f7cc8", groundColor: "#b06a4c", intensity: 1.0 }))
  .add(lights.directional({
    name: "sun",
    position: sunPos(10, 25, 150),
    target: [0, 0, 0],
    intensity: 4.2,
    color: "#ff9e5a",
    shadow: { cascades: 3, maxDistance: 260, mapSize: 2048, filter: "pcf" }
  }))
  .add(effects.fog({ color: FOG, density: 0.0072 }))
  .add(effects.bloom({ intensity: 0.3, threshold: 0.85, radius: 0.5 }))
  .add(primitives.sphere({ name: "rig", size: 0.05, castShadow: false, receiveShadow: false }).position(0, 2, 0).runtime({ id: "rig", mutable: true }));

function sunPos(elevationDeg: number, azimuthDeg: number, d: number): V3 {
  const E = (elevationDeg * Math.PI) / 180;
  const A = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
}

for (let c0 = 0; c0 < NZ; c0 += CHUNK) {
  const c1 = Math.min(NZ, c0 + CHUNK);
  const cells = (c1 - c0) * NX;
  const pos = new Float32Array(cells * 18);
  const nor = new Float32Array(cells * 18);
  const col = new Float32Array(cells * 24);
  let p = 0, q = 0;
  let minY = Infinity, maxY = -Infinity;
  const P = (i: number, j: number): V3 => {
    const x = X0 + i * DX, z = Z_HI - j * DZ;
    return [x, heightAt(x, z), z];
  };
  const face = (a: V3, b: V3, c: V3): void => {
    // winding chosen so the geometric normal points up (heightfield)
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as V3;
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as V3;
    let n: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const k = n[1] < 0 ? -1 : 1;
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [(n[0] * k) / l, (n[1] * k) / l, (n[2] * k) / l];
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
    const dxc = cx - center(cz);
    const hw = halfWidth(cz, dxc < 0 ? 0 : 1);
    const nz = noise(cx * 0.8, cz);
    let rgb: V3;
    if (cy < 1.4 && Math.abs(dxc) < hw + 2) {
      const riverC = center(cz) + 2.5 * Math.sin(5 * W * cz);
      rgb = mix(sand, riverSand, 1 - smooth(1.5, 4.5, Math.abs(cx - riverC)));
      rgb = mix(rgb, strata[3]!, 0.08 + 0.06 * nz);
    } else {
      const idx = Math.floor((cy + nz * 1.6) / 3.1);
      rgb = strata[((idx % strata.length) + strata.length) % strata.length]!;
      rgb = mix(rgb, dust, smooth(0.8, 0.98, n[1]) * 0.55);
      rgb = mix(rgb, sand, (1 - smooth(1.5, 7, cy)) * 0.6);
    }
    const v = 0.93 + 0.07 * nz;
    const tri = k > 0 ? [a, b, c] : [a, c, b];
    for (const pt of tri) {
      pos[p] = pt[0]; pos[p + 1] = pt[1]; pos[p + 2] = pt[2];
      nor[p] = n[0]; nor[p + 1] = n[1]; nor[p + 2] = n[2];
      p += 3;
      col[q] = rgb[0] * v; col[q + 1] = rgb[1] * v; col[q + 2] = rgb[2] * v; col[q + 3] = 1;
      q += 4;
      if (pt[1] < minY) minY = pt[1];
      if (pt[1] > maxY) maxY = pt[1];
    }
  };
  for (let j = c0; j < c1; j += 1) {
    for (let i = 0; i < NX; i += 1) {
      face(P(i, j), P(i, j + 1), P(i + 1, j));
      face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1));
    }
  }
  const zA = Z_HI - c1 * DZ, zB = Z_HI - c0 * DZ;
  sc = sc.add(
    geometry.custom(
      geometry.define({
        positions: pos,
        normals: nor,
        colors: col,
        indices: Array.from({ length: p / 3 }, (_, i) => i),
        bounds: { min: [X0, minY - 0.5, zA], max: [X1, maxY + 0.5, zB] }
      }),
      { name: `canyon-${c0}`, material: terrainMat }
    )
  );
}

// ---------- boulders and dead shrubs (periodic scatter) ----------
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const boulders: AuraTransformSpec[] = [];
const boulderColors: string[] = [];
const sticks: AuraTransformSpec[] = [];
const stickColors: string[] = [];

interface Spot { x: number; z: number; r: number }
const rockBase: Spot[] = [];
const shrubBase: Spot[] = [];
for (let i = 0; i < 34; i += 1) {
  const zz = -rand() * L;
  const side = rand() < 0.5 ? -1 : 1;
  const near = rand() < 0.6 ? 0.3 + rand() * 0.7 : rand() * 0.3; // many rocks hug the walls
  rockBase.push({ x: center(zz) + side * (halfWidth(zz, side > 0 ? 1 : 0) * (0.2 + near * 0.95)), z: zz, r: 0.5 + Math.pow(rand(), 2.2) * 2.8 });
}
for (let i = 0; i < 40; i += 1) {
  const zz = -rand() * L;
  const side = rand() < 0.5 ? -1 : 1;
  shrubBase.push({ x: center(zz) + side * (halfWidth(zz, side > 0 ? 1 : 0) * (0.15 + rand() * 0.9)), z: zz, r: 0.6 + rand() * 0.8 });
}

for (let k = -1; k <= 3; k += 1) {
  const off = -k * L;
  for (const b of rockBase) {
    const z = b.z + off;
    if (z > Z_HI - 4 || z < Z_LO + 4) continue;
    const y = heightAt(b.x, z);
    boulders.push({
      position: [b.x, y + b.r * 0.28, z],
      rotation: [rand() * 0.5, rand() * 6.28, rand() * 0.5],
      scale: [b.r * (1.1 + rand() * 0.4), b.r * (0.7 + rand() * 0.3), b.r * (0.9 + rand() * 0.4)]
    });
    boulderColors.push(`hsl(${14 + Math.floor(rand() * 14)}, ${30 + Math.floor(rand() * 18)}%, ${32 + Math.floor(rand() * 18)}%)`);
  }
  for (const s of shrubBase) {
    const z = s.z + off;
    if (z > Z_HI - 4 || z < Z_LO + 4) continue;
    const y = heightAt(s.x, z);
    const count = 7 + Math.floor(rand() * 4);
    for (let m = 0; m < count; m += 1) {
      const tilt = 0.25 + rand() * 0.75;
      const phi = rand() * 6.283;
      const len = s.r * (0.9 + rand() * 0.9);
      // direction of the local +Y axis under rotation [0, phi, tilt]
      const dir: V3 = [-Math.sin(tilt) * Math.cos(phi), Math.cos(tilt), Math.sin(tilt) * Math.sin(phi)];
      sticks.push({
        position: [s.x + dir[0] * len * 0.5, y + dir[1] * len * 0.5 - 0.05, z + dir[2] * len * 0.5],
        rotation: [0, phi, tilt],
        scale: [0.045 + rand() * 0.03, len, 0.045 + rand() * 0.03]
      });
      stickColors.push(`hsl(${26 + Math.floor(rand() * 8)}, ${18 + Math.floor(rand() * 10)}%, ${18 + Math.floor(rand() * 12)}%)`);
    }
  }
}

const white = material.pbr({ color: "#ffffff", roughness: 0.95 });
sc = sc
  .add(instances.sphere({ name: "boulders", transforms: boulders, colors: boulderColors, material: white }))
  .add(instances.cylinder({ name: "sticks", transforms: sticks, colors: stickColors, material: white, params: { radialSegments: 4 } }));

// ---------- app + camera flythrough ----------
const app = createAuraApp("#app", { scene: sc });

const LOOP = 40; // seconds per loop (one canyon period)
const AHEAD = 28;
let t = 0;
const camX = (time: number, z: number): number => center(z) + 3.2 * Math.sin((Math.PI * 2 * 3 * time) / LOOP);

app.onFrame((f) => {
  t = (t + f.dt) % LOOP;
  const z = -L * (t / LOOP);
  const x = camX(t, z);
  const tAhead = t + AHEAD / (L / LOOP);
  const zA = z - AHEAD;
  const xA = camX(tAhead, zA);
  const yaw = Math.atan2(-(xA - x), -(zA - z));
  const rig = app.nodes.require("rig");
  rig.setPosition(x, 2.1 + 0.05 * Math.sin(t * 5), z);
  rig.setRotation(0, yaw, 0);
});

await app.ready();
window.__EVAL_READY__ = true;
