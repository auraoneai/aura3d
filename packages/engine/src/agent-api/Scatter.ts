/**
 * Root scatter-planning builders (PART D2).
 *
 * GPU-instanced scatter planning is package-level and real
 * (`planScatterInstances` / `scatterWindOffset` / `enforceFrameBudget` in
 * `@aura3d/rendering`): density admits, distance culls, wind sways, and the
 * frame budget sheds canopy load before it ships. This module is the public
 * root surface so a `createAuraApp` route can author scatter-planned green
 * corridors and budget telemetry without deep-importing the renderer
 * (showcase/template sources must not import `@aura3d/rendering` —
 * see `tests/unit/agent-api/public-example-boundary.test.ts`).
 *
 * Thin re-export by design: the math lives in exactly one place
 * (`TerrainTiles.ts`); this surface only makes it root-reachable.
 */
import {
  enforceFrameBudget,
  planScatterInstances,
  scatterWindOffset,
  type FrameBudgetDecision,
  type FrameBudgetInput,
  type ScatterPlan,
  type ScatterPlanOptions
} from "@aura3d/rendering";

export {
  enforceFrameBudget,
  planScatterInstances,
  scatterWindOffset,
  type FrameBudgetDecision,
  type FrameBudgetInput,
  type ScatterPlan,
  type ScatterPlanOptions
};
