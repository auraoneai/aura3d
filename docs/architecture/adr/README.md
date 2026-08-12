# Architecture Decision Records — the R11 architecture lock

The Aura3D 2.0 architecture contract forbids introducing a
new engine subsystem for 2.0 without first answering, in writing:

1. Does Three.js already solve this?
2. Does another mature ecosystem library solve this?
3. Does this create lasting differentiation for Aura3D?
4. Does this belong above or below the public API?

**If any answer is unclear, implementation stops and an ADR lands here first.**

A "new subsystem" is anything that would appear on the PRD §A *what Aura3D is NOT* list, or any
package that introduces a new runtime capability rather than composing existing ones.

This directory exists because the repository already contains a hand-written rigid-body solver, an
GOAP/HTN/behaviour-tree AI framework, an ECS, hand-written audio DSP and a video publishing
pipeline — each introduced without answering those four questions, and each now being removed,
replaced, or (where R8 and R1 refuse removal) **permanently maintained** at a cost far exceeding
what the ADR would have cost. ADR 0002 is the second mode of the same failure: two
implementations of vehicle motion, where migrating to the better one turns out to be blocked on
a contract detail nobody wrote down. ADR 0001 is the worked example: two packages that would probably
have been rejected as greenfield proposals cannot now be deleted, because they ship as public
subpaths with a live consumer and satisfied production-path claims.

## Naming

`NNNN-short-kebab-title.md`, zero-padded, allocated in order. Never renumber a landed ADR.

## Template

```markdown
# ADR NNNN — <title>

- **Date:** YYYY-MM-DD
- **Status:** proposed | accepted | superseded by ADR-NNNN
- **Workstream:** <PRD workstream id>

## The four R11 questions

1. **Does Three.js already solve this?**
2. **Does another mature ecosystem library solve this?**
3. **Does this create lasting differentiation for Aura3D?**
4. **Does this belong above or below the public API?**

## Decision

## Consequences

## Evidence

Command output, measurements, or the report path that supports the decision. Per R4, an assertion
without command output is not evidence.
```

## Index

Maintained as ADRs land. An empty index is a legitimate state — it means no new subsystem has
been introduced, which is the intended default for 2.0. ADR 0001 is not a new subsystem; it
records why an existing one could not be removed.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-retain-ecs-and-scripting.md) | Retain `packages/ecs` and `packages/scripting` as public game-kit-layer API | accepted |
| [0002](0002-racing-kit-force-model-needs-a-route-length-scale.md) | `game.racing` cannot adopt the shared force model until `GameRacingRoute` states a length scale | superseded by ADR 0003 |
| [0003](0003-game-kits-use-shared-runtime-by-capability.md) | Game kits consume shared runtime services by capability; racing remains explicitly arcade | accepted |
| [0004](0004-physical-simulation-is-optional-rapier.md) | Physical simulation is optional and Rapier owns the selected engine | accepted |
| [0005](0005-navigation-is-optional-recast-detour.md) | Navigation is optional and Recast/Detour owns the selected engine | accepted |
| [0006](0006-browser-audio-stays-web-audio-owned.md) | Browser audio keeps one Web Audio playback/context owner | accepted |
| [0007](0007-ecs-and-scripting-are-optional-compatibility-layers.md) | ECS and scripting are optional compatibility/authoring layers | accepted; supersedes ADR 0001 permanence |
| [0008](0008-browser-roots-and-node-utilities-are-separated.md) | Browser package roots and Node-only utilities are separated | accepted |
| [0009](0009-runtime-descriptors-cannot-claim-capabilities.md) | Public descriptors cannot claim unmounted runtime capabilities | accepted |
| [0010](0010-lean-entrypoints-compose-existing-owners.md) | Lean entrypoints compose existing owners | accepted |
| [0011](0011-public-rendering-adapters-remain-owned-by-rendering.md) | Public rendering adapters remain owned by rendering | accepted |
