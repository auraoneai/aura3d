# Claims And Boundaries For Agents

Version: 1.0.0

A3D docs and product language are evidence-bound. Agents should keep generated claims, README edits, release notes, and route descriptions aligned with current source, tests, routes, and generated reports.

## Safe Baseline Claim

Use this style:

> A3D is a TypeScript-first browser 3D engine and workflow SDK with first-party rendering, asset, animation, physics, controls, workflow, diagnostics, and Three.js migration packages. Current generated reports support measured parity or superiority only for the categories covered by the relevant local evidence lane.

Use narrower wording when reports have not been regenerated in the current workspace.

## Blocked Claims

Do not write these unless the codebase and current regenerated evidence explicitly support the exact statement:

- A3D is better than Three.js in every way.
- A3D is a full Three.js replacement.
- A3D is a Unity or Unreal replacement.
- A3D supports every browser, GPU, WebGPU feature, glTF extension, material feature, or Three.js example.
- A single local route proves broad production readiness.
- Local generated reports are durable release evidence without regeneration.

## Evidence Sources

| Claim area | Evidence source |
|---|---|
| Public API | `package.json` exports, `packages/*/src/index.ts`, `docs/api/public-api.md`, `pnpm verify:api-docs`. |
| Current routes | root `index.html`, `tests/browser/current-routes-route-health.spec.ts`, `tools/current-routes-*`. |
| Advanced gallery acceptance | `apps/advanced-examples-gallery/src/metadata.ts`, gallery screenshots/reports, `pnpm advanced-gallery:pipeline`. |
| Rendering behavior | `packages/rendering/src`, rendering unit/browser tests, rendering docs, route evidence where applicable. |
| Asset behavior | `packages/assets/src`, asset/corpus tests, loader diagnostics, asset docs. |
| Three.js parity | `tools/threejs-parity-*`, `tests/reports/threejs-parity/`, parity docs. |
| Superiority wording | `tools/superiority-*`, `tests/reports/superiority/`, superiority docs and claim defense. |
| Release/readiness wording | release docs, readiness tools, generated report state from the current workspace. |

## Local Reports Are Not Source

`tests/reports/` is ignored generated evidence. Agents may read it for local context, but must not treat it as durable source. If a doc or final answer needs to rely on report state, run the relevant generator or clearly state that the report was not regenerated.

## Examples Boundary

The only live local examples are the root registry, advanced gallery deep links, and `wow-*` app routes. Other browser test harnesses may exist under `tests/browser`, and other workflow code may exist under `packages/*`, but they are not public local example routes.

When editing docs, avoid phrases that imply the deleted `examples/` tree or old standalone app route catalog still exists.

## How To Word Limits

Prefer:

- "implemented in package code"
- "covered by focused tests"
- "covered by current route-health"
- "accepted after the advanced-gallery pipeline passes"
- "bounded support"
- "evidence-bound"
- "unsupported until a fixture, route, test, and report prove it"

Avoid:

- "fully supported"
- "complete parity"
- "production-ready everywhere"
- "all examples"
- "universal"
- "guaranteed"

## When In Doubt

Use the narrower claim and link the source doc:

- [Public claim guidelines](../project/claim-guidelines.md)
- [Known limits](../project/known-limits.md)
- [Current state](../project/current-state.md)
- [Three.js parity status](../project/threejs-parity-status.md)
- [Three.js superiority status](../project/threejs-superiority-status.md)

