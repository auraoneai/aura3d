# ADR 0001 — Retain `packages/ecs` and `packages/scripting` as public game-kit-layer API

- **Date:** 2026-08-05
- **Status:** accepted
- **Workstream:** WS-3.3 (P3 — architectural duplication)

## Context

The Aura3D 2.0 platform boundary lists "an ECS research framework" and "a behaviour-tree /
GOAP / HTN AI framework" under *what Aura3D is NOT*, and WS-3.3 was written to delete both
packages (7,317 lines) from the active tree on the premise that they had **zero consumers**.

R8 requires a machine-generated six-point dependency report before any `git rm`. It was run
first, and it **refused the deletion**. This ADR records why the §A prohibition and the shipped
public API disagree, and why the disagreement is resolved in the philosophy rather than by
deletion.

## The four R11 questions

1. **Does Three.js already solve this?** No. Three.js has no ECS and no behaviour-authoring
   layer; it is a rendering library. This is not a case of reimplementing something the
   competitor already provides.
2. **Does another mature ecosystem library solve this?** Yes, partially — `bitecs`/`miniplex`
   for ECS, Yuka for steering and behaviour. This is the honest basis for the original §A
   prohibition: had these been greenfield proposals for 2.0, R11 would likely have rejected
   building them. **That argument governs new work; it does not retroactively authorise
   removing published API with live consumers and satisfied R1 evidence.**
3. **Does this create lasting differentiation for Aura3D?** Weakly as libraries, materially as
   *integration*. The differentiated part is that ECS state drives the real renderer through
   `engine/src/ecs/ECSRenderSource.ts` and that behaviour graphs are authorable in
   `apps/editor`'s visual-scripting panel. A developer swapping in `bitecs` + Yuka rebuilds
   both bridges by hand.
4. **Does this belong above or below the public API?** **Above.** These are game-kit-layer
   authoring capabilities sitting on top of the renderer — not solver-layer subsystems
   competing with Rapier. That distinction is what makes retention consistent with §A's intent:
   §A targets speculative simulation *below* the public API.

## Decision

**Retain both packages. No workspace change, no `exports` change, no publish-list change, no
an in-tree graveyard, and no unreviewed breaking API removal in 2.0 from this workstream.**

Amend §A instead, to state that the prohibition binds *new* subsystems and does not mandate
deleting published API that carries a live consumer and production-path evidence.

## Consequences

- 7,317 lines remain maintained. Per **R6** that is an observation, not a failure — the
  alternative was a breaking removal of two documented entry points.
- The repository is permanently committed to subsystems no ADR ever justified. **This is the
  real cost of the original drift, and the strongest argument for enforcing R11 on new work:**
  the cost is not avoided by deleting proven code, it is paid as maintenance.
- The 8 `packages/scripting` fixture files (2,079 lines) no longer "travel with" a package
  deletion. They return to the WS-3.5 extraction queue and the §9 *undecided — pending R8*
  bucket, each needing its own report. No commitment to delete.
- Future removal is not foreclosed, but it becomes a **major-version** decision requiring a
  deprecation window, an adapter, and migration of the nine parity rows — per **R7**.

## Evidence

R8 report: `tests/reports/deletion-safety-ws33-final.json` — **61 of 68 files blocked across
300 references**, spanning `runtime-consumer`, `public-package-export-dependency` and
`documentation-generator-dependency`.

Four independent blockers, measured 2026-08-05:

1. **Public published subpaths.** Root `package.json` maps `./ecs` → `./dist/ecs/index.js` and
   `./scripting` → `./dist/scripting/index.js`.
2. **Re-exported on the public engine barrel.** `packages/engine/src/index.ts:61` —
   `export * from "./ecs/ECSRenderSource.js"`. The original claim that "only `ECSRenderSource.ts`
   imports ECS" was true and *inverted the conclusion*: that file is the public bridge.
3. **Live app consumer.** `apps/editor/src/panels/VisualScriptPanel.ts:1` imports
   `createVisualNode`, `listVisualNodeDefinitions`, `VisualGraphExecutor`;
   `apps/editor/src/EditorShell.ts:12,116,157` constructs it as a permanent shell fixture.
4. **Production-path browser evidence (R1's strongest class).**
   `tests/browser/runtime-external-parity.spec.ts` drives a live WebGL2 route and asserts
   `oldBranchBehaviorTreePort`, `oldBranchGoapPlannerPort`, `oldBranchHtnPlannerPort`,
   `oldBranchUtilityAiPort`, `oldBranchDecisionTreePort`, `oldBranchStateMachinePort`,
   `oldBranchPerceptionPort`, `oldBranchWeaponSystemPort`. Nine parity rows cite
   `packages/scripting/src/*`. Deletion would have invalidated satisfied R1 claims.
   `tests/browser/fixtures/workspace-vite-imports/main.ts:6,13` additionally imports both
   through a real Vite bundle.

The four files R8 appeared to clear
(`packages/ecs/src/systems/{ActiveSystem,HierarchySystem,TransformSystem,index}.ts`) were an
artifact of whole-set evaluation: `packages/ecs/src/index.ts:25` is
`export * from "./systems/index.js"`, and that barrel is retained. **True deletable count: 0
source files.**

Retention verified:

```
$ pnpm typecheck
Command proof passed: pnpm typecheck:raw

$ npx vitest run tests/unit/public-api-contracts.test.ts tests/unit/ecs tests/unit/scripting
Test Files  17 passed (17)
     Tests  81 passed (81)
```
