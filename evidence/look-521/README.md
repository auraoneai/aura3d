# Lane 521: game looks back to (at least) 4.7.18

Owner report, 2026-11-07: Pip's Big Leap (Quick Play, Whispering Forest) on 5.0.3 is far too dark. The 5.0.3 audit found
five live games worse than 4.7.18: Pip's Big Leap in all six worlds, Aura Diamond, Aura FC, Bunker Zero and Teleoperator.

## Frames

Each game folder has `4718.png` / `4718-play.png` (the 4.7.18 production deployment `https://759f81b8.aura3d.pages.dev`),
`503.png` / `503-play.png` (5.0.3 live, `https://aura3d.auraone.ai`), both from the 5.0.3 audit, and `branch.png` /
`branch-play.png` (this branch). `sheet.png` puts the six frames side by side with Rec.709 luma mean, p5/p50/p95 (0-255)
and mean HSV saturation. The numbers are also in `metrics.json`.

How the frames were taken: a real GPU (ANGLE Metal, Apple M4 Max) driving headless Chrome over loopback CDP, with Chrome
choosing its own debugging port. Each frame is 1280x720 with prefers-reduced-motion. A frame was saved only after the page
URL matched the requested route. Captures were serialised under `/tmp/a3d-rea.lock`. The play frame is 4 s after Play or
Enter; for Bunker Zero it is after clicking DEPLOY. The tools are in `tools/`.

The branch frames come from a Vite dev server on this worktree, which serves the 5.1.0 engine sources with this branch's
changes. They are not a production build, so the 4.7.18 and 5.0.3 frames used a 12 s settle and the branch frames a 20 s
settle (unbundled modules boot more slowly). The simulation runs on, so camera shots and traffic can differ between
columns. One example: Aura Diamond's branch load frame caught the walk-up close-up, and its play frame is the comparable
view.

| game | 4.7.18 mean (p5/p50/p95) | 5.0.3 | branch |
|---|---|---|---|
| Pip's Big Leap, Forest (Quick Play) | 103.9 (29/94/207) | 27.1 (0/18/98) | 114.6 (34/116/210) |
| Pip Wharf w2 | 128.1 (37/119/211) | 39.1 (1/24/93) | 131.7 (54/116/214) |
| Pip Clouds w3 | 159.0 (49/173/208) | 51.5 (9/47/97) | 169.0 (63/179/212) |
| Pip Ember w4 | 67.4 (20/57/153) | 113.3 (45/111/183) | 70.4 (25/63/155) |
| Pip Palace w5 | 91.3 (14/94/172) | 45.4 (1/35/108) | 95.3 (14/98/174) |
| Pip Starfall w6 | 81.9 (21/80/182) | 102.4 (21/108/202) | 85.1 (22/78/189) |
| Aura Diamond (play frame) | 82.1 (25/82/161) | 36.7 (2/22/157) | 85.3 (26/85/159) |
| Aura FC | 69.7 (3/73/130) | 106.4 (3/119/174) | 70.5 (3/74/131) |
| Bunker Zero (after DEPLOY) | 82.3 (21/73/169) | 67.2 (8/58/162) | 81.0 (14/71/175) |
| Teleoperator | 46.1 (12/37/125) | 34.0 (4/24/94) | 51.2 (13/42/125) |

## Root causes (in order of impact)

1. **Engine: the fused LDR present's AgX curve.** On the WebGL2 fused LDR route, operator 5 in
   `packages/rendering/src/webgl2/LdrPostprocessShader.ts` was the per-channel curve `log2(1 + x) / log2(17)` passed through
   a smoothstep. It maps scene white to 0.15 and mid grey to about 0.01. Per-draw pixel traces show the HDR scene was
   identical between 4.7.18 and 5.0.3 (forest sky 0.30/0.56/0.92 linear in both). The only divergence was this pass:
   4.7.18 compiled `LDR_OP 2` (ACES) and 5.0.3 compiled `LDR_OP 5`. The fix runs the coupled AgX transform that the
   output pass already uses.
2. **Engine behaviour change: `app.setOutput` now reaches the post chain.** Through 4.7.18, `setOutput` never fed the
   LegacyPost chain, so the post presets and exposures that Pip, Diamond and Teleoperator set per world, park or sky had
   no visible effect. Every world shipped, and was judged by the blind panels, at ACES with exposure 1. 5.0
   (`lanes/prd01/outputSurface.ts` calls `updateAuthoredPostOutput`) applies these settings. That switched Pip w1-w3/w5,
   Diamond and Teleoperator to AgX, and pushed Pip w4/w6 to 2.6x and 2.2x exposure, which washed them out. Forwarding is
   intended 5.0 behaviour, so the fix is per game: each game pins its output to what its looks were tuned under
   (`{ toneMapping: "aces", exposure: 1 }`).
3. **Engine: the Preetham sky's GPU uniforms.** The 5.0 Perez-fit rewrite of `preethamFrame` changed `sunE`, `betaR` and
   `betaM`, which the unchanged r185-style sky program (`sky.glsl.ts`) still consumes. `sunE` became a flat 1000 where
   r185 gives 123 at a 9° sun, and Mie became about 4x stronger. Diamond's Harbor sky drew at 15 linear instead of 0.7,
   and the bloom washed out the whole frame. The fix restores the r185 values for the GPU. The CPU Perez evaluation is
   unchanged.
4. **Engine: a texture-upgrade race.** A superseded primitive texture job still wrote `fetch`, `decode` and `decoded`
   into `textureStage` after the app replaced the material. The scheduler adopts the re-queued replacement only while its
   stage is `queued`, so the replacement stayed pending forever. Aura FC's pitch is re-tinted by `applyVenue` at boot, so
   it never got its turf textures and drew the flat mint tint (`fc-pitch: pending / decoded` for 40 s on 5.0.3). The fix
   limits stage writes to the current job.
5. **Bunker Zero.** 5.0 now renders the board-formed concrete albedo maps on the corridor walls and ceiling, which 4.7.18
   drew as the flat tint. The corridor is darker for that reason, not because of a defect. Output exposure 1.7 restores
   the 4.7.18 level and keeps the detail; the title card is unchanged (25.4 vs 25.3).

## Controls (engine changes must not move correct scenes)

`controls/` captures five games the audit rated "same" (Hoops, Cross Hop, Dot Dash, Slingshot Siege, Top Tennis) on the
same dev server: once with the release/5.1.0 engine files (`base/`) and once with this branch (`branch/`). The luma means
are equal. Mean absolute per-pixel differences are 0.04 to 0.37 on the static scenes, and 2.8 (Hoops) and 3.3 (Cross Hop)
on the animated ones, where crowd, players and traffic move. See `controls/sheet.png` and `metrics.json`.

## Not resolved

- **Pip Starfall (w6):** brightness is back to 4.7.18 (85 vs 82) and the large bloom blob is smaller. The near floor still
  reads milky lavender with soft bright blobs, where 4.7.18 drew a darker reflective slab. Removing the ambient emitter or
  the miniature depth of field did not change it; the cause is not found.
- **Pip Forest:** brighter than 4.7.18 near the camera (the lawn in the foreground is lit, where 4.7.18 shaded it) and
  slightly less saturated (0.43 vs 0.50).
- **Bunker Zero:** the floor decals (the "B-1 STONE GATEHOUSE" stencil) seen on 4.7.18 do not show on 5.0.3 or on this
  branch. That is a content or loading issue, not a look value.
