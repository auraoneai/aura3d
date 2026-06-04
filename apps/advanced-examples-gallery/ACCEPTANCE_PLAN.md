# Advanced Examples Gallery 10/10 Acceptance Plan

This is the operating contract for keeping the low-level renderer code parity advanced examples gallery at accepted showcase quality. It is intentionally stricter than route smoke tests.

A route is not accepted because it runs, has many objects, or has a good title. A route is accepted only when the current screenshot, runtime telemetry, source implementation, review metadata, and human visual review prove that it belongs beside the named advanced low-level renderer code-style category.

## Acceptance Claim Requirements

The gallery can be described as accepted only when all of these are true for the same generated report set:

- Full advanced-gallery route runtime/screenshot coverage passes for all ten routes.
- `pnpm advanced-gallery:review` reports `Release gate: accepted (10/10 accepted)`.
- Current accepted demo count is `10/10`.
- `pnpm advanced-gallery:audit` passes with zero blockers and zero warnings.
- `tests/reports/advanced-examples-gallery/current-contact-sheet.png` exists and is current accepted evidence only while its route screenshots, hashes, runtime JSON, review report, and report audit remain current.

After running `pnpm advanced-gallery:pipeline`, inspect the generated review summary:

```bash
node -e 'const fs=require("fs"); const p="./tests/reports/advanced-examples-gallery/visual-review-report.json"; if(!fs.existsSync(p)) throw new Error(`${p} is missing; run pnpm advanced-gallery:pipeline first`); const r=require(p); const s=r.summary; console.log(JSON.stringify({pass:r.pass,releaseGate:r.releaseGate,summary:{demoCount:s.demoCount,acceptedCount:s.acceptedCount,candidateCount:s.candidateCount,failedCount:s.failedCount,blockedCount:s.blockedCount,contactSheetExists:s.contactSheetExists}},null,2))'
```

If a generated report changes to accepted without all ten routes meeting the gates below, the review process has been weakened and must be fixed.

## Non-Negotiable Acceptance Gates

Every demo must pass every gate before its `visualReview.status` can become `accepted`.

| Gate | Required Evidence | Failure Mode |
| --- | --- | --- |
| Real A3D implementation | Route uses real exported A3D APIs, reusable local helpers, or documented approximations visible in source. | Fake API, static screenshot, or marketing-only feature claim. |
| Current screenshot set | Full UI, hero crop, viewport-only crop, and gallery contact sheet from current route code. | Old screenshot, missing screenshot, stale contact sheet, or screenshot that does not match current code. |
| Screenshot hash lock | Accepted metadata includes lowercase SHA-256 for the exact accepted screenshot. | Hash missing, invalid, stale, or points to another file. |
| Human review metadata | `reviewedBy`, `reviewedAt`, detailed notes, and named comparison basis tied to exact artifact. | Smoke/runtime pass used as visual acceptance. |
| Composition | Foreground, midground, background, focal point, lighting hierarchy, material contrast, readable silhouette. | Debug board, flat grid, single object, noisy clutter, crop artifacts, or unreadable subject. |
| Visual systems | At least five meaningful visible systems in the screenshot. | Count padded by labels, invisible helpers, telemetry-only systems, or trivial duplicates. |
| Interactions | At least three meaningful controls visibly change scene state. | UI controls are cosmetic, disconnected, or only change text. |
| Animation | Motion is visible and stable after asset load. | Static route, slideshow cadence, or animation hidden outside accepted camera. |
| Performance | Runtime JSON reports stable post-load stats, draw calls, object counts, render size, load timing, and motion samples. | Stats missing, polluted by asset rebuild/load work, or too slow for demonstration. |
| low-level renderer code comparison | Metadata/README name comparable low-level renderer code-style category and explain current delta. | Generic "wow" or parity claim without reference basis. |

## Showcase Capability Map

This table summarizes what the gallery demonstrates and how each area should be presented in launch material.

| Area | Launch Capability | Demo Role |
| --- | --- | --- |
| Rendering | A3D render items, geometry, materials, lights, depth, transparency, readback, and diagnostics. | Every route should show visible lighting hierarchy, material contrast, and screenshot-ready composition. |
| WebGPU | Root WebGPU routes exist for triangle, render target, PBR asset, product viewer, instancing, and compute particles. | Use WebGPU examples to show modern GPU-backed browser 3D workflows. |
| PBR/materials | PBR-style materials, emissive surfaces, metallic/roughness controls, loader material paths, and route material presets. | Product, reactor, fog, water, and configurator routes should make materials visible immediately. |
| GLB/glTF loading | Authored GLB fixtures and browser loading are active in multiple routes. | Product, robotics, city, and cathedral routes should show imported assets as inspectable scene content. |
| Animation | Animation mixer/clip playback plus deterministic prop, camera, and overlay motion. | Routes should feel alive after load and expose visible motion in screenshots. |
| Instancing/scale | Instancing, batching, procedural districts, traffic overlays, and stress toggles. | Smart city and data routes should communicate scale quickly. |
| Particles | Point-cloud, CPU particle systems, trails, attractors, connection hints, and WebGPU compute particle examples. | Particle and data routes should show dense movement and clear controls. |
| Postprocess | Bloom/postprocess-style controls, FXAA, color, vignette, compositor overlays, and route-specific toggles. | Cinematic routes should show polished final-frame treatment. |
| Atmosphere | Transparent geometry, haze cards, dust particles, god-ray approximations, and lighting choreography. | Fog and cinematic scenes should sell depth and mood. |
| Water | Procedural mesh waves, ripples, pointer disturbance, foam, color, and normal approximations. | Water routes should emphasize interaction and motion. |
| Physics | `@aura3d/physics`, route-level rigid-body/contact behavior, primitive/proxy colliders, kinematic pushers, and reset determinism. | Physics playground should show cause-and-effect, contact cues, and controls. |
| Controls/UI | Orbit/camera presets, panels, toggles, sliders, capture, reset, status HUD, screenshots, and route health. | Every example should be demonstrable without source-code inspection. |

## Workstream Split

There are two kinds of work. Do both; do not substitute one for the other.

### Engine/Runtime Fix Workstreams

- Asset/import diagnostics: node/material/texture/animation counts, first-visible-frame timing, decoder/cache behavior, missing-extension reporting.
- Material/rendering correctness: PBR normalization, texture fallback diagnostics, transparent/glass handling, skinned textured material parity.
- Animation correctness: clip selection telemetry, mixer diagnostics, skeletal update proof, visible skeletal-motion tests.
- Postprocess: independent toggles, non-noisy defaults, telemetry, pixel-change evidence, render-work budget.
- Performance: load/runtime separation, post-load cadence, draw/object/instance counts, screenshot metrics.
- Physics: real `PhysicsWorld` movement, contacts, reset determinism, debug visualization, collider limit reporting.
- Procedural helpers: reusable water, ocean, particle, haze, beam, dust, and path helpers with native/helper/unsupported boundaries.
- Gallery shell: shared controls, stats, reset, capture, camera presets, route status, gaps panel, loading/error states, screenshot/report hooks.

Promote a route workaround into this track when the same workaround is needed twice or when it hides an engine claim.

### Example Art-Direction Workstreams

Every route owner must define and then prove:

- reference category
- focal subject and accepted camera
- foreground/midground/background
- lighting hierarchy
- material contrast
- visible motion
- three or more meaningful interactions
- five or more visible systems
- native A3D features used
- helper approximations used

## Canonical Route Acceptance Order

Use this order everywhere. It matches `docs/examples/advanced-gallery.md`.

| Order | Route | Shared Blockers | Acceptance Target |
| --- | --- | --- | --- |
| 1 | Product Configurator | PBR material response, transmission/glass halos, hotspot selection, true part controls, frame cadence. | Premium product configurator with named imported parts, material controls, exploded behavior, studio/detail shots, and no obvious artifacting. |
| 2 | Reactor Post | Postprocess noise, emissive discipline, color grading, bloom cost, visual clutter. | Command-center scene where bloom/effects improve the render rather than masking a weak scene. |
| 3 | Digital Twin | Large scene composition, enterprise overlays, deterministic simulation, interaction picking, robot/zone inspection. | Flagship factory floor that reads as a credible operational product. |
| 4 | Robotics Lab | Skinned/animated asset material fidelity, clip switching, grounding, timeline controls, camera follow. | Animated training lab with multiple moving entities and visible timeline/state controls. |
| 5 | Smart City | Authored city load time, frame cadence, instancing stress proof, aerial composition. | City-scale visual plus defensible scale/performance evidence. |
| 6 | Data Galaxy | Dense particles, glow/trails/connections, stable CPU count limits, GPU-compute honesty. | Rich AI infrastructure visualization with formations and visible performance scaling. |
| 7 | Fog Cathedral | Crop artifacts, load time, atmosphere depth, non-native volumetric honesty. | Cinematic architectural scene with haze/light shafts and clear depth layers. |
| 8 | Physics Playground | Primitive/proxy collider limits, kinematic pusher, object interaction density, reset determinism. | Robotics manipulation testbed with meaningful real `PhysicsWorld` movement and metrics. |
| 9 | Water Lab | Water material quality, ripple interaction, shoreline composition, native GPGPU gap. | Cinematic marina/mountain water environment where interaction visibly changes the water. |
| 10 | Ocean Observatory | Layered ocean surface, horizon/atmosphere, reflections/foam approximations, distinction from Water Lab. | Futuristic observatory/yacht-deck environment with large-scale ocean motion and moving systems. |

## Per-Demo Acceptance Audit Row

Every demo must have a final audit row with current evidence for each item:

- Full UI screenshot path and SHA-256.
- Hero screenshot path and SHA-256.
- Viewport screenshot path and SHA-256.
- Runtime JSON path.
- Current `tests/reports/advanced-examples-gallery/visual-review-report.json` route record.
- Named low-level renderer code-style reference category.
- At least five visible systems, listed by actual rendered system names.
- At least three interactions with screenshot/runtime evidence or explicit test coverage.
- Animation/motion evidence from runtime samples.
- Load time and post-load frame cadence.
- A3D native features used.
- Helper approximations used.
- Human reviewer, timestamp, notes, and acceptance decision.

## Engine Fix Backlog

The gallery cannot reach `10/10` if these are handled as route cosmetics.

| Priority | Blocker | Required Decision |
| --- | --- | --- |
| P0 | Product material artifacts: watch white strip, car edge/halo/specular artifacts, glass/transmission sorting. | Fix material import/binding if engine-side; otherwise route-side corrections must document source asset/material roadmap items. |
| P0 | Slow authored GLB first visible frame and poor frame cadence on heavy routes. | Cache decoders/assets, reduce re-render/readback churn, split load state from accepted runtime stats. |
| P0 | Animated/skinned asset material fidelity, including default-material failures on character assets. | Align skinned textured path with normal textured PBR path or exclude failing assets from accepted demos. |
| P1 | Reactor/postprocess noise and cost. | Rework effect stack and scene lighting so postprocess is demonstrably additive and performant. |
| P1 | Fog/cathedral crop and non-volumetric approximation. | Reframe/rebuild authored environment or keep the route unaccepted until the screenshot and audit evidence support it. |
| P1 | Water/ocean shader quality. | Implement best procedural material possible and keep native GPGPU/WebGPU gaps explicit. |
| P1 | Physics route realism. | Promote only after screenshot review proves clarity, or continue toward mesh colliders/articulated dynamics with honest limits. |
| P2 | Gallery copy and route cards. | Remove `wow`, accepted, parity, or production-grade language until review passes. |

## Evidence Commands

Baseline gate:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
pnpm advanced-gallery
pnpm advanced-gallery:review
pnpm advanced-gallery:audit
```

Focused route gate:

```bash
A3D_DISABLE_SYSTEM_WEBGPU_BROWSER=true pnpm exec playwright test tests/browser/advanced-examples-gallery.spec.ts -g "<demo-id> renders as a complex animated A3D demo" --reporter=line --timeout=240000
pnpm advanced-gallery:review
```

Final accepted gate:

```text
Release gate: accepted (10/10 accepted)
```

## Promotion Rules

Do not set a route to `accepted` unless all of this is true:

1. The current screenshot would not embarrass the project beside the named reference category.
2. The route has current full UI, hero, viewport, and contact-sheet evidence.
3. The accepted screenshot hash is recorded and verified by the review tool.
4. Runtime telemetry proves animation and post-load stats.
5. The route has no known visual blockers such as white materials, haloed glass, visible crop edges, noisy postprocess, missing subject, stretched canvas, low-resolution backing store, or slideshow cadence.
6. Unsupported features are documented as gaps and are not described as native A3D features.
7. `pnpm advanced-gallery:review` accepts the route.

The final gallery is complete only when every route is accepted and the full generated report says `Release gate: accepted (10/10 accepted)`.

## Parallel Agent Safety

Parallel work is expected. Keep write sets disjoint.

Before editing:

- Run `git status --short`.
- Identify the exact files or route lane you own.
- Read any dirty file before touching it.
- Preserve unrelated edits and never revert another worker's changes.

Recommended lanes:

- Engine/runtime lane: package/helper files for one shared blocker.
- Route lane: one route implementation and its route-local assets/styles.
- Evidence lane: screenshots, runtime JSON, contact sheet, review report.
- Metadata lane: `src/metadata.ts` and acceptance hashes/statuses.
- Documentation lane: `docs/examples/advanced-gallery.md`, `ACCEPTANCE_PLAN.md`, README/plan files when assigned.

Rules:

- Do not edit central metadata or evidence unless that lane is assigned.
- Do not weaken tests, visual review, or acceptance guards to make current work look better.
- If a route needs a fix owned by another lane, document the dependency instead of making an overlapping edit.
- Each handoff must list changed files, commands run, route statuses, and remaining contradictions/blockers.
