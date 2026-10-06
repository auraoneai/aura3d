#!/usr/bin/env node
/**
 * scripts/check-route-health.mjs — PRD-14 T1.8 (§7.4).
 *
 * Validates every apps/<dir>/route-health.json (or --routes subset):
 *   1. publicShowcase: true requires qualityGate.status === "accepted".
 *   2. An accepted gate needs non-empty qualityGate.acceptedBy of human
 *      reviewer logins — agent ids are rejected.
 *   3. Free-text quality claims are gone: no `claim`/`systems` fields, and no
 *      `primitiveStatus.sourceOccurrences` (counts call sites, not nodes).
 *   4. No self-assigned `quality: "release"` on route-local assets
 *      (primaryAssets / typedModelFamily / audioAssets).
 *
 * Usage:
 *   node scripts/check-route-health.mjs                 # all routes
 *   node scripts/check-route-health.mjs --routes a,b    # subset by dir name
 *   node scripts/check-route-health.mjs --dir <dir>     # fixture root for tests
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const STATUS = new Set(["unreviewed", "in-rebuild", "rejected", "accepted", "withdrawn"]);

// Human reviewer logins only. Agent/automation identities never count:
// GitHub app/bot logins end in [bot]; session ids look like devin-* / agent-*;
// anything else matching a known automation word is rejected too.
const AGENT_ID = /(?:\[bot\]$|(?:^|[^a-z])(?:devin|agent|bot|automation|ci-bot|github-actions|cognition)(?:[^a-z]|$)|^[a-f0-9]{8,}$)/i;

export function checkRouteHealth(file, failures = []) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    failures.push(`${file}: unreadable JSON (${err.message})`);
    return failures;
  }
  const gate = doc.qualityGate ?? null;
  if (gate !== null && (typeof gate !== "object" || !STATUS.has(gate.status))) {
    failures.push(`${file}: qualityGate.status must be one of ${[...STATUS].join("|")}`);
  }
  if (doc.publicShowcase === true && gate?.status !== "accepted") {
    failures.push(`${file}: publicShowcase: true but qualityGate.status is ${JSON.stringify(gate?.status ?? "missing")} (§7.4 requires "accepted")`);
  }
  if (gate?.status === "accepted") {
    const acceptedBy = gate.acceptedBy;
    if (!Array.isArray(acceptedBy) || acceptedBy.length === 0 || acceptedBy.some((s) => typeof s !== "string" || s.trim() === "")) {
      failures.push(`${file}: accepted route needs non-empty qualityGate.acceptedBy of human reviewer logins`);
    } else {
      for (const who of acceptedBy) {
        if (AGENT_ID.test(who)) failures.push(`${file}: qualityGate.acceptedBy contains an agent id: ${who}`);
      }
    }
  }
  if (typeof doc.claim === "string" && doc.claim.trim() !== "") {
    failures.push(`${file}: free-text claim field remains (§7.4)`);
  }
  if (doc.systems != null) {
    failures.push(`${file}: free-text systems field remains (§7.4)`);
  }
  if (doc.primitiveStatus && doc.primitiveStatus.sourceOccurrences != null) {
    failures.push(`${file}: primitiveStatus.sourceOccurrences remains (§7.4: counts call sites, not nodes)`);
  }
  for (const list of ["primaryAssets", "typedModelFamily", "audioAssets"]) {
    for (const entry of Array.isArray(doc[list]) ? doc[list] : []) {
      if (entry && typeof entry === "object" && entry.quality === "release") {
        const id = entry.typedRef ?? entry.id ?? "?";
        failures.push(`${file}: self-assigned quality:"release" on route-local asset ${id} (§7.4)`);
      }
    }
  }
  return failures;
}

export function collectRouteHealthFiles(root, routes) {
  if (!existsSync(root)) return [];
  const wanted = routes ? new Set(routes) : null;
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || (wanted && !wanted.has(entry.name))) continue;
    const file = join(root, entry.name, "route-health.json");
    if (existsSync(file)) files.push(file);
  }
  return files.sort();
}

const isMain = process.argv[1] && resolve(process.argv[1]).endsWith("check-route-health.mjs");
if (isMain) {
  const args = process.argv.slice(2);
  let root = "apps";
  let routes = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--routes") routes = args[++i].split(",").filter(Boolean);
    else if (args[i] === "--dir") root = args[++i];
    else if (args[i] === "--help") { console.log("usage: node scripts/check-route-health.mjs [--routes id1,id2] [--dir apps]"); process.exit(0); }
    else { console.error(`unknown arg: ${args[i]}`); process.exit(2); }
  }
  const files = collectRouteHealthFiles(root, routes);
  if (files.length === 0) {
    console.error(`no route-health.json files under ${root}${routes ? ` for routes ${routes}` : ""}`);
    process.exit(2);
  }
  const failures = [];
  for (const f of files) checkRouteHealth(f, failures);
  if (failures.length > 0) {
    console.error(`route-health check failed (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`route-health ok: ${files.length} file(s)`);
}
