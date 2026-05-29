# Effects/VFX Visual Audit

Generated: 2026-05-29T06:43:19.982Z

Overall status: pass

Summary: 25 pass, 0 partial, 0 fail, 18 blocker-severity findings.

This audit treats an effect as visually acceptable only when it has renderer-owned output and evidence beyond a name, label, DOM overlay, or metric-only object. Pixel-kernel checks prove non-zero image changes; screenshot quality checks are still required before marketing any effect as a polished demo.

## Browser Contact Sheet

Screenshot: `tests/reports/effects-vfx-visual-audit-contact-sheet.png`

Contact-sheet status: pass

## Findings

| Status | Severity | Surface | Finding | Evidence | Required action |
| --- | --- | --- | --- | --- | --- |
| pass | blocker | Public prompt API / effects.fog | Fog has a real Three.js atmosphere path and Canvas2D fallback. | Three renderer maps fog to THREE.FogExp2.; Canvas2D fallback paints an atmospheric overlay. | Keep fog tied to renderer atmosphere and screenshot contrast checks; do not replace it with a label or DOM overlay. |
| pass | blocker | Public prompt API / effects.bloom | Bloom now has visible renderer-owned glow in the public Three path, but this remains a stylized bloom proxy rather than full HDR postprocess. | Three renderer creates additive bloom sprites anchored to emissive primitives, point lights, and the hero model.; Canvas2D fallback already has a radial bloom overlay. | Add screenshot acceptance for bloom halos and keep the claim scoped as prompt-facing glow until full HDR postprocess is wired into createAuraApp. |
| pass | blocker | Public prompt API / effects.rain | Rain now uses layered instanced streaks, floor splash ripples, and mist in the public Three path. | The old sparse line-segment path has been replaced for the primary Three renderer.; Canvas2D fallback now draws layered rain, mist, and splash ellipses. | Run starter and agent screenshots after this change; fail any route that visually collapses to a lone asset plus sparse rain marks. |
| pass | blocker | Renderer postprocess pixel kernels | Tone mapping changes a high-contrast frame with monotonic calibration. | changedPixels=3071; monotonic=true | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Color grade changes frame contrast/color and records vignette/sharpening evidence. | changedPixels=3072; vignetteDarkenedPixels=2696; sharpenedPixels=526 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Bloom detects bright regions and spreads energy to neighbors. | changedPixels=1377; brightPixelCount=730; maxNeighborBoost=79.5 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Chromatic aberration offsets color channels on visible edges. | changedPixels=967; maxChannelOffsetPixels=2 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Film grain is visible but bounded below the noisy screenshot threshold. | changedPixels=1499; intensity=0.035; monochrome=true | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Depth of field blurs out-of-focus regions when given depth. | blurredPixels=2749; maxBlurRadius=3 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Motion blur reacts to a velocity buffer. | blurredPixels=1200; maxVelocityPixels=2.2652372498708644 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | SSAO darkens depth discontinuities. | occludedPixels=382; averageOcclusion=0.023461 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Contact shadow creates screen-space grounding from depth. | contactPixels=38; averageContactDarkening=0.115763 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | SSR reflects bright source pixels into shallow receiver regions. | reflectedPixels=2877; maxReflectionBoost=0.455153 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | TAA blends against a distinct history buffer. | blendedPixels=3072; blend=0.24 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | Outline detects high-contrast edges and changes pixels. | outlinedPixels=1723; changedPixels=1723; maxGradient=3.383687 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | blocker | Renderer postprocess pixel kernels | FXAA smooths detected edge pixels. | changedPixels=649; edgePixels=649 | Keep this kernel in screenshot-backed routes before marketing it. |
| pass | warning | Renderer particle presets | fire produces renderer sprite batches and passes the browser contact-sheet pixel proof. | liveCount=169; uploadedBytes=6084; colorBuckets=22; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=27573; uniqueBuckets=114 | Keep the particle contact sheet under review; these are sprite-preset VFX, not full fluid/fire simulation claims. |
| pass | warning | Renderer particle presets | fountain produces renderer sprite batches and passes the browser contact-sheet pixel proof. | liveCount=149; uploadedBytes=5364; colorBuckets=14; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=14844; uniqueBuckets=104 | Keep the particle contact sheet under review; these are sprite-preset VFX, not full fluid/fire simulation claims. |
| pass | warning | Renderer particle presets | collision-burst produces renderer sprite batches and passes the browser contact-sheet pixel proof. | liveCount=42; uploadedBytes=1512; colorBuckets=4; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=11933; uniqueBuckets=67 | Keep the particle contact sheet under review; these are sprite-preset VFX, not full fluid/fire simulation claims. |
| pass | warning | Renderer particle presets | spark-shower produces renderer sprite batches and passes the browser contact-sheet pixel proof. | liveCount=48; uploadedBytes=1728; colorBuckets=4; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=6921; uniqueBuckets=65 | Keep the particle contact sheet under review; these are sprite-preset VFX, not full fluid/fire simulation claims. |
| pass | warning | Cinematic VFX helpers | Cinematic rain helper emits renderer-owned wide streak geometry, splash ripple geometry, and mist bank geometry. | RainParticleSystem no longer uses point-only geometry.; RainParticleSystem exposes renderItems for streaks, splash-ripples, and mist-banks.; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=135180; uniqueBuckets=60 | Add browser contact-sheet review for cinematic rain before treating it as a premium weather simulation; it is now visually acceptable as a starter-level rain helper. |
| pass | warning | Cinematic VFX helpers | Fog, glow cards, and wet reflection helpers have screenshot-backed approximation proof, with explicit non-planar/non-volumetric claim boundaries. | Renderer evidence flags reject DOM/CSS overlays.; Wet reflection explicitly says planarReflection=false.; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=143561; uniqueBuckets=53 | Keep these claims scoped as visual approximations unless true volumetric fog or planar reflection systems are added. |
| pass | blocker | Production runtime named postprocess classes | Exported production-runtime postprocess classes now run real renderer pixel kernels instead of only storing options. | no option-holder stubs detected; passOutputs=production-color-grading,production-bloom,production-ssao,production-depth-of-field,production-fxaa; totalChangedPixels=6946 | Keep these adapters under pixel-delta unit tests and browser screenshot checks before using them in polished production-runtime demos. |
| pass | blocker | Three compatibility postprocess | Three-compat postprocess classes now preserve compatibility metrics and run real pixel kernels when a frame provides pixels. | no metric-only postprocess files detected; visualChangedPixels=16262; visualPasses=BloomPass,SSAOPass,TAAPass,FXAAPass,DepthOfFieldPass,MotionBlurPass,ColorGradingPass,VignettePass,OutlinePass | Keep the Three-compat visual claim scoped to pixel-buffer compatibility until browser before/after screenshots prove the full route quality. |
| pass | warning | Three compatibility VFX | Three-compat VFX structures are compatibility data containers with browser contact-sheet proof for particles, sprites, lines, trails, and point clouds. | packages/rendering/src/threejs-compatibility/vfx/ParticleSystem.ts; packages/rendering/src/threejs-compatibility/vfx/SpriteSystem.ts; packages/rendering/src/threejs-compatibility/vfx/LineRenderer.ts; packages/rendering/src/threejs-compatibility/vfx/TrailRenderer.ts; packages/rendering/src/threejs-compatibility/vfx/GPUPointCloud.ts; contactSheet=tests/reports/effects-vfx-visual-audit-contact-sheet.png; litPixels=52873; uniqueBuckets=141 | Keep this scoped as compatibility VFX proof; do not market it as a standalone high-end VFX renderer without route screenshots. |

## Immediate Corrections

- Public `effects.rain()` has been upgraded from sparse line segments to layered instanced rain streaks, splash ripples, and mist in the primary Three renderer, plus richer Canvas2D fallback.
- Public `effects.bloom()` now creates renderer-owned additive glow in the primary Three renderer instead of being ignored.
- `packages/rendering/src/cinematic/RainParticleSystem.ts` now emits wide rain streak, splash ripple, and mist bank geometry instead of point-only rain.
- Production-runtime named postprocess classes now execute real pixel kernels instead of only storing options.
- Three-compat postprocess adapters now execute real pixel kernels when the frame includes pixels.

## Remaining Scope Limits

- The remaining blocker is quality scope, not missing wiring: these effects are now starter-level/contact-sheet-proven, but cinematic fog/glow/wet reflection remain approximations, not full volumetric fog or true planar reflection systems.
- Premium production claims still require route-level screenshots, asset-specific QA, and human visual review beyond this contact sheet.
