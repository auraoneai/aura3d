#!/usr/bin/env node
// Usage: node tools/agent-examples/refresh-catalog-digests.mjs [--check] [--file <expectations.json>] [--root <repo>]
// Rewrites the sha256 of every { path, sha256 } entry in the native examples catalog expectations whose file hash
// changed. Only entries whose digest differs are touched; the rest of the file is left byte-identical (exact string
// replacement, no JSON re-serialisation). Entries pointing at missing files are reported, never edited.
// --check: report only, exit 1 when anything is stale.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_EXPECTATIONS = "tests/fixtures/native-examples-catalog/expectations.json";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pure helper: returns { text, changes, missing } for expectations text. `hashOf(path)` returns hex or undefined. */
export function refreshDigestsInText(text, hashOf) {
  const entries = new Map();
  (function walk(value) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") {
      if (typeof value.path === "string" && typeof value.sha256 === "string") entries.set(`${value.path}\0${value.sha256}`, { path: value.path, old: value.sha256 });
      Object.values(value).forEach(walk);
    }
  })(JSON.parse(text));
  const changes = [];
  const missing = [];
  let out = text;
  for (const { path, old } of entries.values()) {
    const actual = hashOf(path);
    if (!actual) { missing.push(path); continue; }
    if (actual === old) continue;
    const pattern = new RegExp(`("path"\\s*:\\s*"${escapeRe(path)}"\\s*,\\s*"sha256"\\s*:\\s*")${escapeRe(old)}(")`, "g");
    out = out.replace(pattern, (_m, a, b) => `${a}${actual}${b}`);
    changes.push({ path, from: old, to: actual });
  }
  return { text: out, changes, missing };
}

export function refreshCatalogDigests({ root, file = DEFAULT_EXPECTATIONS, write = true }) {
  const abs = resolve(root, file);
  const hashOf = (rel) => {
    const p = resolve(root, rel);
    if (!existsSync(p)) return undefined;
    const bytes = readFileSync(p);
    // An un-materialised git-lfs pointer hashes to the pointer text, never the real asset: treat it as unavailable.
    if (bytes.length < 200 && bytes.subarray(0, 40).toString("utf8").startsWith("version https://git-lfs.github.com/spec")) return undefined;
    return createHash("sha256").update(bytes).digest("hex");
  };
  const result = refreshDigestsInText(readFileSync(abs, "utf8"), hashOf);
  if (write && result.changes.length) writeFileSync(abs, result.text);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const root = resolve(value("--root") ?? resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
  const check = args.includes("--check");
  const { changes, missing } = refreshCatalogDigests({ root, file: value("--file"), write: !check });
  for (const c of changes) console.log(`${check ? "stale" : "updated"} ${c.path} ${c.from.slice(0, 12)} -> ${c.to.slice(0, 12)}`);
  for (const m of missing) console.warn(`missing ${m}`);
  console.log(`${changes.length} digest(s) ${check ? "stale" : "refreshed"}, ${missing.length} missing file(s)`);
  process.exit(check && changes.length ? 1 : 0);
}
