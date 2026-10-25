# Gridlock Courier: road missing in the first frames (and what is still open)

All runs: remote ACR, headless Chromium on SwiftShader (software WebGL2), shared with many other runs. Nothing here is real-GPU evidence.
Spec: `tests/browser/fixgrid.spec.ts`. Runs: `fixgrid-1` to `fixgrid-9` (logs were read from the ACR output; the frames are decoded from it).

## Root cause found and fixed: the first frame was partial

`await app.ready()` settles the mount, not the shader programs. Programs compile asynchronously (KHR_parallel_shader_compile) and the forward pass skips a draw whose program is still compiling (`ForwardPass.getShader`: "async-skip"). The port rendered straight after `ready()`, so the first frame the player saw drew only part of the scene.

Deterministic measurement (draw calls the engine publishes on `<body data-aura3d-draw-calls>`, frames the player could see; `first-frame-sequences.txt`):

| build | visible frames (draw calls) |
| --- | --- |
| `?warm=0` (old behaviour), runs 6 to 9 | 47, 113, 113, 113, ... (the first visible frame drew 47 of 113 calls) |
| default (`warmPrograms(app)` before ready), run 9 | 162, 113, 113, 113, ... (the first visible frame is whole; 162 includes the shadow cascade pass) |

The warm-up cost on this loaded runner: 2 precompile passes, 1 warm frame, 3 settle frames, 15.3 s (`@@FGWARM`); on a real GPU it is milliseconds.

Fix: `warmPrograms(app)` (new, `@aura3d/engine/game`): precompile, step a frame so the renderer kicks the exact feature records, precompile again, then step frames until `app.diagnostics().drawCalls` is the same on 3 frames in a row. The port awaits it before it marks itself ready. Its QA hook gains `settle()`, and `?warm=0` keeps the old path for diagnostics. 7 unit tests in `tests/unit/game-warm/`.

## Not caused by canvas size

Three 1440x900 loads in one run gave bit-identical statistics (the road drawn each time); the one frame without the road in that run was the first, cold, 1280x720 load. Size is not the variable.

## Frames

- `before-first-load-1280-no-road.jpg`: run 2, first load, old code: flat grey-green ground, no asphalt or markings (road spread 14.2, lane dashes 0).
- `after-warm-1280-road.jpg`: run 9, same state with the fix (road spread 27.0, lane dashes 0.0044). It is the second screenshot of the state, see below.
- `after-1440-road.jpg`: run 2, 1440x900 (road drawn).
- `car-before-crop.jpg`, `car-smoothed-texture-crop.jpg`: the hypercar before and after smoothing its textures (no visible change; see below).
- `metrics.txt`: `python3` measurements of those frames (road: lane dashes and luma spread over the lower road region; car: body core).

## Still open (not fixed here)

1. **The road still flips between consecutive frames after a long jump.** In runs 7 and 9, a PNG screenshot taken after `settle()` read as flat ground (dashes 0, spread 14.1) while the JPEG screenshot taken a moment later of the same page showed the road (0.0044, 27.0); in run 6 the first screenshot (1280x720) had no road and the 1440x900 one did. `settle()` waits for a stable draw-call count and does not remove it, so a program-variant wait is not the whole story. Next step: log the draw-call sequence and which items are drawn in the failing frame (a per-frame item list from the forward pass), and test whether the road quad is culled (zero-thickness 1 km bounding box) or its program variant alternates by frame. The spec records `@@FGLOOK-unsettled`, `@@FGLOOK` and `@@FGLOOK-again` per size.
2. **The hypercar still reads as translucent.** Its closed 39k-triangle mesh (0.4% open edges; an earlier "67% open" reading was a bug in my reader, which ignored the interleaved buffer stride) is not holey. Meshy's colour and metal/roughness maps are shard-shaped islands (the raw refine output has the same atlas). Smoothing both maps, and a paint override (envMapIntensity, roughness, metallic), left the car body core at mean luma 92 to 94 with 40% bright pixels in every run, so the bright canopy and body come from sky reflection and lighting, not from those maps; the override parameters do not appear to reach this material. Reverted. Needs either a regenerated model or an engine-side check of why model material overrides do not change this material.
3. **Every other game that renders straight after `ready()` has the same first-frame exposure.** Use `warmPrograms(app)` (docs: `docs/agents/build-a-game.md`).
