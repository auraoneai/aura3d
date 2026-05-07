# Architecture Principles

## Purpose
This document defines the engineering principles for the Galileo3D rebuild. These rules exist to prevent the same failure modes observed in the current, 2025, and old codebases.

## Engine Identity
Galileo3D is a web 3D engine layer, not a random set of wrappers around another library. It should expose high-level authoring concepts while retaining deterministic, testable, low-level engine control.

Target identity:

- TypeScript-first.
- Browser-native.
- WebGL2 stable first.
- WebGPU-capable by abstraction, not by duplicate renderer sprawl.
- Modular, but with explicit dependency direction.
- Friendly enough for application developers, strict enough for engine contributors.

## Architectural Rules

### Rule 1: Spine Before Features
Build the engine spine first:

1. Core lifecycle.
2. Math.
3. Scene graph.
4. ECS.
5. Renderer device and basic forward render.
6. Physics fixed step and sync.
7. Animation sampling and sync.
8. Assets.
9. Input, audio, scripting, editor, debugging.

No subsystem can depend on a future subsystem. If a feature needs a missing foundation, the foundation is built first.

### Rule 2: One Canonical Owner Per Contract
Every runtime contract has exactly one owner:

- Engine lifecycle: `core`.
- Transform hierarchy: `scene`.
- Data-oriented processing: `ecs`.
- GPU resource ownership: `rendering/device`.
- Material binding: `rendering/materials`.
- Shader compilation: `rendering/shaders`.
- Physics simulation state: `physics`.
- Animation sampling state: `animation`.
- Asset identity and loading: `assets`.

No duplicate shader registries, renderer entry points, transform systems, or event systems are allowed unless they are explicitly adapters under the owning contract.

### Rule 3: Layer Direction Is Enforced
Allowed dependency direction:

- `math` has no engine dependencies.
- `core` can depend on `math`, but not `ecs`, `scene`, `rendering`, `physics`, `animation`, or `assets`.
- `scene` can depend on `core` and `math`.
- `ecs` can depend on `core` and `math`; optional scene bridge code lives outside pure ECS.
- `rendering` can depend on `core`, `math`, and `scene`.
- `physics` can depend on `core`, `math`, and optional bridges to `scene`/`ecs`.
- `animation` can depend on `core`, `math`, `scene`, and optional bridges to `ecs`.
- `assets` can depend on `core`, `math`, `scene`, `rendering`, and `animation` only through loader result interfaces.
- `editor`, `examples`, and `tests` can depend on all public packages.

CI must fail on forbidden imports.

### Rule 4: Runtime Order Is Explicit
The engine loop is not emergent behavior. It is a declared sequence:

1. Poll platform and input.
2. Run queued tasks and asset finalization.
3. Accumulate fixed timestep.
4. Run fixed simulation ticks: physics, deterministic gameplay systems, fixed animation events.
5. Sample variable animation and update behavior systems.
6. Propagate scene transforms and bounds.
7. Build render views and draw lists.
8. Execute render graph.
9. Present frame.
10. Run end-of-frame cleanup and diagnostics.

Each system declares phase, priority, and dependencies. The scheduler validates cycles.

### Rule 5: Data Flow Is Testable
Each cross-module data flow needs an integration test:

- Input action changes a component or behavior.
- Physics moves a body and syncs scene/ECS transform.
- Animation samples a clip and updates skeleton/scene transforms.
- Asset loader produces renderable mesh, material, texture, skeleton, and animation resources.
- Renderer consumes scene state without mutating simulation state.
- Audio listener/source positions update from scene transforms.
- Editor command mutates scene/ECS state and undo restores it.

### Rule 6: Public API Is Small First
The first public API should be small enough to keep stable:

- `Engine`
- `Scene`
- `EntityWorld`
- `Renderer`
- `PhysicsWorld`
- `AnimationMixer`
- `AssetManager`
- `Input`
- `AudioSystem`

Advanced APIs are not exported until the foundational API is proven.

### Rule 7: Examples Are Acceptance Tests
Each example must prove a real engine capability:

- It has a named acceptance target.
- It runs in a browser.
- It has a screenshot or canvas-pixel validation where visual output matters.
- It has performance telemetry.
- It must fail CI or release validation when the capability breaks.

### Rule 8: Diagnostics Are Built In
The engine must expose:

- Frame stats.
- Draw-call stats.
- GPU resource counts.
- Shader compile errors.
- Material binding validation.
- Physics step stats.
- Animation blend/state stats.
- Asset load queue stats.
- Import-boundary and package export validation.

Diagnostics are not optional rescue tools. They are part of acceptance.

## Public API Principles
- Constructors should be explicit and typed.
- Long-lived resources must have `dispose()` or ownership through a resource manager.
- Async initialization must be clear: `await engine.init()`, `await renderer.init()`, `await assets.load()`.
- Error results should be typed where recoverable; thrown errors should indicate programmer misuse or unrecoverable initialization failure.
- Subsystem packages should export stable interfaces and hide implementation helpers.
- Avoid `any` in public APIs.

## Internal Design Principles
- Prefer composition over inheritance for engine systems.
- Keep file sizes bounded; split by responsibility before files become dumping grounds.
- Use typed handles for resources where raw object identity causes lifecycle problems.
- Keep CPU-side data layouts explicit and documented.
- Separate simulation state from render interpolation state.
- Avoid hidden globals. Singletons are only allowed for compile-time constants or test-only utilities.
- No dynamic import magic in core runtime paths unless it is part of an explicit asset/plugin boundary.

## Dependency Boundary Checklist
Every new file must answer:

- Which package owns it?
- Which public contract does it serve?
- What modules may import it?
- What modules may it import?
- Does it introduce a cycle?
- Does it mutate global state?
- How is it tested?
- How is it disposed?

## Rebuild Completion Standard
A subsystem is complete only when:

- Its public API is documented.
- Its internal ownership boundaries are documented.
- Its file-by-file plan is implemented.
- Unit tests pass.
- Integration tests pass.
- Browser/visual tests pass where applicable.
- Examples prove the feature.
- Performance budget is measured.
- Diagnostics expose enough state to debug future failures.

