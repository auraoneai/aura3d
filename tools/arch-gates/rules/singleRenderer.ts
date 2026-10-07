// single-renderer (PRD-15 §6.12, T4.9 — fail mode). One renderer owns the GPU:
// classes or functions that call getContext("webgl"|"webgl2"|"webgpu") or
// construct a RenderDevice outside the device owner files
// (WebGL2Device.ts, WebGPUDevice.ts, RenderBackend.ts) are enforced findings.
// Dated allowlist entries in tools/arch-gates/allowlist.json carry the open
// §12.4 requests (safe-basic fallback until T4.4, Q-07-4, Q-11-4).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import type { GateFinding } from "../index";
import { fileAllowed, isExpired, loadAllowlist } from "./shared";

const RULE = "single-renderer";

// Files that legitimately own a GPU context or construct a device. Everything
// else needs a dated allowlist entry.
const DEVICE_OWNER_SUFFIXES = [
  "packages/rendering/src/WebGL2Device.ts",
  "packages/rendering/src/WebGPUDevice.ts",
  "packages/rendering/src/RenderBackend.ts"
];

const GET_CONTEXT_RE = /\.getContext\(\s*["'](webgl2?|webgpu)["']/g;
const NEW_DEVICE_RE = /\bnew\s+(WebGL2Device|WebGPUDevice|ProductionWebGPURenderer)\b/g;

function* tsFiles(dir: string): Generator<string> {
  if (!exists(dir)) return;
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
    if (exists(src) && statSync(src).isDirectory()) yield* tsFiles(src);
  }
}

function exists(p: string): boolean {
  try { statSync(p); return true; } catch { return false; }
}

export function checkSingleRenderer(root: string): GateFinding[] {
  const allowlist = loadAllowlist(root);
  const findings: GateFinding[] = [];
  for (const path of srcFiles(root)) {
    const file = relative(root, path);
    if (DEVICE_OWNER_SUFFIXES.some((s) => file === s)) continue;
    const entry = fileAllowed(allowlist, RULE, file);
    if (entry && !isExpired(entry)) continue;
    const text = readFileSync(path, "utf8");
    const hits: string[] = [];
    for (const m of text.matchAll(GET_CONTEXT_RE)) hits.push(`getContext("${m[1]}")`);
    for (const m of text.matchAll(NEW_DEVICE_RE)) hits.push(`new ${m[1]}`);
    if (hits.length === 0) continue;
    const detail = `${hits.length} GPU-context call(s) outside device owners: ${[...new Set(hits)].join(", ")}`;
    if (entry) {
      // expired allowlist: still a finding, marked with the stale expiry
      findings.push({ rule: RULE, file, detail: `${detail} [allowlist expired ${entry.expires}]`, enforced: true });
    } else {
      findings.push({ rule: RULE, file, detail, enforced: true });
    }
  }
  return findings;
}
