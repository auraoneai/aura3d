# ENGINE PACKAGE KNOWLEDGE BASE

**Scope:** `packages/engine/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 17 - public API, runtime, game, production bridge.

## OVERVIEW

This package contains the public agent API and several deeper runtime layers.
Changing it can alter what docs, templates, and apps are allowed to claim.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Root safe API | `src/agent-api/` | Public `createAuraApp` path and helper exports. |
| Game helpers | `src/agent-api/GameRuntime.ts`, `src/agent-api/GameGenreKits.ts`, `src/game/` | Route-local gameplay and evidence contracts. |
| Runtime nodes | `src/agent-api/RuntimeNodeHandle.ts` | Mutability surface used by browser routes. |
| Production bridge | `src/production-runtime/` | Label as production-runtime unless root path proves it. |
| Advanced/internal runtime | `src/advanced-runtime/` | Not root-safe public proof by default. |
| Animation studio docs | `src/animation-studio/` | Document schema and sampling helpers. |

## CONVENTIONS

- Treat `src/agent-api/index.ts` as a high-risk export barrel. Add exports
  deliberately and verify downstream templates/examples.
- Public route APIs should remain declarative: `scene()`, `model(assets.x)`,
  `lights.*`, `game.*`, `ui.*`, runtime node handles, and evidence helpers.
- Runtime/game additions need source tests and, when visual or interactive,
  browser tests proving state changes or pixels.
- Production-runtime and advanced-runtime symbols may exist before the root
  safe API can claim them. Keep docs labels split.
- Maintain typed asset and provenance assumptions; do not make root APIs accept
  raw GLB URLs as a convenience.

## ANTI-PATTERNS

- Do not broaden root-safe claims because an internal production/runtime helper
  compiles.
- Do not add a game-kit claim without objective, reset, scoring/fail or
  progression, and input-driven browser proof.
- Do not use `as any` or suppressions to push public API types through.
- Do not import renderer internals into public examples to demonstrate an
  engine feature.

## VERIFY

Use targeted unit tests under `tests/unit/agent-api`, `tests/unit/game-runtime`,
and `tests/unit/animation`, then the matching browser command such as
`pnpm game-runtime:browser`, `pnpm animation-runtime:browser`, or an
engine-readiness script.
