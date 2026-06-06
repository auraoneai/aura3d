#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const outPath = process.env.AURA_CLASH_FLAGSHIP_READINESS_OUT ?? "apps/aura-clash-showcase/tests/reports/flagship-readiness.json";

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "tsx",
    "--tsconfig",
    "tsconfig.base.json",
    "tools/aura-clash-flagship-readiness/index.ts",
    "--out",
    outPath,
    ...process.argv.slice(2)
  ],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
