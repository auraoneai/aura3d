## First screen: Aura3D patterns (copy the shape, change the subject)

`@aura3d/engine` is installed; never open `node_modules` or `dist`. Blocks are typechecked, GPU-rendered patterns, not finished scenes: change subject and numbers; typecheck once. `createAuraApp(selector, { scene })` owns renderer, resize and loop. Vectors `[x, y, z]`, colours CSS strings, primitives are unit shapes scaled by `size`. Per frame `app.onFrame((f) => ...)` gives `f.dt`, `f.time` in seconds. To change a node later give it `.runtime({ id, mutable: true })`, then `app.nodes.require(id).setPosition(x, y, z)`.

### Scene skeleton: look, subject, camera, per-frame update
```ts render=animated
import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";
const app = createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio", { exposureEv: -1.2 }))
    .add(primitives.sphere({ name: "orb", size: 1.6, material: material.pbr({ color: "#d9534f", roughness: 0.4 }) }).position(0, 0.8, 0).runtime({ id: "orb", mutable: true }))
    .camera(camera.orbit({ position: [3, 2.5, 5], target: [0, 1, 0], fov: 40 })),
  ...looks.appOptions("product-studio")
});
app.onFrame((f) => app.nodes.require("orb").setPosition(0, 0.8 + 0.9 * Math.abs(Math.sin(f.time * 1.7)), 0));
await app.ready();
```
Gotchas: a look brings light, shadow, fog, sky and grade; spread `looks.appOptions(id)` with it (`outdoor-day`, `night-city`, `golden-hour`, `overcast`, `space`). `camera.perspective` is fixed, `camera.orbit` adds drag. Bright looks wash out: `looks.preset(id, { exposureEv: -1 })`. Colours are `#rrggbb`, `rgb()` or names: `hsl()` strings are not parsed. Hand-built light needs `environments.neutral({ intensity: 0.6, background: false })` beside `lights.directional({ position, target, intensity: 3, shadow: true })`, else the frame is flat and dark and metals reflect nothing; `primitives.plane` size is `[w, 1, d]`. Glow: `effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 })`.

### Instancing: many copies, one draw, updated live
```ts render=animated
import { camera, createAuraApp, looks, material, instances, scene, type AuraTransformSpec } from "@aura3d/engine";
const PAL = ["#e4572e", "#f3a712", "#a8c686", "#29a0b1", "#669bbc", "#9a5fb4"];
const N = 12, at = (i: number, t: number): AuraTransformSpec => {
  const x = (i % N) - 6, z = Math.floor(i / N) - 6, h = 0.7 + 0.5 * Math.sin(t + Math.hypot(x, z));
  return { position: [x, h / 2, z], scale: [0.8, h, 0.8] };
};
const cells = Array.from({ length: N * N }, (_, i) => at(i, 0));
const colors = cells.map((_, i) => PAL[(i % N + Math.floor(i / N)) % 6]!);
const app = createAuraApp("#app", {
  scene: scene().add(looks.preset("outdoor-day", { exposureEv: -1 }))
    .add(instances.box({ name: "tiles", transforms: cells, colors, material: material.pbr({ color: "#ffffff" }) }).runtime({ id: "tiles", mutable: true }))
    .camera(camera.orbit({ position: [10, 9, 12], target: [0, 0, 0], fov: 40 })),
  ...looks.appOptions("outdoor-day")
});
app.onFrame((f) => app.nodes.require("tiles").setInstances(cells.map((_, i) => at(i, f.time * 1.3)), colors));
```
Gotchas: `instances.box|sphere|cylinder|cone|model`; `setInstances(transforms, colors)` animates, thousands are fine; pass the colours every call or they reset to the base colour.

### Custom shader: your own time uniform
```ts render=animated
import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";
const plasma = material.custom({
  glsl: {
    vertex: `out vec3 vP; void main() { vP = position; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`,
    fragment: `in vec3 vP; out vec4 outColor;
void main() {
  float w = sin(vP.x * 9.0 + clk) + sin(vP.y * 11.0 - clk * 1.3);
  outColor = vec4(0.5 + 0.5 * cos(w + vec3(0.0, 2.1, 4.2)), 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});
const app = createAuraApp("#app", {
  scene: scene({ background: "#0b0d14" }).add(primitives.sphere({ name: "blob", size: 2, material: plasma }).runtime({ id: "blob", mutable: true }))
    .camera(camera.perspective({ position: [0, 0.4, 4], target: [0, 0, 0], fov: 40 }))
});
app.onFrame((f) => app.nodes.require("blob").setUniform?.("clk", f.time));
```
Gotchas: GLSL 3.00 (`in`/`out`, declare your own `out vec4 outColor`). Prelude, never declare: `position normal uv modelViewProjectionMatrix modelMatrix cameraPosition`. On 5.0.x `uTime` does not advance by itself: declare a uniform and push it with `setUniform` every frame on a `.runtime({ id, mutable: true })` node, or the shader is frozen. A compile error logs `CUSTOM_SHADER_COMPILE_FAILED` and skips the draw.

### Procedural geometry: revolve a profile
```ts render=static
import { camera, createAuraApp, geometry, looks, material, scene } from "@aura3d/engine";
const R = 32, S = 20, positions = new Float32Array((R + 1) * (S + 1) * 3), indices: number[] = [];
for (let j = 0; j <= S; j += 1) for (let i = 0; i <= R; i += 1) {
  const y = j / S, r = 0.35 + 0.25 * Math.sin(y * Math.PI) , a = (i / R) * Math.PI * 2;
  positions.set([Math.cos(a) * r, y * 1.6, Math.sin(a) * r], (j * (R + 1) + i) * 3);
  if (i < R && j < S) { const v = j * (R + 1) + i; indices.push(v, v + 1, v + R + 1, v + 1, v + R + 2, v + R + 1); }
}
const geo = geometry.define({ positions, normals: geometry.computeNormals({ positions, indices }), indices, bounds: { min: [-0.7, 0, -0.7], max: [0.7, 1.6, 0.7] } });
createAuraApp("#app", {
  scene: scene().add(looks.preset("product-studio", { exposureEv: -1.2 }))
    .add(geometry.custom(geo, { name: "vase", material: material.pbr({ color: "#c58b5a", roughness: 0.5 }) }))
    .camera(camera.orbit({ position: [2.4, 1.6, 2.8], target: [0, 0.8, 0], fov: 38 })),
  ...looks.appOptions("product-studio")
});
```
Gotchas: `geometry.define({ positions, normals, indices, bounds, colors?, uvs? })` takes typed arrays, `indices: number[]` and `bounds`. Counter-clockwise triangles face out.

### Rigged model: clips and crossfade
```ts render=asset:animated
import { camera, createAuraApp, defineModelAssets, looks, scene } from "@aura3d/engine";
const assets = defineModelAssets(
  { hero: { url: "/assets/hero.glb", sha256: "<64 hex of the file>", animations: ["Idle", "Walking"], license: "fixture" } },
  { queryParam: null }
);
const app = createAuraApp("#app", {
  scene: scene().add(looks.preset("character-showcase"))
    .add(assets.node("hero", { name: "hero", targetHeight: 1.8 }).animate({ clip: "Idle", loop: true }).runtime({ id: "hero" }))
    .camera(camera.perspective({ position: [0, 1.3, 4.5], target: [0, 0.9, 0], fov: 40 })),
  ...looks.appOptions("character-showcase")
});
window.addEventListener("keydown", () => app.nodes.require("hero").play("Walking", { loop: true, crossFade: 0.4 }));
await app.ready();
```
Gotchas: clip names come from the file (`npx @aura3d/cli@latest assets inspect <file> --animation`). In a CLI project use `model(assets.hero)` after `assets resolve`. One skinned body per character: never animate primitives beside it.

### Game loop and input: fixed step, actions
```ts render=animated
import { camera, createAuraApp, createFixedStepLoop, looks, material, primitives, scene } from "@aura3d/engine";
const app = createAuraApp("#app", {
  scene: scene().add(looks.preset("arena-fight"))
    .add(primitives.box({ name: "player", size: 1.4, material: material.pbr({ color: "#4aa3ff" }) }).position(0, 0.7, 0).runtime({ id: "player", mutable: true }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#3b4350" }) }))
    .camera(camera.perspective({ position: [0, 4, 6], target: [0, 0.5, 0], fov: 45 })),
  ...looks.appOptions("arena-fight")
});
const input = app.input({ actions: { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"] } });
const state = { x: 0, t: 0 };
createFixedStepLoop({ stepSeconds: 1 / 60, step: (dt) => {
  input.update(dt); state.t += dt;
  state.x += ((input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0)) * 4 * dt;
}, render: () => app.nodes.require("player").setPosition(state.x, 0.7, 0).setRotation(0, state.t * 3, 0) }).start();
await app.ready();
```
Gotchas: simulate in `step` (no `Date.now`, no `Math.random`), copy state to nodes in `render`. Restart by resetting state and nodes, not `app.setScene`. Full games (`createGame`: pause, touch, results): `docs/agents/build-a-game.md`.

### Physics: bound bodies stepped in onFrame
```ts render=animated
import { camera, createAuraApp, looks, material, primitives, scene } from "@aura3d/engine";
const balls = Array.from({ length: 4 }, (_, i) => primitives.sphere({ name: `b${i}`, size: 0.5, material: material.pbr({ color: ["#e4572e", "#f3a712", "#29a0b1", "#9a5fb4"][i]! }) })
  .position((i % 3) * 0.3 - 0.3, 2 + i * 1.2, (i % 2) * 0.2).runtime({ id: `b${i}`, mutable: true })
  .physics({ type: "dynamic", shape: "sphere", radius: 0.25, mass: 1, restitution: 0.5 }));
const app = createAuraApp("#app", {
  scene: balls.reduce((s, b) => s.add(b), scene().add(looks.preset("outdoor-day", { exposureEv: -1 }))
    .add(primitives.box({ name: "floor", size: [6, 0.2, 6], material: material.pbr({ color: "#7a8470" }) }).runtime({ id: "floor" }).physics({ type: "static", shape: "box", halfExtents: [3, 0.1, 3] })))
    .camera(camera.perspective({ position: [4, 3, 6], target: [0, 1.5, 0], fov: 40 })),
  physics: { bindNodes: true }, ...looks.appOptions("outdoor-day")
});
app.onFrame((f) => { app.physics.step(f.dt); });
await app.ready();
```
Gotchas: needs the optional peer `@dimforge/rapier3d-compat` installed (scaffolds have it), else the page throws. Pass `physics: { bindNodes: true }`, give each body `.runtime({ id })`, call `app.physics.step(dt)` once per frame. Colliders take radius or half extents, not the primitive `size`.

### Particles: built-in sprites, no art needed
```ts render=animated
import { camera, createAuraApp, effects, environments, material, primitives, scene } from "@aura3d/engine";
createAuraApp("#app", {
  scene: scene({ background: "#080b14" }).add(environments.neutral({ intensity: 0.2, background: false }))
    .add(primitives.plane({ name: "ground", size: [12, 1, 12], material: material.pbr({ color: "#242a36", roughness: 1 }) }))
    .add(effects.particles({ name: "fountain", position: [0, 0.2, 0], rate: 90, maxParticles: 400, lifetime: [1.2, 1.8], speed: [3, 4.5], size: [0.12, 0.22], gravity: 6, drag: 0.1, blend: "additive", seed: 7, color: "#6fc8ff" }))
    .camera(camera.perspective({ position: [0, 2.5, 6], target: [0, 1.5, 0], fov: 42 }))
});
```
Gotchas: `blend: "additive"` for glow, `"alpha"` for smoke; also `sprite`. Weather: `effects.rain()`, `effects.snow()`.

### Assets and find more
A real object named in the task: `npx @aura3d/cli@latest assets resolve "<object>" --name robot`, then `model(assets.robot)` from `./src/aura-assets`. Never invent paths or ids; a route-local `new URL(..., import.meta.url)` model URL draws black (use `/aura-assets/<file>`). No match: build it procedurally from the patterns above. Exact signatures for `lights`, `material`, `environments`, `sky`, `effects`: `docs/agents/api-signatures.md`. Complete scenes (forest, water, terrain, robot, props, sky, fire, night street): `docs/agents/recipes.md`. Setters `setUniform`, `setLight`, `app.atmosphere` are optional: use `?.`.
