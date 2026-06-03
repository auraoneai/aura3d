# Compatibility Matrix

Version: 1.0.0

## Runtime

| Area | Current status |
|---|---|
| Node package tooling | `pnpm@11.1.3` in `package.json` |
| TypeScript packages | First-party workspace packages under `packages/` |
| Browser dev server | Vite route registry from repo root |
| WebGL2 | Primary renderer backend for most browser routes |
| WebGPU | Explicit package and root route support with device/browser-dependent availability |
| manual renderer code | Reference implementation and migration target, not A3D runtime renderer |
| Babylon.js | Benchmark/reference comparison only |

## Browser Evidence

Browser support is bounded to the tests and local reports that have been run. Current Playwright configuration and report tools should be checked before making any browser matrix claim.

For WebGPU claims, check `tests/reports/webgpu-hardware-matrix.json`, `tests/reports/webgpu-feature-matrix.json`, and [docs/rendering/webgpu-hardware-matrix.md](../rendering/webgpu-hardware-matrix.md). Injected WebGPU runtimes count as contract evidence only, not hardware coverage.

## Package Compatibility

The root package export map uses contextual subpaths such as `./production-runtime`, `./advanced-runtime`, `./rendering/production-runtime`, `./rendering/advanced-runtime`, `./assets/asset-corpus`, and `./assets/advanced-gallery`. Legacy versioned package aliases are not current product taxonomy and should not be used in new docs or examples.

## Claim Boundary

Compatibility docs must stay narrower than generated report evidence. Do not claim full browser, WebGPU, manual renderer code, Babylon.js, Unity, Unreal, or glTF ecosystem compatibility without a current report proving it.
Compatibility wording and public-claim boundaries are governed by `docs/project/product-studio-claim-registry.md`.
