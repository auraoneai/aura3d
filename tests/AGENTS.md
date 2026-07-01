# TESTS KNOWLEDGE BASE

**Scope:** `tests/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 18 - broad unit, integration, browser, and evidence surface.

## OVERVIEW

Tests are both quality gates and claim evidence. Do not weaken tests to match
claims; lower claims or fix behavior.

## STRUCTURE

```text
tests/
|-- unit/          # Vitest package/API/tool contracts
|-- integration/   # cross-system integration
|-- browser/       # Playwright route-health, screenshots, runtime proof
|-- assets/        # GLTF/assets/provenance suites
|-- game-runtime/  # source + browser input/state proof
|-- templates/     # template smoke config
|-- performance/   # performance/parity tests
|-- visual/        # visual baseline checks
`-- reports/       # generated evidence output
```

## CONVENTIONS

- Unit/integration tests use Vitest and `*.test.ts`.
- Browser tests use Playwright and `*.spec.ts`.
- Harness files commonly use `*-harness.ts` and `*-harness.html`.
- `tests/reports/**`, `test-results/**`, and screenshots are generated
  evidence. Read them to understand state; rerun the command to update them.
- Public route tests should assert draw calls, pixels, screenshots, runtime
  state, and console/page errors as appropriate.

## ANTI-PATTERNS

- Do not delete or weaken failing tests to get a green command.
- Do not replace pixel/runtime assertions with DOM-only checks for visual
  claims.
- Do not hand-edit JSON reports to make readiness gates pass.
- Do not treat generated smoke workspaces under `tests/reports/**` as active
  source unless the task explicitly targets report artifacts.

## VERIFY

Use the narrow command first, then escalate:

```bash
pnpm test:unit
pnpm test:integration
pnpm test:browser
pnpm test:visual
pnpm test
```
