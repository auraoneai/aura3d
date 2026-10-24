# Custom shaders: colour contract, chunks and NaN safety (4.1)

`material.custom({ glsl: { vertex, fragment } })` is the escape hatch for effects the
built-in materials do not cover (sky, water, energy, toon ramps). It has a colour
contract and three failure modes that cost real time on real GPUs. Chunk names and
signatures: `docs/api/glsl-chunks.md`.

## Colour contract

- A custom shader writes **linear light**. The output stage always sRGB-encodes it,
  and the default ACES operator tones it down further, so a hex colour written
  straight to `outColor` comes out greyer than authored (a day sky read grey for
  exactly this reason). Post effects are not the cause: bloom, grade, vignette and
  fxaa leave a custom shader's colour unchanged.
- To show a hex colour as authored: `#include <colorspace_decode>`, wrap the colour
  in `a3dSrgbToLinear`, and set `output: { toneMapping: "none" }` on the app.
  `<colorspace_encode>` provides `a3dLinearToSrgb` for the other direction.
- Any other tone-mapping operator still tone-maps custom colours; tune the exposure
  instead of compensating in the shader.

## Chunks

`#include <a3d_math>`, `<a3d_noise>`, `<a3d_sky>`, `<a3d_fog>`, `<a3d_triplanar>`
and `<a3d_toon>` are tested GLSL ES 3.00 helpers prefixed `a3d`. Use them instead of
pasting hashes, fbm, sky gradients or fog into every shader. Precedence when names
collide: built-in chunks, then these, then `registerShaderChunk`, then the material's
`patch`. A material that includes chunks is GLSL-only: it has no WGSL twin.

## NaN and Inf safety

Apple GPUs return NaN where a software renderer returns a number. One NaN in a
bright pixel is smeared across the whole frame by bloom, and the page presents black
even though the engine reports hundreds of draw calls.

- `pow` with a base that rounding makes slightly negative, `normalize` of a
  zero vector, `sqrt` of a negative, `acos` outside [-1, 1] and a divide by zero
  are the usual sources. Use `a3dSafeDiv`, `a3dSafeSqrt`, `a3dSafeAcos` and
  `a3dFinite` from `<a3d_math>`.
- The engine now injects a total `pow` into `material.custom` shaders that call
  `pow`, and drops non-finite samples in the output stage and the bloom downsample.
  Treat that as a net, not licence to skip clamps.
- A shader that declares an attribute or uniform it never reads is reported as
  `CUSTOM_ATTRIBUTE_UNUSED` or `CUSTOM_UNIFORM_UNUSED` and still draws.

## Related fixes that change what you see

- Directional shadows with a narrow-fov camera far from the scene (a tennis court at
  fov 15) darkened up to a third of the frame before the 4.1 depth clamp. A game
  that switched shadows off for that reason can switch them back on.
- `instances.mesh` and `batched.mesh` apply texture maps since 4.1; before that a
  textured model drawn through them was white.
- `model()` rejects http(s) URLs and models without a valid `sha256` and provenance:
  the scene then draws nothing. Declare models with `defineModelAssets`.
