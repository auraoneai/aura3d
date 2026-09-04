# Renderer Postprocess

Postprocess support exists in lower-level rendering packages and selected
runtime paths, but public root examples must distinguish requested effects from
pixel-backed passes.

## Public Root Boundary

`effects.bloom(...)`, ambient/contact occlusion nodes, fog, and renderer
diagnostics can describe postprocess intent in a root `createAuraApp` scene.
That is not enough to claim a pixel-backed postprocess stack. A root route can
claim a rendered postprocess effect only when:

- the route imports only `@aura3d/engine`;
- `createAuraApp(...).diagnostics()` after mount reports a pixel-backed pass
  status for the requested effect;
- before/after screenshots or mode-change screenshots show pixel differences
  caused by the pass;
- evidence records the backend and any fallback state.

## What Root Currently Proves

`tests/browser/createAuraApp-postprocess-contract.spec.ts` retains the measured
root evidence at
`tests/reports/createAuraApp-postprocess-contract/postprocess-contract.json`.
Every entry is an on/off comparison of the same scene where only the effect node
differs, so a measured delta is attributable to the pass.

| Effect | Root status | Basis |
| --- | --- | --- |
| Tone mapping | Root-proven as a neutral always-on pixel-backed pass | The production bridge submits neutral tone mapping and the runtime reports `tone-mapping` in `actualPasses` with `pixelBacked: true`. |
| Bloom | Root-proven | The `bloom` pass runs and changes 5.17% of the frame (mean channel delta 6.5714) versus an identical scene without `effects.bloom(...)`. Visual review also records that the probe's white bars clip aggressively, so this is execution proof rather than a polished quality example. |
| Environment fog | Root-proven | `effects.fog(...)` reaches the forward pass and changes 68.82% of the frame (mean channel delta 15.5143). Visual review records that this probe setting nearly silhouettes the subject, so the screenshot is not used as a quality-parity claim. |
| Ambient / contact occlusion (SSAO) | Partial | The `ssao` pass genuinely executes and `ambientOcclusionPass` is true, but the measured on/off change is near zero. The pass runs; its visible contribution in the probe scene is not provable, so it is not claimed. |
| Color grading | Root-proven (2026-09-03) | `effects.colorGrade(...)` submits the native pass: 99.85% frame delta (mean 34.01) on/off. contrast/saturation execute; exposure/shadows/highlights/lut are recorded and warned, never silently accepted. Receipt: `tests/reports/root-effects-a3/a3-probe.json`. |
| FXAA | Root-proven (2026-09-03) | `effects.antiAlias({ mode: "fxaa" })` submits the native pass: 3.27% frame delta (mean 2.50) on/off. `mode: "taa"` is recorded but withheld with a warning (no history binding at root); `"off"` submits nothing. |
| Outline | Root-proven (2026-09-03) | `effects.outline(...)` submits the native pass: 9.18% frame delta (mean 27.02) on/off, width clamped to the device range 1-6. |
| SSR | Root-proven (2026-09-03) | `effects.screenSpaceReflections(...)` submits the native pass against renderer-owned depth: 37.49% frame delta (mean 85.92) on/off. Required a real fix: raw GL depth is nonlinear (0.1/1000 defaults park the play area past 0.97), so the native program linearizes depth with near/far uniforms while the CPU byte kernel keeps fixture-unit semantics (documented divergence, proven by the GL-depth contract in `native-outline-pixel.spec.ts`). |
| Depth of field | Root-proven (2026-09-03) | `effects.depthOfField(...)` submits the native pass against renderer-owned depth: 7.12% frame delta (mean 7.42) on/off. focus is a linear-distance fraction (0 = near, 1 = far); same native/CPU contract split as SSR. |
| Motion blur, TAA | Withheld at root (honest) | `effects.motionBlur(...)` and `effects.antiAlias({ mode: "taa" })` are constructible and appear in `requestedPasses` with an explicit `(withheld: ...)` marker plus a diagnostic warning on both plan and mounted channels, but submit no pass (no velocity/history binding at root). Withholding is proven by `root-effects-a3.spec.ts`: routes keep drawing with zero submitted pass. |

The pass set and `pixelBacked` status are also verified to survive canvas resize
and device-pixel-ratio change across three distinct backing stores, so a resize
cannot silently drop the chain to a direct render.

No HDR-dependent or native-WebGPU postprocess claim is made from this contract.

Two root wiring defects were fixed while producing this evidence, both of which
had made a requested effect unprovable:

- `effects.fog(...)` was accepted by the scene builder and reported in
  diagnostics but never submitted as `environmentFog`, so it changed zero pixels
  through the root path.
- Occlusion effects were advertised in `requestedPasses` as `ssao` while no
  `ssao` option was ever submitted, so the advertised pass could not run. The
  option is now submitted, with the public world-space `radius` mapped onto the
  renderer's integer 1-8 sample-kernel range; passing the authored float
  directly made the renderer reject the frame entirely.

## Public Lower-Level Composer

`@aura3d/rendering` publicly exports `PostProcessComposer`. Its typed pass list
is the canonical public composition surface:

- bloom;
- tone mapping and tone-mapping presets;
- color grading;
- chromatic aberration and film grain;
- depth of field with an explicit depth binding;
- motion blur with an explicit velocity buffer;
- SSAO and SSR with explicit depth bindings;
- TAA with explicit history;
- outline; and
- FXAA.

The composer owns and reuses two ping-pong render targets, accepts a caller
source and optional output target, validates dimensions, exposes diagnostics,
supports resize, and deterministically disposes both owned targets. Stereo
composition is not part of this pass catalog and is no longer listed in the
composer capability report. SMAA is explicitly unsupported.

The canonical browser proof is:

```sh
pnpm renderer:postprocessing
```

It renders a 128 by 96 deterministic subject into real WebGL2 render targets,
runs each of the 13 pass variants independently, reads the target back, presents
it to the WebGL backbuffer, and stores an on screenshot plus the shared off
source. Every effect must change at least eight pixels inside the fixed subject
rectangle and have a positive subject-region mean delta. The observed minimum
was SSAO at 183 changed subject pixels and mean delta 1.841; this is deliberately
stronger than counting a full-frame color transform. The implementation and
proof sources are statically checked for CSS filters, box shadows, and text
shadows. Canvas PNG encoding is artifact transport only; no DOM, CSS, 2D canvas,
or overlay implements an effect.

Artifacts are under `tests/reports/postprocessing/effects/`; the per-effect
receipt is `tests/reports/postprocessing/comprehensive-effects.json`.

## Current Three.js Comparison

The aggregate comparison is against the exact installed and online-verified
`three@0.185.1` / r185 release. It executes both current Three.js composition
families in Chromium:

- WebGL: actual `WebGLRenderer`, `EffectComposer`, `RenderPass`, and
  `UnrealBloomPass`;
- node postprocessing: actual `WebGPURenderer` forced to its explicit
  `WebGLBackend`, `RenderPipeline`, TSL `pass()`, and `BloomNode`.

The comparison does not hide Aura3D's current performance loss:

| Dimension | Aura3D | Three.js WebGL | Three.js node |
| --- | ---: | ---: | ---: |
| Tested public pass variants / discovered modules | 13 | 30 addon composer/pass modules | 35 TSL display modules |
| Bloom intermediate targets | 2 reusable composer targets | 13 | 11 |
| Minimal comparable bundle, minified / gzip | 26,701 / 8,518 bytes | 321,759 / 73,910 bytes | 464,900 / 131,186 bytes |
| Minimal authored chain | 4 logical lines | 7 logical lines | 7 logical lines |
| Measured bloom-chain median in the recorded run | regenerated by the canonical gate | regenerated by the canonical gate | regenerated by the canonical gate |

Bundle numbers are browser ESM bundles generated from the exact recorded
authoring snippets with the same esbuild settings. Frame numbers are warmed-up,
same-machine browser wall-clock measurements with GPU completion for both Three
paths; they are directional rather than universal rankings. Aura's public
composer currently performs CPU byte-kernel work and readback before WebGL
presentation, so its much slower full bloom chain is a real architectural gap,
not parity. The smaller bundle and two-target reuse are real advantages, but do
not offset that runtime gap for high-resolution production postprocessing.

Quality comparison is bounded. The same 720 by 405 geometry scene gives the
Aura bloom chain versus current Three.js UnrealBloomPass a structural similarity
proxy of 0.846 in the current receipt. Both have bright cores and visible halos,
but Three's multi-resolution bloom is more extensive. The node comparison proves
actual output, halo pixels, targets, and cost; it is not called same-scene pixel
identity. No blanket parity with Three.js's full addon or TSL ecosystem is
claimed.

## Verification

Useful focused package checks:

```sh
pnpm renderer:postprocessing
pnpm exec vitest run tests/unit/rendering/postprocess-composer.test.ts tests/unit/rendering/renderer-postprocess-plan.test.ts
```

The aggregate receipt is `tests/reports/postprocessing/report.json` and fails
when any constituent browser receipt is older than 30 minutes. Package-level
proof does not promote unavailable effects into root `createAuraApp`; the root
table above remains authoritative.
