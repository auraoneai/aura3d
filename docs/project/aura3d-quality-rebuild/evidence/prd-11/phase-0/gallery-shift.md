# PRD-11 Phase 0 profile — Gallery Shift (showcase-gallery-shift)

Replaces "not profiled" in PRD-11 §1 / §9.6. Remote capture, GitLab macOS
(Apple M1 virtual, ANGLE Metal, headless Chrome 147), pipeline
[2919070060](https://gitlab.com/chahal-foundation-group/github-auraoneai/aura3d/-/pipelines/2919070060)
(GitHub trigger run 37472031871), sha c031be641b, `?a3d-qr=tiers`,
viewport 1920×1080 @1x, canvas 1682×1064.

## Measured (harness rAF, never the engine counter)

| metric | value |
|---|---|
| frame p50 / p95 / p99 / max | **100 / 150 / 183.3 / 183.3 ms** |
| frames over 33 ms / over 50 ms | 47/48 / 47/48 (48 frames, 5067 ms span) |
| engine-reported fps | **60 (constant) — the fake counter Phase 0 targets** |
| draw calls | 206 |
| console/page errors | none; all 4 shots non-blank |

`scopes`, triangles and readbacks: not exposed by this capture (game
production diagnostics only; see aura-clash.md). Engine warning at title
and end: "step() was called before the WebGL renderer finished mounting"
— a mount-ordering note for the game, not a renderer fault.

## Top three costs (with causes)

1. **Shadowed spot + practical point set** — `lights.spot` with
   `shadow: true` at `apps/showcase-gallery-shift/src/main.ts:1070`, two
   guard flashlights (`:1071-1072`), exit-sign point (`:1073`) and
   objective practicals (`:861`, `:1019-1029`); shadow map render +
   per-light forward cost on every frame.
2. **206 draws from hand-built set dressing** — environment/floor/guard/
   thief builders emit 52+ primitive calls
   (`src/main.ts`, `environment.ts:408/612`, `floor.ts`, `guard.ts`,
   `thief.ts`) with per-node materials; Phase-3 dedupe covers the
   repeated-geometry items.
3. **Fill/post at 1682×1064** — ≈1.8 M px canvas through the fog/bloom
   chain the scene authors (`main.ts:1062-1073` — "cool exit glow, shallow
   fog, restrained bloom"); governor floor scale is the lever (the game
   has no DPR clamp of its own — it already renders at DPR 1).

## Screens

`tools/quality-rebuild-capture/out/showcase-gallery-shift/` in pipeline
2919070060 artifacts (4 shots, `likelyBlank: false`).
