# TOOLS KNOWLEDGE BASE

**Scope:** `tools/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 16 - evidence, release, parity, and readiness automation.

## OVERVIEW

Tools turn source state into evidence. Treat tool outputs as contracts consumed
by CI, docs, release checklists, and public claims.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Command proof | `evidence/` | Wraps commands and writes JSON/log evidence. |
| Release gates | `aura3d*-release-readiness/`, `foundation-*`, `engine-readiness-*` | Named readiness scripts. |
| Route/showcase proof | `advanced-gallery-*`, `showcase-library/`, `webgpu-route-health/` | Visual and launch evidence. |
| Parity tooling | `threejs-parity-*`, `external-parity-*`, `three-compat-*` | Compatibility labels, not root-safe proof. |
| Asset automation | `asset-index-refresh/`, `advanced-gallery-assets/` | Catalog and asset evidence. |

## CONVENTIONS

- Scripts run with `tsx --tsconfig tsconfig.base.json` or Node ESM depending on
  the existing file. Match local style.
- JSON output schemas are consumed by reports/docs. Keep changes backward
  compatible or update every consumer.
- Fail closed for public claim gates: missing evidence should block or label as
  prototype, not silently pass.
- Prefer one focused tool per readiness concern over one script with hidden
  side effects.
- Do not write tools that mutate generated evidence without recording command,
  cwd, inputs, and output path.

## ANTI-PATTERNS

- Do not make a gate pass by relaxing source bans or dropping required fields.
- Do not hardcode local temp paths, absolute user paths, or untracked assets.
- Do not treat compatibility/parity reports as root API proof.
- Do not manually patch `tests/reports/**` or `release-artifacts/**` instead of
  fixing the tool and rerunning it.

## VERIFY

Run the tool directly with the same flags used by the package script, then run
the package script that consumes its output.
