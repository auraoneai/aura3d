import { camera, createAuraApp, effects, environments, geometry, lights, material, scene } from "@aura3d/engine";

// Studio product shot: glass, brushed metal and woven fabric spheres on a seamless cove, lit by a drifting soft key,
// a dimmer fill, a rim light and a studio environment. All geometry and surface detail are generated in code.

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

type Rgb = [number, number, number];

const hash = (a: number, b: number): number => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// ---- Procedural unit-radius sphere with per-vertex colour and optionally perturbed normals --------------------------
interface SphereVertex {
  i: number;
  j: number;
  phi: number;
  theta: number;
  W: number;
  H: number;
}
interface SphereShade {
  color: Rgb;
  tilt?: [number, number]; // normal tilt along (phi, theta) tangents
}

const buildSphere = (W: number, H: number, shade: (v: SphereVertex) => SphereShade) => {
  const count = (W + 1) * (H + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const indices: number[] = [];
  for (let j = 0; j <= H; j += 1) {
    for (let i = 0; i <= W; i += 1) {
      const v = j * (W + 1) + i;
      const phi = (i / W) * Math.PI * 2;
      const theta = (j / H) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta), sp = Math.sin(phi), cp = Math.cos(phi);
      positions.set([st * cp, ct, st * sp], v * 3);
      const s = shade({ i, j, phi, theta, W, H });
      let nx = st * cp, ny = ct, nz = st * sp;
      if (s.tilt) {
        const [a, b] = s.tilt;
        nx += a * -sp + b * ct * cp;
        ny += b * -st;
        nz += a * cp + b * ct * sp;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
      }
      normals.set([nx, ny, nz], v * 3);
      colors.set([s.color[0], s.color[1], s.color[2], 1], v * 4);
      if (i < W && j < H) indices.push(v, v + 1, v + W + 1, v + 1, v + W + 2, v + W + 1);
    }
  }
  return geometry.define({ positions, normals, colors, indices, bounds: { min: [-1, -1, -1], max: [1, 1, 1] } });
};

// Brushed steel: fine streaks that follow the lines of latitude's normal (turned finish), two noise scales.
const noise1 = (x: number, seed: number): number => {
  const x0 = Math.floor(x);
  const f = x - x0;
  const t = f * f * (3 - 2 * f);
  return hash(x0, seed) * (1 - t) + hash(x0 + 1, seed) * t;
};
const metalGeometry = buildSphere(256, 128, ({ i, j }) => {
  const streak = 0.55 * noise1(i * 0.9, 11) + 0.3 * noise1(i * 0.25, 5) + 0.15 * hash(i, 77);
  const wobble = 0.04 * (noise1(j * 0.35 + i * 0.05, 3) - 0.5);
  const k = 0.7 + 0.28 * streak + wobble;
  return { color: [k * 0.97, k * 0.99, k * 1.02] };
});

// Woven wool/velvet: plain weave, 3x3-vertex cells that alternate warp over weft, thread-round tilt, fibre noise.
const P = 3;
const fabricGeometry = buildSphere(228, 114, ({ i, j }) => {
  const over = (Math.floor(i / P) + Math.floor(j / P)) % 2 === 0;
  const fi = ((i % P) + 0.5) / P;
  const fj = ((j % P) + 0.5) / P;
  const round = over ? Math.sin(Math.PI * fi) : Math.sin(Math.PI * fj); // thread cross-section brightness
  const fuzz = hash(i, j + 999);
  const k = (over ? 0.78 : 0.6) + 0.22 * round + 0.16 * (fuzz - 0.5);
  const tilt: [number, number] = over
    ? [0.45 * Math.cos(Math.PI * fi), 0.08 * (fuzz - 0.5)]
    : [0.08 * (fuzz - 0.5), 0.45 * Math.cos(Math.PI * fj)];
  return { color: [0.5 * k, 0.045 * k, 0.07 * k], tilt };
});

// ---- Seamless cove: flat floor curving up (radius 4) into a vertical backdrop ----------------------------------------
const buildCove = () => {
  const R = 4, ZC = -4, WALL_TOP = 12, FRONT = 11, HALF_W = 22, COLS = 8;
  const prof: { z: number; y: number; nz: number; ny: number }[] = [];
  prof.push({ z: ZC - R, y: WALL_TOP, nz: 1, ny: 0 });
  prof.push({ z: ZC - R, y: 8, nz: 1, ny: 0 });
  const ARC = 28;
  for (let a = 0; a <= ARC; a += 1) {
    const th = (1 - a / ARC) * (Math.PI / 2); // pi/2 (wall) down to 0 (floor)
    prof.push({ z: ZC - R * Math.sin(th), y: R - R * Math.cos(th), nz: Math.sin(th), ny: Math.cos(th) });
  }
  for (const z of [0, 4, 8, FRONT]) prof.push({ z, y: 0, nz: 0, ny: 1 });
  const rows = prof.length;
  const positions = new Float32Array(rows * (COLS + 1) * 3);
  const normals = new Float32Array(positions.length);
  const colors = new Float32Array(rows * (COLS + 1) * 4);
  const indices: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i <= COLS; i += 1) {
      const v = j * (COLS + 1) + i;
      const p = prof[j]!;
      const x = (i / COLS - 0.5) * 2 * HALF_W;
      positions.set([x, p.y, p.z], v * 3);
      normals.set([0, p.ny, p.nz], v * 3);
      // soft studio falloff: brightest behind the subjects, darker toward the far top and the far sides
      const radial = clamp01(Math.hypot(x * 0.8, p.z + 1) / 24);
      const height = clamp01((p.y - 6) / 6);
      const b = 0.86 - 0.2 * radial - 0.22 * height;
      colors.set([b * 0.97, b * 0.98, b, 1], v * 4);
      if (i < COLS && j < rows - 1) indices.push(v, v + COLS + 1, v + 1, v + 1, v + COLS + 1, v + COLS + 2);
    }
  }
  return geometry.define({
    positions, normals, colors, indices,
    bounds: { min: [-HALF_W, 0, ZC - R], max: [HALF_W, WALL_TOP, FRONT] }
  });
};

// ---- Scene ------------------------------------------------------------------------------------------------------------
const KEY_Y = 7, KEY_Z = 5.5, SPACING = 2.7;

const app = createAuraApp("#app", {
  scene: scene({ background: "#c4c7cc" })
    .add(environments.studio({ intensity: 1.1, background: false }))
    .add(lights.directional({ name: "key", position: [0, KEY_Y, KEY_Z], target: [0, 1, 0], intensity: 3.0, color: "#fff3e4", shadow: true })
      .runtime({ id: "key", mutable: true }))
    .add(lights.directional({ name: "fill", position: [-6, 3.5, 4], target: [0, 1, 0], intensity: 0.9, color: "#d3e0ff" }))
    .add(lights.directional({ name: "rim", position: [1.5, 4.5, -7], target: [0, 1, 0], intensity: 1.8, color: "#ffffff" }))
    .add(geometry.custom(buildCove(), { name: "cove", material: material.pbr({ color: "#ffffff", roughness: 0.82, metallic: 0 }), castShadow: false }))
    // left: clear glass
    .add(geometry.custom(buildSphere(96, 48, () => ({ color: [1, 1, 1] })), {
      name: "glass",
      material: material.physical({
        color: "#eaf6fa", metallic: 0, roughness: 0.02, transmission: 1, ior: 1.5, thickness: 1.2,
        opacity: 0.45, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0
      }),
      castShadow: true
    }).position(-SPACING, 1, 0))
    // centre: brushed steel
    .add(geometry.custom(metalGeometry, {
      name: "metal",
      material: material.physical({ color: "#ffffff", metallic: 1, roughness: 0.34, anisotropy: 0.85, envMapIntensity: 1.6 }),
      castShadow: true
    }).position(0, 1, 0))
    // right: dark red woven wool
    .add(geometry.custom(fabricGeometry, {
      name: "fabric",
      material: material.physical({ color: "#ffffff", metallic: 0, roughness: 1, sheen: 1, envMapIntensity: 0.55 }),
      castShadow: true
    }).position(SPACING, 1, 0))
    .add(effects.ambientOcclusion({ name: "ao", intensity: 0.7, radius: 0.7 }))
    .add(effects.contactShadows({ intensity: 1, length: 0.6 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.25, smoothness: 2, roundness: 1 }))
    .camera(camera.perspective({ position: [2.2, 3.5, 9.6], target: [0, 0.95, 0], fov: 32, near: 0.5, far: 80 }))
});

window.__TASK_STATE__ = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: 0
};

const startMs = performance.now();
let readySignalled = false;
app.onFrame(() => {
  const t = (performance.now() - startMs) / 1000;
  const x = 4.2 * Math.sin(t * 0.45); // slow side-to-side drift of the key light
  try {
    app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  } catch {
    // node registry not ready yet; the state below still reports the intended position
  }
  const state = window.__TASK_STATE__;
  if (state) state.keyLightX = x;
  if (!readySignalled) {
    readySignalled = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
