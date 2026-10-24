# Recipes: copy a working scene, then adapt it

Start here when the task looks like one of these. Each recipe is a complete `src/main.ts` body that compiled against the engine types (`tsc`, strict) and uses only non-deprecated root exports. Copy it, change names and numbers, run `npm run build`. Do not read `node_modules/@aura3d/engine/dist` to discover the API first: that is the slowest path (in the cold-start trial, 8 of 15 runs spent all 40 turns reading `.d.ts` and `dist` files without writing a scene, while the game-loop runs, which had a complete sample to copy, finished in 11 to 17 turns).

Page needs a `<div id="app">` (or a `<canvas id="app">`); `createAuraApp("#app", { scene })` mounts into it. Background, camera, lights and fog are ordinary nodes or scene options. Animate inside `app.onFrame((frame) => ...)` using `frame.dt`. Await `app.ready()` when you need the first frame.

Rules that every recipe follows:

- Orbit control: `interactions.orbit({ target: "<node name>" })`. It takes a node name, nothing else.
- Metals need something to reflect: add `environments.neutral(...)` (or a look preset) or a metallic material renders dark.
- Instancing: `instances.cone/cylinder/sphere/box({ transforms, colors })` draws one draw call per shape; shapes are unit-sized, so `scale` sets the size.
- A deformed surface needs vertices: build a grid with `geometry.define` and mount it with `geometry.custom(...)`.
- Anything you move, rotate, or play at runtime needs `.runtime({ id, mutable: true })` on its node; `app.nodes.require(id)` throws without it. (If a callback in `onFrame` throws, 4.1.4 and later log `onFrame callback threw: ...` once and keep rendering; 4.1.3 and earlier stop drawing and leave a blank page.)
- Never silence a type error with `as never` or `as any`: the error is the real answer.

## 1. Rotating PBR cube with orbit control

```ts
import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene({ background: "#2b2b2e" })
    .add(environments.neutral({ intensity: 1, background: false })) // metals need something to reflect
    .add(lights.directional({ name: "key", position: [4, 5, 4], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 2, 3], target: [0, 0, 0], intensity: 1.2, color: "#9db8ff" }))
    .add(primitives.box({ name: "cube", material: material.pbr({ color: "#c8ccd4", metallic: 0.9, roughness: 0.38 }) }).runtime({ id: "cube", mutable: true })) // runtime + mutable: required to move it later
    .add(interactions.orbit({ target: "cube" })) // target is a node NAME
    .camera(camera.orbit({ position: [2.8, 1.9, 3.4], target: [0, 0, 0], fov: 40 }))
});

let angle = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.8; // animate in onFrame, scaled by frame.dt
  app.nodes.require("cube").setRotation(angle * 0.45, angle, 0);
});
await app.ready(); // renderer mounted, first frame drawn
```

## 2. A forest of thousands of instances (fog, shadows, per-instance colour)

```ts
import { createAuraApp, effects, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

let seed = 12345; // any seeded RNG: same forest every load
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const trunks: AuraTransformSpec[] = [];
const canopies: AuraTransformSpec[] = [];
const canopyColors: string[] = [];
for (let i = 0; i < 8000; i += 1) {
  const a = rand() * Math.PI * 2;
  const r = 75 * Math.sqrt(rand());
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r;
  const s = 0.8 + rand() * 0.8;
  trunks.push({ position: [x, 0.8 * s, z], scale: [0.34 * s, 1.6 * s, 0.34 * s] }); // unit shapes: scale sets the size
  canopies.push({ position: [x, 1.3 * s + 2, z], scale: [2.4 * s, 4 * s, 2.4 * s] });
  canopyColors.push(`hsl(${100 + Math.floor(rand() * 40)}, 55%, ${25 + Math.floor(rand() * 15)}%)`);
}

createAuraApp("#app", {
  scene: scene({ background: "#b4c8d8", camera: { mode: "perspective", position: [0, 80, 125], target: [0, 2, 0], fov: 45, near: 20, far: 450 } })
    .add(lights.hemisphere({ skyColor: "#cfe0f2", groundColor: "#5d6b45", intensity: 1.1 }))
    .add(lights.directional({ position: [90, 130, 60], target: [0, 0, 0], intensity: 3, shadow: true }))
    .add(effects.fog({ color: "#b4c8d8", density: 0.0055 }))
    .add(primitives.plane({ name: "ground", size: [260, 1, 260], material: material.pbr({ color: "#5e7a3e", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "canopies", transforms: canopies, colors: canopyColors, material: material.pbr({ color: "#ffffff", roughness: 0.9 }), params: { radialSegments: 8 } }))
});
```

Add rocks as a third `instances.sphere` node. 10,000 instances is fine: three `instances.*` nodes are three draw calls.

## 3. A skinned character with clips and a crossfade

```ts
import { camera, createAuraApp, defineModelAssets, lights, material, primitives, scene } from "@aura3d/engine";

// With a shell, use `aura3d assets add ./soldier.glb --name soldier` (writes src/aura-assets.ts). Without one,
// declare the same shape by hand: url (same origin), sha256 of the file, animations, license.
const assets = defineModelAssets(
  { soldier: { url: "/assets/soldier.glb", sha256: "dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b", animations: ["Idle", "Run", "TPose", "Walk"], license: "fixture" } },
  { queryParam: null }
);

const app = createAuraApp("#app", {
  scene: scene({ background: "#2a2e36" })
    .add(lights.hemisphere({ skyColor: "#cfd8ea", groundColor: "#4a4640", intensity: 0.9 }))
    .add(lights.directional({ position: [3, 6, 4], target: [0, 0.9, 0], intensity: 2.4, shadow: true }))
    .camera(camera.perspective({ position: [0, 1.25, 4.6], target: [0, 0.9, 0], fov: 40 }))
    .add(primitives.plane({ name: "ground", material: material.pbr({ color: "#7b7f86", roughness: 0.9 }), castShadow: false }).scale([12, 1, 12]))
    .add(assets.node("soldier", { name: "soldier-model", targetHeight: 1.8 }).animate({ clip: "Idle", loop: true }).runtime({ id: "soldier" }))
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") app.nodes.require("soldier").play("Run", { loop: true, crossFade: 0.4 });
  if (event.code === "KeyI") app.nodes.require("soldier").play("Idle", { loop: true, crossFade: 0.4 });
});
await app.ready();
```

`.animate({ clip, loop })` sets the starting clip; `app.nodes.require(id).play(clip, { crossFade })` blends to another. Clip names come from the file (`aura3d assets inspect --animation` lists them).

## 4. A deterministic fixed-step game loop with restart

```ts
import { createFixedStepLoop } from "@aura3d/engine";

interface State { x: number; vx: number; score: number; over: boolean }
const state: State = { x: 0, vx: 2, score: 0, over: false };
const STEP = 1 / 60;

const loop = createFixedStepLoop({
  stepSeconds: STEP,
  step: (dt) => { // deterministic: no Date.now, no Math.random here
    if (state.over) return;
    state.x += state.vx * dt;
    if (Math.abs(state.x) > 5) state.over = true;
    else state.score += 1;
  },
  render: () => { /* copy state into scene nodes / DOM here */ }
});
loop.start();

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") { state.x = 0; state.score = 0; state.over = false; loop.resetAccumulator(); } // restart
});
```

For a complete game (HUD, touch, sound, pause, QA hooks, replay), follow [`build-a-game.md`](build-a-game.md) and its sample `docs/agents/samples/coin-dash/`.

## 5. Custom GLSL (animated water on a subdivided grid)

```ts
import { createAuraApp, geometry, material, scene } from "@aura3d/engine";

function grid(n: number, size: number) { // subdivided grid: vertex displacement needs vertices
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let j = 0; j <= n; j += 1) for (let i = 0; i <= n; i += 1) {
    const k = (j * (n + 1) + i) * 3;
    positions[k] = (i / n - 0.5) * size; positions[k + 2] = (j / n - 0.5) * size; normals[k + 1] = 1;
    if (i < n && j < n) { const a = j * (n + 1) + i; indices.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2); }
  }
  return geometry.define({ positions, normals, indices, bounds: { min: [-size / 2, -2, -size / 2], max: [size / 2, 2, size / 2] } });
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
void main() {
  vec3 p = position; // prelude names: position, modelViewProjectionMatrix, eyePos, outColor
  p.y += 0.25 * sin(p.x * 0.8 + waveClock) + 0.15 * sin(p.z * 1.3 - waveClock * 1.4);
  vPos = p;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
out vec4 outColor;
void main() {
  float h = vPos.y * 1.6 + 0.5;
  outColor = vec4(mix(vec3(0.02, 0.22, 0.42), vec3(0.45, 0.78, 0.9), clamp(h, 0.0, 1.0)), 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } } // declare uniforms here; they are auto-declared in GLSL
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#a9c8e6", camera: { mode: "perspective", position: [0, 4, 10], target: [0, 0, 0], fov: 50 } })
    .add(geometry.custom(grid(160, 30), { name: "water", material: water }))
});
const start = performance.now();
app.onFrame(() => app.nodes.get("water")?.setUniform?.("waveClock", (performance.now() - start) / 1000));
await app.ready();
```

`material.custom` auto-declares the uniforms you list. Prelude names available in both stages: `position`, `modelViewProjectionMatrix`, `eyePos`, and `outColor` in the fragment stage (GLSL 3 `in`/`out`). If the shader fails to compile the engine logs `CUSTOM_SHADER_COMPILE_FAILED` with the GLSL log (see [`troubleshooting.md`](troubleshooting.md)).

## Where next

[`agent-quickstart.md`](agent-quickstart.md) (assets, verification, habit table), [`api-surface.md`](api-surface.md) (names by task), [`build-a-game.md`](build-a-game.md), [`art-direction.md`](art-direction.md), [`claims-and-boundaries.md`](claims-and-boundaries.md).
