# Q-12-6: `viewer.renderer.backend` → `renderer.device.kind` (benchmark scene)

**From:** lane 15 · **To:** lane 12 · **Filed:** 2026-10-06

T2.6 deleted `ProductionRuntimeRenderer`/`ProductionWebGL2Renderer` and the
engine `A3DRenderer` facade; `A3DProductViewer.renderer` is now the single C-29
`Renderer`, which exposes `device.kind` (not `.backend`).

One-line surgical redirect applied on `qr/prd15-one-renderer` to keep trunk
green:

- `benchmarks/aura3d/src/scenes/current-routes-flagship-viewer.ts:195` —
  `backend: viewer.renderer.backend` →
  `backend: viewer.renderer.device.kind === "webgpu" ? "webgpu" : "webgl2"`.

If your PRD prefers a different accessor (e.g. a `backend` getter on the
product viewer), feel free to replace the line; this was the minimal
no-API-addition fix.
