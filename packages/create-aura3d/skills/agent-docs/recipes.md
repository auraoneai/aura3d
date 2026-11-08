# Recipes: copy a working scene, then adapt it

Coming from three.js? Read [`threejs-to-aura3d.md`](threejs-to-aura3d.md) first; signatures are in [`api-signatures.md`](api-signatures.md). Recipes 8 to 15 build complete scenes with no admitted models; recipe 16 covers physics. Start here when the task looks like one of these. Each recipe is a complete `src/main.ts` body that compiled against the engine types (`tsc`, strict) and uses only non-deprecated root exports. Copy it, change names and numbers, run `npm run build`. Do not read `node_modules/@aura3d/engine/dist` to discover the API first: that is the slowest path (in the cold-start trial, 8 of 15 runs spent all 40 turns reading `.d.ts` and `dist` files without writing a scene, while the game-loop runs, which had a complete sample to copy, finished in 11 to 17 turns).

Page needs a `<div id="app">` (or a `<canvas id="app">`); `createAuraApp("#app", { scene })` mounts into it. Background, camera, lights and fog are ordinary nodes or scene options. Animate inside `app.onFrame((frame) => ...)` using `frame.dt`. Await `app.ready()` when you need the first frame. With a HUD or other elements beside the canvas, give the canvas a wrapper of definite size (`<div id="stage" style="width:640px;height:360px"><canvas id="app"></canvas></div>`), or pass `resize: false` and a `width`/`height` on the canvas; the app sizes itself to its parent, and an auto-height parent that also holds a HUD can make a canvas grow until it draws nothing on 4.1.3 and earlier (see troubleshooting, black frame checklist).

Rules that every recipe follows:

- Orbit control: `interactions.orbit({ target: "<node name>" })`. It takes a node name, nothing else.
- Frame the subject with `.camera(camera.auto())` on the scene (5.4: solved from the scene's nodes, ground and wall left out; `camera.auto({ subject: "name", fill: 0.6 })` for one named node or group), or `camera.frame(subject, { fill: 0.6 })` when you hold the node; never a hand-placed `camera.perspective`. A moving subject: `app.camera?.setPose(camera.framePose(box, { azimuth, fill, aspect }))` each frame.
- Key light: `lights.key({ target })` (5.4) is a directional light that casts a clean shadow by default; put a `primitives.plane` ground under the subject to receive it (primitives and models receive shadows by default).
- Metals need something to reflect: add `environments.neutral(...)` (or a look preset) or a metallic material renders dark.
- Instancing: `instances.cone/cylinder/sphere/box({ transforms, colors })` draws one draw call per shape; shapes are unit-sized, so `scale` sets the size.
- A deformed surface needs vertices: build a grid with `geometry.define` and mount it with `geometry.custom(...)`.
- Anything you move, rotate, or play at runtime needs `.runtime({ id, mutable: true })` on its node; `app.nodes.require(id)` throws without it. (If a callback in `onFrame` throws, 4.2.0 and later log `onFrame callback threw: ...` once and keep rendering; 4.1.3 and earlier stop drawing and leave a blank page.)
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
await app.ready(); // renderer mounted; programs may still be compiling, so the first frames can miss draws (games: await warmPrograms(app) from @aura3d/engine/game)
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
  vec3 p = position; // prelude names: position, normal, uv, modelViewProjectionMatrix, modelMatrix, cameraPosition, uTime (static scenes do not advance uTime; see below)
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
    .add(geometry.custom(grid(160, 30), { name: "water", material: water }).runtime({ id: "water", mutable: true }))
});
const start = performance.now();
app.onFrame(() => app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000)); // needs .runtime({ id, mutable: true })
await app.ready();
```

`material.custom` auto-declares the uniforms you list. Prelude names: `position`, `normal` and `uv` (vertex attributes), `modelViewProjectionMatrix`, `modelMatrix`, `cameraPosition` (a uniform in both stages) and `uTime`. `uTime` is wall-clock seconds, but the engine redraws every frame only when the scene declares motion (a `.runtime({ id, mutable: true })` node, an `app.onFrame` callback, an animated model, particles or rain, an auto-rotating orbit camera, a looping timeline). A static scene whose only motion is `uTime` renders one frame and the shader looks frozen (measured on a real GPU). This recipe uses its own `waveClock` uniform written in `onFrame`, which also keeps the loop running; `uTime` works too when the node is `.runtime({ id, mutable: true })`. The fragment stage writes `outColor` (GLSL 3 `in`/`out`). There is no `eyePos`: it fails to compile with `undeclared identifier`. If the shader fails to compile the engine logs `CUSTOM_SHADER_COMPILE_FAILED` with the GLSL log (see [`troubleshooting.md`](troubleshooting.md)).

## 6. A ball dribbled by hand (hand and floor contact, handoffs, proof)

```ts
import { createHandBounce, measureHandBall } from "@aura3d/engine/game";

const bounce = createHandBounce({ hand: "right", ballRadius: 0.13, floorY: 0 });
const samples: Array<{ phase: number; moving: boolean; palm: [number, number, number]; ball: [number, number, number] }> = [];

// fixed sim step, once per frame while the handler holds the ball
function stepDribble(dt: number, holder: { x: number; z: number; vx: number; vz: number }, shoulderY: number, palm: [number, number, number]) {
  const frame = bounce.step(dt, { speed: Math.hypot(holder.vx, holder.vz), shoulderY, palm, holder });
  samples.push({ phase: frame.phase, moving: frame.moving, palm, ball: frame.ball });
  return frame.ball; // put the ball node here; frame.floorContact is the moment to play the bounce cue
}

// pass or shot: start the flight from the hand with the ball's own velocity, so it leaves without a pop
const { position, velocity } = bounce.release();

// prove it after a few seconds of dribble (human and AI handlers, standing and running)
const report = measureHandBall(samples);
if (!report.ok) throw new Error(report.failures.join("; "));
```

Palm and ball ride together, the ball bounces directly under the palm (a runner's ball lands ahead along travel by at most 0.10 m), hits the floor with its centre at the ball radius, and the palm follows it down and receives it every bounce. Always pass the palm as drawn, whatever pose the athlete is in. `bounce.overlay()` gives the upper-body bend (never the legs). See [motion-hand-bounce](../api/motion-hand-bounce.md).

## 7. A bat, club or racket held in both hands (grip, hand-off, proof)

```ts
import { calibrateGripSocket, createTwoHandGrip, measureGrip, twoHandGripBonesForEngine, gripQToEulerZYX } from "@aura3d/engine/game";

const rig = { ...body, ...calibrateGripSocket(body, stance), gripSpread: 0.09, objectLength: 1.02, sweetSpot: 0.73 };
const grip = createTwoHandGrip(rig);
const samples: Array<{ phase: string; knob: [number, number, number]; axis: [number, number, number]; bottomPalm: [number, number, number]; topPalm: [number, number, number] }> = [];

// fixed sim step, once per frame while the object is held
function stepSwing(target: { K: [number, number, number]; D: [number, number, number]; phi: number; hip: [number, number, number]; pole: [number, number, number] }, phase: string) {
  const pose = grip.step(target);
  actor.setAnimationPose({ bones: twoHandGripBonesForEngine(pose.bones), mode: "overlay" });
  object.setPosition(...pose.palm).setRotation(...gripQToEulerZYX(pose.objectRot)); // route nodes use ZYX
  samples.push({ phase, knob: pose.palm, axis: pose.objectDir, bottomPalm: pose.palm, topPalm: pose.palmL });
}

const report = measureGrip(samples);
if (!report.ok) throw new Error(report.failures.join("; "));
```

Both drawn palms stay on the handle in every phase (stance, load, swing, follow-through); `grip.step(target, release)` lets the top hand go for a one-handed finish. See [motion-two-hand-grip](../api/motion-two-hand-grip.md).

## Procedural scenes with no admitted models (recipes 8 to 15)

Use these when the prompt names a world, a creature, a prop set or an effect and no GLB has been admitted. Every recipe is a complete `main.ts` in [`recipes-src/`](recipes-src/), typechecked with `tsc` against the engine and captured on a real GPU (Chrome 156, Apple M4 Max through ANGLE/Metal, `capture_browser_scenario` at 1280x720) with zero console events; the capture is `recipes-src/<name>/frame.png`. One capture on one GPU proves the recipe draws a readable frame, not parity or a quality score. The sources below are copies: `recipes-src/<name>/main.ts` is the checked version.

Build and view any of them from the monorepo: `pnpm exec vite build --config docs/agents/recipes-src/vite.config.ts` then `pnpm exec vite preview --config docs/agents/recipes-src/vite.config.ts` and open `/<name>/index.html`. In a scaffolded project put `main.ts` in `src/` (the imports are the same).

### 8. A jointed robot from primitives with an idle animation

- Goal: A character with no GLB: capsules, spheres and boxes nested in `group` joints (hips, chest, head, shoulders, elbows, hips, knees) whose handles are driven from `onFrame`.
- Final frame: A steel-grey robot with a glowing cyan visor and chest core stands on a dark floor, three-quarter view; chest, head and arms sway slowly.
- Replaces in three.js: `Bone` hierarchy + `SkinnedMesh` + an idle `AnimationMixer` clip.
- Look and light values: `environments.neutral` 0.7, warm key `directional` 2.2 with shadow, blue rim `directional` 2.2, floor `#15171d`.
- Capture: `recipes-src/procedural-humanoid/frame.png`; source: `recipes-src/procedural-humanoid/main.ts`.

```ts
import { camera, createAuraApp, environments, group, interactions, lights, material, primitives, scene } from "@aura3d/engine";

// A robot from primitives with a real joint hierarchy: every joint is a `group` whose origin is the pivot, so rotating
// the shoulder swings the whole arm and rotating the elbow swings only the forearm. The idle animation drives the joints
// from onFrame. No GLB and no asset admission.
const steel = material.pbr({ color: "#b9c1ce", metallic: 0.55, roughness: 0.38 });
const dark = material.pbr({ color: "#2a2e39", metallic: 0.6, roughness: 0.5 });
const glow = material.emissive({ color: "#8fefff", emissive: "#46dcff", emissiveIntensity: 2.4 });

// A limb segment hangs down from its joint: capsule centred half its length below the pivot.
const segment = (name: string, length: number, radius: number, mat = steel) =>
  primitives.capsule({ name, size: [radius * 2, length, radius * 2], material: mat }).position(0, -length / 2, 0);

const arm = (side: "l" | "r", x: number) =>
  group(`${side}-shoulder`, [
    primitives.sphere({ name: `${side}-shoulder-ball`, size: 0.2, material: dark }),
    segment(`${side}-upper-arm`, 0.34, 0.055),
    group(`${side}-elbow`, [
      primitives.sphere({ name: `${side}-elbow-ball`, size: 0.13, material: dark }),
      segment(`${side}-forearm`, 0.32, 0.048),
      primitives.sphere({ name: `${side}-hand`, size: 0.12, material: dark }).position(0, -0.37, 0)
    ], { position: [0, -0.36, 0] }).runtime({ id: `${side}-elbow`, mutable: true })
  ], { position: [x, 0.5, 0] }).runtime({ id: `${side}-shoulder`, mutable: true });

const leg = (side: "l" | "r", x: number) =>
  group(`${side}-hip`, [
    segment(`${side}-thigh`, 0.46, 0.07),
    group(`${side}-knee`, [
      primitives.sphere({ name: `${side}-knee-ball`, size: 0.15, material: dark }),
      segment(`${side}-shin`, 0.44, 0.06),
      primitives.box({ name: `${side}-foot`, size: [0.14, 0.07, 0.26], material: dark }).position(0, -0.48, 0.05)
    ], { position: [0, -0.47, 0] }).runtime({ id: `${side}-knee`, mutable: true })
  ], { position: [x, -0.03, 0] }).runtime({ id: `${side}-hip`, mutable: true });

const robot = group("robot", [
  group("hips", [
    primitives.box({ name: "pelvis", size: [0.34, 0.16, 0.2], material: dark }),
    leg("l", -0.1),
    leg("r", 0.1),
    group("chest", [
      primitives.box({ name: "torso", size: [0.46, 0.5, 0.25], material: steel }).position(0, 0.3, 0),
      primitives.box({ name: "core", size: [0.12, 0.12, 0.02], material: glow }).position(0, 0.32, 0.13),
      group("head", [
        primitives.cylinder({ name: "neck", size: [0.08, 0.1, 0.08], material: dark }).position(0, 0.04, 0),
        primitives.sphere({ name: "skull", size: 0.26, material: steel }).position(0, 0.2, 0),
        primitives.box({ name: "visor", size: [0.2, 0.05, 0.03], material: glow }).position(0, 0.21, 0.115)
      ], { position: [0, 0.58, 0] }).runtime({ id: "head", mutable: true }),
      arm("l", -0.31),
      arm("r", 0.31)
    ], { position: [0, 0.1, 0] }).runtime({ id: "chest", mutable: true })
  ], { position: [0, 1.0, 0] }).runtime({ id: "hips", mutable: true })
]);

const app = createAuraApp("#app", {
  scene: scene({ background: "#14171d" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.directional({ name: "key", position: [3.5, 5, 3.5], target: [0, 1, 0], intensity: 2.2, color: "#ffe9cf", shadow: true }))
    .add(lights.directional({ name: "rim", position: [-4, 3, -4], target: [0, 1, 0], intensity: 2.2, color: "#7fb4ff" }))
    .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: material.pbr({ color: "#15171d", roughness: 0.9 }) }))
    .add(robot)
    .add(interactions.orbit({ target: "floor" }))
    .camera(camera.orbit({ position: [3, 1.5, 4.2], target: [0, 1.0, 0], fov: 36 }))
});

let t = 0;
app.onFrame((frame) => {
  t += frame.dt;
  const breathe = Math.sin(t * 1.6);
  app.nodes.require("hips").setPosition(0, 1.0 + 0.012 * breathe, 0);                  // weight shift
  app.nodes.require("chest").setRotation(0.03 * breathe, 0.1 * Math.sin(t * 0.7), 0);
  app.nodes.require("head").setRotation(-0.04 * breathe, 0.35 * Math.sin(t * 0.5), 0);
  app.nodes.require("l-shoulder").setRotation(0.05 * breathe, 0, 0.1 + 0.03 * breathe);
  app.nodes.require("r-shoulder").setRotation(-0.05 * breathe, 0, -0.1 - 0.03 * breathe);
  app.nodes.require("l-elbow").setRotation(-0.25 - 0.05 * breathe, 0, 0);
  app.nodes.require("r-elbow").setRotation(-0.25 - 0.05 * breathe, 0, 0);
});
await app.ready();
```

### 9. Heightfield island with vertex colours, water and fog

- Goal: One `geometry.custom` mesh built from a height function, coloured per vertex by height (sand, grass, rock, snow), a glossy translucent water plane, `effects.fog` and `sky.preetham`.
- Final frame: A snow-capped island with sand rim and green slopes in a blue sea under a pale sky, viewed from a corner of the bay.
- Replaces in three.js: `PlaneGeometry` + displaced vertices + `vertexColors` + `MeshStandardMaterial` water + `FogExp2` + `Sky`.
- Look and light values: `sky.preetham` sun 32 deg elevation, `hemisphere` 0.45, sun `directional` 2.4 with shadow, fog density 0.004.
- Capture: `recipes-src/terrain-water-fog/frame.png`; source: `recipes-src/terrain-water-fog/main.ts`.

```ts
import { camera, createAuraApp, effects, geometry, lights, material, primitives, scene, sky } from "@aura3d/engine";

// Heightfield island: one custom mesh with per-vertex colour from height, a glossy water plane, fog and a procedural sky.
const CELLS = 120; // quads per side: vertex colours and normals need vertices
const SIZE = 64;   // metres per side

const height = (x: number, z: number): number => {
  const rim = Math.hypot(x, z) / (SIZE * 0.5);
  const hills = 4.4 * Math.sin(x * 0.13 + 1.3) * Math.cos(z * 0.1) + 1.5 * Math.sin(x * 0.29 + z * 0.21) + 0.45 * Math.sin(x * 0.7) * Math.sin(z * 0.63);
  return hills + 3.2 - rim * rim * 9; // dome falloff: land in the middle, sea floor at the rim
};
const shade = (h: number): [number, number, number, number] =>
  h < 0.45 ? [0.7, 0.6, 0.38, 1] : h < 3.4 ? [0.16, 0.36, 0.12, 1] : h < 5.4 ? [0.34, 0.28, 0.22, 1] : [0.9, 0.92, 0.95, 1]; // sand, grass, rock, snow

const positions = new Float32Array((CELLS + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const colors = new Float32Array((CELLS + 1) ** 2 * 4);
const indices: number[] = [];
for (let j = 0; j <= CELLS; j += 1) for (let i = 0; i <= CELLS; i += 1) {
  const v = j * (CELLS + 1) + i;
  const x = (i / CELLS - 0.5) * SIZE;
  const z = (j / CELLS - 0.5) * SIZE;
  const h = height(x, z);
  positions.set([x, h, z], v * 3);
  const e = 0.2; // central differences give a smooth normal
  const nx = height(x - e, z) - height(x + e, z);
  const nz = height(x, z - e) - height(x, z + e);
  const len = Math.hypot(nx, 2 * e, nz);
  normals.set([nx / len, (2 * e) / len, nz / len], v * 3);
  colors.set(shade(h), v * 4);
  if (i < CELLS && j < CELLS) indices.push(v, v + CELLS + 1, v + 1, v + 1, v + CELLS + 1, v + CELLS + 2);
}

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fc4e8" })
    .add(sky.preetham({ sun: { elevationDeg: 32, azimuthDeg: 130, intensity: 1 } }))
    .add(lights.hemisphere({ skyColor: "#cfe3ff", groundColor: "#4d5a3c", intensity: 0.45 }))
    .add(lights.directional({ name: "sun", position: [30, 26, 22], target: [0, 0, 0], intensity: 2.4, color: "#fff1d6", shadow: true }))
    .add(geometry.custom(
      geometry.define({ positions, normals, colors, indices, bounds: { min: [-SIZE / 2, -8, -SIZE / 2], max: [SIZE / 2, 8, SIZE / 2] } }),
      { name: "terrain", material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }
    ))
    .add(primitives.plane({ name: "water", size: [SIZE * 2, 1, SIZE * 2], material: material.pbr({ color: "#2b79a8", roughness: 0.06, metallic: 0.1, opacity: 0.82 }), castShadow: false }).position(0, 0, 0))
    .add(effects.fog({ color: "#b7d2ea", density: 0.004 }))
    .camera(camera.perspective({ position: [30, 13, 34], target: [0, 1, 0], fov: 45, near: 0.5, far: 400 }))
});
await app.ready();
```

### 10. Stylised props kit with instancing (rocks, pines, houses)

- Goal: Seeded layout of rocks, pines (trunk plus two cones) and houses (box plus four-sided cone roof); five instanced nodes, per-instance colour from a white base material.
- Final frame: A ring of pine forest around a small village of cream houses with red roofs, scattered grey rocks, on a green meadow, high three-quarter view.
- Replaces in three.js: Five `InstancedMesh` nodes with `setMatrixAt` and `setColorAt`.
- Look and light values: `environments.neutral` 0.45, `hemisphere` 0.35, sun `directional` 2.2 with shadow, fog density 0.004.
- Capture: `recipes-src/props-kit-instances/frame.png`; source: `recipes-src/props-kit-instances/main.ts`.

```ts
import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// A stylised village from unit primitives: rocks, pine trees and houses are each ONE instanced draw (colour per instance).
let seed = 20261105; // seeded RNG: the same layout on every load
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();

const rocks: AuraTransformSpec[] = [];
const rockColors: string[] = [];
const trunks: AuraTransformSpec[] = [];
const pines: AuraTransformSpec[] = [];
const pineColors: string[] = [];
const walls: AuraTransformSpec[] = [];
const roofs: AuraTransformSpec[] = [];
const wallColors: string[] = [];
const roofColors: string[] = [];

for (let i = 0; i < 70; i += 1) { // rocks: squashed spheres, tilted, grey with a little variation
  const a = rand() * Math.PI * 2, r = between(6, 34), s = between(0.3, 1.1);
  rocks.push({ position: [Math.cos(a) * r, s * 0.25, Math.sin(a) * r], rotation: [0, rand() * 6, 0], scale: [s * 1.5, s * 0.9, s * 1.2] });
  rockColors.push(`hsl(30, 6%, ${38 + Math.floor(rand() * 22)}%)`);
}
for (let i = 0; i < 110; i += 1) { // pines on a ring around the village, two cones per tree for a layered crown
  const a = rand() * Math.PI * 2, r = between(15, 40), s = between(0.7, 1.3);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  trunks.push({ position: [x, 0.6 * s, z], scale: [0.3 * s, 1.2 * s, 0.3 * s] });
  pines.push({ position: [x, 2.1 * s, z], scale: [2 * s, 3 * s, 2 * s] }, { position: [x, 3.4 * s, z], scale: [1.4 * s, 2.4 * s, 1.4 * s] });
  const crown = `hsl(${135 + Math.floor(rand() * 25)}, 45%, ${20 + Math.floor(rand() * 12)}%)`;
  pineColors.push(crown, crown);
}
for (let gx = -2; gx <= 2; gx += 1) for (let gz = -2; gz <= 2; gz += 1) { // 5x5 plots, some left empty
  if (Math.abs(gx) + Math.abs(gz) > 3 || rand() < 0.25) continue;
  const w = between(2.2, 3.2), h = between(1.8, 3), d = between(2.2, 3.4);
  const x = gx * 5 + between(-0.6, 0.6), z = gz * 5 + between(-0.6, 0.6), yaw = between(-0.25, 0.25);
  walls.push({ position: [x, h / 2, z], rotation: [0, yaw, 0], scale: [w, h, d] });
  roofs.push({ position: [x, h + 0.75, z], rotation: [0, yaw + Math.PI / 4, 0], scale: [Math.max(w, d) * 1.05, 1.5, Math.max(w, d) * 1.05] });
  wallColors.push(`hsl(${30 + Math.floor(rand() * 20)}, 35%, ${68 + Math.floor(rand() * 14)}%)`);
  roofColors.push(`hsl(${5 + Math.floor(rand() * 15)}, 55%, ${34 + Math.floor(rand() * 10)}%)`);
}

const white = material.pbr({ color: "#ffffff", roughness: 0.9 }); // instance colours multiply this base colour once
const app = createAuraApp("#app", {
  scene: scene({ background: "#b9d3e6" })
    .add(environments.neutral({ intensity: 0.45, background: false }))
    .add(lights.hemisphere({ skyColor: "#dbe9ff", groundColor: "#5b5a3a", intensity: 0.35 }))
    .add(lights.directional({ name: "sun", position: [28, 40, 18], target: [0, 0, 0], intensity: 2.2, color: "#fff0d8", shadow: true }))
    .add(effects.fog({ color: "#b9d3e6", density: 0.004 }))
    .add(primitives.plane({ name: "ground", size: [120, 1, 120], material: material.pbr({ color: "#6f8f4c", roughness: 1 }) }))
    .add(instances.sphere({ name: "rocks", transforms: rocks, colors: rockColors, material: white }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "pines", transforms: pines, colors: pineColors, material: white, params: { radialSegments: 8 } }))
    .add(instances.box({ name: "walls", transforms: walls, colors: wallColors, material: white }))
    .add(instances.cone({ name: "roofs", transforms: roofs, colors: roofColors, material: white, params: { radialSegments: 4 } }))
    .camera(camera.perspective({ position: [26, 21, 30], target: [0, 1.5, 0], fov: 42, near: 1, far: 300 }))
});
await app.ready();
```

### 11. PBR product viewer on a procedural pedestal

- Goal: A clear-coated gold torus knot on a cylinder plinth and round stage, three-point light, neutral environment, slow turntable and orbit control.
- Final frame: A gold knot sculpture on a white plinth against a light grey backdrop, soft contact with the stage, metal reflections visible.
- Replaces in three.js: `TorusKnotGeometry` + `MeshPhysicalMaterial` + `PMREMGenerator` environment + `OrbitControls`.
- Look and light values: `environments.neutral` 1.15, key 2.8, fill 1.0, rim 1.6; knot `metallic: 1, roughness: 0.22, clearcoat: 0.8`.
- Capture: `recipes-src/pbr-product-viewer/frame.png`; source: `recipes-src/pbr-product-viewer/main.ts`.

```ts
import { camera, createAuraApp, environments, interactions, lights, material, primitives, scene } from "@aura3d/engine";

// A product on a procedural pedestal: torus knot (clear-coated metal), cylinder plinth, round stage, neutral environment.
// Metals reflect the environment, so environments.neutral is what makes this read as metal instead of grey plastic.
const app = createAuraApp("#app", {
  scene: scene({ background: "#d9dde3" })
    .add(environments.neutral({ intensity: 1.15, background: false }))
    .add(lights.directional({ name: "key", position: [4, 6.5, 4.5], target: [0, 1, 0], intensity: 2.8, color: "#fff4e6", shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 3, 2], target: [0, 1, 0], intensity: 1, color: "#cfdcff" }))
    .add(lights.directional({ name: "rim", position: [0, 4, -6], target: [0, 1, 0], intensity: 1.6, color: "#ffffff" }))
    .add(primitives.cylinder({ name: "stage", size: [9, 0.2, 9], material: material.pbr({ color: "#eceff3", roughness: 0.55 }), castShadow: false }).position(0, -0.1, 0))
    .add(primitives.cylinder({ name: "plinth", size: [2.2, 0.9, 2.2], material: material.pbr({ color: "#f7f8fa", roughness: 0.35 }) }).position(0, 0.45, 0))
    .add(primitives.cylinder({ name: "plinth-ring", size: [2.32, 0.06, 2.32], material: material.pbr({ color: "#2a2d33", metallic: 0.9, roughness: 0.3 }) }).position(0, 0.93, 0))
    .add(primitives.torusKnot({
      name: "product",
      size: 0.72,
      params: { tubularSegments: 220, radialSegments: 32, tubeRadius: 0.2, p: 2, q: 3 },
      material: material.physical({ color: "#c9a46a", metallic: 1, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.08 })
    }).position(0, 1.8, 0).runtime({ id: "product", mutable: true }))
    .add(interactions.orbit({ target: "product" }))
    .camera(camera.orbit({ position: [4.6, 3.1, 6], target: [0, 1.5, 0], fov: 34 }))
});
let angle = 0;
app.onFrame((frame) => {
  angle += frame.dt * 0.5;
  app.nodes.require("product").setRotation(0, angle, 0); // slow turntable
});
await app.ready();
```

### 12. Water with a custom GLSL material (waves, fresnel, sun glint)

- Goal: A subdivided grid displaced in the vertex shader, an analytic normal, a fresnel mix between deep colour and sky, and a sun glint; time comes from a uniform written in `onFrame`.
- Final frame: Rolling teal and turquoise swell with pale crests receding to a light sky; a dark islet on the horizon. Frames differ over time.
- Replaces in three.js: `ShaderMaterial` with `uniforms.time` on a `PlaneGeometry(…, 200, 200)`.
- Look and light values: Background `#9ec3e6`, one `directional` 2.5 (only the islet is lit by it; the water shader computes its own colour), fog 0.008.
- Capture: `recipes-src/water-custom-shader/frame.png`; source: `recipes-src/water-custom-shader/main.ts`.

```ts
import { camera, createAuraApp, effects, geometry, lights, material, primitives, scene } from "@aura3d/engine";

// Water with a custom GLSL material: vertex waves, analytic normal, fresnel mix between deep colour and sky, sun glint.
// Uniforms listed in `uniforms` are auto-declared in GLSL. Prelude names: position/normal/uv (vertex attributes), modelViewProjectionMatrix, modelMatrix, cameraPosition, uTime (uTime advances only while the scene redraws every frame; this recipe drives its own `waveClock` from onFrame).
const N = 200, SIZE = 80;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) for (let i = 0; i <= N; i += 1) {
  const v = j * (N + 1) + i;
  positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
  normals[v * 3 + 1] = 1;
  if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
}

const water = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vPos;
out vec3 vNormal;
vec3 wave(vec2 p, float t, out vec2 slope) {
  float a = sin(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.35;
  float b = sin(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.22;
  float c = sin(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.08;
  slope = vec2(cos(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.35 * 0.63 + cos(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.22 * -0.51 + cos(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.08 * 1.2,
              cos(dot(p, vec2(0.21, 0.13)) * 3.0 + t * 1.1) * 0.35 * 0.39 + cos(dot(p, vec2(-0.17, 0.25)) * 3.0 + t * 1.4) * 0.22 * 0.75 + cos(dot(p, vec2(0.4, 0.31)) * 3.0 + t * 2.1) * 0.08 * 0.93);
  return vec3(p.x, a + b + c, p.y);
}
void main() {
  vec2 slope;
  vec3 p = wave(position.xz, waveClock, slope);
  vPos = p;
  vNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vPos;
in vec3 vNormal;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vPos); // cameraPosition is a prelude uniform in both stages
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
  vec3 deep = vec3(0.02, 0.18, 0.30);
  vec3 shallow = vec3(0.10, 0.45, 0.55);
  vec3 sky = vec3(0.62, 0.78, 0.92);
  vec3 body = mix(deep, shallow, clamp(vPos.y * 1.4 + 0.5, 0.0, 1.0));
  vec3 sunDir = normalize(vec3(0.5, 0.45, 0.35));
  float glint = pow(max(dot(reflect(-sunDir, n), v), 0.0), 140.0);
  outColor = vec4(mix(body, sky, clamp(fresnel * 0.9 + 0.08, 0.0, 1.0)) + vec3(1.0, 0.93, 0.78) * glint * 1.4, 1.0);
}`
  },
  uniforms: { waveClock: { type: "f32", value: 0 } }
});

const app = createAuraApp("#app", {
  scene: scene({ background: "#9ec3e6" })
    .add(lights.directional({ position: [5, 4.5, 3.5], target: [0, 0, 0], intensity: 2.5 }))
    .add(geometry.custom(geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -1, -SIZE / 2], max: [SIZE / 2, 1, SIZE / 2] } }), { name: "water", material: water, castShadow: false }).runtime({ id: "water", mutable: true }))
    .add(primitives.sphere({ name: "islet", size: 1, material: material.pbr({ color: "#7a6a52", roughness: 1 }) }).position(9, -0.5, -14).scale([9, 3, 6]))
    .add(effects.fog({ color: "#a9c9e6", density: 0.008 }))
    .camera(camera.perspective({ position: [0, 6, 22], target: [0, 0, 0], fov: 50, near: 0.5, far: 300 }))
});
const start = performance.now();
app.onFrame(() => app.nodes.require("water").setUniform?.("waveClock", (performance.now() - start) / 1000));
await app.ready();
```

### 13. Procedural sky with a day and night cycle and moving shadows

- Goal: `sky.preetham` plus a sun and a moon `directional` light moved on arcs from `onFrame`; `?hour=17.2` freezes the time for captures.
- Final frame: A hut and scattered pines on a meadow in late-afternoon light, long shadows, a bright low sun glow on the left horizon.
- Replaces in three.js: `Sky` addon + `DirectionalLight` moved each frame + `shadow.camera` tuning.
- Look and light values: Sun `directional` 4.2 with shadow, moon `directional` 0.5, `hemisphere` 1.1, fog density 0.006.
- Capture: `recipes-src/sky-day-night/frame.png`; source: `recipes-src/sky-day-night/main.ts`.

```ts
import { camera, createAuraApp, effects, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

// Procedural sky + moving sun and moon, with shadows that swing across a small meadow.
// ?hour=17.5 freezes the clock for a capture; without it a full day takes 90 seconds.
const fixedHour = new URLSearchParams(location.search).get("hour");
const DAY_SECONDS = 90;

let seed = 7;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const trunks: AuraTransformSpec[] = [];
const crowns: AuraTransformSpec[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = rand() * Math.PI * 2, r = 14 + rand() * 24, s = 0.8 + rand() * 0.8;
  trunks.push({ position: [Math.cos(a) * r, 0.9 * s, Math.sin(a) * r], scale: [0.35 * s, 1.8 * s, 0.35 * s] });
  crowns.push({ position: [Math.cos(a) * r, 2.9 * s, Math.sin(a) * r], scale: [2.2 * s, 3 * s, 2.2 * s] });
}

const sunDir = (hour: number): { elevationDeg: number; azimuthDeg: number } => ({
  elevationDeg: Math.sin(((hour - 6) / 24) * Math.PI * 2) * 70, // 6h sunrise, 12h noon, 18h sunset
  azimuthDeg: 90 + ((hour - 6) / 12) * 180
});
const lightAt = (elevationDeg: number, azimuthDeg: number, distance = 40): [number, number, number] => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * distance, Math.sin(e) * distance, -Math.cos(a) * Math.cos(e) * distance];
};

const hour0 = fixedHour === null ? 15 : Number(fixedHour);
const s0 = sunDir(hour0);
const app = createAuraApp("#app", {
  scene: scene({ background: "#7aa7d8" })
    .add(sky.preetham({ sun: { ...s0, intensity: 1 }, stars: { count: 600 } }))
    .add(lights.hemisphere({ skyColor: "#b8d0f0", groundColor: "#35422a", intensity: 1.1 }))
    .add(lights.directional({ name: "sun", position: lightAt(s0.elevationDeg, s0.azimuthDeg), target: [0, 0, 0], intensity: 4.2, color: "#fff0d0", shadow: true }).runtime({ id: "sun", mutable: true }))
    .add(lights.directional({ name: "moon", position: lightAt(-s0.elevationDeg, s0.azimuthDeg + 180), target: [0, 0, 0], intensity: 0.5, color: "#8fb0ff" }).runtime({ id: "moon", mutable: true }))
    .add(primitives.plane({ name: "meadow", size: [90, 1, 90], material: material.pbr({ color: "#5d7f3f", roughness: 1 }) }))
    .add(instances.cylinder({ name: "trunks", transforms: trunks, material: material.pbr({ color: "#5a3d24", roughness: 0.95 }), params: { radialSegments: 6 } }))
    .add(instances.cone({ name: "crowns", transforms: crowns, material: material.pbr({ color: "#2f6b34", roughness: 0.9 }), params: { radialSegments: 8 } }))
    .add(primitives.box({ name: "hut", material: material.pbr({ color: "#c9b79a", roughness: 0.9 }) }).position(0, 1.1, 0).scale([3.4, 2.2, 3]))
    .add(effects.fog({ color: "#a9c4e0", density: 0.006 }))
    .camera(camera.perspective({ position: [13, 5.5, 15], target: [0, 1.8, 0], fov: 46, near: 0.5, far: 400 }))
});
let clock = 0;
app.onFrame((frame) => {
  clock += frame.dt;
  const hour = fixedHour === null ? (hour0 + (clock / DAY_SECONDS) * 24) % 24 : hour0;
  const s = sunDir(hour);
  app.nodes.require("sun").setPosition(...lightAt(s.elevationDeg, s.azimuthDeg));
  app.nodes.require("moon").setPosition(...lightAt(-s.elevationDeg, s.azimuthDeg + 180));
  if (fixedHour === null) app.atmosphere?.setSky({ sun: { ...s, intensity: 1 } });
});
await app.ready();
```

### 14. Campfire particles with no sprite art (fire, smoke, sparks)

- Goal: Three `effects.particles` emitters using the built-in sprite atlas, a ring of instanced stones, two logs and a warm `point` light.
- Final frame: Orange flame blobs rising from two logs inside a stone ring, grey smoke above, a warm pool of light on a dark ground.
- Replaces in three.js: `Points` + `PointsMaterial` with a canvas texture, or a particle library.
- Look and light values: `point` 26 `#ff9a3c` distance 14, moon `directional` 0.7, neutral environment 0.12; flames `blend: "additive"`, smoke `blend: "alpha"`.
- Capture: `recipes-src/fire-smoke-sparks/frame.png`; source: `recipes-src/fire-smoke-sparks/main.ts`.

```ts
import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// A campfire with no sprite art: three effects.particles emitters (flames, smoke, sparks) that use the engine's
// built-in sprite atlas ("flame-loop", "smoke-a", "spark-streak"), logs and stones from primitives, a warm point light.
const stones: AuraTransformSpec[] = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return { position: [Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05], rotation: [0, a, 0], scale: [0.42, 0.26, 0.34] };
});
const wood = material.pbr({ color: "#4a3020", roughness: 0.95 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#07090f" })
    .add(environments.neutral({ intensity: 0.12, background: false }))
    .add(lights.directional({ name: "moon", position: [-8, 10, -6], target: [0, 0, 0], intensity: 0.7, color: "#6f8fe0", shadow: true }))
    .add(lights.point({ name: "firelight", position: [0, 1.0, 0], intensity: 26, color: "#ff9a3c", distance: 14, decay: 2, shadow: false }))
    .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#2a2f24", roughness: 1 }) }))
    .add(instances.sphere({ name: "stones", transforms: stones, material: material.pbr({ color: "#6b6b70", roughness: 0.95 }) }))
    .add(primitives.cylinder({ name: "log-a", size: [0.24, 1.6, 0.24], material: wood }).position(0, 0.2, 0).rotate(0, 0.6, Math.PI / 2 - 0.12))
    .add(primitives.cylinder({ name: "log-b", size: [0.24, 1.6, 0.24], material: wood }).position(0, 0.2, 0).rotate(0, -0.7, Math.PI / 2 + 0.12))
    .add(effects.particles({ // scene-node emitters read name, position, rate, maxParticles, lifetime, speed, size, gravity, drag, seed, color, blend and sprite
      name: "flames", position: [0, 0.25, 0], rate: 70, maxParticles: 220, lifetime: [0.6, 1.1],
      speed: [0.9, 1.7], size: [0.22, 0.5], gravity: 0, drag: 0.3, blend: "additive", seed: 11, color: "#ff8a2a"
    }))
    .add(effects.particles({
      name: "smoke", position: [0, 1.3, 0], rate: 14, maxParticles: 90, lifetime: [2.4, 3.8],
      speed: [0.5, 0.9], size: [0.4, 1.3], gravity: 0, drag: 0.15, blend: "alpha", seed: 12, color: "#55545a"
    }))
    .add(effects.particles({
      name: "sparks", position: [0, 0.6, 0], rate: 20, maxParticles: 80, lifetime: [0.8, 1.7],
      speed: [2, 4.5], size: [0.05, 0.1], gravity: 3, sprite: "spark-streak", blend: "additive", seed: 13, color: "#ffb347"
    }))
    .camera(camera.perspective({ position: [3.6, 1.9, 4.6], target: [0, 1.1, 0], fov: 44, near: 0.1, far: 80 }))
});
await app.ready();
```

### 15. Night street with point lights, emissive windows and bloom

- Goal: Instanced towers and emissive window quads (two nodes: warm and cool), six lantern posts each with a real `point` light, a moon, dark fog, `effects.bloom`.
- Final frame: A dark street between two rows of towers with warm and blue lit windows, glowing lanterns with halos, orange pools on the wet road.
- Replaces in three.js: `EffectComposer` + `UnrealBloomPass` + `PointLight`s + emissive `MeshStandardMaterial`.
- Look and light values: Moon `directional` 1.1, neutral environment 0.25, lamps `point` 14 `#ffb866`, fog density 0.028, `bloom` intensity 1 threshold 0.6 radius 0.6.
- Capture: `recipes-src/night-lights-emissive-bloom/frame.png`; source: `recipes-src/night-lights-emissive-bloom/main.ts`.

```ts
import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

// A night street: lantern posts with real point lights, glowing windows, a moon, fog and bloom.
// Emissive materials only look like light sources when bloom and fog give them a halo and depth.
const lampSpots: Array<[number, number]> = [[-4, 6], [-4, -2], [-4, -10], [4, 2], [4, -6], [4, -14]];
const warmWindows: AuraTransformSpec[] = [];
const coolWindows: AuraTransformSpec[] = [];
const towers: AuraTransformSpec[] = [];
let seed = 99;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

for (const side of [-1, 1]) for (let i = 0; i < 6; i += 1) {
  const x = side * 9.5, z = 8 - i * 6.5, h = 6 + rand() * 7;
  towers.push({ position: [x, h / 2, z], scale: [4.6, h, 5] });
  for (let row = 0; row < Math.floor(h / 1.6); row += 1) for (let col = 0; col < 2; col += 1) {
    if (rand() < 0.35) continue; // dark windows
    (rand() < 0.7 ? warmWindows : coolWindows).push({ position: [x - side * 2.33, 1.2 + row * 1.5, z - 1.1 + col * 2.2], scale: [0.04, 0.7, 0.9] });
  }
}

const stage = scene({ background: "#05070d" })
  .add(environments.neutral({ intensity: 0.25, background: false }))
  .add(lights.directional({ name: "moonlight", position: [-10, 16, -10], target: [0, 0, -4], intensity: 1.1, color: "#7d9bff", shadow: true }))
  .add(primitives.plane({ name: "street", size: [24, 1, 60], material: material.pbr({ color: "#1b1e26", roughness: 0.35, metallic: 0.2 }) }).position(0, 0, -6))
  .add(instances.box({ name: "towers", transforms: towers, material: material.pbr({ color: "#262b36", roughness: 0.9 }) }))
  .add(instances.box({ name: "windows-warm", transforms: warmWindows, material: material.emissive({ color: "#ffcf7a", emissive: "#ffb84d", emissiveIntensity: 1.6 }) })) // emissive colour comes from the material, not from instance colours
  .add(instances.box({ name: "windows-cool", transforms: coolWindows, material: material.emissive({ color: "#9fd2ff", emissive: "#6fb8ff", emissiveIntensity: 1.6 }) }))
  .add(primitives.sphere({ name: "moon", size: 3, material: material.emissive({ color: "#dfe8ff", emissive: "#dfe8ff", emissiveIntensity: 2.5 }) }).position(-16, 26, -42))
  .add(effects.fog({ color: "#0a1020", density: 0.028 }))
  .add(effects.bloom({ intensity: 1, threshold: 0.6, radius: 0.6 }))
  .camera(camera.perspective({ position: [0, 3.2, 14], target: [0, 3.6, -12], fov: 46, near: 0.2, far: 160 }));

for (const [i, [x, z]] of lampSpots.entries()) {
  stage.add(primitives.cylinder({ name: `post-${i}`, size: [0.12, 3.4, 0.12], material: material.pbr({ color: "#15171c", metallic: 0.6, roughness: 0.5 }) }).position(x, 1.7, z));
  stage.add(primitives.sphere({ name: `lantern-${i}`, size: 0.42, material: material.emissive({ color: "#ffd9a0", emissive: "#ffb85c", emissiveIntensity: 4 }) }).position(x, 3.5, z));
  stage.add(lights.point({ name: `lamp-${i}`, position: [x, 3.4, z], intensity: 14, color: "#ffb866", distance: 12, decay: 2, shadow: false }));
}

const app = createAuraApp("#app", { scene: stage });
await app.ready();
```

## 16. Physics: bodies, a stacked wall, a swinging rope, collision events, fixed step

- Goal: `.physics({...})` bodies on nodes (static ground, a 5 x 4 crate wall), a ball on a `ball-socket` rope from a gantry pivot that swings into the wall, `app.physics.onCollision`, and a fixed 1/60 step so the result depends on the step count only. `?steps=140` freezes the simulation after 140 steps for captures.
- Install first: `npm install @dimforge/rapier3d-compat@0.20.0`. Rapier is an optional peer, so it is only in your build if you install it; once installed, every app that imports `@aura3d/engine` downloads and initialises it at startup, even one that never calls physics (a 2.85 MB chunk, 1.08 MB gzip, measured; the `aura3d-no-tla` condition does not avoid it). Build with `aura3d()` from `@aura3d/assets/vite` and Vite leaves Rapier out of any app whose code never mentions physics; `aura3d({ physics: "lazy" })` keeps it but downloads it on first use, in which case add `await app.physics.ready?.()` before the imperative `app.physics.createBody` / `createJoint` calls below (`docs/concepts/physics.md`). Without it the app does not crash silently: `diagnostics().errors` and the canvas show `PHYSICS_BACKEND_MISSING` with this install command, `app.physics` throws the same typed error, and `aura3d doctor` flags the project.
- Final frame: the ball has hit the wall at the base of a dark gantry and the crates are tumbling into a heap on green ground.
- Replaces in three.js: a Rapier/cannon setup plus a manual body-to-mesh sync loop (here `physics: { bindNodes: true }` plus `.runtime({ id })` on each node does the sync).
- Values: gravity `[0, -9.81, 0]`, step 1/60 with at most 5 catch-up steps, ball mass 6 radius 0.55, crates mass 1, friction 0.7.
- Capture: `recipes-src/physics-basics/frame.png`; source: `recipes-src/physics-basics/main.ts`.

```ts
import { camera, createAuraApp, lights, material, primitives, scene, type AuraNodeBuilder, type AuraPrimitiveNode } from "@aura3d/engine";

// Rigid bodies on scene nodes: a static ground, a stacked wall of crates, a ball on a ball-socket rope that swings
// into the wall (the wrecking ball), collision events, and a deterministic fixed step. Needs the Rapier backend
// (`npm install @dimforge/rapier3d-compat@0.20.0`); without it the app reports PHYSICS_BACKEND_MISSING in
// diagnostics().errors and on the canvas. ?steps=N freezes the simulation after N fixed steps for a capture.
const STEP = 1 / 60; // fixed step: the result depends on the step count, never on the display rate
const MAX_CATCH_UP = 5;
const freezeAt = new URLSearchParams(location.search).get("steps");

const CRATE = 0.5;
const COLORS = ["#c98b4b", "#b8763a", "#d9a066", "#a86a32"];
const crates: AuraNodeBuilder<AuraPrimitiveNode>[] = [];
for (let row = 0; row < 5; row += 1) {
  for (let col = 0; col < 4; col += 1) {
    crates.push(
      primitives.box({ name: `crate-${row}-${col}`, size: CRATE, material: material.pbr({ color: COLORS[(row + col) % COLORS.length]!, roughness: 0.8 }) })
        .position(0.2 + (row % 2) * 0.02, CRATE / 2 + row * CRATE, (col - 1.5) * CRATE)
        .runtime({ id: `crate-${row}-${col}` })
        .physics({ type: "dynamic", shape: "box", halfExtents: [CRATE / 2, CRATE / 2, CRATE / 2], mass: 1, friction: 0.7, restitution: 0.05 })
    );
  }
}

const PIVOT: [number, number, number] = [-1.2, 6.2, 0]; // rope anchor; the ball starts 5 m away on the arc and falls into the wall
const BALL_START: [number, number, number] = [-4.2, 2.2, 0];

const app = createAuraApp("#app", {
  physics: { gravity: [0, -9.81, 0], bindNodes: true, seed: 7 },
  scene: scene({ background: "#8fb4d8" })
    .add(lights.hemisphere({ skyColor: "#cfe2f6", groundColor: "#4a5a3a", intensity: 1.2 }))
    .add(lights.directional({ name: "sun", position: [6, 9, 5], target: [0, 0.5, 0], intensity: 4, color: "#fff0d8", shadow: true }))
    .add(
      primitives.box({ name: "ground", size: [30, 0.5, 14], material: material.pbr({ color: "#6f8a50", roughness: 1 }) })
        .position(0, -0.25, 0)
        .runtime({ id: "ground" })
        .physics({ type: "static", shape: "box", halfExtents: [15, 0.25, 7], friction: 0.9 })
    )
    .add(primitives.box({ name: "gantry", size: [8, 0.25, 0.4], material: material.pbr({ color: "#394457", metallic: 0.6, roughness: 0.4 }) }).position(PIVOT[0], PIVOT[1] + 0.125, 0))
    .add(primitives.box({ name: "post-left", size: [0.3, PIVOT[1], 0.4], material: material.pbr({ color: "#394457", metallic: 0.6, roughness: 0.4 }) }).position(PIVOT[0] - 3.85, PIVOT[1] / 2, 0))
    .add(primitives.box({ name: "post-right", size: [0.3, PIVOT[1], 0.4], material: material.pbr({ color: "#394457", metallic: 0.6, roughness: 0.4 }) }).position(PIVOT[0] + 3.85, PIVOT[1] / 2, 0))
    .addMany(crates)
    .add(
      primitives.sphere({ name: "ball", size: 1.1, material: material.pbr({ color: "#d94b3d", metallic: 0.4, roughness: 0.35 }) })
        .position(...BALL_START)
        .runtime({ id: "ball" })
        .physics({ type: "dynamic", shape: "sphere", radius: 0.55, mass: 6, restitution: 0.1, friction: 0.5 })
    )
    .camera(camera.perspective({ position: [4, 3.6, 13], target: [-0.8, 2.7, 0], fov: 46, near: 0.1, far: 200 }))
});

// The anchor is a body-less pivot: a static body with no node, and the rope is a ball-socket joint through the
// world-space anchor point above the ball (anchors are world space, bodies keep their local frames).
app.physics.createBody({ name: "pivot", type: "static", shape: "sphere", radius: 0.05, position: PIVOT, sensor: true });
app.physics.createJoint({ kind: "ball-socket", bodyA: "pivot", bodyB: "ball", anchor: PIVOT });

// Collision events: count solid hits and remember the hardest one. The page object is what the render gate reads.
const stats = { steps: 0, solidHits: 0, hardestHit: 0, firstCrateHitStep: -1 };
app.physics.onCollision((event) => {
  if (event.phase !== "begin" || event.sensor) return;
  stats.solidHits += 1;
  stats.hardestHit = Math.max(stats.hardestHit, event.relativeSpeed);
  const names = [event.nodeA, event.nodeB];
  if (stats.firstCrateHitStep < 0 && names.includes("ball") && names.some((name) => name?.startsWith("crate-"))) stats.firstCrateHitStep = stats.steps;
});

const frozen = freezeAt === null ? undefined : Math.max(0, Math.floor(Number(freezeAt)));
let accumulator = 0;
const stepOnce = (): void => { app.physics.step(STEP); stats.steps += 1; };
if (frozen !== undefined) for (let i = 0; i < frozen; i += 1) stepOnce();
app.onFrame((frame) => {
  if (frozen !== undefined) return;
  accumulator = Math.min(accumulator + frame.dt, STEP * MAX_CATCH_UP);
  while (accumulator >= STEP) { stepOnce(); accumulator -= STEP; }
});

const positions = (): Record<string, readonly number[]> =>
  Object.fromEntries(["ball", "crate-0-0", "crate-4-2"].map((name) => [name, app.physics.bodies.require(name).position().map((value) => Math.round(value * 1e4) / 1e4)]));
(window as unknown as { __PHYSICS_RECIPE__: unknown }).__PHYSICS_RECIPE__ = { stats, positions, diagnostics: () => app.diagnostics().errors };
await app.ready();
```

## Type traps (strict `tsc` errors agents hit on a first draft)

| Error | Cause | Fix |
|---|---|---|
| `TS18048: 'app.camera' is possibly 'undefined'` | `app.camera` is an optional app extension. | Move the camera with `app.camera?.setPose(...)`, or declare it in the scene (`camera.orbit(...)`, `camera.perspective(...)`) and use `interactions.orbit` for user control. |
| `TS2339: Property 'translate' does not exist on type 'AuraNodeBuilder<...>'` | `translate` is on the live runtime handle (`app.nodes.require("name")`), not on the builders (`primitives.box(...)`). | On a builder use `.position(x, y, z)` or `.position([x, y, z])` (the array form needs 4.2.0 or later; on 4.1.3 and earlier pass three numbers). After mounting, move it with the handle's `translate` or `setPosition`. |
| `position([x, y, z])` rejected on 4.1.3 and earlier | `.position`, `.rotate` and `.lookAt` took three numbers there while `.scale` took a number or an array. | Spread the array (`.position(...pos)`), or upgrade to 4.2.0 or later where both forms work. |
| `TS2353: ... 'kind' does not exist in type 'Omit<AuraCustomGeometrySpec, ...>'` | `geometry.define` adds the `kind` itself. | Pass only `{ positions, normals, indices, bounds }` (see recipe 5), then mount the result with `geometry.custom(...)`. |
| `TS2722: Cannot invoke an object which is possibly 'undefined'` on `.setUniform(...)` | `setUniform` exists only on nodes that carry a custom material, so the handle type marks it optional. | `app.nodes.require("water").setUniform?.("waveClock", t)` exactly as in recipe 5 (the node needs `.runtime({ id: "water", mutable: true })`). |
| `TS2322` on `material.custom({ glsl })` | `glsl` is an object (`{ fragment }`, optionally `vertex`), and uniforms are `{ type: "f32", value }` objects, not bare numbers. | Copy the water recipe above. |

## Where next

[`agent-quickstart.md`](agent-quickstart.md) (assets, verification, habit table), [`api-surface.md`](api-surface.md) (names by task), [`build-a-game.md`](build-a-game.md), [`art-direction.md`](art-direction.md), [`claims-and-boundaries.md`](claims-and-boundaries.md).
