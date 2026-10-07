# Q-06-4 — `AnimationController` name collision: rename or drop one side

- **Requester:** lane 15 (PRD-15 T5.8, `unique-ownership` gate)
- **Owner:** lane 06
- **SLA:** 2 working days
- **Files:** `packages/animation/src/AnimationController.ts`, `packages/engine/src/agent-api/AnimationController.ts`

## What

`AnimationController` is exported by both `@aura3d/animation` and
`@aura3d/engine` with different declarations — the §6.12 table flags this
exact pair (spec suggested renaming the package one to
`AnimationLayerController` or deleting it; engine's is the one games bind).

## Ask

Rename or delete `packages/animation/src/AnimationController.ts`'s export so
one package owns the name. Allowlisted in `tools/arch-gates/allowlist.json`
until then.
