import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
  }
}

// ---------------------------------------------------------------- studio cove
// Seamless floor that curves up into the backdrop: flat floor, quarter-circle cove, vertical wall.
const COVE_Z = -5, R = 4, HALF_W = 30, WALL_TOP = 16, FRONT_Z = 20;
type Row = { y: number; z: number; ny: number; nz: number };
const rows: Row[] = [];
for (let z = FRONT_Z; z > COVE_Z; z -= 1.5) rows.push({ y: 0, z, ny: 1, nz: 0 });
const ARC = 24;
for (let k = 0; k <= ARC; k += 1) {
  const th = (k / ARC) * (Math.PI / 2);
  rows.push({ y: R - R * Math.cos(th), z: COVE_Z - R * Math.sin(th), ny: Math.cos(th), nz: Math.sin(th) });
}
rows.push({ y: WALL_TOP, z: COVE_Z - R, ny: 0, nz: 1 });

const COLS = 8;
const positions = new Float32Array(rows.length * (COLS + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j < rows.length; j += 1) {
  const row = rows[j]!;
  for (let i = 0; i <= COLS; i += 1) {
    const v = j * (COLS + 1) + i;
    positions.set([(i / COLS - 0.5) * 2 * HALF_W, row.y, row.z], v * 3);
    normals.set([0, row.ny, row.nz], v * 3);
    if (i < COLS && j < rows.length - 1) {
      const a = v, b = v + 1, c = v + COLS + 1, d = v + COLS + 2;
      indices.push(a, b, c, b, d, c);
    }
  }
}
const coveGeometry = geometry.define({
  positions,
  normals,
  indices,
  bounds: { min: [-HALF_W, 0, COVE_Z - R], max: [HALF_W, WALL_TOP, FRONT_Z] }
});

// ---------------------------------------------------------------- materials
// Glass: clear, refractive, glossy.
const glass = material.glass({
  color: "#f2fbff",
  roughness: 0.02,
  metallic: 0,
  opacity: 0.4,
  transmission: 1,
  ior: 1.5,
  thickness: 1.4
});

// Brushed steel: fully metallic, blurred / stretched reflection.
const steel = material.brushedMetal({
  color: "#c6cbd3",
  metallic: 1,
  roughness: 0.4,
  anisotropy: 0.85
});

// Dark red velvet: procedural weave, fibre noise, grazing sheen, no mirror reflection.
const fabric = material.custom({
  glsl: {
    vertex: `out vec3 vW; out vec3 vN; out vec2 vUv;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = mat3(modelMatrix) * normal;
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; in vec3 vN; in vec2 vUv; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  const float PI = 3.14159265;
  vec3 V = normalize(cameraPosition - vW);
  vec3 N0 = normalize(vN);

  // plain weave: alternating over/under threads
  vec2 g = vUv * vec2(160.0, 80.0);
  vec2 c = floor(g);
  vec2 f = fract(g);
  float odd = mod(c.x + c.y, 2.0);
  float hv = sin(f.x * PI);
  float hh = sin(f.y * PI);
  float h = mix(hh, hv, odd);
  float slopeX = mix(0.0, cos(f.x * PI), odd);
  float slopeY = mix(cos(f.y * PI), 0.0, odd);
  float fibre = vnoise(vUv * vec2(700.0, 350.0));
  float fuzz = vnoise(vUv * vec2(60.0, 30.0));

  vec3 T = normalize(cross(N0, vec3(0.0, 1.0, 0.0)) + vec3(0.0001, 0.0, 0.0));
  vec3 B = cross(N0, T);
  vec3 N = normalize(N0 + (T * slopeX + B * slopeY) * 0.22);

  vec3 albedo = mix(vec3(0.10, 0.004, 0.012), vec3(0.40, 0.022, 0.04), clamp(h * 0.6 + fibre * 0.3 + fuzz * 0.2, 0.0, 1.0));
  float cavity = mix(0.55, 1.0, h);

  vec3 Lk = normalize(vec3(keyX, 7.0, 8.0) - vW);
  vec3 Lf = normalize(vec3(-8.0, 3.0, 6.0) - vW);
  vec3 Lr = normalize(vec3(2.0, 5.0, -6.0) - vW);
  float dk = max((dot(N, Lk) + 0.35) / 1.35, 0.0);
  float df = max((dot(N, Lf) + 0.35) / 1.35, 0.0);
  float dr = max((dot(N, Lr) + 0.35) / 1.35, 0.0);
  vec3 lit = vec3(1.0, 0.95, 0.9) * dk * 2.4 + vec3(0.8, 0.85, 1.0) * df * 0.7 + vec3(1.0) * dr * 0.8 + vec3(0.16);
  vec3 col = albedo * cavity * lit;

  // velvet sheen: bright fuzzy edge, stronger toward the lights
  float edge = pow(1.0 - clamp(dot(N0, V), 0.0, 1.0), 3.0);
  float towardLight = clamp(dot(N0, Lk) * 0.5 + 0.5, 0.0, 1.0) * 0.7 + clamp(dot(N0, Lr) * 0.5 + 0.5, 0.0, 1.0) * 0.5;
  col += vec3(0.85, 0.16, 0.24) * edge * (0.25 + towardLight) * (0.7 + 0.5 * fibre);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { keyX: { type: "f32", value: 0 } },
  castShadow: true
});

// ---------------------------------------------------------------- scene
const KEY_Y = 7, KEY_Z = 8;
const sc = scene({ background: "#cdcdd1" })
  .camera(camera.perspective({ position: [3.6, 3.3, 9.5], target: [0, 0.75, 0], fov: 36, near: 0.5, far: 90 }))
  .add(environments.studio({ intensity: 1.1, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#bdbdc2", intensity: 0.45 }))
  .add(lights.directional({ name: "key", position: [0, KEY_Y, KEY_Z], target: [0, 0.5, 0], intensity: 3, color: "#fff4e8", shadow: true }).runtime({ id: "key", mutable: true }))
  .add(lights.directional({ name: "fill", position: [-8, 3, 6], target: [0, 0.8, 0], intensity: 0.9, color: "#dfe8ff" }))
  .add(lights.directional({ name: "rim", position: [2, 5, -6], target: [0, 0.8, 0], intensity: 2, color: "#ffffff" }))
  .add(
    geometry.custom(coveGeometry, {
      name: "cove",
      material: material.pbr({ color: "#c8c8cc", roughness: 0.85, metallic: 0 }),
      castShadow: false,
      receiveShadow: true
    })
  )
  .add(primitives.sphere({ name: "glass", size: 1.6, material: glass, castShadow: true }).position(-2.2, 0.8, 0))
  .add(primitives.sphere({ name: "metal", size: 1.6, material: steel, castShadow: true }).position(0, 0.8, 0))
  .add(primitives.sphere({ name: "fabric", size: 1.6, material: fabric, castShadow: true }).position(2.2, 0.8, 0).runtime({ id: "fabric", mutable: true }))
  .add(effects.contactShadows({ intensity: 1, length: 0.6 }));

const app = createAuraApp("#app", { scene: sc });

window.__TASK_STATE__ = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: 0 };

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const kx = 6 * Math.sin(t * 0.4);
  app.nodes.require("key").setPosition(kx, KEY_Y, KEY_Z);
  app.nodes.require("fabric").setUniform?.("keyX", kx);
  window.__TASK_STATE__ = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: kx };
});

await app.ready();
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
