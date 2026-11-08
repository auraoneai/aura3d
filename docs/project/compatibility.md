# Compatibility Matrix

Version: 5.2.1; matrix revision: `native-browser-support/1`.

Current release: Aura3D 5.2.1, the major release carrying the
native-capability work ([4.x to 5.0 migration guide](../migration/4-to-5.md)).

The versioned cells and evidence requirements are defined in
[Native browser and device support](../rendering/native-browser-support.md).
No browser/OS/backend combination is promoted to supported by this matrix for
the native-capability candidate: the required candidate-bound browser and
device runs have not yet been performed. All target cells below are
**unverified**, including when an older report exists for a different revision,
test, browser or launch profile.

Compatibility wording and public-release notes are governed by `docs/project/product-studio-claim-registry.md`.

## Runtime

| Area | Current status |
|---|---|
| Node package tooling | `pnpm@11.1.3` in `package.json` |
| Node.js runtime | `engines.node` `>=22.12.0` (synchronous `require(esm)` for the CommonJS math bridge). The packed ESM/CommonJS consumer (`tests/integration/native-capability-consumer.test.ts`) reports Node 22, 24 and 26 as executed or explicitly unavailable in `node-support-matrix.json`; `A3D_NODE_MATRIX` names extra executables. |
| TypeScript packages | First-party workspace packages under `packages/` |
| Browser dev server | Vite route registry from repo root |
| WebGL2 | Primary renderer backend for most browser routes; availability and results depend on the browser and device. |
| WebGPU | Explicit, experimental path; browser, adapter and device availability are not established by a software or injected test. |

## Target browser cells

The versions below identify the **target automation distributions**, not an
observation of an executable or a supported version range. The lockfile pins
Playwright `1.59.1`, whose browser manifest specifies the displayed versions.
The planned runner image is Ubuntu 24.04 (Noble). An actual result must record
the executed browser version and OS independently. It proves only the measured
combination and workload.

| Distribution and version target | OS target | Backend | Evidence tier and state |
|---|---|---|---|
| Playwright Chromium headless shell 147.0.7727.15 | Ubuntu 24.04 | WebGL2 | Default-flags `chromium-automation`; **unverified** |
| Playwright Firefox 148.0.2 | Ubuntu 24.04 | WebGL2 | Default-flags `firefox-automation`; **unverified** |
| Playwright WebKit 26.4 | Ubuntu 24.04 | WebGL2 | Default-flags `webkit-automation`; **unverified** |
| Playwright Chromium 147.0.7727.15, headless | Ubuntu 24.04 | WebGPU / WebGL2 | `chromium-gpu-headless` probe; adapter class must be measured; **unverified** |
| Playwright Chromium headless shell 147.0.7727.15 | Ubuntu 24.04 | WebGL2 | Explicit SwiftShader diagnostic `chromium-software`; **unverified** |
| Playwright Chromium headless shell 147.0.7727.15 | Ubuntu 24.04 | WebGPU / WebGL2 | Flagged `chromium-experimental`; **unverified** |
| Retail Chrome, Firefox or Edge, any version | Windows, macOS or Linux, any version | WebGL2 / WebGPU | Retail desktop browser; **unverified** |
| Retail Safari, any version | macOS, any version | WebGL2 / WebGPU | Retail desktop browser; **unverified** |
| Retail Safari, any version | iOS/iPadOS, any version | WebGL2 / WebGPU | Retail mobile browser; **unverified** |
| Retail Chrome, any version | Android, any version | WebGL2 / WebGPU | Retail mobile browser; **unverified** |
| Any retail desktop or mobile browser | Any applicable OS | WebGL2 / WebGPU | Physical desktop, mobile or tablet; **unverified** |
| Injected GPU/XR runtime, emulation or simulator, any version | Any OS | WebGL2 / WebGPU / XR | Contract or emulation evidence only; **unverified** for a physical device |

No broader browser or OS version range is currently supported by this matrix.
Software rendering can provide software-specific evidence; it does not prove
physical-GPU behavior. An automation distribution is not a retail browser,
and an emulator or injected session is not a physical device.

The root render path uses WebGL2 for renderable scenes. A failed production
mount is reported without substituting a fallback renderer; lack of WebGL2
for a renderable scene is an error, not a Canvas2D 3D rendering substitute. The
lower-level WebGPU selection and failure semantics are documented in
[the native support policy](../rendering/native-browser-support.md#backend-selection-and-fallback).

## Evidence and package compatibility

Historical reports under `tests/reports/`, including
`webgpu-hardware-matrix.json`, apply only to their recorded inputs and remain
historical until independently bound to the candidate. See also the
[WebGPU hardware notes](../rendering/webgpu-hardware-matrix.md).
An injected WebGPU runtime is contract evidence, not hardware coverage.

The root package export map uses contextual subpaths such as
`./production-runtime`, `./advanced-runtime`, `./rendering/production-runtime`,
`./rendering/advanced-runtime`, `./assets/asset-corpus`, and
`./assets/advanced-gallery`. Legacy versioned package aliases are not current
product taxonomy.

Compatibility wording and public-release notes are governed by
[`product-studio-claim-registry.md`](product-studio-claim-registry.md).
