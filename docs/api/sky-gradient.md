# Stylised gradient sky (`sky.gradient`, 5.7.0)

`sky.gradient` draws a gradient sky behind the scene on WebGL2 and WebGPU. In 5.7.0 it gained a stylised profile, the
hand-painted game sky that games used to write as a custom GLSL + WGSL dome: zenith, horizon and ground colours, up to
six bands between them, a horizon line you can move and sharpen, a painted sun with glow lobes, a horizon haze veil and
optional dithering. Source: `packages/engine/src/agent-api/nodes/sky.ts` (builder),
`packages/rendering/src/atmosphere/GradientSky.ts` (`gradientFrame`, CPU reference `stylizedGradientBase`),
`packages/rendering/src/atmosphere/sky.glsl.ts` and `skyFull.wgsl.ts` (the `STYLIZED` program).

```ts
import { camera, createAuraApp, lights, primitives, scene, sky } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene()
    .camera(camera.perspective({ position: [0, 2, 8], target: [0, 1, 0] }))
    .add(sky.gradient({
      horizon: "#d6eaf8",
      mid: { color: "#58a0dc", blend: [0, 0.09] },
      zenith: "#1d63b8",
      zenithBlend: [0.08, 0.36],
      haze: { intensity: 0.2 },
      sun: { elevationDeg: 22, azimuthDeg: 200, color: "#fff0d4", glow: [{ exponent: 28, intensity: 0.24 }, { exponent: 260, intensity: 0.65 }] },
      captureEnvironment: false
    }))
    .add(lights.key({ target: [0, 0, 0] }))
    .add(primitives.plane({ name: "ground", size: [40, 1, 40] }))
});
void app.ready();
```

## Profiles

| Profile | Selected by | Look |
| --- | --- | --- |
| Classic | no stylised field (or `style: "classic"`) | Pre-5.7 sky, unchanged: `pow(y, 1 / exponent)` from `horizon` to `zenith`, `horizonGlow`, `ground` below, a bright HDR sun disc. |
| Stylised | any stylised field below, or `style: "stylized"` | Smoothstep bands over the height above the horizon line, a painted sun, haze, dither. |

Mixing `exponent` or `horizonGlow` with stylised fields throws (they belong to the classic profile), as do unordered
blend ranges, more than 6 `mid` bands and more than 3 glow lobes. `stars`, `clouds`, `moon`, `bands` and `intensity`
work on both profiles. The sky is tone-mapped with the scene, like the custom domes it replaces.

## Stylised options

Heights are sine of elevation: `u = (dir.y - horizonHeight) * horizonSharpness`.

| Field | Default | Meaning |
| --- | --- | --- |
| `zenith`, `horizon` | required | Colours (hex or any CSS colour). They decode with the exact sRGB curve (the classic profile keeps gamma 2.2). |
| `ground` | `horizon` | Colour below the horizon line, blended over `groundBlend` (measured downwards). |
| `groundBlend` | `[0, 0.25]` | `[start, end]` of the ground blend below the line. |
| `mid` | none | One band `{ color, blend }` or up to 6, low to high. Each blends over its `blend` (default `[0, 0.3]`); negative values reach below the line. |
| `zenithBlend` | `[0.22, 0.85]` with a mid band, `[0, 1]` without | `[start, end]` of the zenith blend. |
| `horizonHeight` | `0` | Moves the horizon line (negative lowers it). |
| `horizonSharpness` | `1` | Multiplies the height before every blend; `2` squeezes the bands towards the line. |
| `haze` | none | `{ color = horizon, intensity, falloff = 8 }`: `mix(sky, color, intensity * exp(-max(u, 0) * falloff))`. |
| `dither` | `false` | About one display code value of triangular noise against banding. |
| `sun.elevationDeg`, `sun.azimuthDeg` | | Direction: azimuth 0 faces +z, 90 faces +x (`[cos(el) sin(az), sin(el), cos(el) cos(az)]`). |
| `sun.color`, `sun.intensity` | about `#fff9ed` (linear 1, 0.95, 0.85), `1` | Sun colour, scaled by intensity, for the glow and the disc. |
| `sun.glow` | `[{ exponent: 8, intensity: 0.25 }, { exponent: 64, intensity: 0.45 }]` | Up to 3 lobes: `color * intensity * max(cos(angle), 0) ^ exponent`. `[]` for none. |
| `sun.discSize` | 1.2 degrees (in radians) | Angular diameter of the disc. `0` hides it. |
| `sun.discSoftness` | `0.25` | Soft fraction of the disc radius (0 hard, 1 soft to the centre). |
| `sun.discIntensity` | `3` | Disc brightness, a multiple of the sun colour; `0` keeps only the glow. |
| `sun.discBlend` | `"add"` | `"add"` adds the disc over the sky, `"replace"` paints it over. |

Evaluation order: horizon, ground, mid bands, zenith, haze, glow, disc, then `bands` and `intensity`.

## Porting a hand-written sky dome

- A runner-kit stop gradient (`gradientSkyFragment(stops)`) maps one to one: the lowest stop is the `horizon`, each stop
  above it a `mid` band blending between its neighbours' heights (`y = 1 - 2t`), the top stop the `zenith`.
  `gradientSkyOptions(stops)` in `examples/shared/runner-kit/sky.ts` does this.
- `mix(horizon, mid, smoothstep(a, b, y)); mix(c, zenith, smoothstep(c, d, y))` is `mid: { color, blend: [a, b] }`,
  `zenithBlend: [c, d]`.
- `pow(max(dot(dir, sun), 0), k) * w` lobes are `glow`; a `smoothstep(cosOuter, cosInner, dot)` disc is
  `discSize: 2 * acos(cosOuter)`, `discSoftness: 1 - acos(cosInner) / acos(cosOuter)`.
- Pass `captureEnvironment: false` and `affectsFog: false` to keep the scene's lighting and fog as they were with the
  dome (a custom dome never fed the environment or the fog colour).
- Noise clouds, star fields, aurora ribbons, planets, ridgelines and striped suns are not part of the preset; keep a
  custom dome for those.

Games moved onto it in 5.7.0, each checked against its 5.6 program on the CPU over a direction grid (within 1/255) and
on a real GPU: Splat Rush (original look), Splat Turf and Drift & Deliver (original look). See
`tests/unit/sky/game-sky-migration-parity.test.ts`.
