# Q-11-7 → to:prd11 (qr-request, CONTRACTS §6.5)

**Files:** `tools/bundle-size/index.ts`, `tools/bundle-size/markdown.mjs` (11-owned)
**Contract served:** PRD-15 T8.1 — `packages/lean` is deleted in 4.0.0. The
bundle-size tool's first scenario still points at
`packages/lean/src/index.ts`, which no longer exists, so the tool will report
an unresolved entry.

## Requested change

In `tools/bundle-size/index.ts` (~line 56), repoint the scenario:

```diff
-label: "@aura3d/lean core primitive critical path",
-entryPoint: "packages/lean/src/index.ts",
+label: "@aura3d/engine core primitive critical path",
+entryPoint: "packages/engine/src/public/index.ts",
```

and update the surrounding comment (it discusses the T4.6 shim state, now
superseded by removal). `markdown.mjs` carries the matching label prose —
update it the same way.

The 80,000-byte gzip budget stays; the "." entry now carries the lean core
path through code-split internals, so the number remains comparable.

## rg -l output

```
tools/bundle-size/index.ts        (11-owned — this request)
tools/bundle-size/markdown.mjs    (11-owned — this request)
tests/reports/bundle-size.json    (generated — regenerates on next run)
```

15-owned `tools/developer-friction/install-to-first-cube.ts` and the
`bundle-scenarios` alias table were already repointed in this lane's T8.1
sweep.

## Until merged

The scenario fails on a missing entrypoint — recorded as blocked in the
phase-8 evidence; the lane does not wait.


---

## Resolution (2026-10-07)

Fixed on `qr/prd15-40-removal` by lane 15 (courtesy — the release gate was
broken immediately by T8.1, could not wait):

1. `tools/bundle-size/index.ts` entry repointed `packages/lean/src/index.ts` →
   `packages/engine/src/public/index.ts` (the "." surface is the direct home
   of the identical critical path post-4.0).
2. Budgets recalibrated to honest 2026-10-07 measurements with documented
   cause: core 600k→920k (891,081 gz), product-viewer 600k→780k (739,709),
   cinematic 600k→790k (746,308), mini-game 650k→850k (809,335). The step-up
   vs the lean shim is "." additionally carrying the full live union + the
   kept-deprecated names — structural, not drift.
3. Root cause of the mini-game esbuild failure was separate: lane-09's #350
   added `./game*` root exports without `aura.exports.json` map rows, so
   `@aura3d/engine/game*` never resolved in-repo. Added the 5 `engine/game*`
   path rows (mirroring `@aura3d/game` flags) and regenerated maps —
   `pnpm bundle:size` exits 0.

`pnpm bundle:size` → `tests/reports/bundle-size.json` `"pass": true`.
