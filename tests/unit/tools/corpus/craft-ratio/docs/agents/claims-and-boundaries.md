# Claims And Boundaries

This is the canonical claim boundary for agent-authored Aura3D work. Read this
after `llms.txt` and before writing examples, showcase routes, templates,
README copy, release notes, or public capability claims.

The core rule is simple: a public claim may describe only the path that has
evidence. Do not let production-runtime, rendering package, template, roadmap,
or prototype capability leak into claims about the root `createAuraApp` safe
API.

Aura3D 2.0 comparison claims use repository-locked `three@0.185.1`. The 15
selected exact-installed correctness workloads are bounded evidence, not a
universal parity verdict; full repeated performance, clean-machine replication,
and independent gallery review remain separate gates.

## Capability Labels

Use one of these labels for every public claim:

| Label | Meaning | Evidence required |
| --- | --- | --- |
| `createAuraApp` root safe API | A browser route imports only public `@aura3d/engine` APIs and mounts through `createAuraApp(...)`. | Build, route-health or equivalent diagnostics, typed asset manifest, browser screenshot, and claim-specific pixel or runtime assertion. |
| `production-runtime` | Capability exists in production-runtime packages or adapters, but is not necessarily exposed by root agent APIs. | Package tests or browser tests for that package, plus wording that does not imply root support. |
| `rendering` package | Capability exists in the public lower-level `@aura3d/rendering` package but is not necessarily exposed by root agent APIs. | Public package exports plus renderer unit/browser evidence, with explicit package-level wording. |
| CLI asset pipeline | Capability belongs to asset search, add, resolve, validation, provenance, type generation, screenshots, or deploy checks. | CLI command output, `aura.assets.json`, generated `src/aura-assets.ts`, source/license metadata, and validation reports. |
| Template-only scaffold | A template starts a project or route but does not itself prove production capability. | Template generation smoke test and honest scaffold wording. |
| Prototype | A route or API illustrates direction but lacks release-quality evidence. | Prototype label on route/docs and no flagship or production wording. |
| Roadmap | Planned capability that is not implemented or not public. | Future-tense wording and a linked issue, PRD item, or roadmap document. |

If the evidence does not exist, use `prototype` or `roadmap`. A route that
loads, compiles, or creates a large screenshot is not enough.

## Root API Boundary

The public agent path is normal TypeScript or JavaScript against
`@aura3d/engine`, mounted with `createAuraApp(...)`.

The root safe API can be claimed for:

- typed GLB/glTF asset usage through `model(assets.name)`;
- scene composition with public helpers such as `scene()`, `model(...)`,
  `camera`, `lights`, `material`, `effects`, `prefabs`, `sceneKits`,
  `primitives`, `group`, `groups`, `timeline`, `interactions`, `physics`,
  `labels`, `environments`, `game`, `games`, `charts`, `character`, `city`,
  `product`, `solar`, `particles`, `ui`, `instances`, `distanceLod`, `text3D`,
  and `geometry`, when those imports are actually
  exported and tested from root `@aura3d/engine`;
- browser route mounting through one `createAuraApp(...)` call per route;
- runtime node mutation and frame updates through public app/runtime methods;
- diagnostics, evidence helpers, screenshots, and deploy checks when they are
  run and attached to the route or PR.

Do not claim these for root `createAuraApp` unless root-only browser evidence
proves the exact result:

- production renderer parity or "Three.js-quality" rendering;
- full PBR material parity;
- HDR, IBL, PMREM-style environment filtering, production tone mapping, or
  high-quality shadows;
- pixel-backed bloom, SSAO, DOF, FXAA/TAA, color grading, or other postprocess;
- native WebGPU, compute dispatch, or WebGPU rendering;
- skinned GLB animation or morph rendering beyond the bounded fixtures and
  behaviors in `docs/rendering/animation.md`;
- production-quality character, racing, platformer, falling-block, or generic
  collision/gameplay kits;
- generic physics/collision behavior not exported and tested from the root API.

`PortableShaderMaterial` is a supported `@aura3d/rendering` package extension
API for paired GLSL/WGSL custom materials. Its real WebGL2/WebGPU evidence does
not make custom shader authoring a root `createAuraApp` claim and does not prove
general TSL/node-material parity. See
`docs/rendering/portable-custom-materials.md`.

PBR/glTF evidence is also path-specific. The bounded current-Three.js receipt
in `docs/rendering/pbr-gltf-correctness.md` proves selected root primitive
behaviors, production-runtime textured materials and transmission, and
package-level loader semantics. It does not make production-runtime
transmission, full textured PBR, skinning, morphs, or every glTF extension a
root `createAuraApp` claim, and it does not prove universal Three.js ecosystem
parity.

Lighting/environment evidence follows the same rule. The current comparison in
`docs/rendering/lighting-environment-color.md` proves selected
production-runtime light, shadow, HDR/IBL, PMREM, background, and display-color
workloads. Finite rectangular lights and the bounded receiver-contact
approximation are rendering/runtime claims, not automatic root
`createAuraApp` claims; the latter is not a general screen-space or ray-traced
contact-shadow system.

Geometry evidence is also bounded. The root-only browser and large-scene
receipt in `docs/rendering/geometry-instancing-lod-text.md` proves native lit
instancing for supported instanced materials, camera-distance LOD with
hysteresis, a documented uppercase alphanumeric extruded mesh-text catalog,
custom indexed triangle geometry, CPU camera-frustum culling, and a static
bounds BVH. It does not prove one-draw support for every advanced material,
arbitrary font loading or shaping, SDF/MSDF text, or GPU occlusion/Hi-Z. DOM
world labels remain accessible UI and must not be described as 3D mesh text.

Animation evidence is bounded in the same way. The receipt in
`docs/rendering/animation.md` proves root typed-GLB skinned playback, named clip
controls, and named morph-target deformation with a stable camera and
subject-region pixels. Additive layers, root motion, events, explicit humanoid
retargeting, and imported two-bone IK are package-level behaviors. The selected
Robot Expressive comparisons against actual Three.js r185 do not prove
automatic arbitrary-rig retargeting, full-body IK, or universal animation
parity.

Controls, picking, XR, and recovery evidence is bounded in
`docs/rendering/controls-picking-xr-context.md`. Rendered routes and focused
package tests prove the named orbit, trackball, first-person, input, picking,
and transform-gizmo behaviors. WebXR proof uses injected sessions and must not
be presented as physical-device or compositor evidence. Context recovery is a
root app-owned pause and explicit scene remount after restoration; it is not a
blanket guarantee that every lower-level consumer or external GPU resource is
recreated transparently.

Lower-level `@aura3d/physics` proof is also path-specific. Its native backend
has bounded adaptive CCD, accumulated Coulomb friction, rotated box SAT,
convex-hull GJK/EPA, triangle-backed mesh/heightfield contacts, and
contact-point angular impulses with world-space principal inertia. Do not turn
package physics tests or a `cannon-es` route into a generic root collision
claim.

Performance claims require current comparative reports. A passing hand-authored
feature inventory, stale visual capture, package benchmark, or missing-evidence
performance report is not proof that Aura3D matches or exceeds another engine.

## Asset Boundary

Do not invent assets. Use the Aura3D CLI so the route has durable provenance
and typed references.

For local files:

```bash
npx @aura3d/cli@latest assets add ./assets/model.glb --name model
```

For catalog assets:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

Then import and render the typed asset:

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.helmet)).add(lights.studio())
});
```

Forbidden in public safe examples:

```ts
model("helmet");
model("/assets/helmet.glb");
model("https://example.com/helmet.glb");
unsafeModelUrl("https://example.com/helmet.glb");
```

Primary assets must appear in `aura.assets.json` and generated
`src/aura-assets.ts`. Release-facing asset evidence must include durable source
page, download URL when available, license name, license URL, author when
available, acquisition timestamp, hash, and generated typed key. Temp paths such
as `/var/folders/.../T/aura3d-resolve-*` are not durable provenance unless the
asset is explicitly marked local-only and excluded from public release claims.

## Primitive Boundary

Primitives are allowed for:

- set dressing around a resolved real asset;
- collision guides and debug markers;
- HUD anchors and measurement helpers;
- placeholder geometry inside explicitly local prototypes;
- simple abstract visualization where the route is labeled abstract.

Primitives are not allowed as the primary character, vehicle, product, creature,
weapon, world, hero object, or primary environment for a named real-world or
game prompt. With the asset catalog available, a named object should start from
a real typed GLB/glTF asset. A primitive-only public showcase must be labeled
abstract visualization or blocked.

## DOM And CSS Boundary

CSS, DOM, and canvas overlays can provide UI, controls, menus, HUD text, route
chrome, and debug panels.

They cannot be used as:

- fake Aura3D particles;
- fake bloom, trails, lighting, labels, shadows, explosions, or 3D effects;
- substitute scene geometry;
- screenshot evidence for renderer capability;
- proof that WebGPU, postprocess, animation, or physics exists.

If a route claims Aura3D particles, changing particle controls must visibly
change rendered pixels and telemetry from Aura3D runtime state, not only DOM
nodes.

## Three.js Boundary

Public agent-authored examples must not import:

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
```

Do not hand-wire `new THREE.Scene()`, `new THREE.WebGLRenderer(...)`, camera
loops, loaders, or controls in public safe examples. If a task explicitly
targets renderer internals or migration diagnostics, label that work internal
and do not use it as proof for root `createAuraApp`.

## Game Boundary

A route is not a game claim just because it has a 3D scene and key listeners.

A public game route must prove:

- keyboard input visibly changes gameplay state;
- objective, scoring or fail condition, reset, and progression loop;
- automated tests for movement, restart, and at least one win, fail, scoring,
  lap, checkpoint, line-clear, collection, or completion mechanic;
- typed primary character, vehicle, world, or playfield assets unless the game
  is explicitly abstract;
- route-health or equivalent evidence that names primary assets, primitive
  count, renderer mode, fallback mode, and claims.

Until production-quality game kits are exported and tested from root
`@aura3d/engine`, describe route-local game logic as route-local. Do not claim a
reusable platformer, racing, falling-block, character-controller, or collision
kit unless that public API exists and passes root-only tests.

## Evidence Checklist

Before marking a public example, doc, README, or release claim as ready, verify:

- no raw string model IDs in public examples;
- no raw `.glb` or `.gltf` URLs in public examples unless inside an unsafe
  diagnostics document;
- no `unsafeModelUrl(...)` in release-facing examples;
- no `three`, `three/examples/...`, or `GLTFLoader` imports;
- no CSS/DOM particle implementation for examples claiming Aura3D particles;
- no primary character, vehicle, world, product, weapon, or creature made only
  from primitives unless explicitly abstract;
- all primary assets are present in `aura.assets.json` and `src/aura-assets.ts`;
- all primary assets have durable source/license/provenance metadata;
- screenshots show the main subject readable at first load on desktop and
  mobile;
- game routes prove movement, reset, objective, and scoring/fail/progression;
- animation claims include pixel-backed proof of the animated subject changing,
  not only camera or UI movement;
- WebGPU claims include adapter, backend, dispatch, rendering, and pixel
  evidence;
- route-health or equivalent evidence declares primary assets, fallback status,
  primitive count, renderer backend, screenshots, and claims;
- public wording does not exceed detected capability.

This checklist mirrors the current release checklist and static-source
requirements. If a required validation command does not exist yet,
state that the route is blocked or prototype rather than weakening the claim.

## Allowed Short Claims

These claims are safe when supported by the app's files and evidence:

- Aura3D is a TypeScript SDK and asset deployment pipeline for agent-authored
  browser 3D.
- Agents write editable TypeScript or JavaScript against public
  `@aura3d/engine` APIs.
- The CLI can add, resolve, validate, hash, type-generate, and track GLB/glTF
  assets when those commands have been run.
- A route uses typed assets when it imports `assets` from generated
  `src/aura-assets.ts` and calls `model(assets.name)`.
- A template scaffolds a starting project when template generation has been
  tested.
- A screenshot proves only what is visible in that screenshot.

## Disallowed Short Claims

Do not write:

- "Aura3D automatically matches production renderer quality" unless the root
  production bridge and pixel tests prove it.
- "WebGPU particle lab" unless native WebGPU adapter, backend, dispatch,
  rendering, and pixels are verified.
- "PBR material parity" unless the exact material features are tested and
  visible from the claimed API path.
- "Skinned character animation" unless a real skinned GLB changes pose in
  pixel-backed evidence.
- "Playable platformer/racer/fighting/falling-block kit" unless root exported
  game APIs and automated input tests prove that kit.
- "Real-time simulation" when telemetry is disconnected from scene state.
- "Asset-backed" when the primary subject is primitives or raw URLs.

When in doubt, lower the label to `prototype` and describe the missing evidence.
