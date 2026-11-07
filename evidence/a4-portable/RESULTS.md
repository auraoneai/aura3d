# A4 shader-graph pilots: GLSL vs portable pixel-diff gate

Lane A4, branch `lane/511-a4-shader-graph-pilots`, base `origin/main` e5387f3b0. EXPERIMENTAL: no claim of speed, parity of
other materials, or WebGPU support. Decision D4: a game converts only after a pilot passes this gate; none is converted here, the
portable path stays behind the default-off `?portable=1` flag.

## Method

- Real GPU: headless Chrome (ANGLE/Metal, Apple metal-3) over loopback CDP, one fresh Chrome per variant, 1280x720, DPR 1.
- Frozen clock: `tools/shim.js` (virtual `performance.now`, `Date.now`, `requestAnimationFrame`, from `origin/lane/504-bellkeeper`).
  Every variant is advanced to the same absolute virtual time (5000 ms) before capture, after the same scripted sim state
  (`?manual=1`, `stepFrames`, scripted input; `tools/lt-settle.js`, `tools/silt-settle.js`).
- Three captures per pilot: `glsl`, `glsl2` (the same GLSL page again = run-to-run noise floor), `portable` (`&portable=1`).
- Diff: per-pixel max-channel abs difference on 0..255. Reported: mean abs diff over channels, max diff, share of pixels with
  any change, share with a diff above 16. `full` is the whole frame (HUD included, identical in both), `region` the rectangle where the
  material is on screen.
- Proof the portable path is the one drawing: the route-health scene snapshot contains the GLSL source in the `glsl` run and
  `auraGraph_fn_vhash21 ...` (the compiled graph) in the `portable` run (`probes` in each `*-diff.json`).
- Tolerance (documented before reading the pass/fail): PASS when the region mean abs diff is at most max(0.5, noise-floor mean + 0.25)
  AND the share of pixels above 16 is at most max(1 %, noise-floor share + 0.5 %). Max diff is reported, not gated (it is set by a
  handful of alpha-edge pixels).

## Results (WebGL2, real GPU)

| Pilot | Region | glsl vs glsl2 (floor), mean / max / >16 | glsl vs portable, mean / max / >16 | Verdict |
| --- | --- | --- | --- | --- |
| (a) Last Train cloud sea, `portable.ts` | y 330-720, full width | 1.725 / 8 / 0 % | 1.701 / 9 / 0 % | PASS (equal to the floor; the diff image is uniform per-pixel noise with the HUD exactly zero, consistent with the output dither the game enables, not confirmed by isolating it) |
| (b1) Silt water, original look, `portable-water.ts` | x 0-470, y 330-560 | 0 / 0 / 0 % | 0.0745 / 55 / 0.169 % | PASS (full frame 0.0205 / 55 / 0.025 %) |
| (b2) Silt water, inked look | x 0-470, y 330-560 | 0.0057 / 5 / 0 % (full frame floor 1.46: other animated content) | 0.0201 / 35 / 0.037 % | PASS (full frame 0.0024 / 35 / 0.004 %) |
| (c) Roadster Rush decals / wakes | n/a | n/a | n/a | NOT CONVERTED, blocked: both use per-instance data (`instanceMatrix`); the graph compiler emits no instancing (see portable-conversion-pattern.md, Pitfalls 6) |

Files: `last-train/`, `silt/` (`*-glsl.png`, `*-glsl2.png`, `*-portable.png`, `*-diffx8-*.png` = abs diff times 8, `*-diff.json`).

### Finding that changed the result: shadow casting (silt inked look)

The first silt run (inked look) failed the gate: region mean abs diff 13.87, full frame 14.11 / max 205 / 39.7 % of pixels above 16,
against a GLSL-vs-GLSL region floor of 0.006. The whole frame was relit (ground shadow bands, tree shading), not just the water.
Cause isolated with a temporary `?cs=0` switch (not committed) that sets `castShadow: false` on the canal node for both materials
(`castshadow-experiment/`): GLSL cs1 vs GLSL cs0 = 1.70 (floor), portable cs1 vs portable cs0 = 14.69, GLSL cs1 vs portable cs0 = 1.34.
A transparent graph material left at the node-default `castShadow` casts a real opaque shadow; the GLSL custom material's
caster is not visible in the frame. The pilot therefore sets `castShadow: false` on the canal node only when `?portable=1` (world.ts);
the GLSL default is unchanged. The pre-fix `silt-inked` artifacts were overwritten by the final run; only the numbers above are kept.
The original look, with the same flag, also passed before and after the change.

### Default path unchanged (flag off)

Branch frames with the flag off vs the same frames from `origin/main` code (`default-path-vs-origin-main.json`, `tools/default-path-compare.py`):

| Frame | mean / max / changed | Same-code noise floor |
| --- | --- | --- |
| silt, original look | 0 / 0 / 0 % (byte identical) | 0 |
| silt, inked look | 1.243 / 193 / 11.8 % | 1.462 (branch glsl vs glsl2) |
| last-train | 1.621 / 8 / 73.5 % | 1.615 (origin/main), 1.655 (branch) |

The two non-identical frames are inside their own run-to-run noise (dither and animated content); the source change with the flag off
is two static imports and one `readPortableFlag()` call per material build.

## WebGPU (EXPERIMENTAL, not achieved)

WebGPU is available in this headless Chrome (`--enable-unsafe-webgpu`, adapter vendor apple, architecture metal-3), but neither
game mounts on `?backend=webgpu` for reasons that are independent of the material, so no portable-on-WebGPU frame exists:

- last-train: `WEBGPU_PROBE_CAPTURE_ASYNC_REQUIRED: configure frameMode as async for probe capture` (the game's probe node).
- silt (original look): `Portable numeric uniform has the wrong number or kind of components {"binding":"u_instanceMatrices","expected":1024,"actual":704}`
  (an instanced model in the scene, not the water).

Recorded in `webgpu/*-diff.json`. WGSL for both graphs is generated and structurally validated (`tests/unit/rendering/portable-pilots-graph.test.ts`
compiles GLSL and WGSL); it was not run on a GPU.

## Not verified

- WGSL execution of the pilot graphs on a GPU; any WebGPU parity.
- Other chapters, night/storm looks, other cameras; one fixed view per look.
- The lit route (graph `normal`/`roughness`/`metalness` outputs replacing an `a3d_lights` surface): no pilot surface uses it.
- Performance (frame time, program-compile time); the portable materials add graph functions and compile paired GLSL/WGSL.
- Bundle size effect (the default bundle now imports `shaderGraph.material` through the two example modules); not measured.
- The 25 live games beyond the two touched ports: no other game imports the changed files.
