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

Do not fake collision counters with timers. The HUD can summarize the scene, but
the screenshot must carry the physics evidence: falling cubes, settled cubes,
ramp/catch geometry, contact patches, gravity direction, and a reset affordance.

```ts
import { camera, createAuraApp, interactions, lights, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div class="hud"><button id="reset" type="button">reset</button><span>contact evidence visible: ramp + settled pile + patches</span></div>
`);
ui.onClick("#reset", (button) => ui.setText(button, "reset requested; visual state restored by benchmark reload"));

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

The emission-rate control must change a real value used by the particle prefab.
A label-only button fails this prompt.

```ts
ui.html("#app", `
  <label style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.78);color:white;font:700 14px system-ui">
    emission rate <input id="rate" type="range" min="60" max="180" value="120" />
    <span id="rate-value">120</span>
  </label>
`);
ui.onInput("#rate", (input) => ui.setText("#rate-value", input.value));

createAuraApp("#app", {
  scene: scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 2400, emissionRate: Number(ui.range("#rate").value) }))
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

The first frame must read from inside a tube: foreground rings receding to a
vanishing point, visible wall/floor depth, fog falloff, and bloom. If the
screenshot reads as a portal, rectangular box, or flat CSS background, the
prompt is not satisfied.

```ts
createAuraApp("#app", {
  scene: scene()
    .background("#020617")
    .addMany(prefabs.neonTunnel({ rings: 24 }))
    .camera(camera.dolly({ from: [0, 0.36, 1.6], to: [0, 0.36, -4.4], target: [0, 0.28, -5.8], fov: 54, seconds: 8 }))
    .timeline(timeline.loop({ seconds: 8 }))
});
```

## 05 3D Data Visualization

Readable labels are mandatory. The prefab supplies chart geometry and hover
metadata, but the benchmark also needs DOM evidence: title, X/Z/height axis
labels, numeric ticks, and a hover/readout note in the captured body text.

```ts
ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;color:white;background:rgba(3,7,18,.72);padding:10px 12px;border-radius:8px;font:700 13px system-ui">
    Revenue grid - X1..X6 / Z1..Z6 / Height 0-100<br />
    <span id="bar-readout">hover highlight enabled; selected bar: row 6 col 6 value 100</span>
  </div>
`);

createAuraApp("#app", {
  scene: scene()
    .background("#071017")
    .addMany(prefabs.dataBars3D({ grid: 6 }))
    .add(lights.studio({ intensity: 1.1 }))
    .add(interactions.orbit())
    .camera(camera.orbit({ distance: 4.8, target: [0, 1.0, 0] }))
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

Prompt 07 is a hard-prompt gate. It must read as five distinct materials:
mirror metal, transparent glass, matte rubber, visibly glowing emissive, and
layered glossy clearcoat.

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
let app = createCityApp(isNight);

function buildCity(night: boolean) {
  return scene()
    .background(night ? "#061018" : "#8fc9ff")
    .addMany(prefabs.cityBlock({ blocks: 20, litWindows: true, timeOfDay: night ? "night" : "day" }))
    .add(effects.fog({ density: night ? 0.035 : 0.012, color: night ? "#4b5f78" : "#c7e7ff" }))
    .add(effects.bloom({ intensity: night ? 0.14 : 0.05 }))
    .add(lights.studio({ intensity: night ? 1.08 : 1.45 }))
    .camera(camera.perspective({ position: [0.6, 5.2, 9.2], target: [0, 0.42, -0.4], fov: 58 }));
}

function createCityApp(night: boolean) {
  return createAuraApp("#app", { scene: buildCity(night) });
}

ui.onClick(".toggle", (button) => {
  isNight = !isNight;
  app.dispose();
  app = createCityApp(isNight);
  ui.setText(button, isNight ? "night mode active; sky/lights/windows changed" : "day mode active; sky/lights/windows changed");
  ui.setPressed(button, isNight);
});
```

`prefabs.cityBlock(...)` already includes 20 varied towers, window columns,
storefronts, awnings, roof detail, crosswalks, vehicles, traffic lights, street
lights, and in-frame sun/moon state markers. Keep the camera above or slightly
behind the foreground street so the day/night board and intersection evidence
stay visible. A day/night button that only changes text or `aria-pressed` fails
this prompt.

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

The captured frame must read as one connected humanoid. Keep planted feet,
face cues, shoulder/hip joints, and path markers visible. Motion trails should
sit behind the body; if a trail reads as a stray head or torso, disable it.

## 10 Product Viewer Sneaker

```ts
import { camera, createAuraApp, interactions, lights, model, prefabs, scene, timeline } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .background("#0b1020")
    .addMany(prefabs.productViewer(assets.sneaker))
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
`unsafeModelUrl(...)`, and do not invent asset URLs. Hashed `/aura-assets/...`
URLs generated by the typed Aura CLI from the provided benchmark asset are
allowed; hand-written GLB URLs are not. `prefabs.productViewer(assets.sneaker)`
combines the typed model, clean product stage, plinth, contact shadow, turntable
cue, softboxes, and orbit evidence so the model reads as a deliberate product
viewer instead of a lone GLB.

Use CSS only for small overlays, toggles, labels, and page sizing. Do not use
DOM or canvas as the main 3D rendering path in Aura3D runs.
