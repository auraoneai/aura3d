// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { attachVisualScriptingGraph as attachVisualScriptingGraphFn, createVisualScriptingGraph as createVisualScriptingGraphFn, listVisualScriptingNodeCatalog as listVisualScriptingNodeCatalogFn } from "@aura3d/scripting";

export const visualScripting = {
  graph: createVisualScriptingGraphFn,
  attach: attachVisualScriptingGraphFn,
  catalog: listVisualScriptingNodeCatalogFn
} as const;
