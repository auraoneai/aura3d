# Gridlock Courier road flip: investigation (lane p1-gridlock, 2026-10-25)

All runs: remote ACR, SwiftShader (software WebGL2), 1280x720. Nothing here is real-GPU evidence.

## Result

**The reported "road flips in and out of consecutive frames after a long jump" did not reproduce, so no root cause is proven.** Across 5 variants and 21 consecutive-frame samples plus 15 tour frames, the road was present in every frame. What the lane found and fixed on the way:

1. **A real bug in `roadPlane(cells)` (fixed).** For any cell count other than 1 or a multiple of 2 tiles, the V coordinate ran the wrong way inside each cell (`quad()`'s origin corner is the z1 edge), so the lane paint, crosswalks and dashes landed off the street centre line. With the old code a 64-cell road differed from the single-quad road by a mean 6.9 to 25.1 luma over the lower 40% of the frame (`frames/tour-stop*-cells64-oldUV.jpg` against `tour-stop*-single-quad.jpg`); with the fix it differs by 0.5 to 1.5 (`tour-stop*-cells64-fixedUV.jpg`). The game ships one quad, so players never saw this, but the first wave of this investigation did (a 16-cell road looked "right" and the single quad "wrong", which was the opposite of the truth: the signals stand at the corners of the single-quad crosswalk). Pinned by `tests/unit/drift-and-deliver-port/road-layers.test.ts` (UV is a pure function of x and z for 1, 17 and 64 cells).
2. **`warmPrograms` now waits for pending texture upgrades** (`waitForTextures`, default true, `textureTimeoutMs`), the same way it waits for the environment HDRI. A material that gains its texture switches to a textured program variant that compiles asynchronously, which is the mechanism that dropped the road in the first frames before `warmPrograms` existed. On this runner nothing was pending by the time `ready()` resolved even with the wait off (`@@GX warmtex0`: pending 0, 14 textured, 113 draw calls on all 6 frames), so this is hardening of a plausible mechanism, not a demonstrated fix. Unit tests in `tests/unit/game-warm/warm-programs.test.ts`.
3. **Probe** (`tests/unit/drift-and-deliver-port/road-layers.test.ts`): every triangle of the road plane, park and plaza decals, outer ground and harbour water faces up (normal.y > 0.9) and agrees with its stored normals; no prop instance transform mirrors its model (positive finite scale); the outer ground is a frame around the road square, never a plane under it.

## What was ruled out (runs `p1grid-*`)

| variant | query | frames | road present |
| --- | --- | --- | --- |
| single quad (shipping) | `?manual=1` | 8 consecutive after a 300 m jump | 8 of 8 (luma spread 35.9 to 38.3) |
| no post, shadows or AO | `post=0&shadow=0&ao=0` | 8 | 8 of 8 |
| heal reload disabled | `heal=0` | 8 | 8 of 8 |
| 16 cells (old UV) | `roadcells=16` | 8 | 8 of 8 (paint misplaced, see 1) |
| tour of 5 stops | default, `roadcells=1`, `roadcells=64` | 5 each | 5 of 5 each |
| texture wait on / off | `warmtex=0` | 6 each | 6 of 6, 113 draw calls constant |

Winding and normals are not the cause: the road plane faces up and the engine already flips cull state for negative-determinant instance transforms (`ForwardPass.ts`, `instancedItemNeedsPerInstanceCullState`), so no library change was needed there. UV handedness is mirrored relative to a naive mapping (v = 30 - z), but it is symmetric about the street centre lines and is how the single quad has always rendered.

## Still unknown

Why single frames on a heavily loaded shared runner sometimes read as flat ground minutes apart (`rework/render-fix/README.md`). Not reproduced here. Next step if it recurs on a real GPU: log the per-frame draw list in the failing frame (the forward pass skips items whose program is pending; no draw list is exposed).

## Reproduce

`RUN_ID=p1grid-<name> SPECS="tests/browser/gridflip-<variant>.spec.ts" tools/remote-acr/run.sh` (variants: base, cells16, nopost, noheal), `gridtour-{default,cells64,single}.spec.ts`, `gridtex.spec.ts`. Frames are in the log as `@@FG` chunks.
