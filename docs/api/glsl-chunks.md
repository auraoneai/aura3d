# GLSL author chunks for `material.custom`

`material.custom({ glsl: { vertex, fragment } })` shaders can pull in tested helpers with `#include <name>`. The chunks are GLSL ES 3.00, prefixed `a3d` so they never collide with your own functions, and none of them calls `pow` (so they compose with the automatic safe-`pow`). They were extracted from helpers that ten Crayon ports had each copied into their own `shaders.ts`.

```ts
material.custom({
  glsl: {
    fragment: `
#include <a3d_noise>
#include <a3d_fog>
out vec4 outColor;
void main() {
  float n = a3dFbm(vWorld.xz * 0.05, 4);
  outColor = vec4(a3dFogExp2(vec3(n), vec3(0.6, 0.7, 0.8), length(vWorld - cameraPosition), 0.004), 1.0);
}`
  }
});
```

Precedence when names collide: built-in renderer chunks < these author chunks < chunks registered with `registerShaderChunk` < the material's `patch`. Override any of them per material with `patch: { a3d_fog: "..." }`.

Custom shaders write linear light and the output stage sRGB-encodes it (see `colorspace_decode` below). These chunks are GLSL only: a material that includes them has no WGSL twin, so it renders on the WebGL2 backend (the default).

| Include | Stages | Provides |
| --- | --- | --- |
| `a3d_math` | vertex, fragment | `a3dSaturate(float\|vec2\|vec3\|vec4)`, `a3dSq`, `a3dLuma(vec3)`, `a3dSafeDiv(float a, float b)` and `(vec3 a, float b)`, `a3dSafeSqrt`, `a3dSafeAcos`, `a3dSafeAsin`, `a3dSafeNormalize(vec2\|vec3 v[, fallback])` (zero vector returns the fallback), `a3dRemap(x, inLo, inHi, outLo, outHi)`, `a3dFinite(float\|vec3\|vec4)` (NaN/Inf become 0), `a3dRot2(angle)` |
| `a3d_noise` | vertex, fragment | `a3dHash11/21/22/31/33` (sin-free), `a3dValueNoise(vec2\|vec3)`, `a3dSimplex2(vec2)` (range -1..1), `a3dFbm(vec2\|vec3, int octaves)` and `a3dRidged(vec2, int octaves)` (octaves up to 8) |
| `a3d_sky` | vertex, fragment | `a3dSkyGradient(dir, horizon, zenith, ground)`, `a3dSunDisc(dir, sunDir, angularRadius)`, `a3dSunGlow(dir, sunDir, falloff)`, `a3dHorizonHaze(dir, color, thickness)`, `a3dStars(dir, density)`; `dir`/`sunDir` are normalised |
| `a3d_fog` | vertex, fragment | `a3dFogLinear(color, fogColor, dist, near, far)`, `a3dFogExp2(color, fogColor, dist, density)`, `a3dFogHeight(color, fogColor, dist, worldY, density, heightDensity, heightBase, heightFalloff, maxFog)`; custom materials do not receive scene fog automatically |
| `a3d_triplanar` | fragment | `a3dTriplanarWeights(n, blendBias)`, `a3dTriplanar(sampler2D tex, p, n, scale, blendBias)` |
| `a3d_toon` | vertex, fragment | `a3dToonRamp(x, steps, soft)`, `a3dToonLight(n, lightDir, steps)`, `a3dToonRim(n, viewDir, width)`, `a3dToonStep(x, edge, soft)` |
| `a3d_shadow` | fragment | `a3dSunShadow(worldPos, normal, toLight)`, `a3dSunShadowAuto(worldPos, normal)`: 1 in light, less than 1 in the key light's shadow; set `receiveShadow: true` on the spec to include it automatically |
| `colorspace_decode` | vertex, fragment | `a3dSrgbToLinear(vec3\|vec4)`: use with `output: { toneMapping: "none" }` so a hex colour shows as authored |
| `colorspace_encode` | vertex, fragment | `a3dLinearToSrgb(vec3\|vec4)` |

Include several chunks in one shader freely: they define disjoint names.

## Sun shadows on custom materials

A `material.custom` surface receives the key light's sun shadow the same way the built-in lit materials do. Set `receiveShadow: true` on the spec (or write `#include <a3d_shadow>` yourself) and multiply the lit term by the factor:

```ts
material.custom({
  receiveShadow: true,
  glsl: {
    vertex: `out vec3 vWorld; out vec3 vN;
void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(normalMatrix * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`,
    fragment: `in vec3 vWorld; in vec3 vN; out vec4 outColor;
void main() {
  vec3 N = normalize(vN);
  float sun = max(dot(N, vec3(0.3, 0.8, 0.5)), 0.0) * a3dSunShadowAuto(vWorld, N);
  outColor = vec4(vec3(0.25 + 0.75 * sun), 1.0);
}`
  }
});
```

- `a3dSunShadowAuto(worldPos, normal)` uses the shadow-casting directional light's direction (`u_a3dSunDirection`, bound for you). `a3dSunShadow(worldPos, normal, toLight)` takes the direction to the light yourself, for a hand-tuned sun.
- The sun must cast shadows (`lights.directional({ shadow: true })` or a `shadow: { cascades, bias, normalBias, filter }` object). Cascade choice, bias, slope bias, normal bias, the PCF kernel and `strength` come from that light, so a custom surface and a PBR surface darken identically.
- With no shadow map in the scene, or when the item has `receiveShadow: false`, the factor is exactly 1.
- Only the fragment is affected: the surface does not cast through its own shader (set `castShadow` on the mesh as usual). GLSL only, like every chunk.

## Verification

`tests/unit/parity/glsl-chunks.test.ts` checks that every documented function exists, that names are `a3d`-prefixed and disjoint, that no chunk calls raw `pow`, `normalize`, `sqrt`, `acos` or `asin` unguarded, and that each chunk (and all of them together, alongside the safe-`pow` define) expands and compiles on the mock device. `tests/browser/glsl-chunks.spec.ts` compiles and links every chunk on a real WebGL2 context and renders known-value probes through `#include` (saturate, safe normalise of zero, safe divide, `a3dFinite` on a NaN, toon ramp, linear fog, sky zenith, noise range).
