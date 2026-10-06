#!/usr/bin/env node
/**
 * scripts/check-art-direction.mjs — PRD-14 T1.9 (§7.1 `capture-branch` rule).
 *
 * Static half: scans `apps/<dir>/src/v2/**` for capture branches — source that
 * behaves differently under a capture/review query — and for mounted-scene
 * ambient lights, which the §7.1 validator forbids. Exits 1 on any violation.
 *
 * Runtime half (`--runtime`, executed by the lane workflow's Playwright job,
 * tests/qr/prd14/browser/art-direction-audit.spec.ts): builds the route,
 * mounts it with flags `route-<id>`, collects snapshotForAudit + C-34 lookLint
 * findings, and runs auditArtDirection — exits 1 on any violation.
 *
 * Usage:
 *   node scripts/check-art-direction.mjs --routes showcase-bank-shot[,…]
 *   node scripts/check-art-direction.mjs --apps-root <dir> --routes <name>
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_EVIDENCE_GLOBALS = new Set(["__AURA3D_GAME__", "__AURA3D_GAME_EVIDENCE__"]);

const PATTERNS = [
  { re: /capture=review/, rule: "capture-branch", why: "`capture=review` query branch (capture mode may change camera, clock, seed and scenario only)" },
  { re: /visualReviewCapture/, rule: "capture-branch", why: "`visualReviewCapture` branch" },
  { re: /window\.__([A-Z0-9_]+)__/g, rule: "capture-branch", why: "non-beacon `window.__*__` evidence global", globalCheck: true },
  { re: /lights\.ambient|type:\s*["']ambient["']|ambientLight\s*\(|new\s+AmbientLight/, rule: "ambient-light", why: "ambient light in src/v2 (§7.1 forbids it)" }
];

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|jsx|mts|cts|vue|svelte)$/.test(entry.name)) yield p;
  }
}

export function scanV2Source(file, violations = []) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (const { re, rule, why, globalCheck } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    if (globalCheck) {
      const found = new Set();
      while ((m = re.exec(src)) !== null) {
        if (!ALLOWED_EVIDENCE_GLOBALS.has(`__${m[1]}__`)) found.add(`__${m[1]}__`);
      }
      for (const g of found) violations.push(`${file}: ${why} "window.${g}"`);
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) violations.push(`${file}:${i + 1}: ${rule}: ${why}`);
        re.lastIndex = 0;
      }
    }
  }
  return violations;
}

export function checkArtDirection(appsRoot, routeIds) {
  const violations = [];
  const scanned = [];
  for (const id of routeIds) {
    const v2 = join(appsRoot, id, "src", "v2");
    if (!existsSync(v2)) {
      violations.push(`${id}: no src/v2 tree (T1.10 dispatcher missing)`);
      continue;
    }
    let count = 0;
    for (const f of walk(v2)) { scanV2Source(f, violations); count++; }
    if (count === 0) violations.push(`${id}: src/v2 is empty`);
    else scanned.push(`${id} (${count} files)`);
  }
  return { violations, scanned };
}

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-art-direction.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  const routes = (argValue(args, "--routes") ?? "").split(",").filter(Boolean);
  const appsRoot = argValue(args, "--apps-root") ?? "apps";
  if (args.includes("--help") || routes.length === 0) {
    console.log("usage: node scripts/check-art-direction.mjs --routes <id>[,<id>…] [--apps-root apps] [--runtime]");
    process.exit(routes.length === 0 ? 2 : 0);
  }
  if (args.includes("--runtime")) {
    console.log("runtime audit is run by the lane Playwright job: pnpm exec playwright test tests/qr/prd14/browser/art-direction-audit.spec.ts");
    process.exit(0);
  }
  const { violations, scanned } = checkArtDirection(appsRoot, routes);
  for (const s of scanned) console.log(`scanned ${s}`);
  if (violations.length > 0) {
    console.error(`check-art-direction failed (${violations.length}):`);
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log(`art-direction static scan ok: ${routes.length} route(s)`);
}
