# BENCHMARK KNOWLEDGE BASE

**Scope:** `benchmark/`
**Generated:** 2026-06-20T14:38:27-0700
**Score:** 11 - distinct benchmark corpus and frozen context.

## OVERVIEW

Benchmarks are comparison and release-proof infrastructure. Context bundles are
fixtures, not current product source.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Runner scripts | `runner/` | Full benchmark, tarball audit, engine validation. |
| Scoring | `scoring/` | Benchmark scoring logic. |
| Context fixtures | `context/` | Frozen Aura3D/Three.js snapshots used for comparison. |
| Results/runs | `results/`, `runs/` | Generated or recorded evidence. |

## CONVENTIONS

- Keep benchmark inputs reproducible: pin paths, command lines, package
  versions, and result locations.
- Treat `context/**/files` as a captured fixture. Do not modernize it unless
  the benchmark task explicitly updates the fixture.
- Do not cite benchmark fixture docs for current capability; cite current docs
  and current route evidence instead.
- Runner changes should preserve machine-readable outputs for release proof.
- If a benchmark compares external engines, keep external baseline assumptions
  explicit and separate from Aura3D root API claims.

## ANTI-PATTERNS

- Do not edit result JSON to improve benchmark outcomes.
- Do not mix generated runs with source changes in the same explanation.
- Do not import current source into frozen context fixtures unless regenerating
  that fixture intentionally.
- Do not use benchmark-only parity as public marketing proof without release
  evidence and claim labels.

## VERIFY

Use the narrow runner command first, then `pnpm benchmark:guard-full`,
`pnpm benchmark:tarball-audit`, or `pnpm benchmark:validate-engine` when the
change touches release proof.
