#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(packageRoot, "manifest.json");
const packagePrefix = "release-artifacts/v4-external-evidence-handoff/";

if (!existsSync(manifestPath)) {
  throw new Error(`VERIFY_PACKAGE_INTEGRITY could not find manifest.json next to this script: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entries = [
  ...(Array.isArray(manifest.files) ? manifest.files : []),
  ...(Array.isArray(manifest.entryPoints) ? manifest.entryPoints : [])
];
const violations = [
  ...(manifest.schemaVersion === "g3d-v4-external-evidence-handoff-package-v1" ? [] : ["manifest schemaVersion is invalid"]),
  ...entries.flatMap(verifyEntry)
];

console.log(JSON.stringify({
  ok: violations.length === 0 && entries.length > 0,
  command: "VERIFY_PACKAGE_INTEGRITY",
  verificationScope: {
    packageInternalEntries: true,
    archiveAndSidecar: false,
    externalParityEvidence: false
  },
  packageRoot,
  manifestPath,
  checkedFiles: entries.length,
  violations
}, null, 2));

if (violations.length > 0 || entries.length === 0) process.exit(1);

function verifyEntry(entry) {
  if (!entry || typeof entry !== "object") return ["manifest contains a non-object entry"];
  if (entry.copied !== true) return [`${entry.path || "unknown"}: manifest says entry was not copied`];
  if (typeof entry.packagePath !== "string" || !entry.packagePath.startsWith(packagePrefix)) {
    return [`${entry.path || "unknown"}: packagePath is missing or not package-confined`];
  }
  const relativePath = entry.packagePath.slice(packagePrefix.length);
  if (!relativePath || relativePath.includes("..")) {
    return [`${entry.path || "unknown"}: packagePath escapes package root`];
  }
  const fullPath = resolve(packageRoot, relativePath);
  if (!fullPath.startsWith(packageRoot)) return [`${entry.path || relativePath}: resolved path escapes package root`];
  if (!existsSync(fullPath)) return [`${entry.path || relativePath}: packaged entry is missing`];
  const stats = statSync(fullPath);
  if (entry.sha256 === "directory") return stats.isDirectory() ? [] : [`${entry.path || relativePath}: expected directory`];
  if (!stats.isFile()) return [`${entry.path || relativePath}: expected file`];
  const bytes = readFileSync(fullPath);
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  return [
    ...(typeof entry.bytes === "number" && bytes.byteLength !== entry.bytes ? [`${entry.path || relativePath}: byte length ${bytes.byteLength} does not match manifest ${entry.bytes}`] : []),
    ...(typeof entry.sha256 === "string" && actualSha !== entry.sha256 ? [`${entry.path || relativePath}: sha256 ${actualSha} does not match manifest ${entry.sha256}`] : [])
  ];
}
