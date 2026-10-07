/**
 * PRD-10 T1.16 — lane-owned DIAGNOSTIC_ONLY rows + C-36 option coverage.
 *
 * `DIAGNOSTIC_ONLY_FIELDS` in contracts/compiler.ts is the merged table (its
 * header says rows come from `diagnosticOnly.prdNN.ts`); this module merges
 * prd10's rows when the lane barrel imports it, and registers a probe-value
 * coverage row for every world builder field (§7). Lanes clear their entries
 * as the fields get wired.
 */
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage, type OptionCoverageRow } from "../../contracts/compiler";

export const PRD10_DIAGNOSTIC_ONLY: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  "instances.model.static": { reason: "C-10: static/dynamic chunking is PRD 10 scatter's, unwired until Phase 4", ownerPrd: 10 },
  "instances.model.chunkSize": { reason: "C-10: chunk sizing is PRD 10 scatter's, unwired until Phase 4", ownerPrd: 10 },
  "instances.model.shadowLod": { reason: "C-10/C-11: impostor shadow LOD is PRD 10 scatter's, unwired until Phase 4", ownerPrd: 10 },
  "instances.model.wind": { reason: "C-10: a3d_prd10_wind hook is PRD 10's, unwired until Phase 4", ownerPrd: 10 },
  "instances.model.impostor": { reason: "C-10: impostor bake is PRD 10's, unwired until Phase 4", ownerPrd: 10 },
  "material.practical": { reason: "C-10: `practical` material flag is PRD 10 time-of-day's, unwired until Phase 6", ownerPrd: 10 }
};

Object.assign(DIAGNOSTIC_ONLY_FIELDS, PRD10_DIAGNOSTIC_ONLY);

const row = (builder: string, field: string, probeValueA: unknown, probeValueB: unknown): OptionCoverageRow => ({
  builder,
  field,
  probeValueA,
  probeValueB,
  ownerPrd: 10
});

/** One coverage row per world builder field (§7.1), pending real consumers. */
registerOptionCoverage([
  // world.wind (AuraWindOptions, §7.1.3)
  row("world.wind", "directionDeg", 35, 210),
  row("world.wind", "strength", 0.5, 1.2),
  row("world.wind", "gustStrength", 0.35, 0.8),
  row("world.wind", "gustScale", 40, 12),
  row("world.wind", "turbulence", 0.2, 0.6),
  // world.timeOfDay (AuraTimeOfDayOptions, §7.1.4)
  row("world.timeOfDay", "hour", 12, 6.5),
  row("world.timeOfDay", "mode", "solar", "arc"),
  row("world.timeOfDay", "latitudeDeg", 45, -30),
  row("world.timeOfDay", "dayOfYear", 172, 355),
  row("world.timeOfDay", "northOffsetDeg", 0, 90),
  row("world.timeOfDay", "maxElevationDeg", 65, 30),
  // world.biome (AuraBiomeNode + AuraBiomeOverrides, §7.1.2)
  row("world.biome", "scope", "all", "environment"),
  row("world.biome", "overrides.sun", { elevationDeg: 45 }, { elevationDeg: 10 }),
  row("world.biome", "overrides.environment", { intensity: 1 }, { intensity: 0.5 }),
  row("world.biome", "overrides.fog", { density: 0.001 }, null),
  row("world.biome", "overrides.post", { preset: "daylight-outdoor" }, { preset: "neon-night" }),
  row("world.biome", "overrides.practicalScale", 1, 0.25),
  // world.terrain (§7.2)
  row("world.terrain", "size", [2000, 2000], [500, 500]),
  row("world.terrain", "source", { kind: "heightmap" }, { kind: "procedural" }),
  row("world.terrain", "layers", 4, 8),
  row("world.terrain", "holes", [], [[0.5, 0.5, 0.1]]),
  row("world.terrain", "collider", true, false),
  // world.water (§7.3)
  row("world.water", "kind", "lake", "ocean"),
  row("world.water", "shape", { kind: "rect" }, { kind: "disc" }),
  row("world.water", "height", 0, -0.5),
  row("world.water", "waves", "calm", "storm"),
  // world.street / world.kits (§7.4)
  row("world.street", "path", "straight", "curved"),
  row("world.street", "blocks", 4, 8),
  row("world.kits", "set", "city", "forest"),
  // instances.model (the DIAGNOSTIC_ONLY fields above)
  row("instances.model", "static", true, false),
  row("instances.model", "chunkSize", 64, 128),
  row("instances.model", "shadowLod", "impostor", "mesh"),
  row("instances.model", "wind", true, false),
  row("instances.model", "impostor", true, false),
  // material.practical
  row("material", "practical", true, false)
]);
