# HEATSINK port: Phase B evidence

Port: `examples/heatsink-port/` (Time Trial, Vesper Heights). See `examples/heatsink-port/PORTING-NOTES.md` for what is exact, hand-ported and missing.

## 1. State parity (simulation): passes

`evidence/crayon-capture/heatsink-reference.json` is a remote capture of the original: 4 independent browser sessions and 4 replays of a 6000-step recorded input script agree exactly (max delta 0, identical track fingerprint, 202 snapshots; runs cc1en and cc1ep, earlier runs cc1db/cc1ec/cc1ed). `tests/unit/heatsink-port/reference-replay.test.ts` replays that script through the port and holds it to 1e-6 (observed worst about 1.6e-10; the capture's stated tolerance is 1e-3). The replay covers a crash and respawn, boost pads, a pickup and a lap boundary. Track length, 48 sampled frames, checkpoints, sections, boost pads (10), pickups (6) and barrels (12) match the original.

## 2. Blind judge, before and after the art pass (two separately labelled questions)

**Both are MODEL judgements, not human ones.** Judge: `claude-sonnet-5.5` through Kiro Prism (`/v1/messages`). 16 matched frame pairs (same simulation step of the same recorded run, original vs port, 800x450, original HUD overlays removed), 3 passes each, A/B order re-drawn from a recorded seed (20261023, balanced per pass), 48 trials, 0 errors. Prompts were not changed between passes.

`compare-before-after.jpg`: port only (before left, after right), steps 1200, 1500, 3000, 4500.

### Question 1, strict: "which image is the original?" (`judge-results.json`, `tools/crayon-capture/heatsink-judge.ts`)

| | before art pass (run 2) | after (final, run f) |
| --- | --- | --- |
| identified the original | 48/48 = 100% | **48/48 = 100%** (95% CI 92.6% to 100%, p = 7e-15 vs 50% chance) |
| judged "same game" | 0/48 | 0/48 |
| by look | cruise 18/18, heat 12/12, boost 18/18 | cruise 18/18, heat 12/12, boost 18/18 |

**The strict reading of the Phase B exit (judge cannot tell them apart) is NOT met and was not moved by any iteration.** With procedural art the judge still finds a tell in every pair (top tells now: flat or low-poly look and missing texture detail on the vehicle and hills, then the vehicle model, terrain, road, props).

### Question 2, design: "same game design (track, HUD semantics, vehicle type, look-and-feel), even if rendering differs?" (`judge-results-design.json`, `tools/crayon-capture/heatsink-judge-design.ts`)

Symmetric: the judge is not asked which is the original. Same pairs, same seed.

| | before (run 2) | after (final, run f) |
| --- | --- | --- |
| "same design" | 13/48 = 27.1% | **38/48 = 79.2%** (Wilson 95% 65.7% to 88.3%) |
| "no" trials by step (after) | | 750: 2, 3660: 3, 3750: 1, 4500: 3, 5340: 1 (step 4500 is the terrain-overhead glitch below) |

**The design reading (same game design, different rendering) is met by this measure**: a clear majority of trials say same design, up from about a quarter. It is one prompt, one judge model, a noisy yes/no; repeated runs on near-identical frames gave 34/48 to 40/48 (runs b, d, e, f below), so read it as "about 70 to 85%", not as 79.2% exactly.

### Structural metrics (mean over 16 pairs; 0 = identical)

| | before | after |
| --- | --- | --- |
| luma-histogram JSD | 0.385 | 0.121 |
| 4-bit RGB histogram JSD | 0.753 | 0.465 |
| dominant-palette distance | 0.082 | 0.048 |
| edge density original / port | 0.056 / 0.020 (0.37x) | 0.056 / 0.057 (1.05x) |

### Iterations (all same judge, same seed; strict was 48/48 every time)

| run | change | strict | design |
| --- | --- | --- | --- |
| run2 (before) | six-primitive drone, faint sky | 48/48 | 13/48 |
| a (`iterations/art-a`) | first art pass | 48/48 | not run |
| b (`iterations/art-b`) | tuned: thinner plumes/veins, terrain | 48/48 | 40/48 |
| c | aborted: finite-difference terrain bump exceeded the 1,500,000 ms test timeout (SwiftShader), 15 frames; 42-trial partial: strict 42/42, design 36/42 | | |
| d (`iterations/art-d`) | screen-space-derivative bump; staged BEFORE engine fix `8045c31a9` | 48/48 | 34/48 |
| e (`iterations/art-e`) | same tree on the fixed engine; frames nearly identical to d (the custom-material matrix fix did not change this port, which never relied on it) | 48/48 | 38/48 |
| **f (final)** | hill footprint guard widened, terrain bump faded with distance | 48/48 | 38/48 |

### What changed in the port (art pass, `examples/heatsink-port/`)

23-primitive quad-rotor with spinning blades, twin thrusters, white-hot glow cores and thin additive plumes; ringed planet, two aurora ribbons, cloud layer, stars and moon on the **proper back-culled sky dome (no `side: "double"` workaround; the engine fix in `8045c31a9` and the 4.0.7 unused-uniform fix make it draw)**; textured procedural hills (smooth mounds, screen-space bump, snow line), ground plains, far ridges, rails with neon posts, gantry arches, floating shards; blue-grey mottled asphalt with cyan tracery and edge lines; 110 speed streaks; bloom, teal grade, vignette; chase camera framing. The simulation is untouched (reference replay still within 1e-6). No third-party art, textures, GLBs or code were used; original frames were look reference only.

### Remaining visible differences (ranked; my reading plus the judge's stated tells)

1. **Render quality**: no PBR, IBL or shadows; surfaces are procedural unlit shading, so they read flatter and lower-poly than the original's textured models.
2. **Vehicle**: 23 primitives, still blocky next to the original's detailed drone; thruster plumes remain brighter and more orange than the original's.
3. **Terrain**: bump shows blocky banding at some distances; no alien plants, ruins or cliff buildings.
4. **Camera-inside-terrain glitch at step 4500**: a hill or plain from another stretch of track fills the top of the frame (3 of the 10 design "no" answers). Not diagnosed to root cause; the footprint guard widening in run f did not remove it, so it is probably a plain strip from a higher track section, not a hill.
5. **Not ported**: title, pause and results screens, audio; the Grand Circuit (rain) map, so rain frames are unavailable.

Other limits: one judge model, one prompt per question. Original frames are Playwright JPEG screenshots (q92), port frames in-page canvas JPEG (q92). No measured look specs (`evidence/look-specs/heatsink*.json`) existed, so the look was matched by eye against the committed original frames. Run 1 (earlier): strict 48/48, same-game 0/48, kept as `judge-results-run1.json`; run 2 as `judge-results-run2.json`.

## 3. Remote runs

| run | what |
| --- | --- |
| cc1db | module capture; cc1ec/cc1ed, cc1en/cc1ep state-reference captures |
| cc1fm, cc1fn, cc1fp, cc1fq | original frames at 16 steps (run 1, 4 parts) |
| cc1fu, cc1fv, cc1fw, cc1fx | original frames, overlays removed (run 2, 4 parts) |
| `heatsink-20261023T070840Z` | run 2 port frames, spec exit 0 |
| `heatsink2-a-20261023T083810Z`, `-b-20261023T090427Z`, `-c-20261023T090727Z` (failed at test timeout), `-d-20261023T093732Z`, `-e-20261023T095014Z`, `-f-20261023T101403Z` | art pass port frames (f is final; `frames/port-*.jpg` are from f) |
| `heatsink-20261023T062559Z` (ACR chkk) | run 1 port spec: container exit 0 (the runner propagates the Playwright exit code); the log kept the 16 frame records but not the pass/fail summary lines. An earlier run of the same spec on the first visuals (`heatsink-20261023T052438Z`) also exited 0. |

`frames/` holds the 16 original JPEGs, the 16 final (run f) port JPEGs, and `run2-before/` (the 16 pre-art-pass port JPEGs).
