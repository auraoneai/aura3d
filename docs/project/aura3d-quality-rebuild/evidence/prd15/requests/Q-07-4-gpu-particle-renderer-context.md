# Q-07-4 — `ResidentGPUParticleRenderer` creates its own `webgpu` context (single-renderer gate)

**Owner:** 07 (vfx/effects) · **Requester:** 15 · **SLA:** 2 working days
**Gate:** `single-renderer` (fail mode since T4.9) — finding suppressed by
`tools/arch-gates/allowlist.json` entry until 2026-11-30.

`packages/rendering/src/effects/ResidentGPUParticleRenderer.ts:122` calls
`canvas.getContext("webgpu")` directly. Per §6.12 one device owns the GPU:
context creation and `RenderDevice` construction belong to
`WebGL2Device.ts` / `WebGPUDevice.ts` / `RenderBackend.ts`.

## Requested change

Route the particle renderer's device access through `RenderBackend` / the
C-29 factory seam (`Renderer.create({ backend: "webgpu" })`), or hand it a
`GPUCanvasContext` produced by the device owner. If the file is being folded
into the VFX backend anyway, delete the standalone `getContext` call as part
of that work and the allowlist entry can be dropped early.
