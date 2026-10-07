// PRD-13 T1.12 — vitest config for tests/qr/** (the repo config's `include`
// is fixed to tests/{unit,integration,assets}/**; extending it is a prd15 ccr).
// `qr-prd13-authoring.yml` runs: vitest run --config tests/qr/prd13/vitest.qr-prd13.config.ts

import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default defineConfig({
  root: repoRoot,
  test: {
    include: ["tests/qr/**/*.test.ts"],
    environment: "node"
  }
});
