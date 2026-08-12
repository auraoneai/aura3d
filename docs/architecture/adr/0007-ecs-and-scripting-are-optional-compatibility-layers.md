# ADR 0007: ECS and scripting are optional compatibility layers

- **Date:** 2026-08-08
- **Status:** accepted; supersedes ADR 0001's permanent-maintenance conclusion
- **Workstream:** WS-2.4

## Context

ADR 0001 correctly refused an unsafe pre-2.0 deletion, but overreached by describing
the maintenance commitment as permanent. Current measurement still finds real
consumers: the ECS-to-renderer bridge and editor visual scripting. It also finds
that neither package is required by recommended lean/product/arcade source
entries. The aggregate `@aura3d/engine` compatibility package continues to
publish legacy `./ecs` and `./scripting` subpaths in 2.0.

## Decision

Keep `@aura3d/ecs` and `@aura3d/scripting` as explicitly optional compatibility
and authoring packages for 2.0. Do not describe them as renderer capability or
recommend them for ordinary apps. Do not add bitECS, Miniplex, or Yuka adapters
without a measured workload: doing so now would add owners rather than replace
one. The 2.0 migration removes the duplicate engine compatibility subpaths and
requires direct package imports; deletion of either dedicated package requires
a separate consumer migration and R8 proof.

## Consequences

- Existing 1.x imports keep working.
- Lean/product/arcade examples and templates must not introduce these packages
  unless the workload actually uses ECS or visual authoring.
- The dedicated packages can evolve or be replaced independently after 2.0.
- Retention is a compatibility/product decision, never competitive-renderer
  evidence.

## Evidence

`tests/reports/ecs-scripting-compatibility/report.json` records consumers,
source and bundle cost, external candidates, package maintenance, and the
recommended-entry audit.
