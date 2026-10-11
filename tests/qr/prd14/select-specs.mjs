#!/usr/bin/env node
// tests/qr/prd14/select-specs.mjs — prints the lane-14 browser spec files
// for the given route dirs (comma-separated argv[2], or A3D_QR_ROUTES).
// Per-route specs are matched by their `const APP_DIR = "<dir>"`; specs
// without APP_DIR (art-direction-audit, budgets) iterate games.json
// themselves, filtered by A3D_QR_ROUTES, and are always included.
// Exits 1 when a requested dir has no per-route spec, so a route can never
// drop out of the S1..S9 run silently.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BROWSER = fileURLToPath(new URL("./browser/", import.meta.url));
const dirs = (process.argv[2] ?? process.env.A3D_QR_ROUTES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (dirs.length === 0) {
  console.error("select-specs: no route dirs given");
  process.exit(1);
}

const selected = [];
const covered = new Set();
for (const name of readdirSync(BROWSER).filter((n) => n.endsWith(".spec.ts")).sort()) {
  const src = readFileSync(join(BROWSER, name), "utf8");
  const appDir = /const APP_DIR = "([^"]+)"/.exec(src)?.[1];
  if (appDir === undefined || dirs.includes(appDir)) {
    selected.push(join("tests/qr/prd14/browser", name));
    if (appDir !== undefined) covered.add(appDir);
  }
}
const missing = dirs.filter((d) => !covered.has(d));
if (missing.length > 0) {
  console.error(`select-specs: no per-route spec for ${missing.join(", ")}`);
  process.exit(1);
}
process.stdout.write(selected.join("\n") + "\n");
