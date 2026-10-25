# Release 4.1.4: verification (software WebGL2, not real-GPU)

Branch `release-4.1.4` (head at the time of writing: see `git log`; version bump `c5858938a`, Gridlock follow-up `cd49b45d9`). All browser runs are serverless ACR builds on the remote runner (SwiftShader). Nothing was published, tagged or deployed to production.

## Gates (local, node and tsx; no pnpm)

| Gate | Result |
|---|---|
| `tsc -p tsconfig.build.json`, `finalize-dist` (25 packages) | pass |
| `verify-exports` (26 packages), `verify-imports` (33 subpaths) | pass |
| `public-surface-diff` (0 unclassified removals), `public-api-contract` | pass |
| `check:skills`, `check-root-exports`, `sync-engine-readme --check`, docs links (741 files, 0 dead) | pass |
| `marketing/scripts/check-version.mjs` | pass, 4.1.4 |
| Unit suites for the touched games and kits (171 files, 1,428 tests) | 5 failures, all also failing on the `v4.1.3` tag (3 in `environments`/`game-runtime` that read LFS fixture pointers or retired app folders; with real fixtures only `three-compat-environments` and the two `game-runtime` tests fail, identically on `v4.1.3`) |
| Drift/Gridlock, `game-warm`, `likeness-audit`, `public-example-boundary` after the Gridlock follow-up | 21 files, 169 tests pass |
| Tracked files / deployable files | 15,0xx tracked; 14,094 without `/evidence/` (limit 15,000) |

## Consumer build smoke on packed 4.1.4 tarballs (remote, `Dockerfile.smoke`, Node 24, pnpm 11.1.3)

24 tarballs at 4.1.4. `vite build` and `vite dev` boot, no `node:*` import reachable from the browser entry:

| Project | Vite 7.3.2 and 7.3.7 | JS+CSS raw | gzip |
|---|---|---|---|
| hello-world | PASS | 3,395 kB | 1,062 kB |
| mini-game | PASS | 4,202 kB | 1,265 kB |
| racing-starter | PASS | 4,199 kB | 1,264 kB |
| falling-blocks-starter | PASS | 4,202 kB | 1,265 kB |
| product-viewer | PASS | 3,952 kB | 1,182 kB |

The other 15 templates were not run. Bundle size grew about 137 kB over 4.1.3 (the embedded neutral environment; no network fetch).

## Affected games (remote, built copies of the branch)

| Check | Result |
|---|---|
| Hoops, Diamond, FC, Red Zone, Teleoperator, Links boot from a built copy: 0 console errors, cleaned GLBs requested and answered 200, no removed original requested, frame not black | 6 of 6 pass (mean luma 72.5, 87.1, 129.8, 65.5, 69.0, 115.2). The first Links run failed only because eight of its GLBs were missing from my staged context (404); rerun with them staged: pass |
| Hoops 10-minute autoplay after the first made basket | 15 of 118 frames identical (longest run 14), match continues through score and check phases, 0 errors. Old build: 129 of 130 identical |
| Cumulus Dash at device scale 2 (`tests/browser/hotcum-cumulus.spec.ts`) | pass: top-right dark fraction 0.28% at 1440x900 (was 99.6% before the fix), 0% at 390x844 (was 97.6%) |
| Gridlock Courier first frame after `ready()` (`tests/browser/r414-gridlock-first-frame.spec.ts`) | pass: first frame 45 draw calls, steady state 45, 0 errors (old build: 47 of 113) |
| Gridlock Courier hero car at 1280x720 and 1440x900 (`tests/browser/gridcar.spec.ts`) | pass: bright car pixels fraction 1, mean 144; the agent's final frame `evidence/drift-and-deliver-port/rework/render-fix/car-final-1280.jpg` shows an opaque body on a visible road |

## Not verified

- Real-GPU behaviour of anything above, on any device.
- Iron Crown, Bank Shot and Bean Brawl Race were not browser-checked on this branch: their changes are asset-only (cabinet texture, bean texture) and are covered by `tests/unit/likeness-audit` (texture content and manifest hashes). Iron Crown's stage code is on `game-rework`, not in 4.1.4.
- The Gridlock road that can vanish after a long jump (open, 4.2.0).
- The preview deployment is behind Vercel SSO; it was built and Ready (`vercel-auraone inspect`), and the browser checks above ran on built copies of the same source.
- The ACR runs used trimmed contexts (referenced `public/aura-assets` files only); HDR environment files 404 in the static server used for the six-game boot check and were filtered from the error count, as in the hotfix-brand runs.
