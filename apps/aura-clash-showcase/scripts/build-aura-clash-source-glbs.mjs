#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const blenderScript = resolve(__dirname, "blender-build-aura-clash-assets.py");
const result = spawnSync("blender", ["-b", "--python", blenderScript, "--", repoRoot], { stdio: "inherit" });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
