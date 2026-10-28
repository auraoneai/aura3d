# Shadow PCF tap tiers (PRD-2 WP-3) on the 18,000-instance forest

Method: `tests/browser/shadow-filter-tier-ab.spec.ts` and `tests/browser/forest-10k.spec.ts` on the remote ACR runner (`tools/remote-acr/run.sh`, software WebGL2 / SwiftShader, 2 CPUs; not GPU timings). Forest = the bench forest (8,000 trunks + 8,000 canopies + 2,000 rocks, shadow, fog, 640x360), 44-frame plan, median of the last 12 frames. three.js 4x MSAA on the same plan: 1.43 s per frame, so the target "<= 2.5x" is **3.575 s per frame**. Raw results: `round1-dense-default-on/`, `round2-final-code/`.

## What was built

- `packages/rendering/src/shadows/ShadowFilterTier.ts`: tap tiers 32 / 16 / 8. A tier is a cap on the kernel length. A larger kernel is replaced by a Poisson-disk kernel of exactly `tier` taps whose RMS offset matches the source kernel; a kernel within the cap, or no tier, returns the same kernel object (production kernels untouched). Per quality tier: low 8, medium 16, high and ultra 32. Dense instanced casters (>= 8,192, the auto-cascade cap threshold) take 8 **only when opted in** (see decision below).
- `ForwardShadowMapOptions.pcfTapTier` (ForwardPass.ts) is applied where the kernel is packed (`forward/Lighting.ts`, `applyForwardShadowMapUniforms`). The shaders already loop over `u_shadowPcfSampleCount`, so `ShaderLibrary.ts` needed no change.
- Engine: `resolveShadowSystemConfig` resolves the tier into `ShadowSystemConfig.pcfTapTier` / `pcfTapReason`; `Prd02ShadowBridge` hands it to the forward shader. Controls: `?shadowtaps=32|16|8` or `__A3D_SHADOW_TAPS__` (explicit), `?densetaps=on` or `__A3D_DENSE_SHADOW_TAPS__ = "on"` (dense default). Diagnostics: `globalThis.__A3D_SHADOW_TAP_TIER__ = { tier, reason, casterInstances, quality }` (same mechanism as `__A3D_DENSE_SHADOW_CAP__`).

## Timing (median frame, last 12 of 44)

| runs | code | run 1 | run 2 | run 3 | median of 3 | vs three.js 1.43 s |
| --- | --- | --- | --- | --- | --- | --- |
| `forest-10k.spec.ts`, default config (no tier change, 9-tap kernel) | final | 4,799 ms | 4,564 ms | 4,701 ms | **4,701 ms** | 3.29x |
| dense tier 8 opted in (`?densetaps=on`) | final | 4,785 ms | 4,764 ms | 4,712 ms | 4,764 ms | 3.33x |
| tier pinned to 32 (`?shadowtaps=32`) | round 1 | 4,842 ms | 4,853 ms | 4,890 ms | 4,853 ms | 3.39x |
| dense tier 8 (then the default) | round 1 | 4,750 ms | 4,694 ms | 5,345 ms | 4,750 ms | 3.32x |

**Target not met.** Best median 4.70 s against 3.575 s (3.29x against 2.5x). Moving the forest from the 9-tap kernel to the 8-tap tier changes the median by 0 to 2%, inside the 0.1 to 0.8 s run-to-run spread seen on this runner.

Cause: the forest's kernel is already small. The default (flag-path) bridge uploads a 3x3 grid (9 taps), so tier 8 removes one tap in nine. By `evidence/forest-10k/README.md` shadow sampling in the camera pass costs about 1.2 s of the frame; one ninth of that is about 0.13 s, which matches the measurement. Meeting 3.575 s would take about 1.2 s out of 4.7 s, i.e. removing essentially all shadow lookups, which no 8-tap tier does. The remaining floor is the fragment-bound camera pass (about 2.7 s with no shadows), not the tap count.

## Visual diff (`shadow-filter-tier-ab.spec.ts` visual groups; `round2-final-code/shadowtier-visual-g*.json`)

Metric: `direct-path-parity.spec.ts` (mean abs diff over channels; largest non-silhouette diff; silhouettes separate), tier pinned to 32 against tier forced to 8, 640x360.

| scene | mean abs (limit 2) | interior max (limit 6) | share over 6/255 | silhouette max |
| --- | --- | --- | --- | --- |
| forest (3 frames) | 0.088 | 9 | 0.11% | 19 |
| examples/silt-and-signal-port (noisy: two captures at tier 32 differ by mean 1.0, interior 82) | 0.025 | 11 | 0.02% | 24 |
| examples/rendering-large-scene | 0 | 0 | 0 | 0 |

Mean difference is far inside 2/255 everywhere, but on the forest, the one deterministic scene with a visible tier effect (noise floor 0), the largest single-pixel difference at shadow penumbrae is 9/255 (silhouettes 19/255), over the 6/255 limit. The silt row sits inside its own capture-to-capture noise, so it neither confirms nor refutes that. Other showcase routes are not usable for this comparison: examples/roadster-hours-port, examples/ninja-runner-port and apps/aura-clash-showcase animate, and two captures of the same configuration already differ by up to mean 21.9 / interior 135 (ninja-runner) and mean 0.43 (roadster), so the noise floor swamps any tier effect. examples/drift-and-deliver-port, apps/showcase-vault-breakers, apps/showcase-smart-city-control and aura-clash never resolve a flag-path shadow config (`__A3D_SHADOW_TAP_TIER__` unset): the tier cannot reach them, and their frames were identical across all configurations.

## Decision

The 8-tap tier buys nothing measurable on the forest and exceeds the 6/255 pixel limit at penumbrae, so per the WP it **stays opt-in**: `quality: "production"` and every default configuration render byte-identically (unit-tested: a kernel within the cap is returned as the same object; no tier set means no change; the dense default is off). The dense-caster default (`?densetaps=on`) and the explicit tier (`?shadowtaps=`) remain for authors who want the cheaper kernel.

Not done, and why: a larger saving needs fewer than 8 taps or a hardware-compare single-tap path for dense casters (the forest's camera pass is fragment-bound), which is outside the 32 / 16 / 8 tiers specified here.

## Round 1 caveat

Round 1 (`round1-dense-default-on/`) ran the first version, where the dense default was on, with the visual groups in the order 32, 32, default, forced 8. Load order moved the animated scenes between captures, so its visual numbers for roadster, ninja-runner and silt are order noise. Round 2 interleaves the configurations and adds a repeat of each; its forest, silt and large-scene rows are the ones quoted above.
