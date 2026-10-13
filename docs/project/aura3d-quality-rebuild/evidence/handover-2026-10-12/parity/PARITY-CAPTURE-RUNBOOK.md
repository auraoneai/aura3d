# E3 step 6 — RoomEnvironment parity capture runbook

Prepared on `claude/live-fix-e3-parity-spec` (base: E3-2b tip). The parent
dispatches the GPU runs **after #1362 merges**; nothing in this branch
dispatches a workflow. Design rationale: `E3-STAGE2B-TRACE.md` §5 in this
directory.

## What was added

| Piece | Path | Role |
|---|---|---|
| Paired benchmark scene | `benchmarks/quality-rebuild/shared/scenes.ts` → `19-room-environment-parity` | No lights, no `environment` node, 06's metal/dielectric roughness sweep (`sweepObjects`) verbatim; three side carries `showcase.environmentStandIn: "room-environment"` |
| Aura adapter | `benchmarks/quality-rebuild/aura3d/19-room-environment-parity.ts` | `runAuraScene` exactly like `13-ibl-only` — hits the marked-fallback neutral room (`renderer/Background.ts`, `buildNeutralRoomLegacyProbe`); under `qr_flags=compiler,lighting` the E3-2b PRD-02 single-knob path is what renders |
| Three adapter | `benchmarks/quality-rebuild/three/19-room-environment-parity.ts` | `runThreeShowcase` (not 13's `runThreeScene`): the stand-in is only consumed in `three/lib/showcase.ts`, which binds `PMREMGenerator.fromScene(new RoomEnvironment(), 0.04)` + `scene.environmentIntensity = 1` |
| Float harness page | `benchmarks/quality-rebuild/scenes/prd02/room-parity-main.ts` (+ `.html`, `roomParity` input in `vite.lane.config.ts`) | pmrem-main machinery retargeted to the room: production legacy probe, factory `neutral("high")`, three `fromScene`, analytic mean luma |
| Browser spec | `tests/qr/prd02/browser/room-environment-parity.spec.ts` | ±10% linear-luma parity (pmrem.spec criterion verbatim) + analytic roughness-1 anchor; attaches all readback values as JSON evidence |

Registry note: the scene is base scene 19 (18 → 19 in
`tests/unit/contracts/impl/prd12-registry.test.ts` only; the
`prd02-legacy-golden-18` golden enumerates its own 18 ids and is untouched).
Derived masks give it `metal`; derived broken-controls do **not** include
`no-ibl` (derivation keys off an authored `environment`, which this scene
deliberately lacks) — flag-off identity for this scene is a `qr_flags=none`
arm, not a broken-control variant.

## Dispatch (parent, after #1362 merges)

Decisive tonemapped paired capture (benchmark suite, both engines, one
scene, L4-pinned so frames are never mixed across GPU classes):

```sh
gh workflow run qr-azure-gpu.yml \
  -f suite=benchmark \
  -f runner=azure-gpu \
  -f gpu_class=l4 \
  -f bench_scenes=19-room-environment-parity \
  -f bench_engines=aura3d,three \
  -f qr_flags=compiler,lighting
```

Flag-off identity arm (same scene, proves the conjunction still gates;
also the raw material for calibrating the sentinel tolerance below):

```sh
gh workflow run qr-azure-gpu.yml \
  -f suite=flags-bisect \
  -f runner=azure-gpu \
  -f gpu_class=l4 \
  -f bench_scenes=19-room-environment-parity,13-ibl-only,06-metal-roughness-sweep \
  -f bench_engines=aura3d,three \
  -f bench_flag_sets='none;compiler,lighting'
```

Optional scored arm: `suite=promote promote_flag=compiler` captures
defaults∓compiler with both engines and LPIPS/FLIP-scores against the three
frame (`promote-compiler.json` in the artifact). Note `lighting` is
default-on, so promote-on-`compiler` is the honest E3 delta; there is no
single workflow input for the `compiler,lighting` conjunction as a promote
flag.

Inputs reference (`.github/workflows/qr-azure-gpu.yml`): `suite`
(benchmark | flags-bisect | promote | …), `bench_scenes` (comma ids; empty
= workflow default set — **not** all), `bench_engines=aura3d,three`,
`qr_flags` (benchmark/games single set), `bench_flag_sets`
(`;`-separated, flags-bisect only), `gpu_class=l4` (runner labels
`self-hosted,azure-gpu,gpu-l4`; the job fails if the recorded renderer
string lacks ` L4`). `QR_ALL_FLAGS` already contains `compiler`.

The float spec is **not** run by qr-azure-gpu: it is a prd02 lane browser
spec. Run it wherever the lane bundle is built (macos-14 lane job today;
locally: build `benchmarks/quality-rebuild/scenes/prd02/vite.lane.config.ts`,
then the repo's prd02 Playwright config against
`tests/qr/prd02/browser/room-environment-parity.spec.ts`). Cross-check its
numbers against the L4 frames before believing either alone — that is the
point of having both.

## Where artifacts land / how to read pass-fail

- Artifact `qr-gpu-{suite}-{runner}-l4-{run_id}` (30 d) +
  `qr-gpu-checkpoint-…` (14 d), containing
  `benchmarks/quality-rebuild/out/` — per flag-set dir (sanitized set name)
  with `report.json`, per-scene PNGs + `.ready.json` + `.mask.png`,
  `renderer.txt` (must contain ` L4`), and for flags-bisect
  `bisect-summary.json`.
- Job red ≠ automatic fail of the experiment: the suite step fails on a
  red `none` control, a missing summary/artifact, or a loader error (e.g.
  git-lfs missing on the runner — `ci.sh` fetches only GLB corpus blobs;
  this scene needs **no** LFS assets, primitives only). Read
  `report.json` per scene: `status`, capability log (`implicit-environment:
  partial` is **expected** on the Aura arm — it is the fallback under test),
  and `extra.environment` diagnostics.
- The decisive comparison: per-sphere mean luma of the Aura
  `compiler,lighting` frame vs the three frame (spheres are 06's grid:
  metal row y=1.5, dielectric row y=0.5, roughness 0→1 left→right), **and**
  the float spec's `room-parity-readback` attachment (ratios per
  roughness). Tonemapped similarity without float agreement inside ±10% is
  not a pass; float agreement with a visibly wrong frame means the knob
  bind, not the probe, is at fault — the two arms of the harness
  (`production` legacy probe vs `prefiltered` factory neutral) split that
  attribution further.

## Known blockers (from the trace) and what settles each

1. **Sentinel identity tolerance is `null`** —
   `benchmarks/quality-rebuild/sentinels.json` `identityCheck.deltaE2000P99`
   stays null until an IC-0 pairwise flag-off repeat run measures it, so
   flag-off identity after E3 deletions currently has no calibrated gate.
   *Settling evidence:* two flag-off (`qr_flags=none`) captures of the six
   sentinel scenes on the same L4 runner/commit, `metrics.py` ΔE2000 p99
   across the pair, value written into `sentinels.json`. The flags-bisect
   dispatch above produces the `none` arm but not the paired repeat.
2. **RGBA16F filterability / `EXT_color_buffer_float` on the real L4
   Vulkan-ANGLE runners is unverified by reading** — the half-float preset
   (E3-2b step 2) and the harness's float targets both depend on it.
   *Settling evidence:* the benchmark run's `renderer.txt` plus a clean
   Aura arm (no float-upload throw in `report.json` errors), and the float
   spec executing `requireFloatTargets` without throwing on the same GPU
   class. A throw there is the blocker reproducing, not a spec bug.
3. **Runner availability/labels** (`self-hosted,azure-gpu,gpu-l4`) cannot
   be settled from the repo. *Settling evidence:* the dispatched job
   leaving the queue and `renderer.txt` recording an L4; `gpu_class=any`
   with a mixed-class queue would invalidate cross-run comparison, so keep
   the `l4` pin even if it queues longer.
4. **Numeric radiance parity of analytic `sampleRoomEnvironment` vs three's
   rendered + 0.04-blurred PMREM** is exactly what the float spec measures;
   the analytic anchor separates "sampler wrong" (all arms off the mean)
   from "prefilter/bind wrong" (arms disagree with each other but the
   r=1 anchor holds).

## Unverified until the parent dispatches

Everything GPU-shaped: that the Aura arm under `compiler,lighting` binds
the neutral room through the E3-2b path (vs silently serving the legacy
stack), half-float behaviour on L4, actual luma ratios, and LPIPS. Local
verification on this branch is limited to type/parse checks and unit
suites (no Playwright, no local GPU capture).
