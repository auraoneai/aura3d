# G3 and G1 recheck on 4.1.3 main (2026-10-24, software WebGL2, remote)

Why: commit `a816facf6` replaced the legacy LDR present uber-shader with per-variant programs, so Aura Slam frames could have shifted.

## Results
- **G1 replay (`aura-slam-replay.spec.ts`, real shell, remote):** 6 of 6 scenarios exact (digest, rows and events), including auto-legend-hard at 90,000 steps.
- **G3 render spec (`aura-slam-render.spec.ts`):** 6 venues x 2 sizes, no console errors, non-blank, draw calls 111 to 125 (budget 150), identical draw calls and mean luma (to 0.01) between the swap commit `09ccc9518` and current main.
- **Old vs new LDR shader (`ldr-variant-equivalence.spec.ts`):** same source texture and uniforms through the 4.1.2 uber-shader (`tests/browser/ldr-uber-fragment-4.1.2.glsl.txt`) and the per-variant program: max byte difference 0 in all 10 cases (ACES, neutral, filmic, reinhard, sRGB in and out, exposure, grade, sharpening, FXAA).
- **Pixel diff, 640x360 harness frames, swap commit vs main:** mean abs difference 0.42 of 255 in four venues, 0 in two, max channel difference 2. The same commit run twice differs by the same amount (0.42 in four venues, 0 in two), so this is run-to-run noise, not a regression.

## What is not checked
- `frames-reference.json` holds frames keyed by predicate name (menu, serve-ready, ...), with no venue field, so the render spec's JSD, edge-ratio and luma-delta comparison never matched a row, even when the file was present. The G3 thresholds were verified at the swap against the live page (`native-vs-live-metrics.json`); that comparison cannot be repeated now because the live page is the native game.
- Software GL only, not a GPU.
