/**
 * Lane prd10 barrel (CONTRACTS.md §3.8): C-26 real provide + the C-38 `world`
 * app extension. `app.world` resolves `worldQueriesSlot.get(flags)` so flag-off
 * apps get the C-26 stub and flag-on apps get the PRD-10 queries.
 */
import { registerAppExtension } from "../contracts/app.js";
import { worldQueriesSlot } from "../contracts/world.js";
import { createWorldQueries, setWorldFlags } from "../agent-api/world/queries.js";
import { createWorldRuntime } from "../agent-api/world/runtime.js";
import { registerWorldFramePasses } from "../production-runtime/world/WorldFramePasses.js";
import { registerWorldDiagnosticsSection } from "../production-runtime/world/WorldDiagnostics.js";
import { registerWorldNodeHandlers } from "../agent-api/compiler/world.js";
import { registerWorldPhase6 } from "../agent-api/world/register.js";
import { registerPrd10WindFeatures, registerPrd10FoliageLobe, registerPrd10UnderwaterFeatures } from "@aura3d/rendering/world";
// 10-CHUNKS: explicit call — the lanes barrel's side-effect registration is
// dropped by "sideEffects": false in chunked builds (relative leaf per T0-23
// until an exported subpath lands).
import { registerPrd10Chunks } from "../../../rendering/src/lanes/prd10.js";
import "../agent-api/compiler/diagnosticOnly.prd10.js";

worldQueriesSlot.provide(createWorldQueries);

registerAppExtension({
  id: "prd10.world",
  owner: "prd10",
  flag: "A3D_QR_WORLD",
  member: "world",
  create: (app, ctx) => {
    setWorldFlags(app, ctx.flags);
    const impl = worldQueriesSlot.get(ctx.flags);
    // Flag on → provided impl: bind the full runtime (⊃ AuraWorldQueries) and
    // register providers for world nodes already declared on the scene.
    if (worldQueriesSlot.provided && impl === createWorldQueries) {
      const scene = (ctx.options as { scene?: unknown } | undefined)?.scene;
      return createWorldRuntime(app, { scene });
    }
    return impl(app); // flag-off: frozen C-26 stub
  }
});

registerPrd10Chunks();
registerWorldFramePasses();
registerWorldDiagnosticsSection();
registerWorldNodeHandlers();
// T6.x — C-34 lint rules + C-09 env sources (biome @300, timeOfDay @250).
registerWorldPhase6();
// T3.3/T3.4: Path G program-cache features (wind deform + foliage lobe) —
// registered unconditionally; the registries gate them on A3D_QR_WORLD.
registerPrd10WindFeatures();
registerPrd10FoliageLobe();
// T4.5: `prd10.caustics` ShaderFeature + `prd10.underwaterDistortion` post pass
// (A3D_QR_WORLD-gated by the registries).
registerPrd10UnderwaterFeatures();
