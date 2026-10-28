# Tagline check: "Ship a typed 3D scene in 18 lines of TypeScript" (2026-10-27)

Run `tagline-212652` on the remote ACR runner (`tools/remote-acr/run.sh`, `SPECS=tests/browser/tagline-check.spec.ts`), headless Chromium with **software WebGL2 (SwiftShader), not a GPU**. Spec: `tests/browser/tagline-check.spec.ts`; builder: `tools/bench-vs-threejs/tagline/build.mjs`. Raw output: `results.json`; frames: `frames/`. Playwright exit 0 (1 passed, 3.9 min).

Versions installed from npm in the container: `create-aura3d@4.3.5` / `@aura3d/engine@4.3.5`, `three@0.185.1`, Vite 7.3.2.

## Apps

| App | Source | What it is |
|---|---|---|
| `aura-hello` | `tools/bench-vs-threejs/tagline/aura-hello/main.ts` | The `llms.txt` hello world (`looks.preset("product-studio")` + `model(assets.product)`), dropped into a stock `create-aura3d@4.3.5 --template product-viewer` scaffold |
| `aura-cube` | `tools/bench-vs-threejs/baseline/aura/scene.ts` | The 18-line bench cube the tagline counts, built inside the same stock scaffold (no extra Vite plugin) |
| `three-minimal` | `tools/bench-vs-threejs/tagline/three-minimal/main.ts` | three.js with what the look supplies at the renderer level: same GLB and HDRI, PMREM environment at 1.1, key light at the look's position and intensity with shadows, neutral tone mapping, MSAA, background colour, GLB auto-framing, resize, render loop |
| `three-look` | `tools/bench-vs-threejs/tagline/three-look/main.ts` | `three-minimal` plus the look's post stack (half-float 4x MSAA target, GTAO, bloom, contrast grade) |

Line rule: non-blank, non-comment lines (same rule as `harness/static-metrics.mjs`). Import lines are included and also reported separately.

## Results

| App | Lines (incl. imports) | Imports | Extra files | Typecheck | Build | JS raw / gzip / files | First draw | Frame (mean luma, std) |
|---|---|---|---|---|---|---|---|---|
| aura-hello | 6 | 2 | `src/aura-assets.ts` (16 lines, CLI-generated), `vite.config.ts` (3, scaffold) | pass | pass | 4,093 KB / 1,223 KB / 42 | 4,981 ms | 211.1, 27.4 |
| aura-cube | 18 | 2 | same scaffold | not run | pass | 4,095 KB / 1,224 KB / 42 | 2,934 ms (bench first frame) | 12.8, 10.3 |
| three-minimal | 38 | 3 | none | pass | pass | 613 KB / 157 KB / 1 | 310 ms | 66.8, 42.1 |
| three-look | 55 | 10 | none | pass | pass | 664 KB / 169 KB / 1 | 735 ms | 45.5, 56.3 |

No failed requests in any app. Console: `aura-hello` logged only the harness's ReadPixels driver notice; the others logged nothing.

## What the frames show (coarse 16x9 luma grid, `results.json`)

- `aura-hello` renders the product, but small (about one eighth of the frame width, centred) on a near-white backdrop (luma 205 to 226). That is by design: `environments.hdri` draws its studio HDRI as the backdrop by default and the look does not turn that off (the `look/solid-void` lint and the quality floor in `llms.txt` forbid a solid void), so the backdrop is the light studio HDRI, not the look's `#2b2f36` fallback colour. The default camera does not frame the asset; the shipped template adds `camera.frameAsset(...)` and an orbit for that reason. So the 6-line hello world builds and draws, but it is not a presentable product shot.
- `three-minimal` and `three-look` fill the frame with the product on a solid `#2b2f36` backdrop. That colour is the look's fallback `background` value, not what the Aura3D look draws, so the backdrops differ. Showing the same HDRI as the three.js background is one assignment (`scene.background = texture` instead of `new THREE.Color(...)`), so the line counts are unchanged either way.
- `aura-cube` draws a small cube on a dark background, as designed (ambient light only).

## Caveats

- One author (an agent) wrote the three.js apps to match the look's documented values (`packages/engine/src/agent-api/looks/lookPresets.ts`, `postPresets.ts`). They are not pixel-matched to Aura3D, and Aura3D's AO and bloom are not the same algorithms as GTAO and UnrealBloomPass.
- Software GL: first-draw and frame numbers show relative cost on a CPU runner only.
