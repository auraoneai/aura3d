# Converting a GLSL `material.custom` to a portable shader graph

Status: EXPERIMENTAL pilot notes (lane A4, Aura3D 5.1 candidate). No claim is made that a converted material is pixel
identical or faster; the numbers are in `evidence/a4-portable/RESULTS.md`. Decision D4 applies: a game converts only after a
pilot passes the GLSL-vs-portable pixel-diff gate, and the GLSL path stays the default and the original.

Pilots, all behind the default-off `?portable=1` query flag (`examples/shared/portable-flag.ts`, a separate file so
the shared `lab-flags.ts` parser is untouched):

| Pilot | GLSL (default) | Portable (`?portable=1`) |
| --- | --- | --- |
| Last Train cloud sea | `examples/last-train-port/shaders.ts` `CLOUD_*` | `examples/last-train-port/portable.ts` |
| Silt and Signal water (original and inked look) | `examples/silt-and-signal-port/shaders.ts` `WATER_*` | `examples/silt-and-signal-port/portable-water.ts` |
| Roadster Rush decals and wakes | `render/decals.ts`, `render/wakes.ts` | not converted (instancing, see Pitfalls 6) |

## The pattern

A portable material here is `shaderGraph.material({ graph, uniforms, ...renderState })` from
`@aura3d/engine/shader-graph-runtime`. It returns the same `AuraMaterialSpec` that `material.custom(spec)` returns, so the
call site is a one-line ternary and the rest of the game (`handle.setUniform`, `runtime({ id })`) is unchanged:

```ts
material: readPortableFlag() ? portableCloudMaterial() : material.custom(cloudSpec())
```

`examples/shared/portable-graph.ts` is a small expression builder (`GraphBuilder`) so a port reads line for line
like the GLSL. It is a pilot helper, not engine API.

### Mapping table

| GLSL custom material | Graph |
| --- | --- |
| `uniforms: { name: { type: "f32" \| "vec3" \| "color3", value } }` | `g.uniform("name", "f32" \| "vec3")` plus the same initial value in `uniforms: { name: value }`. Keep the GLSL uniform name as the resource name: `handle.setUniform("name", v)` then works on both materials. `color3` is a `vec3` (the value is passed through untouched, there is no implicit decode). |
| varying `out vec3 vWorld = (modelMatrix * vec4(position, 1)).xyz` | built-in input `positionWorld` (vertex-to-fragment varying is generated). Local `position` is `positionLocal`; UVs `uv0`/`uv1`; normals `normalLocal`/`normalWorld`. |
| prelude `cameraPosition` | built-in input `cameraPosition` |
| prelude `u_time` / `time` | built-in input `time`. The pilots use an authored uniform instead (`siltTime`, `cloudPhase`) because the games drive their own clock; keep that. |
| `#include <colorspace_decode>` `a3dSrgbToLinear(c)` | `glslLike.srgbToLinear` (nodes: `max`, `div`, `pow`, `step`, `mix`; identical formula). A graph's unlit colour output is written as is (linear), exactly like `outColor` in the GLSL material, so decode stays explicit. |
| `outColor = vec4(rgb, a)` | `outputs.color = vec4` node (alpha is the fourth component). `outputs.opacity` multiplies it. Set `transparent`, `depthWrite`, `side`, `blending` on `shaderGraph.material` as on `material.custom`. |
| `helper()` GLSL functions called many times | `defineFn` graph functions (see Pitfalls 1) |
| `if (u > 0.5) { ... }` on a uniform | evaluate both sides and `select` (eager on both backends); loops with a fixed count are unrolled |
| `texture(sampler, uv)` | a `texture2d` resource and a `textureSample` node (not exercised by these pilots) |

### Author attributes

"Author attribute" here means anything the game feeds the shader: a uniform written per frame, or a per-vertex/instance
attribute. Uniforms map one to one (above). Custom vertex attributes (`attribute float size;` in the last-train weather points,
`fade` in the rain streaks) and per-instance data (`instanceMatrix` in the Roadster Rush wakes and decals) have no graph
equivalent: the graph compiler declares only `positionLocal`, `normalLocal`, `uv0`, `uv1` (and skinning). Those materials stay
GLSL.

### `a3d_lights` equivalents

None of the three pilot surfaces use `a3d_lights` or `a3d_scene` (cloud sea and water are unlit; the Roadster decals include
`a3d_scene` but are blocked by instancing). The graph route for a lit surface is the physical outputs, not a lighting include:
setting any of `normal`, `roughness` or `metalness` makes the compiler emit the scene-lit portable model (direct lights, hemisphere,
environment, shadows) with `color` as base colour and `emissive` added after lighting. A hand-written `a3d_lights` loop is therefore
replaced by outputs, not ported. This was NOT exercised or pixel-gated by the pilots; treat the lit route as unverified for
conversion purposes. The compiler note in `shaderGraph.ts` says the portable light model does not evaluate rectangular area lights.

## Pitfalls found

1. **512-node limit.** A graph counts every node, and an inlined GLSL helper is expanded at each call. `vnoise` (4 `hash21` plus
   blend) is ~50 nodes, the cloud sea calls it 8 times: the first port failed validation with `graph-limit: graph exceeds the
   512-node limit`. Declare called-many-times helpers as graph functions (`defineFn`): each call is one node and the body is counted
   once. A function body is a fresh scope, so only its parameters are visible (uniforms and built-ins must be passed in).
2. **No implicit scalar broadcast.** Every componentwise op, `mix`, `smoothstep`, `clamp`, `step`, `pow` needs equal operand
   types; GLSL's `mix(vec3, vec3, float)`, `x * 0.5`, `smoothstep(0.0, 1.0, vec3)` must be written with `construct`. The builder
   broadcasts an `f32` automatically; a hand-written graph needs the nodes.
3. **`select` is eager.** `cond ? a : b` evaluates both sides on both backends. Fine for cheap branches (water ink look), but a
   `pow(x, y)` or `sqrt` guarded by the condition still runs on the unselected input. Also, `less`/`greater`/`equal` accept scalars
   only.
4. **Unlit colour is not clamped or decoded.** The graph writes `rgb + emissive` straight to the output like `outColor`; sRGB
   decode, tone mapping inputs and exposure remain the author's job and are identical to the GLSL path as long as the formula is.
5. **Node ids are per scope.** Ids inside a function body are independent of the main graph; the builder restarts its counter per
   function. Constants are de-duplicated per scope.
6. **Instanced and attribute-driven materials cannot convert.** `rg instanceMatrix packages/rendering/src/program/ShaderGraphCompiler.ts`
   finds nothing: the compiler never emits instancing, so a graph on an instanced node would draw every instance at the origin
   transform. The Roadster Rush wake strips (`instanceMatrix` camera-facing billboards) and decals (kind encoded in the instance Y
   scale) therefore stay GLSL until the compiler grows an instance built-in (additive 5.1 candidate, not done here).
7. **`vec` + float constants.** GLSL `p * 9.0 + 3.7` mixes a vec2 with floats; in the graph that is two broadcast `construct` nodes.
   Count them when sizing against the 512-node limit (the builder de-duplicates constants, not broadcasts).
8. **WGSL needs finite inputs.** Graph docs state operands must be finite and `pow` bases non-negative; the sRGB decode clamps with
   `max(c, 0)` first, as the GLSL include does.

9. **A transparent graph material at the node-default `castShadow` casts a real opaque shadow.** The first Silt inked-look
   port failed the gate (whole frame relit, mean abs diff 14, GLSL noise floor 0.006) with a pixel-correct water shader. The GLSL
   custom material in the same node did not visibly cast. The pilot sets `castShadow: false` on the water node when `?portable=1`
   (`examples/silt-and-signal-port/world.ts`). When converting any blended or non-shadowing surface, set the node's `castShadow`
   explicitly and gate with shadows on (the key light of the inked look), not only with the original look, where the same flag
   changed nothing visible.
10. **WebGPU was not reachable through the games.** Both pilot games failed to mount on `?backend=webgpu` for non-material reasons
    (a probe node needing async frames; an instanced model whose `u_instanceMatrices` upload is the wrong size). A portable
    conversion cannot be gated on WebGPU until its host game mounts there; use the `custom-shader-webgpu-lab` pattern
    (`Renderer.create({ backend })` plus `createCustomShaderMaterial`) for a material-only WebGPU check.

## How to gate a conversion (D4)

1. Freeze time with `evidence/a4-portable/tools/shim.js` (virtual `performance.now`, `Date.now`, `requestAnimationFrame`).
2. Drive the same deterministic state (`?manual=1` plus `stepFrames(n)` on the last-train and silt hooks).
3. Capture three frames on the real GPU: GLSL, GLSL again (noise floor), portable (`evidence/a4-portable/tools/run.mjs`).
4. Compare mean absolute difference (0..255 per channel), maximum difference, and the share of pixels differing by more than 4 and
   16 levels, for the full frame and for the material's region; require portable-vs-GLSL to stay within the documented tolerance
   (in `evidence/a4-portable/RESULTS.md`) and not exceed the GLSL-vs-GLSL floor by more than it.
5. The flag-off frame must equal the pre-change frame (the default-path proof).
