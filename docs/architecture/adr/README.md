# Architecture Decision Records — the R11 architecture lock

R11 of [`Aura3D-1.6-Replatform-PRD.md`](../../../Aura3D-1.6-Replatform-PRD.md) forbids introducing a
new engine subsystem during 1.6 without first answering, in writing:

1. Does Three.js already solve this?
2. Does another mature ecosystem library solve this?
3. Does this create lasting differentiation for Aura3D?
4. Does this belong above or below the public API?

**If any answer is unclear, implementation stops and an ADR lands here first.**

A "new subsystem" is anything that would appear on the PRD §A *what Aura3D is NOT* list, or any
package that introduces a new runtime capability rather than composing existing ones.

This directory exists because the repository already contains a hand-written rigid-body solver, an
unused GOAP/HTN/behaviour-tree AI framework, an unused ECS, hand-written audio DSP and a video
publishing pipeline — each introduced without answering those four questions, and each now being
removed, replaced or archived at a cost far exceeding what the ADR would have cost.

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

Maintained as ADRs land. Empty is a legitimate state — it means no new subsystem has been
introduced, which is the intended default for 1.6.

| ADR | Title | Status |
|---|---|---|
| — | none yet | — |
