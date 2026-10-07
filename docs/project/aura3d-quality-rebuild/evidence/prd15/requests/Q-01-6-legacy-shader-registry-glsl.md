# Q-01-6 — inline GLSL in `ShaderLibrary.ts` / `ShaderLibraryCore.ts` (glsl-location gate)

**Owner:** 01 (rendering core) · **Requester:** 15 · **SLA:** 2 working days
**Gate:** `glsl-location` (fail mode since T4.9) — allowlist entries until
2026-11-30.

`packages/rendering/src/ShaderLibrary.ts` (22 GLSL template strings) and
`packages/rendering/src/ShaderLibraryCore.ts` (8) keep the legacy registry
shaders inline. Q-01-4 already marks ShaderLibraryCore do-not-touch while
consumers migrate; when the migration lands, the shader sources move to the
chunk tree (or are deleted with the lean remnants per D-02) and the
allowlist entries drop.
