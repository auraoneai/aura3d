# QR request → lane 14

**From:** lane 15 (PRD-15 api/package architecture consolidation)
**Date:** 2026-10-07
**Status:** open — deprecated "." name kept until repointed

## What

`apps/showcase-mech-hangar/src/gameplay/assembly.ts` imports `CharacterAssemblyValidationReport` from `"@aura3d/engine"` ("." public surface).

```ts
import { …, CharacterAssemblyValidationReport, … } from "@aura3d/engine";
```

## Why it matters

PRD-15 T8.1 removed `CharacterAssemblyValidationReport` from the "." surface as part of the deprecated-union removal sweep (it was in the `aura.exports.json` deprecated list — see `evidence/prd15/phase8-removal-sweep.md`, removal table). Your file landed on main after the sweep computed its consumer list, so the name is now kept on "." as a `@deprecated` re-export specifically to not break you (merge commit on `qr/prd15-40-removal`).

The name still lives on its live home — nothing else changes:

```ts
import type { CharacterAssemblyValidationReport } from "@aura3d/engine/agent-api";
// or whatever leaf path fits your lane's conventions; agent-api/index.ts:396 still exports it.
```

## Ask

When your lane next touches `apps/showcase-mech-hangar`, repoint this import off "." so T8.1 can finish deleting the kept-deprecated entry at 4.0.0 release. Until then it stays exported (deprecated) and your code keeps compiling.

## Ownership

Request filed under lane-15 evidence per the cross-lane request protocol; the affected file is lane-14-owned, so the repoint is yours. Keeping the deprecated "." export in the interim is lane-15's, done on `qr/prd15-40-removal`.
