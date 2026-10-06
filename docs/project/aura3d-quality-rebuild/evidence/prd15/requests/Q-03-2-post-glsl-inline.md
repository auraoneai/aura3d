# Q-03-2 — inline GLSL in `TemporalHistory.ts` and `webgl2/LegacyPost.ts` (glsl-location gate)

**Owner:** 03 (post) · **Requester:** 15 · **SLA:** 2 working days
**Gate:** `glsl-location` (fail mode since T4.9) — allowlist entries until
2026-11-30.

- `packages/rendering/src/TemporalHistory.ts` — 2 inline `#version 300 es`
  template strings (TAA history shaders).
- `packages/rendering/src/webgl2/LegacyPost.ts` — 17 inline `#version 300 es`
  template strings (legacy bloom/post pipeline carved from WebGL2Device).

Move both to chunk modules under `packages/rendering/src/post/`,
`postprocess/`, or the shaders chunk tree so `glsl-location` can drop the
allowlist entries.
