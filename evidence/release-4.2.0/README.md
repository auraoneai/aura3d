# 4.2.0 pre-release verification

Run 2026-10-25 against `game-rework` (head at time of writing: see `git log`). Nothing here was published or deployed to production. All browser evidence is software WebGL2 (CPU rasteriser), never real-GPU proof.

## Gates

| Gate | Result |
| --- | --- |
| `tsc` build + `tools/finalize-dist` | pass (25 packages) |
| `verify-exports`, `verify-imports`, `public-api-contract` | pass (26 packages, 33 subpaths, 25 manifests) |
| `public-surface-diff` | pass after `docs/migration/4.2.0.md` classified the 9 retired hosted-index exports |
| `check:skills`, docs links/snippets, root exports, engine README sync | pass after regeneration |
| `tools/game-checks --all` | 26 games, 0 errors, 5 Meshy-cap warnings (ninja 496, silt 453, cloud-runner 446, roadster 445, drift 500) |
| `marketing check-site`, `gen-seo --check`, `game-inventory --check` | pass (690 links, 46 manifest routes, 26 live games) |
| Consumer build smoke, remote ACR, from packed tarballs | pass: mini-game, racing-starter, falling-blocks-starter, product-viewer, hello-world on Vite 7.3.2 and 7.3.7 |
| Aura Slam G1 replay, G3 render, LDR equivalence, UI (remote, 13 tests) | 13 passed |
| Unit suite, whole `tests/unit` tree | see below |

## Unit suite versus v4.1.3

Batch A (kits, games, likeness, boundary): 1,886 tests passed; the 2 failing files fail identically on `v4.1.3`.
Batch B (the rest of `tests/unit`): 80 files failed. The same 80 files were rerun on a `v4.1.3` worktree: 78 fail there too. Two failed only on the candidate, both because the original `showcaseTsukubaCircuit.8c139a57.glb` was deleted by the brand cleanup (c1a2b667d) while the Tsukuba opacity test and the `game-runtime-gates` opaque-asset check still read it. Both now read `showcaseTsukubaCircuitClean.a845b09b.glb` and pass (the cleaned file writes `alphaCutoff: 0.5` explicitly; the test asserts the effective value).

The failures shared with `v4.1.3` are environmental or stale, not regressions: gitignored generated reports under `tests/reports/` (claim lineage, evidence freshness, bundle scenarios), retired routes (`showcase-skyline-runner`, `showcase-turbo-drift-circuit`), no real WebGL in the test runner (`getUniformBlockIndex`), a network stub (`api.polyhaven.com`), and `replicability-metrics`. They are a pre-existing baseline to clean up, not 4.2.0 blockers.

## Preview deploy (Vercel, SSO-protected, checked with `vercel-auraone curl`)

Three build failures were found and fixed on the way to a green preview:

1. `game-inventory --check` treated an empty `evidence/` directory as "screenshots available". It now looks for a game evidence folder.
2. `gen-seo --check` required a dist folder for each new game slug, but those slugs are Vercel rewrites. It now follows `vercel.json` rewrites.
3. The canonical `/apps/<slug>/` URL of 11 new-slug games returned 404 (only the slash-less form resolved). `vercel.json` now has an explicit trailing-slash rewrite for each.

Last preview: all 26 inventory URLs return 200; old `showcase-*-port` slugs return a 308 to the new slug; the homepage says "26 games" / "26 playable games"; the homepage, comparison page, examples index, `llms.txt` and `llms-full.txt` contain no "800K", "855K", "15 games", "4 playable" or hosted catalog/index wording. `gen-seo` was also made idempotent (it appended a blank line to `llms-full.txt` on every run).

## Open blocker: Diamond bat grip

Not fixed. `evidence/aura-diamond-3d/rework/polish/grip-strip-stance-to-140ms.jpg` still shows the bat leaving the hands from about 120 ms into the swing (see the "Not fixed" paragraph in `evidence/aura-hoops-3d/rework/polish/README.md`: the bat attaches to `RightForearm` before the procedural arm override). The `diamond-verify` agent ended without pushing a fix or a number. A remote rerun of `tests/browser/grip-diamond.spec.ts` (run `pre420-grip`) timed out after 10 minutes waiting for `window.__AURA3D_GAME_DIAMOND__`, a hook installed inside a per-frame callback, so the spec cannot measure `knobToHand` yet. It needs its own lane: fix the attach order (or drive the bat from the solved palm), and make the spec wait on `__AURA3D_GAME_EVIDENCE__` at a small viewport.

## animation-studio

`89687b909` (casts and props resolve from open sources, not the retired asset-index worker) is on `game-rework` and is included in the previews above; its unit tests are part of the baseline comparison.

## Not done here

- Browser smoke of every live game against the deployed site: the preview is SSO-protected and no bypass secret was created. It runs after the production deploy (runbook section 8).
- Real-GPU evidence: none anywhere. HEATSINK and Last Train do not finish on software GL.
- Trademark clearance for the new names; hard enforcement of the per-game Meshy cap.
