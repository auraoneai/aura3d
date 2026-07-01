# AURA3D CLI KNOWLEDGE BASE

**Scope:** `packages/aura3d-cli/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 14 - CLI asset pipeline and public-example enforcement.

## OVERVIEW

The CLI is the asset acquisition, provenance, validation, and public-source gate
layer. Its failures define many repo-wide hard rules.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| CLI/API entry | `src/index.ts`, `src/cli.ts` | Asset commands and exported types. |
| Pull/resolve bridge | `src/pull-bridge.ts` | Catalog download and typed asset output. |
| Source gates | `src/index.ts` | Static bans for raw URLs, unsafe model usage, loaders. |
| Tests | `tests/unit/aura3d-cli/`, `tests/unit/asset-index/` | CLI behavior and deployment checks. |

## CONVENTIONS

- Asset commands must write both durable manifest data and typed TS keys.
- Public-source gates should fail loudly on raw `.glb/.gltf` URLs,
  `unsafeModelUrl(...)`, `GLTFLoader`, renderer internals, and string model IDs.
- JSON reports are machine-readable evidence. Keep field names stable or update
  every consumer and fixture.
- The CLI may inspect animation clips, skeletons, morph targets, bounds, and
  rendered probes; claims still require matching route/browser proof.
- Prefer adding a validation report over weakening an existing gate.

## ANTI-PATTERNS

- Do not make the CLI silently tolerate forbidden public examples.
- Do not replace source/license provenance with temp download paths.
- Do not add a catalog shortcut that skips hash/type generation.
- Do not hand-edit generated reports to satisfy a failing gate.

## VERIFY

Run focused unit tests under `tests/unit/aura3d-cli` and the asset provenance or
deployment gate that exercises the changed command.
