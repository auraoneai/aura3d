# Failure Analysis

## Purpose
This document captures what the three prior Galileo3D/G3D attempts were trying to build, what worked conceptually, what failed, and what must not be repeated in the rebuild.

## Discovery Summary
Inventoried project roots:

- Current project: `/Users/gurbakshchahal/G3D`
- Failed 2025 attempt: `/Users/gurbakshchahal/G3D2025`
- Older attempt: `/Users/gurbakshchahal/Old-G3D`

Observed scale from the read-only inventory:

- About 1,524 markdown files across the three roots when dependency/build/temp-heavy paths were excluded.
- About 974,958 markdown lines across that same filtered set.
- About 14,649 TypeScript, JavaScript, GLSL, WGSL, and JSX/TSX source files across the filtered trees.
- About 1,382 test/spec or test-path files across the filtered trees.
- `G3D` is about 711 MB including installed dependencies.
- `G3D2025` is about 21 MB.
- `Old-G3D` is about 8.8 GB and contains engine code, admin tooling, examples, reports, migration docs, failed fix plans, and test artifacts.

High-signal markdown read included:

- `G3D/README.md`, `docs/index.md`, `docs/documentation-map.md`, module docs, example READMEs, `VERTEXBUFFER_INVESTIGATION_FINDINGS.md`, `src/tests/E2E-TEST-REPORT.md`, and integration reports.
- `G3D2025/Docs/PRD-Final-*.md`, `FINAL_STATUS.md`, `INTEGRATION_REPORT.md`, `SYSTEM_ORDER_REPORT.md`, `DEPENDENCY_VERIFICATION_REPORT.md`, `DATA_FLOW_VERIFICATION_REPORT.md`, and source module README/summary files.
- `Old-G3D/COMPLETION_ANALYSIS.md`, `FINAL_RENDERING_STATUS.md`, `RENDERING_STATUS_REPORT.md`, `WEBGPU_IMPLEMENTATION_AUDIT.md`, `autolightfix.md`, `sizzle-autopsy.md`, `activate100.md`, source architecture/migration docs, recent analysis reports, and rendering/debug docs.

## What Each Project Tried To Build

### Current G3D
The current project tried to be a full G3D 5.0 TypeScript web game engine with ECS, rendering, physics, animation, AI, world systems, domain packs, editor tooling, analytics, cloud, XR, examples, and tests. The README presents a production-ready engine with WebGL2/WebGPU, PBR, physics, animation, AI, networking, audio, asset pipeline, serialization, and domain packs.

Useful concepts:

- Package exports were scoped by subsystem: `math`, `ecs`, `rendering`, `physics`, `animation`, `audio`, `ai`.
- The module directory map is broad and coherent at a category level.
- The ECS has meaningful primitives: `World`, `EntityManager`, `ComponentRegistry`, `Query`, `Scheduler`, `CommandBuffer`, component/system directories.
- The test reports identify concrete problems rather than only success claims.
- `VERTEXBUFFER_INVESTIGATION_FINDINGS.md` showed an important debugging pattern: isolate CPU buffer layout, GPU upload, VAO state, shader attribute binding, and draw path separately.

Failures and fragility:

- The docs and README substantially overclaim production readiness relative to test reports and code markers.
- `src/tests/E2E-TEST-REPORT.md` reports 4/13 E2E tests passing, missing component registration, missing Node requestAnimationFrame setup, incomplete transform hierarchy, and duplicate export statements.
- Source scans show placeholders/stubs in scientific, XR, postfx, particle, render graph, geometry pass, terrain, and other areas.
- Backup renderer files such as `Renderer.ts.bak*` exist in source areas, indicating patch churn and unclear canonical ownership.
- Examples claim "zero placeholders" while example docs also list known simplifications and stub physics raycasts.
- The renderer problem around VertexBuffer revealed that isolated parts could be correct while the end-to-end render path still failed.

### G3D2025
The 2025 attempt tried to turn a master PRD set into a broad G3D 5.0 implementation. It included a canonical PRD split across core/math/ECS, rendering, shaders/materials/postFX, physics/simulation, animation, AI/ML, world systems, domain packs, infrastructure, tooling, and testing.

Useful concepts:

- The PRD docs are a valuable pattern: file-by-file specs, tests, dependencies, and acceptance criteria.
- The layered architecture idea is reusable: foundation, data, systems, features, tools, domains.
- Data-flow verification attempted to prove input to gameplay to physics to rendering.
- Dependency verification attempted to enforce layer direction and catch module graph issues.
- System order analysis recognized lifecycle ordering as a first-class risk.

Failures and fragility:

- `FINAL_STATUS.md` and `INTEGRATION_REPORT.md` claimed production readiness and 100 percent completion, but `SYSTEM_ORDER_REPORT.md` found critical ordering issues and missing dependency enforcement.
- `DEPENDENCY_VERIFICATION_REPORT.md` found a core-to-ECS layer violation.
- `DATA_FLOW_VERIFICATION_REPORT.md` still listed missing integration points for material system integration, skinned mesh components, NavAgent component separation, sensor/perception components, and network component integration.
- Source scans still found not-implemented or placeholder entries despite validation docs claiming zero blockers.
- Many module summaries emphasize line counts and "no TODOs" rather than executable acceptance evidence.
- The attempt reproduced the breadth-first problem: too many subsystems before a small stable engine spine was proven.

### Old-G3D
The older tree tried to build an advanced Galileo3D platform with WebGL/WebGPU renderers, materials, shaders, particles, postprocessing, AI/ML, admin portals, WebXR, marketplace/domain tooling, migration systems, debugging tools, and many examples.

Useful concepts:

- Deep rendering diagnostics and debugging tools are valuable: draw-call tracking, pipeline tracing, runtime color asserts, shader registry ideas, and browser test harnesses.
- WebGL/WebGPU abstraction docs show useful adapter concepts.
- Migration and deprecation docs identify which files became legacy wrappers or compatibility layers.
- Particle and WOW gallery reports provide lessons about example validation and visual test harnesses.
- Autopsy reports capture real failure modes in shader selection, uniform upload, build substitution, and PBR energy.

Failures and fragility:

- The tree accumulated too many duplicate systems, adapters, shims, deprecated files, and generated stubs.
- `COMPLETION_ANALYSIS.md` shows a documentation-vs-reality gap for particles, with many incomplete tasks despite impressive claims.
- `FINAL_RENDERING_STATUS.md` and `RENDERING_STATUS_REPORT.md` report remaining line rendering and toon shading failures.
- `autolightfix.md` records PBR failures where uniforms, shader selection, shader registry, and build processing conflicted.
- `sizzle-autopsy.md` records severe material and scene failures, including circular import fixes, dark rendering, PBR instability, and complete rebuild recommendations.
- `activate100.md` explicitly states many systems were not really activated and still needed full implementation.
- Old compatibility rules such as "never import from three" were useful as intent but could not save an incoherent module graph.

## Cross-Attempt Failure Patterns

### 1. Breadth Before Spine
All attempts tried to include advanced subsystems before proving the lifecycle, render device, scene graph, ECS scheduling, physics sync, asset loading, and animation runtime.

Rebuild response: ship vertical slices in a strict order. A subsystem cannot advance until its dependencies pass acceptance tests.

### 2. Completion Claims Without Verification
Reports frequently said "production ready", "zero placeholders", or "100 percent complete" while other evidence showed failures.

Rebuild response: completion requires the checklist in `21-Testing-and-Validation-PRD.md`. Status prose is never evidence by itself.

### 3. Renderer Contract Drift
The renderer repeatedly failed across CPU data, GPU upload, shader selection, uniforms, VAO state, material variants, and postprocess state.

Rebuild response: define a render-device contract, shader contract, material binding contract, geometry layout contract, and frame state contract before adding advanced passes.

### 4. Module Graph Drift
Layer violations, circular dependencies, duplicate exporters, backup files, and legacy wrappers made it unclear what was canonical.

Rebuild response: one public export graph, CI import-boundary checks, and no legacy compatibility layer during rebuild.

### 5. Examples As Decoration
Examples were often used to announce completion, but they were not consistently automated or treated as acceptance tests.

Rebuild response: every example in `20-Examples-and-Demos-PRD.md` has a validation purpose, test path, visual expectation, and failure gate.

### 6. Physics And Animation Integrated Too Late
Physics and animation were described as broad feature sets, but core synchronization, determinism, ordering, and component contracts were incomplete.

Rebuild response: deterministic fixed-step physics and animation sampling must be integrated into the scheduler before advanced features.

### 7. Too Many Advanced Claims
AI/ML, quantum, neural, cloud, domain packs, WebGPU ray tracing, and marketplace systems diluted the engine objective.

Rebuild response: move non-core advanced systems out of the initial engine rebuild. They require separate PRDs after core engine acceptance.

## What To Reuse Conceptually
- TypeScript-first public API.
- Package subpath exports by subsystem.
- Data-oriented ECS idea.
- Scene graph with explicit transform propagation and bounds.
- Render graph idea, but only after a simple forward path works.
- WebGL2 first with WebGPU as a backend behind the same device interface.
- Deterministic fixed-step simulation.
- File-by-file PRD format from G3D2025, with stronger verification.
- Rendering diagnostics and draw-call/pipeline tracing from Old-G3D.
- Browser and visual validation harnesses.

## What To Discard
- Claims of production readiness not backed by tests.
- Generated or placeholder systems.
- Backup files in source directories.
- Legacy adapters and compatibility layers during the rebuild.
- Broad domain packs in the core engine package.
- Multiple shader systems competing for ownership.
- Multiple renderer entry points without a canonical render-device contract.
- Examples that are not tied to explicit acceptance criteria.
- Any import or module path that bypasses public package boundaries without justification.

## Rebuild Risk Register
| Risk | Source Evidence | Rebuild Control |
|---|---|---|
| Renderer appears to work in one example but fails generally | VertexBuffer investigation and Old-G3D PBR autopsies | Add renderer contract tests, visual tests, shader/material binding tests, and state leak tests |
| Tests exist but do not exercise real browser APIs | E2E reports and G3D2025 verification docs | Separate Node unit tests from browser integration tests |
| Module graph drifts over time | dependency report, circular import fixes, migration docs | Enforce dependency boundaries in CI from phase 1 |
| ECS order produces subtle runtime bugs | `SYSTEM_ORDER_REPORT.md` | Scheduler phases and dependency constraints are implemented before subsystem systems |
| Physics sync is nondeterministic | prompt objective and test reports | Fixed-step tests, replay tests, and transform interpolation tests |
| Animation works in isolation but not at runtime | source breadth and missing skinned mesh integration | Animation-to-scene/ECS integration tests and visual skeletal demo |
| Material system duplicates shader ownership | Old-G3D shader/PBR autopsies | One material binding contract and one shader compiler/preprocessor path |

