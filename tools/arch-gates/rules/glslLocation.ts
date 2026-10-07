// glsl-location (PRD-15 §6.12, T4.9 — fail mode). GLSL template strings
// (#version markers) live only under the C-02 chunk locations —
// program/chunks/, shaders/**, production-runtime/shaders/**, the
// contracts/testing chunk harness — and the post/output modules. Everything
// else is an enforced finding unless a dated allowlist entry names it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { GateFinding } from "../index";
import { fileAllowed, isExpired, loadAllowlist } from "./shared";

const RULE = "glsl-location";

const ALLOWED_PREFIXES = [
  "packages/rendering/src/program/chunks/",
  "packages/rendering/src/shaders/",
  "packages/rendering/src/production-runtime/shaders/",
  "packages/rendering/src/post/",
  "packages/rendering/src/postprocess/",
  "packages/rendering/src/output/",
  "packages/rendering/src/cinematic/",
  "packages/rendering/src/contracts/testing/"
];

const GLSL_RE = /`[^`]*#version\s+(300\s+es|100)[^`]*`/gs;

function* tsFiles(dir: string): Generator<string> {
  try { statSync(dir); } catch { return; }
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* tsFiles(p);
    else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) yield p;
  }
}

function* srcFiles(root: string): Generator<string> {
  const packagesDir = join(root, "packages");
  for (const pkg of readdirSync(packagesDir)) {
    if (pkg.startsWith(".")) continue;
    const src = join(packagesDir, pkg, "src");
    try { if (statSync(src).isDirectory()) yield* tsFiles(src); } catch { /* no src */ }
  }
}

export function checkGlslLocation(root: string): GateFinding[] {
  const allowlist = loadAllowlist(root);
  const findings: GateFinding[] = [];
  for (const path of srcFiles(root)) {
    const file = relative(root, path);
    if (ALLOWED_PREFIXES.some((p) => file.startsWith(p))) continue;
    const entry = fileAllowed(allowlist, RULE, file);
    if (entry && !isExpired(entry)) continue;
    const text = readFileSync(path, "utf8");
    let count = 0;
    for (const _ of text.matchAll(GLSL_RE)) count++;
    if (count === 0) continue;
    const detail = `${count} GLSL template string(s) outside chunk/post/output locations`;
    if (entry) {
      findings.push({ rule: RULE, file, detail: `${detail} [allowlist expired ${entry.expires}]`, enforced: true });
    } else {
      findings.push({ rule: RULE, file, detail, enforced: true });
    }
  }
  return findings;
}
