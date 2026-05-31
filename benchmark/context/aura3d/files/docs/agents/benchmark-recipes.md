# Benchmark Recipes

Use these recipes only when the benchmark prompt matches the recipe family.
Read `llms.txt` first, copy the smallest matching shape, make only
prompt-required edits, run finite commands such as `npm install` and
`npm run build`, return the build/run commands, and stop. Do not run
`npm run dev`, `npm run preview`, Playwright, browser screenshot capture, or
manual visual verification inside the benchmark agent process.

Shared imports:

```ts
import {
  camera,
  createAuraApp,
  effects,
  interactions,
  lights,
  material,
  model,
  prefabs,
  primitives,
  scene,
  timeline,
  ui
} from "@aura3d/engine";
```

## 01 Physics Playground

```ts
import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div class="hud"><button id="reset" type="button">reset</button><span>contacts: <b id="contacts">24</b></span></div>
`);
ui.onClick("#reset", () => ui.setText("#contacts", "24"));

createAuraApp("#app", {
  scene: scene()
    .background("#070b12")
    .addMany(prefabs.physicsPlayground({ cubes: 50 }))
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.2, target: [0, 0.45, -0.75] }))
});
```

## 02 Particle Fountain

```ts
ui.html("#app", `
  <button id="rate" type="button" style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.78);color:white;font:700 14px system-ui">
    emission rate: high
  </button>
`);
let highRate = true;
ui.onClick("#rate", (button) => {
  highRate = !highRate;
  ui.setText(button, highRate ? "emission rate: high" : "emission rate: low");
});

createAuraApp("#app", {
  scene: scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 2400 }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.orbit({ distance: 4.2, target: [0, 1.0, 0] }))
});
```

## 03 Procedural Solar System

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.solarSystem({ labels: "attached", orbitSegments: 24, starCount: 42 }))
    .add(lights.studio({ intensity: 0.85 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 4.15, 6.45], target: [0, 0.16, 0], fov: 45 }))
    .timeline(timeline.loop({ seconds: 10 }))
});
```

## 04 Neon Tunnel

The prefab already supplies octagonal emissive rings, diagonal braces,
perspective floor rails, glossy reflections, fog, bloom, sparks, and ambient
particles. Keep the dolly camera so the screenshot reads as a tunnel
flythrough, not a flat portal or CSS background.

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 18 }))
    .camera(camera.dolly({ from: [0, 0.45, 2.7], to: [0, 0.45, -2.8], target: [0, 0.45, -2.6], seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
```

## 05 3D Data Visualization

The prefab already supplies 3D bars, top caps, base shadows, floor guides,
axis rails, wall tick marks, label chips, a selected-metric callout, a trend
ribbon, bloom, and hover metadata. Add DOM labels or readouts around the Aura
canvas if needed, but keep one Aura app and do not recreate it per frame.

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 5.4, target: [0, 0.9, 0] }))
});
```

## 06 Mini Golf

```ts
ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.76);color:white;font:700 14px system-ui">
    strokes: <span id="strokes">1</span> | power: medium
  </div>
  <button id="shoot" type="button" style="position:absolute;left:18px;top:58px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(8,47,73,.82);color:white;font:700 14px system-ui">
    aim and shoot
  </button>
`);
let strokes = 1;
ui.onClick("#shoot", () => {
  strokes += 1;
  ui.setText("#strokes", strokes);
});

createAuraApp("#app", {
  scene: scene()
    .background("#7dd3fc")
    .addMany(prefabs.miniGolfHole())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.follow({ targetNode: "white physics golf ball", distance: 4.2, target: [-0.9, 0.08, 0.1], fov: 48 }))
    .timeline(timeline.loop({ seconds: 5 }))
});
```

## 07 Material Lab

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(lights.studio({ intensity: 1.55 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 1.55, 8.35], target: [0, 0.82, -0.72], fov: 42 }))
});
```

## 08 Procedural City Block

```ts
import { camera, createAuraApp, effects, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <button class="toggle" type="button" aria-pressed="true">night mode active; sun/moon markers visible</button>
`);
let isNight = true;
ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  ui.setText(button, isNight ? "night mode active; sun/moon markers visible" : "day mode requested; sun/moon markers visible");
  ui.setPressed(button, isNight);
});

createAuraApp("#app", {
  scene: scene()
    .background("#061018")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: "night" }))
    .add(effects.fog({ density: 0.035 }))
    .add(effects.bloom({ intensity: 0.14 }))
    .add(lights.studio({ intensity: 1.08 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }))
});
```

`prefabs.cityBlock(...)` already includes 20 varied towers, window columns,
storefronts, awnings, roof detail, crosswalks, vehicles, traffic lights, street
lights, and in-frame sun/moon state markers. Keep the camera above or slightly
behind the foreground street so the day/night board and intersection evidence
stay visible.

## 09 Animated Primitive Humanoid

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(prefabs.primitiveHumanoid({ showJoints: true, motionTrail: true }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.perspective({ position: [1.25, 1.48, 3.25], target: [0, 0.86, -0.55], fov: 40 }))
    .timeline(timeline.loop({ seconds: 4 }))
});
```

## 10 Product Viewer Sneaker

```ts
import { camera, createAuraApp, interactions, lights, model, prefabs, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .background("#0b1020")
    .addMany(prefabs.productStage())
    .add(model(assets.sneaker).position(0, 0.54, -0.65).rotate(0, -0.38, 0).animate({ clip: "turntable", speed: 0.42 }))
    .add(lights.studio({ intensity: 1.35 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [1.65, 1.18, 4.0], target: [0, 0.72, -0.65], fov: 38 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
```

Before writing the scene, add the user-approved asset and read the generated
typed module:

```bash
npx @aura3d/cli@latest assets add ./assets/sneaker.glb --name sneaker
sed -n '1,120p' src/aura-assets.ts
```

Then import `assets` from the generated `./aura-assets` module and use
`model(assets.sneaker)`. Do not write `model("sneaker")`, do not use
`unsafeModelUrl(...)`, and do not invent asset URLs. `prefabs.productStage()`
includes plinth, contact shadow, turntable/orbit cues, softboxes, reflection
cards, and fit-to-bounds brackets so the normalized model reads as a deliberate
product viewer instead of a lone GLB.

Use CSS only for small overlays, toggles, labels, and page sizing. Do not use
DOM or canvas as the main 3D rendering path in Aura3D runs.
