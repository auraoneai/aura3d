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

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Canyon height field. Every z-dependent term uses an integer multiple of W,
// so the terrain repeats exactly every L metres and tiles seamlessly. The camera
// loops over one period and two tiles are placed back to back.
// ---------------------------------------------------------------------------
const L = 192;
const W = (Math.PI * 2) / L;
const TAU = Math.PI * 2;
const LAYERS = 6;
const WALL_RUN = 8.5; // horizontal distance from bank to the top of a wall

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const center = (z: number): number => 12 * Math.sin(2 * W * z + 0.6) + 5 * Math.sin(3 * W * z + 2.1) + 1.5 * Math.sin(7 * W * z + 4);
const halfWidth = (z: number): number => 10 + 2.8 * Math.sin(3 * W * z + 1) + 1.6 * Math.sin(5 * W * z + 2);

interface Sample {
  h: number;
  g: number;
  s: number;
  dn: number;
  t: number;
}

const sample = (x: number, z: number): Sample => {
  const d0 = x - center(z);
  const dn = d0 + 1.6 * Math.sin(11 * W * z + 0.2 * x) + 0.9 * Math.sin(17 * W * z + 0.5 * x + 1);
  const side = d0 >= 0 ? 1 : 0;
  const t = Math.max(0, Math.abs(dn) - halfWidth(z));
  const top = 17 + 3.5 * Math.sin(4 * W * z + (side ? 0 : 2.5)) + 2 * Math.sin(9 * W * z + side * 1.7);
  const g = smooth(0, WALL_RUN, t);
  const s = clamp(g * LAYERS + 0.25 * g * Math.sin(23 * W * z + 0.37 * x), 0, LAYERS);
  const fl = Math.floor(s);
  const fr = s - fl;
  const level = s >= LAYERS ? 1 : (fl + smooth(0.5, 1, fr)) / LAYERS;
  const plateau = smooth(WALL_RUN - 1, WALL_RUN + 3, t);
  const roll = plateau * (1.8 * Math.sin(0.21 * x + 3 * W * z) + 1.1 * Math.sin(0.47 * x + 8 * W * z + 1));
  const floor = (1 - g) * (-0.7 * Math.exp(-((dn / 3) * (dn / 3))) + 0.12 * Math.sin(0.8 * x + 13 * W * z) + 0.07 * Math.sin(2.3 * x + 29 * W * z));
  return { h: top * level + roll + floor, g, s, dn, t };
};
const heightAt = (x: number, z: number): number => sample(x, z).h;

// ---------------------------------------------------------------------------
// Terrain mesh with per-vertex colour (sandstone strata)
// ---------------------------------------------------------------------------
const hex = (c: string): V3 => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const STRATA = ["#c98a55", "#a9532f", "#d9a874", "#8f4328", "#cf9a62", "#b2623a"].map(hex);
const SAND = hex("#d6a972");
const RIVER = hex("#e6cca0");
const PLATEAU = hex("#8a5238");

const X0 = -62;
const X1 = 62;
const CX = 124;
const CZ = 192;

const buildTerrain = () => {
  const count = (CX + 1) * (CZ + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const indices: number[] = [];
  const e = 0.4;
  let maxY = 0;
  let minY = 0;
  for (let j = 0; j <= CZ; j += 1) {
    for (let i = 0; i <= CX; i += 1) {
      const v = j * (CX + 1) + i;
      const x = X0 + (i / CX) * (X1 - X0);
      const z = (j / CZ) * L;
      const sm = sample(x, z);
      positions.set([x, sm.h, z], v * 3);
      maxY = Math.max(maxY, sm.h);
      minY = Math.min(minY, sm.h);
      const nx = heightAt(x - e, z) - heightAt(x + e, z);
      const nz = heightAt(x, z - e) - heightAt(x, z + e);
      const len = Math.hypot(nx, 2 * e, nz);
      normals.set([nx / len, (2 * e) / len, nz / len], v * 3);

      const li = clamp(Math.floor(sm.s), 0, LAYERS - 1);
      const fr = sm.s - Math.floor(sm.s);
      let strata = STRATA[(li * 5 + 1) % STRATA.length]!;
      strata = mix(strata, SAND, fr < 0.5 ? 0.35 : 0); // dusty ledges, bare risers
      const noise = 0.92 + 0.08 * Math.sin(1.7 * x + 0.9 * z) + 0.05 * Math.sin(5.3 * z + 3.1 * x);
      let col = mix(SAND, strata, smooth(0.02, 0.18, sm.g));
      col = mix(col, PLATEAU, smooth(WALL_RUN - 1, WALL_RUN + 3, sm.t));
      col = mix(col, RIVER, (1 - smooth(1.5, 4.5, Math.abs(sm.dn))) * (1 - sm.g));
      colors.set([clamp(col[0] * noise, 0, 1), clamp(col[1] * noise, 0, 1), clamp(col[2] * noise, 0, 1), 1], v * 4);
      if (i < CX && j < CZ) indices.push(v, v + CX + 1, v + 1, v + 1, v + CX + 1, v + CX + 2);
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices,
    bounds: { min: [X0, minY - 1, 0], max: [X1, maxY + 1, L] }
  });
};
const terrainSpec = buildTerrain();

// ---------------------------------------------------------------------------
// Boulders and dead shrubs (deterministic, repeated for both tiles)
// ---------------------------------------------------------------------------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const quatFromY = (d: V3): [number, number, number, number] => {
  const sinA = Math.hypot(d[0], d[2]);
  if (sinA < 1e-6) return [0, 0, 0, d[1] >= 0 ? 1 : 0];
  const a = Math.acos(clamp(d[1], -1, 1));
  const s = Math.sin(a / 2) / sinA;
  return [d[2] * s, 0, -d[0] * s, Math.cos(a / 2)];
};

const ROCKS = ["#8d5a3d", "#a06a47", "#7a4a35", "#b27b55", "#6f4a3c"];
const boulders: AuraTransformSpec[] = [];
const boulderColors: string[] = [];
const twigs: AuraTransformSpec[] = [];
const twigColors: string[] = [];
const TWIG = ["#4a3528", "#5b4433", "#3d2c22"];

const placeOnFloor = (minOff: number): { x: number; z: number } => {
  const z = rand() * L;
  const off = (rand() < 0.5 ? -1 : 1) * (minOff + rand() * Math.max(0.5, halfWidth(z) - minOff - 1));
  return { x: center(z) + off, z };
};

for (let k = 0; k < 34; k += 1) {
  const { x, z } = placeOnFloor(3.5);
  const size = 0.4 + Math.pow(rand(), 2.2) * 2.4;
  const color = ROCKS[Math.floor(rand() * ROCKS.length)]!;
  const sy = size * (0.55 + rand() * 0.4);
  const y = heightAt(x, z) + sy * 0.3;
  for (const tile of [0, 1]) {
    boulders.push({
      position: [x, y, z + tile * L],
      scale: [size * (1 + rand() * 0.4), sy, size * (1 + rand() * 0.4)],
      rotation: [rand() * 0.4, rand() * TAU, rand() * 0.4]
    });
    boulderColors.push(color);
  }
}

for (let k = 0; k < 30; k += 1) {
  const { x, z } = placeOnFloor(3.2);
  const y0 = heightAt(x, z) - 0.05;
  const scale = 0.7 + rand() * 0.9;
  const color = TWIG[Math.floor(rand() * TWIG.length)]!;
  const branches = 6 + Math.floor(rand() * 4);
  const parts: AuraTransformSpec[] = [];
  const addBranch = (bx: number, by: number, bz: number, phi: number, tilt: number, len: number, r: number): V3 => {
    const d: V3 = [Math.sin(tilt) * Math.cos(phi), Math.cos(tilt), Math.sin(tilt) * Math.sin(phi)];
    parts.push({
      position: [bx + (d[0] * len) / 2, by + (d[1] * len) / 2, bz + (d[2] * len) / 2],
      quaternion: quatFromY(d),
      scale: [r * 2, len, r * 2]
    });
    return [bx + d[0] * len, by + d[1] * len, bz + d[2] * len];
  };
  for (let b = 0; b < branches; b += 1) {
    const phi = rand() * TAU;
    const tilt = 0.25 + rand() * 0.75;
    const len = (0.6 + rand() * 0.8) * scale;
    const tip = addBranch(x, y0, z, phi, tilt, len, 0.03 * scale);
    // a forked twig near the tip
    addBranch(
      x + (tip[0] - x) * 0.6,
      y0 + (tip[1] - y0) * 0.6,
      z + (tip[2] - z) * 0.6,
      phi + (rand() - 0.5) * 2.2,
      Math.min(1.3, tilt + 0.3 + rand() * 0.4),
      len * 0.5,
      0.018 * scale
    );
  }
  for (const tile of [0, 1]) {
    for (const p of parts) {
      const pos = p.position as V3;
      twigs.push({ ...p, position: [pos[0], pos[1], pos[2] + tile * L] });
      twigColors.push(color);
    }
  }
}

// ---------------------------------------------------------------------------
// Camera path
// ---------------------------------------------------------------------------
const SPEED = 5; // m/s along the canyon, one loop = L / SPEED seconds
const EYE = 1.9;

const cameraPose = (time: number): { position: V3; target: V3 } => {
  const z = (time * SPEED) % L;
  const drift = 2.4 * Math.sin((time * TAU) / 11) + 0.8 * Math.sin((time * TAU) / 4.7 + 1);
  const x = center(z) + drift;
  const y = heightAt(x, z) + EYE + 0.12 * Math.sin((time * TAU) / 2.6);
  const ahead = z + 30;
  const tx = center(ahead) + drift * 0.35;
  const ty = Math.max(heightAt(tx, ahead), 0) + 5.5;
  return { position: [x, y, z], target: [tx, ty, ahead] };
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const SUN_ELEVATION = 14;
const SUN_AZIMUTH = 203.6; // low sun ahead of the camera, slightly to the left
const sunDir = (): V3 => {
  const e = (SUN_ELEVATION * Math.PI) / 180;
  const a = (SUN_AZIMUTH * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const sd = sunDir();
const rockMaterial = material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0 });
const first = cameraPose(0);

const world = scene({ background: "#c8788a" })
  .add(
    sky.gradient({
      zenith: "#2c3190",
      horizon: "#ff8a52",
      ground: "#7a4a5c",
      exponent: 0.55,
      horizonGlow: 0.9,
      sun: { elevationDeg: SUN_ELEVATION, azimuthDeg: SUN_AZIMUTH, intensity: 1, color: "#ffb36a" },
      bands: [
        { elevationDeg: 4, widthDeg: 9, color: "#ffb066", intensity: 0.7 },
        { elevationDeg: 14, widthDeg: 18, color: "#d4308f", intensity: 0.6 },
        { elevationDeg: 32, widthDeg: 24, color: "#7b3fa8", intensity: 0.35 }
      ]
    })
  )
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#6f63c8", groundColor: "#c0683e", intensity: 0.85 }))
  .add(
    lights.directional({
      name: "sun",
      position: [sd[0] * 160, sd[1] * 160, sd[2] * 160],
      target: [0, 0, 0],
      intensity: 4.6,
      color: "#ff9a4a",
      shadow: { cascades: 3, maxDistance: 150, mapSize: 2048, filter: "pcf", softness: 1.6 }
    })
  )
  .add(geometry.custom(terrainSpec, { name: "canyon-a", material: rockMaterial }))
  .add(geometry.custom(terrainSpec, { name: "canyon-b", material: rockMaterial }).position(0, 0, L))
  .add(
    instances.polyhedron({
      name: "boulders",
      transforms: boulders,
      colors: boulderColors,
      material: rockMaterial,
      params: { variant: "icosahedron", detail: 1 }
    })
  )
  .add(
    instances.cylinder({
      name: "dead-shrubs",
      transforms: twigs,
      colors: twigColors,
      material: material.pbr({ color: "#ffffff", roughness: 1, metallic: 0 }),
      params: { radialSegments: 5 }
    })
  )
  .add(effects.fog({ color: "#cf7f8a", density: 0.0105 }))
  .add(effects.bloom({ intensity: 0.3, threshold: 0.85, radius: 0.5 }))
  .add(effects.vignette({ intensity: 0.25 }))
  .camera(camera.perspective({ position: first.position, target: first.target, fov: 62, near: 0.3, far: 520 }));

const app = createAuraApp("#app", { scene: world });

let clock = 0;
const applyCamera = (): void => {
  const pose = cameraPose(clock);
  app.camera?.setPose({ position: pose.position, target: pose.target, fov: 62 }, { cut: true });
};

app.onFrame((frame) => {
  clock += Math.min(frame.dt, 0.1);
  applyCamera();
});

void app.ready().then(() => {
  applyCamera();
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
