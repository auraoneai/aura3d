// Lane 514 proof pages: ?s=<scene>&v=before|after. `before` uses only what existed on origin/main, `after` the new helpers.
// Scenes: godrays, caustics, beam, strata (minimal pages) and canyon, reef, lighthouse (benchmark rebuilds).
import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

const q = new URLSearchParams(location.search);
const which = q.get("s") ?? "godrays";
const after = (q.get("v") ?? "after") === "after";

type V3 = [number, number, number];

// ---- deterministic noise -------------------------------------------------------------------------------------
const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, y: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number, o = 4): number => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i += 1) { s += a * vnoise(x * f, y * f); f *= 2; a *= 0.5; }
  return s;
};

/** Heightfield mesh with analytic normals; `size` metres per side centred on the origin. */
function heightfield(height: (x: number, z: number) => number, sizeX: number, sizeZ: number, cellsX: number, cellsZ: number, centerZ = 0) {
  const positions = new Float32Array((cellsX + 1) * (cellsZ + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= cellsZ; j += 1) for (let i = 0; i <= cellsX; i += 1) {
    const v = j * (cellsX + 1) + i;
    const x = (i / cellsX - 0.5) * sizeX;
    const z = (j / cellsZ - 0.5) * sizeZ + centerZ;
    const h = height(x, z);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
    positions.set([x, h, z], v * 3);
    const e = Math.max(sizeX / cellsX, sizeZ / cellsZ) * 0.5;
    const nx = height(x - e, z) - height(x + e, z);
    const nz = height(x, z - e) - height(x, z + e);
    const len = Math.hypot(nx, 2 * e, nz);
    normals.set([nx / len, (2 * e) / len, nz / len], v * 3);
    if (i < cellsX && j < cellsZ) indices.push(v, v + cellsX + 1, v + 1, v + 1, v + cellsX + 1, v + cellsX + 2);
  }
  return geometry.define({ positions, normals, indices, bounds: { min: [-sizeX / 2, lo, centerZ - sizeZ / 2], max: [sizeX / 2, hi, centerZ + sizeZ / 2] } });
}

// ---- minimal pages -------------------------------------------------------------------------------------------
function godrays() {
  const s = scene({ background: "#2b3a5e" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(primitives.sphere({ name: "sun-disc", size: 7, position: [0, 16, -60], material: material.pbr({ color: "#fff2cc", emissive: "#fff2cc", emissiveIntensity: 6 }), castShadow: false }))
    .add(lights.directional({ name: "sun", position: [0, 18, -60], target: [0, 0, 0], intensity: 2.2, color: "#ffd9a0", shadow: true }))
    .add(primitives.plane({ name: "ground", size: [80, 1, 80], material: material.pbr({ color: "#5a4a3a", roughness: 1 }) }));
  for (let i = -3; i <= 3; i += 1) {
    s.add(primitives.box({ name: `pillar-${i}`, size: [1.1, 14, 1.1], position: [i * 4.2, 7, -6 - (i % 2) * 3], material: material.pbr({ color: "#3b2f2a", roughness: 0.9 }), castShadow: true }));
  }
  if (after) s.add(effects.godRays({ intensity: 0.85, decay: 0.95, samples: 64, color: "#ffe2b0", source: [0, 16, -60] }));
  s.camera(camera.perspective({ position: [0, 2.2, 14], target: [0, 8, -20], fov: 55, near: 0.3, far: 300 }));
  return s;
}

function caustics() {
  const floor = after
    ? material.caustics({ color: "#d9c79c", strength: 1.4, scale: 7, surfaceY: 0, depthFade: 0.08 })
    : material.pbr({ color: "#d9c79c", roughness: 0.95 });
  const s = scene({ background: "#1d6f86" })
    .add(environments.neutral({ intensity: 0.3, background: false }))
    .add(lights.directional({ name: "sun", position: [10, 30, 6], target: [0, -3, 0], intensity: 1.3, color: "#e8fbff", shadow: true }))
    .add(primitives.plane({ name: "floor", size: [60, 1, 60], position: [0, -3, 0], material: floor }));
  for (let i = 0; i < 7; i += 1) {
    s.add(primitives.sphere({ name: `rock-${i}`, size: 1.2 + hash(i, 1) * 1.4, position: [(hash(i, 2) - 0.5) * 12, -3 + 0.3, (hash(i, 3) - 0.5) * 10 - 2], material: material.pbr({ color: "#6d7d74", roughness: 0.9 }), castShadow: true }));
  }
  s.add(effects.fog({ color: "#1d6f86", density: 0.03 }));
  s.camera(camera.perspective({ position: [0, 2.2, 13], target: [0, -3, -2], fov: 50, near: 0.3, far: 300 }));
  return s;
}

function beam() {
  const s = scene({ background: "#0b1030" })
    .add(environments.neutral({ intensity: 0.25, background: false }))
    .add(lights.directional({ name: "moon", position: [-20, 30, 10], target: [0, 0, 0], intensity: 0.6, color: "#9db8ff" }))
    .add(primitives.plane({ name: "ground", size: [200, 1, 200], material: material.pbr({ color: "#1c2236", roughness: 1 }) }))
    .add(primitives.cylinder({ name: "tower", size: [3, 16, 3], position: [0, 8, 0], material: material.pbr({ color: "#d8d8d8", roughness: 0.8 }) }))
    .add(primitives.sphere({ name: "lamp", size: 1.4, position: [0, 16.8, 0], material: material.pbr({ color: "#fff3c4", emissive: "#fff3c4", emissiveIntensity: 3 }) }));
  const dir: V3 = [0.92, -0.12, -0.38];
  if (after) s.add(effects.volumetricBeam({ position: [0, 16.8, 0], direction: dir, length: 70, endRadius: 8, intensity: 1.6, color: "#fff0c0" }));
  else s.add(effects.lightCone({ position: [0, 16.8, 0], direction: dir, length: 70, coneAngle: 0.11, color: "#fff0c0", intensity: 1.6 }));
  s.camera(camera.perspective({ position: [-14, 6, 26], target: [10, 12, -4], fov: 55, near: 0.3, far: 400 }));
  return s;
}

function strata() {
  const h = (x: number, z: number): number => 6 * fbm(x * 0.04, z * 0.04, 4) + Math.max(0, 22 - Math.abs(x) * 1.3) * (0.6 + 0.4 * fbm(z * 0.05, 3, 3));
  const mat = after
    ? material.strata({ bands: 14, heightRange: [0, 24], slope: { angle: 34, flatColor: "#caa27a" }, noise: 0.4, noiseScale: 4 })
    : material.pbr({ color: "#d8c3a5", roughness: 0.95 });
  const s = scene({ background: "#e9b98a" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.directional({ name: "sun", position: [30, 16, 20], target: [0, 0, 0], intensity: 2.8, color: "#ffd2a0", shadow: true }))
    .add(geometry.custom(heightfield(h, 90, 90, 180, 180), { name: "terrain", material: mat }))
    .add(effects.fog({ color: "#e9b98a", density: 0.004 }));
  s.camera(camera.perspective({ position: [40, 24, 40], target: [0, 5, 0], fov: 50, near: 0.5, far: 400 }));
  return s;
}

// ---- benchmark rebuild: environments-1 canyon at dusk ----------------------------------------------------------
function canyon() {
  const course = (z: number): number => 4.5 * Math.sin(z * 0.045) + 2 * Math.sin(z * 0.11 + 1);
  const h = (x: number, z: number): number => {
    const d = Math.abs(x - course(z));
    const bed = 0.5 * fbm(x * 0.3, z * 0.3, 3) - 0.25;
    const raw = Math.max(0, d - 6.5);
    const wall = Math.min(1, raw / 4) * 0 + raw * 1.7;
    // ledges: quantise the climb into 3.5 m steps with a soft shoulder, then roughen
    const step = 3.5;
    const base = Math.min(wall, 34);
    const terr = Math.floor(base / step) * step + step * Math.pow(Math.min(1, (base % step) / step), 3);
    const rough = (fbm(x * 0.22, z * 0.22, 4) - 0.4) * Math.min(1, raw / 3) * 2.4;
    return bed + terr + rough;
  };
  const mat = after
    ? material.strata({ bands: 18, heightRange: [0, 34], noise: 0.45, noiseScale: 5, seam: 0.3, colors: ["#6a3a30", "#8c4a36", "#a8603f", "#7d4234", "#b57a52", "#5c3430"], seam: 0.18, variation: 0.12, slope: { angle: 30, blend: 14, flatColor: "#9a7c66" }, roughness: 0.95 })
    : material.pbr({ color: "#ffffff", roughness: 0.95 });
  const s = scene({ background: "#7a5a9a" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    .add(lights.hemisphere({ skyColor: "#6a58b0", groundColor: "#5a2b2b", intensity: 0.55 }))
    .add(lights.directional({ name: "sun", position: [-30, 9, -50], target: [0, 6, 0], intensity: 2.2, color: "#ff9a5a", shadow: true }))
    .add(geometry.custom(heightfield(h, 110, 220, 260, 360, 40), { name: "canyon", material: mat }))
    .add(effects.fog({ color: "#7a5a9a", density: 0.022 }));
  for (let i = 0; i < 9; i += 1) {
    const z = -20 + i * 14 + hash(i, 5) * 6;
    s.add(primitives.sphere({ name: `boulder-${i}`, size: [1.6 + hash(i, 6) * 1.8, 1.1 + hash(i, 7), 1.5 + hash(i, 8) * 1.5], position: [course(z) + (hash(i, 9) - 0.5) * 7, 0.5, z], material: material.pbr({ color: "#7a5a4a", roughness: 1 }), castShadow: true }));
  }
  s.camera(camera.perspective({ position: [course(-30), 2.2, -34], target: [course(30), 9, 30], fov: 62, near: 0.3, far: 500 }));
  return s;
}

// ---- benchmark rebuild: environments-4 reef --------------------------------------------------------------------
function reef() {
  const ripple = (x: number, z: number): number => 0.12 * Math.sin(x * 1.9 + 0.7 * Math.sin(z * 0.8)) * 0.6 + 0.08 * Math.sin(z * 2.3 + x * 0.4) + 0.5 * fbm(x * 0.12, z * 0.12, 3) - 0.25;
  const floor = after
    ? material.caustics({ color: "#a89a72", causticColor: "#f4ffff", strength: 2.6, scale: 6, speed: 1, surfaceY: 0, depthFade: 0.04, roughness: 0.95 })
    : material.pbr({ color: "#a89a72", roughness: 0.95 });
  const s = scene({ background: "#0f6f8a" })
    .add(environments.neutral({ intensity: 0.3, background: false }))
    .add(lights.hemisphere({ skyColor: "#7fd8e8", groundColor: "#2b6f6a", intensity: 0.35 }))
    .add(lights.directional({ name: "sun", position: [6, 40, -12], target: [0, -4, 0], intensity: 1.7, color: "#e6ffff", shadow: true }))
    .add(geometry.custom(heightfield((x, z) => -4 + ripple(x, z), 90, 90, 220, 220), { name: "seabed", material: floor }))
    .add(effects.fog({ color: "#0f6f8a", density: 0.045 }));
  if (after) s.add(effects.godRays({ intensity: 1.1, decay: 0.96, samples: 64, color: "#d6ffff", source: [3, 14, -30], medium: 0.12 }));
  s.add(primitives.sphere({ name: "surface-sun", size: 6, position: [3, 14, -30], material: material.pbr({ color: "#e8ffff", emissive: "#e8ffff", emissiveIntensity: 6 }), castShadow: false }));
  const palette = ["#e0508a", "#f09a3a", "#8a6fe0", "#4cc0a0", "#e8e0d0", "#d0407a"];
  for (let i = 0; i < 16; i += 1) {
    const x = (hash(i, 11) - 0.5) * 16, z = -3 - hash(i, 12) * 10;
    const col = palette[i % palette.length]!;
    const y = -4 + ripple(x, z);
    if (i % 3 === 0) {
      for (let b = 0; b < 4; b += 1) s.add(primitives.cone({ name: `branch-${i}-${b}`, params: { radius: 0.18, height: 1.7 + hash(i, b) }, position: [x + (b - 1.5) * 0.25, y + 0.9, z], rotation: [0, 0, (b - 1.5) * 0.28], material: material.pbr({ color: col, roughness: 0.7 }), castShadow: true }));
    } else if (i % 3 === 1) {
      s.add(primitives.sphere({ name: `brain-${i}`, size: [1.8, 1.1, 1.6], position: [x, y + 0.4, z], material: material.pbr({ color: col, roughness: 0.65 }), castShadow: true }));
    } else {
      s.add(primitives.torus({ name: `fan-${i}`, size: [1.9, 1.9, 0.4], position: [x, y + 1.1, z], rotation: [Math.PI / 2, 0, 0], material: material.pbr({ color: col, roughness: 0.7 }), castShadow: true }));
    }
  }
  for (let i = 0; i < 36; i += 1) {
    s.add(primitives.sphere({ name: `fish-${i}`, size: [0.9, 0.38, 0.3], position: [-4 + (hash(i, 21) - 0.5) * 6, -1.2 + hash(i, 22) * 2.2, -5 + (hash(i, 23) - 0.5) * 4], material: material.pbr({ color: i % 2 ? "#e8d23a" : "#3aa0e8", roughness: 0.5 }) }));
  }
  s.camera(camera.perspective({ position: [0, -1.6, 7], target: [0, -1.4, -5], fov: 62, near: 0.2, far: 200 }));
  return s;
}

// ---- benchmark rebuild: models-1 lighthouse (rebuilt from the report text: no task text exists in the repo) -------------
function lighthouse() {
  const s = scene({ background: "#1a1b45" })
    .add(environments.neutral({ intensity: 0.35, background: false }))
    .add(lights.hemisphere({ skyColor: "#5a5aa8", groundColor: "#1b2a44", intensity: 0.7 }))
    .add(lights.directional({ name: "dusk", position: [-40, 12, -30], target: [0, 4, 0], intensity: 1.2, color: "#ff9d70", shadow: true }))
    .add(primitives.plane({ name: "sea", size: [600, 1, 600], material: material.pbr({ color: "#102a4a", roughness: 0.5, metallic: 0 }) }))
    .add(primitives.sphere({ name: "island", size: [26, 7, 22], position: [0, -1.2, 0], material: material.pbr({ color: "#4b4a52", roughness: 1 }) }));
  for (let i = 0; i < 5; i += 1) {
    s.add(primitives.cylinder({ name: `tower-${i}`, size: [5.4 - i * 0.55, 4.2, 5.4 - i * 0.55], position: [0, 4.2 * i + 4.3, 0], material: material.pbr({ color: i % 2 ? "#c93a34" : "#f1eee6", roughness: 0.7 }), castShadow: true }));
  }
  s.add(primitives.cylinder({ name: "gallery", size: [5.2, 0.5, 5.2], position: [0, 21.6, 0], material: material.pbr({ color: "#2b2b30" }) }));
  s.add(primitives.cylinder({ name: "lantern", size: [2.6, 2.6, 2.6], position: [0, 23, 0], material: material.pbr({ color: "#fff3c4", emissive: "#ffd98a", emissiveIntensity: 3.2 }) }));
  s.add(primitives.cone({ name: "roof", params: { radius: 1.8, height: 1.8 }, position: [0, 25.1, 0], material: material.pbr({ color: "#2b2b30" }) }));
  // Parts the benchmark task asks for besides the beam: rocks, cottage, door, windows, railing.
  for (let i = 0; i < 7; i += 1) {
    const ang = (i / 7) * Math.PI * 2;
    s.add(primitives.sphere({ name: `rock-${i}`, size: [4 + hash(i, 31) * 3, 2.4 + hash(i, 32) * 2, 3.6 + hash(i, 33) * 3], position: [Math.cos(ang) * 8.5, 0.2, Math.sin(ang) * 7], material: material.pbr({ color: "#5a5860", roughness: 1 }), castShadow: true }));
  }
  s.add(primitives.box({ name: "cottage", size: [6, 3.4, 4.2], position: [11, 2.2, 5], material: material.pbr({ color: "#e8dcc4", roughness: 0.9 }), castShadow: true }));
  s.add(primitives.cone({ name: "cottage-roof", params: { radius: 4.6, height: 2.2, radialSegments: 4 }, position: [11, 5, 5], rotation: [0, Math.PI / 4, 0], material: material.pbr({ color: "#7a3a30", roughness: 0.8 }), castShadow: true }));
  s.add(primitives.box({ name: "door", size: [1.4, 2.4, 0.3], position: [0, 6.2, 2.62], material: material.pbr({ color: "#3a2418" }) }));
  for (let i = 0; i < 5; i += 1) {
    const a2 = i * 1.25, y = 7 + i * 3.4, r = 2.55 - i * 0.2;
    s.add(primitives.box({ name: `window-${i}`, size: [0.6, 0.9, 0.3], position: [Math.sin(a2) * r, y, Math.cos(a2) * r], rotation: [0, a2, 0], material: material.pbr({ color: "#1a2438", emissive: "#ffd98a", emissiveIntensity: 0.6 }) }));
  }
  s.add(primitives.torus({ name: "railing", size: [5.6, 5.6, 0.3], position: [0, 22.4, 0], rotation: [Math.PI / 2, 0, 0], material: material.pbr({ color: "#2b2b30", metallic: 0.5, roughness: 0.5 }) }));
  const apex: V3 = [0, 23, 0];
  const dirs: V3[] = [[0.93, -0.06, -0.36], [-0.93, -0.06, 0.36]];
  for (const [i, d] of dirs.entries()) {
    if (after) s.add(effects.volumetricBeam({ name: `beam-${i}`, position: apex, direction: d, length: 120, endRadius: 14, intensity: 0.8, color: "#fff0c4", noise: 0.4 }));
    else s.add(effects.lightCone({ name: `beam-${i}`, position: apex, direction: d, length: 120, coneAngle: 0.115, color: "#fff0c4", intensity: 1.5 }));
  }
  s.camera(camera.perspective({ position: [-34, 9, 44], target: [0, 18, 0], fov: 46, near: 0.5, far: 800 }));
  return s;
}

const builders: Record<string, () => ReturnType<typeof scene>> = { godrays, caustics, beam, strata, canyon, reef, lighthouse };
const build = builders[which] ?? godrays;

declare global { interface Window { __A514__?: unknown; __EVAL_READY__?: boolean } }
const app = createAuraApp("#app", { scene: build() });
await app.ready();
// A scene whose only motion is a uTime shader is not a declared time consumer on main: keep drawing.
app.onFrame?.(() => undefined);
window.__A514__ = { scene: which, after, diagnostics: (app as unknown as { diagnostics?: () => unknown }).diagnostics?.() };
window.__EVAL_READY__ = true;
