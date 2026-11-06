# Template render evidence (503)

Captured with the REA MCP `capture_browser_scenario` (real Chrome, 960x540, 9 s settle, console + page-errors) against every template built from the edited sources in this branch (`packages/create-aura3d/templates/<name>`, vite build, loopback static server) with the published `@aura3d/engine@5.0.2`. PNGs: `evidence/templates-render-503/template-<name>.png`. Gate: `node tools/release/render-gate/index.mjs --templates --driver saved` over those captures (no browser stage).

Result: 19/20 pass the gate. "console errors" excludes the benign favicon/404 resource loads, which are listed separately.

| template | drawn | console errors | warnings | gate result | fixes |
|---|---|---|---|---|---|
| animation-channel | yes | 0 (+4 benign 404) | 10 (DEPTH_ALPHA_HASH_DEGRADED) | PASS | - |
| animation-studio | placeholder (by design) | 0 (+1 benign 404) | 1 | PASS | Gate: allowed-placeholder entry in render-gate (flat-frame reasons waived only while the page logs 'No scene loaded'); template unchanged. |
| architecture-interior | yes | 0 (+4 benign 404) | 1 | PASS | Round 1: model auto-fit scale. |
| arena-shooter | yes | 0 (+1 benign 404) | 0 | PASS | - |
| asset-inspector | yes | 0 (+4 benign 404) | 1 | PASS | - |
| character-controller | yes | 0 (+9 benign 404) | 1 | PASS | - |
| character-viewer | NO | 0 (+4 benign 404) | 1 | FAIL: no scene texture (7.0% textured blocks) | None. Frame is correct (figure on plinth, pale backdrop); fails only the 10% textured-block heuristic (7.0%). Not allow-listed, thresholds unchanged. |
| cinematic-scene | yes | 0 (+1 benign 404) | 0 | PASS | Round 1: 45-frame stepAsync warm-up for automated pages (was a near-black step(0) frame). |
| custom-scene | yes | 0 (+4 benign 404) | 1 | PASS | Round 1: model auto-fit scale, fog whitewash (fogDensityScale). |
| episode-builder | yes | 0 (+4 benign 404) | 1 | PASS | - |
| falling-blocks-starter | yes | 0 (+8 benign 404) | 0 | PASS | - |
| fighting-game | yes | 0 (+11 benign 404) | 19 | PASS | - |
| large-scene | yes | 0 (+4 benign 404) | 1 | PASS | Round 1: fog whitewash. |
| material-authoring | yes | 0 (+4 benign 404) | 3 (DEPTH_ALPHA_HASH_DEGRADED, TRANSMISSION_DEGRADED) | PASS | - |
| mini-game | yes | 0 (+12 benign 404) | 2 | PASS | Round 1: model auto-fit scale. |
| postprocess-scene | yes | 0 (+1 benign 404) | 1 (DEPTH_ALPHA_HASH_DEGRADED) | PASS | Round 2: luma scale 0.03 -> 1.5 (model() already fits to ~1.55 m, so 0.03 left a 5 cm speck); scene().background('#5560a8') replaces the black sky; three neon bars added for bloom/texture. |
| premium-product-viewer | yes | 0 (+4 benign 404) | 3 | PASS | - |
| product-viewer | yes | 0 (+4 benign 404) | 1 | PASS | Round 2: cabinet rests on the plinth top (y 0.15, was 1.08 floating) at fit scale 1 (was 0.66). |
| prompt-animation-channel | yes | 0 (+4 benign 404) | 1 | PASS | - |
| racing-starter | yes | 0 (+11 benign 404) | 1 | PASS | Round 2: model() fit (targetLength 3.2 / targetMaxDimension 24.65) centres the car and grounds both GLBs (they are authored off-origin); TRACK_Y -1.17 puts the asphalt at y=0; chase rig distance 8 / height 3.6 / fov 55; fogDensityScale 0.3; checkpoint/finish markers shrunk to flat strips (the old 0.7x1.2x4.2 m block filled the lower right). Round 1: 0.18 shrink removed. |

## Notes

- character-viewer: the frame is genuinely fine, so the template is untouched. The gate's `no scene texture` check (7.0% of 16 px blocks textured, threshold 10%) fires because the subject is one small figure on a flat plinth and a pale flat backdrop. This is a heuristic miss, not a rendering defect; no threshold was weakened and the row is not allow-listed.
- animation-studio: a fresh scaffold has no EpisodeDocument, so the route renders its empty-stage placeholder and logs `No scene loaded` by design. `ALLOWED_PLACEHOLDERS` in `tools/release/render-gate/analysis.mjs` waives only the flat-frame reasons for `template-animation-studio`, and only while that console message is present (black frames, errors and mount failures still fail). Covered by a test in `render-gate.test.mjs`.
- Warnings are engine degrade notices (for example DEPTH_ALPHA_HASH_DEGRADED) or diagnostics, not errors.
- Engine pin: all 20 templates depend on `@aura3d/engine@5.0.2` and `@aura3d/assets@5.0.2` (exact). The published 5.0.2 contains `scaleMode`, `targetMaxDimension`/`targetLength`/`targetHeight` on model() and `fogDensityScale` on looks.preset(), so the options used are supported.
- Fixture follow-ups: `tests/unit/tools/native-examples-catalog-fixture.test.ts` and `tests/fixtures/native-examples-catalog/expectations.json` were updated for the racing-starter scene (new region, rig pose, fit scales; the circuit-right-of-region check became a car-on-circuit grounding check) and the cinematic-scene 45-frame warm-up.
