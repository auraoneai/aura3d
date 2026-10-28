# Visual-regression verification of the 4.5.0 candidate

Run: 2026-10-28, branch `beat3js/vis` (candidate = `beat3js/integration` at `507d8afbe` plus the fixes below) against a clean `main` build (`1b89fe28b`). Software WebGL2 (SwiftShader) on Azure ACR Tasks via `tools/remote-acr/run.sh`, `CONTEXT_PROFILE=full` with real GLBs/HDRIs and every `apps/` tree staged, whole `tools/` tree in the image. No GPU numbers.

Both builds went through the same runner, the same spec list and the same image recipe; only the source tree differs. Reports are Playwright JSON; a test is compared by `file::title`.

## Coverage

| Step | Specs |
| --- | --- |
| Visual / parity / showcase / template / look specs found under `tests/browser` | 221 |
| Do not load on the runner, identically on `main` and the candidate (missing `tools/production-runtime-report-bridge`, absent `create-aura3d/dist`, `tests/assets/corpus` manifest, `benchmarks/`, `tools/muse3jsparity-readiness`, `tools/showcase-library`, `apps/advanced-examples-gallery` deps, a removed `createThreeCompatEnvironment` export) | 44 (excluded; load errors are the same on both trees) |
| Compared | 177 spec files listed; 325 tests produced a report on both trees (the 6 specs under "Not verified" produced none) |

Result per test (a test counts once):

| Outcome | Tests |
| --- | --- |
| pass on both | 151 |
| fail on both with the same error | 161 |
| fail on both with different errors | 7 |
| pass on `main`, fail on candidate (regression) | 1, fixed (below) |
| fail on `main`, pass on candidate | 3 |
| skipped | 2 |

The 161 identical failures are runner limits, not product signal: 62 `waitForFunction` timeouts and 18 test timeouts (SwiftShader is too slow for the heavy routes), 12 `ENOENT` (generated evidence missing in the image), 8 screenshot timeouts, a few GL submission errors (`0x502`). They fail the same way on `main`.

Not verified: 6 specs gave no usable report on at least one tree because they ran into the 1 h ACR cap or hit live production hosts, which are independent of the candidate source: `live-index-games`, `hf432-live-d1`, `live-ports-smoke`, `diamond-live-432-swing` (live sites), `shadow-banding`, `showcase-route-interaction-audit` (57 min on `main`, timed out on the candidate).

## Fixed: regression

`createAuraApp-postprocess-contract` (pass on `main`, fail on candidate): the harness booted the no-effects baseline with `qualityProfile: "production"`. Under the new default `quality: "auto"` that scene takes the direct render path, which has no post chain by design, so the spec's assertion `postprocess.pixelBacked === true` on the baseline failed. The spec asserts HDR-chain internals and reads the drawing buffer after the frame, so the harness now pins `quality: "production"` and `preserveDrawingBuffer: true` (`tests/browser/createAuraApp-postprocess-contract-harness.ts`). Passes on the candidate after the change.

## Fixed: apps that read the canvas back

Because `preserveDrawingBuffer` now defaults to false outside capture/evidence mode, routes whose own probes call `gl.readPixels` or `drawImage` on the root canvas after an awaited step read blank pixels. Each now opts in when its probe flag is present:

| App | Opt-in |
| --- | --- |
| `apps/aura-clash-showcase` (`AuraClashArenaApp.ts`) | `spotlightProbe`, test driver, `crowdProbe` |
| `apps/showcase-cinematic-architecture` | `spotlightProbe` |
| `apps/showcase-smart-city-control` | `crowdProbe`, `compositionProbe` |
| `apps/context-loss-recovery` | always (samples with `drawImage`) |

Re-running their specs did not turn them green, so these opt-ins are defensive, not proven to change a result here: `crowd-instancing-adoption-301` (smart-city), `spotlight-route-adoption-301` (cinematic architecture) and `showcase-cinematic-architecture-rendering` fail identically on `main` and the candidate, and still fail identically with `?aura3d-render=production` forcing the old pipeline on the candidate. The Aura Clash routes fail on `main` with `RenderDeviceError: WebGL2 LDR postprocess presentation failed: 0x502` (a SwiftShader error in the HDR path); the candidate's direct path avoids that error, and the same error returns on the candidate with `?aura3d-render=production`. After the error is avoided, the Aura Clash probe reports 0 visible pixels between the native and hidden crowd captures, the same 0 that Smart City reports on `main`. That is a pre-existing spec/runner problem for these pixel oracles, not shown to come from this change, and it needs a run on a real GPU to settle.

## Expected, documented differences (no baseline refresh needed)

- `post-luma` "daylight vignette" (`mean luma with effects on stays within a few percent of effects off`): fails on `main` (0.722 vs 0.78 floor), passes on the candidate. This is the stale-threshold finding from lane Q: the spec now pins both routes (see `evidence/exposure-parity/README.md`).
- `agent-api-visual-smoke` helper-vs-raw comparison and `hf432-live-d2` dot-dash dpr2: fail on `main` (an assertion failure and a 120 s screenshot timeout), pass on the candidate. The cause was not isolated; the screenshot timeout fits the lighter direct path, but that is a guess.
- `bank-shot-shot-visual`: `main` fails "first load must not be a flat frame"; the candidate passes that check and then times out pumping frames at 420 s. Both fail; the candidate gets further.
- `portable-custom-materials` (native WebGPU), `threejs-parity-public-scene` (`ENOSPC` file watchers), `crowd-instancing-adoption-301` and `spotlight-route-adoption-301` Aura Clash cases: both fail, error text differs for the reasons above (runner limits).

No intentional pixel change needed a golden refresh: the suite's threshold-based assertions did not move. Before/after frames for the intentional visual changes are in `evidence/exposure-parity/frames/` (exposure, look presets) and `evidence/vs-threejs/4.3.7/direct-path-parity.json` (direct vs production path).

## Tooling change

`tools/remote-acr/Dockerfile.playwright` copies the whole `tools/` tree (about 11 MB) and `run.sh` stages it. Previously only five tool directories were copied, so any spec importing another tool module aborted the whole Playwright run at load time.

## Caveats

- Only assertion-based comparison is possible: ACR ad-hoc runs have no artifact egress, so per-pixel diffs of spec screenshots between `main` and the candidate were not taken.
- Tests that fail identically on both trees give no regression signal either way. Of these, the pixel-readback oracles (crowd, spotlight) are the ones most worth re-running on a real GPU.
