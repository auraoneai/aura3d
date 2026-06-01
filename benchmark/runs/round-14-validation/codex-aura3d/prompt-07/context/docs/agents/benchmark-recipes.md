# Benchmark Recipes

Use these recipes only when the benchmark prompt matches the recipe family.
Read `llms.txt` first, copy the smallest matching shape, make only
prompt-required edits, run finite commands such as `npm install` and
`npm run build`, return the build/run commands, and stop. Do not run
`npm run dev`, `npm run preview`, Playwright, browser screenshot capture, or
manual visual verification inside the benchmark agent process.

Before custom code, use the public direction from `docs/agents/build-playbook.md`
and `docs/agents/verification.md`: prompt-plan apps compile with
`compilePromptPlan(plan)`, benchmark recipes use the smallest matching prefab,
and verification is finite build/test/check output plus runner-owned visual
capture. For physics prompts, do not import `PhysicsWorld`, `Shape`, or
`PhysicsDebugAdapter` from `@aura3d/engine`; use visible prefabs and the safe
root `physics` namespace (`physics.world(...)`, `physics.box(...)`,
`physics.step(...)`) for simulation state.

Shared imports:

```ts
import {
  camera,
  city,
  collectAuraSceneEvidence,
  createAuraApp,
  effects,
  games,
  interactions,
  lights,
  material,
  model,
  prefabs,
  primitives,
  physics,
  scene,
  shadows,
  timeline,
  ui
} from "@aura3d/engine";
```

## 01 Physics Playground

Do not fake collision counters with timers. The HUD can summarize the scene, but
the screenshot must carry the physics evidence: falling cubes, settled cubes,
ramp/catch geometry, contact patches, gravity direction, and a reset affordance.

```ts
import { camera, collectAuraSceneEvidence, createAuraApp, interactions, lights, physics, prefabs, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <div class="hud"><button id="reset" type="button">reset</button><span>contact evidence visible: ramp + settled pile + patches</span></div>
`);
const physicsScene = scene()
  .background("#070b12")
  .addMany(prefabs.physicsPlayground({ cubes: 50 }))
  .add(lights.studio({ intensity: 1.15 }))
  .add(interactions.orbit())
  .camera(camera.physics());
const world = physics.worldFromScene(physicsScene);
ui.resetButton("#reset", (button) => {
  world.reset();
  ui.setText(button, `reset ${world.snapshot().resets}; world bodies restored`);
});
console.log(collectAuraSceneEvidence(scene().physics(world).addMany(physicsScene.toJSON().nodes)).physics);

createAuraApp("#app", {
  scene: physicsScene
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
ui.slider("#rate", { min: 60, max: 180, value: 120, metric: "particle-emission-rate" });
ui.onInput("#rate", (input) => ui.setText("#rate-value", input.value));

createAuraApp("#app", {
  scene: scene()
    .background("#030711")
    .addMany(prefabs.particleFountain({ count: 2400, emissionRate: Number(ui.range("#rate").value) }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.autoFrame({ bounds: { min: [-2.5, 0, -2.5], max: [2.5, 3.6, 2.5] } }))
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
    .camera(camera.solar())
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
    .camera(camera.neon())
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
    .add(interactions.raycastHover({ target: "height-colored data bar 6-6", selected: "height-colored data bar 6-6" }))
    .camera(camera.charts())
});
```

## 06 Mini Golf

```ts
ui.html("#app", `
  <div style="position:absolute;left:18px;top:18px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(15,23,42,.76);color:white;font:700 14px system-ui">
    strokes: <span id="strokes">1</span> | power <input id="power" type="range" min="0" max="100" value="56" />
  </div>
  <button id="shoot" type="button" style="position:absolute;left:18px;top:58px;z-index:20;padding:8px 10px;border-radius:8px;background:rgba(8,47,73,.82);color:white;font:700 14px system-ui">
    aim and shoot
  </button>
`);
let strokes = 1;
const golf = games.createMiniGolfState();
let app = createGolfApp();
ui.scoreCounter("#strokes", { initial: strokes, label: "strokes" });
ui.powerMeter("#power", { min: 0, max: 100, value: 56 });
ui.onClick("#shoot", () => {
  golf.shoot({ vector: [2.9, 0, -1.55], power: Number(ui.range("#power").value) / 50 });
  const metrics = golf.step(180);
  strokes = metrics.shots;
  app.dispose();
  app = createGolfApp();
  ui.setText("#strokes", `${strokes}${metrics.cupTriggered ? " cup" : ""}`);
});

function createGolfApp() {
  return createAuraApp("#app", {
    scene: scene()
    .background("#7dd3fc")
    .addMany(golf.nodes())
    .add(lights.studio({ intensity: 1.15 }))
    .add(interactions.pointer())
    .camera(camera.miniGolf())
    .timeline(timeline.loop({ seconds: 5 }))
  });
}
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
    .add(shadows.contact({ footprint: [5.6, 1.2], opacity: 0.22 }))
    .add(lights.studio({ intensity: 1.55 }))
    .add(interactions.orbit())
    .camera(camera.materials())
});
console.log(material.labParameters().map((entry) => entry.name));
```

## 08 Procedural City Block

```ts
import { camera, city, createAuraApp, effects, lights, scene, ui } from "@aura3d/engine";
import "./style.css";

ui.html("#app", `
  <button class="toggle" type="button" aria-pressed="true">night mode active; sun/moon markers visible</button>
`);
let isNight = true;
const cityState = city.createState({ timeOfDay: "night", blocks: 20, litWindows: true });
let app = createCityApp();

function buildCity() {
  const night = cityState.timeOfDay === "night";
  return scene()
    .background(night ? "#061018" : "#8fc9ff")
    .addMany(cityState.nodes())
    .add(effects.fog({ density: night ? 0.035 : 0.012, color: night ? "#4b5f78" : "#c7e7ff" }))
    .add(effects.bloom({ intensity: night ? 0.14 : 0.05 }))
    .add(lights.studio({ intensity: night ? 1.08 : 1.45 }))
    .camera(camera.city());
}

function createCityApp() {
  return createAuraApp("#app", { scene: buildCity() });
}

ui.onClick(".toggle", (button) => {
  cityState.toggleTimeOfDay();
  isNight = cityState.timeOfDay === "night";
  app.dispose();
  app = createCityApp();
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
    .addMany(character.primitiveHumanoid({ showJoints: true, motionTrail: true, clip: "walk", pose: "mid-stride" }))
    .add(lights.studio({ intensity: 1.15 }))
    .camera(camera.humanoid())
    .timeline(timeline.loop({ seconds: 4 }))
});
```

The captured frame must read as one connected humanoid. Keep planted feet,
face cues, shoulder/hip joints, and path markers visible. Motion trails should
sit behind the body; if a trail reads as a stray head or torso, disable it.
Before accepting a humanoid screenshot, run `character.visualQA(...)` on the
generated nodes and keep the frame open if it reports disconnected limbs or
impossible proportions.

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
    .camera(camera.product())
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
