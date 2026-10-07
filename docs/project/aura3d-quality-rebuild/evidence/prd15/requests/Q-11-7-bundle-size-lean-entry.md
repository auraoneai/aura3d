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
