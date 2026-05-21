# Production-Grade G3D Core Platform And Advanced Gallery PRD

Status: current-branch execution PRD - preserve/g3d-v2-execution-state is source of truth; fix all advanced examples to accepted evidence; no legacy cleanup loop.
Last reviewed: 2026-05-21
Primary objective: build reusable G3D core platform capability first, then prove it through a production-grade advanced examples gallery comparable to official advanced Three.js showcase demos, without route-local hacks, fake assets, false claims, or screenshot churn.

## 0. Current Branch Operating Rules

This file controls the current work in /Users/gurbakshchahal/G3D on branch preserve/g3d-v2-execution-state.

The current checked-out branch is authoritative. Do not switch to main, master, local stashes, old backup folders, or transcript history as source truth. main and master are not the active advanced-gallery execution tree for this work.

The previous Product/Data loop failed because agents kept treating paperwork, metrics, hashes, generated artifacts, and repeated screenshots as progress while the actual examples remained visually weak. That history is not an implementation base.

Current rules:

- Fix the current branch, not an old branch.
- Do not use the wrong-branch stash as source truth.
- Do not create a standalone cleanup/report gate before implementation.
- Do not stop at a report, inventory, or missing-file list.
- Missing current-branch files, scripts, reports, PNGs, JSON, tests, routes, examples, or harnesses are work items to create, map, or repair from the current codebase.
- Product Configurator and Data Galaxy are important failed examples, but they are part of the ten-route gallery recovery, not a reason to freeze all other work.
- The final objective is accepted evidence for all ten advanced examples, not only Product/Data.

## 0A. Mandatory First Commands

Every execution pass starts with exactly these commands:

~~~bash
git status --short
git log -1 --oneline
pgrep -af "playwright|vite|v9-advanced|advanced-examples-gallery|tsx.*v9|vitest|pnpm.*v9"
~~~

If matching Playwright/Vite/Vitest/pnpm/v9 processes belong to /Users/gurbakshchahal/G3D, stop only those G3D-owned processes and continue. Do not kill unrelated processes from other repos.

## 0B. Worktree Safety

execute.md may be intentionally dirty while this PRD is being corrected. Preserve it.

If tracked files other than intentional current-task edits are dirty:

1. inspect git status --short, git diff --name-only, and git diff --stat;
2. back up unknown churn before any destructive git operation;
3. keep source changes only when they serve a named owner task in this PRD;
4. never reset, clean, stash, pop, drop, or switch branches if that would destroy the current PRD or user-provided instructions.

Use destructive git commands only when they are explicitly required for the current task and the affected files are backed up or known generated junk. Do not use git cleanup as a substitute for source ownership.

## 0C. Goal-Mode Continuation Rule

When running this file in goal mode, keep going until the PRD is complete.

Do not stop for ordinary repo-internal blockers. These are work items:

- missing route files;
- missing tests;
- missing package scripts;
- missing report folders;
- missing PNG/JSON artifacts;
- missing review/audit harnesses;
- outdated metadata;
- old path names from this PRD that need current-branch equivalents;
- failing route screenshots;
- failing focused tests caused by the current task.

Only pause for an actual external blocker: credentials, unavailable system dependency with no repo fallback, destructive git decision that would lose user work, tool failure outside the repo, or explicit user instruction.

A route that fails visual review is not a stop condition. It becomes the next source-owned fix.

A report is not a stop condition. It must feed the next owner task.

## 0D. Current Advanced Gallery Route Set

The ten active route IDs are:

1. product-configurator
2. data-galaxy
3. reactor-post
4. digital-twin
5. robotics-lab
6. smart-city
7. fog-cathedral
8. physics-playground
9. water-lab
10. ocean-observatory

All ten routes must be evaluated against current source, current runtime JSON, current screenshots, current metadata, current review output, and current audit output.

## 0E. Anti-Loop Rules

Invalid progress signals:

- smoke tests passed;
- typecheck passed;
- route JSON exists;
- screenshot hashes changed;
- object count increased;
- draw calls changed;
- metadata wording improved;
- diagnostics became more detailed;
- unit tests were updated to match bad output;
- generated assets were renamed, reclassified, or counted differently.

Valid progress requires all of:

1. a named source owner;
2. declared write set before edits;
3. focused tests for that owner;
4. a bounded visual verification when visible output changes;
5. direct PNG inspection of current artifacts;
6. honest metadata/review/audit status;
7. continuation to the next owner when the visual result still fails.

Do not recapture the same failed change repeatedly. Fix a source owner, run the narrow tests, run one qualified visual check, inspect it, then either accept with evidence or move to the next owner.

## 0F. Review And Audit Rule

The visual review gate is repo-owned and evidence-based. It must not depend on external reviewer environment variables as a reason to stop. If reviewer metadata or route judgments are required, create the current-branch review input from direct inspection of current PNGs and keep hashes tied to the exact artifacts being reviewed.

Review/audit tooling must fail closed for stale hashes, partial captures, missing route artifacts, missing known-gap notes, generated-asset overclaim, scaffold dominance, material failure, crop artifacts, and bad cadence. It must not fail open from metrics alone.

## 1. Current Truth

We are now on the correct advanced-gallery execution branch: preserve/g3d-v2-execution-state.

Known branch baseline at the time of this PRD rewrite:

~~~text
4febfe9 fix: v9 gallery fixes, asset inspection, environment platform, shader fixes
~~~

If the branch advances, use the current checked-out commit as truth. Do not require an old commit hash if the current branch contains the advanced-gallery source tree.

Current route state until reproved by current evidence:

- Product Configurator: failed.
- Data Galaxy: failed.
- Reactor Post: candidate, not accepted.
- Digital Twin: candidate, not accepted.
- Robotics Lab: candidate, not accepted.
- Smart City: candidate, not accepted.
- Fog Cathedral: candidate, not accepted.
- Physics Playground: candidate, not accepted.
- Water Lab: candidate, not accepted.
- Ocean Observatory: candidate, not accepted.
- Full gallery acceptance: 0/10 until current review/audit proves otherwise.

## 1A. Current Execution Mode

Current mode: autonomous current-branch gallery recovery.

Allowed and expected:

- inspect current source with rg --files, rg, and focused file reads;
- map each route to current owner files;
- create missing current-branch scripts, tests, harnesses, reports, and artifacts when needed;
- fix source-owned platform or route defects;
- run focused tests for the changed owner;
- run screenshots/captures only when a source-owned visible change needs verification;
- update metadata/review/audit only after current evidence supports it;
- continue to the next route/owner until all ten routes meet acceptance.

Forbidden:

- branch switching to chase old code;
- using stale wrong-branch work as implementation truth;
- creating a standalone cleanup/report gate;
- stopping after any diagnosis document;
- treating generated support assets as real authored hero proof;
- tuning tests, thresholds, metadata, reports, or review wording to make bad output pass;
- accepting routes from smoke tests, metrics, hashes, object counts, or JSON alone.

## 1B. Required Current-Branch Route Inventory

Before editing a route, inspect its current source and write down the route inventory in the task notes or update this PRD if the finding changes the work order.

For each route, the inventory must answer:

~~~md
Route:
Current builder/owner files:
Current authored/generated assets:
Current runtime evidence files:
Current visual artifacts:
Visible blocker:
Correct source owner:
First fix task:
Focused tests:
Allowed visual verification:
Stop/continue rule:
~~~

Do not wait for a perfect ten-route inventory before fixing an obvious source-owned blocker. Inventory enough to select a correct owner, then implement and verify.

## 1C. Product Configurator Restart

Product must read as a premium product configurator with the original car-concept hero as the focal subject.

Current constraints:

- Hero mode must show original car-concept as the focal product.
- Watch, shoe, sunglasses, and generated studio/support GLBs must not replace or clutter the hero.
- Paint, glass, roof/panels, wheels, tires, chrome, interior, dashboard, emissive parts, contact, grounding, shadows, reflections, and camera framing must be source-owned and inspectable.
- Material/import/renderer failures belong in packages/assets, packages/rendering, or packages/product-studio before route composition.
- Route fixes belong in apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts, productConfiguratorPolicy.ts, productConfiguratorVisualCleanup.ts, authoredLayer.ts, and metadata only when the package owners are proven or the change is route composition.

Product first-fix order:

1. inspect current Product route and authored asset activation;
2. inspect car-concept and material/mesh bindings;
3. prove material/import quality in a same-asset harness if needed;
4. fix renderer/assets/material/studio owners before route layout;
5. fix route composition only after the car itself renders credibly;
6. run one qualified focused capture after owner tests pass;
7. inspect PNGs directly and either accept evidence or select the next owner.

## 1D. Data Galaxy Restart

Data Galaxy must read as a premium data visualization, not debug art.

Current constraints:

- Generated Data GLB may be support/provenance only, never focal proof.
- No cuboid scaffold blocks, semantic filler, object-count padding, carpet particles, giant fog sphere, or random debug lines as the hero concept.
- Data needs a coherent reusable visual system: luminous core, orbital rings, streams/arcs, clustered points, depth layers, readable hierarchy, and animation evidence.
- CPU/static honesty is required, but it does not make a weak image acceptable.
- Reusable effect ownership belongs in packages/rendering or a route-neutral helper before route composition claims acceptance.

Data first-fix order:

1. inspect current Data route and focal-system source;
2. identify what actually draws the hero;
3. prove one reusable data effect outside the gallery route if needed;
4. preserve CPU/static/GPU boundary honesty;
5. adapt route composition only after the effect has premium first-glance structure;
6. run one qualified focused capture after owner tests pass;
7. inspect PNGs directly and either accept evidence or select the next owner.

## 1E. Remaining Route Recovery

Do not let Product/Data consume the entire execution. After each Product/Data owner attempt, continue the full-gallery route queue.

Route recovery order after Product/Data source owners are selected:

1. Reactor Post - base geometry clarity before bloom/postprocess.
2. Digital Twin - industrial/factory systems, robot/conveyor/sensor/timeline evidence.
3. Robotics Lab - animated robots, industrial context, controls, timeline/reset evidence.
4. Smart City - city scale, traffic/data overlays, camera/readability, performance.
5. Fog Cathedral - authored architecture plus renderer fog evidence without card/fog overclaim.
6. Physics Playground - visible physics systems, reset, contacts, debug honesty.
7. Water Lab - water/reflection/refraction approximation honesty plus visible interaction.
8. Ocean Observatory - ocean/deck/weather controls, depth/scale, approximation honesty.

Each route must end with current source-owned fixes, current tests, current screenshots/runtime JSON, direct visual review, and audit evidence.

## 1F. One-Shot Visual Verification Rule

Before any focused route capture after a visible source change, write the verification question in the task notes:

~~~md
Route:
Source owner:
Files changed:
Expected visual difference:
Old artifact that should disappear:
New visual structure that should appear:
Focused tests passed:
~~~

Then run one focused capture for that owner change. If the PNG fails, do not recapture the same change repeatedly. Update the owner diagnosis and continue with the next source fix.

## 1G. Goal-Mode Prompt Template

Use a short goal that points to this file instead of pasting a huge prompt:

~~~text
Work in /Users/gurbakshchahal/G3D on the current preserve/g3d-v2-execution-state checkout. Read execute.md fully and follow it exactly. execute.md is the only source of truth; do not use goal.md, old chats, master/main, stashes, or backup folders as implementation truth. Run the mandatory first commands, preserve execute.md, fix current-branch source-owned defects across all ten advanced gallery routes, create missing current-branch files/tests/scripts/artifacts as work items, and continue until execute.md acceptance is complete. Do not stop for missing repo files or reports. Do not loop on Product/Data screenshots. Use focused owner tests, one qualified visual check per owner change, direct PNG inspection, review/audit gates, and honest metadata. Stop only for external blockers or explicit user instruction.
~~~

## 2. Product Definition

G3D is being developed into an AI-native cinematic scene engine for the web.

The product is not a set of patched examples. The gallery is the proof surface. The reusable platform underneath is the product:

- `packages/rendering`
- `packages/assets`
- `packages/input`
- `packages/controls`
- `packages/scene`
- `packages/animation`
- `packages/physics`
- reusable gallery/runtime helpers that can later graduate out of `apps/*`
- documentation, examples, reports, and acceptance tooling that make the system reproducible

The product distinction is:

- Three.js gives developers powerful low-level parts.
- G3D must provide reusable scene systems that are inspectable, reproducible, directable, and evidence-backed.
- Three.js is primarily code-first.
- G3D must remain code-first while becoming AI-directable through scene metadata, asset provenance, material assignments, lighting plans, camera shots, animation timelines, postproduction settings, unsupported-feature disclosures, and deterministic evidence reports.
- A G3D example is not accepted because it looks good once. It is accepted only when the same result can be generated, inspected, revised, captured, and explained through reusable renderer/runtime/gallery capability.

The intended claim is:

> G3D is an AI-native cinematic scene engine for the web, designed to let developers and AI agents create, inspect, revise, and ship premium interactive 3D scenes with evidence-backed renderer/runtime capability.

That sentence is product direction until current code, screenshots, runtime reports, metadata, and review gates prove it.

## 3. Non-Negotiable Rules

- Do not fake capabilities.
- Do not invent G3D APIs.
- Do not weaken review gates.
- Do not call a route `accepted` from smoke tests, route tests, or image metrics alone.
- Do not replace real texture-backed assets with random, generated, no-texture, or unrelated props to make screenshots look busier.
- Do not hide broken nodes, crop cameras, darken CSS, disable systems, add bloom, or add vignette as a substitute for renderer/material/loader/environment fixes.
- Do not keep route-specific hacks when the problem belongs in importer, renderer, material, animation, postprocess, physics, controls, environment, scene metadata, or gallery tooling.
- Do not downgrade demos into simple cubes, spheres, planes, particles, or placeholder props.
- Do not claim Three.js parity for a feature until reusable G3D source, focused tests, runtime evidence, screenshots, and known-limit metadata prove it.
- Do not run repeated screenshots after speculative edits. Screenshots are verification artifacts after source-owned fixes, not an iteration strategy.
- Do not remove unrelated files or revert unrelated dirty work.
- Do not use git reset or checkout to recover visual state. There was no clean checkpoint for the current regression.

## 4. Execution Order

The work must happen in this order. A later phase may start only when it does not hide or bypass an earlier source-owned blocker.

| Phase | Name | Owns | Exit Gate |
| --- | --- | --- | --- |
| P0 | Evidence and regression guardrails | Review tools, report audit, screenshot discipline, partial-run detection. | Review/report tooling blocks false acceptance and screenshot churn. |
| P1 | Renderer visual foundation | Color, tone mapping, exposure, HDR/LDR targets, DPR, capture consistency, frame cadence. | Renderer reports and tests prove stable output before route art direction. |
| P2 | Asset and material activation | GLTF diagnostics, render-resource metadata, PBR fallback, texture handling, variants, unsupported extensions. | Product/reference harness proves original GLBs render with credible material fidelity and honest limits. |
| P3 | Environment, lighting, grounding, reflection | Environment presets, HDR/RGBE backgrounds, fog, studio stage, softboxes, contact grounding, PMREM limits, reflection/refraction boundaries. | Product/Data/Fog/Water routes consume shared environment/lighting systems instead of route shells. |
| P4 | Controls, picking, scene metadata, animation, physics | Orbit/fly/picking/hotspots, entity inspection, scene schema, timeline, animation diagnostics, physics reset/debug. | Product/city/robotics/digital-twin/physics routes use shared contracts. |
| P5 | Active visual regression recovery | Product Configurator, Data Galaxy, Reactor Post. | Broken screenshots are mapped to source owners and fixed without asset replacement or hiding. |
| P6 | Remaining route remediation | Digital Twin, Robotics Lab, Smart City, Fog Cathedral, Physics Playground, Water Lab, Ocean Observatory. | Every route has file-owned fixes, current runtime evidence, and honest known gaps. |
| P7 | Core platform parity backlog | Reflection/refraction, postprocess composer, material presets, procedural helpers, WebGPU/compute boundaries, docs/examples. | Reusable package APIs, tests, examples, reports, or explicit unsupported status. |
| P8 | Naming and repository taxonomy migration | Remove turn-history `v1..v10` naming from active product taxonomy without breaking routes, reports, exports, fixtures, or docs. | Checked-in migration map, aliases, and alias tests pass before renames. |
| P9 | Cinematic / AI-native tier | Cinematic camera, timeline, render layers, MaterialX/USD strategy, character systems, prompt-to-scene metadata, review workflow. | Implemented as reusable systems with evidence, or kept non-claiming. |
| P10 | Final acceptance | Ten route visual review, report audit, screenshots, run docs, final output. | `pnpm v9:advanced-gallery:review` reports `accepted (10/10 accepted)`. |

## 5. Required Workflow For Every Task

Every task must follow this sequence:

1. Pick a task ID from this PRD.
2. State the exact write set before editing.
3. Inspect the owner files before patching.
4. Make source-owned changes only in the listed files.
5. Add or update focused tests.
6. Run typecheck and the focused tests for that source owner.
7. Run at most one qualified browser capture only if the task changes visible output.
8. Open the generated PNGs only to verify the written expected delta.
9. If the screenshot is still bad, stop capturing and update the defect-to-owner map before making another visual change.

Task classification must be explicit:

- `platform/shared`: reusable renderer, asset, loader, material, environment, controls, capture, review, audit, scene, animation, or physics behavior.
- `route modularization`: route-owned composition or policy moved out of shared app files without claiming new platform capability.
- `art-direction`: camera, composition, density, asset placement, color, backdrop, route styling, or content cleanup. This may improve a route but does not count as platform progress.
- `generated asset/content`: generated GLB/HDR/texture/backdrop content. This is never accepted as a replacement for real authored/reference-quality content unless metadata, runtime reports, and visual review disclose and accept it.

## 6. Phase P0 - Evidence And Regression Guardrails

Purpose: stop false progress. Tooling must make it impossible to claim acceptance from partial captures, stale screenshots, automated metrics, or hidden route hacks.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P0.1 | Required | Screenshot discipline | `execute.md`, `tests/browser/v9-advanced-examples-gallery.spec.ts`, `tools/v9-advanced-gallery-visual-review/index.ts` | Screenshots are verification only after a named source-owner fix. Focused route captures must not look like complete gallery runs. | Typecheck; review output clearly distinguishes partial/focused artifacts from full gallery evidence. |
| P0.2 | Current-branch review required | Visual regression inventory | `tools/v9-advanced-gallery-visual-review/*`, `tests/reports/v9/advanced-examples-gallery/visual-regression-inventory.json` | Historical screenshot inventories may exist, but they are forensic evidence only. Do not use Product/Data inventories, hashes, or recovered labels as active proof. | Review inventory/tool changes through the current-branch source-owner review before preserving. |
| P0.3 | Required | Review gate hardening | `tools/v9-advanced-gallery-visual-review/index.ts`, tests under `tests/unit/tools/*` | Block accepted state for stale hashes, partial route reports, missing direct-review notes, missing known-gaps notes, asset/scaffold dominance, material failure, crop artifacts, bad cadence, or generated-asset overclaim. | Unit tests prove each blocker. |
| P0.4 | Done / Non-Promotional Audit | Report audit hardening | `tools/v9-advanced-gallery-report-audit/index.ts`, tests under `tests/unit/tools/*` | Audit route reports for reusable-system evidence, unsupported disclosures, screenshot hashes, image stats, material/texture evidence, generated-asset disclosure, CPU/GPU mode, performance, and full-gallery evidence mode. | Audit ignores non-route support reports such as `visual-regression-inventory.json`, blocks focused/partial route reports, and does not mark routes accepted. |
| P0.5 | Required | No-regression workflow | `tests/browser/v9-advanced-examples-gallery.spec.ts`, review tool, report audit | Any renderer/material/loader/environment/postprocess/gallery-shell change requires focused tests before one capture and full sweep only after focused gates pass. | Tooling or docs enforce sequence; no repeated screenshot loops. |
| P0.6 | Current-branch review required | Partial report folder blocker | `package.json`, `tools/v9-advanced-gallery-report-audit/index.ts`, `tools/v9-advanced-gallery-visual-review/index.ts`, `tests/browser/v9-advanced-examples-gallery.spec.ts` | Focused route captures must not leave a report folder that audit/review can mistake for complete ten-route evidence. Audit must require exactly the expected ten route JSON reports before full-gallery claims. | Review audit/review/test changes through the current-branch source-owner review before preserving. |
| P0.7 | Required | Route-local hack containment | `apps/v9-advanced-examples-gallery/src/main.ts`, `sceneBuilders.ts`, `authoredLayer.ts`, `galleryRoutePolicies.ts`, Product/Data route modules | Route-specific camera, postprocess, visibility, product policy, and data density logic must move out of shared orchestration. `main.ts` stays renderer/shell orchestration. | Typecheck, route module tests, focused route tests, and no new route-specific `if` branches without PRD owner. |
| P0.8 | Done | Package script accountability | `package.json` | Keep scripts for full gallery capture, review, audit, and pipeline explicit. The audit script must be non-promotional and pipeline must run capture, review, and audit in order. | `package.json` exposes `v9:advanced-gallery:audit` and `v9:advanced-gallery:pipeline`; pipeline runs capture, review, and audit in order. |
| P0.9 | Required | Current-route source-owner map | `execute.md`, route modules, focused tests | Map Product/Data and the remaining eight routes to current branch owner files, visible blockers, first source-owned fixes, focused tests, and allowed visual verification. This is not a stop gate; implementation continues route by route. | Source changes proceed after a named owner task/write set is selected from the current branch. |

P0 acceptance checklist:

- [ ] Current Product/Data and remaining-route blockers are mapped to source owners from the current branch.
- [ ] Review/audit/test changes are kept only if they strengthen anti-false-acceptance behavior.
- [ ] Partial/focused captures cannot be mistaken for full gallery evidence.
- [ ] Product/Data/Reactor visual defects are mapped to source owners before further screenshots.
- [ ] Route-local decisions are in route policy modules, not buried in `main.ts`, `sceneBuilders.ts`, or `authoredLayer.ts`.
- [ ] No Product/Data generated-support, screenshot-hash, metric, or focused-capture history is treated as active proof.

## 7. Phase P1 - Renderer Visual Foundation

Purpose: make renderer output stable, sharp, correctly colored, and reportable before trying to polish routes.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P1.1 | Required | Color pipeline | `packages/rendering/src/Renderer.ts`, `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/RendererVisualPipelineReport.ts`, future `ColorManagement.ts`, tone/exposure files | First-class output color space, linear workflow, sRGB correctness, tone mapping presets, exposure, HDR/LDR target policy, screenshot color consistency. | Unit tests and browser proof that the same scene captures consistently. |
| P1.2 | Required | DPR and backing enforcement | `Renderer.ts`, `RenderDevice.ts`, browser tests, gallery report capture | Canvas backing size, device pixel ratio, screenshot downsample/upscale evidence, no soft/upscaled captures. | Runtime JSON reports DPR/backing/capture size; screenshots are sharp. |
| P1.3 | Required | Presentation state hardening | `ForwardPass.ts`, WebGL2 device/render pipeline files, postprocess path | Scene state must not leak into fullscreen presentation: sampler state, scissor/stencil/polygon offset/color mask, cull/depth/blend, framebuffer flush. | Focused renderer regression tests; product/data background proof does not black out or wash out. |
| P1.4 | Current-branch review required | Frame cadence reporting | `RendererVisualPipelineReport.ts`, gallery capture/report files, `tools/v9-advanced-gallery-visual-review/*` | Separate load timing, render work, RAF cadence, screenshot timing, post-load stable stats. | Review cadence/report changes through the current-branch source-owner review before preserving. Do not use prior focused Product/Data JSON as proof. |
| P1.5 | Required | Visual clarity diagnostics | `packages/rendering/src/postprocess/CinematicDiagnostics.ts`, report audit | Detect washed-out tone, bloom/noise risk, soft detail, weak local contrast, unsupported pass claims. | Unit tests and route reports show clarity warnings without accepting routes. |

P1 acceptance checklist:

- [ ] Renderer exposes/report color space, tone, exposure, HDR/LDR path, DPR, backing size, and screenshot consistency.
- [ ] Current Product/Data failures are not blamed on route composition until renderer clarity is reproved from current branch evidence.
- [ ] No route uses CSS darkness or camera crop to hide renderer visual defects.

## 8. Phase P2 - Asset And Material Activation

Purpose: make GLB assets load, diagnose, bind, and render honestly. Raw GLB loading is not enough.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P2.1 | Required | GLTF extension truth | `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/GLTFExtensionSupport.ts`, `packages/assets/src/AssetInspection.ts` | Bucket extensions as runtime-supported, decoder-required, parsed-with-limits, diagnostic-only, or unsupported. Required unsupported extensions must fail or warn loudly. | `tests/assets/gltf-extension-support.test.ts`; route JSON lists exact support/limits. |
| P2.2 | Current-branch review required | GLTF render-resource metadata | `packages/assets/src/GLTFRenderResources.ts`, `packages/assets/src/index.ts`, tests under `tests/assets/*` | Per-renderable node, geometry, material, source material, primitive, variant, broad texture-backed slots, effective texture contribution, material-fidelity diagnostics, fallback-white counts, missing-material counts, missing-geometry counts. | Review asset/render-resource changes through the current-branch source-owner review before preserving. Do not use prior Product/Data runtime reports as proof. |
| P2.3 | Required | PBR fallback correctness | `packages/rendering/src/PBRMaterial.ts`, `TexturedPBRMaterial.ts`, `PbrReference.ts`, `ShaderChunks.ts`, `ShaderLibrary.ts`, `packages/rendering/src/shaders/pbr-direct.frag.glsl` | Fix clearcoat, specular, iridescence, transmission, glass opacity, normal-map sampler handling, environment specular over-brightening, fallback-white behavior. | Shader/PBR unit tests; Product reference harness screenshot. |
| P2.4 | Current-branch review required | Material override API | `GLTFRenderResources.ts`, gallery product policy files | Product controls must target imported material semantics through metadata, not blind route key scans. | Review Product policy/material-control changes through the current-branch source-owner review before preserving. Do not use prior focused Product JSON as proof. |
| P2.5 | Required | Texture/compression boundary | `GLTFLoader.ts`, decoder files, `KTX2BasisTextureTranscoder.ts`, `GLTFCompressionDecoders.ts`, `AssetInspection.ts` | Draco, Meshopt, KTX2/BasisU, WebP/AVIF, texture transform, mesh quantization, and unsupported decoder boundaries must be explicit. | Loader tests and diagnostics; no generic "loaded" claim hides missing support. |
| P2.6 | Required | EXR boundary | `packages/assets/src/loaders/EXRLoader.ts` or real EXR implementation | Diagnostic-only EXR must not be claimed as production decode. Implement real OpenEXR decode or keep unsupported. | Tests prove either real decode or explicit diagnostic-only status. |

P2 acceptance checklist:

- [ ] Asset/render-resource/material-control changes are tied to a named current-branch source owner before being kept.
- [ ] Material failures are fixed in package code or remain blocked with explicit unsupported status.
- [ ] Route-level paint/glass overrides are not counted as platform material fixes.
- [ ] Product/Data reference harnesses are used only after a named source-owner restart change, and only for the declared proof. They are not gallery acceptance.
- [ ] Prior Product/Data runtime JSON, focused captures, material counts, texture counts, and passed commands are historical failed-loop evidence, not active proof.

## 9. Phase P3 - Environment, Lighting, Grounding, Reflection

Purpose: stop rebuilding visual environments inside each route. G3D needs reusable scene shells and lighting systems.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P3.1 | Required | Environment preset API | `packages/rendering/src/EnvironmentPlatform.ts`, future `EnvironmentPreset.ts`, `packages/environments/*`, gallery environment adapters | One-call presets for studio, outdoor, city, warehouse, deep-space, ocean, and clean-void with lighting/background/ground options. | Preset tests, minimal examples, screenshots, route reports. |
| P3.2 | Required | Cubemap background | `EnvironmentBackgroundPass.ts`, `EnvironmentBackgroundResources.ts`, `Renderer.ts`, `ForwardPass.ts`, `ShaderLibrary.ts` | Six-face cubemap background with camera-correct inverse-view-projection sampling. | Browser pixel proof and Data background-on/off evidence. |
| P3.3 | Required | Equirect background | Same renderer background files plus HDR/RGBE loader path | Panorama background rendering with rotation/intensity/output color controls. | Browser pixel proof and Product background-on/off evidence. |
| P3.4 | Required | Public RGBE/HDR loader | `packages/rendering/src/v6/environment/HDRLoader.ts`, `PBRHDRPipeline.ts`, `packages/rendering/src/index.ts` | Public `loadV6HdrEnvironment(...)` path with real Radiance/RGBE decode, resource creation, disposal, malformed scanline rejection. | HDR loader tests and focused gallery evidence. |
| P3.5 | Required | PMREM roughness proof | PMREM files, `TextureBinding.ts`, `MaterialBinding.ts`, `ForwardPass.ts`, `Material.ts` | Cube-only sampled environment binding exists, but Three.js-class PMREM parity needs roughness-specific visual pixel proof. | Unit tests plus WebGL2/browser material-response proof. |
| P3.6 | Required | Renderer fog | `EnvironmentPlatform.ts`, `Renderer.ts`, `ForwardPass.ts`, shader chunks | Linear, exponential, exponential-squared fog uniforms and fragment blending for PBR paths. | Fog on/off delta evidence for Fog Cathedral/Robotics; no volumetric overclaim. |
| P3.7 | Required | Product studio stage | `EnvironmentPlatform.ts`, `LightingRig.ts`, `LightingDefaults.ts`, shadow/contact helpers | Reusable premium product stage with cove/void option, controlled key/fill/rim/softbox lighting, contact grounding or explicit shadow limitation. No gray slab/crop artifact. | Unit tests and Product reference harness. |
| P3.8 | Required | Lighting/shadow platform | Lighting and shadow files, future `ShadowPass.ts`, `CascadedShadowMaps.ts`, contact helpers | Directional/sun, point, spot, hemisphere, ambient, rectangular area-light or softbox equivalent, contact shadows, shadow quality presets, CSM plan, IES status. | Product/interior/city/warehouse examples use shared presets. |
| P3.9 | Required | Reflection/refraction platform | `ReflectionProbe.ts`, future `ReflectionSurfaces.ts`, `Renderer.ts`, material integration | Planar reflector, reflective floor, refractor/glass helper, cube-camera probe scheduling, SSR unsupported status. | Product/water reports distinguish real/fallback reflection and refraction. |
| P3.10 | Required | Sky/atmosphere/weather boundary | `EnvironmentPlatform.ts`, future sky/atmosphere/weather files | Atmospheric scattering, sky dome, local fog, height fog, volumetric weather, god rays, light shafts are missing unless implemented. | Either real subsystem with tests/screenshots or explicit unsupported status. |

P3 acceptance checklist:

- [ ] Product does not rely on route-only slabs, dark floors, or gray panels.
- [ ] Data deep-space background is route-correct but not used to hide weak geometry.
- [ ] Cubemap/equirect/HDR claims are bounded to implemented renderer background paths.
- [ ] EXR, physical sky, cube camera, SSR, planar reflection/refraction, volumetrics, and full PMREM parity are not claimed until implemented.
- [ ] Product stage/contact-grounding changes are reviewed through current branch evidence before being kept; no prior stage claim is accepted visual quality.

## 10. Phase P4 - Controls, Interaction, Scene Metadata, Animation, Physics

Purpose: make demos easy to replicate through shared runtime systems, not bespoke route code.

| ID | Status | Task | Files To Modify | Required Fix | Tests / Evidence |
| --- | --- | --- | --- | --- | --- |
| P4.1 | Required | Controls platform | `packages/input`, `packages/controls`, gallery adapters | Orbit, map, fly/first-person, pointer-lock, drag, transform gizmo, camera preset helper. | Unit tests and route adoption evidence. |
| P4.2 | Required | Picking/annotations | `packages/controls/src/Picking.ts`, `PickingAnnotations.ts`, `NativeControlTypes.ts`, overlays/labels helpers | Raycast or approximate picking, hover/select/highlight, hotspots, 3D labels, billboards, leader lines, measurement, bounding boxes, minimap/overview. | Product/city/digital-twin reports use shared helpers. |
| P4.3 | Required | Scene metadata and AI contract | future `packages/scene/src/SceneMetadata.ts`, route runtime JSON, report schemas | Scene graph metadata, asset provenance, material assignments, lighting plan, camera plan, animation/timeline plan, deterministic seed, revision notes, unsupported-feature disclosure. | Schema tests and route report evidence. |
| P4.4 | Required | Animation/timeline | `packages/animation`, `GLTFAnimationRuntime.ts`, `SkinnedLitMaterial.ts`, `SkinningBounds.ts`, future `Timeline.ts` | Clip playback, mixer diagnostics, skinned textured materials, clip blending, state, scrub, events, root motion/IK/retargeting unsupported status. | Robotics route proves skeletal motion and timeline diagnostics. |
| P4.5 | Required | Physics/simulation | `packages/physics/*`, physics route files, debug draw | Real rigid bodies, contacts, deterministic reset, constraints/joints/triggers/collision layers/debug where implemented, proxy limitation reporting. | Physics tests and route runtime contact/reset evidence. |
| P4.6 | Required | Capture/reset/stats shell | Gallery shell helpers | Every route gets camera controls, UI controls, performance stats, reset, capture support, loading/error/unsupported states. | Route runtime reports and UI smoke evidence. |

P4 acceptance checklist:

- [ ] Product, City, Digital Twin, and Robotics do not repeat pointer math where shared helpers exist.
- [ ] Route interactions visibly change scene state.
- [ ] Runtime JSON reports interaction state, animation state, reset state, and unsupported boundaries.
- [x] `packages/controls/src/InteractionControls.ts`: adds a reusable controls composition surface for orbit/fly routing, picking, hover/pick events, hotspot-click events, and route-provided root/ray providers.
- [x] `packages/controls/src/index.ts`: exports `InteractionControls` and its public event/options types.
- [x] `packages/controls/package.json`: declares the workspace dependency on `@galileo3d/input` needed by the reusable controls composition layer.
- [x] `tests/unit/controls/interaction-controls.test.ts`: covers orbit/fly input routing, composed picking, hover/pick/hotspot events, route-provided rays/roots, and disposal behavior.
- [x] `pnpm exec vitest run tests/unit/controls/interaction-controls.test.ts tests/unit/controls/picking-contract.test.ts --reporter=dot` passed after adding the controls composition surface.
- [x] `apps/v9-advanced-examples-gallery/src/galleryInteractionAdapter.ts` owns current gallery pointer normalization, product-hotspot pointer routing, and water/ocean ripple routing as an app-level adapter while the core controls platform remains open.
- [x] `apps/v9-advanced-examples-gallery/src/galleryInteractionAdapter.ts`: gallery orbit-drag now delegates through `packages/controls/src/InteractionControls.ts` while preserving the existing yaw/pitch behavior and route clamps.
- [x] `tests/unit/apps/v9-gallery-interaction-adapter.test.ts` covers pointer normalization, orbit drag bounds, product hotspot routing, and water/ocean ripple routing.
- [x] `pnpm exec vitest run tests/unit/apps/v9-gallery-interaction-adapter.test.ts tests/unit/controls/interaction-controls.test.ts tests/unit/controls/picking-contract.test.ts --reporter=dot` passed after wiring the gallery adapter to the core controls facade.

## 11. Existing Platform Work To Preserve

These items are existing platform progress and must not be broken while recovering Product/Data or reorganizing the gallery. They are not final parity claims, but they are reusable value that should be protected by tests and reports.

| Area | Files / Surfaces | Must Preserve | Still Not Claimed |
| --- | --- | --- | --- |
| Transmission/glass fallback diagnostics | `packages/rendering/src/ShaderChunks.ts`, `packages/rendering/src/shaders/pbr-direct.frag.glsl`, `packages/rendering/src/PbrReference.ts`, `packages/assets/src/AssetInspection.ts` | Transmission/refraction fallback diagnostics and CPU/PBR reference alignment. | Full physical glass/refraction parity. |
| GLTF extension truth reporting | `packages/assets/src/GLTFExtensionSupport.ts`, `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/AssetInspection.ts`, `packages/assets/src/loaders/EXRLoader.ts` | Runtime-supported, decoder-required, parsed-with-limits, diagnostic-only, and unsupported buckets. | Real EXR decode unless implemented. |
| GLTF renderable/material metadata | `packages/assets/src/GLTFRenderResources.ts`, `packages/assets/src/index.ts`, `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` | Per-renderable node/material/source-material/primitive/variant metadata and material override target collection. | Full imported triangle picking or complete `KHR_materials_variants` UI parity. |
| Picking/annotation contract | `packages/controls/src/Picking.ts`, `packages/controls/src/PickingAnnotations.ts`, `packages/controls/src/NativeControlTypes.ts` | Approximate picking reports, imported hotspot annotations, district/building proxies, robot/entity proxies, screen-space markers. | Complete imported mesh triangle raycast selection. |
| Renderer visual pipeline reporting | `packages/rendering/src/RendererVisualPipelineReport.ts` | Color/tone/HDR/canvas backing/screenshot/DPR/frame-cadence reporting. | Visual acceptance by itself. |
| Cinematic clarity diagnostics | `packages/rendering/src/postprocess/CinematicDiagnostics.ts` | Washed-out tone, bloom/noise risk, soft detail, unsupported pass claim diagnostics. | Full compositor parity. |
| Renderer postprocess plan | `packages/rendering/src/RendererPostprocessPlan.ts`, `Renderer.ts`, `RenderDevice.ts`, gallery route reports | Active pass names, fused/native/readback mode, missing inputs, renderer-owned pass boundaries, clarity warnings. | EffectComposer parity, LUT/AOV layers, temporal accumulation, full DOF/motion blur. |
| Renderer fog platform | `packages/rendering/src/EnvironmentPlatform.ts`, `ForwardPass.ts`, `Renderer.ts`, shader files, gallery fog evidence | Linear/exponential fog profile math, uniforms, PBR fragment blending, fog on/off evidence. | Volumetric raymarching, shadowed light volumes, weather, god rays. |
| Cubemap/equirect background rendering | `EnvironmentBackgroundPass.ts`, `EnvironmentBackgroundResources.ts`, `ForwardPass.ts`, `Renderer.ts`, `ShaderLibrary.ts`, gallery background evidence | Renderer-owned cubemap/equirect background pass, inverse-view-projection sampling, background-on/off proof. | Dynamic cube cameras, reflection probes, physical sky, EXR. |
| Cube-only sampled environment binding | `TextureBinding.ts`, `Material.ts`, `MaterialBinding.ts`, `ForwardPass.ts` | `textureCube` schema, cube texture validation, PMREM/environment cube binding into PBR shaders. | Three.js PMREM visual parity, SSR, planar reflection/refraction. |
| Public RGBE/HDR loader | `packages/rendering/src/v6/environment/HDRLoader.ts`, `packages/rendering/src/v6/PBRHDRPipeline.ts`, `packages/rendering/src/index.ts` | `loadV6HdrEnvironment(...)`, Radiance/RGBE decode, malformed scanline rejection, renderer-ready resources. | EXR or broad HDR format support. |
| Evidence/report audit | `tools/v9-advanced-gallery-report-audit/index.ts` | Structural audit for reusable evidence, unsupported disclosures, performance, screenshot hashes, image stats. | Acceptance decision. |
| Environment registry/corpus readiness | `packages/environments/src/EnvironmentRegistry.ts`, `HDRIEnvironment.ts`, `EnvironmentPreview.ts`, `v6/V6EnvironmentCorpus.ts`, fixtures manifests | Reusable environment manifests, HDRI diagnostics, probe preview metadata. | Route visual acceptance or full environment parity. |

Preservation checklist:

- [ ] Any change to these files must run the focused tests that originally covered the subsystem.
- [ ] Product/Data recovery must not remove or bypass these systems to make a screenshot look better.
- [ ] If a current platform system causes visible defects, fix the platform system and keep its tests. Do not route-filter it silently.
- [ ] Route reports must keep naming the reusable subsystem consumed and the unsupported boundary.

## 12. File-Level Work Order

This section lists the concrete files that must be created, modified, or promoted. It exists so agents do not drift into route-only hacks.

### 12.1 Core Package Modules To Create Or Promote

| Module / File | Purpose | Required Tasks |
| --- | --- | --- |
| `packages/rendering/src/ColorManagement.ts` | Renderer-owned color workflow. | Add sRGB/linear conversion helpers, display transform policy, screenshot consistency tests. |
| `packages/rendering/src/ToneMapping.ts` | Tone/exposure presets. | Add filmic/ACES-style or documented equivalent presets, exposure controls, renderer report integration. |
| `packages/rendering/src/MaterialPresets.ts` | Shared material library. | Add car paint, glass, chrome, rubber, fabric, concrete, asphalt, water, hologram, debug modes with tests. |
| `packages/rendering/src/EnvironmentPreset.ts` | One-call environment API. | Add studio/outdoor/city/warehouse/deep-space/ocean/clean-void preset shape and route integration. |
| `packages/rendering/src/LightingRig.ts` | Reusable lighting rigs. | Add key/fill/rim, sun, studio, warehouse, neon, softbox equivalents, unsupported IES/GI notes. |
| `packages/rendering/src/ReflectionSurfaces.ts` | Reflection/refraction helpers. | Add planar reflector/floor/refractor helper or explicit unsupported API boundary. |
| `packages/rendering/src/effects/*` | Shared water/particle/weather effects. | Promote Data/Water/Fog helpers out of route code when reused. Track CPU/GPU mode. |
| `packages/scene/src/SceneMetadata.ts` | AI/directable scene contract. | Add asset provenance, material, lighting, camera, animation, timeline, seed, revision, unsupported metadata. |
| `packages/animation/src/Timeline.ts` | Reusable timeline and cinematic playback. | Add tracks, scrub, loop/segment playback, event markers, camera/animation integration. |
| `packages/controls/src/InteractionControls.ts` | Standard controls facade. | Compose orbit/fly/picking/hotspot/selection/camera presets for route authors. |

### 12.2 Gallery App Files To Modify By Ownership

| File | Owns | Allowed Fixes | Not Allowed |
| --- | --- | --- | --- |
| `apps/v9-advanced-examples-gallery/src/main.ts` | Gallery shell, route dispatch, renderer setup, shared capture/runtime reporting. | Wire reusable renderer/environment/control/report systems; keep loading/error/unsupported states. | Route-specific material or asset hacks. |
| `apps/v9-advanced-examples-gallery/src/metadata.ts` | Route status, known gaps, comparison basis, review notes. | Keep failed/candidate/accepted truthful; update known gaps and claims after evidence. | Mark accepted without direct PNG review and hash. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts` | Shared route scene construction until split. | Modularize repeated systems; move route-specific systems into route files. | Bury Product/Data/Reactor hacks in generic builder code. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts` | Generic scene-frame types and primitive helper functions shared by route modules and the dispatcher. | Keep `GalleryState`, `SceneFrame`, `Resources`, `item`, `frame`, `lights`, `env`, and line-batch helpers route-neutral. | Route-specific scene composition, route-specific acceptance shortcuts, or circular imports back into route modules. |
| `apps/v9-advanced-examples-gallery/src/authoredLayer.ts` | Imported asset activation and diagnostics. | Report source/generated status, excluded nodes, material/texture counts, fallback/missing counts. | Hide nodes silently or replace original assets. |
| `apps/v9-advanced-examples-gallery/src/authoredAssets.ts` | Asset catalog truth. | Label source/generated/support assets, limitations, provenance. | Treat generated/no-texture assets as accepted hero proof without review. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts` | Product composition and staging. | Named shots, hero/support hierarchy, deliberate detail assets, route interactions. | Renderer/material/importer fixes. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorPolicy.ts` | Product controls and interaction policy. | Focus/explode/hotspots/variant policy, documented fallbacks. | False imported raycast/variant parity claims. |
| `apps/v9-advanced-examples-gallery/src/productConfiguratorVisualCleanup.ts` | Temporary cleanup policy, if kept. | Only scoped, reported, expiring cleanup. | Permanent hidden-node workaround without platform owner. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyScene.ts` | Data composition. | Focal hierarchy, clusters, background request, camera/framing. | Unrelated prop insertion. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets.ts` | Data density/performance modes. | Curated default and explicit stress modes. | Metric-gaming counts. |
| `apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence.ts` | Data runtime evidence. | CPU/static disclosure, particle/line counts, attractors, `0` GPU dispatches. | GPU compute claims. |
| `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts` | Reactor Post route composition. | Keep base reactor/command-center scene, postprocess-visible systems, labels, and bounded bloom route claims route-owned. | Postprocess implementation hacks, bloom/noise masking, or shared-builder route clutter. |
| `apps/v9-advanced-examples-gallery/src/rendererEnvironmentBackgroundEvidence.ts` | Background proof. | Renderer-owned cubemap/equirect/HDR evidence and screenshot deltas. | Physical sky/reflection/volumetric overclaim. |
| `apps/v9-advanced-examples-gallery/src/rendererEnvironmentFogEvidence.ts` | Fog proof. | Renderer fog evidence and proxy exclusion notes. | Volumetric/god-ray/weather overclaim. |
| `apps/v9-advanced-examples-gallery/src/styles.css` | Gallery shell presentation. | Clean panels, overlays, responsive layout, readable controls. | CSS darkness/blur/noise used to hide render defects. |

### 12.3 Renderer And Visual Platform Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `packages/rendering/src/Renderer.ts` | Renderer API and pipeline orchestration. | Visual pipeline controls, environment background/fog/lighting binding, postprocess plan, reporting hooks. |
| `packages/rendering/src/ForwardPass.ts` | Main scene pass. | PBR uniforms, fog, environment lighting, state isolation, draw diagnostics. |
| `packages/rendering/src/RenderDevice.ts` and WebGL2 device files | Device/canvas state. | DPR/backing, render target formats, presentation state, readback/capture consistency. |
| `packages/rendering/src/ShaderChunks.ts` | Shared shader logic. | PBR lobes, material extension fallback, fog, environment sampling. |
| `packages/rendering/src/ShaderLibrary.ts` | Shader compilation/contracts. | Uniform/schema coverage for PBR, backgrounds, fog, postprocess. |
| `packages/rendering/src/shaders/pbr-direct.frag.glsl` | PBR fragment behavior. | Correct material response, no white fallback artifacts, bounded extension support. |
| `packages/rendering/src/PbrReference.ts` | CPU/reference material behavior. | Match shader fallback behavior in tests. |
| `packages/rendering/src/EnvironmentPlatform.ts` | Reusable environment logic. | Presets, fog math, studio stage, clean void, deep space, ground options. |
| `packages/rendering/src/EnvironmentBackgroundPass.ts` | Background rendering. | Cubemap/equirect camera-correct sampling and color controls. |
| `packages/rendering/src/EnvironmentBackgroundResources.ts` | Background resources. | Resource creation, validation, disposal. |
| `packages/rendering/src/v6/environment/HDRLoader.ts` | Radiance/RGBE decode. | Public loader path, malformed data rejection, diagnostics. |
| `packages/rendering/src/v6/PBRHDRPipeline.ts` | HDR environment resources. | Renderer-ready resources and PMREM/cube outputs. |
| `packages/rendering/src/RendererPostprocessPlan.ts` | Postprocess diagnostics. | Pass list, execution mode, missing inputs, costs, warnings. |
| `packages/rendering/src/postprocess/*` | Postprocess implementations. | Composer path, bloom/AO/DOF/outline/LUT/grain status, before/after evidence. |

### 12.4 Asset, Loader, And Material Activation Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `packages/assets/src/GLTFLoader.ts` | GLTF parse/load path. | Extension support, decoder boundaries, animation/material/camera/light metadata where supported. |
| `packages/assets/src/GLTFRenderResources.ts` | Renderer resource activation. | Bindings, texture-backed slots, material override targets, fallback/missing diagnostics. |
| `packages/assets/src/GLTFExtensionSupport.ts` | Extension matrix. | Supported/limited/unsupported/diagnostic buckets with tests. |
| `packages/assets/src/AssetInspection.ts` | Inspection reports. | Node/material/texture/animation counts, source/provenance, unsupported disclosure. |
| `packages/assets/src/GLTFCompressionDecoders.ts` | Compression decoder boundary. | Draco/Meshopt status and error reporting. |
| `packages/assets/src/KTX2BasisTextureTranscoder.ts` | Compressed texture boundary. | KTX2/BasisU/WebP/AVIF status and failure diagnostics. |
| `packages/assets/src/loaders/EXRLoader.ts` | EXR boundary. | Real decode or diagnostic-only status. |

### 12.5 Controls, Scene, Animation, Physics Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `packages/input/*` | Low-level input. | Pointer, keyboard, gesture state for standard controls. |
| `packages/controls/src/InteractionControls.ts` | Shared interaction composition. | Orbit/fly mode routing, composed picking, hover/pick/hotspot events, route-provided root/ray providers, and conservative disposal behavior. |
| `packages/controls/src/Picking.ts` | Picking contract. | Approximate and future precise picking reports. |
| `packages/controls/src/PickingAnnotations.ts` | Hotspots/annotations. | Shared labels, marker picking, imported asset annotations. |
| `packages/controls/src/NativeControlTypes.ts` | Control typing. | Stable API for route controls. |
| `packages/scene/*` | Scene metadata. | AI/directable scene graph and revision metadata. |
| `packages/animation/*` | Animation runtime. | Clip playback, blending, timeline, events, diagnostics. |
| `packages/physics/*` | Physics runtime. | Rigid bodies, contacts, reset, debug, constraints/limits. |

### 12.6 Test And Tool Files

| File / Surface | Owns | Required Fixes |
| --- | --- | --- |
| `tests/browser/v9-advanced-examples-gallery.spec.ts` | Browser route capture. | Route smoke, focused capture labeling, screenshot/runtime JSON generation, no false full-gallery report. |
| `tests/browser/product-configurator-reference-harness.ts` | Product diagnostic harness. | Fixed-camera original-asset render outside gallery UI. |
| `tests/browser/data-galaxy-reference-harness.ts` | Data diagnostic harness. | Fixed-camera particle/data render outside gallery UI. |
| `tools/v9-advanced-gallery-visual-review/index.ts` | Visual release gate. | Human review metadata, hash checks, blockers, partial-report detection. |
| `tools/v9-advanced-gallery-report-audit/index.ts` | Structural audit. | Reusable evidence, unsupported disclosure, performance, material/texture/generated-asset warnings. |
| `tools/v9-advanced-gallery-assets/generate-product-configurator-studio-blender.py` | Generated Product support/studio GLB. | Manifest provenance, exported GLB counts, zero-texture support-only status, and no original-asset replacement claim. |
| `tools/v9-advanced-gallery-assets/optimize-product-car-blender.py` | Product car derivative optimization. | Manifest provenance, source-car hash/counts, derivative exported counts, and original-hero replacement boundary. |
| `tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py` | Generated Data GLB. | Better source geometry/material/provenance or explicit support-only status. |
| `tools/v9-advanced-gallery-assets/generate-data-galaxy-deep-space-hdr.mjs` | Generated Data HDR. | Deep-space background provenance and non-overclaiming. |
| `package.json` scripts | Public commands. | Rename-aware scripts, gallery/review/audit commands, compatibility during taxonomy migration. |

Package script checklist carried forward:

- [x] `v9:advanced-gallery:audit` runs the structural audit and remains non-promotional.
- [x] `v9:advanced-gallery:pipeline` runs full capture, review, and audit in order.
- [ ] Decide whether the heavy advanced-gallery pipeline belongs in aggregate `pnpm v9`.
- [ ] Keep `test:visual` documented as generic visual baseline, not advanced gallery acceptance.

Generated asset tool instructions:

- Product/Data generated-asset history from the failed loop is not active evidence.
- Generated GLBs must not be used as Product/Data focal hero proof during current-branch recovery.
- Generated HDR/backdrop assets remain route-correct background evidence only; they do not prove physical sky, EXR, dynamic cube camera, or volumetric environment support.
- Generated/cache artifacts such as `__pycache__` must be tied to a named owner task before any cleanup.

## 13. Phase P5 - Current-Branch Visual Recovery

This phase runs directly from the current branch. Product/Data work is active again, but it must proceed through source-owner fixes, focused tests, one qualified visual check per owner change, and continuation to the next route/owner when a PNG still fails.

### P5A. Product Configurator Recovery

The prior Product recovery loop, generated/support asset notes, focused captures, passed commands, source-change summaries, and runtime/report claims are not active proof.

Do not continue from old claims. Inspect the current branch and fix the current source owners.

Active Product work follows `## 1C`:

1. inspect the current Product route and authored asset activation;
2. isolate any reusable renderer/material/importer candidates;
3. prove original `car-concept` material quality outside the gallery route if needed;
4. return to route composition only after material/import proof exists;
5. run one qualified visual check and continue to the next owner if the PNG fails.

### P5B. Data Galaxy Recovery

The prior Data recovery loop, generated/support GLB notes, semantic-role notes, particle budget history, focused captures, passed commands, source-change summaries, and runtime/report claims are not active proof.

Do not continue from old claims. Inspect the current branch and fix the current source owners.

Active Data work follows `## 1D`:

1. stop treating generated/support GLB work as focal proof;
2. identify what actually draws the current hero;
3. prove one coherent reusable data effect outside the gallery route if needed;
4. return to route composition only after the effect has a premium first-glance frame;
5. run one qualified visual check and continue to the next owner if the PNG fails.

### P5C. Reactor Post Recovery

Reference category: Three.js EffectComposer, bloom, UnrealBloomPass, color grading, command-center/effects demos.

Required route identity:

- Animated reactor or command-center focal subject.
- Metallic structures, glass panels, emissive strips, holographic panels, particles/dust, scan lines or energy rings, layered architecture.
- Bloom toggle, color-grade toggle, exposure/vignette controls where supported, camera presets, pause/resume, debug mode, before/after comparison where feasible.

Reactor file-owned checklist:

| File | Fix Required | Done When |
| --- | --- | --- |
| `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts` | Owns Reactor route base scene composition. | Base scene reads clearly before postprocess; route module exposes bounded postprocess labels and claims. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts` | Owns dispatch plus shared legacy route helpers until remaining route splits finish. | Does not contain the Reactor route body. |
| `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts` | Owns generic scene-frame helper/types shared by route modules. | Route modules do not import runtime helper functions back from `sceneBuilders.ts`. |
| `packages/rendering/src/postprocess/*` | Owns postprocess implementation. | Effects are independent where claimed, non-noisy by default, and report pass cost. |
| `packages/rendering/src/RendererPostprocessPlan.ts` | Owns pass diagnostics. | Reports active passes, missing depth/velocity inputs, native/readback mode, clarity warnings. |
| `apps/v9-advanced-examples-gallery/src/metadata.ts` | Owns truth label. | Reactor remains candidate until visual review accepts current hash. |
| `tools/v9-advanced-gallery-visual-review/index.ts` | Owns visual gate. | Blocks bloom/noise hiding weak base geometry. |

Completed Reactor modularization subtasks:

- [x] `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts`: owns the Reactor route scene body instead of `sceneBuilders.ts`.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts`: dispatches `reactor-post` to `buildReactorPostScene(...)` and no longer contains `buildReactor` or `addReactorPurposefulDetailLines`.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts`: owns route-neutral `GalleryState`, `SceneFrame`, `Resources`, `item`, `frame`, `lights`, `env`, `num`, `bool`, `pushSegment`, and `pushLineGroup`.
- [x] Product/Data/Reactor route modules now import generic scene-frame helpers from `sceneBuilderPrimitives.ts` instead of importing runtime helpers back from `sceneBuilders.ts`.
- [x] `tests/unit/apps/v9-route-scene-modules.test.ts`: covers Reactor route-owned composition, bounded bloom default, route labels, and absence of debug-only command wall strips in default mode.
- [x] `pnpm exec vitest run tests/unit/apps/v9-route-scene-modules.test.ts tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-gallery-interaction-adapter.test.ts --reporter=dot` passed with `12` tests.
- [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the primitive-helper extraction.

Reactor acceptance blockers:

- Bloom hiding weak geometry.
- Noisy postprocess or excessive grain.
- Unrelated postprocess disabled when bloom toggles.
- Render-work budget failure.
- No before/after evidence.
- Weak base scene before effects.

### P5D. Partial Report And Route-Hack Recovery

This carries forward the old F-004 and F-005 instructions.

Partial report folder problem:

- A focused Playwright run can leave `tests/reports/v9/advanced-examples-gallery/` containing only a subset of route artifacts.
- Review/audit tooling must not treat that partial folder as full-gallery evidence.
- The audit must require exactly the ten expected route JSON reports before release-state claims.
- Review must clearly report missing route artifacts.
- Audit remains non-promotional; it never marks a route accepted.

Required package/report tasks:

- [x] `package.json`: keep or add `v9:advanced-gallery:audit`.
- [x] `package.json`: keep or add `v9:advanced-gallery:pipeline` that runs capture, review, and audit in order.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts`: fail partial report folders.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts`: require exactly the ten expected route JSON reports.
- [x] `tools/v9-advanced-gallery-report-audit/index.ts`: require current full, viewport, and hero PNG artifacts to exist on disk and match the route JSON hashes before audit evidence counts as current.
- [x] `tools/v9-advanced-gallery-visual-review/index.ts`: report missing/stale route artifacts clearly.
- [x] `tests/browser/v9-advanced-examples-gallery.spec.ts`: label focused route outputs as focused evidence, not full-gallery evidence.

Route-local hack containment problem:

- `main.ts`, `sceneBuilders.ts`, and `authoredLayer.ts` must not become route-specific workaround files.
- Product route logic belongs in Product route modules.
- Data route logic belongs in Data route modules.
- Shared scene-builder code must stay generic.
- `main.ts` must remain orchestration: boot renderer, bind shell events, dispatch route policies, publish runtime evidence.

Required containment tasks:

- [x] `apps/v9-advanced-examples-gallery/src/main.ts`: move remaining Product-specific environment-lighting composition policy out of shell orchestration. Camera, postprocess, visibility, render-item ordering, pointer routing, ripple routing, canvas cap decisions, and Product HDR lighting composition now route through policy helpers.
- [ ] `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts`: keep only shared helpers and route dispatch.
- [ ] `apps/v9-advanced-examples-gallery/src/authoredLayer.ts`: keep imported asset activation generic.
- [x] `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts`: own extracted per-route camera, postprocess, and visibility policies.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilderPrimitives.ts`: own generic route-neutral scene-frame primitives so route modules do not import runtime helpers from the dispatcher.
- [x] Do not add new `if (selectedDemo.id === "...")` branches in `main.ts` unless this PRD is updated with an explicit reason and owner.

Completed containment subtasks:

- [x] `apps/v9-advanced-examples-gallery/src/dataGalaxyScene.ts`: removed runtime imports back from `sceneBuilders.ts` so Data Galaxy route composition no longer creates a scene-builder/data-route circular dependency.
- [x] `apps/v9-advanced-examples-gallery/src/productConfiguratorScene.ts`: consumes generic scene-frame primitives from `sceneBuilderPrimitives.ts` rather than runtime helpers from `sceneBuilders.ts`.
- [x] `apps/v9-advanced-examples-gallery/src/reactorPostScene.ts`: consumes generic scene-frame primitives from `sceneBuilderPrimitives.ts` rather than runtime helpers from `sceneBuilders.ts`.
- [x] `apps/v9-advanced-examples-gallery/src/sceneBuilders.ts`: keeps Product, Data Galaxy, and Reactor route bodies out of the shared dispatcher; remaining legacy route bodies still need follow-up extraction before the broad containment task can be checked.
- [x] `tests/unit/apps/v9-advanced-gallery-route-policies.test.ts`: covers extracted camera, postprocess, and procedural visibility policy behavior.
- [x] `apps/v9-advanced-examples-gallery/src/galleryRoutePolicies.ts`: now also owns render-item ordering, Product hotspot-picking routing, water/ocean ripple routing, and route-specific canvas backing-edge policy.
- [x] `apps/v9-advanced-examples-gallery/src/main.ts`: consumes the route-policy helpers for those orchestration decisions instead of embedding new route-specific branches.
- [x] `apps/v9-advanced-examples-gallery/src/main.ts`: no longer contains Product-specific environment-lighting composition policy; `galleryRoutePolicies.ts` owns `rendererEnvironmentLightingCompositionOptionsForRoute(...)`, and `main.ts` only calls it while composing renderer lighting.
- [ ] `apps/v9-advanced-examples-gallery/src/authoredLayer.ts`: still owns per-route asset activation config, Product layout consumption, Data platform exclusion regex, and Data material corrections. It is not yet generic imported-asset activation only.
- [x] `apps/v9-advanced-examples-gallery/src/galleryInteractionAdapter.ts`: owns current pointer normalization, orbit drag math, Product hotspot action routing, and water/ocean ripple routing outside `main.ts`.
- [x] `pnpm exec vitest run tests/unit/apps/v9-advanced-gallery-route-policies.test.ts tests/unit/apps/v9-route-scene-modules.test.ts --reporter=dot` passed with `11` route-policy/scene-module tests after moving Product HDR lighting composition policy out of `main.ts`.
- [x] `pnpm exec vitest run tests/unit/apps/v9-gallery-interaction-adapter.test.ts --reporter=dot` passed with `2` interaction-adapter tests.
- [x] `tests/unit/tools/v9-advanced-gallery-report-audit.test.ts`: covers JSON-only screenshot hashes being blocked when current full/viewport/hero artifacts are absent, and passing when temp artifacts exist with matching hashes.
- [x] `pnpm exec vitest run tests/unit/tools/v9-advanced-gallery-report-audit.test.ts tests/unit/tools/v9-advanced-gallery-visual-review-gate-rules.test.ts --reporter=dot` passed with `20` reporting/review tests after the current-artifact audit gate.
- [x] `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` passed after the extraction.
- [x] `rg -n "selectedDemo\\.id ===|selectedDemo\\.id !==|selectedDemo\\.id ==|selectedDemo\\.id !=" apps/v9-advanced-examples-gallery/src/main.ts` returns no exact route-specific equality branches.

## 14. Phase P6 - Remaining Route PRDs

Each route below must remain modular, interactive, animated, instrumented, resettable, capturable, and honest about unsupported features.

### 14.1 Digital Twin

Reference category: Three.js CAD viewers, robotics dashboards, industrial digital twins, simulation environments.

Required systems:

- Factory zones, robot arms, mobile robots, conveyors, work cells, crates/packages, safety zones, sensor fields, operator stations, floating labels, status panels, heatmap/quality overlay, timeline playback.

Required animated systems:

- Conveyor motion, robot arm movement, mobile robot pathing, package flow, sensor sweep/status pulses.

Required interactions:

- Inspect robot, toggle sensors, toggle safety zones, toggle heatmap, start/pause, simulation speed, camera presets, select zone, reset.

Owner files:

- `apps/v9-advanced-examples-gallery/src/digital*`
- controls and picking helpers
- scene metadata/report schemas
- physics/simulation helpers
- `metadata.ts`

Acceptance blockers:

- Random shape collection.
- Unreadable enterprise overlays.
- No credible industrial scale.
- Interactions that do not affect scene state.
- Live telemetry/CAD ingestion claims without implementation.

### 14.2 Robotics Lab

Reference category: Three.js animation keyframes, skeletal animation, skinning, and IK demos.

Required systems:

- Animated GLB or documented multi-part robot fallback, at least three animated entities, lab environment, timeline/state machine, labels, lights, skeleton/debug overlay where supported, camera follow/choreography.

Required interactions:

- Play/pause, animation state, timeline scrub where possible, select entity, skeleton/debug toggle, camera follow, reset.

Owner files:

- robotics route files
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/SkinnedLitMaterial.ts`
- `packages/rendering/src/SkinningBounds.ts`
- animation/timeline helpers
- `metadata.ts`

Acceptance blockers:

- Camera/root/target motion counted as character animation.
- White/default skinned materials.
- Ungrounded assets.
- IK parity claims without reliable implementation.
- Retargeting/constraints/root-motion claims without evidence.

### 14.3 Smart City

Reference category: Three.js instancing, performance, city-scale and large-scene examples.

Required systems:

- Hundreds/thousands of styled objects, buildings/districts/roads/bridges, traffic/data pulses, color-coded zones, hover/select overlays, haze, dashboard/minimap where feasible, orbit/flythrough modes.

Required interactions:

- Object-count levels, select/hover district, traffic/data toggle, bounds/wireframe toggle, flythrough, reset.

Owner files:

- smart-city route files
- instancing/batching helpers
- controls/picking helpers
- environment/haze helpers
- `metadata.ts`

Acceptance blockers:

- Benchmark-grid look.
- Authored city claiming instancing proof without scale evidence.
- Poor aerial composition.
- Slideshow cadence.
- No district/entity interaction.

### 14.4 Fog Cathedral

Reference category: Three.js fog, light shafts, atmospheric scenes, cinematic shader scenes.

Required systems:

- Large environment, foreground/midground/background, renderer fog/haze, god-ray approximation, moving beams, dust particles, tall structures, emissive details, animated environment motion, cinematic camera path.

Required interactions:

- Fog density, beam toggle, sun/spotlight angle, camera shots, pause cinematic camera, debug lighting.

Owner files:

- fog route files
- `packages/rendering/src/EnvironmentPlatform.ts`
- renderer fog/shader files
- dust/beam helpers
- camera path helper
- `metadata.ts`

Acceptance blockers:

- Visible crop edges.
- Gray fog box.
- No depth layers.
- False volumetric raymarch claims.
- Weak subject readability.

### 14.5 Physics Playground

Reference category: Three.js Ammo/Rapier/Jolt physics playgrounds and collision demos.

Required systems:

- Many moving objects where stable, stacked boxes, spheres/cylinders/capsules, ramps, conveyor, robotic pusher/gripper, target bins, collision/debug overlay, metrics panel.

Required interactions:

- Spawn objects, drop piles, gravity control, conveyor speed, activate pusher/gripper, debug view, reset, slow motion.

Owner files:

- physics route files
- `packages/physics/*`
- debug draw helpers
- reset/determinism helpers
- `metadata.ts`

Acceptance blockers:

- Pseudo-physics labeled as real physics.
- Primitive/proxy collider limits hidden from review.
- Kinematic-only robot described as articulated dynamics.
- Non-deterministic reset.

### 14.6 Water Lab

Reference category: Three.js GPGPU water, WebGL water, WebGPU water.

Required systems:

- Animated water surface, ripple interaction, floating props, shoreline/dock environment, sky/lighting preset, emissive dock lights, background architecture/terrain, debug wave overlay.

Required interactions:

- Click/touch ripple, drag disturbance, wave intensity, ripple radius, wire/debug wave view, lighting preset, reset.

Owner files:

- water route helpers
- water systems helper
- future `packages/rendering/src/effects/*`
- `EnvironmentPlatform.ts`
- `metadata.ts`

Acceptance blockers:

- Blue-plane look.
- Invisible interaction.
- Native GPGPU/FFT/reflection/refraction claims without implementation.
- Environment that reads only as a water test.

### 14.7 Ocean Observatory

Reference category: Three.js WebGPU water, WebGL ocean, advanced shader scene.

Required systems:

- Large tiled ocean, layered wave motion, reflection highlight, deck/rail/glass props, horizon atmosphere, drones/buoys/vessels, lighting/weather modes, optional bloom/glow.

Required interactions:

- Orbit camera, calm/storm/cinematic modes, wind direction/speed, wave scale, object paths toggle, debug normals/reflections where supported.

Owner files:

- ocean route helpers
- water/ocean helper files
- horizon/atmosphere helpers
- moving path helpers
- `metadata.ts`

Acceptance blockers:

- Visually indistinct from Water Lab.
- Fake SSR/refraction claims.
- Weak horizon/scale.
- No moving systems beyond waves.

### 14.8 Legacy Route Health Blockers

This carries forward the old F-006 instruction. Earlier example routes cannot be used as evidence while blank, low-resolution, slow, static, or materially broken.

Files/directories to inspect and fix:

- `apps/v8-shadowmap-viewer/`
- `apps/v8-geometry-drawrange/`
- `apps/v8-materials-transmission/`
- `apps/v8-webgpu-rtt/`
- `apps/v8-webgpu-materials/`
- `apps/v8-webgpu-instance-uniform/`
- `apps/v8-webgpu-compute/`
- `apps/v8-webxr-interactions/`
- `apps/v8-postprocessing-bloom/`
- `apps/v8-postprocessing-depth-outline/`
- `apps/v8-loader-obj/`
- `apps/v8-loader-gltf-variants/`
- `apps/v8-loader-material-extensions/`
- `apps/wow-kira-ik-room/`
- `apps/wow-common/`

Required checklist:

- [ ] Do not present these routes as fixed until screenshots prove they are fixed.
- [ ] Add route health smoke/screenshots for blank route detection.
- [ ] Enforce DPR/backing-size checks.
- [ ] Enforce animation/motion checks where the route implies animation.
- [ ] Fix Kira white/default material issues through GLTF/material/skinned path if still present.
- [ ] Fix Kira static/slow load issues before it is shown as a WOW route.
- [ ] If a route relies on unsupported WebGPU/WebXR capability, disclose the fallback or keep it non-claiming.

Exit gates:

- [ ] Focused browser screenshot for each affected route.
- [ ] Console/page errors clear or explicitly documented.
- [ ] Motion and DPR evidence present where applicable.

## 15. Phase P7 - Core Platform Capability Backlog

These are required for G3D to scale beyond ten examples.

| ID | Platform Lane | Required Capability | Files / Surfaces | Acceptance Evidence |
| --- | --- | --- | --- | --- |
| C1 | Renderer visual pipeline | Output color space, sRGB, linear workflow, tone mapping, exposure, HDR targets, DPR/backing, screenshot consistency. | `packages/rendering/src/Renderer.ts`, `ForwardPass.ts`, `RenderDevice.ts`, `RendererVisualPipelineReport.ts`, tone/color files. | Renderer tests, browser proof, route reports. |
| C2 | Lighting/shadow system | Sun, point, spot, hemisphere, ambient, softbox/area equivalent, contact shadows, shadow presets, CSM, light probes/SH, IES status. | Lighting and shadow files, environment presets. | Product/interior/city/warehouse evidence. |
| C3 | Reflection/refraction surfaces | Planar mirror, refractor/glass helper, water reflection/refraction helper, cube-camera probes, reflective floor, SSR status. | `ReflectionProbe.ts`, future `ReflectionSurfaces.ts`, renderer/material integration. | Product/water reports distinguish real/fallback modes. |
| C4 | Asset and texture parity | GLTF extension audit, KHR variants, clearcoat, transmission, volume, IOR, specular, iridescence, emissive strength, texture transform, quantization, Draco, Meshopt, KTX2/BasisU, WebP/AVIF, HDR/EXR/RGBE. | `packages/assets/*`, texture/decoder/transcoder files. | Loader diagnostics and material screenshots. |
| C5 | Controls and interaction | Orbit, map, fly, pointer-lock, drag, transform gizmo, raycast picking, hover/select/highlight, camera presets, object inspection. | `packages/input`, `packages/controls`. | Product/city/digital-twin adoption. |
| C5a | Interaction composition | Reusable route-facing controls facade over existing input, orbit/fly controls, picking, hover, pick, and hotspot events. | `packages/controls/src/InteractionControls.ts`, `packages/controls/src/index.ts`, `tests/unit/controls/interaction-controls.test.ts`. | Core API and tests exist; gallery routes still need adoption before C5 is complete. |
| C6 | Postprocess composer | Render pass, output pass, bloom, FXAA/SMAA/TAA status, SSAO/SAO/GTAO status, DOF, outline, vignette, LUT, grain, god rays, before/after, per-pass timing. | `packages/rendering/src/postprocess/*`, `PostProcessPass.ts`, `RendererPostprocessPlan.ts`. | Reactor route and focused pass tests. |
| C7 | Environment preset API | Studio, outdoor, city, warehouse, deep-space, ocean, clean-void presets with lighting/background/ground options. | `EnvironmentPlatform.ts`, future `EnvironmentPreset.ts`, docs/examples. | Preset screenshot gallery and route use. |
| C8 | Camera/cinematic system | Orbit, flythrough, path camera, spline/path authoring, shake, focus target, dolly/zoom, screenshot shot registry, named shots. | controls/camera helpers, scene metadata. | Accepted screenshots generated from named shots. |
| C9 | Scene annotations/UI overlays | 3D labels, billboards, sprites, hotspots, leader lines, rulers, bounding boxes, outlines, minimap, telemetry panels, HTML/CSS overlay bridge. | controls/overlay helpers, gallery shell. | Product/CAD/robotics/smart-city/digital-twin use shared overlays. |
| C10 | Geometry/procedural helpers | Terrain, roads, buildings, pipes/rails/cables, scatter/vegetation, instanced prop scatter, curve/tube/path, LOD, impostors, batching/instancing authoring. | future geometry/procedural packages, route helpers. | Large scenes generated through helpers, not hand-placed noise. |
| C11 | Advanced material library | Plastic, brushed metal, car paint, glass, frosted glass, water, emissive neon, hologram, rubber, fabric, concrete, asphalt, chrome, ceramic, translucent volume, debug modes. | material preset files, shader/PBR tests. | Material ball/gallery under studio/outdoor/night lighting. |
| C12 | WebGPU/compute boundary | WebGPU renderer path, compute particles, GPU water/FFT or unsupported, GPU instancing stress, storage/compute buffers, WebGL fallback, CPU-vs-GPU telemetry. | `packages/rendering/src/webgpu/*`, effects/water files. | Runtime telemetry proves GPU mode before parity claims. |
| C12a | Particle diagnostics and CPU/GPU boundary | Layered particle budgets, batch diagnostics, static/dynamic byte estimates, GPU backend support state, and non-compute warnings. | `packages/rendering/src/effects/ParticleDiagnostics.ts`, `tests/unit/rendering/particle-diagnostics.test.ts`, Data Galaxy budget consumption. | Package tests pass and Data reports CPU/static/`0` GPU dispatches from package-backed diagnostics; native GPU particle parity remains unclaimed. |
| C13 | Volumetric/atmosphere stack | Linear fog, exponential fog, height fog, local fog volume, dust, light shafts, god rays, clouds, sky/atmosphere, weather presets. | environment/fog/atmosphere/effects files. | Fog/weather screenshots show depth without card/crop artifacts. |
| C14 | Physics beyond rigid bodies | Constraints, joints, hinge/slider, ragdoll/articulated demo, vehicle/controller, character controller, raycast vehicle/wheel approximation, triggers, physics picking/dragging, collision layers, debug draw. | `packages/physics/*`, route bridges. | Physics playground proves real interaction and disclosed limits. |
| C15 | Documentation/examples surface | Minimal example per environment preset, starter per advanced demo, copy-paste helper snippets, asset requirements, unsupported notes, searchable gallery, screenshot gallery, stable API names. | `README.md`, docs, examples, gallery docs. | Developer can reproduce systems without reading advanced internals. |

Top implementation priority:

1. Renderer visual pipeline.
2. Lighting/shadow system.
3. Asset/texture loader parity.
4. Controls/picking layer.
5. Postprocessing composer.
6. Environment preset API.
7. Reflection/refraction helpers.
8. Material preset library.
9. Procedural scene helpers.
10. Docs/examples layer.

## 16. Environment Capability Matrix

Do not imply Three.js-class environment parity unless a reusable renderer/runtime subsystem exists and is covered by tests/screenshots.

| Capability | Current / Required Status | Required Before Accepted Claim |
| --- | --- | --- |
| Cubemap renderer | Renderer path and focused proof exist. | Keep bounded to static cubemap background until dynamic cube camera/probes exist. |
| Equirectangular projection | Renderer path and focused proof exist. | Keep bounded to panorama background until physical sky/reflection probes exist. |
| PMREM roughness IBL | Binding exists; visual parity still bounded. | Add roughness-specific material-response pixel proof before Three.js PMREM parity claim. |
| RGBE `.hdr` parser | Public V6 Radiance/RGBE path exists. | Keep EXR/broad HDR claims out unless implemented. |
| EXR parser | Missing/diagnostic-only. | Implement real EXR decode or document unsupported. |
| Atmospheric scattering shader | Missing. | Implement Rayleigh/Mie-style sky shader or keep unsupported. |
| Analytical studio box | Not production-grade. | Promote product studio to reusable cove/softbox helper with tests. |
| Linear/exponential fog | Renderer path exists. | Keep volumetric/god-ray/weather claims out until implemented. |
| Cube camera/live reflections | Missing. | Implement six-direction scene capture and reflective material binding. |
| Dynamic ocean plane | Helper approximation. | Promote water/ocean subsystem and add reflection/refraction/normal/foam or keep CPU/Gerstner scope. |
| Procedural sky dome | Missing. | Add reusable infinite sky dome with sun/moon/horizon controls. |
| Volumetric weather enclosure | Missing/diagnostic only. | Implement real weather/volumetric system or keep proxy limits explicit. |
| Infinite ground grid | Not production-grade. | Add reusable grid/catch-plane helper with scale/fade/shadow controls. |
| Indoor studio stage | Not production-grade. | Create reusable indoor studio preset with softboxes/cove/floor/shadow/reflection behavior. |
| Outdoor nature backdrop | Missing as preset. | Add outdoor preset with sky, terrain/backdrop palette, natural lighting. |
| Urban city shell | Missing as preset. | Add urban/neon shell separate from Smart City content. |
| Industrial warehouse void | Missing as preset. | Add warehouse lighting/backdrop shell with windows, concrete/floor response, overhead bulbs. |
| Deep space box | Background proof only. | Add cube/sphere deep-space environment or keep non-claiming. |
| Clean void backdrop | Not production-grade. | Add clean void/infinity wall preset with floor/cove/lighting options. |

## 17. Phase P8 - Repository Naming And Product Taxonomy Migration

The codebase contains many version-turn names such as `v1`, `v2`, `v3`, `v4`, `v5`, `v6`, `v7`, `v8`, `v9`, and `v10`. Those names are historical breadcrumbs, not product taxonomy.

This migration is required, but it must not be a blind rename. Many versioned paths are load-bearing: package export maps, TypeScript imports, app route URLs, fixture fetch URLs, Playwright report paths, screenshot hashes, generated JSON reports, docs links, and historical report readers.

Required phases:

1. Inventory all version-style names in:
   - `apps/**`
   - `packages/**`
   - `tests/**`
   - `fixtures/**`
   - `docs/**`
   - `tools/**`
   - `tests/reports/**`
   - root/package export maps
   - route registries
   - README and docs links
2. Classify every hit:
   - public API or package export
   - browser route or example URL
   - fixture/data path
   - generated report/screenshot artifact
   - internal source module
   - test-only harness
   - historical archive that should remain versioned but be marked archival
3. Define contextual target names before renaming:
   - `v9-advanced-examples-gallery` -> `advanced-examples-gallery` or `cinematic-examples-gallery`
   - `v6/environment` -> `hdr-environment` or `environment-lighting`
   - `v8-animation-*` -> capability-based animation names
   - `v10/superiority-audit` -> `claim-defense-audit` or `release-claim-audit`
4. Add compatibility shims where old paths may still be referenced:
   - route redirects or index aliases
   - package export aliases with deprecation comments
   - fixture path aliases or manifest redirects
   - report-reader compatibility for historical artifacts
5. Rename in small batches with focused verification.
6. Update docs, README, route registry, package scripts, tests, report tools, screenshots, and generated JSON references in the same batch.
7. Run after each batch:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
```

plus affected unit tests, affected browser route tests, and the renamed successor to the advanced gallery review/audit commands.

Naming acceptance checklist:

- [ ] A checked-in migration report lists every old version-style path and target contextual name or archival reason.
- [ ] All active imports, route links, package exports, scripts, fixture URLs, and report readers use contextual names.
- [ ] Old public URLs or package exports still work through aliases/redirects or are intentionally documented as removed.
- [ ] Generated evidence paths do not break visual-review/report-audit tooling.
- [ ] Alias tests cover browser routes, package exports, fixture URLs, and historical report readers before old names are removed.
- [ ] `rg "v[0-9]"` only finds classified active aliases or archival records.

Completed naming/taxonomy subtasks:

- [x] `docs/project/naming-taxonomy-migration-inventory.md`: created the checked-in migration inventory starter with scan commands, first-pass counts by root, classification rules, proposed target taxonomy, compatibility requirements, and a no-rename decision while Product/Data remain failed.
- [x] Initial inventory command found `1978` version-style file paths under scoped roots on 2026-05-20; broad renaming remains blocked until every touched path is classified and aliases/tests exist.

## 18. Phase P9 - Cinematic / Animation-Studio Tier

The current advanced gallery target is Three.js-class web 3D parity. A higher tier is required before G3D can credibly claim movie-like, animation-studio-grade, AI-directed graphics.

Do not claim Pixar, feature-film, RenderMan, or offline-renderer parity unless the engine has explicit evidence for the relevant capability. The near-term acceptable claim is cinematic real-time/previsualization quality: AI-directed scenes with premium lighting, materials, camera language, animation, layout, and compositing that can be generated, inspected, revised, and rendered interactively in G3D.

Required cinematic platform lanes:

| Lane | Owns | Required Evidence |
| --- | --- | --- |
| Color pipeline and tone mapping | Linear workflow, sRGB correctness, HDR render targets, exposure, filmic tone mapping, display transforms, screenshot consistency. | Same scene produces stable, non-washed-out screenshots across browser capture, gallery capture, and runtime viewer. |
| Cinematic lighting toolkit | Key/fill/rim lights, area lights, softboxes, gobos/cookies, IES profiles, practical lights, contact shadows, cascaded shadows, light-linking or documented limit. | Portrait/product/interior shots show controlled cinematic lighting. |
| Look-development material system | Skin, cloth, hair/fur, eyes, glass, metal, plastic, ceramic, concrete, asphalt, water, smoke, hologram, emissive neon, car paint. | Material ball and production-shot galleries prove each material under studio, outdoor, and night lighting. |
| Material graph and interchange | Node material authoring, reusable material graphs, MaterialX/USDShade import or unsupported status, texture transform, layered materials. | Material graphs survive round-trip into G3D without becoming flat/default materials. |
| Character system | Rig import, skeletal animation, blend shapes, facial controls, state machines, retargeting, root motion, events, clip blending. | Character route proves facial expression, body motion, clip blending, and timeline scrubbing. |
| Hair/fur/cloth/soft-body | Groom cards/strands, fur fallback, cloth constraints, fabric/wind, collision awareness, simulation cache or unsupported status. | Character/creature shot shows secondary motion with limits labeled. |
| Particle and effects | Sparks, embers, dust, smoke, rain, snow, magic trails, energy arcs, debris, volumetric-looking particles, collisions, GPU/CPU telemetry. | FX route shows layered effects that interact with lighting/camera. |
| Volumetric atmosphere | Height fog, local fog volumes, god rays, shafts, mist, smoke, clouds, weather presets, density controls. | Fog/weather shots show depth and lighting hierarchy without card/crop artifacts. |
| Cinematic camera system | Shot registry, lenses, focal length/FOV presets, DOF, focus pulls, dolly/track/orbit/crane, handheld, motion blur status. | Every cinematic route has named shots and replayable camera moves. |
| Layout and set dressing | Blocking, scatter, terrain/stage shells, foreground/midground/background, scale references, focal helpers, safe-frame overlays. | Routes read as staged compositions, not object dumps. |
| Timeline and sequencing | Keyframe timeline, shot tracks, camera tracks, animation tracks, event tracks, audio markers, loop/segment playback, metadata export. | Multi-shot sequence can play, pause, scrub, and regenerate from metadata. |
| Postproduction stack | Bloom, AO, DOF, motion blur, LUTs, vignette, film grain, chromatic aberration controls, outline/selective masks, pass telemetry. | Postprocess improves strong base scenes and does not hide missing work. |
| Render layers/AOV-like passes | Beauty/depth/normal/ID/emissive/mask passes, object/material IDs, alpha, multilayer capture. | Review report stores pass captures and proves object/material inspection. |
| Shadows/GI approximation | Contact shadows, soft shadows, screen-space/baked GI approximation, AO, reflection probes, irradiance probes, lightmap status. | Interior/character shots show grounding and bounce-light approximation. |
| Production asset pipeline | OpenUSD/USDZ strategy, glTF extension coverage, texture compression, HDR/EXR, Alembic/cache status. | Production-style scene imports hierarchy, materials, animation, cameras, lights, and metadata. |
| AI prompt-to-scene compiler | Prompt planning, shot breakdown, asset search/generation hooks, scene graph construction, material assignment, camera/lighting choice, revision loop, deterministic seed. | Same prompt regenerates same scene and revisions target specific nodes. |
| AI art-direction controls | Style bible, palette, lighting references, lens language, composition constraints, character/action constraints, negative constraints, quality gates. | Generated routes explain art-direction metadata and revisions. |
| Asset library/tagging | Props, environments, characters, materials, rigs, FX, HDRIs, cameras, lighting rigs, metadata tags, licensing/provenance. | Prompted scenes reuse approved assets instead of unsupported invented assets. |
| Collaboration model | Non-destructive layers, overrides, variants, shot versions, review notes, approvals, locked assets, diffable scenes. | Reviewers compare versions and promote shots without rewriting the base scene. |
| Video/sequence export | Frame stepping, deterministic capture, alpha/depth/mask export, MP4/WebM, image sequence, contact sheet. | Gallery exports accepted multi-shot sequence, not only stills. |
| Performance/LOD | LODs, impostors, texture streaming, budgets, frame telemetry, progressive loading, memory reporting. | Cinematic routes remain interactive with honest tradeoff reporting. |

Cinematic acceptance rule:

- A route may be called cinematic only when it proves art direction, lighting, material response, animation, camera language, effects, and postproduction together.
- Complex geometry with flat lighting is not cinematic.
- Bloom over weak materials is not cinematic.
- A good still frame without timeline, animation, or camera language is not animation-studio-grade.

AI-directed cinematic acceptance rule:

- Prompt output includes scene graph metadata.
- Prompt output includes asset provenance or generated-asset status.
- Prompt output includes material assignments.
- Prompt output includes lighting plan.
- Prompt output includes camera/shot plan.
- Prompt output includes animation/timeline plan.
- Prompt output includes unsupported-feature disclosure.
- Prompt output includes deterministic seed or reproducible generation metadata.
- Prompt output includes screenshots or video evidence.
- Prompt output includes review notes and acceptance state.

## 19. Parallel Execution Lanes

Parallel work is allowed only with disjoint write sets. Workers must not edit outside their lane. If a fix crosses lanes, stop and document the dependency.

### Lane 1: Renderer Visual Foundation

Owns:

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/RendererVisualPipelineReport.ts`
- tone/color/HDR files
- presentation-state tests

Must deliver:

- Color/HDR/tone/DPR/capture consistency.
- Visual clarity diagnostics.
- Focused renderer tests.

### Lane 2: Asset And Material Activation

Owns:

- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/GLTFExtensionSupport.ts`
- `packages/assets/src/AssetInspection.ts`
- decoder/transcoder files
- PBR material/shader files where coordinated with Lane 1

Must deliver:

- GLTF extension truth.
- Material/texture diagnostics.
- Product same-asset reference harness.
- PBR fallback corrections with tests.

### Lane 3: Environment, Lighting, Reflection

Owns:

- `packages/rendering/src/EnvironmentPlatform.ts`
- `EnvironmentBackgroundPass.ts`
- `EnvironmentBackgroundResources.ts`
- HDR/RGBE/PMREM files
- lighting rig/default/shadow/contact files
- reflection/refraction helper files

Must deliver:

- Reusable product studio preset.
- Environment preset API foundation.
- Bounded cubemap/equirect/HDR/PMREM/fog evidence.
- Explicit reflection/refraction unsupported boundaries.

### Lane 4: Controls, Scene Metadata, Animation, Physics

Owns:

- `packages/input`
- `packages/controls`
- future `packages/scene`
- `packages/animation`
- `packages/physics`
- route adapters for picking/labels/metadata/timeline/simulation

Must deliver:

- Shared controls/picking/annotations.
- Scene metadata contract.
- Animation/timeline diagnostics.
- Physics/debug/reset evidence.

### Lane 5: Gallery Route Recovery

Owns:

- Product route files listed in P5A.
- Data route files listed in P5B.
- Reactor route files listed in P5C.
- Remaining route files listed in Phase P6.

Must deliver:

- Route composition after platform blockers are fixed or explicitly unsupported.
- No random replacements.
- No hidden exclusions without reports.
- Current screenshots only after source-owned fixes and focused tests.

### Lane 6: Reporting, Naming, Docs, Evidence

Owns:

- `tools/v9-advanced-gallery-visual-review/index.ts`
- `tools/v9-advanced-gallery-report-audit/index.ts`
- browser capture specs
- report schemas
- naming migration scripts/reports
- README/docs/examples

Must deliver:

- False-acceptance blockers.
- Partial-report detection.
- Naming migration inventory and aliases.
- Minimal reproducible examples and docs.

## 20. Verification Commands

Use the smallest command that proves the changed source owner. Do not jump to full screenshots first.

Baseline typecheck:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
```

Renderer/material focused tests:

```bash
pnpm exec vitest run tests/unit/rendering/shader-library.test.ts tests/unit/rendering/pbr-reference.test.ts --reporter=dot
```

Asset/GLTF focused tests:

```bash
pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/gltf-inspection.test.ts --reporter=dot
pnpm exec vitest run tests/assets/gltf-extension-support.test.ts --reporter=dot
```

Environment focused tests:

```bash
pnpm exec vitest run tests/unit/rendering/environment-platform.test.ts --reporter=dot
```

Product/Data focused route capture, only after source-owner tests pass:

```bash
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/v9-advanced-examples-gallery.spec.ts -g "(product-configurator|data-galaxy) renders as a complex animated G3D demo" --reporter=line --timeout=360000
```

Full gallery sweep, only after focused gates pass:

```bash
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery
pnpm v9:advanced-gallery:review
```

Report audit:

```bash
pnpm v9:advanced-gallery:review
node tools/v9-advanced-gallery-report-audit/index.ts
```

Preferred report audit and pipeline commands when scripts exist:

```bash
pnpm v9:advanced-gallery:audit
pnpm v9:advanced-gallery:pipeline
```

Renderer-focused gates after renderer edits:

```bash
pnpm exec vitest run tests/unit/rendering/renderer.test.ts tests/unit/rendering/render-state-leaks.test.ts tests/unit/rendering/renderer-postprocess-plan.test.ts
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/rendering-root-quality-gate.spec.ts --reporter=line
```

Asset-focused gates after loader/material edits:

```bash
pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/gltf-extension-support.test.ts tests/assets/gltf-compression-decoders.test.ts tests/assets/gltf-inspection.test.ts
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/asset-texture-browser.spec.ts tests/browser/asset-material-fidelity.spec.ts --reporter=line
```

Final release-candidate gates, only when every route has accepted evidence:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
G3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm v9:advanced-gallery
pnpm v9:advanced-gallery:review
pnpm v9:advanced-gallery:audit
pnpm v10
```

Current state inspection:

```bash
node -e 'const r=require("./tests/reports/v9/advanced-examples-gallery/visual-review-report.json"); const s=r.summary; console.log(JSON.stringify({pass:r.pass,releaseGate:r.releaseGate,summary:{demoCount:s.demoCount,acceptedCount:s.acceptedCount,candidateCount:s.candidateCount,failedCount:s.failedCount,blockedCount:s.blockedCount,contactSheetExists:s.contactSheetExists,imageQualityPassingCount:s.imageQualityPassingCount,knownVisualArtifactRiskCount:s.knownVisualArtifactRiskCount}},null,2))'
```

Expected until final acceptance:

```json
{
  "pass": false,
  "releaseGate": "blocked",
  "summary": {
    "demoCount": 10,
    "acceptedCount": 0,
    "blockedCount": 10
  }
}
```

Final success requires:

```text
Release gate: accepted (10/10 accepted)
```

## 21. Screenshot Policy

Screenshots may be generated only after the task has a named source owner and focused tests have passed.

Before capture, write down:

- the source owner file
- the expected visual delta
- the focused tests that passed
- the exact screenshot question being answered
- the previous defect mapped to source owner

After capture, open and inspect:

- full-page PNG
- hero PNG
- viewport PNG
- background-on/off PNG if environment changed
- runtime JSON
- contact sheet only after full sweep

Do not run another screenshot if the result is still bad. Return to source inspection.

## 22. Acceptance Definition

A route is accepted only when all gates pass:

- It loads without page errors or unhandled console errors.
- It uses real G3D APIs, reusable helper layers, or explicitly documented approximations.
- It has current full-page, hero, viewport-only, and contact-sheet screenshot evidence.
- It has current runtime JSON with load timing, render size, draw/object counts, motion samples, and post-load performance stats.
- It animates visibly after assets load.
- It has at least three meaningful interactions that visibly change the scene.
- It has at least five meaningful visible systems in the accepted screenshot.
- It has foreground, midground, background, focal point, lighting hierarchy, material contrast, readable silhouettes, and visible depth/scale.
- It avoids debug-only composition, placeholder geometry, noisy output, stretched canvas, low backing resolution, crop artifacts, and obvious material failures.
- It has accepted metadata with screenshot path, lowercase SHA-256, reviewer, ISO timestamp, detailed notes, and named Three.js-style comparison basis.
- `pnpm v9:advanced-gallery:review` accepts the route.

Acceptance states:

- `failed`: technical or visual blockers remain.
- `candidate`: route works and has useful evidence, but is not Three.js-quality.
- `accepted`: route passes automated gates, screenshot hash verification, and direct visual review of current PNGs.
- `hero`: accepted and strong enough to lead the gallery.

Do not skip from failed to accepted. A failed route must first become a candidate with clear evidence, then accepted after visual review.

## 23. Final Completion Output Requirements

Do not provide a completion answer until the objective is actually complete. Final output must include:

1. Files created or modified.
2. How to run the gallery.
3. How to run each demo.
4. What works.
5. What is approximated.
6. What G3D currently cannot support.
7. Comparison table against Three.js-style references.
8. Performance observations.
9. Screenshot/report paths.
10. Final gate output.

The final gallery succeeds only when current code, current screenshots, current runtime reports, current documentation, and current visual review all prove the accepted claim.
