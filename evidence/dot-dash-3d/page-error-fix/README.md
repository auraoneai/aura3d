# dot-dash-3d `Unexpected reserved word` page error

**Cause.** Test-harness only. `tests/browser/example-dev-server.ts` bundles a game with esbuild. `@aura3d/physics-rapier` has a top-level `await` (it loads the optional Rapier peer at evaluation) and sits in an import cycle, so esbuild emitted `await init_colorUtils()` inside non-async `__esm` wrappers (`init_primitives`, 20+ more; first at line 119290 of the 10.9 MB bundle). The browser rejected the module with `SyntaxError: Unexpected reserved word`; the route never mounted, so the HUD drew but not the 3D board. Only dot-dash-3d reaches that graph through this server.

**Production users: not affected.** The deployed site is built by Vite/Rollup. A remote run against https://aura3d.auraone.ai/apps/showcase-dot-dash-3d/ (`production.jpg`) reaches `__AURA3D_ROUTE_READY__` with 0 page errors, matching `evidence/live-420`.

**Fix.** The dev server now parses each esbuild bundle (`esbuild.transformSync`) and falls back to per-module serving when it does not parse; native ESM handles the cycle. `dev-server-after.jpg`: the board, shards, sentries and HUD render, 0 page errors, route ready.

**Regression checks.** `tests/browser/dot-dash-page-error.spec.ts` fails on any page error on the deployed site or the dev server and requires route-ready on the dev server. `tests/browser/post-luma-games-lib.ts` now fails a luma shard on any `pageerror`.

**Consequence for earlier numbers.** The dot-dash-3d row in `evidence/post-graph-migration/README.md` (26.5 luma, "not measurable") was taken without the 3D board mounted; it should be re-measured.

Remote runs (software GL, 480x300): `p1dotdash-repro` (error reproduced on dev, none on prod), `p1dotdash-fix` (2 passed).
