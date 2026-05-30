# Benchmark Recipes

Use these recipes only when the benchmark prompt matches the recipe family.
Copy the smallest matching shape, make only prompt-required edits, run
`npm run build`, and stop. Do not build custom engines or keep dev servers
running for visual review.

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
ui.html("#app", `
  <div style="position:absolute;right:18px;top:18px;display:grid;gap:6px;color:white;font:700 13px system-ui">
    <span style="color:#cbd5e1">Mercury</span><span style="color:#fbbf24">Venus</span>
    <span style="color:#38bdf8">Earth</span><span style="color:#f97316">Mars</span>
    <span style="color:#f5d0a9">Jupiter</span><span style="color:#fde68a">Saturn</span>
  </div>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.solarSystem())
    .add(lights.studio())
    .camera(camera.perspective({ position: [0, 3.8, 6.2], target: [0, 0, 0], fov: 46 }))
    .timeline(timeline.loop({ seconds: 10 }))
});
```

## 04 Neon Tunnel

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
createAuraApp("#app", {
  scene: scene()
    .background("#7dd3fc")
    .addMany(prefabs.miniGolfHole())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.perspective({ position: [0, 2.6, 4.2], target: [0, 0, -0.45] }))
});
```

## 07 Material Lab

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#10151f")
    .addMany(prefabs.materialSwatches())
    .add(lights.studio({ intensity: 1.3 }))
    .add(interactions.orbit())
    .camera(camera.perspective({ position: [0, 1.45, 7.8], target: [0, 0.72, -0.72], fov: 42 }))
});
```

## 08 Procedural City Block

```ts
import { camera, createAuraApp, effects, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <button class="toggle" type="button">switch to night</button>
`);
let isNight = false;
ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  ui.setText(button, isNight ? "switch to day" : "switch to night");
  ui.setPressed(button, isNight);
});

createAuraApp("#app", {
  scene: scene()
    .background("#87ceeb")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true }))
    .add(effects.fog({ density: 0.04 }))
    .add(lights.studio({ intensity: 1.08 }))
    .camera(camera.perspective({ position: [0, 3.6, 7.2], target: [0, 0.55, -0.8] }))
});
```

## 09 Animated Primitive Humanoid

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#08111f")
    .addMany(prefabs.primitiveHumanoid())
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.perspective({ position: [1.2, 1.55, 3.4], target: [0, 0.82, -0.55], fov: 42 }))
    .timeline(timeline.loop({ seconds: 4 }))
});
```

## 10 Product Viewer Sneaker

```ts
import { camera, createAuraApp, interactions, lights, model, prefabs, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .background("#0b1020")
    .addMany(prefabs.productStage())
    .add(model(assets.sneaker).position(0, 0.65, -0.65).animate({ clip: "float", speed: 0.35 }))
    .add(lights.studio({ intensity: 1.35 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.2, target: [0, 0.55, -0.65] }))
});
```

Use CSS only for small overlays, toggles, labels, and page sizing. Do not use
DOM or canvas as the main 3D rendering path in Aura3D runs.
