# Aura3D cheat sheet: if your task needs X, copy block X

`@aura3d/engine` is installed; do not open `node_modules`. Start from the skeleton, paste the blocks you need at its marked lines, write the whole solution first, then `typecheck` once and `finish`. Only if stuck: `docs/agents/api-signatures.md`, `docs/agents/recipes.md`.

## Rules
- `createAuraApp` owns renderer, resize and loop: write none. Per frame `app.onFrame((f) => ...)` (`f.dt` seconds); end with `await app.ready()`; set window flags after it (`declare global { interface Window { __FLAG__?: boolean } }`).
- Vectors `[x, y, z]`, colours CSS strings. Primitives are unit shapes scaled by `size` (`sphere` size = diameter, `plane` `[w, 1, d]` lies in XZ): `primitives.box|sphere|plane|cylinder|capsule|cone|torus`. Node chain: `.position(x, y, z)`, `.scale([x, y, z])`, `.rotate(x, y, z)`.
- Animate later: `.runtime({ id, mutable: true })` then `app.nodes.require(id).setPosition(x, y, z)` / `.setRotation(x, y, z)`; light `.setLight?.({ intensity, color })`; shader `.setUniform?.(name, v)`.
- Instance `colors` multiply the material colour: use base `#ffffff`. Dark frame: add `environments.neutral({ intensity: 0.5, background: false })` or a hemisphere light.
- Camera `camera.orbit({ ..., autoRotate: radPerSec })` orbits its target slowly; never `app.camera`.

## Skeleton (forest scene: orbit camera, hemisphere + shadow sun, exponential fog, ground)
```ts
import { camera, createAuraApp, effects, environments, geometry, group, instances, interactions, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";
let sc = scene({ background: "#b4c8d8" })
  .camera(camera.orbit({ position: [0, 85, 130], target: [0, 2, 0], fov: 45, near: 20, far: 450, autoRotate: 0.12 }))
  .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
  .add(lights.directional({ position: [90, 130, 60], target: [0, 0, 0], intensity: 3, shadow: true }))
  .add(effects.fog({ color: "#b4c8d8", density: 0.0045 }))
  .add(primitives.plane({ name: "ground", size: [260, 1, 260], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }));
// <blocks: top level>
const app = createAuraApp("#app", { scene: sc });
app.onFrame((f) => {
  // <blocks: per frame>
});
await app.ready();
```

## Instancing: seeded scatter with per-instance colour
```ts
let seed = 12345;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [], canopies: AuraTransformSpec[] = [], rocks: AuraTransformSpec[] = [];
const canopyColors: string[] = [], rockColors: string[] = [];
const spot = (): [number, number] => { const a = rand() * 6.283, r = 75 * Math.sqrt(rand()); return [Math.cos(a) * r, Math.sin(a) * r]; };
for (let i = 0; i < 8000; i += 1) {
  const [x, z] = spot(), s = 0.8 + rand() * 0.8;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] });
  canopies.push({ position: [x, 1.3 * s + 2, z], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${100 + Math.floor(rand() * 40)}, 55%, ${25 + Math.floor(rand() * 15)}%)`);
}
for (let i = 0; i < 2000; i += 1) {
  const [x, z] = spot(), s = 0.4 + rand() * 0.8;
  rocks.push({ position: [x, 0.25 * s, z], rotation: [0, rand() * 6, 0], scale: [s, s * 0.7, s] });
  rockColors.push(`hsl(30, 6%, ${35 + Math.floor(rand() * 25)}%)`);
}
const white = material.pbr({ color: "#ffffff", roughness: 0.9 });
sc = sc.add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24" }), params: { radialSegments: 6 } }))
  .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: white, params: { radialSegments: 8 } }))
  .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }));
```
`instances.box|sphere|cylinder|cone`; later `node.setInstances(transforms, colors)`.

## Custom GLSL water: displaced grid, fresnel, noise ripple, sun glint, animated
GLSL 3.00 (`in`/`out`, write `out vec4 outColor`). Prelude, do not declare: `position normal uv modelViewProjectionMatrix modelMatrix cameraPosition uTime` (`uTime` advances itself). The engine tone-maps and sRGB-encodes: output linear colours, no manual gamma. Camera low over the water, e.g. `camera.perspective({ position: [0, 6, 22], target: [0, 1, -30], fov: 55, near: 0.5, far: 400 })` instead of the orbit camera.
```ts
const N = 200, SIZE = 160; // subdivided grid: waves are real geometry
const positions = new Float32Array((N + 1) ** 2 * 3), normals = new Float32Array(positions.length), indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}
const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vec2 p = position.xz;
  float ph = dot(p, vec2(0.21, 0.13)) * 3.0 + uTime;
  vPos = vec3(p.x, sin(ph) * 0.35 + sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + uTime * 1.3) * 0.2, p.y);
  vN = normalize(vec3(-cos(ph) * 0.22, 1.0, -cos(ph) * 0.14));
  gl_Position = modelViewProjectionMatrix * vec4(vPos, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  vec3 n = normalize(vN + vec3(vnoise(vPos.xz * 2.0 + uTime) - 0.5, 0.0, vnoise(vPos.xz * 2.0 - uTime) - 0.5) * 0.25);
  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  vec3 sky = mix(vec3(0.62, 0.78, 0.92), vec3(0.15, 0.35, 0.7), clamp(reflect(-v, n).y, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-normalize(vec3(0.5, 0.45, 0.35)), n), v), 0.0), 140.0);
  outColor = vec4(mix(vec3(0.02, 0.18, 0.3), sky, clamp(fres * 0.9 + 0.08, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.4, 1.0);
}`
  },
  uniforms: {}
});
sc = sc.add(geometry.custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }), { name: "water", material: water, castShadow: false }));
```
Own uniform instead of `uTime`: `uniforms: { clk: { type: "f32", value: 0 } }`, node `.runtime({ id: "water", mutable: true })`, per frame `app.nodes.require("water").setUniform?.("clk", t)`.

## Sky and day/night cycle (sun-following light)
```ts
const DAY = 20; // seconds per cycle
const sunAt = (h: number) => ({ elevationDeg: Math.sin(((h - 6) / 24) * Math.PI * 2) * 70, azimuthDeg: 90 + ((h - 6) / 12) * 180 });
const dirOf = (e: number, a: number, d = 40): [number, number, number] => {
  const E = (e * Math.PI) / 180, A = (a * Math.PI) / 180;
  return [Math.sin(A) * Math.cos(E) * d, Math.sin(E) * d, -Math.cos(A) * Math.cos(E) * d];
};
const s0 = sunAt(10);
sc = sc.add(sky.preetham({ sun: { ...s0, intensity: 1 } })) // or sky.gradient({ zenith, horizon })
  .add(lights.directional({ name: "sun", position: dirOf(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 3, shadow: true }).runtime({ id: "sun", mutable: true }));
let t = 0;
// per frame
t += f.dt;
const hour = (10 + (t / DAY) * 24) % 24, s = sunAt(hour), sun = app.nodes.require("sun");
sun.setPosition(...dirOf(s.elevationDeg, s.azimuthDeg));
sun.setLight?.({ intensity: 3.2 * Math.max(0.15, Math.sin(((hour - 6) / 24) * Math.PI * 2)) }); // never fully dark
app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } }); // moves sun, shifts sky colours
```
(`let t` goes at top level, the lines after `// per frame` go in `onFrame`.) Fog at runtime: `app.atmosphere?.setFog({ color, density })`. Sea plane: `primitives.plane({ name: "sea", size: [200, 1, 200], material: material.pbr({ color: "#2b79a8", roughness: 0.08, opacity: 0.85 }), castShadow: false }).position(0, 0.2, 0)`; moving waves: the water block.

## Flat-shaded low-poly terrain (non-indexed triangles, one normal and RGBA colour per face)
```ts
type V3 = [number, number, number];
const G = 40, S = 40, pos: number[] = [], nor: number[] = [], col: number[] = [];
const H = (x: number, z: number) => Math.max(-1, 5 * (1 - (x * x + z * z) / 400) + Math.sin(x * 0.9) * Math.cos(z * 0.8) * 0.5);
const P = (i: number, j: number): V3 => { const x = (i / G - 0.5) * S, z = (j / G - 0.5) * S; return [x, H(x, z), z]; };
const face = (a: V3, b: V3, c: V3) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  const l = Math.hypot(...n) || 1, k = n[1]! < 0 ? -1 : 1; n = n.map((q) => (q * k) / l); // normal points up
  const y = (a[1] + b[1] + c[1]) / 3, rgb = y < 0.3 ? [0.8, 0.72, 0.45] : y < 3.5 ? [0.2, 0.48, 0.18] : [0.5, 0.45, 0.4];
  for (const p of k > 0 ? [a, b, c] : [a, c, b]) { pos.push(...p); nor.push(...n); col.push(...rgb, 1); }
};
for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { face(P(i, j), P(i, j + 1), P(i + 1, j)); face(P(i + 1, j), P(i, j + 1), P(i + 1, j + 1)); }
sc = sc.add(geometry.custom(geometry.define({ positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
  indices: Array.from({ length: pos.length / 3 }, (_, i) => i), bounds: { min: [-S / 2, -2, -S / 2], max: [S / 2, 8, S / 2] } }), { name: "island", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));
```

## Procedural robot: joint hierarchy, idle animation, key and coloured rim light, dark background
A joint is a `group` whose origin is the pivot; rotating it swings everything beneath. Replace the skeleton's background with `#05060a`, add `environments.neutral({ intensity: 0.15, background: false })`, a bright key (`shadow: true`), a coloured rim `lights.directional({ position: [-3.5, 2.6, -3.5], target: [0, 1, 0], intensity: 5, color: "#ff2fa8" })`, a floor plane and `camera.perspective({ position: [0.9, 1.3, 5.2], target: [0, 1, 0], fov: 36 })`.
```ts
const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 }), dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
let k = 0;
const limb = (len: number, r: number) => primitives.capsule({ name: `limb${k++}`, size: [r * 2, len, r * 2], material: steel }).position(0, -len / 2, 0);
const J = (id: string, position: [number, number, number], kids: Parameters<typeof group>[1]) => group(id, kids, { position }).runtime({ id, mutable: true });
sc = sc.add(J("hips", [0, 1, 0], [
  primitives.box({ name: "pelvis", size: [0.34, 0.16, 0.2], material: dark }),
  J("l-hip", [-0.1, 0, 0], [limb(0.46, 0.07), J("l-knee", [0, -0.47, 0], [limb(0.44, 0.06)])]),
  J("r-hip", [0.1, 0, 0], [limb(0.46, 0.07), J("r-knee", [0, -0.47, 0], [limb(0.44, 0.06)])]),
  J("chest", [0, 0.1, 0], [
    primitives.box({ name: "torso", size: [0.46, 0.5, 0.25], material: steel }).position(0, 0.3, 0),
    J("head", [0, 0.58, 0], [primitives.sphere({ name: "skull", size: 0.26, material: steel }).position(0, 0.2, 0)]),
    J("l-shoulder", [-0.31, 0.5, 0], [limb(0.34, 0.055), J("l-elbow", [0, -0.36, 0], [limb(0.32, 0.048)])]),
    J("r-shoulder", [0.31, 0.5, 0], [limb(0.34, 0.055), J("r-elbow", [0, -0.36, 0], [limb(0.32, 0.048)])])
  ])
]));
let t = 0;
// per frame
t += f.dt;
const b = Math.sin(t * 1.6), w = Math.sin(t * 0.7), n = (id: string) => app.nodes.require(id);
n("hips").setPosition(0.025 * w, 1 + 0.012 * b, 0);
n("chest").setRotation(0.03 * b, 0.1 * w, 0);
n("head").setRotation(-0.04 * b, 0.35 * Math.sin(t * 0.5), 0);
n("l-shoulder").setRotation(0.05 * b, 0, 0.1); n("r-shoulder").setRotation(-0.05 * b, 0, -0.1);
n("l-elbow").setRotation(-0.25 - 0.05 * b, 0, 0); n("r-elbow").setRotation(-0.25 - 0.05 * b, 0, 0);
n("l-knee").setRotation(0.04 + 0.03 * Math.max(0, w), 0, 0); n("r-knee").setRotation(0.04 + 0.03 * Math.max(0, -w), 0, 0);
```
Glow: `material.emissive({ color, emissive, emissiveIntensity })`; `effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 })`; user orbit: `interactions.orbit({ target: "floor" })` with `camera.orbit`.

## Skinned GLB, clips, crossfade
`const assets = defineModelAssets({ soldier: { url: "/assets/soldier.glb", sha256: "<64 hex>", animations: ["Idle", "Run"], license: "fixture" } }, { queryParam: null });` then `sc.add(assets.node("soldier", { name: "m", targetHeight: 1.8 }).animate({ clip: "Idle", loop: true }).runtime({ id: "soldier" }))` and `app.nodes.require("soldier").play("Run", { loop: true, crossFade: 0.4 })`. CLI projects: `model(assets.x)` after `assets resolve`; never invent asset paths.

## Type traps
`setUniform`, `setLight`, `app.atmosphere` are optional: use `?.`. `geometry.define` takes `{ positions, normals, indices, bounds, colors?, uvs? }` (no `kind`). Under `noUncheckedIndexedAccess`, indexed reads need `!`.
