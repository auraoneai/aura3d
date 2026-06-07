# Aura3D 1.0.6 Release Gates

Version: 1.0.6
Status: Superseded by `docs/project/aura3d-110-release-gates.md`

This file exists to close the historical 1.0.6 planning record. The 1.0.6 workstream defined the game-engine and Aura Clash Arena gap, but the final scoped release evidence moved forward through the corrective 1.0.10 patch line.

Use the 1.0.10 gate document for current publish, npm, deployment, CLI, and Aura Clash evidence:

- `docs/project/aura3d-110-release-gates.md`
- `docs/project/aura3d-110-release-gates.md`
- `tests/reports/aura3d110/readiness.json`
- `tests/reports/aura3d110/deployed-visual-proof.json`
- `tests/reports/aura3d110/published-cli-catalog-proof.json`
- `tests/reports/aura3d110/published-engine-proof.json`

## 1.0.6 Scope Decision

The 1.0.6 line should be read as the parent planning and implementation track for:

- public game-app lifecycle work;
- typed GLB actor/animation evidence;
- fighting-character CLI/catalog profile validation;
- contextual Aura Clash Arena source names;
- removal of failed `game-v*` implementations;
- docs-claim gates;
- local and deployed browser proof.

The 1.0.6 line should not be treated as the current published package baseline. Current public packages are `1.0.10`.

## Supersession Rule

If this document conflicts with `docs/project/aura3d-110-release-gates.md`, the 1.0.10 gate document wins.

## Current Required Commands

Run the 1.0.10 commands for any current release decision:

```bash
pnpm typecheck
pnpm --dir apps/aura-clash-showcase test:flagship
pnpm --dir apps/aura-clash-showcase test:playable
pnpm --dir apps/aura-clash-showcase build
pnpm --dir marketing build
pnpm verify:aura3d110-docs-claims
pnpm verify:aura3d110-performance
pnpm verify:aura-clash-flagship
pnpm verify:aura3d110-deployed-visual
pnpm aura3d110:readiness
```

## Claim Boundary

Even when the scoped 1.0.10 gates pass, Aura3D still must not claim mature commercial game-engine parity with Unity, Unreal, or Babylon.js, and Aura Clash Arena still must not be described as a flagship-quality fighting game unless the remaining peer-grade showcase gates are explicitly passed and visually approved.

