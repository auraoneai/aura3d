# Q-11-4 — `ProductionWebGPURenderer` self-construction + `webgl2/Probe.ts` inline GLSL (single-renderer, glsl-location)

**Owner:** 11 (GPU/tiers) · **Requester:** 15 · **SLA:** 2 working days
**Gates:** `single-renderer`, `glsl-location` (fail mode since T4.9) — two
allowlist entries until 2026-11-30.

1. `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts:52`
   constructs `new ProductionWebGPURenderer(...)` — a third renderer owner.
   §12.4 already plans its deletion: fold it into `WebGPUDevice` /
   `RenderBackend` and drop the class (the §12.4 request id in your lane's
   plan may be Q-11-1's rename — this request covers the actual file).
2. `packages/rendering/src/webgl2/Probe.ts` holds 2 inline `#version 300 es`
   template strings (probe shaders). Move them under
   `program/chunks/` or the shaders chunk tree so `glsl-location` can drop
   the allowlist entry.
