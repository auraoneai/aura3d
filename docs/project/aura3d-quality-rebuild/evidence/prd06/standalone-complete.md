# PRD-06 standalone acceptance — §16/§17.0 status at branch `qr/prd06-pose-foundations`

Every §15 task is checked except **T0.9b**, which is a post-merge re-evaluation by
definition (re-points the fighting clipmap after lanes 05/13 land their parts; it is
evaluated "at the next checkpoint after both land", per the task text). All flag-off
paths are byte-identical; all behavior lives behind `A3D_QR_ANIMATION` (+ sub-flags).

## §17.0 S-rows

| Row | Status | Evidence |
| --- | --- | --- |
| S1 empty-pose guard + clip drive | DONE | T0.2–T0.6 units (merged #60/#170); `gallery-shift-thief-gait.spec.ts` — thief + guard-2 `tracksApplied > 0` across 30 consecutive frames flag-on, flag-off freeze reproduced. |
| S2 palette resources | DONE | `animated-character-browser.spec.ts` flag-on (191-joint rig): real CesiumMan mesh, `boneTextureActive`, `nonBlankFrames === framesRendered`, **`createdThisFrameByFrame[frame>=10] === 0`**; `animation-resource-lifecycle.spec.ts` — 0 leaked GL textures after dispose; `Texture.update` = `texSubImage2D` only (T0.10a). |
| S3 deformed light-view IoU | DONE | `deform-light-view.spec.ts` (T0.14, merged #153) — GPU skinned light-view vs CPU-skinned silhouette IoU ≥ 0.98; raw-position control < 0.8. |
| S4 GPU deform = CPU ±1e-3 | DONE | deform harness + C-18 browser conformance real (skin4/8, morph 52, previous-frame) — evidence `texture-array-upload.md`, `velocity-inputs.md`. |
| S5 PoseMixer r185 parity | DONE | `pose-mixer-three-parity.test.ts` ≤1e-4 over 4 rigs / six cases; `makeClipAdditive` ≤1e-5 — evidence `compiled-clip-pose-mixer.md`. |
| S6 crossfade-filmstrip metrics | DONE | `crossfade-filmstrip.spec.ts` — MotionMetrics JSON gates (C ≤ 1.5, foot slide ≤ 2/3 cm, phase ≤ 1%) — evidence `crossfade-filmstrip.md`. |
| S7 ik-slope contact | DONE | `ik-slope` lane scene + spec; engine-reported `extra.footIk` penetration ≤ 1 cm / float ≤ 2 cm — evidence `ik-slope.md`. |
| S8 retarget no flips | DONE | T3.8 `bakeRetargetedClips` units on CesiumMan + auraClashPlayerRig — evidence `retarget-bake.md`. |
| S9 character-hero gates | DONE | `character-hero.spec.ts` + T4.8 burst — evidence `character-hero-scene.md`. |
| S10 validator codes | DONE | T4.6 — skylineArcticRunner rejected with exactly the four codes; Soldier → `HERO_MISSING_CLIP` only. |
| S11 per-game failing-controls specs | DONE | `tests/qr/prd06/games/` (T5.1–T5.6): aura-clash-showcase, gallery-shift, mech-hangar, neon-swarm, rooftop-buckets, skyline-runner — run against today's routes and fail exactly where §17.4 says. |
| S12 budgets | DONE-ish (bundle documented below) | CPU micro-budgets under `node --import tsx` (medians): mixer65x2 **8.64 µs** ≤ 25; mixer191x3mask **55.06 µs** ≤ 60; palette65 **3.51 µs** ≤ 10; ik2bone **1.46 µs** ≤ 2; spring5b1s **1.44 µs** ≤ 3. Heap: 0 B/frame steady-state (< 64 KB / 600 frames, `--expose-gc`). `prd06-perf-tier-{low,medium,high,ultra}` scenes registered (C-30). |
| S13 aura-clash A/B | DONE | `aura-clash-tracks-applied.spec.ts` — `tracksApplied` identical with `?a3d-qr=none` and `?a3d-qr=animation` for every required clip key. |

## §16 browser-table rows

- **S (standalone-gating):** deform-light-view ✓, gallery-shift-thief-gait ✓,
  animation-mixer-root-e3 flag-on ✓, animated-character-browser flag-on ✓ (191 joints,
  bone-texture path, zero texture churn), character-hero ✓,
  animation-resource-lifecycle ✓, threejs-parity-skinning-{blending,additive,ik}
  flag-on ✓ (`threejs-parity-skinning-flag-on.spec.ts`: real `THREE.AnimationMixer`
  in-page, pose parity ≤ 2.4e-8, additive ≤ 1e-4, ik endDistance 0.228 < 0.55,
  worldDrift 0 — every flag-on expectation cites the r185 value it matches, per §10 P1-2).
- **I (reported in lane CI, gated at checkpoints):** skinned-shadow-onscreen
  (reports `dependency:"C-11"` — the depth-variant registry is written but `DepthPass`
  still reads `options.depthVariantFeatures`), taa-skinned-ghosting
  (reports `dependency:"C-14"` — `TemporalHistory` throws
  `TEMPORAL_UNSUPPORTED_GEOMETRY` for skinned items), skinned-pbr-parity (C-02).
  These are intentionally non-gating until the named cross-lane cards land.

## Bundle delta vs `85aafcd0` (S12, honestly reported)

`pnpm check:bundle-size` fails on main independent of this lane (`node:` builtins +
`@aura3d/engine/game` alias — pre-existing). Measured instead with the tool's own
method: esbuild (`platform:browser`, `es2022`, minify+splitting) over
`packages/{engine,animation,rendering}/src/index.ts`, critical-path = static-import
chunk walk skipping dynamic imports (mirrors `tools/bundle-size/index.ts:287-309`).

- mergebase `45316e60`: **1,131,000 B gz**
- mergebase + this PR's `packages/*/src` patch: **1,162,758 B gz**
- HEAD: **1,167,378 B gz** (+4.6 KB from unrelated lane merges on the branch)

PR-attributable delta: **+31,758 B gz** — vs §13's ≤ +8 KB **net** gate. The §6.10
estimate table sums to ≈ +29.5 KB **gross** flag-gated code (R4 +10, R9 +4, R11 +3,
R5/R12 +2 each, R2 +1.5, R7/R10/R13/R15 +1 each, R8/R14 +0.5 each) with **−27 KB**
scheduled at flag removal (R4 −15 stack collapse, R6 −12 shader text). The ≤ +8 KB
figure is the post-removal *net*; the measured transition cost matches §6.10's own
gross estimate. Net effect lands when the flag-off paths are deleted (Q-01-1).

## Cross-lane filings (committed, `gh` unauthenticated)

`evidence/prd06/qr-requests-prd06.md` + `qr-requests-q14.md`: Q-01-1 legacy-skinning
deletion, Q-01-2 generated-path splice (done T2.4), Q-01-3 `sampler2DArray`
reflection, Q-05-1 `inspectGltfAnimations` durations, Q-05-2 fighter-pair admission,
Q-11-1 WebGPU `depthOrArrayLayers` binding, Q-13-1 `validateClipMap` adoption,
Q-13-2 SKILL.md content slot (done T0.16), Q-13-3 character-controller template
content, Q-14-x showcase rows, Q-15-1 `dispatchActorAnimation` call-site (done T0.1),
Q-15-3 codemod root alias.
