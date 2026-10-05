# Quality-rebuild same-scene benchmark: Aura3D vs three.js 0.185.1

This benchmark renders 18 scenes twice, once with Aura3D and once with three.js, from a single shared
spec (`shared/scenes.ts`), and compares the two images. It is input to the Aura3D quality autopsy, so
neither engine gets tuning beyond what the spec says.

- **Aura3D**: `aura3d/common.ts` uses only the public `@aura3d/engine` API: `createAuraApp`,
  `scene`, `model`, `primitives`, `instances`, `lights`, `camera`, `material`, `environments`,
  `effects`, `defineAuraAssets`. It requests the renderer
  `{ mode: "production", qualityProfile: "production" }`. Typed models use `scaleMode: "world"` so
  they keep native glTF units, as three.js does. If the API cannot express a spec field, the scene
  renders without it and the capability log marks it `missing` or `partial`.
- **three.js 0.185.1**: `three/common.ts` uses the quality settings three.js documents:
  - `antialias: true`, `SRGBColorSpace`, `ACESFilmicToneMapping` and physical lights
  - `PCFSoftShadowMap`, with explicit shadow frusta, bias and normalBias
  - `HDRLoader` with `PMREMGenerator`
  - `UnrealBloomPass` with `OutputPass`, only when bloom is requested
  - the `CSM` addon, only when the spec asks for cascades
- **Determinism**:
  - Resolution is 1280x720 at DPR 1.
  - Every procedural layout uses a seeded mulberry32.
  - Animations are frozen at the clip time in the spec, t = 1.25 s. Aura3D uses
    `animate({ loop: false, captureTime })`; three.js uses `AnimationMixer.setTime`.
  - Aura3D runs with `autoStart: false` and advances time only through `app.step(spec.time)`.
  - Before READY, each run waits for all assets, then for the HDRI chain (Aura3D:
    `iblPixelBacked`), then renders `settleFrames` frames.
- **READY protocol**: the page sets `window.__QR_READY__ = { engine, scene, engineVersion,
  capabilityLog, drawCalls, warnings, errors, loadMs, extra }`. If something fails, it sets
  `window.__QR_ERROR__` instead.

## Scenes

| # | id | Content | Assets |
|---|----|---------|--------|
| 1 | 01-simple-geometry | Box, sphere and cylinder on a ground plane; directional + ambient light; shadow | primitives |
| 2 | 02-pbr-product | PBR product on a plinth; studio HDRI + key light | AntiqueCamera (in place of ToyCar) |
| 3 | 03-damaged-helmet | Complex PBR lit only by IBL | DamagedHelmet, studio_small_08 |
| 4 | 04-clearcoat | Clearcoat test grid | ClearCoatTest |
| 5 | 05-transmission | Transmission spheres over a checker | CompareTransmission (in place of TransmissionTest) |
| 6 | 06-metal-roughness-sweep | 6 metal + 6 dielectric spheres, roughness 0..1 | primitives |
| 7 | 07-sheen-fabric | Sheen color x roughness grid | SheenTestGrid (in place of SheenChair) |
| 8 | 08-skinned-character | Skinned humanoid in bind pose; shadow | CesiumMan |
| 9 | 09-outdoor-environment | Ground, rocks, crates and trees; sun shadow; sky HDRI as background + IBL; fog | rocks, crate, autumn_field_puresky |
| 10 | 10-indoor-environment | Closed room; 3 point lights + 2 spot lights; spot shadow | primitives |
| 11 | 11-multiple-lights | 10 colored point lights | primitives |
| 12 | 12-shadows | Directional + spot shadow casters; contact and detached shadows | primitives |
| 13 | 13-ibl-only | No punctual lights; sky HDRI as background + IBL | kloppenheim_06_puresky |
| 14 | 14-particles | 2000 additive sprites | none (procedural) |
| 15 | 15-animation-skinning | Soldier Walk + Fox Walk at t = 1.25 s | Soldier, Fox |
| 16 | 16-instancing | 10,000 instanced boxes with per-instance color | none (procedural) |
| 17 | 17-large-environment | 576 separate building meshes; 4-cascade CSM; fog | none (procedural) |
| 18 | 18-game-scene | Third-person soldier with props and emissive pickups; shadows, bloom, fog | Soldier, crate, rocks |

All assets are files already tracked in this repo. `shared/assets.ts` records each file's path,
sha256 and provenance. Several are Git LFS objects: `fixtures/asset-corpus/*.glb` and the
`public/aura-assets` props. `ci.sh` pulls only those files. If a file is still an LFS pointer, the
build skips it and writes `dist/qr-assets/asset-copy-report.json`.

## Running

Under the AuraOne policy, browser capture runs remotely, in GitHub Actions on macos-14. The
`threejs-benchmark` job in `.github/workflows/quality-rebuild-capture.yml` runs `ci.sh`.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
bash benchmarks/quality-rebuild/ci.sh          # LFS pull + build + capture
# or step by step:
pnpm exec vite build --config benchmarks/quality-rebuild/vite.config.ts
node benchmarks/quality-rebuild/capture.mjs [--scenes 03-damaged-helmet,12-shadows] [--engines aura3d,three] [--out dir]
```

To type-check: `cd benchmarks/quality-rebuild && ../../node_modules/.bin/tsc -p tsconfig.json`.

Outputs go to `out/` (or `$QR_BENCH_OUT`):

- `<scene>/aura3d.png` and `<scene>/three.png`
- `<scene>/side-by-side.png`: Aura3D on the left, three.js on the right
- `<scene>/diff.png`: absolute difference, amplified x4
- `report.json`, which contains:
  - environment: GPU string from `WEBGL_debug_renderer_info`, Chromium version, launch flags
  - per engine: capability log, console errors/warnings, failed requests, draw calls
  - metrics: mean absolute difference (overall and per channel), PSNR, luma SSIM (8x8 windows,
    stride 4), changed-pixel ratio, mean luma

The GPU flags are `--use-angle=metal --enable-gpu` on macOS and SwiftShader on Linux. Setting
`QR_BENCH_CHROME_ARGS` overrides them.

## Reading the results

A pixel difference is not a quality verdict on its own. Some of it comes from engine-internal
choices the spec cannot pin down:

- Aura3D generates particle positions itself.
- Aura3D primitives use fixed tessellation (spheres are 16x12).
- Bloom radius units differ between the engines.

Use the capability log next to each image pair to tell real gaps apart from these.
