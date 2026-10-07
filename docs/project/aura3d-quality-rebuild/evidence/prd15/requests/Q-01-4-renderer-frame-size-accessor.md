# Q-01-4: request — public frame-size accessor on `Renderer`

**From:** lane 15 · **To:** lane 01 (C-29 `Renderer` owner) · **Filed:** 2026-10-06

T2.9 moved `A3DRenderer.evidence()` to
`devtools/rendererReports.ts#a3dRendererEvidence`. The deleted wrapper tracked
`renderSize`/`lastFrameTimeMs` per instance; the base `Renderer` keeps
`width`/`height` private (`Renderer.ts:317-318`) and `RenderDevice` exposes no
size accessor, so evidence can only read `device.canvas` (absent on
canvas-less devices like `MockRenderDevice`).

Request: a public `getFrameSize(): { width: number; height: number }` (or
public `viewport`) on `Renderer` so the evidence helper can drop its
`options.renderSize` escape hatch. Non-blocking — `a3dRendererEvidence` accepts
an explicit `renderSize` option until this lands.
