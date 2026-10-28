# Pixel receipts: effects

Receipts under `evidence/receipts/<capability>/<version>.json` are written by `tests/browser/effects-receipts.spec.ts`
(harness: `tests/browser/receipts-harness.ts`) on the remote runner (`tools/remote-acr/run.sh`, SwiftShader, 600x400,
`quality: "production"`) and extracted with `tools/receipts/extract-from-acr-log.mjs`. `node tools/receipts/check.mjs` gates them.
Each receipt is an on/off pair; checks must pass before a receipt is written. Thresholds are unchanged since 4.3.7.

## 4.5.0 numbers (regenerated, run `rc450c1`, code at `55481c590`)

| capability | off frame | on frame | changed pixels | mean channel delta | other |
| --- | --- | --- | --- | --- | --- |
| effects-ambient-occlusion | `fx-ao-room-off` (same node, intensity 0) | `fx-ao-room` (intensity 1, radius 0.6) | 31.43% | 3.3278 | mean luma 150.86 -> 147.47 |
| effects-color-grade, desaturate | `fx-baseline` | `fx-color-grade-desaturate` | 65.82% | 5.6485 | chroma 15.77 -> 0 |
| effects-color-grade, contrast 1.7 | `fx-card-off` (identity grade) | `fx-card-contrast` | 69.90% | 21.861 | luma std 56.93 -> 83.43 (x1.47, spec needs x1.1) |
| effects-vignette | `fx-baseline` | `fx-vignette` | 67.56% | 22.3659 | unchanged by the fix (22.3672 before) |
| effects-depth-of-field | `fx-baseline` | `fx-depth-of-field` | 5.07% | 1.2059 | was 7.27% / 1.8504 before the fix (see cause 1) |

## Why the 4.5.0 AO and colour-grade receipts failed, and what was fixed

### 1. Engine defect: RGBA32F render targets read as zero (AO and depth of field)

`WebGL2Device.createRenderTarget` gave every colour texture LINEAR filters. An RGBA32F texture is not linear-filterable
until `OES_texture_float_linear` is enabled, so it is texture-incomplete and `texelFetch` returns zeros. The v2 post chain
keeps view-space depth in RGBA32F targets. A per-draw framebuffer probe on the failing build showed:

| stage | output |
| --- | --- |
| depth-linearize | correct metres (5.57 to 11.03) |
| depth-minmax (half-res, reads the linearize output) | all zero |
| gtao, gtao-denoise | all zero (every pixel fully occluded) |
| gtao-apply | frame darkened by a constant factor per surface |

With an ambient fill the whole frame went 31% darker with no crease structure, and radius 0.15 / 0.6 / 2 and
`multiBounce` on/off gave identical pixels. With only a hemisphere light and AO on, the frame was black. After the fix
the depth-minmax output is real, GTAO values vary (0.67 to 0.91 across the probe points), and radius and multiBounce
change the result: intensity 1 darkens the room by 31.4% of pixels at radius 0.6 and 3.3% at radius 0.15; with
`multiBounce: false` 59.5% change and the mean luma delta grows from -3.39 to -5.87.

Fix: `renderTargetSampleFilter` (`packages/rendering/src/webgl2/TextureFormats.ts`) enables `OES_texture_float_linear`
and falls back to NEAREST for RGBA32F when it is unavailable; RGBA8 and RGBA16F are unchanged. Unit test:
`tests/unit/rendering/render-target-float-filter.test.ts` (the device test fails on the old code). Scenes without AO, god
rays, depth of field, TAA, motion blur or auto-exposure never create an RGBA32F render target, so their output is unchanged.

Depth of field read the same zeroed depth, which is why its 4.5.0 receipt moved (7.27% -> 5.07% changed, 1.85 -> 1.21
channel delta). It still passes and was regenerated.

### 2. Receipt scene: AO only attenuates indirect light

The GTAO apply stage multiplies the indirect fraction of a pixel (`gtaoDenoise.glsl.ts`), so a scene lit by one
directional light has almost nothing for AO to darken. Measured after the fix, on the old receipt scene (robot, floor,
bar, block, one directional light): 0.75% of pixels changed, mean channel delta 0.137, mean luma +0.10. On a creased room
with a directional key only, the AO on and off frames are identical (0 pixels changed). The new AO receipt uses an
occlusion room (floor, two walls in a concave corner, two crates against them) with a hemisphere fill, so there is
indirect light and there are creases. Thresholds were not touched: the room passes 2% changed pixels and 1.0 mean
channel delta with 31.4% and 3.33. This is not a cherry-picked scene. AO on a directional-only scene is a property of the
engine (stated here so nobody reads the old scene as a regression); an AO-on-direct floor would be a PRD-03 decision
with an L4 LPIPS check.

### 3. Receipt metric: the off frame was on a different post chain

With no effect node the off frame takes the `direct-render` path. Commit `6aca947a7` made that path tone-map, which
exposed that the 4.3.7 AO and colour-grade receipts were inflated: their baseline was untonemapped (mean luma 149.85)
while the effect frames were tone-mapped (AO frame 118.53), so the "AO" delta of 30.76 channel / 69.6% changed pixels
and the colour-grade luma gain were mostly the tone-map difference. With tone mapping on both sides the shared baseline
has mean luma 86.58, and in the old scene the apparent AO delta falls to 0.44 to 0.54 channel / 0.74% changed pixels
(and was partly the resolve difference at silhouettes: edge energy 2.37 vs 2.43 in every post-chain frame). The AO,
contact-shadow and contrast receipts now compare against an off frame that takes the identical chain (the same effect node at
intensity 0, or an identity colour grade), and the harness waits for `postV2ModulesReady()` before capture and records the
v2 outcome per frame.

### 4. Receipt scene: contrast had no tonal spread to widen

The old frame was bimodal: 33% of pixels the `#05070d` background (luma 7) and 52.5% a flat floor at luma 128.23,
which sits on the display-space pivot 0.5 of the grade `(v - 0.5) * c + 0.5`. The background can only clip to 0 and the
floor does not move, so luma std rose 57.16 -> 61.48 at contrast 1.7 (x1.076) and 62.31 at 2.5, below the x1.1 gate for
any contrast value. The engine matches a CPU replay of the formula on the saved baseline (61.56 and 62.38). The new
contrast receipt uses a step wedge: eleven evenly lit grey tiles (24 to 240) on a mid-grey field. A wedge is the standard
test chart for a contrast control, and the off frame is the same scene with an identity grade. Luma std goes 56.93 -> 83.43.
The desaturate variant was unaffected and keeps the shared baseline.

## Not resolved: contact shadows

`effects.contactShadows` is lowered to the same GTAO pass at 0.36x intensity. On the occlusion room it darkens the frame
(mean luma 150.86 -> 149.65, lower-centre floor 158.44 -> 157.22, mean channel delta 1.16) but no pixel crosses the
changed-pixel threshold, so `changedPixelFractionAtLeast0p3pc` fails and no 4.5.0 contact-shadow receipt is written. It is
not a required row in the capability audit, the 4.3.7 receipt stays as history, and the threshold was left alone. Changing
`length` from 0.5 to 1.5 did not change the frame.
