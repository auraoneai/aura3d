# Visual review: the gate now works — here is what signing takes

The gate was **broken, not merely unsigned**. It is now fixed at the engine and tooling layers, and a
signature will hold. Full analysis in `GameEngine-PRD.md` §3.1.

## What was wrong

Re-running `tests/browser/showcase-library.spec.ts` with **no code change** produced different bytes
for **14 of 29** screenshots. Approval binds to `sha256` of those bytes, so every regeneration killed a
still-correct signature. The only way to keep the gate green was never to re-run the spec — which is
why it went red before 1.5.2 and the release shipped anyway.

Four separable defects, all fixed:

| # | Defect | Fix |
|---|---|---|
| 1 | No way to reach a running app; capture could only photograph an arbitrary frame | `auraAppRegistry` (`pauseAll` / `resumeAll` / `settle`), on `globalThis` so no route opt-in is needed |
| 2 | `settle(30)` meant "30 steps after however long loading took" | `settle` rewinds the runtime clock first |
| 3 | `step(dt)` rendered at wall-clock time, so time-driven shaders varied | renders at simulated time, in **both** render paths |
| 4 | Byte equality is unachievable even when settled (GPU rasterisation is not bit-reproducible) | `perceptualSignature` fallback in the gate |

## Measured result

Release-candidate screenshot stability across **three independent runs**:

| stage | release candidates stable | all screenshots |
|---|---|---|
| before this work | 1 of 8 | 15 of 29 |
| registry + clock rewind | 7 of 8 | 22 of 29 |
| + production-path fix | **8 of 8** | 24 of 29 |

And with perceptual signatures recorded against the owner's committed approval verbatim — no verdict,
reviewer or scope altered — screenshot-binding failures fell **30 → 4**, total **45 → 19**.

## What signing now requires

The remaining 19 failures are **honest and expected**: 7 stale-source plus 4 source/route-health
hashes, because this branch genuinely changed route source, and 4 not-approved rollups downstream of
those. Changed code *should* require a fresh look. What no longer happens is a signature dying because
a screenshot was re-rendered.

1. Run `node tools/showcase-library/refresh-visual-review-baseline.mjs`.
   It rebinds every source, route-health, screenshot hash **and perceptual signature** to current
   artifacts. It deliberately resets `reviewer` to `pending` and all verdicts to `needs-work` — it
   cannot grant approval, by design.
2. Review the four public release candidates against their current screenshots in
   `tests/reports/showcase-library-screenshots/`:
   `showcase-product-configurator`, `showcase-smart-city-control`, `showcase-cinematic-architecture`,
   `showcase-digital-twin-ops`.
3. In `docs/project/showcase-visual-review.json` set, for those four only:
   - `verdict: "pass"`, `approvalScope: "public-release"`, `blockingIssues: []`
   - and at the top level `reviewer: { id, name, kind: "human" }`, `overallVerdict: "pass"`, a
     substantive `summary`.
   Leave every hash and `perceptualSignature` exactly as the tool wrote them — they are what bind your
   approval to these pixels.
4. **Do not approve** `showcase-blockfall-reactor`, `showcase-skyline-runner` or
   `showcase-turbo-drift-circuit`. They are `prototype-blocked`; `allRoutesOk` is expected to stay
   `false` and the gate asserts that.
5. Verify:

```bash
node tools/showcase-library/build-and-check.mjs
pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts
```

## Verified independently of the gate

Both flagship game routes were inspected directly: **Turbo Drift shows the car's wheels on the tarmac
and `STATUS Ready`** (WS-4.1 and WS-5.3 visibly live), and Skyline renders the hero grounded with
collectibles and gates. `showcase-library` passes 6/6; `check:quality-gates` reports 21 pass / 0 fail /
0 unproven; `check:game-runtime` 4 gates + 68 tests.

## Known remaining drift, not hidden

Four non-candidate screenshots still vary between runs: `webgpu-particle-lab` (desktop and mobile),
`material-asset-inspector` mobile, `skyline-runner` desktop. Two are `prototype-blocked` game routes.
The particle lab drives an emitter hard enough that residual float ordering still moves signature
cells. I could have made these pass by coarsening the signature; that weakens the gate for every route,
so I did not.

## The other release decision

`check:bundle-size` fails on a pre-existing overrun: `core-agent-api` is 578,017 B gzip against an
80,000 B budget. Measured at `v1.5.2` with the same instrument it was 567,890 B (7.10x), so this branch
adds 1.8%. 1.5.2 shipped with that gate *crashing* rather than measuring, so 1.5.3 is the first release
where the number is visible. The budget was deliberately not raised.
