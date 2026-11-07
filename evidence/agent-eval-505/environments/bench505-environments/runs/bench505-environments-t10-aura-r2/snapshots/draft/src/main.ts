import { camera, createAuraApp, effects, geometry, instances, lights, material, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Desert canyon at dusk. Everything is procedural: one terraced heightfield
// mesh with vertex colours, instanced boulders and dead shrubs, a gradient
// sky, a low sun with cascaded shadows and exponential haze.
// The world is periodic along z (period P), so the camera flythrough loops
// seamlessly: when the camera passes z = 0 it re-enters at z = P.
// ---------------------------------------------------------------------------

type V3 = [number, number, number];

const P = 160; // world period along z, metres
const K = (Math.PI * 2) / P;
const per = (k: number, z: number, phase: number): number => Math.sin(k * K * z + phase);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const hex = (c: string): V3 => [
  parseInt(c.slice(1, 3), 16) / 255,
  parseInt(c.slice(3, 5), 16) / 255,
  parseInt(c.slice(5, 7), 16) / 255
];
const mix = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// --- canyon layout ----------------------------------------------------------
const centre = (z: number): number => 13 * per(1, z, 0.3) + 5 * per(2, z, 1.7) + 2 * per(3, z, 4.0);
const widthL = (z: number): number => 15 + 3 * per(2, z, 2.1) + 1.5 * per(5, z, 0.4) + 2 * per(3, z, 1.0);
const widthR = (z: number): number => 15 + 3 * per(2, z, 2.1) + 1.5 * per(5, z, 0.4) - 2 * per(3, z, 1.0);
const riverX = (z: number): number => centre(z) + 4 * per(4, z, 1.0) + 2 * per(7, z, 2.0);
const drift = (z: number): number => 3.2 * per(2, z, 0.8) + 1.4 * per(5, z, 2.2);

const STEP = 4.5; // sandstone layer thickness

interface Sample {
  h: number;
  raw: number;
  layer: number;
  frac: number;
  wall: number;
  channel: number;
}

const sample = (x: number, z: number): Sample => {
  const d = x - centre(z);
  const side = d < 0 ? widthL(z) : widthR(z);
  const u = Math.abs(d) - side;
  const wall = smoothstep(0, 5, u);
  const n1 =
    Math.sin(x * 0.27 + per(3, z, 0.4) * 1.3) * per(9, z, 1.2) +
    0.6 * Math.sin(x * 0.61 + 1.7) * per(13, z, 0.3);
  let raw = u > 0 ? (u + 2.6 * n1 * wall) * 1.05 : 0;
  if (raw < 0) raw = 0;
  const top = 21 + 4 * per(3, z, 0.9) + 3 * Math.sign(d) * per(2, z, 3.0) + 1.2 * Math.sin(x * 0.19);
  const rawC = Math.min(raw, top);
  const s = rawC / STEP;
  const layer = Math.floor(s);
  const frac = s - layer;
  let h = (layer + smoothstep(0.38, 1, frac)) * STEP + 0.12 * rawC;
  const floorK = 1 - wall;
  const dune = 0.18 * Math.sin(x * 0.45 + per(4, z, 1.0) * 2) * per(11, z, 0.7) + 0.1 * Math.sin(x * 1.3 + per(8, z, 0.2));
  const rx = x - riverX(z);
  const channel = Math.exp(-(rx * rx) / (2 * 2.2 * 2.2));
  h += (dune - 0.5 * channel) * floorK;
  return { h, raw: rawC, layer, frac, wall, channel };
};
const heightAt = (x: number, z: number): number => sample(x, z).h;

// --- terrain mesh -----------------------------------------------------------
const XMIN = -80, XMAX = 80, ZMIN = -270, ZMAX = 190;
const CX = 128, CZ = 230;
const NV = (CX + 1) * (CZ + 1);

const STRATA: V3[] = ["#a4492b", "#c8703c", "#8e3a28", "#d08a52", "#b8573a", "#9c4a30", "#c66a45"].map(hex);
const LEDGE = hex("#dca878");
const FLOOR = hex("#c98d5c");
const BED = hex("#a58c76");

const positions = new Float32Array(NV * 3);
const normals = new Float32Array(NV * 3);
const colors = new Float32Array(NV * 4);
const indices: number[] = [];
let maxH = 0;

for (let j = 0; j <= CZ; j += 1) {
  for (let i = 0; i <= CX; i += 1) {
    const v = j * (CX + 1) + i;
    const x = lerp(XMIN, XMAX, i / CX);
    const z = lerp(ZMIN, ZMAX, j / CZ);
    const sm = sample(x, z);
    if (sm.h > maxH) maxH = sm.h;
    positions[v * 3] = x;
    positions[v * 3 + 1] = sm.h;
    positions[v * 3 + 2] = z;

    const e = 0.5;
    const nx = heightAt(x - e, z) - heightAt(x + e, z);
    const nz = heightAt(x, z - e) - heightAt(x, z + e);
    const len = Math.hypot(nx, 2 * e, nz);
    normals[v * 3] = nx / len;
    normals[v * 3 + 1] = (2 * e) / len;
    normals[v * 3 + 2] = nz / len;

    // colour: floor sand + dry riverbed, or layered strata with pale ledges
    const strata = STRATA[((sm.layer % STRATA.length) + STRATA.length) % STRATA.length] as V3;
    const ledgeness = 1 - smoothstep(0.3, 0.5, sm.frac);
    let c: V3 = mix(strata, LEDGE, 0.55 * ledgeness);
    const floorMix = 1 - smoothstep(0, 1.2, sm.raw);
    const floorCol = mix(FLOOR, BED, clamp01(sm.channel * 1.3));
    c = mix(c, floorCol, floorMix);
    // desert varnish streaks, fine grain and darker crevices at the wall base
    const streak = 0.9 + 0.1 * Math.sin(x * 2.3 + per(15, z, 0.5) * 3) * Math.sin(x * 0.9 + 1.0);
    const grain = 0.94 + 0.12 * (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453 % 1 + 1) * 0.5;
    const ao = 0.72 + 0.28 * smoothstep(0, 4, sm.raw) + 0.0 * ledgeness;
    const shade = streak * grain * ao;
    colors[v * 4] = clamp01(c[0] * shade);
    colors[v * 4 + 1] = clamp01(c[1] * shade);
    colors[v * 4 + 2] = clamp01(c[2] * shade);
    colors[v * 4 + 3] = 1;

    if (i < CX && j < CZ) indices.push(v, v + CX + 1, v + 1, v + 1, v + CX + 1, v + CX + 2);
  }
}

// --- boulders, rock slabs and dead shrubs ------------------------------------
const ZLO = ZMIN + 6, ZHI = ZMAX - 6;
const boulders: AuraTransformSpec[] = [];
const boulderColors: string[] = [];
const slabs: AuraTransformSpec[] = [];
const slabColors: string[] = [];
const sideWidth = (side: number, z: number): number => (side < 0 ? widthL(z) : widthR(z));

for (let n = 0; n < 20; n += 1) {
  const z0 = rand() * P;
  const side = rand() < 0.5 ? -1 : 1;
  const off = 5.5 + rand() * (sideWidth(side, z0) - 3.5);
  const x = centre(z0) + side * off;
  const size = 0.5 + rand() * rand() * 2.4;
  const sx = size * (1.0 + rand() * 0.4), sy = size * (0.7 + rand() * 0.3), sz = size * (0.9 + rand() * 0.4);
  const y = heightAt(x, z0) + sy * 0.28;
  const yaw = rand() * Math.PI;
  const tone = `hsl(${12 + Math.floor(rand() * 16)}, ${42 + Math.floor(rand() * 16)}%, ${30 + Math.floor(rand() * 14)}%)`;
  const asSlab = rand() < 0.4;
  for (let k = -3; k <= 1; k += 1) {
    const z = z0 + k * P;
    if (z < ZLO || z > ZHI) continue;
    if (asSlab) {
      slabs.push({ position: [x, y + sy * 0.1, z], scale: [sx * 1.3, sy * 0.9, sz * 1.1], rotation: [0.15 * (n % 3 - 1), yaw, 0.2 * ((n + 1) % 3 - 1)] });
      slabColors.push(tone);
    } else {
      boulders.push({ position: [x, y, z], scale: [sx, sy, sz], rotation: [0, yaw, 0] });
      boulderColors.push(tone);
    }
  }
}

const branches: AuraTransformSpec[] = [];
const branchColors: string[] = [];

const quatFromUp = (d: V3): [number, number, number, number] => {
  // shortest rotation taking (0,1,0) onto unit vector d
  const qx = d[2], qz = -d[0], qw = 1 + d[1];
  const l = Math.hypot(qx, qz, qw) || 1;
  return [qx / l, 0, qz / l, qw / l];
};
const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const addBranch = (base: V3, dir: V3, length: number, thick: number, color: string): void => {
  const d = unit(dir);
  branches.push({
    position: [base[0] + (d[0] * length) / 2, base[1] + (d[1] * length) / 2, base[2] + (d[2] * length) / 2],
    scale: [thick, length, thick],
    quaternion: quatFromUp(d)
  });
  branchColors.push(color);
};

for (let n = 0; n < 24; n += 1) {
  const z0 = rand() * P;
  const side = rand() < 0.5 ? -1 : 1;
  const off = 3.2 + rand() * (sideWidth(side, z0) - 2);
  const x = centre(z0) + side * off;
  const y = heightAt(x, z0) - 0.05;
  const scale = 0.8 + rand() * 0.9;
  const grey = 38 + Math.floor(rand() * 14);
  const color = `hsl(${28 + Math.floor(rand() * 10)}, 22%, ${grey}%)`;
  const count = 7 + Math.floor(rand() * 4);
  for (let k = -3; k <= 1; k += 1) {
    const z = z0 + k * P;
    if (z < ZLO || z > ZHI) continue;
    const local = (() => {
      // same shrub shape for every repeat of this slot
      const saved = seed;
      seed = (n * 7919 + 13) >>> 0;
      const list: { dir: V3; len: number; twigs: { dir: V3; len: number }[] }[] = [];
      for (let b = 0; b < count; b += 1) {
        const yaw = rand() * Math.PI * 2;
        const tilt = 0.25 + rand() * 0.95;
        const dir: V3 = [Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)];
        const twigs: { dir: V3; len: number }[] = [];
        for (let t = 0; t < 2; t += 1) {
          twigs.push({
            dir: unit([dir[0] + (rand() - 0.5) * 1.4, dir[1] + (rand() - 0.2) * 0.6, dir[2] + (rand() - 0.5) * 1.4]),
            len: 0.3 + rand() * 0.3
          });
        }
        list.push({ dir, len: 0.8 + rand() * 0.6, twigs });
      }
      seed = saved;
      return list;
    })();
    for (const b of local) {
      const len = b.len * scale;
      addBranch([x, y, z], b.dir, len, 0.06 * scale, color);
      const tip: V3 = [x + b.dir[0] * len * 0.6, y + b.dir[1] * len * 0.6, z + b.dir[2] * len * 0.6];
      for (const t of b.twigs) addBranch(tip, t.dir, t.len * scale, 0.04 * scale, color);
    }
  }
}

// --- lighting -----------------------------------------------------------------
const SUN_EL = 11;
const SUN_AZ = -20;
const lightAt = (elDeg: number, azDeg: number, dist: number): V3 => {
  const e = (elDeg * Math.PI) / 180, a = (azDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * dist, Math.sin(e) * dist, -Math.cos(a) * Math.cos(e) * dist];
};

// --- camera path --------------------------------------------------------------
const SPEED = 3.0; // m/s along the canyon
const LOOK_AHEAD = 22;
const eyeY = (x: number, z: number): number => 1.8 + 0.5 * heightAt(x, z);

interface Pose { position: V3; target: V3 }
const poseAt = (time: number): Pose => {
  const z = P - ((time * SPEED) % P);
  const x = centre(z) + drift(z);
  const y = eyeY(x, z) + 0.05 * Math.sin(time * 1.7);
  const zt = z - LOOK_AHEAD;
  const xt = centre(zt) + drift(zt) * 0.8;
  const yt = eyeY(xt, zt) + 2.4;
  return { position: [x, y, z], target: [xt, yt, zt] };
};

const start = poseAt(0);

const app = createAuraApp("#app", {
  resize: false,
  scene: scene({ background: "#c98692" })
    .add(
      sky.gradient({
        name: "dusk sky",
        zenith: "#1d2468",
        horizon: "#ff9a5c",
        ground: "#4a2a3a",
        exponent: 0.55,
        horizonGlow: 0.8,
        intensity: 1,
        sun: { elevationDeg: SUN_EL, azimuthDeg: SUN_AZ, intensity: 1, color: "#ffb26e" },
        bands: [{ elevationDeg: 16, widthDeg: 22, color: "#d63f8f", intensity: 0.55 }]
      })
    )
    .add(lights.hemisphere({ name: "sky fill", skyColor: "#6f6ad8", groundColor: "#8f4c3c", intensity: 0.85 }))
    .add(
      lights.directional({
        name: "sun",
        position: lightAt(SUN_EL, SUN_AZ, 300),
        target: [0, 0, 0],
        intensity: 4.6,
        color: "#ff9a52",
        shadow: { mapSize: 2048, cascades: 3, fit: "camera", maxDistance: 180, filter: "pcf", softness: 2 }
      })
    )
    .add(lights.directional({ name: "cool fill", position: lightAt(25, 160, 300), target: [0, 0, 0], intensity: 0.45, color: "#7b73ff" }))
    .add(
      geometry.custom(
        geometry.define({
          positions,
          normals,
          colors,
          indices,
          bounds: { min: [XMIN, -2, ZMIN], max: [XMAX, maxH + 1, ZMAX] }
        }),
        { name: "canyon", material: material.pbr({ color: "#ffffff", roughness: 0.96, metallic: 0 }) }
      )
    )
    .add(
      instances.sphere({
        name: "boulders",
        transforms: boulders,
        colors: boulderColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.95 }),
        params: { widthSegments: 9, heightSegments: 6 }
      })
    )
    .add(
      instances.box({
        name: "rock slabs",
        transforms: slabs,
        colors: slabColors,
        material: material.pbr({ color: "#ffffff", roughness: 0.95 })
      })
    )
    .add(
      instances.cylinder({
        name: "dead shrubs",
        transforms: branches,
        colors: branchColors,
        material: material.pbr({ color: "#ffffff", roughness: 1 }),
        params: { radialSegments: 5 }
      })
    )
    .add(effects.fog({ color: "#c98692", density: 0.0075 }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.9, radius: 0.5 }))
    .camera(camera.perspective({ position: start.position, target: start.target, fov: 52, near: 0.3, far: 600 }))
});

let clock = 0;
app.onFrame((frame) => {
  clock += Math.min(frame.dt, 0.1);
  const pose = poseAt(clock);
  app.camera?.setPose({ position: pose.position, target: pose.target });
});

await app.ready();
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
