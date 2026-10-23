# HEATSINK port: Phase B evidence

Port: `examples/heatsink-port/` (Time Trial, Vesper Heights). See `examples/heatsink-port/PORTING-NOTES.md` for what is exact, hand-ported and missing.

## 1. State parity (simulation): passes

`evidence/crayon-capture/heatsink-reference.json` is a remote capture of the original: 4 independent browser sessions and 4 replays of a 6000-step recorded input script agree exactly (max delta 0, identical track fingerprint, 202 snapshots; runs cc1en and cc1ep, earlier runs cc1db/cc1ec/cc1ed). `tests/unit/heatsink-port/reference-replay.test.ts` replays that script through the port and holds it to 1e-6 (observed worst about 1.6e-10; the capture's stated tolerance is 1e-3). The replay covers a crash and respawn, boost pads, a pickup and a lap boundary. Track length, 48 sampled frames, checkpoints, sections, boost pads (10), pickups (6) and barrels (12) match the original.

## 2. Blind A/B "same game": **FAILED again, the port is still distinguishable**

**This is a MODEL judgement, not a human one.** Judge: `claude-sonnet-5.5` through Kiro Prism (`/v1/messages`), tool `tools/crayon-capture/heatsink-judge.ts`, results in `judge-results.json` (every trial, the prompt, the seed). The prompt was not changed between passes of this exercise. 16 matched frame pairs (same simulation step of the same recorded run, original vs port, 800x450), 3 passes each with the A/B order re-drawn from a recorded seed (20261023; balanced within each pass), 48 trials, 0 errors.

Two protocol runs were made. Run 1 used the first frames (port sky black, original frames still showing the minimap and Exit button). Run 2 is the improvement pass: the port's sky now draws and the original's minimap and Exit button are removed from the frames.

| measure | run 1 | run 2 (current) |
| --- | --- | --- |
| identified the original | 48/48 = 100% | **48/48 = 100%** (95% CI 92.6% to 100%) |
| chance / exact binomial p | 50%, p = 7e-15 | 50%, p = 7e-15 |
| above the 70% bar, so distinguishable | yes | **yes** |
| judged "same game" | 0/48 | 0/48 |
| position bias (picked A / B) | 24 / 24 | 24 / 24 |
| by look (run 2) | | cruise 18/18, heat 12/12, boost 18/18 |

Structural metrics, run 2, mean over 16 frame pairs (0 = identical): luma-histogram Jensen-Shannon 0.385, 4-bit RGB histogram JSD 0.753, dominant-palette distance 0.082 (share-weighted, 0..1), edge density original 0.056 vs port 0.020 (port has 0.37x the edges). Per look: cruise luma JSD 0.307, heat 0.427, boost 0.434; edge-density ratio cruise 0.39, heat 0.42, boost 0.31. (Run 1: luma 0.388, RGB 0.736, palette 0.089, edge 0.057 vs 0.021.) The sky fix moved the luma and palette distances only slightly.

Remaining visible differences, ranked by likely impact (ranking from how often the judge's stated tells name each, plus my own reading of the frames; counts are tells across 144 listed phrases):
1. **Vehicle**: six primitives (orange boxes plus a white ball) vs the original's detailed multi-rotor drone with twin glowing thrusters (vehicle/drone/thruster named about 84 times).
2. **Sky richness**: the dome now draws a dark gradient with faint aurora, but there is no large ringed planet, no strong aurora bands, no haze layering (sky/aurora/planet about 100).
3. **Surface and material detail**: flat-shaded faceted cones for hills, no textures, normal detail, rock strata, foliage, arches or gantries (texture/terrain/mountain about 70; props, plants, arch a handful).
4. **Motion effects**: the original draws speed streaks, thruster light trails and boost particles; the port has only a few exhaust points (about 34).
5. **Road**: the original's asphalt has wear and neon curb detail; the port's is a flat fbm with thin lines (about 24).
6. **Lighting and grade**: the original has bloom, haze and a teal grade; the port has simple bloom and exponential fog (about 33 across lighting/haze/fog).
7. **Camera framing** (about 6).
None of these is a bug in the simulation; they are art-fidelity gaps that a 800-line hand port of 49 node materials does not close.

Other limits: one judge model, one prompt. Original frames are Playwright JPEG screenshots (q92), port frames are in-page canvas JPEG (q92). "Rain" frames of the Phase B exit are unavailable: rain only occurs on the original's Grand Circuit map, which is not ported. The three looks judged are cruise (Vesper aurora sky), heat (overdrive burning, steps 1140-1230) and boost (pad/checkpoint burst).

Conclusion: the Phase B exit item "HEATSINK blind A/B judged same game" is **not met**. The state-parity half is.

### Black sky: what was found

Remote probes (loading the port with a sky override and measuring the top of the frame; two runs) showed that even a solid-colour sky fragment shader produced no visible change with the original dome (`size: 3400`, `side: "back"`), and that `side: "double"` with `size: 900` was the only variant that changed the render. `side: "back"` at size 900 did nothing. The port now uses `side: "double"`, `size: 900`, and the frames show the dome. I did not isolate whether the 3400-unit size (a distance or culling limit) or the `back` cull setting is an engine defect; both were ruled out only empirically, and the solid-colour variants were inconclusive (that override may have failed to compile). No engine change was made, so no engine test was added. Open question for the engine team: `material.custom` `side: "back"` on `primitives.sphere` draws nothing when the camera is inside it.

## 3. Remote runs

| run | what |
| --- | --- |
| cc1db | module capture; cc1ec/cc1ed, cc1en/cc1ep state-reference captures |
| cc1fm, cc1fn, cc1fp, cc1fq | original frames at 16 steps (run 1, 4 parts) |
| cc1fu, cc1fv, cc1fw, cc1fx | original frames, overlays removed (run 2, 4 parts) |
| `heatsink-20261023T070840Z` | run 2 port frames, spec exit 0 |
| `heatsink-20261023T062559Z` (ACR chkk) | run 1 port spec: container exit 0 (the runner propagates the Playwright exit code); the log kept the 16 frame records but not the pass/fail summary lines. An earlier run of the same spec on the first visuals (`heatsink-20261023T052438Z`) also exited 0. |

`frames/` holds the 16 original and 16 port JPEGs.
