/**
 * Lane prd10 barrel (CONTRACTS.md §3.8): C-26 real provide + the C-38 `world`
 * app extension. `app.world` resolves `worldQueriesSlot.get(flags)` so flag-off
 * apps get the C-26 stub and flag-on apps get the PRD-10 queries.
 */
import { registerAppExtension } from "../contracts/app.js";
import { worldQueriesSlot } from "../contracts/world.js";
import { createWorldQueries, setWorldFlags } from "../agent-api/world/queries.js";
import { registerWorldFramePasses } from "../production-runtime/world/WorldFramePasses.js";
import { registerWorldDiagnosticsSection } from "../production-runtime/world/WorldDiagnostics.js";
import "../agent-api/compiler/diagnosticOnly.prd10.js";

worldQueriesSlot.provide(createWorldQueries);

registerAppExtension({
  id: "prd10.world",
  owner: "prd10",
  flag: "A3D_QR_WORLD",
  member: "world",
  create: (app, ctx) => {
    setWorldFlags(app, ctx.flags);
    return worldQueriesSlot.get(ctx.flags)(app);
  }
});

registerWorldFramePasses();
registerWorldDiagnosticsSection();
