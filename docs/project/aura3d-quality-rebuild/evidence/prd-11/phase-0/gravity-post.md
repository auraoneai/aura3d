# PRD-11 Phase 0 profile — Gravity Post (showcase-gravity-post)

Remote capture, GitLab macOS (Apple M1 virtual, ANGLE Metal, headless
Chrome 147), pipeline
[2919070060](https://gitlab.com/chahal-foundation-group/github-auraoneai/aura3d/-/pipelines/2919070060)
(GitHub trigger run 37472031871), sha c031be641b, `?a3d-qr=tiers`,
viewport 1920×1080 @1x, canvas 1890×1050. Captured alongside the two games
the PRD names because it shares the V8 forced-floor set (PRD-11 §I5).

## Measured (harness rAF, never the engine counter)

| metric | value |
|---|---|
| frame p50 / p95 / p99 / max | **183.3 / 283.3 / 316.7 / 316.7 ms** |
| frames over 33 ms / over 50 ms | 26/27 / 26/27 (27 frames, 5117 ms span) |
| engine-reported fps | **60 (constant) — the fake counter Phase 0 targets** |
| draw calls (title→end) | 1264 → 1231 |
| console/page errors | none; all 5 shots non-blank |

`scopes`, triangles and readbacks: not exposed by this capture (game
production diagnostics only; see aura-clash.md). The 1231-draw figure is
the single most actionable number in the phase — this game is draw-bound,
not fill-bound.

## Top three costs (with causes)

1. **1231 draw calls** — the orbital-well scene emits dozens of primitive
   nodes per body: `apps/showcase-gravity-post/src/main.ts:325-440` loops
   `WELL_BODIES` creating per-body torus rings, wire spheres and moonlets
   (`BODY_MOONS` fan-out at `:422-424`), each a unique `Geometry` +
   `PBRMaterial`. This is exactly the Phase-3 content-keyed dedupe /
   multi-draw case: identical torus/sphere geometries with colour-varying
   materials.
2. **9+ live lights** — ambient + 2 directional + 6 point/spot practicals
   (`main.ts:1194-1209`, courier/parcel locality points at `:1207-1209`);
   forward-path per-light cost scales with the draw count above.
3. **Render size** — 1890×1050 at DPR 1 is ≈1.98 M px; on the tier ladder
   the governor's floor scale recovers this cheaply, but the draw-call
   count dominates the p50.

## Screens

`tools/quality-rebuild-capture/out/showcase-gravity-post/` in pipeline
2919070060 artifacts (5 shots, `likelyBlank: false`).
