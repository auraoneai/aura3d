# Directional shadow softness (`shadow.softness`, `shadow.filter`, 5.7.0)

The sun's shadow edge has a width you can set. `shadow.softness` on a directional light (or `lights.key`, or a look's
`key.shadow`) is the reach of the receiver PCF kernel in shadow-map texels, the counterpart of three.js
`light.shadow.radius`. An explicit `shadow.filter` now wins over the quality tier's filter. Source:
`packages/engine/src/contracts/lighting.ts` (`AuraShadowOptions`), `packages/engine/src/agent-api/compiler/shadows.ts`
(`resolveShadowSystemConfig`), `packages/rendering/src/shadows/Prd02ShadowBridge.ts` (`prd02BridgeShadowFilterKernel`).

```ts
import { createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene({ background: "#9fb4c8" })
    .add(lights.directional({ name: "sun", position: [6, 10, 4], target: [0, 0, 0], intensity: 3, shadow: { softness: 2 } }))
    .add(primitives.plane({ name: "ground", size: [20, 1, 20], material: material.pbr({ color: "#c8c8c8", roughness: 1 }) }))
    .add(primitives.box({ name: "crate", position: [0, 1, 0] }))
});
void app.ready();
```

## Options

| Field | Unit | Default | Meaning |
| --- | --- | --- | --- |
| `softness` | shadow-map texels | unset (same as `1`) | Kernel reach around each receiver. `0` is a hard edge, `1` is the kernel every release before 5.7.0 drew, `2` and `4` are soft. Clamps at `8`. Must be finite and `>= 0` (`SHADOW_SOFTNESS_INVALID` otherwise). |
| `filter` | | the quality tier's filter | `"hard"`: one depth tap (ignores `softness`). `"pcf"`: the soft kernel on every tier. `"pcss"`: the same kernel as `"pcf"` today (no receiver runs a blocker search). Unset: `low` tier hard, `medium` and up soft. |
| `lightSize` | | unset | Reserved for a PCSS blocker search. Accepted and not read in 5.7.0. |

Leaving `softness` unset changes no pixel: on an M4 Max in Chrome, WebGL2 and WebGPU frames of a PBR floor and a
`material.shadow` catcher were byte-identical to 5.6.0 with it unset and with `softness: 1`.

## What it reaches

Every receiver of the sun's shadow map takes its kernel from the same `u_shadowPcfSamples` uniform array, so softness is a
uniform value, not a shader variant: no program recompiles when it changes.

- PBR materials (the generated forward program and the legacy `pbr-direct` program), GLSL and WGSL.
- `material.shadow` catchers, GLSL and WGSL.
- `material.toon`, the visual materials and custom `material.custom({ receiveShadow: true })` shaders (`a3d_shadow`).
- Custom shaders that include `a3d_prd02_shadow_lookup` (WebGL2 only): `u_prd02ShadowSoftness` scales the Castaño and
  Vogel footprints the same way.

It applies to the sun's (directional) map. Spot and point shadow tiles keep their own kernel in 5.7.0.

## Kernel by value

The receiver shaders read raw depth with nearest sampling, so the kernel is a set of tap offsets:

| `softness` | Kernel |
| --- | --- |
| `0`, or `filter: "hard"` | 1 tap |
| `0 < s <= 1` | 3 x 3 grid, taps `s` texels apart (`1` = the pre-5.7.0 kernel) |
| `1 < s <= 2` | 5 x 5 grid over `±s` texels |
| `s > 2` | 32-tap Poisson disk with the same RMS reach as the `±s` grid |

The PCF tap-tier cap (`?shadowtaps=16|8`, `qualitytaps`, `densetaps`) still applies and replaces a longer kernel with a
Poisson kernel of the same reach.

## Measured penumbra

Real GPU (Apple M4 Max, Chrome 158, headed), 800 x 600 canvas at device scale 1, mapSize 1024, one cascade, a 2 x 4 m slab
3 m above a PBR floor, sun at `[10, 8, 0]`, camera 14 m above the floor at fov 12. Width is the 10%-to-90% luminance
transition across the shadow's edge, in screen pixels (both edges of the band, three rows each; WebGL2 and WebGPU agree):

| `softness` | WebGL2 | WebGPU | `material.shadow` catcher (WebGL2 / WebGPU) |
| --- | --- | --- | --- |
| unset | 3 | 3 | 3 / 3 |
| `0` | 0 | 0 | 0 / 0 |
| `1` | 3 | 3 | |
| `2` | 6 | 6 | 6 / 4-5 |
| `4` | 10-11 | 10-11 | 10 / 11 |

On-screen width also follows texel size: the same `softness` is wider with a smaller `mapSize`, a larger `maxDistance` or
more cascade coverage, and narrower with a larger map. Under strong magnification the penumbra shows its tap steps
(nearest sampling); at normal viewing distance it reads as a smooth gradient.

## From three.js

`light.shadow.radius = r` maps to `shadow: { softness: r }` (`aura3d migrate three` reports the row as
`LightShadow.radius → shadow.softness`). three.js r180's `PCFSoftShadowMap` ignores `radius` and always draws a fixed
±1.5-texel bilinear 3 x 3 filter, so for a scene that used `PCFSoftShadowMap` set `shadow.softness` (about `1.5`) rather
than copying the ignored radius.
