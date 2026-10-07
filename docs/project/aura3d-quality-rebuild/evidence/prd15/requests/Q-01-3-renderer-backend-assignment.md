# Q-01-3 — assign `Renderer.backend` in the constructor

**Lane:** 01 (owns `packages/rendering/src/Renderer.ts`)
**Requested by:** lane 15 (PRD-15 T2.1 — C-29 consumer test)
**Status:** OPEN
**Filed:** 2026-10-06

## What

The C-29 seam added `readonly backend: RenderDevice["kind"]` to `Renderer`
(`packages/rendering/src/Renderer.ts:133`) but nothing assigns it — the field
reads `undefined` on every instance:

```ts
readonly backend: RenderDevice["kind"];   // declared, never assigned
```

## Requested change

One line in the constructor (exact placement at the maintainer's choice):

```ts
this.backend = device.kind;
```

## Evidence

`tests/qr/prd15/renderer-factory-consumer.test.ts` asserts
`renderer.backend === "mock"` after `await Renderer.create({ backend: "mock" })`
— it currently reads `undefined` (verified: vitest, received `undefined`). The
assertion is marked `it.fails` with a pointer here; when this lands, the test
turns red until `.fails` is removed — that's the landing signal.

## Why lane 15 can't do it

Single-writer rule: `packages/rendering/src/Renderer.ts` is 01-owned, and
PRD-15 T2.1 explicitly forbids a `Renderer.ts` edit from the consuming lane.
