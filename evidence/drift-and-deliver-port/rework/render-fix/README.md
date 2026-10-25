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

## Follow-up (grid2): road flip and translucent car

All runs: remote ACR, SwiftShader (software WebGL2) on a heavily shared runner, so one screenshot can take minutes. Nothing here is real-GPU evidence.

### Road flip: root cause NOT established

What was tested and what it showed:

- **Not canvas size alone, not the texture upgrade.** The first diagnostic (1280x720, long jump, `settle()`): the `road-tiles` node read `textured` with 0 pending in every sample, yet one sample had no road (luma spread 14.1) and the next, 228 s later, had it (27.0).
- **Not the old coplanar terrain, as far as it could be reproduced.** With the terrain still a full plane 3 cm under the road (`?ground=full`) and with the new ring-shaped terrain, the 1280x720 post-jump state drew the road in every sampled frame (spread 28.0, 28.7, 29.3). So the depth-fight idea is not demonstrated; the ring terrain (`outerGroundRects`) stays as hardening because a plane under the road is a latent depth tie, not because it was shown to cause the flip.
- **A late environment event does change the scene.** The 640x360 engine-diagnostics run shows `renderer.environment.hdriStatus` going `pending -> ready` and `iblPixelBacked false -> true` between two samples, with `programs.reused` jumping from about 1,500 to 3,000, i.e. every material moving to its image-based-lighting program, which compiles asynchronously (a draw whose program is pending is skipped). `warmPrograms` now waits for a pending HDRI (bounded) and settles again. In that run the road stayed present across the transition, so this is a robustness fix for a measured late recompile, not a proven fix for the flip.
- **Detector caveat.** The road detector first required yellow lane dashes; an intersection view has none, so it reported "no road" for frames that clearly show one. It now uses the luma spread of the lower street strip only (flat ground 14, a plain straight street 19, an intersection or long street 27 to 39), threshold 17.

Still unknown: why the first frames sometimes show flat ground. Next step if it recurs on a real GPU: log the per-frame item list in the failing frame (the forward pass skips items whose program is pending; no draw list is exposed).

### Translucent car: it was the baked texture, now repainted

- The GLB's single material is opaque (no alpha mode, no extensions, double-sided). The see-through look comes from the Meshy atlas: glass, interior and reflections baked into shard-shaped islands, on a closed shell that also carries inward-facing triangles.
- The model's `envMapIntensity` override cannot fix it: the override writes the legacy ambient uniform (`u_environmentIntensity`), not the image-based reflection term, and a `roughness` or `metallic` override multiplies the metallic-roughness texture (glTF semantics) instead of replacing it. The override is removed.
- A regenerated Meshy model was not possible: the `drift` ledger tag is at 440 credits, over its 420 cap.
- Fix with no credits: `tools/gridlock-car-retexture/` splits the same mesh by region into flat PBR materials (body, glass, tyre, rim, headlight, taillight, underbody) and drops the baked textures. Geometry, scale and origin are unchanged (39,182 triangles, 1.9 x 0.96 x 0.5), size 2.46 MB to 1.73 MB, deterministic output, `provenance/hypercar.repaint.json`.
- Frames: `car-after-repaint-1280.jpg` / `car-after-repaint-crop.jpg` (first repaint) and `car-final-1280.jpg`, `car-final-1440.jpg`, `car-final-crop.jpg` (final model). Car region mean luma 144 at both sizes, against 92 to 94 with 40% bright pixels before. The body reads as a solid painted car with a dark canopy and two taillights; the colour is a flat blue, the facets come from the original mesh's normals.
- Open: the silhouette is still a Meshy supercar. A different model needs Meshy credits (the `drift` tag is over its cap; a higher cap is the owner's call).

### Other games

`warmPrograms(app)` is the first-frame fix for every game that renders straight after `ready()`; it now also waits for the environment HDRI.
