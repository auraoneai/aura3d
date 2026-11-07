import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
  }
}

// ---------- Seamless cove: floor that curves up into the backdrop ----------
const HALF_W = 16;
const COVE_R = 4;
const COVE_Z = -3; // where the floor starts to curve
const WALL_TOP = 16;
type P = { z: number; y: number; nz: number; ny: number };
const profile: P[] = [{ z: 14, y: 0, nz: 0, ny: 1 }, { z: COVE_Z, y: 0, nz: 0, ny: 1 }];
const ARC = 28;
for (let k = 1; k <= ARC; k += 1) {
  const th = (k / ARC) * (Math.PI / 2);
  profile.push({ z: COVE_Z - COVE_R * Math.sin(th), y: COVE_R - COVE_R * Math.cos(th), nz: Math.sin(th), ny: Math.cos(th) });
}
profile.push({ z: COVE_Z - COVE_R, y: WALL_TOP, nz: 1, ny: 0 });

const positions = new Float32Array(profile.length * 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
profile.forEach((p, j) => {
  for (let i = 0; i < 2; i += 1) {
    const v = j * 2 + i;
    positions.set([i === 0 ? -HALF_W : HALF_W, p.y, p.z], v * 3);
    normals.set([0, p.ny, p.nz], v * 3);
    if (i === 0 && j < profile.length - 1) indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
});
const cove = geometry.custom(
  geometry.define({ positions, normals, indices, bounds: { min: [-HALF_W, 0, COVE_Z - COVE_R], max: [HALF_W, WALL_TOP, 14] } }),
  { name: "cove", material: material.pbr({ color: "#d4d6da", roughness: 0.92, metallic: 0 }), castShadow: false }
);

// ---------- Materials ----------
const glassMat = material.physical({
  color: "#eaf6ff",
  metallic: 0,
  roughness: 0.02,
  transmission: 1,
  ior: 1.5,
  thickness: 0.9,
  opacity: 0.35,
  transparent: true,
  clearcoat: 1,
  clearcoatRoughness: 0.02
});

const metalMat = material.physical({
  color: "#c9ced6",
  metallic: 1,
  roughness: 0.38,
  anisotropy: 0.85
});

// Woven velvet / wool: procedural weave, no mirror reflection, sheen at the rim.
const fabricMat = material.custom({
  glsl: {
    vertex: `out vec3 vN; out vec3 vW; out vec2 vUv;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vN; in vec3 vW; in vec2 vUv; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  // weave: threads over/under in a checker, each thread has a rounded cross-section
  vec2 g = vec2(vUv.x * 64.0, vUv.y * 32.0);
  vec2 c = floor(g), f = fract(g);
  float over = mod(c.x + c.y, 2.0);
  float warp = sin(f.x * 3.14159);
  float weft = sin(f.y * 3.14159);
  float thread = mix(warp, weft, over);
  float gap = smoothstep(0.0, 0.35, min(sin(f.x * 3.14159), sin(f.y * 3.14159)) + 0.25);
  float fuzz = vnoise(vUv * vec2(420.0, 210.0)) * 0.5 + vnoise(vUv * vec2(1100.0, 550.0)) * 0.5;
  float tone = (0.55 + 0.45 * thread) * (0.8 + 0.4 * fuzz) * (0.7 + 0.3 * gap);
  vec3 base = vec3(0.34, 0.015, 0.035) * tone;
  vec3 keyPos = vec3(keyX, 6.0, 5.0);
  vec3 L = normalize(keyPos - vW);
  vec3 L2 = normalize(vec3(-6.0, 3.0, 3.0) - vW);
  vec3 L3 = normalize(vec3(0.0, 4.0, -7.0) - vW);
  float wrap = 0.35;
  float d1 = clamp((dot(n, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float d2 = clamp((dot(n, L2) + wrap) / (1.0 + wrap), 0.0, 1.0);
  float d3 = clamp(dot(n, L3), 0.0, 1.0);
  float hemi = 0.5 + 0.5 * n.y;
  vec3 lit = base * (vec3(1.0, 0.95, 0.9) * d1 * 2.4 + vec3(0.75, 0.82, 1.0) * d2 * 0.7 + vec3(1.0) * d3 * 0.5 + vec3(0.55, 0.52, 0.5) * hemi * 0.45);
  // velvet sheen: bright fuzzy rim, strongest where light grazes the surface
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6);
  float lightSide = 0.35 + 0.65 * clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  vec3 sheen = vec3(0.95, 0.22, 0.28) * rim * lightSide * (0.55 + 0.9 * fuzz) * 0.9;
  outColor = vec4(lit + sheen, 1.0);
}`
  },
  uniforms: { keyX: { type: "f32", value: 0 } }
});

// ---------- Scene ----------
const R = 0.85;
const SPACING = 2.3;
const keyY = 6.5;
const keyZ = 5.5;

const sc = scene({ background: "#c9ccd2" })
  .camera(camera.perspective({ position: [2.2, 2.9, 8.4], target: [0, 0.75, 0], fov: 32, near: 0.5, far: 80 }))
  .add(environments.studio({ intensity: 1.0, background: false }))
  .add(lights.hemisphere({ skyColor: "#f2f4f8", groundColor: "#b9bbc0", intensity: 0.45 }))
  .add(lights.directional({ name: "key", position: [0, keyY, keyZ], target: [0, 0.6, 0], intensity: 3.0, color: "#fff3e4", shadow: true }).runtime({ id: "key", mutable: true }))
  .add(lights.directional({ name: "fill", position: [-7, 3.5, 4], target: [0, 0.6, 0], intensity: 1.0, color: "#d6e2ff" }))
  .add(lights.directional({ name: "rim", position: [1, 4.5, -8], target: [0, 0.8, 0], intensity: 2.4, color: "#ffffff" }))
  .add(effects.contactShadows({ intensity: 0.8 }))
  .add(cove)
  .add(primitives.sphere({ name: "glass", size: R * 2, material: glassMat, params: { widthSegments: 64, heightSegments: 48 } }).position(-SPACING, R, 0))
  .add(primitives.sphere({ name: "metal", size: R * 2, material: metalMat, params: { widthSegments: 64, heightSegments: 48 } }).position(0, R, 0))
  .add(primitives.sphere({ name: "fabric", size: R * 2, material: fabricMat, params: { widthSegments: 96, heightSegments: 64 } }).position(SPACING, R, 0).runtime({ id: "fabric", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

const state = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: 0 };
window.__TASK_STATE__ = state;

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const x = 4.5 * Math.sin(t * 0.45);
  app.nodes.require("key").setPosition(x, keyY, keyZ);
  app.nodes.require("fabric").setUniform?.("keyX", x);
  state.keyLightX = x;
  window.__TASK_STATE__ = state;
});

await app.ready();
window.__EVAL_READY__ = true;
