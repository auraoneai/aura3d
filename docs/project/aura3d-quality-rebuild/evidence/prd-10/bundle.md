# PRD-10 §17.4 bundle numbers

Tool: `benchmarks/quality-rebuild/scenes/prd10/bundle/measure.ts`. It uses the `tools/bundle-size` method: esbuild ESM
with splitting and minify, statically reachable critical-path chunks, and a per-chunk gzip sum. It builds the `.` entry
(`packages/engine/src/public/index.ts`) twice, once as-is and once with `engine/src/lanes/prd10.ts` stubbed to an empty
module. CI job: `qr-prd10-wgsl.yml` → `bundle`.

| Metric | Budget (§17.4) | Measured (gzip B) | Status |
|---|---|---|---|
| Root `.` growth from PRD 10 | ≤ 1,500 | 28,548 | over budget |
| World chunk on first world node | ≤ 56,000 | 4 (no lazy chunk exists) | not meaningful until the lazy split |

These values come from a local run on origin/main 00c56b1b1 (2026-10-11). The `.` critical path is 1,026,747 B with the
lane and 998,199 B without it. They are not a tick: the row needs the main run id from the `bundle` job.

Interpretation: the lane barrel imports its whole runtime eagerly, so every world byte lands on the root critical path.
If the runtime moved behind a lazy factory unchanged, the world chunk would be about 28.5 KB, which is within the 56 KB
budget. The root shim would then fall to the barrel's registration stubs only.

Blocker: the lazy split needs an async/lazy C-38 app-extension and registration seam (`engine/src/contracts/app.ts`,
owner 15). That request is #1068. `registerAppExtension({ create })` is synchronous, and frame passes, node handlers and
shader features register at import.

Measurement note: on main, the `.` graph reaches `node:fs` and `node:path` through `@gltf-transform/core` (via
`physics-rapier`), so the shared esbuild `core-agent-api` target cannot build as-is. The lane script marks `node:*`
external in both arms, which cancels out of the delta, and reports the list (`nodeBuiltinImports`) in its JSON.
