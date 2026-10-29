# Tagline check, run 3: pinned to 4.5.0 (2026-10-29)

Audit row RH-10: the first two runs (`../README.md`, `../run2/`) scaffolded `create-aura3d@4.3.5`. This run uses the same spec (`tests/browser/tagline-check.spec.ts`) and builder (`tools/bench-vs-threejs/tagline/build.mjs`, now defaulting to `TAGLINE_AURA_VERSION=4.5.0`), so every Aura3D app is a stock `create-aura3d@4.5.0` product-viewer scaffold installed from npm (the build reports engine 4.5.0). Remote ACR run `e5-450-extra-060037`, headless Chromium on software WebGL2 (SwiftShader), not a GPU. Playwright exit 0 (1 passed, 8.5 min). Frames: `frames/`.

| App | Code lines (non-blank, non-comment, imports included) | Build | JS raw | Frame mean luma, std | Failed requests | Console |
| --- | ---: | --- | ---: | --- | ---: | --- |
| aura-hero (homepage hero) | 10 | pass | 4,142 KB | 208.9, 31.6 | 0 | none |
| aura-hero-no-appoptions | 9 | pass | 4,142 KB | 208.9, 31.6 | 0 | none |
| aura-hero-floor | 11 | pass | 4,142 KB | 121.3, 75.4 | 0 | none |
| aura-hello (llms.txt hello world) | 6 | pass | 4,142 KB | 213.6, 24.0 | 0 | 4 SwiftShader "GPU stall due to ReadPixels" driver notices from the harness |
| aura-template-stock | 81 | pass | 4,143 KB | 138.0, 80.9 | 0 | none |
| aura-cube (bench baseline scene) | 12 | pass | 4,143 KB | 11.8, 4.6 | 0 | none |
| three-minimal | 38 | pass | 613 KB | 66.8, 42.1 | 0 | none |
| three-look | 55 | pass | 664 KB | 45.5, 56.3 | 0 | none |

What changed against the 4.3.5 runs:

- The homepage line "A lit 3D product in 10 lines of TypeScript" holds on 4.5.0: `aura-hero` is 10 lines, builds on the stock scaffold and frames the product (`frames/aura-hero.jpg`), with the same mean luma as run 2 (208.9 against 205.5).
- The bench cube scene is 12 lines, not 18 (the 4.5.0 bench source, gate line D1). Copy that still says "18 lines" is out of date.
- The matched three.js apps are unchanged (38 and 55 lines).
- Aura3D app JS is 4,142 KB raw against 613 KB for three-minimal. That is a fact about bundle size, the gate's failing G1 group; it is not published as a comparison (`docs/agents/claims-and-boundaries.md`).
