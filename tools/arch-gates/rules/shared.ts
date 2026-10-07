// Shared helpers for arch-gates rules: ownership resolution and the dated
// allowlist (CONTRACTS §6.5 / PRD-15 §13). Allowlisted findings report as
// warnings with their expiry; expired entries fail loudly so the debt is
// never silently permanent.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface OwnershipRule {
  readonly owner: string;
  readonly paths: readonly string[];
}

interface OwnershipMap {
  readonly defaultOwner: string;
  readonly rules: readonly OwnershipRule[];
}

const ownershipByRoot = new Map<string, OwnershipMap>();

function loadOwnership(root: string): OwnershipMap {
  const hit = ownershipByRoot.get(root);
  if (hit) return hit;
  const p = join(root, ".github/QR_OWNERSHIP.json");
  const map: OwnershipMap = existsSync(p)
    ? (JSON.parse(readFileSync(p, "utf8")) as OwnershipMap)
    : { defaultOwner: "15", rules: [] };
  ownershipByRoot.set(root, map);
  return map;
}

/** Owner id for a repo-relative path (longest matching prefix). */
export function ownerOf(root: string, repoPath: string): string {
  const map = loadOwnership(root);
  let best = "";
  let owner = map.defaultOwner;
  for (const rule of map.rules) {
    for (const p of rule.paths) {
      if (repoPath.startsWith(p) && p.length > best.length) {
        best = p;
        owner = rule.owner;
      }
    }
  }
  return owner;
}

export interface AllowlistEntry {
  readonly rule: string;
  readonly reason: string;
  readonly expires: string; // ISO date — findings outliving this date fail
  readonly request?: string; // qr-request id driving the fix
  readonly from?: string;    // edge allowlist: importer path
  readonly to?: string;      // edge allowlist: importee path
  readonly file?: string;    // file allowlist
  readonly scc?: readonly string[]; // exact sorted member set
}

const ALLOWLIST_PATH = "tools/arch-gates/allowlist.json";

export function loadAllowlist(root: string): readonly AllowlistEntry[] {
  const p = join(root, ALLOWLIST_PATH);
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, "utf8")) as AllowlistEntry[];
}

export function isExpired(entry: AllowlistEntry, today = new Date()): boolean {
  return today.toISOString().slice(0, 10) > entry.expires;
}

export function edgeAllowed(list: readonly AllowlistEntry[], rule: string, from: string, to: string): AllowlistEntry | null {
  for (const e of list) {
    if (e.rule === rule && e.from === from && e.to === to) return e;
  }
  return null;
}

export function fileAllowed(list: readonly AllowlistEntry[], rule: string, file: string): AllowlistEntry | null {
  for (const e of list) {
    if (e.rule === rule && e.file === file) return e;
  }
  return null;
}

export function sccAllowed(list: readonly AllowlistEntry[], rule: string, members: readonly string[]): AllowlistEntry | null {
  const sorted = [...members].sort();
  for (const e of list) {
    if (e.rule !== rule || !e.scc) continue;
    if (e.scc.length === sorted.length && e.scc.every((m, i) => m === sorted[i])) return e;
  }
  return null;
}
