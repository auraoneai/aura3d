# Q-06-2 — inline GLSL in `animation/AnimationToonMaterial.ts` (glsl-location gate)

**Owner:** 06 (animation) · **Requester:** 15 · **SLA:** 2 working days
**Gate:** `glsl-location` (fail mode since T4.9) — allowlist entry until
2026-11-30.

`packages/rendering/src/animation/AnimationToonMaterial.ts` holds 2 inline
`#version 300 es` template strings (`ANIMATION_TOON_VERTEX_SOURCE` /
`ANIMATION_TOON_FRAGMENT_SOURCE`). Move them under the shaders chunk tree
(e.g. `shaders/` or a chunks module) so `glsl-location` can drop the
allowlist entry.
