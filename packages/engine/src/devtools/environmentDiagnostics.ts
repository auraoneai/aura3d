// PRD-15 T6.5: former @aura3d/environments "." surface, relocated under engine devtools.
// Browser-safe environment diagnostics (no node:fs). Node-only manifest loaders
// stay on ./environments/node.js, mirroring the old package's "./node" entry.
export * from "./environments/index.js";
