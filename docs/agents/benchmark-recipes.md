# Benchmark Recipes

Use these recipes only when the benchmark prompt matches the recipe family.
Read `llms.txt` first, copy the smallest matching scene-kit recipe, make only
prompt-required edits, run finite commands such as `npm install` and
`npm run build`, return the build/run commands, and stop. Do not run
`npm run dev`, `npm run preview`, Playwright, browser screenshot capture, or
manual visual verification inside the benchmark agent process. Runtime capture
starts only after the agent process has stopped.

The benchmark is scored visually. A scene that compiles but looks like a toy,
draft artifact, symbolic sketch, or one imported asset on a floor is a failed
answer. Prefer scene kits first, prefabs second, primitives last.

Shared imports:

```ts
import {
  createAuraApp,
  sceneKits,
  collectAuraSceneEvidence,
  physics,
  games,
  charts,
  character,
  city,
  product,
  solar,
  ui
} from "@aura3d/engine";
```

Root scene-kit import examples:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";
import { assets } from "./aura-assets";

const dataset = [
  [0.42, 0.68, 0.91],
  [0.55, 0.77, 0.83],
  [0.31, 0.59, 0.72]
] as const;

createAuraApp("#app", sceneKits.physicsPlayground().toAppOptions());
createAuraApp("#app", sceneKits.particleFountain({ emissionRate: 120 }).toAppOptions());
createAuraApp("#app", sceneKits.solarSystem().toAppOptions());
createAuraApp("#app", sceneKits.neonTunnel().toAppOptions());
createAuraApp("#app", sceneKits.dataViz({ dataset }).toAppOptions());
createAuraApp("#app", sceneKits.miniGolf().toAppOptions());
createAuraApp("#app", sceneKits.materialLab().toAppOptions());
createAuraApp("#app", sceneKits.cityBlock({ timeOfDay: "night" }).toAppOptions());
createAuraApp("#app", sceneKits.humanoidWalk({ animationState: "benchmark-pose" }).toAppOptions());
createAuraApp("#app", sceneKits.productViewer(assets.product).toAppOptions());
```

## Do Not Submit

- Toy mini-golf: a flat green with a ball and hole but no score, aim/power state, obstacle, cup rim, boundaries, ball trail, contact shadow, or physics state.
- Stray chart geometry: floating labels, detached ticks, cobweb guide lines, orphaned planes, or bars without axes/title/legend/value readout.
- Blown-out neon: a white rectangle, flat portal, CSS-only gradient, or overexposed bloom with no readable tunnel depth.
- Washed material lab: five spheres that all look pastel or matte, with no clear metal, glass, rubber, emissive, and clearcoat distinction.
- Product draft artifact: a bare GLB path, invented string id, uncentered model, missing plinth/contact shadow, or inspection clutter enabled by default.

## 01 Physics Playground

Scene kit:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.physicsPlayground();
createAuraApp("#app", kit.toAppOptions());
console.log(kit.diagnostics, kit.evidence);
```

Expected screenshot contains: falling cubes, settled pile, ramp/catch geometry,
contact patches, gravity or velocity cue, reset affordance, studio lighting, and
grounded shadows. Do not fake collision counters with timers. Use the safe root
`physics` namespace only if the prompt requires custom simulation state.

## 02 Particle Fountain

Scene kit:

```ts
import { createAuraApp, particleFountain, ui } from "@aura3d/engine/scene-kits/particle-fountain";

ui.html("#app", `<label>emission rate <input id="rate" type="range" min="60" max="180" value="120" /></label>`);
ui.slider("#rate", { min: 60, max: 180, value: 120, metric: "particle-emission-rate" });
const kit = particleFountain({ emissionRate: Number(ui.range("#rate").value) });
createAuraApp("#app", kit.toAppOptions());
```

Expected screenshot contains: dense upward flow, color/lifetime variation,
emitter base/nozzle, falling arcs, splash or ground collision context, and a
real emission-rate control. A label-only control fails this prompt.

## 03 Procedural Solar System

Scene kit:

```ts
import { createAuraApp, sceneKits, solar } from "@aura3d/engine";

const kit = sceneKits.solarSystem();
createAuraApp("#app", kit.toAppOptions());
console.log(solar.visualQA(kit.nodes));
```

Expected screenshot contains: sun glow/corona, six labeled planets with distinct
materials, orbit paths, depth-faded rings, stars/dust, and whole-system framing.
Do not replace this with a flat 2D diagram or unlabeled dots.

## 04 Neon Tunnel

Scene kit:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.neonTunnel();
createAuraApp("#app", kit.toAppOptions());
```

Expected screenshot contains: inside-the-tube camera, foreground rings receding
to a vanishing point, rails, reflective floor/walls, fog falloff, sparks or
motes, and controlled bloom. If the capture reads as a portal, box, flat CSS
background, or whiteout, do not submit it.

## 05 3D Data Visualization

Scene kit:

```ts
import { charts, createAuraApp, sceneKits } from "@aura3d/engine";

const dataset = [
  [0.42, 0.68, 0.91],
  [0.55, 0.77, 0.83],
  [0.31, 0.59, 0.72]
] as const;
const kit = sceneKits.dataViz({ dataset });
createAuraApp("#app", kit.toAppOptions());
console.log(charts.visualQA(kit.nodes));
```

Expected screenshot contains: bars, base/grid, readable title, X/Z/height axes,
numeric ticks, legend, selected value or hover readout, and no orphaned labels
or detached guide lines.

## 06 Mini Golf

Scene kit:

```ts
import { createAuraApp, games, sceneKits } from "@aura3d/engine";

const golf = games.createMiniGolfState();
const kit = sceneKits.miniGolf();
createAuraApp("#app", kit.toAppOptions());
console.log(golf.snapshot(), kit.evidence);
```

Expected screenshot contains: white physics golf ball, cup and rim, aim line,
power/shot state, score, obstacle, course boundaries, ball trail or contact cue,
and follow-camera target evidence. Do not hand-roll mini-golf physics when
`games.createMiniGolfState()` already covers shots, score, collisions, cup
trigger, reset, and follow-camera metrics.

## 07 Material Lab

Scene kit:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.materialLab();
createAuraApp("#app", kit.toAppOptions());
console.log(kit.diagnostics);
```

Expected screenshot contains: mirror metal, transparent glass, matte rubber,
visible emissive glow, glossy clearcoat, labels or class cues, contact shadows,
and lighting/reflection contrast. If the five materials are visually
indistinguishable, do not submit.

## 08 Procedural City Block

Scene kit:

```ts
import { city, createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.cityBlock({ timeOfDay: "night" });
createAuraApp("#app", kit.toAppOptions());
console.log(city.visualQA(kit.nodes));
```

Expected screenshot contains: many buildings, window grids, storefront/roof
variation, streets, sidewalks, crosswalks, lane markings, cars/props, traffic
lights or streetlights, and a visible day/night state. A day/night button that
only changes text or `aria-pressed` fails this prompt.

## 09 Animated Primitive Humanoid

Scene kit:

```ts
import { character, createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.humanoidWalk({ animationState: "benchmark-pose" });
createAuraApp("#app", kit.toAppOptions());
console.log(character.visualQA(kit.nodes));
```

Expected screenshot contains: one connected humanoid at thumbnail size, planted
feet, shoulder/hip sockets, connected wrists/ankles/hands/feet, face cues,
motion or path evidence, and no detached primitive limbs. Human acceptance is
required for this prompt even if structural QA passes.

## 10 Product Viewer Sneaker

Asset preflight:

```bash
npx @aura3d/cli@latest assets add ./assets/sneaker.glb --name sneaker
sed -n '1,120p' src/aura-assets.ts
```

Scene kit:

```ts
import { createAuraApp, product, sceneKits } from "@aura3d/engine";
import { assets } from "./aura-assets";

const kit = sceneKits.productViewer(assets.sneaker);
createAuraApp("#app", kit.toAppOptions());
console.log(product.visualQA(kit.nodes));
```

Expected screenshot contains: typed GLB model centered, scaled to fit, seated on
a plinth or stage, contact shadow, studio softboxes, material readability cues,
orbit/turntable evidence, and no inspection clutter unless requested. Do not
write `model("sneaker")`, do not use `unsafeModelUrl(...)`, and do not invent
asset URLs.

## Physics And Asset Anti-Hallucination

- Do not invent Aura3D APIs. Use only public root exports from `@aura3d/engine`.
- Do not import `PhysicsWorld`, `Shape`, or `PhysicsDebugAdapter`; use the root
  `physics` namespace and scene kits/prefabs for visible evidence.
- Do not invent asset paths or ids. Run `assets add`, read `src/aura-assets.ts`,
  and use the generated `assets.<name>` key.
- Do not use raw string asset ids in the safe API.

## Prompt 09 lean humanoid recipe

Use the public lean humanoid-walk scene-kit subpath for the humanoid benchmark prompt. This keeps Prompt 09 asset-free and prevents the broad root engine bundle from carrying the old armored humanoid GLB path into production output.

```ts
import { character, createAuraApp, sceneKits } from "@aura3d/engine/scene-kits/humanoid-walk";

const kit = sceneKits.humanoidWalk({ animationState: "benchmark-pose" });
createAuraApp("#app", kit.toAppOptions());
console.log(character.visualQA(kit.nodes));
```
