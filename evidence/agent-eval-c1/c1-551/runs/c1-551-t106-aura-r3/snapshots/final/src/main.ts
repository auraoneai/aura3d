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

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number; selected: "glass" | "metal" | "fabric" | null };
    __EVAL_READY__?: boolean;
  }
}

const R = 0.62; // sphere radius
const SPACING = 1.55;
const KEY_Y = 4.6;
const KEY_Z = 3.2;

// ---------- procedural textures ----------
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Woven cloth: returns albedo (RGBA) and height (RGBA, grey) maps. */
function makeWeave(size: number) {
  const albedo = new Uint8Array(size * size * 4);
  const height = new Uint8Array(size * size * 4);
  const cell = 16; // pixels per thread
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const fx = (x % cell) / cell;
      const fy = (y % cell) / cell;
      const warpOver = (cx + cy) % 2 === 0;
      // thread cross-section profile (rounded)
      const warp = Math.sin(Math.PI * fx); // vertical thread varies across x
      const weft = Math.sin(Math.PI * fy);
      const h = warpOver ? 0.55 + 0.45 * warp : 0.55 + 0.45 * weft;
      const fuzz = hash(x, y);
      const hh = Math.min(1, Math.max(0, h * 0.94 + fuzz * 0.06));
      const shade = 0.55 + 0.45 * hh;
      const i = (y * size + x) * 4;
      // dark red velvet/wool
      albedo[i] = Math.min(255, 92 * shade + fuzz * 8);
      albedo[i + 1] = Math.min(255, 8 * shade + fuzz * 2);
      albedo[i + 2] = Math.min(255, 18 * shade + fuzz * 3);
      albedo[i + 3] = 255;
      const g = Math.round(hh * 255);
      height[i] = g;
      height[i + 1] = g;
      height[i + 2] = g;
      height[i + 3] = 255;
    }
  }
  return { albedo, height };
}

const weave = makeWeave(256);
const weaveAlbedo = texture.data({ width: 256, height: 256, data: weave.albedo, format: "rgba8", colorSpace: "srgb" });
weaveAlbedo.wrapS = "repeat";
weaveAlbedo.wrapT = "repeat";
weaveAlbedo.repeat = [2, 1.5];
weaveAlbedo.anisotropy = 8;
weaveAlbedo.needsUpdate = true;
const weaveHeight = texture.data({ width: 256, height: 256, data: weave.height, format: "rgba8", colorSpace: "linear" });
weaveHeight.wrapS = "repeat";
weaveHeight.wrapT = "repeat";
weaveHeight.repeat = [2, 1.5];
weaveHeight.anisotropy = 8;
weaveHeight.needsUpdate = true;

/** Brushed-metal streak map used as roughness variation. */
function makeBrushed(size: number): Uint8Array {
  const d = new Uint8Array(size * size * 4);
  const rows: number[] = [];
  for (let y = 0; y < size; y++) rows.push(hash(y, 7) * 0.7 + hash(y >> 1, 3) * 0.3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = rows[y]! * 0.8 + hash(x >> 3, y) * 0.2;
      const g = Math.round(110 + v * 90);
      const i = (y * size + x) * 4;
      d[i] = g;
      d[i + 1] = g;
      d[i + 2] = g;
      d[i + 3] = 255;
    }
  }
  return d;
}
const brushedMap = texture.data({ width: 256, height: 256, data: makeBrushed(256), format: "rgba8", colorSpace: "linear" });
brushedMap.wrapS = "repeat";
brushedMap.wrapT = "repeat";
brushedMap.repeat = [1, 2];
brushedMap.needsUpdate = true;

/** Radial soft shadow, alpha falls off smoothly. */
function makeBlob(size: number): Uint8Array {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1;
      const dy = (y + 0.5) / size * 2 - 1;
      const r = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - r);
      const a = t * t * (3 - 2 * t);
      const i = (y * size + x) * 4;
      d[i] = 20;
      d[i + 1] = 18;
      d[i + 2] = 22;
      d[i + 3] = Math.round(a * a * 255);
    }
  }
  return d;
}
const blobTex = texture.data({ width: 64, height: 64, data: makeBlob(64), format: "rgba8", colorSpace: "srgb" });
blobTex.needsUpdate = true;

// ---------- cyclorama (seamless floor curving into backdrop) ----------
function makeCyclorama() {
  const halfW = 14;
  const zFront = 9;
  const zCurveStart = -3.0;
  const curveR = 3.2;
  const wallTop = 9;
  const profile: [number, number][] = []; // (z, y)
  profile.push([zFront, 0]);
  profile.push([zCurveStart, 0]);
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    profile.push([zCurveStart - Math.sin(a) * curveR, curveR - Math.cos(a) * curveR]);
  }
  profile.push([zCurveStart - curveR, wallTop]);
  const xs = [-halfW, halfW];
  const positions = new Float32Array(profile.length * 2 * 3);
  const uvs = new Float32Array(profile.length * 2 * 2);
  const indices: number[] = [];
  profile.forEach(([z, y], j) => {
    xs.forEach((x, k) => {
      const v = j * 2 + k;
      positions.set([x, y, z], v * 3);
      uvs.set([k, j / (profile.length - 1)], v * 2);
    });
  });
  for (let j = 0; j < profile.length - 1; j++) {
    const a = j * 2;
    const b = j * 2 + 1;
    const c = (j + 1) * 2;
    const d = (j + 1) * 2 + 1;
    // profile runs toward -z; surface faces +y / +z
    indices.push(a, b, c, b, d, c);
  }
  const normals = geometry.computeNormals({ positions, indices });
  return geometry.define({
    positions,
    normals,
    indices,
    uvs,
    bounds: { min: [-halfW, 0, zCurveStart - curveR], max: [halfW, wallTop, zFront] }
  });
}

const sphereY = R;
const xs = [-SPACING, 0, SPACING];

const glassMat = material.pbr({
  color: "#8fc9e0",
  metallic: 0,
  roughness: 0.02,
  ior: 1.5,
  specularIntensity: 1,
  envMapIntensity: 2.2,
  clearcoat: 1,
  clearcoatRoughness: 0.0,
  opacity: 0.14,
  alphaMode: "blend",
  depthWrite: false,
  doubleSided: true
});

const metalMat = material.pbr({
  color: "#d4d8de",
  metallic: 1,
  roughness: 0.45,
  anisotropy: 0.9,
  anisotropyRotation: 0,
  roughnessMap: brushedMap,
  envMapIntensity: 1.3
});

const fabricMat = material.pbr({
  color: "#ffffff",
  texture: weaveAlbedo,
  bumpMap: weaveHeight,
  bumpFactor: 0.5,
  metallic: 0,
  roughness: 1,
  sheen: 1,
  sheenRoughness: 0.6,
  sheenColor: "#ff6a78",
  specularIntensity: 0,
  envMapIntensity: 0.6
});

const stage = scene({ background: "#c9ccd1" })
  .add(environments.studio({ preset: "softbox", intensity: 0.55, background: false }))
  .add(
    geometry.custom(makeCyclorama(), {
      name: "cyclorama floor",
      material: material.pbr({ color: "#9a9da3", roughness: 0.92, metallic: 0, doubleSided: true, envMapIntensity: 0.5 }),
      receiveShadow: true
    })
  )
  // key: big soft light, drifts side to side
  .add(
    lights.key({
      name: "key",
      position: [-3, KEY_Y, KEY_Z],
      target: [0, 0.5, 0],
      intensity: 2.2,
      color: "#fff4e6",
      shadow: true
    }).runtime({ id: "key", mutable: true })
  )
  // fill: opposite side, dimmer, cool
  .add(lights.directional({ name: "fill", position: [5, 2.5, 4], target: [0, 0.5, 0], intensity: 0.5, color: "#dce8ff" }))
  // rim: behind the subjects
  .add(lights.directional({ name: "rim", position: [0.5, 3.5, -5], target: [0, 0.6, 0], intensity: 1.8, color: "#ffffff" }))
  .add(lights.ambient({ intensity: 0.08 }));

// soft contact shadows (gradient decals), under each sphere
xs.forEach((x, i) => {
  stage.add(
    primitives
      .plane({
        name: `contact shadow ${i}`,
        size: [R * 3.0, 1, R * 3.0],
        material: material.pbr({
          color: "#ffffff",
          texture: blobTex,
          alphaMode: "blend",
          opacity: 0.85,
          roughness: 1,
          metallic: 0,
          depthWrite: false,
          unlit: true
        })
      })
      .position(x, 0.004, 0.05)
  );
});

stage
  .add(
    primitives
      .sphere({ name: "glass sphere", size: R * 2, material: glassMat, castShadow: true })
      .position(xs[0]!, sphereY, 0)
      .runtime({ id: "glass", mutable: true })
  )
  .add(
    primitives
      .sphere({ name: "metal sphere", size: R * 2, material: metalMat, castShadow: true })
      .position(xs[1]!, sphereY, 0)
      .runtime({ id: "metal", mutable: true })
  )
  .add(
    primitives
      .sphere({ name: "fabric sphere", size: R * 2, material: fabricMat, castShadow: true })
      .position(xs[2]!, sphereY, 0)
      .runtime({ id: "fabric", mutable: true })
  )
  .camera(camera.perspective({ position: [0.9, 2.15, 6.4], target: [0, 0.55, 0], fov: 27 }));

type SphereName = "glass" | "metal" | "fabric";
const state: { spheres: { name: string }[]; keyLightX: number; selected: SphereName | null } = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -3,
  selected: null
};
window.__TASK_STATE__ = state;

const angles: Record<SphereName, number> = { glass: 0, metal: 0, fabric: 0 };
const SPIN_SPEED = 0.6; // rad/s
window.addEventListener("keydown", (e) => {
  if (e.key === "1") state.selected = "glass";
  else if (e.key === "2") state.selected = "metal";
  else if (e.key === "3") state.selected = "fabric";
});

const app = createAuraApp("#app", { scene: stage });

let first = true;
app.onFrame((f) => {
  const x = Math.sin(f.time * 0.45) * 3.2;
  state.keyLightX = x;
  app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  if (state.selected) {
    angles[state.selected] += f.dt * SPIN_SPEED;
    app.nodes.require(state.selected).setRotation(0, angles[state.selected], 0);
  }
  window.__TASK_STATE__ = state;
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
