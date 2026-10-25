# Cross Hop: log platforms and load weight (2026-10-24)

Branch `game-rework`. Software WebGL2 (SwiftShader) on the remote runner, 1280x720. Not real-GPU evidence.

## Log platforms were near-black (fixed)

Cause: the instanced `m-logs`, `m-pads` and `m-stones` pools used a coloured base material (`#8b5a2b`, `#4f9e4f`, `#4b4b55`) and also applied the same colour per instance, so the colour was multiplied by itself (a `#8b5a2b` log renders as `#472c14`). The ground, detail and glow pools already used a white base material. The three pools now use `#ffffff` (`src/game/core.ts`). Compare sheets: `compare-1280-04-mid.jpg`, `compare-390-04-mid.jpg` (before left, after right): logs go from near-black maroon to brown.
Test: `tests/unit/cross-hop/instance-colors.test.ts`.

## Why the first lit frame took 74 to 154 s under software GL

Measured with `tests/browser/fixdc-crosshop-timing.spec.ts` (same runner, both builds, both orders; the page's own ready flag and game frame counter, not screenshot polling):

| | ready (s) | seconds per frame (frames 10 to 60) | JS heap |
|---|---|---|---|
| before, round 1 | 40.4 | 3.91 | 624 MB |
| after, round 1 | 14.8 | 3.27 | 553 MB |
| after, round 2 | 28.6 | 2.54 | 553 MB |
| before, round 2 | 38.6 | 3.48 | 662 MB |

- **The 74 to 154 s in the screenshot run was mostly probe cost.** The capture's `ready` polls a JPEG screenshot every 4 s, and each screenshot waits on the software-GL frame (3 to 4 s per frame here). The game itself was ready in about 40 s.
- **Asset weight was a real problem and is reduced.** Ten vehicle GLBs (eight cars, the tram and the train) carried three 2048 px textures each, 5 to 8 MB per model, about 50 MB of GPU texture memory per model. Their textures are now 1024 px (`tools/asset-optimize/texture-downscale.mjs`: dedup, weld, prune, colour and ORM JPEG q86, normal PNG, no mesh simplification): 70 MB of vehicle GLBs became 9.6 MB, the app's `public/aura-assets` went from 95 MB to 43 MB, ready time fell from about 39.5 s to about 21.7 s on average (n=2 each) and per-frame cost from 3.7 s to 2.9 s.
- **The remaining 2.5 to 3.3 s per frame is software rasterisation** of a 1280x720 frame with shadows and roughly 200 shadowed vehicle draws. It is not an asset problem and does not predict real-GPU speed. Skinned critter GLBs (about 2 MB each, mostly geometry) were left unchanged.
- The optimised files are new content-hashed GLBs; `aura.assets.json` and `src/aura-assets.ts` carry the new url, sha256 and size; the list and sizes are in `apps/showcase-cross-hop/aura-evidence/optimize/texture-downscale.json`.

## Not done

Real-GPU timing, and lazy-loading vehicle kinds that are not on screen at the start (all eleven instanced vehicle pools still load at boot).
