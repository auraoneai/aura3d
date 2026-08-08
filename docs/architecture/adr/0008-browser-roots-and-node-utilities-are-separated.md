# ADR 0008: Browser roots and Node utilities are separated

- **Date:** 2026-08-08
- **Status:** accepted
- **Workstream:** WS-2.5

## The four R11 questions

1. **Does Three.js already solve this?** Three.js keeps its normal browser
   imports free of Node filesystem dependencies; Aura3D must meet the same
   baseline.
2. **Does another mature ecosystem library solve this?** Package export
   subpaths and environment-specific entry points are the standard solution.
3. **Does this create lasting differentiation for Aura3D?** No. It removes an
   avoidable compatibility defect.
4. **Does this belong above or below the public API?** At package export
   boundaries, enforced below application code.

## Decision

Every documented browser root is bundled with no Node builtins declared as
externals. Node-only FFmpeg, filesystem validation, manifest loading, hashing,
and corpus inspection live behind explicit `media-node`, `materials/node`, or
`environments/node` entries. The check follows all static and analyzable dynamic
edges using esbuild. A Node entry is also required to reach a Node builtin so an
empty or accidentally browser-side entry cannot pass vacuously.

## Evidence

`tests/reports/browser-entry-purity.json` covers 31 browser entries and three
explicit Node entries.
