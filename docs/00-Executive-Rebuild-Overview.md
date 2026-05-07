# Galileo3D Rebuild Overview

## Purpose
This documentation set is the rebuild product requirements system for a new Galileo3D engine. It is not a repair plan for the current codebase. The goal is to rebuild a clean, production-ready TypeScript web 3D engine with a Three.js-accessible developer experience and a higher-level Unity/Unreal-style architecture: engine lifecycle, scene graph, ECS, rendering, physics, animation, assets, input, audio, editor runtime, diagnostics, examples, and validation.

## Discovery Scope
The audit covered three prior project roots:

- `/Users/gurbakshchahal/G3D`: current broken G3D 5.0 attempt.
- `/Users/gurbakshchahal/G3D2025`: failed 2025 attempt with PRD-style docs and broad implementation claims.
- `/Users/gurbakshchahal/Old-G3D`: older large Galileo3D/G3D archive with extensive WebGL/WebGPU, material, particle, admin, report, migration, and failure material.

High-signal evidence included `README.md`, module docs, source README files, test reports, final status reports, dependency reports, data-flow reports, rendering autopsies, particle completion reports, architecture migration docs, and source-tree inventories. The audit intentionally ignored generated dependency folders and build artifacts as rebuild source material.

## Executive Finding
The old projects repeatedly optimized for feature breadth before proving the engine spine. The result was a large catalog of impressive-sounding systems, examples, generated reports, and partial implementations, but core contracts were unstable:

- The renderer could lose data between CPU geometry, GPU upload, shader attribute binding, VAO state, and material shader selection.
- Physics and animation were implemented as broad APIs before deterministic integration, ECS synchronization, and acceptance tests were stable.
- The module graph drifted, including layer violations, hardcoded priorities, weak scheduler contracts, duplicate systems, backup files, deprecated wrappers, and import churn.
- Reports often claimed production readiness while other reports and source scans showed placeholders, missing dependency enforcement, unfinished tests, and broken rendering paths.
- Examples were treated as showcase deliverables, but some were known to rely on simplified raycasts, stubs, or unverified browser behavior.

## Rebuild Position
The rebuild must start from a smaller but much stricter engine core. Every subsystem must have:

- A clear ownership boundary.
- Public API contracts before implementation.
- Deterministic lifecycle behavior.
- Explicit dependency direction.
- Unit, integration, browser, visual, and example validation where relevant.
- File-level acceptance criteria.
- No claim of completion without tests or executable validation that prove the subsystem's real runtime contract.

## Target Engine Shape
The target repository should be package-first and layered:

1. `core`: lifecycle, time, event bus, logging, diagnostics, resource ownership, scheduling, errors.
2. `math`: immutable-safe, allocation-aware primitives and geometry utilities.
3. `scene`: object graph, transforms, cameras, lights, renderable attachments, bounds.
4. `ecs`: data-oriented runtime, component storage, queries, systems, scheduler.
5. `rendering`: device abstraction, render graph, resources, shaders, materials, passes.
6. `physics`: deterministic fixed-step world, bodies, colliders, constraints, scene/ECS sync.
7. `animation`: clips, tracks, mixer, skeletons, blend trees, state machines, runtime control.
8. `assets`: loaders, import pipeline, cache, registry, dependency graph, worker jobs.
9. `input`, `audio`, `scripting`, `editor`, `debug`, `examples`, `tests`, `build`.

## Non-Negotiable Decisions
- Build foundations before breadth. No advanced domain pack until core, render, scene, ECS, physics, animation, and assets pass acceptance gates.
- Use one public module graph and enforce it in CI.
- Keep WebGL2 as the first stable backend; add WebGPU behind the same render-device contract only after parity tests exist.
- Use deterministic fixed-step physics and keep interpolation/rendering separate from simulation state.
- Treat examples as executable acceptance tests, not marketing material.
- Prefer boring file boundaries over large multi-purpose engine files.
- No generated "complete" reports are accepted as proof without command output, test results, or visual validation.

## Required PRD Set
This directory contains the requested rebuild PRDs:

- `01-Failure-Analysis.md` summarizes discovery and lessons from the three failed attempts.
- `02-Architecture-Principles.md` defines the rules that prevent a repeat failure.
- `03-Target-Repository-Structure.md` defines the new module layout.
- `04` through `22` specify subsystem-level rebuild requirements.
- `23-Implementation-Roadmap.md` sequences the rebuild.
- `24-File-by-File-Rebuild-Checklist.md` is the implementation control document for future coding agents.

## Completion Definition For The Rebuild
Galileo3D is not "rebuilt" when files exist. A subsystem is complete only when its PRD acceptance criteria pass:

- Public exports match the contract.
- Unit tests cover edge cases.
- Integration tests prove cross-module data flow.
- Browser tests prove real WebGL/WebGPU behavior where applicable.
- Visual tests prove renderer, material, shadow, animation, particle, and editor output.
- Example demos are automated where possible and manually documented where visual judgment is required.
- Performance budgets are measured on known hardware/browser profiles.

