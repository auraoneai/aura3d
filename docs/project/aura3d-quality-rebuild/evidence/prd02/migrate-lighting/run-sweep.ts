// Report-mode sweep runner for `aura3d migrate lighting` (PRD-02 Phase 7).
// Run: node_modules/.bin/tsx docs/project/aura3d-quality-rebuild/evidence/prd02/migrate-lighting/run-sweep.ts
import { runMigrateLighting } from "../../../../../../packages/aura3d-cli/src/commands/prd02/migrateLightingSweep.js";

const code = await runMigrateLighting(
  ["--out", "docs/project/aura3d-quality-rebuild/evidence/prd02/migrate-lighting"],
  { cwd: process.cwd(), stdout: (s) => console.log(s), stderr: (s) => console.error(s) }
);
process.exit(code);
