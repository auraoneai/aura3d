# Transparent canvas output (`output.alphaMode`, 5.7.0)

A canvas that keeps its alpha composites the 3D scene over the page: the page shows through the background, shadows on a
`material.shadow` catcher darken it partially, and anti-aliased edges blend into it. From 5.7.0 the output options alone
turn this on. Source: `packages/engine/src/agent-api/compiler/renderer.ts` (`mountClearForOutput`),
`packages/rendering/src/Renderer.ts` (`setClearColor`), `packages/rendering/src/webgl2/LegacyPost.ts`
(`outputPassNeutralCurve`), `packages/rendering/src/output/outputAlphaPreservation.ts`.

```ts
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene()
    .camera(camera.perspective({ position: [3, 4, 6], target: [0, 0.3, 0], fov: 40 }))
    .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#c4d0d8", intensity: 1.1 }))
    .add(lights.directional({ name: "key", position: [-6, 8, -2], target: [0, 0, 0], intensity: 3, shadow: { mapSize: 1024, filter: "pcf" } }))
    .add(primitives.box({ name: "box", size: [1, 1, 1], position: [0, 0.5, 0], castShadow: true, material: material.pbr({ color: "#2d6cdf", roughness: 0.5 }) }))
    // A shadow catcher: transparent where lit, partly opaque black under the box.
    .add(primitives.plane({ name: "floor", size: [12, 1, 12], receiveShadow: true, material: material.shadow({ color: "#000000", opacity: 0.6 }) })),
  output: { toneMapping: "neutral", exposure: 1, alphaMode: "premultiplied", inputAlphaMode: "premultiplied" }
});
void app.ready();
```

Give the page (or the canvas's parent) the background you want behind the scene; the canvas itself stays transparent.

## Options

| Field | Values | Meaning |
| --- | --- | --- |
| `alphaMode` | `"opaque"` (default), `"premultiplied"`, `"straight"` | How the canvas presents alpha. `"premultiplied"` is what browsers composite natively; use it unless you read pixels back as straight alpha. |
| `inputAlphaMode` | `"premultiplied"` | Required with a non-opaque `alphaMode`: the scene is rendered as premultiplied linear light with opacity in alpha. Without it the frame fails with `OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE`. |

## What the engine does for you

- **The clear is transparent.** With a non-opaque `alphaMode` the canvas clears to premultiplied transparent black, and
  the scene's `background(...)` colour is not drawn. Before 5.7.0 it cleared with the background at alpha 1, so every
  pixel came out opaque unless you also called `app.setClearColor(c, 0)` and set `background(c, { toneMapped: false })`;
  neither is needed now. An environment or sky that draws a backdrop still covers the canvas: leave it out or pass
  `background: false` (for example `environments.neutral({ background: false })`).
- **Colours match the opaque frame.** Alpha output runs the tone map in the output pass instead of the fused present.
  With `toneMapping: "neutral"` that pass now uses the same neutral curve as the opaque frame of the same app (the
  per-channel curve, or Khronos PBR Neutral when the app opted in with `neutralCurve: "khronos"` or uses the plain look),
  so turning transparency on does not shift colour. Before 5.7.0 it always used Khronos PBR Neutral.
- **Edges and shadows keep their coverage.** The post path normally stores an ambient-occlusion weight (the
  indirect-fraction tag) in the colour alpha. With alpha output nothing writes that tag: anti-aliased edges keep their
  partial alpha instead of coming out opaque and dark, and on WebGPU the frame renders instead of failing with
  `WEBGPU_INDIRECT_FRACTION_TARGET_UNSUPPORTED`. Ambient occlusion still runs, with the conservative weight it uses for
  custom shaders. The `qualityRebuild: { flags: { A3D_QR_POST_AO: false } }` workaround is no longer needed.

## An explicit clear

`app.setClearColor(color, alpha)` still sets the clear. On alpha output it is stored premultiplied (as three.js does on
a premultiplied canvas), so a coloured clear at alpha 0 cannot tint anti-aliased edges. An opaque clear (alpha 1, or
`setClearColor(color)` with no alpha) covers the page; the renderer logs a one-time `OUTPUT_ALPHA_OPAQUE_CLEAR` warning
because that is rarely what an alpha canvas wants.

## Opaque output is unchanged

With `alphaMode` unset or `"opaque"` nothing above applies: the clear, the tone curve, the output shaders and the
generated programs are the same as in 5.6 (unit tests pin the output shader sources by hash).

## Capture

`app.capture({ type: "png-blob" })` and `canvas.toBlob()` keep the alpha. A page screenshot keeps it only when the
page background is transparent too.

## Known limits

- Display-P3 output with alpha keeps Khronos PBR Neutral for `toneMapping: "neutral"`, the curve its opaque frame already
  uses on that route.
- Multi-view rendering (renderer `views`) does not support alpha output (`OUTPUT_ALPHA_MODE_UNAVAILABLE`).
