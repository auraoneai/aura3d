# Serpentine Sky Run (Saiyan through the Snake way! port): frames

Two sets of frames from remote browser runs (ACR, SwiftShader WebGL2, 960x540) on the engine at 8045c31a9, which
gives `material.custom` shaders real view and projection matrices.

## Round 1 art pass: before and after (`art/`, run `ssw-art-1` for before, `ssw-art-2` for after; the runner there is the procedural figure)

Spec: `tests/browser/saiyan-snake-way-art.spec.ts` (frames printed as chunked log lines, rebuilt by
`tools/crayon-capture/saiyan-snake-way-art-frames.ts`). The world frames replay prefixes of the original's recorded
input (`tests/browser/data/saiyan-snake-way-reference-replay.json`), so "before" and "after" show the same game states.

| Sheet | Contents |
| --- | --- |
| `compare-before-after.jpg` | start, traffic (step 1800), surge, late road: pre-pass port (left) vs this pass (right) |
| `compare-states-after.jpg` | run, coils, end of road, and presentation states a replay never reaches: jump, slide, flight, fast surge, fall, leap |
| `compare-ui.jpg` | title with runner select, HUD, HUD at surge, results (before has no results screen) |
| `art/before/*.jpg`, `art/after/*.jpg` | the individual 960x540 frames |
| `art/metrics.json` | luma mean/std, 4-bit colour count, edge density, luma histogram and thirds means per frame, plus draw calls and node counts |

Structural numbers (before to after): distinct 4-bit colours per frame 188-300 to 440-510, edge density 0.019-0.031 to
0.027-0.033, luma spread 24-39 to 31-35. Draw calls 9 to 33 and scene nodes 310 to 783 (SwiftShader counts, not a GPU budget).
These say the frames carry more colour and detail; they do not say the port looks like the original.

## Round 2: matched in-run frames and the blind judge

In-run reference frames of the original now exist locally (`evidence/look-reference-frames/saiyan-snake-way/`, gitignored, never
committed). They were taken at base speed with no hits at 10,680 / 65,147 / 72,633 km (`ref-2`, `ref-3`, `ref-5`); `ref-4` is a crop of
`ref-3` and `ref-6` is the original's hell run, which the port does not have, so both are left out.

- Spec `tests/browser/saiyan-snake-way-match.spec.ts` drives the port with idle input at base speed, invulnerable, at 1280x720 and prints
  full-page JPEGs (HUD and stage banner included, like the references). The reached distances are s = 38 / 317 / 358 m against the
  references' 60 / 365 / 407 m: same stages and speed, 22-48 m earlier on the road.
- `match/before/`, `match/after/` hold those frames (before = port at HEAD de058cefd, runs `ssw-art-4`; after = this pass, run `ssw-art-5`).
  `compare-match.jpg` is before | after; `compare-match-with-original-LOCAL.jpg` adds the original and must not be committed.
- `tools/crayon-capture/saiyan-snake-way-judge.ts` is the heatsink judge protocol adapted: Kiro Prism, model `claude-sonnet-5.5`, seed
  20261023, 3 states x 16 passes = 48 trials per set, balanced randomised A/B order, same prompt for both sets (HUD visible in both).
  Results: `judge-results.json` (per-trial picks, confidence and stated tells). This is a model judgement, not a human one.

| | Judge identifies the original | 95% CI | "same game" | luma JSD | RGB JSD | palette distance | luma mean delta | edge density ratio (1.0 = original) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | 48 / 48 (chance 24) | 0.93-1.00 | 0 / 48 | 0.188 | 0.513 | 0.065 | +20.5 | 0.65 |
| after | 48 / 48 | 0.93-1.00 | 0 / 48 | 0.101 | 0.472 | 0.052 | +8.6 | 1.23 |

So the port is still fully distinguishable. The pixel statistics moved towards the original (luma divergence halved, mean brightness
gap down from 20.5 to 8.6, palette and RGB distances down); the judge's stated tells changed from "crude primitive runner, plain HUD"
to the things that remain: a different runner character and outfit, the original's portrait card and comic display face, and its
horned stone check-in gate (a stage set piece the port does not have), plus a narrower road with feathered rails and a tighter camera.

## Legacy frame names

`start.jpg`, `kaio-ken.jpg`, `traffic.jpg`, `late-road.jpg`, `end-of-road.jpg` are the same five moments as the earlier README
(steps 30, first highest-rung checkpoint, 1800, 4800, 5433), downscaled from the round 1 "after" frames.

Simulation parity is claimed by `tests/unit/saiyan-snake-way-port/reference-replay.test.ts` (183 recorded snapshots, 46 fields
each, within 1e-6 of the original) and by the in-page replay in `tests/browser/saiyan-snake-way-port.spec.ts`, not by the pictures.
The pictures are not a pixel match to the original; `examples/saiyan-snake-way-port/PORTING-NOTES.md` has the divergence table.

## Meshy art pass (2026-10-23)

Frames: `meshy-before/` (the previous pass: CC0 catalog runner, primitive props), `meshy-after/` (Meshy runner, gate, barrier, ogre, cart, feast, lanterns and
floating islands) and `compare-meshy.jpg` (before | after, four states). Production-renderer remote runs: `ssw-meshy-2` (art spec, passed, 0 errors) and
`ssw-meshy-3` (`tests/browser/saiyan-snake-way-meshy.spec.ts`, hazard close-ups, passed: 68-110 draw calls per frame, 0 errors). Models: see
`examples/saiyan-snake-way-port/assets/ATTRIBUTION.md`. Images are ignored by the repo's `*.jpg` rule; force-add them if they should ship.
The blind judge was not re-run for this pass.
