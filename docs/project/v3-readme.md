# Galileo3D v3 Code-Only Execution Index

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Purpose

This v3 documentation section is a reset of the execution target.

The current repository has many internal engine slices, tests, and proof pages. That is not the same thing as exceeding Three.js or delivering a Unity/Unreal-like browser-first authoring platform. The current visible examples remain visually primitive and should be treated as subsystem proof slices, not product-grade demos.

The v3 docs define the code that still needs to exist before stronger claims are technically credible. This section is intentionally strict:

- It includes code, tests, examples, benchmarks, and local validation tooling.
- It excludes hosting, public deployment, marketing, support process, issue triage, public docs site operations, sales material, and external API/business tasks.
- It does not mark anything complete based only on prose, generated trace rows, or renamed examples.
- It requires real rendered scenes, real imported assets, browser editor workflows, benchmark parity scenes, and visual evidence.

## Non-Negotiable Claim Reset

Do not claim any of the following until the v3 gates pass:

- "better than Three.js"
- "exceeds Three.js"
- "Unity for the web"
- "Unreal for the web"
- "Unity/Unreal replacement"
- "production renderer"
- "production PBR"
- "full editor"
- "complete asset pipeline"
- "production ready"

Allowed current statement:

> Galileo3D is currently a TypeScript web 3D engine prototype with working internal subsystem slices. It needs substantial renderer, asset, editor, runtime, benchmark, and demo code before broad Three.js or Unity/Unreal-style claims are credible.

## v3 Documents

Read and execute these in order:

1. [Current Code Reality](./current-code-reality.md)
2. [Master Code-Only Checklist](./master-code-only-checklist.md)
3. [Renderer And GPU Plan](./renderer-and-gpu-plan.md)
4. [Asset Pipeline And Content Plan](./asset-pipeline-and-content-plan.md)
5. [Editor Authoring Plan](./editor-authoring-plan.md)
6. [Runtime Systems Plan](./runtime-systems-plan.md)
7. [Examples And Benchmarks Plan](./examples-and-benchmarks-plan.md)
8. [Testing And Validation Plan](./testing-and-validation-plan.md)
9. [Decision Gates](./decision-gates.md)

## Execution Rules

- Every checklist item must map to concrete files.
- Every feature must include automated tests.
- Every visual feature must include browser screenshot or pixel evidence.
- Every benchmark claim must compare the same scene, same assets, same browser, same hardware class, and same measurement window.
- Every editor claim must be proven through browser automation, not only unit tests.
- Every example name must match the actual visual and interaction quality of the page.
- No task may be crossed off because a file exists. It is complete only when behavior, test, report, and screenshot evidence exist.

## Out Of Scope For v3

These are important later, but excluded from this code-only section:

- public hosting
- registry publishing
- support process
- public issue policy
- external customer demos
- marketing pages
- sales comparisons
- social proof
- third-party API integrations unrelated to local engine execution
- documentation-site operations

Local code examples, local benchmark references, checked-in fixtures, and local Playwright evidence are in scope.

