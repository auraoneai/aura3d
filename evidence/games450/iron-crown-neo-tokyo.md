# Iron Crown, Neo-Tokyo stage (night-city look): 4.5.0 vs 4.3.7 at steady state

Date: 2026-10-28. Capture: games450 spec, remote ACR run, 1280x720, software Vulkan (SwiftShader).

| build | commit | note |
| --- | --- | --- |
| old (4.3.7) | `1b89fe28b` | run `ic450-old-1028b` |
| new (4.5.0) | `6813d5d24` (main, tag v4.5.0) | run `ic450-new-1028c` |

Both builds ran the same timeline: open `/apps/showcase-iron-crown/`, press the setup toggle, pick the `neo-tokyo-rooftop` stage, wait 36 presented frames, shoot, wait 36 more frames, shoot again. Luma is Rec.709 (0.2126 R + 0.7152 G + 0.0722 B) on the 8-bit PNG. Clipped is the share of pixels with luma <= 2 or >= 253. Both builds drew 1535 (old) and 1543 (new) draw calls, `gameMode` playing, no console errors.

## Result

| shot | build | mean luma | p5 | p95 | clipped % |
| --- | --- | --- | --- | --- | --- |
| 36 frames after the swap | 4.3.7 | 31.4 | 0.3 | 95.6 | 17.78 |
| 36 frames after the swap | 4.5.0 | 33.5 | 0.4 | 101.3 | 17.13 |
| 72 frames after the swap | 4.3.7 | 31.4 | 0.3 | 95.8 | 17.77 |
| 72 frames after the swap | 4.5.0 | 33.4 | 0.4 | 101.3 | 17.23 |

At 72 frames (steady state; the 36 and 72 frame shots agree to 0.1 luma on each build): mean luma 33.4 vs 31.4 (+6.4%), p95 101.3 vs 95.8 (+5.7%), clipped 17.23% vs 17.77%. Mean absolute pixel difference between the two builds is 2.98 (of 255).

Verdict: within about 10% of 4.3.7. The look-fill fix (`01dd4877d`, `080991d2d`, `cbea8e52a`) restores the stage. Before the fix the same stage measured 9.4 (new) vs 31.4 (old), 74% clipped.

## Diagnosis questions

Does Iron Crown author `lights.ambient`, making the fill yield (`packages/engine/src/agent-api/looks/lookFill.ts`)? No. `apps/showcase-iron-crown/src` has no ambient or hemisphere light. `buildArena` in `src/main.ts` adds `looks.preset("night-city", ...)`, the stage nodes, the fighters, contact shadows, vignette, bloom, two light cones, one directional rim light and two spots. The `fighting.stagePreset` kit in `packages/engine/src/agent-api/game-kits/fighting.ts` adds no lights either. So `dropShadowedLookFill` finds no ambient light and keeps the `night-city` neutral fill (intensity 0.85); the stage is lit by that fill, as the 4.3.7 implicit neutral room did. The restored luma follows from the fill calibration, not from a yield.

## Capture caveat found on the way (not an engine defect)

The first 4.5.0 attempt (`ic450-new-1028b`) came out fully black (mean luma 6.3, 81% clipped, `drawCalls` 0, `gameMode` loading) with `RENDERER_MOUNT_FAILED: ... Unexpected token 'v', "version ht"... is not valid JSON`. The cause was the fresh git worktree: 43 of the staged `public/aura-assets/*.glb` files (for example `neonCyberPylonMeshy`, `showcaseModernBuildingOne`, `reactorFusionTurbineMeshy`) were Git LFS pointer stubs, not the GLB data. The 4.3.7 worktree had real files. Replacing those stubs with the real files from the main checkout (`cp -c`) gave the result above. Any capture from a new worktree needs the LFS pointers checked first; otherwise a black frame reads as a darkness regression.

## Method and cleanup

- Spec: `/tmp/games450-b1-final/games450-capture.spec.ts` plus one added test slug `iron-crown-s3` (the two shots above); decoder `extract_b1.py` unchanged.
- Runner: `tools/remote-acr/run.sh` (Azure ACR Tasks, no local Docker or Playwright), `KEEP_IMAGE=0`, unique RUN_IDs `ic450-old-1028b` and `ic450-new-1028c`. `az acr repository show-tags` lists no `ic450` tags afterwards.
- No engine or app source was changed.
