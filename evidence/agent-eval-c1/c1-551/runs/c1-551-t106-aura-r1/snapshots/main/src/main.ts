import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  lights,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

// ---- Seamless cove: flat floor that curves up into a vertical backdrop ----
// Profile in (z, y): flat from z=FRONT to z=CURVE_START, quarter-circle of radius R, then a wall of height WALL.
const FRONT = 14;
const CURVE_START = -3.2;
const R = 3.4;
const WALL = 7;
const HALF_W = 16;
const ARC_STEPS = 24;

const profile: Array<[number, number]> = [];
profile.push([FRONT, 0]);
profile.push([CURVE_START + 4, 0]);
for (let i = 0; i <= ARC_STEPS; i += 1) {
  const a = (i / ARC_STEPS) * (Math.PI / 2);
  profile.push([CURVE_START - Math.sin(a) * R, R - Math.cos(a) * R]);
}
profile.push([CURVE_START - R, R + WALL]);

const COLS = 8;
const rows = profile.length;
const positions = new Float32Array(rows * (COLS + 1) * 3);
const uvs = new Float32Array(rows * (COLS + 1) * 2);
const indices: number[] = [];
for (let j = 0; j < rows; j += 1) {
  const [pz, py] = profile[j]!;
  for (let i = 0; i <= COLS; i += 1) {
    const x = -HALF_W + (i / COLS) * HALF_W * 2;
    const k = j * (COLS + 1) + i;
    positions.set([x, py, pz], k * 3);
    uvs.set([i / COLS, j / (rows - 1)], k * 2);
  }
}
for (let j = 0; j < rows - 1; j += 1) {
  for (let i = 0; i < COLS; i += 1) {
    const a = j * (COLS + 1) + i;
    const b = a + 1;
    const c = a + (COLS + 1);
    const d = c + 1;
    // Rows go from front (+z) towards the back (-z); the surface faces up/forward.
    indices.push(a, b, c, b, d, c);
  }
}
const coveGeo = geometry.define({
  positions,
  normals: geometry.computeNormals({ positions, indices }),
  indices,
  uvs,
  bounds: { min: [-HALF_W, 0, CURVE_START - R], max: [HALF_W, R + WALL, FRONT] }
});

// ---- Materials ----
const glass = material.studioGlass({
  name: "glass",
  tint: "#eef8ff",
  ior: 1.5,
  thickness: 1.1,
  roughness: 0.0,
  envMapIntensity: 2.2,
  attenuationColor: "#bfe6f2",
  attenuationDistance: 2.2,
  clearcoat: 1,
  clearcoatRoughness: 0.0
});

const steel = material.brushedMetal({
  name: "brushed steel",
  color: "#a9afb6",
  roughness: 0.38,
  metallic: 1,
  anisotropy: 0.9,
  envMapIntensity: 1.0
});

// ---- Procedural woven-cloth textures (colour + height), generated in code ----
const TEX = 256;
const THREADS = 8; // threads per tile in each direction
let rng = 1234567;
const rand = (): number => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
const colorData = new Uint8Array(TEX * TEX * 4);
const heightData = new Uint8Array(TEX * TEX * 4);
for (let y = 0; y < TEX; y += 1) {
  for (let x = 0; x < TEX; x += 1) {
    const u = (x / TEX) * THREADS;
    const v = (y / TEX) * THREADS;
    const iu = Math.floor(u);
    const iv = Math.floor(v);
    const fu = u - iu;
    const fv = v - iv;
    const warpOver = (iu + iv) % 2 === 0; // plain weave: warp over weft on alternate cells
    // Thread cross-section: rounded across the thread, dips where it passes under its neighbour.
    const warpProfile = Math.sin(Math.PI * fu);
    const weftProfile = Math.sin(Math.PI * fv);
    const along = warpOver ? Math.sin(Math.PI * fv) : Math.sin(Math.PI * fu);
    const h = warpOver ? 0.55 + 0.45 * warpProfile * (0.6 + 0.4 * along) : 0.55 + 0.45 * weftProfile * (0.6 + 0.4 * along);
    const fuzz = (rand() - 0.5) * 0.18;
    const shade = Math.min(1, Math.max(0.05, 0.55 + 0.45 * h + fuzz * 0.6));
    const i = (y * TEX + x) * 4;
    colorData[i] = Math.round(105 * shade + (warpOver ? 10 : 0));
    colorData[i + 1] = Math.round(9 * shade);
    colorData[i + 2] = Math.round(20 * shade);
    colorData[i + 3] = 255;
    const hv = Math.round(Math.min(1, Math.max(0, h + fuzz * 0.5)) * 255);
    heightData[i] = heightData[i + 1] = heightData[i + 2] = hv;
    heightData[i + 3] = 255;
  }
}
const toCanvasTexture = (data: Uint8Array, colorSpace: "srgb" | "linear") => {
  const cv = document.createElement("canvas");
  cv.width = TEX;
  cv.height = TEX;
  const ctx = cv.getContext("2d")!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), TEX, TEX), 0, 0);
  return texture.canvas({ canvas: cv, colorSpace, flipY: false });
};
const weaveColor = toCanvasTexture(colorData, "srgb");
void heightData;
for (const t of [weaveColor]) {
  t.wrapS = "repeat";
  t.wrapT = "repeat";
  t.repeat = [10, 5];
  t.generateMipmaps = true;
  t.minFilter = "linear-mipmap-linear";
  t.anisotropy = 8;
  t.needsUpdate = true;
}

const velvet = material.fabric({
  name: "red velvet",
  color: "#ffffff",
  texture: weaveColor,
  roughness: 1,
  metallic: 0,
  sheen: 1,
  sheenRoughness: 0.45,
  sheenColor: "#c23a4e",
  envMapIntensity: 0.15,
  normal: material.proceduralTexture("fabric-normal", { scale: 24, strength: 0.7, contrast: 0.8 })
});

const floorMat = material.pbr({ color: "#b3b6bc", roughness: 0.92, metallic: 0, envMapIntensity: 0.45 });

// ---- Scene ----
const SPHERE = 1.7;
const SPACING = 2.25;
const KEY_Y = 6.2;
const KEY_Z = 5.2;

const stage = scene({ background: "#b3b6bc" })
  .add(environments.studio({ preset: "softbox", intensity: 0.85, background: false }))
  // Large soft key from the front-left, drifting side to side (see onFrame).
  .add(
    lights.directional({
      name: "key",
      position: [-3, KEY_Y, KEY_Z],
      target: [0, 0.6, 0],
      intensity: 2.6,
      color: "#fff3e4",
      shadow: { filter: "pcss", softness: 1, lightSize: 2.4, mapSize: 2048, bias: 0.004, normalBias: 0.05 }
    }).runtime({ id: "key", mutable: true })
  )
  // Dimmer, cooler fill from the opposite side.
  .add(
    lights.rect({
      name: "fill",
      position: [6, 3.2, 4.5],
      target: [0, 0.8, 0],
      intensity: 1.6,
      color: "#dfe9ff",
      width: 3,
      height: 3
    })
  )
  // Rim light from behind.
  .add(
    lights.spot({
      name: "rim",
      position: [-1.5, 3.8, -4.5],
      target: [0, 0.9, 0],
      angle: 0.7,
      penumbra: 0.8,
      intensity: 70,
      color: "#fff6ee",
      distance: 18
    })
  )
  .add(lights.hemisphere({ name: "bounce", skyColor: "#f4f6fa", groundColor: "#b9bcc2", intensity: 0.35 }))
  .add(geometry.custom(coveGeo, { name: "cove floor", material: floorMat, receiveShadow: true, castShadow: false }))
  .add(
    primitives.sphere({ name: "glass sphere", size: SPHERE, material: glass, castShadow: true, receiveShadow: true })
      .position(-SPACING, SPHERE / 2, 0)
  )
  .add(
    primitives.sphere({ name: "metal sphere", size: SPHERE, material: steel, castShadow: true, receiveShadow: true })
      .position(0, SPHERE / 2, 0)
  )
  .add(
    primitives.sphere({ name: "fabric sphere", size: SPHERE, material: velvet, castShadow: true, receiveShadow: true })
      .position(SPACING, SPHERE / 2, 0)
  )
  .add(effects.contactShadows({ length: 0.6, thickness: 0.4, intensity: 0.9 }))
  .camera(camera.perspective({ position: [0.7, 2.5, 7.6], target: [0, 0.7, 0], fov: 31 }));

const app = createAuraApp("#app", { scene: stage });

window.__TASK_STATE__ = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -3
};

let ready = false;
app.onFrame((f) => {
  const x = Math.sin(f.time * 0.5) * 4.5;
  const key = app.nodes.require("key");
  key.setPosition(x, KEY_Y, KEY_Z);
  window.__TASK_STATE__ = {
    spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
    keyLightX: x
  };
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
