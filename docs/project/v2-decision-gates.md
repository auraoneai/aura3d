# Decision Gates

> Historical note: This V2 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Purpose

This file defines the gates that must pass before stronger public claims are allowed.

## Gate A: Internal Release Candidate

This gate means the repo is internally coherent. It does not mean Aura3D beats Three.js.

Required:

- `pnpm verify:release` passes three consecutive times from a clean checkout.
- `tests/reports/final-release-verification.json` has `ok: true`.
- `tests/reports/final-requirements-trace.json` has `complete: true`.
- No generated docs contain contradictory GO and required-feature-incomplete language.
- `docs/project/v2-claim-registry.md` lists every allowed public claim, required gate, evidence files, and explicit exclusions.
- Worktree state is documented and intentionally committed or ignored.
- Performance budgets pass with headroom.
- Performance budgets report min, median, max, warmup, attempts, and environment class.
- The Priority 0 checklist in [Filename-Level Execution Checklist](./filename-level-execution-checklist.md) is complete.

Current status: **met for local internal release-candidate evidence**. `pnpm verify:release:repeat` has passed three full release runs from a clean checkout, trace is strict, report freshness is enforced, and the claim registry blocks unsupported public claims. This is still not production readiness.

## Gate B: Developer Preview

This gate means developers can try the library without reverse-engineering tests.

Required:

- Gate A passes.
- Getting started docs exist.
- API reference exists for public packages.
- At least five learning examples exist and render through the actual renderer.
- Known limits are documented.
- Package publishing or local package consumption is documented.
- A starter template exists.

Current status: **met for developer-preview documentation and local package consumption**. Public API docs, getting-started docs, learning examples, starter templates, known limits, release process docs, and the local `1.0.0` package artifact exist. This is not a stable public registry release.

## Gate C: Better-Than-Three.js In A Defined Niche

This gate permits a narrow claim such as:

> Aura3D is a higher-level TypeScript engine for structured web 3D applications where built-in ECS, physics, animation, assets, editor runtime, diagnostics, and validation are preferred over assembling those systems around Three.js.

Required:

- Gate B passes.
- The Three.js and Babylon.js comparison checklist in [Filename-Level Execution Checklist](./filename-level-execution-checklist.md) is complete.
- Three.js comparison report exists.
- Aura3D product configurator demo exists and is competitive on developer workflow.
- Aura3D asset viewer demo exists and handles a real model corpus.
- Comparative benchmarks cover startup, load time, frame time, memory, draw calls, bundle size, and asset compatibility.
- The comparison states where Three.js remains better.
- The claim statement names the exact niche, measured advantage, unsupported areas, benchmark versions, browser/device matrix, and date of evidence.
- No raw renderer-performance claim is made unless Aura3D wins the same scene on the same hardware/browser/settings with raw data attached.

Current status: **met only for the exact registered niche claims**. The allowed claims are limited to checked-in scaffold bundle-size evidence and the higher-level TypeScript workflow niche. Broad "better than Three.js" wording, raw renderer-performance claims, visual parity, ecosystem maturity, and production PBR parity remain blocked.

## Gate D: Unity/Unreal-Competitive For Browser-First Apps

This gate permits a narrower web-first engine claim, not a general Unity/Unreal replacement claim.

Required:

- Gate C passes.
- The editor application and Unity/Unreal web workflow checklists in [Filename-Level Execution Checklist](./filename-level-execution-checklist.md) are complete.
- Browser editor app exists.
- Editor supports asset import, scene hierarchy, inspector, gizmos, material editing, save/load, and play mode.
- Physics, animation, particles, audio, and scripting can be authored or configured through documented workflows.
- Profiling/debugging UI exists.
- At least one real game or interactive app is built with Aura3D.
- Build/export workflow is documented.
- At least one app is authored through the browser editor from template creation through import, placement, material edit, script/behavior setup, play mode, static export, and exported-site browser smoke test.
- The Unity/Unreal comparison is explicitly limited to browser-first TypeScript workflows and lists where Unity/Unreal remain stronger.

Current status: **met only for the browser-first TypeScript workflow claim**. The editor workflow, static export, editor-authored app, and browser-first limitation evidence are complete. This does not support a general Unity/Unreal replacement claim.

## Gate E: Production Credibility

This gate means Aura3D can be responsibly marketed as production-ready.

Required:

- Gate D passes where relevant to the claim.
- The production-ready master checklist in [Filename-Level Execution Checklist](./filename-level-execution-checklist.md) is complete.
- At least three external or semi-external applications are built on it.
- There is a release history with regression fixes.
- Browser/device compatibility matrix is maintained.
- Public issue tracking and support process exist.
- Performance budgets run on real workloads.
- Security and dependency policies exist.
- Migration and breaking-change policies exist.
- A clean external reproduction path exists: another machine or independent agent can install, run verification, open demos, and reproduce benchmark reports from documented commands.
- Docs site, API reference, package version, changelog, known limits, support policy, issue templates, and security policy are version-aligned.

Current status: **not met**. External hosted demos remain blocked, so the production-ready claim remains forbidden.

## Explicitly Disallowed Claims Today

Do not claim:

- "10/10 done"
- "production-ready"
- "better than Three.js"
- "Unity/Unreal for the web"
- "full WebGPU support"
- "complete glTF ecosystem coverage"
- "real editor"
- "PBR parity"
- "Unity replacement"
- "Unreal replacement"
- "production PBR renderer"

Allowed claim:

> Aura3D currently has a broad internal TypeScript web 3D engine prototype with many verified subsystem slices, but it needs stable release verification, real app examples, external benchmarks, hardware validation, documentation, and ecosystem work before stronger public claims are credible.
