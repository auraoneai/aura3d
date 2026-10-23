# Ninja Runner reference provenance

- Source: https://app.usecrayon.ai/play/e049e3e4-677f-42d5-8c34-3aa4af454068 (Crayon "Ninja Runner", three r184 bundle, 867,109 bytes).
- Bundle sha256: `294c67be8d069ea8516d0f96e76c2fe04a35aa9a09bfe8b397f9d7b459606679`.
- The third-party bundle is intentionally not committed. Only measurements derived from it are: `evidence/crayon-capture/ninja-runner-reference.json` and `tests/browser/data/ninja-runner-reference-replay.json`.
- Method: pre-boot hook freezes `requestAnimationFrame`; the sim is stepped through the game's own `window.__konoha.simulate(1/120 + 1e-6)` (exactly one fixed step) and driven through `__konoha.action`. Tooling: `tools/crayon-capture/ninja-runner.ts`, assembled by `ninja-runner-assemble.ts`. Runs were serverless ACR tasks (cc1dm smoke, cc1dv, cc1dw).
