// PRD-13 T1.12 — vitest config for the lane-13 delta suite (tests/qr/prd13/**).
// `qr-prd13-authoring.yml` runs: vitest run --config tests/qr/prd13/vitest.qr-prd13.config.ts
//
// Scope is lane 13's own tests/qr/prd13 tree, as the workflow header and the
// step name ("PRD-13 delta suite") document; the previous `tests/qr/**`
// include swept every lane's tree into this job, where none of it could
// resolve (see below). Other lanes' tests/qr/prdNN specs belong to their own
// lane workflows and configs.
//
// It extends the repo vitest config so the workspace `resolve.alias` map
// (every @aura3d specifier → src/) and `server.deps.inline` apply; without
// them every spec importing a workspace package failed with "Failed to resolve
// entry for package" because package `exports` point at an unbuilt dist/.

import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import repoConfig from "../../../vitest.config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export default defineConfig({
  ...repoConfig,
  root: repoRoot,
  test: {
    ...repoConfig.test,
    include: ["tests/qr/prd13/**/*.test.ts"],
    environment: "node"
  }
});
