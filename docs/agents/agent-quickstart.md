# Agent Quickstart

Aura3D Agent Quickstart: prompt to browser 3D with TypeScript, scene kits, typed GLB/glTF assets, Vite templates, diagnostics, screenshots, and static deploy checks.

Use this quickstart to build AI-generated browser 3D scenes, GLB product viewers, and Vite 3D apps with Codex, Claude Code, Cursor, Copilot-style agents, or any coding agent that writes TypeScript.

Aura3D is a scaffolded path from a 3D product prompt to an app a team can keep.

Read `llms.txt` first. Then read `docs/agents/claims-and-boundaries.md` for the
hard rules that prevent primitive slop, raw asset IDs, Three.js loader code, CSS
scene effects, and overclaimed root `createAuraApp` capabilities.

The workflow is intentionally simple:

1. Describe the 3D experience.
2. Resolve or add the real GLB/glTF asset.
3. Generate typed asset refs.
4. Compose the scene with the public Aura3D API.
5. Capture evidence and deploy.

## Golden path

1. Scaffold with `npx create-aura3d@latest my-scene --template product-viewer`.
2. Search/resolve a catalog asset or add a user-approved local asset:

   ```bash
   npx @aura3d/cli@latest assets search "studio robot"
   npx @aura3d/cli@latest assets resolve "studio robot" --name robot
   npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
   ```

3. Import `assets` from `src/aura-assets.ts`.
4. Compose a scene with `scene()`, `model(assets.robot)`, `camera`, `lights`,
   `material`, `effects`, `timeline`, and `interactions`.
5. Run `npm run build`, `npm run test`, screenshot evidence, route-health or
   equivalent diagnostics, and `npx @aura3d/cli@latest check-deploy`.

Do not start an object-focused app with boxes and cylinders. For a named
product, character, vehicle, weapon, creature, or world, the primary subject
must be a typed GLB/glTF asset. Primitives can support the scene as set
dressing, debug markers, collision guides, HUD anchors, or explicitly abstract
visualization.

## Prompt-to-code pattern

Use this when the user gives a product prompt rather than a hand-written scene
plan.

```ts
import {
  createAuraApp,
  definePromptPlan,
  promptPlanToScene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = definePromptPlan({
  sceneType: "product-viewer",
  subject: { asset: assets.robot },
  camera: { preset: "product-orbit" },
  lighting: { preset: "studio-softbox" },
  interaction: "orbit",
  acceptanceCriteria: ["asset is centered", "lighting and shadows are visible"]
} as const);

createAuraApp("#app", {
  scene: promptPlanToScene(plan),
  diagnostics: { overlay: true }
});
```

Full workflow details live in `docs/agents/prompt-to-3d-workflow.md`.

## Mandatory 3D game & scene anti-failure guardrails

1. **No primitive-box characters, vehicles, or hero props ("no stick-figure humans or box cars")**:
   - Never assemble characters, athletes, enemies, vehicles, aircraft, trees, or architectural landmarks out of `primitives.box`, `primitives.sphere`, or `primitives.cylinder` — keep every silhouette, look, lighting, and shadow readable with real 3D geometry.
   - Every character, vehicle, creature, weapon, and landmark must mount a real 3D GLB via `model(assets.<name>, { targetMaxDimension, role })` from `src/aura-assets.ts`. If the catalog lacks a required 3D model, generate a bespoke PBR 3D model with Meshy (`meshy`) and admit it via `aura3d assets import-meshy`.
   - Primitives (`primitives.plane`, `primitives.box`, `primitives.cylinder`, `primitives.torus`) are reserved strictly for ground/court surfaces, field lines, UI rings/reticles, laser beams, and invisible physics colliders.
2. **Boot directly into live 60 FPS 3D gameplay (no blocking start modals)**:
   - Never hide the 3D canvas, camera framing, or atmosphere behind an opaque full-screen HTML start menu, character select modal, or briefing overlay on initial page load, and never require query parameters (`?autoplay=1`, `?demo=1`, `?play=1`) for the scene to animate.
   - Every game route must start in active 60 FPS gameplay on Frame 1 with an intelligent AI autopilot/demo controller that plays the game autonomously and yields instant manual control on the first keyboard (`keydown`), pointer, touch, or gamepad input.
   - Keep mode, stage, camera, and roster selectors in a compact, non-blocking top HUD bar, and always call `button.blur()` after button clicks so `Space` or `Enter` gameplay keys never re-trigger focused HUD buttons.
3. **Always optimize Meshy 3D GLBs before admission (`assets optimize --role`)**:
   - Raw Meshy exports often contain `200,000–1,750,000` vertices and `20–65 MB` of uncompressed 4K PNG textures, which stall main-thread glTF parsing and exhaust GPU memory when multiple models load in one scene.
   - Run `assets optimize --file in.glb --out out.glb --role <role>` (vertex budgets: prop 6,000, background 15,000, character 30,000, hero or vehicle 40,000; textures capped at 1024 to 2048 px; 16-bit indices) before admitting a model, admit it in an isolated project (`assets import-meshy --into <dir> --prefix <game> --name <role>`), and keep a game's assets near 25 MB.
4. **Always use canonical typed asset manifest refs (`hash` required)**:
   - The production glTF bridge requires `createAssetProvenance(node.asset).source === "typed-aura-assets-manifest"`, which requires a valid 64-character `sha256-...` `hash` and `public/aura-assets/...` provenance from `aura.assets.json` / `src/aura-assets.ts` so the rendered look and silhouette load cleanly.
   - Never omit `hash` in custom `defineAssets(...)` declarations and never place unhashed duplicate GLBs in route-local `apps/<route>/public/aura-assets/` that collide with root `public/aura-assets/`.
5. **Mutate node handles instead of calling `app.setScene()` on every restart**:
   - Do not call `app.setScene()` when restarting a round, hole, or bout on the same stage/world; tearing down and remounting the scene disposes live GPU resources, breaks lighting and postprocess continuity, and aborts in-flight GLB loads. Track a scene signature (`stageId` / `worldId`) and reset positions, visibility, and animations through runtime node handles (`app.nodes.require(...)`).
6. **Prevent fog whitewash, overexposure, and instanced emissive blowout**:
   - If a fast route shows a haze wall or whitewash, pass `{ fogDensityScale: 0, exposureEv: -0.1 }` to `looks.preset(...)`. Do not pin post-processing, the compiler or fog off for every player with a `qualityRebuild.flags` list (`looks.preset` emits `density: 24 / far`, which under `A3D_QR_VFX_FOG` can create an `exp2` haze wall at 20–30m: fix that route, and install the safety net so a machine that renders badly steps down on its own).
   - Never stack duplicate high-intensity `lights.directional`, `lights.ambient`, or `lights.hemisphere` nodes on top of `looks.preset(...)` (which already supplies an HDRI environment, a shadow-casting directional key light, and bloom).
   - Never set `emissive: "#ffffff"` with high `emissiveIntensity` on an instanced pool material (`instances.box` / `primitives.box({ instances })`): per-instance `instanceColors` multiply `u_baseColor`, not `u_emissiveColor`, so white emissive blows out every instance to pure white regardless of instance color. Always pass an explicit `material: material.pbr({ color })` on untextured Meshy preview GLBs so they never render chalk-white.
7. **Ground `model()` feet on platform top surfaces (`y + sy / 2`) & wind custom meshes CCW**:
   - `model(asset, { targetHeight })` normalizes the GLB with `minY = 0` so `position[1]` is the bottom (feet/tires) of the model, whereas `primitives.box` and `primitives.cylinder` (`instances.box` / `instances.cylinder`) are centered on `[-0.5..+0.5]` so a platform at `(y, sy)` has its top surface at `y + sy / 2`. Always place grounded characters and vehicles at `platform.y + platform.sy / 2` so they never sink into logs, pads, or road lanes.
   - Custom procedural terrain and ribbon meshes (`primitives.mesh`) must wind triangles counter-clockwise (CCW) when viewed from `+Y` so `gl_FrontFacing` is true and vertex normals receive direct sunlight.
8. **Enforce full-viewport `100vw × 100vh` canvas, deep ground apron, and pushbox separation**:
   - Size `html, body, #app, canvas` to `100vw × 100vh` (`position: fixed; inset: 0; overflow: hidden`) and extend the 3D ground/stage apron deep enough in `+Z`/`-Z` under the camera frustum so the bottom third of the viewport never shows a black clear-color void.
   - Disable `collision: true` on `camera.rigs.shoulder` when the target character has attached child/accessory runtime nodes at the same position so the camera sphere-cast never collides with the hero's own child nodes.
   - Enforce a minimum horizontal pushbox separation (`>= 1.4m`) every frame and wide initial spawn spacing (`|x| >= 1.8m`) in fighting and sports games so characters never overlap at the origin.


## Claim-safe checklist

Before presenting the result as public or release-ready:

- no `model("id")`, raw `.glb` or `.gltf` URLs, or `unsafeModelUrl(...)`;
- no `three`, `three/examples/...`, or `GLTFLoader` imports;
- no CSS/DOM particles, fake 3D labels, fake effects, or fake renderer proof;
- no primitive-only primary subject, stick-figure human, or box car unless the route is explicitly abstract;
- all primary assets are in `aura.assets.json` and `src/aura-assets.ts` with canonical 64-character `sha256-...` `hash` provenance and decimated/compressed GLB payloads (`<= 20,000` vertices, `<= 2 MB`, 16-bit indices, `<= 1024x1024` textures);
- screenshots show the primary subject readable at first load with no blocking start modal;
- game examples boot directly into 60 FPS gameplay on Frame 1 with AI autopilot yielding on first input, blur HUD buttons on click (`button.blur()`), mutate runtime node handles (`app.nodes.require(...)`) instead of calling `app.setScene()` on same-stage restarts, and prove keyboard input, objective, reset, and scoring/fail or progression;
- claims are labeled as root safe API, production-runtime, rendering internals,
  CLI pipeline, template scaffold, prototype, or roadmap.

## Product rule

Do not make the scene feel generated. Use authored assets, typed refs, scene
kits, readable controls, and screenshot evidence. Aura3D is there to help an
agent ship browser 3D that feels intentional, not improvised. If the public root
API cannot prove the requested feature yet, say so and keep the route labeled as
prototype or blocked rather than compensating with fake visuals.
