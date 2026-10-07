# Q-07-1 — repoint `Decals.ts` imports off the barrel

**Lane:** 07 (owns `packages/engine/src/agent-api/Decals.ts`)
**Requested by:** lane 15 (PRD-15 T3.2)
**Status:** OPEN
**Filed:** 2026-10-06

## What

`Decals.ts` imports `AuraNodeBuilder` and the `Aura*` types from the `agent-api`
barrel (`./index.js`), which keeps a `Decals.ts ↔ index.ts` strongly-connected
component in the module graph (the barrel re-exports leaf modules; this file
imports the barrel). T3.2 created `agent-api/nodes/builder.ts` and
`agent-api/nodes/types.ts` so consumers of the builder no longer need the barrel.

## Requested change

Two import specifiers (exact line numbers per T3.2: `Decals.ts:39` and `:47`):

```ts
// was: import { AuraNodeBuilder } from "./index.js";
import { AuraNodeBuilder } from "./nodes/builder.js";

// was: import type { ... } from "./index.js";
import type {
  AuraAssetRef,
  AuraColor,
  AuraMaterialSpec,
  AuraPrimitiveNode,
  AuraSceneNode,
  AuraVec3
} from "./nodes/types.js";
```

Name-for-name, no other edits. `tsc --noEmit` stays green; the barrel keeps
re-exporting both so nothing else is affected.

## Until it lands

The `no-cycles` arch gate (PRD-15 §:1044) allowlists the
`Decals.ts ↔ index.ts` SCC with today's date. Once this lands, the gate reports
the SCC gone and lane 15 removes the allowlist row in a daily sweep.

## Contract served

§3.2 `nodes/builder.ts`/`nodes/types.ts` targets; §:1437 request-table row
Q-07-1; T3.2.
