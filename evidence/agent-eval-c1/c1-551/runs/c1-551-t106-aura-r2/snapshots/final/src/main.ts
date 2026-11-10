import {
  camera,
  createAuraApp,
  environments,
  geometry,
  lights,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";

type SphereName = "glass" | "metal" | "fabric";

declare global {
  interface Window {
    __TASK_STATE__?: {
      spheres: { name: string }[];
      keyLightX: number;
      selected: SphereName | null;
    };
    __EVAL_READY__?: boolean;
  }
}

// ---- Seamless cyclorama: floor that curves up into the backdrop (one smooth mesh) ----
// Profile in (z, y): flat floor from z=+10 to z=-2, quarter-circle of radius R, then vertical wall.
function buildCyc() {
  const halfW = 14;
  const R = 3.2;
  const zFront = 10;
  const zArcStart = -2;
  const wallTop = 12;
  const profile: Array<[number, number]> = [];
  const flatSteps = 8;
  for (let i = 0; i <= flatSteps; i += 1) profile.push([zFront + (zArcStart - zFront) * (i / flatSteps), 0]);
  const arcSteps = 24;
  for (let i = 1; i <= arcSteps; i += 1) {
    const a = (i / arcSteps) * (Math.PI / 2);
    profile.push([zArcStart - Math.sin(a) * R, R - Math.cos(a) * R]);
  }
  const wallSteps = 4;
  for (let i = 1; i <= wallSteps; i += 1) profile.push([zArcStart - R, R + (wallTop - R) * (i / wallSteps)]);

  const xSteps = 12;
  const cols = xSteps + 1;
  const rows = profile.length;
  const positions = new Float32Array(rows * cols * 3);
  const indices: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = -halfW + (2 * halfW * i) / xSteps;
      const [z, y] = profile[j]!;
      positions.set([x, y, z], (j * cols + i) * 3);
      if (i < xSteps && j < rows - 1) {
        const v = j * cols + i;
        // Counter-clockwise seen from the studio side (+z, above).
        indices.push(v, v + cols, v + 1, v + 1, v + cols, v + cols + 1);
      }
    }
  }
  const normals = geometry.computeNormals({ positions, indices });
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-halfW, 0, zArcStart - R], max: [halfW, wallTop, zFront] }
  });
}

const cycMaterial = material.pbr({
  name: "cyc",
  color: "#a5a8ae",
  roughness: 0.95,
  metallic: 0,
  envMapIntensity: 0.5,
  doubleSided: true
});

const R_SPHERE = 0.85;
const SPACING = 2.4;
const KEY_Y = 6.2;
const KEY_Z = 5.5;

const glass = material.studioGlass({
  name: "glass",
  tint: "#dff2ff",
  roughness: 0.0,
  transmission: 1,
  thickness: 1.6,
  ior: 1.5,
  specularIntensity: 1,
  envMapIntensity: 2.2,
  attenuationColor: "#bfe6f2",
  attenuationDistance: 3
});

// ---- Generated textures (no external assets) ----
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Plain-weave fabric: tileable albedo + normal map from one thread-height field.
function buildWeave() {
  const N = 256;
  const CELL = 16;
  const rand = rng(7);
  const noise = new Float32Array(N * N);
  for (let i = 0; i < noise.length; i += 1) noise[i] = rand();
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const cx = Math.floor(x / CELL);
      const cy = Math.floor(y / CELL);
      const fx = (x % CELL) / CELL;
      const fy = (y % CELL) / CELL;
      const bx = Math.sin(Math.PI * fx);
      const by = Math.sin(Math.PI * fy);
      const warpOver = (cx + cy) % 2 === 0;
      const h = warpOver ? (0.55 + 0.45 * bx) * (0.75 + 0.25 * by) : (0.55 + 0.45 * by) * (0.75 + 0.25 * bx);
      height[y * N + x] = h + (noise[y * N + x]! - 0.5) * 0.12;
    }
  }
  const albedo = new Uint8Array(N * N * 4);
  const normal = new Uint8Array(N * N * 4);
  const H = (x: number, y: number) => height[((y + N) % N) * N + ((x + N) % N)]!;
  for (let y = 0; y < N; y += 1) {
    for (let x = 0; x < N; x += 1) {
      const i = (y * N + x) * 4;
      const h = H(x, y);
      const shade = 0.35 + 0.9 * h;
      albedo[i] = Math.min(255, 118 * shade);
      albedo[i + 1] = Math.min(255, 14 * shade);
      albedo[i + 2] = Math.min(255, 30 * shade);
      albedo[i + 3] = 255;
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.2;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 3.2;
      const len = Math.hypot(dx, dy, 1);
      normal[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }
  const map = texture.data({ width: N, height: N, data: albedo, format: "rgba8", colorSpace: "srgb" });
  const nrm = texture.data({ width: N, height: N, data: normal, format: "rgba8", colorSpace: "linear" });
  for (const t of [map, nrm]) {
    t.wrapS = "repeat";
    t.wrapT = "repeat";
    t.repeat = [4, 2];
    t.generateMipmaps = true;
    t.minFilter = "linear-mipmap-linear";
    t.magFilter = "linear";
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  return { map, nrm };
}

// Brushed steel: fine streaks that run around the sphere (varying only with v).
function buildBrushed() {
  const W = 64;
  const Hh = 512;
  const rand = rng(21);
  const rows = new Float32Array(Hh);
  for (let i = 0; i < Hh; i += 1) rows[i] = rand();
  // smooth a little so streaks have varying width
  const line = new Float32Array(Hh);
  for (let i = 0; i < Hh; i += 1) line[i] = 0.5 * rows[i]! + 0.3 * rows[(i + 1) % Hh]! + 0.2 * rows[(i + 2) % Hh]!;
  const normal = new Uint8Array(W * Hh * 4);
  for (let y = 0; y < Hh; y += 1) {
    const d = (line[(y + 1) % Hh]! - line[(y + Hh - 1) % Hh]!) * 1.4;
    const len = Math.hypot(d, 1);
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4;
      normal[i] = 128;
      normal[i + 1] = Math.round((-d / len * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }
  const nrm = texture.data({ width: W, height: Hh, data: normal, format: "rgba8", colorSpace: "linear" });
  nrm.wrapS = "repeat";
  nrm.wrapT = "repeat";
  nrm.repeat = [1, 1];
  nrm.generateMipmaps = true;
  nrm.minFilter = "linear-mipmap-linear";
  nrm.magFilter = "linear";
  nrm.needsUpdate = true;
  return nrm;
}

const weave = buildWeave();

const metal = material.pbr({
  name: "brushed steel",
  color: "#c8ced6",
  metallic: 1,
  roughness: 0.36,
  anisotropy: 0.9,
  anisotropyRotation: Math.PI / 2,
  normal: buildBrushed(),
  normalScale: 0.5,
  envMapIntensity: 1.5
});

const fabric = material.pbr({
  name: "red velvet",
  color: "#ffffff",
  texture: weave.map,
  normal: weave.nrm,
  normalScale: 1.2,
  roughness: 1,
  metallic: 0,
  envMapIntensity: 0.1,
  sheen: 1,
  sheenRoughness: 0.45,
  sheenColor: "#ff6f86"
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#a9acb2" })
    .add(environments.studio({ preset: "softbox", intensity: 0.55, background: false }))
    // Key: large soft light, front-left and high; drifts side to side.
    .add(
      lights.directional({
        name: "key",
        position: [-3, KEY_Y, KEY_Z],
        target: [0, 0.5, 0],
        intensity: 2.0,
        color: "#fff3e4",
        shadow: true
      }).runtime({ id: "key", mutable: true })
    )
    .add(
      lights.softbox({
        name: "key-softbox",
        position: [-3, KEY_Y - 1, KEY_Z],
        target: [0, 0.5, 0],
        width: 5,
        height: 3.5,
        intensity: 3,
        color: "#fff3e4"
      }).runtime({ id: "keybox", mutable: true })
    )
    // Fill: dimmer, from the opposite side.
    .add(
      lights.softbox({
        name: "fill",
        position: [6, 3.2, 5],
        target: [0, 0.6, 0],
        width: 4,
        height: 3,
        intensity: 2.2,
        color: "#dfe9ff"
      })
    )
    // Rim: from behind and above.
    .add(
      lights.spot({
        name: "rim",
        position: [0.5, 4.2, -4.2],
        target: [0, 0.8, 0],
        angle: 0.9,
        penumbra: 0.8,
        intensity: 60,
        distance: 20,
        color: "#ffffff",
        shadow: false
      })
    )
    .add(geometry.custom(buildCyc(), { name: "cyc-floor", material: cycMaterial, receiveShadow: true }))
    .add(
      primitives
        .sphere({ name: "glass", size: R_SPHERE * 2, material: glass, castShadow: true })
        .position(-SPACING, R_SPHERE, 0)
        .runtime({ id: "glass", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "metal", size: R_SPHERE * 2, material: metal, castShadow: true })
        .position(0, R_SPHERE, 0)
        .runtime({ id: "metal", mutable: true })
    )
    .add(
      primitives
        .sphere({ name: "fabric", size: R_SPHERE * 2, material: fabric, castShadow: true })
        .position(SPACING, R_SPHERE, 0)
        .runtime({ id: "fabric", mutable: true })
    )
    .camera(camera.perspective({ position: [1.5, 2.1, 6.7], target: [0, 0.8, 0], fov: 36 })),
  pixelRatio: 1
});

const state: NonNullable<Window["__TASK_STATE__"]> = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -3,
  selected: null
};
window.__TASK_STATE__ = state;

// Keys 1/2/3 select a sphere; only the selected one spins about its vertical axis.
const KEY_TO_SPHERE: Record<string, SphereName> = { Digit1: "glass", Digit2: "metal", Digit3: "fabric" };
const KEY_CHAR_TO_SPHERE: Record<string, SphereName> = { "1": "glass", "2": "metal", "3": "fabric" };
const spin: Record<SphereName, number> = { glass: 0, metal: 0, fabric: 0 };
const SPIN_SPEED = 0.6; // rad/s
window.addEventListener("keydown", (e) => {
  const pick = KEY_TO_SPHERE[e.code] ?? KEY_CHAR_TO_SPHERE[e.key];
  if (pick) state.selected = pick;
});

let firstFrame = true;
app.onFrame((f) => {
  if (state.selected) spin[state.selected] += SPIN_SPEED * f.dt;
  for (const name of ["glass", "metal", "fabric"] as const) {
    app.nodes.require(name).setRotation(0, spin[name], 0);
  }
  const x = Math.sin(f.time * 0.45) * 4.5;
  state.keyLightX = x;
  const pos: [number, number, number] = [x, KEY_Y, KEY_Z];
  app.nodes.require("key").setLight?.({ position: pos });
  app.nodes.require("keybox").setLight?.({ position: [x, KEY_Y - 1, KEY_Z] });
  window.__TASK_STATE__ = state;
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
