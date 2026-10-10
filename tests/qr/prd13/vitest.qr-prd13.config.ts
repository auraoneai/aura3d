// PRD-13 T1.12 — vitest config for tests/qr/** (the lane-13 delta suite plus
// every lane's tests/qr unit specs).
// `qr-prd13-authoring.yml` runs: vitest run --config tests/qr/prd13/vitest.qr-prd13.config.ts
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
    include: ["tests/qr/**/*.test.ts"],
    environment: "node"
  }
});
