# R-02 compile-path no-regression check (5 games, real GPU)

Change under test: compiler audit evidence (`__A3D_SHADOW_TAP_TIER__`, `__A3D_DENSE_SHADOW_CAP__`,
`__A3D_SHADOW_PROXIES__`) is recorded per app and mirrored to page globals only by publishing apps.

- Base: `e5387f3b0` (origin/main at the lane's fork point; current origin/main also carries the 5.0.3
  tree, so it would mix in unrelated changes). Branch: `lane/515-react-embedding` with the R-02 fix.
- Headless Chrome (ANGLE Metal) over loopback CDP, deterministic virtual clock (`tools/shim.js`, copied from
  `lane/504-bellkeeper`), root Vite dev server; the games' app-local `public/` assets were copied into the
  root `public/` temporarily for serving and removed afterwards.
- Two independent loads per side (`base1`/`base2`, `branch1`/`branch2`). `compare.json`: mean absolute RGB
  difference base1 vs branch1 against the noise floor (base1 vs base2, branch1 vs branch2).
- Result: all 5 games ready and rendering on both sides, every delta within noise (Cross Hop is
  non-deterministic run to run on both sides, ~15 MAD). Full-page routes still publish the same
  `__A3D_SHADOW_TAP_TIER__` values (`base1.json` / `branch1.json`).

`../r02/globals.json` + `../r02/frame-dense.png`: two embedded `AuraCanvas` apps with different shadow
settings (`?dense=1`): no `__A3D*` / `__AURA*` page globals while live or after both are disposed, and each
app's `compileEvidence()` holds its own, different values.
