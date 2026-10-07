# PRD-11 Phase 0 profile — Aura Clash (aura-clash-showcase)

Replaces "not profiled (5× gap)" in PRD-11 §1 / §9.6. Remote capture, GitLab
macOS (Apple M1 virtual, ANGLE Metal, headless Chrome 147), pipeline
[2919070060](https://gitlab.com/chahal-foundation-group/github-auraoneai/aura3d/-/pipelines/2919070060)
(GitHub trigger run 37472031871), sha c031be641b, `?a3d-qr=tiers`,
viewport 1920×1080 @1x, canvas 1360×660.

## Measured (harness rAF, never the engine counter)

| metric | value |
|---|---|
| frame p50 / p95 / p99 / max | **83.3 / 133.3 / 150.1 / 150.1 ms** |
| frames over 33 ms / over 50 ms | 58/59 / 58/59 (59 frames, 5017 ms span) |
| engine-reported fps | **60 (constant) — the fake counter Phase 0 targets** |
| draw calls (end) | 123 |
| console/page errors | none; all 5 shots non-blank |

`scopes`, triangles and readbacks: not exposed by this capture — the game's
production `GameRenderPreset` diagnostics report `{backend, fps, drawCalls,
renderSize, warnings}` only; the C-31 `frame`/`renderer.batching` sections
live in the lane-11 adapter diagnostics. Scope attribution lands when
Q-01-2/Q-03-1 (in-flight) expose per-scope timing to the game route.

## Top three costs (with causes)

1. **Fill cost at elevated DPR** — the app clamps DPR to 1.75 under
   `qualityProfile: "production"`
   (`apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:1530-1531`);
   the 1360×660 canvas renders ≈2.7 M device pixels for a scene that is
   already fill/post-bound (2 skinned rigs on a 98.6 k-tri textured city
   block). Governor render-scale + the C-27 row DPR cap are the levers
   (Q-14-4 still requests the route-side clamp removal).
2. **Production post chain** — `qualityProfile: "production"` at the same
   call site keeps the full bloom/fog/AA tail every frame; on the tier
   ladder this is the C-27 "medium" row's per-pass cost until the tier
   resolver can drop it.
3. **Per-node scene build** — 123 draws from hand-built arena/lighting node
   lists (`AuraClashArenaApp.ts:1028+`, `:1496+` spot rig) with no content
   dedupe; Phase 3 batching recovers the repeated-material items, the rest
   is honest geometry.

## Screens

`tools/quality-rebuild-capture/out/aura-clash-showcase/` in pipeline
2919070060 artifacts (5 shots, `likelyBlank: false`, luma σ ≈ 38).
